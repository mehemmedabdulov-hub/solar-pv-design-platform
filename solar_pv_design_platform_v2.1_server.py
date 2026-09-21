#!/usr/bin/env python3
"""Solar PV Design Platform v2.1 local development server.

Serves the browser application and provides a same-origin SQLite-backed
project/revision repository API at /api/solar-pv.

This development server deliberately has no user authentication. In GitHub Codespaces,
keep the forwarded port private unless you intentionally add an authenticated
reverse proxy in front of it.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sqlite3
import sys
import threading

from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


APP_VERSION = "2.1.0"
PROJECT_SCHEMA_VERSION = "2.0"
API_PREFIX = "/api/solar-pv"
DB_SCHEMA_VERSION = 1

MAX_REQUEST_BYTES = 25 * 1024 * 1024

PROJECT_ID_RE = re.compile(
    r"^[A-Za-z0-9._:-]{1,200}$"
)


def utc_now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


class RawJsonNumber(str):
    """Marker preserving the exact numeric token emitted by browser JSON.stringify."""


def canonicalize_for_fingerprint(
    value: Any,
    omitted_keys: set[str],
) -> Any:
    if isinstance(value, list):
        return [
            canonicalize_for_fingerprint(
                item,
                omitted_keys,
            )
            for item in value
        ]

    if isinstance(value, dict):
        return {
            key: canonicalize_for_fingerprint(
                value[key],
                omitted_keys,
            )
            for key in sorted(
                value.keys()
            )
            if key not in omitted_keys
        }

    if isinstance(value, float):
        if not math.isfinite(value):
            if math.isnan(value):
                return "NaN"

            return (
                "Infinity"
                if value > 0
                else "-Infinity"
            )

        if value == 0:
            return 0

    return value


def stable_json_stringify(
    value: Any,
    omitted_keys: set[str],
) -> str:
    """Canonical JSON matching the browser fingerprint serializer.

    When values came from a browser POST, RawJsonNumber keeps the exact numeric
    lexical form produced by JSON.stringify (important for values such as 1e-7).
    """

    value = canonicalize_for_fingerprint(
        value,
        omitted_keys,
    )

    def encode(item: Any) -> str:
        if isinstance(
            item,
            RawJsonNumber,
        ):
            return str(item)

        if item is None:
            return "null"

        if item is True:
            return "true"

        if item is False:
            return "false"

        if isinstance(
            item,
            str,
        ):
            return json.dumps(
                item,
                ensure_ascii=False,
                separators=(",", ":"),
            )

        if isinstance(
            item,
            int,
        ):
            return str(item)

        if isinstance(
            item,
            float,
        ):
            if not math.isfinite(item):
                return encode(
                    "NaN"
                    if math.isnan(item)
                    else (
                        "Infinity"
                        if item > 0
                        else "-Infinity"
                    )
                )

            if item == 0:
                return "0"

            # Fallback for programmatically constructed test objects.
            # Browser POSTs use RawJsonNumber, which is the exact
            # path used by the API.
            text = repr(item)

            text = re.sub(
                r"e([+-])0+(\d+)$",
                r"e\1\2",
                text,
            )

            return text

        if isinstance(
            item,
            list,
        ):
            return (
                "["
                + ",".join(
                    encode(child)
                    for child in item
                )
                + "]"
            )

        if isinstance(
            item,
            dict,
        ):
            return (
                "{"
                + ",".join(
                    json.dumps(
                        str(key),
                        ensure_ascii=False,
                    )
                    + ":"
                    + encode(item[key])
                    for key in sorted(
                        item.keys()
                    )
                    if key not in omitted_keys
                )
                + "}"
            )

        raise TypeError(
            "Unsupported fingerprint value type: "
            f"{type(item).__name__}"
        )

    return encode(value)


def fnv1a32_js_utf16_hex(
    text: str,
) -> str:
    """Match the browser's charCodeAt-based FNV-1a implementation exactly."""

    h = 0x811C9DC5

    encoded = text.encode(
        "utf-16-le",
        "surrogatepass",
    )

    for index in range(
        0,
        len(encoded),
        2,
    ):
        code_unit = (
            encoded[index]
            | (
                encoded[index + 1]
                << 8
            )
        )

        h ^= code_unit

        h = (
            h * 0x01000193
        ) & 0xFFFFFFFF

    return f"{h:08x}"


