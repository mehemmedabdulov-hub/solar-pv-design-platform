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
SERVER_PATH = ROOT / "solar_pv_design_platform_v2.1_server.py"
spec = importlib.util.spec_from_file_location("solar_v21_server", SERVER_PATH)
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
        "schemaVersion": "2.0",
        "applicationVersion": "2.1",
        "projectId": "v21-server-test",
        "revisionNumber": revision,
        "parentRevisionFingerprint": parent,
        "savedAt": f"2026-08-29T00:00:0{revision}.000Z",
        "installation": "Rooftop Solar",
        "form": {"projectName": name},
        "layout": {"panels": [{"id": "panel-1"}]},
        "calculatedSummary": {"modulePowerW": 550},
        "engineeringRules": {
            "packId": "SPVDP-GLOBAL-PRELIM-2026",
            "overlayPolicy": "strict-v2",
            "provenance": {
                "fingerprint": "rule-test",
                "rulePackSchemaVersion": "2.0.0",
                "contractFingerprint": "rulepack-v2-sha256-test",
            },
        },
    }
    snapshot["stateFingerprint"] = server_mod.calculate_snapshot_fingerprint(snapshot)
    return snapshot


assert server_mod.APP_VERSION == "2.1.0"
assert server_mod.PROJECT_SCHEMA_VERSION == "2.0"
assert server_mod.DB_SCHEMA_VERSION == 1
source_text = SERVER_PATH.read_text(encoding="utf-8")
assert "solar_pv_v17_alpha6.sqlite3" in source_text

with tempfile.TemporaryDirectory(prefix="solar-v21-server-") as tmp:
    db_path = pathlib.Path(tmp) / "test.sqlite3"
    httpd = server_mod.build_server("127.0.0.1", 0, ROOT, db_path)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        status, health = request_json(base + "/api/solar-pv/health")
        assert status == 200
        assert health["ok"] is True
        assert health["version"] == "2.1.0"
        assert health["projectSchema"] == "2.0"
        assert health["database"]["schemaVersion"] == 1
        assert "v1.9-engineering-rule-provenance" in health["capabilities"]
        assert "v2.0-rule-pack-contract" in health["capabilities"]
        assert "v2.1-calculation-corrections" in health["capabilities"]

        for filename in [
            "index.html",
            "solar_pv_design_platform_v2.1_core.js",
            "solar_pv_design_platform_v2.1_layout.js",
            "solar_pv_design_platform_v2.1_rulepacks.js",
            "solar_pv_design_platform_v2.1_electrical.js",
            "solar_pv_design_platform_v2.1_energy.js",
            "solar_pv_design_platform_v2.1_finance.js",
            "solar_pv_design_platform_v1.9_repository.js",
            "solar_pv_design_platform_v1.9_geometry.js",
            "solar_pv_design_platform_v1.9_rules.js",
            "solar_pv_design_platform_v1.9_worker.js",
            "schemas/solar_pv_rule_pack_schema_v2.0.0.json",
        ]:
            with urllib.request.urlopen(base + "/" + filename, timeout=5) as response:
                assert response.status == 200, filename
                assert len(response.read()) > 10, filename

        # Repository/static-root hygiene: source control metadata, dotfiles,
        # backend Python, and test Python must never be served to the browser.
        for forbidden_path in [
            "/.gitignore",
            "/solar_pv_design_platform_v2.1_server.py",
            "/tests/test_v21_server.py",
        ]:
            try:
                urllib.request.urlopen(base + forbidden_path, timeout=5)
            except urllib.error.HTTPError as exc:
                assert exc.code == 404, forbidden_path
            else:
                raise AssertionError(f"Sensitive static path was served: {forbidden_path}")

        first = make_snapshot(1, None, "Revision 1")
        status, result = request_json(
            base + "/api/solar-pv/projects/v21-server-test/revisions",
            method="POST", body=first,
            headers={"X-PV-Project-Fingerprint": first["stateFingerprint"]},
        )
        assert status == 201, result
        assert result["revisionNumber"] == 1

        status, result = request_json(
            base + "/api/solar-pv/projects/v21-server-test/revisions",
            method="POST", body=first,
            headers={"X-PV-Project-Fingerprint": first["stateFingerprint"]},
        )
        assert status == 200 and result["idempotent"] is True

        wrong_parent = make_snapshot(2, "pv-deadbeef", "Bad parent")
        status, conflict = request_json(
            base + "/api/solar-pv/projects/v21-server-test/revisions",
            method="POST", body=wrong_parent,
            headers={"X-PV-Project-Fingerprint": wrong_parent["stateFingerprint"]},
        )
        assert status == 409, conflict

        second = make_snapshot(2, first["stateFingerprint"], "Revision 2")
        status, result = request_json(
            base + "/api/solar-pv/projects/v21-server-test/revisions",
            method="POST", body=second,
            headers={"X-PV-Project-Fingerprint": second["stateFingerprint"]},
        )
        assert status == 201, result

        status, current = request_json(base + "/api/solar-pv/projects/v21-server-test/current")
        assert status == 200 and current["snapshot"]["revisionNumber"] == 2
        status, history = request_json(base + "/api/solar-pv/projects/v21-server-test/revisions")
        assert status == 200
        assert [item["revisionNumber"] for item in history["revisions"]] == [2, 1]
        status, restored = request_json(base + "/api/solar-pv/projects/v21-server-test/revisions/1")
        assert status == 200 and restored["snapshot"]["stateFingerprint"] == first["stateFingerprint"]

        bad = make_snapshot(3, second["stateFingerprint"], "Bad fingerprint")
        bad["form"]["projectName"] = "Tampered after fingerprint"
        status, rejected = request_json(
            base + "/api/solar-pv/projects/v21-server-test/revisions",
            method="POST", body=bad,
            headers={"X-PV-Project-Fingerprint": bad["stateFingerprint"]},
        )
        assert status == 400, rejected
        assert "fingerprint" in rejected.get("error", "").lower()

        print(json.dumps({
            "ok": True,
            "healthVersion": health["version"],
            "projectSchema": health["projectSchema"],
            "dbSchema": health["database"]["schemaVersion"],
            "revisions": 2,
            "conflictEnforced": True,
            "fingerprintVerification": True,
            "calculationCorrectionCapability": True,
            "dbFileCreated": db_path.is_file(),
            "legacyDatabaseFilenamePreserved": True,
        }, indent=2))
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)
