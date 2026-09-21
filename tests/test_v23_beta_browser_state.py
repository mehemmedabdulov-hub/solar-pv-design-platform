#!/usr/bin/env python3
import argparse, json, os, traceback
from playwright.sync_api import sync_playwright

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--base-url',default=os.environ.get('SOLAR_BROWSER_BASE_URL','http://127.0.0.1:8000/index.html')); ap.add_argument('--timeout-ms',type=int,default=30000); args=ap.parse_args()
    errors=[]
    with sync_playwright() as pw:
        launch={'headless':True,'args':['--no-sandbox','--disable-gpu']}
        exe=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE')
        if exe: launch['executable_path']=exe
        browser=pw.chromium.launch(**launch)
        page=browser.new_page(viewport={'width':1280,'height':900}); page.set_default_timeout(args.timeout_ms); page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(args.base_url,wait_until='domcontentloaded')
        page.wait_for_function("!!window.SolarPVProjectStateStore && typeof L !== 'undefined'")
        initial=page.evaluate("SolarPVProjectStateStore.getFingerprint()")
        site_fp=page.evaluate("SolarPVProjectStateStore.selectFingerprint(['location','site'])")
        page.locator('#projectName').fill('Beta State Browser Test'); page.locator('#projectName').blur(); page.wait_for_timeout(100)
        assert page.evaluate("SolarPVProjectStateStore.getState().identity.projectName")=='Beta State Browser Test'
        assert page.evaluate("SolarPVProjectStateStore.getFingerprint()") != initial
        assert page.evaluate("SolarPVProjectStateStore.selectFingerprint(['site','location'])") == site_fp
        # Presentation mode is not project state.
        mode_before=page.evaluate("SolarPVProjectStateStore.getFingerprint()")
        page.locator('[data-solar-mode-button="engineer"]').click(); page.wait_for_timeout(50)
        assert page.evaluate("SolarPVProjectStateStore.getFingerprint()") == mode_before
        # Confirm location and add a real Leaflet polygon through the application's draw event.
        page.locator('#confirmLocationButton').click(); page.wait_for_timeout(60)
        page.evaluate('''() => { currentDrawMode='roofFace'; const layer=L.polygon([[40.40930,49.86710],[40.40930,49.86800],[40.41000,49.86800],[40.41000,49.86710]]); map.fire(L.Draw.Event.CREATED,{layer,layerType:'polygon'}); }''')
        page.wait_for_timeout(120)
        assert page.evaluate("SolarPVProjectStateStore.getState().site.surfaces.length") == 1
        exported=page.evaluate("JSON.stringify(captureProjectSnapshot({savedAt:'2026-09-21T00:00:00.000Z'}))")
        snapshot=json.loads(exported)
        assert snapshot['projectStateVersion']=='2.3-beta'
        assert snapshot['projectStateFingerprint']==page.evaluate("SolarPVProjectStateStore.getFingerprint()")
        assert snapshot['schemaVersion']=='2.0'
        assert snapshot['stateFingerprint']==page.evaluate("s => calculateProjectSnapshotFingerprint(JSON.parse(s))", exported)
        # Mutate, restore through the exact JSON export/reload boundary, and verify convergence.
        page.locator('#projectName').fill('Changed after export'); page.locator('#projectName').blur(); page.wait_for_timeout(80)
        page.evaluate("s => restoreProjectSnapshot(JSON.parse(s))", exported); page.wait_for_timeout(150)
        assert page.locator('#projectName').input_value()=='Beta State Browser Test'
        assert page.evaluate("SolarPVProjectStateStore.getState().site.surfaces.length") == 1
        assert page.evaluate("SolarPVProjectStateStore.getFingerprint()") == snapshot['projectStateFingerprint']
        browser.close()
    if errors: raise AssertionError(errors)
    print(json.dumps({'ok':True,'gate':'B1 runtime ProjectState round-trip'},indent=2))

if __name__=='__main__':
    try: main()
    except Exception:
        traceback.print_exc(); raise
