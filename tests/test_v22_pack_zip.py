#!/usr/bin/env python3
import zipfile
from pathlib import Path
p = Path('/tmp/solar-v22-pack-test.zip')
assert p.exists(), "export JS test did not create pack fixture"
with zipfile.ZipFile(p, 'r') as zf:
    bad = zf.testzip()
    assert bad is None, f"ZIP CRC failure: {bad}"
    assert zf.namelist() == ["manifest.json", "E-401_Single_Line_Diagram.svg", "README.txt"]
    assert b'2.2.0' in zf.read('manifest.json')
    assert b'NOT FOR CONSTRUCTION' in zf.read('README.txt')
p.unlink(missing_ok=True)
print("v2.2 Engineering Pack ZIP compatibility: PASS")
