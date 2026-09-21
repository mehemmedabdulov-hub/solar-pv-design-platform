"use strict";

/* Solar PV Design Platform v2.1 - deterministic finance helpers. */

function npvForRate(cashflows, rate) {
  return cashflows.reduce((sum, cf, year) => sum + cf / Math.pow(1 + rate, year), 0);
}


function isValidAnalysisYears(value) {
  const years = Number(value);
  return Number.isInteger(years) && years >= 1 && years <= 50;
}

function calculateSimpleAnnualEnergyFallback(dcCapacityKW, annualGhiKWhM2, irradiationSource, hasMonthlyResource, performanceRatio = 0.80) {
  const dc = Number(dcCapacityKW);
  const ghi = Number(annualGhiKWhM2);
  const pr = Number(performanceRatio);
  // The 80% shortcut is only a user-selected/manual no-resource fallback. Never
  // reuse stale site data or hide a failed monthly simulation behind this estimate.
  if (hasMonthlyResource || irradiationSource !== "manual") return null;
  if (!(dc > 0) || !(ghi > 0) || !Number.isFinite(pr) || pr <= 0 || pr > 1) return null;
  return dc * ghi * pr;
}

function calculateIrr(cashflows) {
  if (!cashflows?.length || !cashflows.some(x => x > 0) || !cashflows.some(x => x < 0)) return null;
  const signs = cashflows.filter(value => Math.abs(value) > 1e-12).map(value => Math.sign(value));
  const signChanges = signs.slice(1).reduce((count, sign, index) => count + (sign !== signs[index] ? 1 : 0), 0);
  // Multiple sign changes can yield multiple IRRs. Returning N/A is safer than
  // selecting one root without an explicit multiple-root policy.
  if (signChanges !== 1) return null;

  let low = -0.999999;
  let high = 1;
  let fLow = npvForRate(cashflows, low);
  let fHigh = npvForRate(cashflows, high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh)) return null;
  while (fLow * fHigh > 0 && high < 1e6) {
    high = high * 2 + 1;
    fHigh = npvForRate(cashflows, high);
    if (!Number.isFinite(fHigh)) return null;
  }
  if (fLow * fHigh > 0) return null;

  for (let i = 0; i < 160; i++) {
    const mid = (low + high) / 2;
    const fMid = npvForRate(cashflows, mid);
    if (!Number.isFinite(fMid)) return null;
    if (Math.abs(fMid) < 1e-10 || Math.abs(high - low) < 1e-12) return mid;
    if (fLow * fMid <= 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

globalThis.SolarPVFinanceEngineModule = Object.freeze({
  version: "2.1.0",
  deterministic: true,
  functions: Object.freeze(["npvForRate", "isValidAnalysisYears", "calculateSimpleAnnualEnergyFallback", "calculateIrr"])
});
