"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
function load(file, extras = {}) {
  const context = vm.createContext({ console, Math, Map, Set, Number, String, Array, Object, JSON, Infinity, NaN, ...extras });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  return context;
}
function approx(actual, expected, tolerance = 1e-9, label = "value") {
  assert.ok(Number.isFinite(actual), `${label} must be finite; got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}
function nextStandard(values, required) {
  return [...values].sort((a,b)=>a-b).find(v => v + 1e-12 >= required) ?? null;
}

const cableSizes = [2.5,4,6,10,16,25,35,50,70,95,120,150,185,240,300,400];
const oldElectrical = load("solar_pv_design_platform_v1.9_electrical.js");
const newElectrical = load("solar_pv_design_platform_v2.1_electrical.js");
const newEnergy = load("solar_pv_design_platform_v2.1_energy.js");
const newLayout = load("solar_pv_design_platform_v2.1_layout.js");
const newFinance = load("solar_pv_design_platform_v2.1_finance.js");

const results = [];
function record(id, category, inputs, baseline, expected, fixed, note) {
  results.push({ id, category, inputs, baseline, expected, fixed, note, pass: fixed === expected || (typeof fixed === "number" && typeof expected === "number" && Math.abs(fixed-expected) <= 1e-8) });
}

// Scenario 1: minimum-ish route/input - should remain stable at minimum standard cable.
{
  const args = { operatingCurrentA: 1, designCurrentA: 1.25, protectionA: null, oneWayLengthM: 0.5, operatingVoltageV: 1000, maxDropPct: 3, currentDensity: 6, tempFactor: 1, resistivityOhmMm2M: 0.0175, standardCableSizesMm2: cableSizes };
  const old = oldElectrical.chooseDcCableSize(args);
  const fixed = newElectrical.chooseDcCableSize(args);
  const expected = 2.5;
  assert.strictEqual(old.sizeMm2, expected);
  assert.strictEqual(fixed.sizeMm2, expected);
  record("S1", "minimum-boundary DC cable", args, old.sizeMm2, expected, fixed.sizeMm2, "No regression at the minimum standard conductor size.");
}

// Scenario 2: normal hot-array DC string voltage-drop sizing.
{
  const modules = 14, vmpStcPerModule = 40.24, vmpCoeffPctC = -0.35, hotC = 70;
  const stcV = modules * vmpStcPerModule;
  const hotV = modules * vmpStcPerModule * (1 + (vmpCoeffPctC/100) * (hotC - 25));
  const common = { operatingCurrentA: 15.41, designCurrentA: 16.26*1.25, protectionA: null, oneWayLengthM: 100, maxDropPct: 2, currentDensity: 5, tempFactor: 1.2, resistivityOhmMm2M: 0.0175, standardCableSizesMm2: cableSizes };
  const old = oldElectrical.chooseDcCableSize({ ...common, operatingVoltageV: stcV });
  const fixed = newElectrical.chooseDcCableSize({ ...common, operatingVoltageV: hotV });
  const currentBasis = common.designCurrentA;
  const sizeByCurrent = currentBasis/common.currentDensity;
  const sizeByDrop = 2*common.oneWayLengthM*common.operatingCurrentA*common.resistivityOhmMm2M*common.tempFactor/(hotV*common.maxDropPct/100);
  const expectedSize = nextStandard(cableSizes, Math.max(2.5,sizeByCurrent,sizeByDrop));
  const loopR = common.resistivityOhmMm2M*(2*common.oneWayLengthM)*common.tempFactor/expectedSize;
  const expectedDropPct = common.operatingCurrentA*loopR/hotV*100;
  assert.strictEqual(old.sizeMm2, 6);
  assert.strictEqual(expectedSize, 10);
  assert.strictEqual(fixed.sizeMm2, expectedSize);
  approx(fixed.dropPct, expectedDropPct, 1e-10, "hot DC drop percent");
  record("S2", "normal DC hot-voltage drop", { modules, stcV, hotV, ...common }, old.sizeMm2, expectedSize, fixed.sizeMm2, `Baseline sizes at STC voltage (${stcV.toFixed(2)} V); fixed sizes at hot Vmp (${hotV.toFixed(2)} V).`);
}

// Scenario 3: maximum/long-run DC cable sizing remains mathematically bounded.
{
  const args = { operatingCurrentA: 15.49, designCurrentA: 16.38*1.25, protectionA: null, oneWayLengthM: 500, operatingVoltageV: 400, maxDropPct: 1, currentDensity: 3, tempFactor: 1.25, resistivityOhmMm2M: 0.0175, standardCableSizesMm2: cableSizes };
  const fixed = newElectrical.chooseDcCableSize(args);
  const reqDrop = 2*500*15.49*0.0175*1.25/(400*0.01);
  const reqCurrent = args.designCurrentA/3;
  const expected = nextStandard(cableSizes, Math.max(2.5, reqDrop, reqCurrent));
  assert.strictEqual(fixed.sizeMm2, expected);
  assert.ok(fixed.dropPct <= 1 + 1e-9);
  record("S3", "maximum long-run DC cable", args, "same pure helper when given same basis", expected, fixed.sizeMm2, "High length/tight drop limit selects the next available standard size without rounding down.");
}

// Scenario 4: unusual mixed string lengths with parallel-capable MPPT.
{
  const input = { panelCount:27, strictMin:13, strictMax:14, preferredMin:13, preferredMax:14, parallelCapacity:2 };
  const old = oldElectrical.chooseStringPartition(...Object.values(input));
  const fixed = newElectrical.chooseStringPartition(...Object.values(input));
  assert.deepStrictEqual(Array.from(old.lengths), [14,13]);
  assert.strictEqual(old.mpptsNeeded, 1);
  assert.deepStrictEqual(Array.from(fixed.lengths), [14,13]);
  assert.strictEqual(fixed.mpptsNeeded, 2);
  record("S4", "edge MPPT mixed-length partition", input, old.mpptsNeeded, 2, fixed.mpptsNeeded, "Different series-module counts cannot be paralleled on one MPPT; each length class needs its own tracker group.");
}

// Scenario 5: normal AC feeder loss percentage must use same power basis as sizing current.
{
  const acPowerKW=25, maxActivePowerKW=27.5, voltage=400, pf=0.9, length=30, rho=0.0175, temp=1.2;
  const current=maxActivePowerKW*1000/(Math.sqrt(3)*voltage*pf);
  const cable = newElectrical.chooseAcCableSize({ operatingCurrentA:current, designCurrentA:current*1.25, breakerA:63, oneWayLengthM:length, lineVoltageV:voltage, maxDropPct:2, currentDensity:4, tempFactor:temp, resistivityOhmMm2M:rho, standardCableSizesMm2:cableSizes });
  const lossW = cable.lossW;
  const baselinePct=lossW/(acPowerKW*1000)*100;
  const expectedPct=lossW/(maxActivePowerKW*1000)*100;
  assert.ok(baselinePct > expectedPct);
  record("S5", "normal AC loss percentage basis", {acPowerKW,maxActivePowerKW,voltage,pf,length,cableSizeMm2:cable.sizeMm2,lossW}, baselinePct, expectedPct, expectedPct, "v2.1 detailed design accumulates totalAcSizingPowerKW and uses it as the loss-percent denominator.");
}

// Scenario 6: edge uneven inverter loading - clip per inverter, not at plant aggregate.
{
  const net = new Map([[1,35],[2,5]]);
  const fixed = newEnergy.calculatePerInverterClipping(net,1,27.5,50);
  const baselineClipped=Math.min(40,50);
  const baselineClip=40-baselineClipped;
  const expectedAc=Math.min(35,27.5)+Math.min(5,27.5);
  const expectedClip=40-expectedAc;
  approx(fixed.inverterClippedKW, expectedAc, 1e-12, "per-inverter clipped AC");
  approx(fixed.clippingKW, expectedClip, 1e-12, "per-inverter clipping");
  record("S6", "edge uneven inverter clipping", {inverter1NetDcKW:35,inverter2NetDcKW:5,perInverterLimitKW:27.5}, baselineClip, expectedClip, fixed.clippingKW, "Plant-level clipping incorrectly lets spare capacity on inverter 2 mask clipping on inverter 1.");
}

// Scenario 6b: inverter max-active capability must be used for clipping, not lower nominal AC rating.
{
  const net = new Map([[1,26]]);
  const fixed = newEnergy.calculatePerInverterClipping(net,1,27.5,25);
  const baselineClip = 26-Math.min(26,25);
  const expectedClip = 0;
  approx(fixed.clippingKW, expectedClip, 1e-12, "max-active clipping");
  record("S6B", "edge max-active clipping basis", {netDcKW:26,ratedAcKW:25,maxActivePowerKW:27.5}, baselineClip, expectedClip, fixed.clippingKW, "The selected inverter can export 27.5 kW active power, so 26 kW must not be clipped at the lower 25 kW nominal rating.");
}

// Scenario 7: unusual 50% direct-beam obstruction with diffuse + ground light.
{
  const args={dcCapacityKW:10,poaBeamKWm2:0.8,poaDiffuseKWm2:0.15,poaGroundKWm2:0.05,ambientTempC:25,noctC:45,gammaPmax:0,geometryShadeFraction:0.5};
  const fixed=newEnergy.calculateGeometryAdjustedGroupPower(args);
  const baseline=10*(0.8+0.15+0.05)*(1-0.5);
  const expected=10*((1-0.5)*(1.0)+0.5*(0.15+0.05));
  approx(fixed.geometryAdjustedKW, expected, 1e-12, "beam-only shade power");
  record("S7", "unusual direct-beam geometry shade", args, baseline, expected, fixed.geometryAdjustedKW, "3D ray blockage applies to direct beam only; diffuse and ground-reflected irradiance remain on the shaded fraction.");
}

// Scenario 7b: clipping percentage denominator must be pre-clipping inverter energy.
{
  const inverterUnclipped=100, clipping=10, finalAcAfterOtherLosses=87.318;
  const baseline=clipping/(finalAcAfterOtherLosses+clipping)*100;
  const expected=10;
  const fixed=newEnergy.calculateClippingPercent(clipping,inverterUnclipped);
  approx(fixed,expected,1e-12,"clipping percent");
  record("S7B", "normal clipping-percent denominator", {inverterUnclipped,clipping,finalAcAfterOtherLosses}, baseline, expected, fixed, "Clipping fraction is the energy removed by clipping divided by inverter energy immediately before clipping; downstream AC/availability losses must not change that percentage.");
}

// Scenario 8: ground-mount portrait row pitch uses actual Grid-U chord, not always module length.
{
  const width=1.134,height=2.382,tilt=25,elev=20;
  const oldPitch=height*Math.cos(tilt*Math.PI/180)+height*Math.sin(tilt*Math.PI/180)/Math.tan(elev*Math.PI/180);
  const dims=newLayout.getPanelGridDimensions(width,height,"Portrait");
  const fixed=newLayout.calculateGroundNoShadowPitch(dims.width,tilt,elev);
  const expected=width*Math.cos(tilt*Math.PI/180)+width*Math.sin(tilt*Math.PI/180)/Math.tan(elev*Math.PI/180);
  approx(fixed,expected,1e-12,"portrait pitch");
  record("S8", "normal portrait ground pitch", {width,height,tilt,elev}, oldPitch, expected, fixed, "v2.1 shares the same Grid-U panel dimension used by the layout engine.");
}

// Scenario 9: financial edge case with >1000% valid IRR.
{
  const cashflows=[-100,1600];
  const baseline=null; // old hard upper bracket = 10 (1000%), so no bracket for 1500% IRR.
  const fixed=newFinance.calculateIrr(cashflows);
  const expected=15;
  approx(fixed,expected,1e-10,"IRR");
  record("S9", "extreme but valid IRR", {cashflows}, baseline, expected, fixed, "Dynamic bracketing finds the 1500% root; old fixed 1000% ceiling returned N/A.");
}

// Scenario 10: capacity factor convention uses AC nameplate capacity.
{
  const annualKWh=160000, dcKW=120, acKW=100;
  const baseline=annualKWh/(dcKW*8760);
  const expected=annualKWh/(acKW*8760);
  const fixed=newEnergy.calculateAcCapacityFactor(annualKWh,acKW);
  approx(fixed,expected,1e-12,"AC capacity factor");
  record("S10", "normal capacity-factor denominator", {annualKWh,dcKW,acKW}, baseline, expected, fixed, "Capacity factor is reported on AC nameplate capacity; DC kWp remains the denominator for specific yield and PR.");
}

// Scenario 11: multiple-sign-change cash flow must not pretend one of several IRRs is unique.
{
  const cashflows=[-100,360,-431,171.6]; // roots at approximately 10%, 20%, and 30%
  const oldNpv=(rate)=>cashflows.reduce((sum,cf,year)=>sum+cf/Math.pow(1+rate,year),0);
  let low=-0.99,high=10,fLow=oldNpv(low),fHigh=oldNpv(high),baseline=null;
  if (Number.isFinite(fLow)&&Number.isFinite(fHigh)&&fLow*fHigh<=0) {
    for(let i=0;i<120;i++) {
      const mid=(low+high)/2,fMid=oldNpv(mid);
      if(Math.abs(fMid)<1e-8){baseline=mid;break;}
      if(fLow*fMid<=0){high=mid;fHigh=fMid;}else{low=mid;fLow=fMid;}
    }
    if(baseline===null) baseline=(low+high)/2;
  }
  approx(baseline,0.3,1e-7,"legacy arbitrary IRR root");
  const fixed=newFinance.calculateIrr(cashflows);
  assert.strictEqual(fixed,null);
  record("S11", "unusual multiple-IRR cash flow", {cashflows}, baseline, null, fixed, "The old bracketed solver reports the ~30% root even though the same cash flow also has ~10% and ~20% IRRs; v2.1 reports N/A instead of implying uniqueness.");
}

// Scenario 11b: fractional analysis periods must be rejected rather than silently rounded.
{
  const rawYears=20.6;
  const baseline=Math.round(rawYears);
  const fixed=newFinance.isValidAnalysisYears(rawYears);
  assert.strictEqual(fixed,false);
  assert.strictEqual(newFinance.isValidAnalysisYears(1),true);
  assert.strictEqual(newFinance.isValidAnalysisYears(50),true);
  record("S11B", "edge fractional finance horizon", {analysisYears:rawYears}, baseline, "invalid input", "invalid input", "v2.0 rounded 20.6 years to 21; v2.1 requires an explicit integer year horizon from 1 through 50.");
}

// Scenario 12: stale prior-site irradiation must never be reused as a fallback after coordinates change.
{
  const dcKW=100, staleGhi=1800, pr=0.80;
  const baseline=dcKW*staleGhi*pr;
  const fixed=newFinance.calculateSimpleAnnualEnergyFallback(dcKW,staleGhi,"stale-resource",false,pr);
  assert.strictEqual(fixed,null);
  record("S12", "edge stale-resource energy fallback", {dcKW,staleGhi,irradiationSource:"stale-resource",hasMonthlyResource:false,pr}, baseline, null, fixed, "v2.1 refuses to generate annual energy/finance output from GHI tied to the previous project coordinates.");
}

// Scenario 13: an intentional manual no-resource fallback remains deterministic.
{
  const dcKW=100, manualGhi=1600, pr=0.80;
  const fixed=newFinance.calculateSimpleAnnualEnergyFallback(dcKW,manualGhi,"manual",false,pr);
  const expected=128000;
  assert.strictEqual(fixed,expected);
  record("S13", "normal manual no-resource fallback", {dcKW,manualGhi,irradiationSource:"manual",hasMonthlyResource:false,pr}, expected, expected, fixed, "The explicit simplified PR fallback remains available when the user intentionally supplies annual GHI and no monthly resource is loaded.");
}

// Static integration assertions ensure the corrected pure math is actually wired into runtime.
const electricalSource=fs.readFileSync(path.join(root,"solar_pv_design_platform_v2.1_electrical.js"),"utf8");
const energySource=fs.readFileSync(path.join(root,"solar_pv_design_platform_v2.1_energy.js"),"utf8");
const indexSource=fs.readFileSync(path.join(root,"index.html"),"utf8");
assert.match(electricalSource,/operatingVoltageV:\s*Math\.max\(string\.vmpHotV/);
assert.match(electricalSource,/const operatingVoltageV = Math\.min\(\.\.\.strings\.map\(string => string\.vmpHotV\)\)/);
assert.match(electricalSource,/const acLossPct = totalAcSizingPowerKW > 0/);
assert.match(electricalSource,/compatibleKey = `\$\{string\.groupKey\}\|modules:\$\{string\.moduleCount\}`/);
assert.match(energySource,/calculatePerInverterClipping\(netDcByInverter/);
assert.match(energySource,/const capacityFactor = calculateAcCapacityFactor\(annual\.acEnergy, totalAcCapacityKW\)/);
assert.match(energySource,/calculateClippingPercent\(annual\.clipping, annual\.inverterUnclipped\)/);
assert.match(indexSource,/calculateEnergySimulation\(dcCapacityKW, totalAcCapacityKW, module, inverter\)/);
assert.match(indexSource,/analysisYears: Number\(document\.getElementById\("financeAnalysisYears"\)/);
assert.match(indexSource,/isValidAnalysisYears\(inputs\.analysisYears\)/);
assert.match(indexSource,/solar_pv_design_platform_v2\.1_finance\.js/);
assert.match(indexSource,/calculateSimpleAnnualEnergyFallback\(dcCapacityKW, irradiation, irradiationValueSource/);

console.log(JSON.stringify({suite:"v2.1 calculation regression",passed:results.length,results},null,2));