def calculate_snapshot_fingerprint(
    snapshot: dict[str, Any],
) -> str:
    omitted = {
        "savedAt",
        "stateFingerprint",
        "migratedAt",
        "migratedFromSchema",
    }

    canonical = stable_json_stringify(
        snapshot,
        omitted,
    )

    return (
        f"pv-{fnv1a32_js_utf16_hex(canonical)}"
    )


def validate_project_id(
    project_id: str,
) -> str:
    project_id = str(
        project_id or ""
    ).strip()

    if not PROJECT_ID_RE.fullmatch(
        project_id
    ):
        raise ValueError(
            "Project ID contains unsupported characters or has an invalid length."
        )

    return project_id


def validate_snapshot(
    snapshot: Any,
    path_project_id: str,
    header_fingerprint: str | None,
    fingerprint_snapshot: Any | None = None,
) -> dict[str, Any]:
    if not isinstance(
        snapshot,
        dict,
    ):
        raise ValueError(
            "Request body must be a project snapshot JSON object."
        )

    project_id = validate_project_id(
        snapshot.get("projectId")
    )

    if project_id != path_project_id:
        raise ValueError(
            "Project ID in the request path does not match the snapshot projectId."
        )

    revision_number = snapshot.get(
        "revisionNumber"
    )

    if isinstance(
        revision_number,
        bool,
    ):
        raise ValueError(
            "revisionNumber must be a positive integer."
        )

    try:
        revision_number = int(
            revision_number
        )

    except (
        TypeError,
        ValueError,
    ):
        raise ValueError(
            "revisionNumber must be a positive integer."
        ) from None

    if (
        revision_number < 1
        or revision_number
        != snapshot.get(
            "revisionNumber"
        )
    ):
        raise ValueError(
            "revisionNumber must be a positive integer."
        )

    fingerprint = str(
        snapshot.get(
            "stateFingerprint"
        )
        or ""
    ).strip()

    if not fingerprint:
        raise ValueError(
            "Snapshot is missing stateFingerprint."
        )

    if (
        header_fingerprint
        and header_fingerprint.strip()
        != fingerprint
    ):
        raise ValueError(
            "X-PV-Project-Fingerprint does not match the snapshot stateFingerprint."
        )

    calculated = (
        calculate_snapshot_fingerprint(
            fingerprint_snapshot
            if fingerprint_snapshot
            is not None
            else snapshot
        )
    )

    if calculated != fingerprint:
        raise ValueError(
            "Snapshot fingerprint verification failed: "
            f"stored {fingerprint}, "
            f"calculated {calculated}."
        )

    schema_version = str(
        snapshot.get(
            "schemaVersion"
        )
        or ""
    ).strip()

    application_version = str(
        snapshot.get(
            "applicationVersion"
        )
        or ""
    ).strip()

    if (
        not schema_version
        or not application_version
    ):
        raise ValueError(
            "Snapshot must include schemaVersion and applicationVersion."
        )

    parent = snapshot.get(
        "parentRevisionFingerprint"
    )

    if (
        parent is not None
        and not isinstance(
            parent,
            str,
        )
    ):
        raise ValueError(
            "parentRevisionFingerprint must be a string or null."
        )

    return snapshot


