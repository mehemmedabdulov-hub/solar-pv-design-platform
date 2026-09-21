#!/usr/bin/env python3
"""Real-browser Gate 4 smoke for SOLAR v2.3 Alpha.

This test intentionally loads the served application over HTTP with its real pinned
Leaflet/Leaflet.Draw/Turf dependencies. It is the runtime/interaction gate that
static and unit tests cannot substitute for.
"""
import argparse
import json
import os
import sys
import traceback
from playwright.sync_api import sync_playwright

def assert_eq(a,b,msg):
    assert a==b, f"{msg}: expected {b!r}, got {a!r}"

def desktop(page,log):
    assert 'v2.3 Alpha' in page.locator('#releaseBanner').inner_text()
    assert 'v2.2' in page.locator('#releaseBanner').inner_text()
    assert 'Version 2.1' in page.locator('#releaseBanner').inner_text()
    page.locator('#confirmLocationButton').click(); page.wait_for_timeout(50)
    assert_eq(page.locator('#locationLifecycleLabel').inner_text(),'Location · Confirmed','A1 confirm')
    page.evaluate('''() => {
      const f=L.polygon([[40.40930,49.86710],[40.40930,49.86810],[40.41010,49.86810],[40.41010,49.86710]]);
      Object.assign(f,{roofFaceId:'RF-1',roofFaceName:'Roof Face 1',subArrayId:'SA-1',surfaceKind:'Rooftop Solar',roofTilt:10,roofAzimuth:180});
      roofFaces.push(f); editableItems.addLayer(f); activeRoofFaceId='RF-1'; renderLocationLifecycleStatus();
    }''')
    assert_eq(page.locator('#locationLifecycleLabel').inner_text(),'Location · Locked-by-geometry','A1 lock')
    before=page.evaluate('''() => ({lat:document.getElementById('latitude').value,lng:document.getElementById('longitude').value,marker:projectMarker.getLatLng(),fp:captureProjectSnapshot().stateFingerprint,faces:roofFaces.length})''')
    page.evaluate("map.fire('click',{latlng:L.latLng(41,50)})"); page.wait_for_timeout(50)
    after_click=page.evaluate('''() => ({lat:document.getElementById('latitude').value,lng:document.getElementById('longitude').value,marker:projectMarker.getLatLng(),faces:roofFaces.length})''')
    assert_eq(after_click['lat'],before['lat'],'A1 ordinary map click lat')
    assert_eq(after_click['lng'],before['lng'],'A1 ordinary map click lng')
    assert_eq(after_click['faces'],1,'A1 map click geometry')
    page.locator('#latitude').fill('40.500000'); page.locator('#longitude').fill('49.900000')
    page.get_by_role('button',name='Go to Coordinates').click()
    dlg=page.locator('dialog'); dlg.wait_for(state='visible')
    assert 'Relocate Project' in dlg.inner_text()
    assert_eq(page.evaluate("document.activeElement?.textContent?.trim()"),'Cancel','A1 dialog initial focus')
    page.keyboard.press('Escape'); dlg.wait_for(state='detached')
    cancelled=page.evaluate('''() => ({lat:document.getElementById('latitude').value,lng:document.getElementById('longitude').value,fp:captureProjectSnapshot().stateFingerprint,faces:roofFaces.length})''')
    assert_eq(cancelled['lat'],before['lat'],'A1 cancel lat')
    assert_eq(cancelled['lng'],before['lng'],'A1 cancel lng')
    assert_eq(cancelled['fp'],before['fp'],'A1 cancel fingerprint')
    assert_eq(cancelled['faces'],1,'A1 cancel faces')
    page.locator('#latitude').fill('40.500000'); page.locator('#longitude').fill('49.900000')
    page.get_by_role('button',name='Go to Coordinates').click(); dlg=page.locator('dialog'); dlg.wait_for(state='visible')
    dlg.get_by_role('button',name='Relocate and Clear Bound Data').click(); dlg.wait_for(state='detached')
    moved=page.evaluate('''() => ({lat:document.getElementById('latitude').value,lng:document.getElementById('longitude').value,faces:roofFaces.length,state:locationLifecycle.getState()})''')
    assert_eq(moved['faces'],0,'A1 destructive clears')
    assert_eq(moved['state'],'Confirmed','A1 destructive state')
    assert moved['lat'].startswith('40.5') and moved['lng'].startswith('49.9')
    log.append('A1 browser interaction PASS')

    # A2 no-geometry immediate then guarded migration with default+custom metadata.
    page.locator('input[name="installation"][value="Ground-Mounted Solar"]').check(); page.wait_for_timeout(50)
    assert_eq(page.evaluate('installationMigrationState.getCommittedType()'),'Ground-Mounted Solar','A2 no geometry immediate')
    page.evaluate('''() => {
      const f1=L.polygon([[40.5000,49.9000],[40.5000,49.9010],[40.5010,49.9010],[40.5010,49.9000]]);
      Object.assign(f1,{roofFaceId:'RF-1',roofFaceName:'Ground Block 1',subArrayId:'GA-1',surfaceKind:'Ground-Mounted Solar',roofTilt:20,roofAzimuth:180});
      const f2=L.polygon([[40.5020,49.9000],[40.5020,49.9010],[40.5030,49.9010],[40.5030,49.9000]]);
      Object.assign(f2,{roofFaceId:'RF-2',roofFaceName:'Custom East Field',subArrayId:'CUSTOM-SA',surfaceKind:'Ground-Mounted Solar',roofTilt:15,roofAzimuth:170});
      roofFaces.push(f1,f2); editableItems.addLayer(f1); editableItems.addLayer(f2); activeRoofFaceId='RF-1'; renderLocationLifecycleStatus();
    }''')
    a2_before=page.evaluate('''() => ({fp:captureProjectSnapshot().stateFingerprint,polys:roofFaces.map(f=>f.getLatLngs()[0].map(p=>[p.lat,p.lng])),meta:roofFaces.map(f=>[f.roofFaceName,f.subArrayId,f.surfaceKind])})''')
    page.locator('input[name="installation"][value="Solar Carport"]').click(); dlg=page.locator('dialog'); dlg.wait_for(state='visible')
    txt=dlg.inner_text()
    assert 'Ground-Mounted Solar' in txt and 'Solar Carport' in txt and '2 design surface(s)' in txt and '1 surface(s) use default-pattern' in txt
    assert_eq(page.evaluate("document.querySelector('input[name=installation]:checked').value"),'Ground-Mounted Solar','A2 pending radio')
    page.keyboard.press('Escape'); dlg.wait_for(state='detached')
    a2_cancel=page.evaluate('''() => ({fp:captureProjectSnapshot().stateFingerprint,meta:roofFaces.map(f=>[f.roofFaceName,f.subArrayId,f.surfaceKind])})''')
    assert_eq(a2_cancel['fp'],a2_before['fp'],'A2 cancel fingerprint')
    assert_eq(a2_cancel['meta'],a2_before['meta'],'A2 cancel metadata')
    page.locator('input[name="installation"][value="Solar Carport"]').click(); dlg=page.locator('dialog'); dlg.wait_for(state='visible')
    dlg.get_by_role('button',name='Migrate existing surfaces').click(); dlg.wait_for(state='detached'); page.wait_for_timeout(50)
    a2_after=page.evaluate('''() => ({type:installationMigrationState.getCommittedType(),polys:roofFaces.map(f=>f.getLatLngs()[0].map(p=>[p.lat,p.lng])),meta:roofFaces.map(f=>[f.roofFaceName,f.subArrayId,f.surfaceKind]),layout:layoutIsCurrent})''')
    assert_eq(a2_after['type'],'Solar Carport','A2 migrate committed')
    assert_eq(a2_after['polys'],a2_before['polys'],'A2 polygon preserved')
    assert_eq(a2_after['meta'][0],['Canopy 1','CA-1','Solar Carport'],'A2 default metadata renamed')
    assert_eq(a2_after['meta'][1],['Custom East Field','CUSTOM-SA','Solar Carport'],'A2 custom metadata preserved')
    assert_eq(a2_after['layout'],False,'A2 downstream layout stale')
    log.append('A2 browser interaction PASS')

    # A3 seed a valid current electrical model and test stale/current behavior in a real browser DOM.
    page.evaluate('''() => {
      placedPanels=[]; panelLayerGroup.clearLayers();
      const panel=L.polygon([[40.5002,49.9002],[40.5002,49.9003],[40.5003,49.9003],[40.5003,49.9002]],PANEL_NORMAL_STYLE);
      Object.assign(panel,{panelUid:1,panelNumber:1,panelRoofFaceId:'RF-1',panelRoofFaceName:roofFaces[0].roofFaceName,panelSubArrayId:roofFaces[0].subArrayId,panelSurfaceTilt:roofFaces[0].roofTilt,panelSurfaceAzimuth:roofFaces[0].roofAzimuth,panelSurfaceKind:roofFaces[0].surfaceKind,panelAzimuth:180,panelWidth:1.134,panelLength:2.382,panelOrientation:'portrait'});
      placedPanels.push(panel); panelLayerGroup.addLayer(panel); layoutIsCurrent=true;
      electricalDesignResult={status:'pass',inverterQuantity:1,inverterInstances:[{number:1,dcKW:0.62}],strings:[{id:'STR-1',subArrayId:roofFaces[0].subArrayId,roofFaceId:'RF-1',moduleCount:1,inverterNumber:1,mpptNumber:1,inputNumber:1,vmpStcV:41,vocColdV:52,powerKW:0.62,strictVoltagePass:true,status:'pass'}]};
      detailedElectricalResult={rows:[],ruleContext:getActiveEngineeringRuleContext(),conductorMaterial:'Copper',largestBreakerA:32};
      alphaDeliverableInstrumentation.reset(); updateEngineeringDeliverables(false,{force:true});
    }''')
    cur=page.locator('#deliverablesStatus').inner_text()
    assert 'current' in cur.lower()
    before_counts=page.evaluate('alphaDeliverableInstrumentation.snapshot()')
    before_html=page.locator('#sldPreview').inner_html()
    assert '<svg' in before_html.lower()
    page.evaluate('''() => { const p=placedPanels[0]; const xs=p.getLatLngs()[0].map(x=>L.latLng(x.lat+0.00001,x.lng+0.00001)); p.setLatLngs(xs); manualLayoutEdited=true; markDeliverablesStale('Panel geometry changed in browser smoke.'); }''')
    stale=page.locator('#deliverablesStatus').inner_text(); after_stale_counts=page.evaluate('alphaDeliverableInstrumentation.snapshot()')
    assert 'STALE' in stale
    assert_eq(after_stale_counts['deliverableBuilds'],before_counts['deliverableBuilds'],'A3 no implicit build')
    assert after_stale_counts['staleMarks']>before_counts['staleMarks']
    assert '<svg' in page.locator('#sldPreview').inner_html().lower()
    page.evaluate("updateEngineeringDeliverables(false,{force:true})")
    refreshed=page.locator('#deliverablesStatus').inner_text(); assert 'current' in refreshed.lower()
    counts_refresh=page.evaluate('alphaDeliverableInstrumentation.snapshot()'); assert counts_refresh['explicitGenerations']>before_counts['explicitGenerations']
    # Stale again and exercise export's explicit regeneration boundary without letting download navigation interfere.
    page.evaluate("markDeliverablesStale('Export stale-path browser smoke.')")
    pre_export=page.evaluate('alphaDeliverableInstrumentation.snapshot()')
    page.evaluate('''() => { if(window.SolarPVSLDEditor) window.SolarPVSLDEditor.exportSvg=()=>true; exportSldSvg(); }''')
    post_export=page.evaluate('alphaDeliverableInstrumentation.snapshot()')
    assert post_export['explicitGenerations']>pre_export['explicitGenerations'] and post_export['deliverableBuilds']>pre_export['deliverableBuilds']
    log.append('A3 browser interaction PASS')

    # A4 desktop accessibility/version/sticky readiness.
    assert page.locator('#solarStickyActionBar').is_visible()
    assert page.locator('#solarPrimaryStageAction').is_visible()
    banner=page.locator('#releaseBanner').inner_text()
    for phrase in ['v2.3 Alpha','v2.2 Experience + Drawings','Version 2.1']:
        assert phrase in banner
    assert 'Project schema 2.0' in page.locator('body').inner_text()
    log.append('A4 desktop/sticky/version PASS')


