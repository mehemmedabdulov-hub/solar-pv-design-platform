#!/usr/bin/env python3
from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parents[1]
manifest=ROOT/'docs'/'V2.3_ALPHA_PROTECTED_SHA256.txt'
checked=0
for raw in manifest.read_text(encoding='utf-8').splitlines():
    line=raw.strip()
    if not line or line.startswith('#'): continue
    expected, rel=line.split(None,1)
    path=ROOT/rel.strip()
    assert path.is_file(), f'missing protected file {rel}'
    actual=hashlib.sha256(path.read_bytes()).hexdigest()
    assert actual==expected, f'protected file changed: {rel}\nexpected {expected}\nactual   {actual}'
    checked+=1
assert checked==12
print(f'v2.3 Alpha protected baseline: PASS ({checked} protected engine/schema files unchanged)')