class SQLiteProjectRepository:
    def __init__(
        self,
        db_path: Path,
    ):
        self.db_path = db_path

        self.db_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        self._init_lock = (
            threading.Lock()
        )

        self.initialize()

    def connect(
        self,
    ) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.db_path,
            timeout=10.0,
        )

        connection.row_factory = (
            sqlite3.Row
        )

        connection.execute(
            "PRAGMA foreign_keys = ON"
        )

        connection.execute(
            "PRAGMA busy_timeout = 10000"
        )

        return connection

    def initialize(
        self,
    ) -> None:
        with self._init_lock:
            with self.connect() as db:
                db.execute(
                    "PRAGMA journal_mode = WAL"
                )

                db.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS repository_meta (
                      key TEXT PRIMARY KEY,
                      value TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS projects (
                      project_id TEXT PRIMARY KEY,
                      current_revision INTEGER NOT NULL,
                      current_fingerprint TEXT NOT NULL,
                      created_at TEXT NOT NULL,
                      updated_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS project_revisions (
                      project_id TEXT NOT NULL,
                      revision_number INTEGER NOT NULL,
                      state_fingerprint TEXT NOT NULL,
                      parent_revision_fingerprint TEXT,
                      saved_at TEXT,
                      application_version TEXT NOT NULL,
                      schema_version TEXT NOT NULL,
                      installation TEXT,
                      panel_count INTEGER,
                      dc_kw REAL,
                      snapshot_json TEXT NOT NULL,
                      committed_at TEXT NOT NULL,
                      PRIMARY KEY (
                        project_id,
                        revision_number
                      ),
                      FOREIGN KEY (
                        project_id
                      )
                        REFERENCES projects(
                          project_id
                        )
                        ON DELETE CASCADE
                    );

                    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_revision_fingerprint
                      ON project_revisions(
                        project_id,
                        state_fingerprint
                      );
                    """
                )

                db.execute(
                    "INSERT INTO repository_meta(key, value) "
                    "VALUES('schema_version', ?) "
                    "ON CONFLICT(key) "
                    "DO UPDATE SET value=excluded.value",
                    (
                        str(
                            DB_SCHEMA_VERSION
                        ),
                    ),
                )

                db.commit()

    def stats(
        self,
    ) -> dict[str, int]:
        with self.connect() as db:
            project_count = int(
                db.execute(
                    "SELECT COUNT(*) FROM projects"
                ).fetchone()[0]
            )

            revision_count = int(
                db.execute(
                    "SELECT COUNT(*) FROM project_revisions"
                ).fetchone()[0]
            )

        return {
            "projects":
                project_count,
            "revisions":
                revision_count,
        }

    def commit_revision(
        self,
        snapshot: dict[str, Any],
    ) -> tuple[
        dict[str, Any],
        bool,
    ]:
        project_id = str(
            snapshot["projectId"]
        )

        revision_number = int(
            snapshot["revisionNumber"]
        )

        fingerprint = str(
            snapshot[
                "stateFingerprint"
            ]
        )

        parent = snapshot.get(
            "parentRevisionFingerprint"
        )

        now = utc_now_iso()

        snapshot_json = json.dumps(
            snapshot,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        )

        panel_count = len(
            snapshot
            .get(
                "layout",
                {},
            )
            .get(
                "panels",
                [],
            )
            or []
        )

        dc_kw = None

        try:
            power_w = float(
                snapshot
                .get(
                    "calculatedSummary",
                    {},
                )
                .get(
                    "modulePowerW"
                )
            )

            dc_kw = (
                panel_count
                * power_w
                / 1000.0
            )

        except (
            TypeError,
            ValueError,
        ):
            pass

        with self.connect() as db:
            db.execute(
                "BEGIN IMMEDIATE"
            )

            existing = db.execute(
                "SELECT state_fingerprint "
                "FROM project_revisions "
                "WHERE project_id=? "
                "AND revision_number=?",
                (
                    project_id,
                    revision_number,
                ),
            ).fetchone()

            if existing:
                if (
                    existing[
                        "state_fingerprint"
                    ]
                    != fingerprint
                ):
                    db.rollback()

                    raise RepositoryConflict(
                        f"Immutable revision conflict for {project_id} Revision {revision_number}."
                    )

                db.rollback()

                return {
                    "ok": True,
                    "idempotent": True,
                    "projectId":
                        project_id,
                    "revisionNumber":
                        revision_number,
                    "stateFingerprint":
                        fingerprint,
                }, True

            current = db.execute(
                "SELECT "
                "current_revision, "
                "current_fingerprint "
                "FROM projects "
                "WHERE project_id=?",
                (
                    project_id,
                ),
            ).fetchone()

            if current:
                expected_revision = (
                    int(
                        current[
                            "current_revision"
                        ]
                    )
                    + 1
                )

                if (
                    revision_number
                    != expected_revision
                ):
                    db.rollback()

                    raise RepositoryConflict(
                        "Revision chain conflict: "
                        "server current revision is "
                        f"{current['current_revision']}; "
                        "the next accepted revision is "
                        f"{expected_revision}."
                    )

                expected_parent = str(
                    current[
                        "current_fingerprint"
                    ]
                )

                if (
                    str(parent or "")
                    != expected_parent
                ):
                    db.rollback()

                    raise RepositoryConflict(
                        "Parent fingerprint conflict: "
                        f"expected {expected_parent}, "
                        f"received {parent or 'null'}."
                    )

            else:
                # A first push may bootstrap a repository
                # from a later locally retained revision.
                db.execute(
                    "INSERT INTO projects("
                    "project_id, "
                    "current_revision, "
                    "current_fingerprint, "
                    "created_at, "
                    "updated_at"
                    ") VALUES(?,?,?,?,?)",
                    (
                        project_id,
                        revision_number,
                        fingerprint,
                        now,
                        now,
                    ),
                )

            db.execute(
                """
                INSERT INTO project_revisions(
                  project_id,
                  revision_number,
                  state_fingerprint,
                  parent_revision_fingerprint,
                  saved_at,
                  application_version,
                  schema_version,
                  installation,
                  panel_count,
                  dc_kw,
                  snapshot_json,
                  committed_at
                )
                VALUES(
                  ?,?,?,?,?,?,?,?,?,?,?,?
                )
                """,
                (
                    project_id,
                    revision_number,
                    fingerprint,
                    parent,
                    snapshot.get(
                        "savedAt"
                    ),
                    str(
                        snapshot.get(
                            "applicationVersion"
                        )
                    ),
                    str(
                        snapshot.get(
                            "schemaVersion"
                        )
                    ),
                    snapshot.get(
                        "installation"
                    ),
                    panel_count,
                    dc_kw,
                    snapshot_json,
                    now,
                ),
            )

            if current:
                db.execute(
                    "UPDATE projects "
                    "SET current_revision=?, "
                    "current_fingerprint=?, "
                    "updated_at=? "
                    "WHERE project_id=?",
                    (
                        revision_number,
                        fingerprint,
                        now,
                        project_id,
                    ),
                )

            db.commit()

        return {
            "ok": True,
            "idempotent": False,
            "projectId":
                project_id,
            "revisionNumber":
                revision_number,
            "stateFingerprint":
                fingerprint,
        }, False

    def load_current(
        self,
        project_id: str,
    ) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute(
                """
                SELECT
                  r.snapshot_json
                FROM projects p
                JOIN project_revisions r
                  ON r.project_id = p.project_id
                 AND r.revision_number = p.current_revision
                WHERE p.project_id=?
                """,
                (
                    project_id,
                ),
            ).fetchone()

        return (
            json.loads(
                row["snapshot_json"]
            )
            if row
            else None
        )

    def load_revision(
        self,
        project_id: str,
        revision_number: int,
    ) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute(
                "SELECT snapshot_json "
                "FROM project_revisions "
                "WHERE project_id=? "
                "AND revision_number=?",
                (
                    project_id,
                    revision_number,
                ),
            ).fetchone()

        return (
            json.loads(
                row["snapshot_json"]
            )
            if row
            else None
        )

    def list_revisions(
        self,
        project_id: str,
    ) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT
                  revision_number,
                  saved_at,
                  state_fingerprint,
                  parent_revision_fingerprint,
                  application_version,
                  schema_version,
                  installation,
                  panel_count,
                  dc_kw,
                  committed_at
                FROM project_revisions
                WHERE project_id=?
                ORDER BY revision_number DESC
                """,
                (
                    project_id,
                ),
            ).fetchall()

        return [
            {
                "projectId":
                    project_id,
                "revisionNumber":
                    int(
                        row[
                            "revision_number"
                        ]
                    ),
                "savedAt":
                    row["saved_at"],
                "stateFingerprint":
                    row[
                        "state_fingerprint"
                    ],
                "parentRevisionFingerprint":
                    row[
                        "parent_revision_fingerprint"
                    ],
                "applicationVersion":
                    row[
                        "application_version"
                    ],
                "schemaVersion":
                    row[
                        "schema_version"
                    ],
                "installation":
                    row[
                        "installation"
                    ],
                "panelCount":
                    int(
                        row[
                            "panel_count"
                        ]
                        or 0
                    ),
                "dcKW":
                    row["dc_kw"],
                "committedAt":
                    row[
                        "committed_at"
                    ],
            }
            for row in rows
        ]

    def list_projects(
        self,
    ) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                "SELECT "
                "project_id, "
                "current_revision, "
                "current_fingerprint, "
                "created_at, "
                "updated_at "
                "FROM projects "
                "ORDER BY updated_at DESC"
            ).fetchall()

        return [
            dict(row)
            for row in rows
        ]


