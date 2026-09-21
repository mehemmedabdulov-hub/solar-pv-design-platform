#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import pathlib
import tempfile
import threading
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT / "solar_pv_design_platform_v1.9_server.py"
spec = importlib.util.spec_from_file_location("solar_v19_server", SERVER_PATH)
server_mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(server_mod)


def request_json(url: str, method: str = "GET", body: dict | None = None, headers: dict | None = None):
    data = None if body is None else json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, json.loads(raw) if raw else {}


def make_snapshot(revision: int, parent: str | None, name: str) -> dict:
    snapshot = {
        "schemaVersion": "1.9",
        "applicationVersion": "1.9",
        "projectId": "v19-server-test",
        "revisionNumber": revision,
        "parentRevisionFingerprint": parent,
        "savedAt": f"2026-08-28T00:00:0{revision}.000Z",
        "installation": "Rooftop",
        "form": {"projectName": name},
        "layout": {"panels": [{"id": "panel-1"}]},
        "calculatedSummary": {"modulePowerW": 550},
        "engineeringRules": {
            "packId": "SPVDP-GLOBAL-PRELIM-2026",
            "provenance": {"fingerprint": "rule-test"},
        },
    }
    snapshot["stateFingerprint"] = server_mod.calculate_snapshot_fingerprint(snapshot)
    return snapshot


with tempfile.TemporaryDirectory(prefix="solar-v19-server-") as tmp:
    db_path = pathlib.Path(tmp) / "test.sqlite3"
    httpd = server_mod.build_server("127.0.0.1", 0, ROOT, db_path)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        status, health = request_json(base + "/api/solar-pv/health")
        assert status == 200
        assert health["ok"] is True
        assert health["version"] == "1.9.0"
        assert health["projectSchema"] == "1.9"
        assert "v1.9-engineering-rule-provenance" in health["capabilities"]

        for filename in [
            "index.html",
            "solar_pv_design_platform_v1.9_core.js",
            "solar_pv_design_platform_v1.9_rules.js",
            "solar_pv_design_platform_v1.9_electrical.js",
            "solar_pv_design_platform_v1.9_worker.js",
        ]:
            with urllib.request.urlopen(base + "/" + filename, timeout=5) as response:
                assert response.status == 200, filename
                assert len(response.read()) > 10, filename

        first = make_snapshot(1, None, "Revision 1")
        status, result = request_json(
            base + "/api/solar-pv/projects/v19-server-test/revisions",
            method="POST",
            body=first,
            headers={"X-PV-Project-Fingerprint": first["stateFingerprint"]},
        )
        assert status == 201, result
        assert result["revisionNumber"] == 1

        # Repeating the exact immutable commit is idempotent.
        status, result = request_json(
            base + "/api/solar-pv/projects/v19-server-test/revisions",
            method="POST",
            body=first,
            headers={"X-PV-Project-Fingerprint": first["stateFingerprint"]},
        )
        assert status == 200, result
        assert result["idempotent"] is True

        wrong_parent = make_snapshot(2, "pv-deadbeef", "Bad parent")
        status, conflict = request_json(
            base + "/api/solar-pv/projects/v19-server-test/revisions",
            method="POST",
            body=wrong_parent,
            headers={"X-PV-Project-Fingerprint": wrong_parent["stateFingerprint"]},
        )
        assert status == 409, conflict
        assert "Parent fingerprint conflict" in conflict.get("error", "")

        second = make_snapshot(2, first["stateFingerprint"], "Revision 2")
        status, result = request_json(
            base + "/api/solar-pv/projects/v19-server-test/revisions",
            method="POST",
            body=second,
            headers={"X-PV-Project-Fingerprint": second["stateFingerprint"]},
        )
        assert status == 201, result

        status, current = request_json(base + "/api/solar-pv/projects/v19-server-test/current")
        assert status == 200
        assert current["snapshot"]["revisionNumber"] == 2
        assert current["snapshot"]["stateFingerprint"] == second["stateFingerprint"]

        status, history = request_json(base + "/api/solar-pv/projects/v19-server-test/revisions")
        assert status == 200
        assert [item["revisionNumber"] for item in history["revisions"]] == [2, 1]

        status, restored = request_json(base + "/api/solar-pv/projects/v19-server-test/revisions/1")
        assert status == 200
        assert restored["snapshot"]["stateFingerprint"] == first["stateFingerprint"]

        print({
            "ok": True,
            "healthVersion": health["version"],
            "projectSchema": health["projectSchema"],
            "revisions": 2,
            "conflictEnforced": True,
            "dbFileCreated": db_path.is_file(),
        })
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)