def tablet(page,log):
    page.set_viewport_size({'width':820,'height':900}); page.wait_for_timeout(50)
    # Fresh location flow at tablet width using existing locked geometry.
    assert page.locator('#setLocationModeButton').is_visible()
    old=page.evaluate("locationLifecycle.getAppliedCoordinates()")
    page.locator('#latitude').fill(str(old['lat']+0.01)); page.locator('#longitude').fill(str(old['lng']+0.01))
    page.get_by_role('button',name='Go to Coordinates').click(); dlg=page.locator('dialog'); dlg.wait_for(state='visible')
    assert_eq(page.evaluate("document.activeElement?.textContent?.trim()"),'Cancel','A4 tablet dialog focus')
    page.keyboard.press('Escape'); dlg.wait_for(state='detached')
    # Migration at tablet width, cancel with keyboard.
    current=page.evaluate('installationMigrationState.getCommittedType()')
    target='Rooftop Solar' if current!='Rooftop Solar' else 'Ground-Mounted Solar'
    page.locator(f'input[name="installation"][value="{target}"]').click(); dlg=page.locator('dialog'); dlg.wait_for(state='visible')
    page.keyboard.press('Escape'); dlg.wait_for(state='detached')
    assert_eq(page.evaluate('installationMigrationState.getCommittedType()'),current,'A4 tablet migration escape')
    assert page.locator('#solarStickyActionBar').is_visible()
    log.append('A4 tablet/keyboard PASS')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.environ.get("SOLAR_BROWSER_BASE_URL", "http://127.0.0.1:8000/index.html"))
    parser.add_argument("--timeout-ms", type=int, default=30000)
    args = parser.parse_args()
    log = []
    errors = []
    console_errors = []
    with sync_playwright() as pw:
        launch_kwargs = {"headless": True, "args": ["--no-sandbox", "--disable-gpu"]}
        executable = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        if executable:
            launch_kwargs["executable_path"] = executable
        browser = pw.chromium.launch(**launch_kwargs)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(args.timeout_ms)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.goto(args.base_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
        page.wait_for_function("typeof L !== 'undefined' && typeof turf !== 'undefined' && !!window.SolarPVAlphaController", timeout=args.timeout_ms)
        # The release banner is intentionally hidden in Simple Mode. Switch to Engineer Mode
        # before asserting release/version metadata so the test matches the real workflow UX.
        page.locator('[data-solar-mode-button="engineer"]').click()
        page.wait_for_selector("#releaseBanner", state="visible", timeout=args.timeout_ms)
        desktop(page, log)
        tablet(page, log)
        browser.close()
    bad_errors = [e for e in errors if "favicon" not in e.lower()]
    if bad_errors:
        raise AssertionError(f"Browser page errors: {bad_errors}")
    print(json.dumps({"ok": True, "log": log, "pageErrors": errors, "consoleErrors": console_errors}, indent=2))

if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