class RepositoryConflict(
    Exception
):
    pass


class SolarPVRequestHandler(
    SimpleHTTPRequestHandler
):
    server_version = (
        f"SolarPVDesignPlatform/{APP_VERSION}"
    )

    def __init__(
        self,
        *args: Any,
        directory: str | None = None,
        **kwargs: Any,
    ):
        super().__init__(
            *args,
            directory=directory,
            **kwargs,
        )

    @property
    def repository(
        self,
    ) -> SQLiteProjectRepository:
        return self.server.repository  # type: ignore[attr-defined]

    def end_headers(
        self,
    ) -> None:
        self.send_header(
            "X-Content-Type-Options",
            "nosniff",
        )

        self.send_header(
            "Referrer-Policy",
            "same-origin",
        )

        cors_origin = getattr(
            self.server,
            "cors_origin",
            "",
        )  # type: ignore[attr-defined]

        if cors_origin:
            self.send_header(
                "Access-Control-Allow-Origin",
                cors_origin,
            )

            self.send_header(
                "Vary",
                "Origin",
            )

        super().end_headers()

    def log_message(
        self,
        format: str,
        *args: Any,
    ) -> None:
        sys.stderr.write(
            "[%s] %s\n"
            % (
                self.log_date_time_string(),
                format % args,
            )
        )

    def send_json(
        self,
        status: int,
        payload: Any,
    ) -> None:
        data = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode(
            "utf-8"
        )

        self.send_response(
            status
        )

        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8",
        )

        self.send_header(
            "Content-Length",
            str(len(data)),
        )

        self.send_header(
            "Cache-Control",
            "no-store",
        )

        self.end_headers()

        self.wfile.write(
            data
        )

    def send_api_error(
        self,
        status: int,
        message: str,
    ) -> None:
        self.send_json(
            status,
            {
                "ok": False,
                "error": message,
            },
        )

    def parse_api_path(
        self,
    ) -> list[str] | None:
        path = urlparse(
            self.path
        ).path

        if path == API_PREFIX:
            return []

        if not path.startswith(
            API_PREFIX + "/"
        ):
            return None

        suffix = path[
            len(API_PREFIX) + 1 :
        ]

        return [
            unquote(part)
            for part
            in suffix.split("/")
            if part
        ]

    def static_path_is_forbidden(
        self,
    ) -> bool:
        path = unquote(
            urlparse(
                self.path
            ).path
        )

        lower = path.lower()
        path_parts = [
            part
            for part in lower.split("/")
            if part
        ]

        # The static root is normally the repository root. Never expose
        # dotfiles/directories (for example .git or .env), Python caches,
        # backend source, shell scripts, or SQLite state through HTTP.
        if any(
            part.startswith(".")
            or part == "__pycache__"
            for part in path_parts
        ):
            return True

        return lower.endswith(
            (
                ".py",
                ".pyc",
                ".pyo",
                ".sh",
                ".sqlite",
                ".sqlite3",
                ".db",
                ".sqlite3-wal",
                ".sqlite3-shm",
            )
        )

    def do_HEAD(
        self,
    ) -> None:
        if (
            self.parse_api_path()
            is not None
            or self.static_path_is_forbidden()
        ):
            self.send_error(
                HTTPStatus.NOT_FOUND
            )

            return

        super().do_HEAD()

    def do_OPTIONS(
        self,
    ) -> None:
        parts = self.parse_api_path()

        if parts is None:
            self.send_error(
                HTTPStatus.NOT_FOUND
            )

            return

        self.send_response(
            HTTPStatus.NO_CONTENT
        )

        self.send_header(
            "Access-Control-Allow-Methods",
            "GET,POST,OPTIONS",
        )

        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type,X-PV-Project-Fingerprint",
        )

        self.send_header(
            "Access-Control-Max-Age",
            "600",
        )

        self.end_headers()

    def do_GET(
        self,
    ) -> None:
        parts = self.parse_api_path()

        if parts is None:
            if (
                self.static_path_is_forbidden()
            ):
                self.send_error(
                    HTTPStatus.NOT_FOUND
                )

                return

            # Friendly root behavior for Codespaces.
            if (
                urlparse(
                    self.path
                ).path
                == "/"
            ):
                self.path = (
                    "/index.html"
                )

            super().do_GET()

            return

        try:
            if parts == [
                "health"
            ]:
                stats = (
                    self.repository.stats()
                )

                self.send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "status":
                            "ok",
                        "service":
                            "solar-pv-project-repository",
                        "version":
                            APP_VERSION,
                        "projectSchema":
                            PROJECT_SCHEMA_VERSION,
                        "capabilities": [
                            "immutable-revisions",
                            "parent-fingerprint-continuity",
                            "snapshot-fingerprint-verification",
                            "v1.9-engineering-rule-provenance",
                            "v2.0-rule-pack-contract",
                            "v2.1-calculation-corrections"
                        ],
                        "database": {
                            "engine":
                                "sqlite3",
                            "schemaVersion":
                                DB_SCHEMA_VERSION,
                            **stats,
                        },
                    },
                )

                return

            if parts == [
                "projects"
            ]:
                self.send_json(
                    HTTPStatus.OK,
                    {
                        "projects":
                            self.repository.list_projects()
                    },
                )

                return

            if (
                len(parts) >= 3
                and parts[0]
                == "projects"
            ):
                project_id = (
                    validate_project_id(
                        parts[1]
                    )
                )

                if (
                    parts[2:]
                    == ["current"]
                ):
                    snapshot = (
                        self.repository.load_current(
                            project_id
                        )
                    )

                    if snapshot is None:
                        self.send_api_error(
                            HTTPStatus.NOT_FOUND,
                            "Project was not found in the server repository.",
                        )
                    else:
                        self.send_json(
                            HTTPStatus.OK,
                            {
                                "snapshot":
                                    snapshot
                            },
                        )

                    return

                if (
                    parts[2:]
                    == ["revisions"]
                ):
                    self.send_json(
                        HTTPStatus.OK,
                        {
                            "projectId":
                                project_id,
                            "revisions":
                                self.repository.list_revisions(
                                    project_id
                                ),
                        },
                    )

                    return

                if (
                    len(parts) == 4
                    and parts[2]
                    == "revisions"
                ):
                    try:
                        revision_number = int(
                            parts[3]
                        )

                    except ValueError:
                        self.send_api_error(
                            HTTPStatus.BAD_REQUEST,
                            "Revision number must be an integer.",
                        )

                        return

                    snapshot = (
                        self.repository.load_revision(
                            project_id,
                            revision_number,
                        )
                    )

                    if snapshot is None:
                        self.send_api_error(
                            HTTPStatus.NOT_FOUND,
                            "Project revision was not found.",
                        )
                    else:
                        self.send_json(
                            HTTPStatus.OK,
                            {
                                "snapshot":
                                    snapshot
                            },
                        )

                    return

            self.send_api_error(
                HTTPStatus.NOT_FOUND,
                "Unknown repository API endpoint.",
            )

        except ValueError as error:
            self.send_api_error(
                HTTPStatus.BAD_REQUEST,
                str(error),
            )

        except Exception as error:
            # Defensive request boundary.
            self.send_api_error(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                f"Repository request failed: {error}",
            )

    def do_POST(
        self,
    ) -> None:
        parts = self.parse_api_path()

        if parts is None:
            self.send_error(
                HTTPStatus.NOT_FOUND
            )

            return

        if (
            len(parts) != 3
            or parts[0]
            != "projects"
            or parts[2]
            != "revisions"
        ):
            self.send_api_error(
                HTTPStatus.NOT_FOUND,
                "Unknown repository API endpoint.",
            )

            return

        try:
            project_id = (
                validate_project_id(
                    parts[1]
                )
            )

            length_raw = (
                self.headers.get(
                    "Content-Length"
                )
            )

            if length_raw is None:
                self.send_api_error(
                    HTTPStatus.LENGTH_REQUIRED,
                    "Content-Length is required.",
                )

                return

            length = int(
                length_raw
            )

            if (
                length < 1
                or length >
                MAX_REQUEST_BYTES
            ):
                self.send_api_error(
                    HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                    "Snapshot request size must be "
                    "between 1 byte and "
                    f"{MAX_REQUEST_BYTES} bytes.",
                )

                return

            content_type = (
                self.headers.get(
                    "Content-Type",
                    "",
                )
            )

            if (
                "application/json"
                not in content_type.lower()
            ):
                self.send_api_error(
                    HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
                    "Content-Type must be application/json.",
                )

                return

            raw = self.rfile.read(
                length
            )

            try:
                text = raw.decode(
                    "utf-8"
                )

                snapshot = json.loads(
                    text
                )

                fingerprint_snapshot = (
                    json.loads(
                        text,
                        parse_int=
                            RawJsonNumber,
                        parse_float=
                            RawJsonNumber,
                    )
                )

            except (
                UnicodeDecodeError,
                json.JSONDecodeError,
            ):
                self.send_api_error(
                    HTTPStatus.BAD_REQUEST,
                    "Request body is not valid UTF-8 JSON.",
                )

                return

            snapshot = validate_snapshot(
                snapshot,
                project_id,
                self.headers.get(
                    "X-PV-Project-Fingerprint"
                ),
                fingerprint_snapshot,
            )

            result, idempotent = (
                self.repository.commit_revision(
                    snapshot
                )
            )

            self.send_json(
                HTTPStatus.OK
                if idempotent
                else HTTPStatus.CREATED,
                result,
            )

        except RepositoryConflict as error:
            self.send_api_error(
                HTTPStatus.CONFLICT,
                str(error),
            )

        except ValueError as error:
            self.send_api_error(
                HTTPStatus.BAD_REQUEST,
                str(error),
            )

        except Exception as error:
            # Defensive request boundary.
            self.send_api_error(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                f"Repository commit failed: {error}",
            )


