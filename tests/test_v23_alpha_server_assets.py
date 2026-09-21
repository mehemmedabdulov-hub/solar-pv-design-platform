#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, pathlib, tempfile, threading, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
SERVER_PATH=ROOT/'solar_pv_design_platform_v2.1_server.py'
spec=importlib.util.spec_from_file_location('solar_v23_alpha_asset_server',SERVER_PATH)
server_mod=importlib.util.module_from_spec(spec); assert spec.loader is not None; spec.loader.exec_module(server_mod)
assets=['ux-v2.2.css','notifications.js','v23-alpha-controller.js','equipment-ui.js','workflow.js','panel-editor.js','sld-drawing-model.js','sld-editor.js','results-ui.js','persistence-ui.js']
with tempfile.TemporaryDirectory(prefix='solar-v23-alpha-assets-') as tmp:
    httpd=server_mod.build_server('127.0.0.1',0,ROOT,pathlib.Path(tmp)/'asset.sqlite3')
    thread=threading.Thread(target=httpd.serve_forever,daemon=True); thread.start()
    base=f'http://127.0.0.1:{httpd.server_address[1]}'
    try:
        for asset in assets:
            with urllib.request.urlopen(base+'/'+asset,timeout=5) as response:
                body=response.read(); assert response.status==200,asset; assert len(body)>100,asset
        print(f'v2.3 Alpha server static assets: PASS ({len(assets)} orchestration/UI assets served by existing v2.1 server)')
    finally:
        httpd.shutdown(); httpd.server_close(); thread.join(timeout=5)