def build_server(
    host: str,
    port: int,
    static_dir: Path,
    db_path: Path,
    cors_origin: str = "",
) -> ThreadingHTTPServer:
    repository = (
        SQLiteProjectRepository(
            db_path
        )
    )

    def handler(
        *args: Any,
        **kwargs: Any,
    ) -> SolarPVRequestHandler:
        return SolarPVRequestHandler(
            *args,
            directory=
                str(static_dir),
            **kwargs,
        )

    server = ThreadingHTTPServer(
        (
            host,
            port,
        ),
        handler,
    )

    server.repository = repository  # type: ignore[attr-defined]
    server.cors_origin = cors_origin  # type: ignore[attr-defined]

    return server


def main() -> int:
    script_dir = (
        Path(__file__)
        .resolve()
        .parent
    )

    parser = argparse.ArgumentParser(
        description=(
            "Serve Solar PV Design Platform "
            "v2.1 with SQLite repository API."
        )
    )

    parser.add_argument(
        "--host",
        default=os.environ.get(
            "SOLAR_PV_HOST",
            "0.0.0.0",
        ),
    )

    parser.add_argument(
        "--port",
        type=int,
        default=int(
            os.environ.get(
                "SOLAR_PV_PORT",
                "8000",
            )
        ),
    )

    parser.add_argument(
        "--static-dir",
        default=os.environ.get(
            "SOLAR_PV_STATIC_DIR",
            str(script_dir),
        ),
    )

    parser.add_argument(
        "--db",
        default=os.environ.get(
            "SOLAR_PV_DB",
            str(
                script_dir
                / ".solar_pv_data"
                / "solar_pv_v17_alpha6.sqlite3"
            ),
        ),
    )

    parser.add_argument(
        "--cors-origin",
        default=os.environ.get(
            "SOLAR_PV_CORS_ORIGIN",
            "",
        ),
        help=(
            "Optional explicit "
            "Access-Control-Allow-Origin value "
            "when frontend and API use different origins."
        ),
    )

    args = parser.parse_args()

    static_dir = Path(
        args.static_dir
    ).resolve()

    db_path = Path(
        args.db
    ).resolve()

    if not static_dir.is_dir():
        parser.error(
            "Static directory does not exist: "
            f"{static_dir}"
        )

    server = build_server(
        args.host,
        args.port,
        static_dir,
        db_path,
        args.cors_origin,
    )

    print(
        "Solar PV Design Platform "
        "v2.1"
    )

    print(
        f"App:      http://{args.host}:{args.port}/"
    )

    print(
        f"API:      http://{args.host}:{args.port}{API_PREFIX}"
    )

    print(
        f"Database: {db_path}"
    )

    print(
        "Development server: "
        "no authentication is enabled. "
        "Keep Codespaces port private."
    )

    try:
        server.serve_forever()

    except KeyboardInterrupt:
        print(
            "\nStopping server..."
        )

    finally:
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(
        main()
    )
    