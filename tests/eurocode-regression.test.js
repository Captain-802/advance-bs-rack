"use strict";

const assert = require("node:assert/strict");

require("../engines/standards/eurocode-load-cases.js");
require("../engines/standards/eurocode-mcr-engine.js");
require("../engines/standards/eurocode-engine.js");

const LOADS = globalThis.RACK_EUROCODE_LOAD_CASES;
const MCR = globalThis.RACK_EUROCODE_MCR_ENGINE;
const EC3 = globalThis.RACK_EUROCODE_ENGINE;

function close(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, message + ": " + actual + " vs " + expected);
}

function uc203() {
  return {
    label: "UC 203 x 203 x 71",
    family: "H",
    groupId: "UC",
    A_cm2: 90.4,
    Wply_cm3: 799,
    Wely_cm3: 706,
    Wplz_cm3: 374,
    Welz_cm3: 246,
    iy_cm: 9.18,
    iz_cm: 5.30,
    IyPhysical_cm4: 7620,
    IzPhysical_cm4: 2540,
    Iy_cm4: 7620,
    Iz_cm4: 2540,
    IT_cm4: 80.2,
    Iw_dm6: 0.25,
    h: 215.8,
    b: 206.4,
    tw: 10,
    tf: 17.3,
    t: 0,
    d_fillets: 160.8,
    rFillet: 10.2,
    tgov: 17.3,
    mass: 71
  };
}

function pfc230() {
  return {
    label: "PFC 230 x 75 x 26",
    family: "channel",
    groupId: "PFC",
    A_cm2: 32.7,
    Wply_cm3: 278,
    Wely_cm3: 239,
    Wplz_cm3: 63.2,
    Welz_cm3: 34.8,
    iy_cm: 9.17,
    iz_cm: 2.35,
    IyPhysical_cm4: 2750,
    IzPhysical_cm4: 181,
    Iy_cm4: 2750,
    Iz_cm4: 181,
    IT_cm4: 11.8,
    Iw_dm6: 0.0153,
    y0: 47.54,
    h: 230,
    b: 75,
    tw: 6.5,
    tf: 12.5,
    t: 0,
    d_fillets: 181,
    rFillet: 12,
    tgov: 12.5,
    mass: 25.7
  };
}

function ub356() {
  return {
    label: "UB 356 x 171 x 51",
    family: "I",
    groupId: "UB",
    A_cm2: 64.9,
    Wply_cm3: 896,
    Wely_cm3: 796,
    Wplz_cm3: 174,
    Welz_cm3: 113,
    iy_cm: 14.8,
    iz_cm: 3.86,
    IyPhysical_cm4: 14100,
    IzPhysical_cm4: 968,
    Iy_cm4: 14100,
    Iz_cm4: 968,
    IT_cm4: 23.8,
    Iw_dm6: 0.286,
    h: 355,
    b: 171.5,
    tw: 7.4,
    tf: 11.5,
    t: 0,
    d_fillets: 311.6,
    rFillet: 10.2,
    tgov: 11.5,
    mass: 51
  };
}

function inputFor(sec, axis) {
  return {
    grade: "S355",
    py: EC3.fyEC3("S355", sec.tgov),
    H: 3600,
    combo: "regression",
    Kx: 2,
    Ky: 0.667,
    KyMajor: 2,
    KzMinor: 0.667,
    KT: 2,
    KLT: 1,
    KLTOverride: 1,
    cantileverLTB: true,
    mcrMethod: "fe",
    rootWarpingRestrained: false,
    columnTopFree: true,
    columnBaseFixed: true,
    swayMode: true,
    axis: axis || "major",
    ltbRoot: "lat-torsion",
    ltbTip: "free",
    ltbDestabilizing: false,
    pfcTorsionConfirmed: false,
    F: 29.92,
    Fv: 17,
    Mx: 61.489,
    M2: 50,
    M3: 40,
    M4: 20,
    momentSegments: [
      { y1: 0, y2: 900, M1: -61.489, M2: -50 },
      { y1: 900, y2: 1800, M1: -50, M2: -40 },
      { y1: 1800, y2: 2700, M1: -40, M2: -20 },
      { y1: 2700, y2: 3600, M1: -20, M2: 0 }
    ],
    cmYBracePoints: [0, 3600],
    cmZBracePoints: [0, 3600],
    cmLTBracePoints: [0, 3600],
    sec: sec
  };
}

assert.equal(EC3.fyEC3("S355", 90), 315);
assert.equal(EC3.fyEC3("S355", 120), 295);
assert.equal(EC3.fyEC3("S275", 90), 235);
assert.equal(EC3.fyEC3("S275", 120), 225);
assert.equal(EC3.fyEC3("S235", 120), 195);
assert.equal(EC3.fyEC3("S355", 251), null);

assert.deepEqual(EC3.ec3StrutCurves("H", 300, 300, 50), { y: "b", z: "c" });
assert.deepEqual(EC3.ec3StrutCurves("H", 600, 200, 110), { y: "d", z: "d" });
assert.deepEqual(EC3.ec3StrutCurves("H", 600, 200, 30), { y: "a", z: "b" });

assert.deepEqual(MCR.cantileverFactors("lat-torsion", "free", false), {
  root: "lat-torsion", tip: "free", k: 1, D: 1, destabilizing: false
});
assert.equal(MCR.cantileverFactors("top-lateral", "free", true).k, 3);
assert.equal(MCR.cantileverFactors("top-lateral", "free", true).D, 2.5);
assert.equal(MCR.cantileverFactors("full", "lat-torsion", true).D, 1);

const sn = MCR.mcrSN003({ L: 6000, Iz: 25.4e6, It: 0.802e6, Iw: 0.25e12, C1: 1.5, k: 1, kw: 1 });
const ncrz = Math.PI * Math.PI * MCR.E * 25.4e6 / (6000 * 6000);
const snExpected = 1.5 * ncrz * Math.sqrt(0.25e12 / 25.4e6 + MCR.G * 0.802e6 / ncrz);
close(sn.Mcr, snExpected, 1e-6, "SN003 algebra");

const cant225 = MCR.cantileverEquivalent({ L: 3600, A: 9040, Wpl: 799e3, Wy: 799e3, Iz: 25.4e6, Iw: 0.25e12, iz: 53, fy: 225, root: "lat-torsion", tip: "free" });
const cant345 = MCR.cantileverEquivalent({ L: 3600, A: 9040, Wpl: 799e3, Wy: 799e3, Iz: 25.4e6, Iw: 0.25e12, iz: 53, fy: 345, root: "lat-torsion", tip: "free" });
close(cant225.Mcr, cant345.Mcr, 1e-4, "Elastic Mcr must be independent of fy");
assert.equal(cant225.C1, 1);
assert.equal(cant225.V, 1);

const uls = LOADS.ulsCases("610ab", { psi0: 1 });
assert.equal(uls.length, 2);
close(uls[0].gammaG, 1.35, 1e-12, "6.10a gammaG");
close(uls[1].gammaG, 1.24875, 1e-12, "6.10b gammaG");
assert.deepEqual(LOADS.slsCase("q-only"), {
  id: "q-only", gammaG: 0, gammaQ: 1, label: "UK NA deflection: variable action only, 0G + 1.000Q"
});

const linearReverse = EC3.equivalentMomentFactor([
  { y1: 0, y2: 1000, M1: 100, M2: -100 }
], [0, 1000], 1000);
close(linearReverse.value, 0.4, 1e-12, "Table B.3 linear reverse-curvature factor");

const endGoverned = EC3.equivalentMomentFactor([
  { y1: 0, y2: 500, M1: 100, M2: 25 },
  { y1: 500, y2: 1000, M1: 25, M2: 0 }
], [0, 1000], 1000);
close(endGoverned.value, 0.4, 1e-12, "Table B.3 concentrated-load end-governed factor");
assert.equal(endGoverned.alphaName, "alpha_s");

const interiorGoverned = EC3.equivalentMomentFactor([
  { y1: 0, y2: 500, M1: 20, M2: 100 },
  { y1: 500, y2: 1000, M1: 100, M2: 0 }
], [0, 1000], 1000);
close(interiorGoverned.value, 0.92, 1e-12, "Table B.3 concentrated-load interior-governed factor");
assert.equal(interiorGoverned.alphaName, "alpha_h");

const basePlateau = EC3.equivalentMomentFactor([
  { y1: 0, y2: 250, M1: 100, M2: 100 },
  { y1: 250, y2: 1000, M1: 50, M2: 0 }
], [0, 1000], 1000);
close(basePlateau.Ms, 100 / 3, 1e-12, "Table B.3 Ms must be the signed mid-span moment, not the largest interior plateau value");
close(basePlateau.value, 0.2 + 0.8 / 3, 1e-12, "Table B.3 plateau must not force alpha_s to one");
close(basePlateau.MsAt, 500, 1e-12, "Table B.3 Ms location");

const masterLength = 3600;
const masterMomentSegments = [
  { y1: 0, y2: masterLength / 2, M1: -42.6, M2: -31.8 },
  { y1: masterLength / 2, y2: masterLength, M1: -31.8, M2: 0 }
];
const masterC1 = MCR.masterSeriesC1({ L: masterLength, momentSegments: masterMomentSegments });
close(masterC1.M0, -10.5, 1e-12, "MasterSeries M0 decomposition");
close(masterC1.mu, 0.2464788732, 1e-9, "MasterSeries mu decomposition");
close(masterC1.C1, 1.39318068, 1e-8, "MasterSeries-style C1");
assert.ok(Math.abs(masterC1.C1 - 1.390) < 0.005, "C1 must reproduce the rounded MasterSeries benchmark");

const masterNcci = MCR.mcrSN003({
  L: masterLength, Iz: 971.2e4, It: 23.81e4, Iw: 0.2852e12, k: 1, kw: 1, C1: masterC1.C1
});
assert.ok(masterNcci.Mcr / 1e6 > 440 && masterNcci.Mcr / 1e6 < 444, "NCCI benchmark Mcr must match the MasterSeries range");

const fixedFree12 = MCR.mcrEigenFixedFree({
  L: masterLength, Iz: 971.2e4, It: 23.81e4, Iw: 0.2852e12,
  momentSegments: masterMomentSegments, subdivisions: 12
});
const fixedFree32 = MCR.mcrEigenFixedFree({
  L: masterLength, Iz: 971.2e4, It: 23.81e4, Iw: 0.2852e12,
  momentSegments: masterMomentSegments, subdivisions: 32
});
close(fixedFree12.Mcr, fixedFree32.Mcr, fixedFree32.Mcr * 2e-5, "Fixed-free FE Mcr mesh convergence");
assert.equal(fixedFree32.topFree, true);
assert.ok(fixedFree32.Mcr < masterNcci.Mcr, "A free-tip FE model must not inherit the NCCI fork-end stiffness");

const forkEnded32 = MCR.mcrEigen({
  L: masterLength, Iz: 971.2e4, It: 23.81e4, Iw: 0.2852e12,
  momentSegments: masterMomentSegments, subdivisions: 32,
  rootRestraints: { v: true, slope: false, twist: true, warping: false },
  tipRestraints: { v: true, slope: false, twist: true, warping: false }
});
assert.ok(forkEnded32.method.includes("user-defined end restraints"));
assert.deepEqual(forkEnded32.rootRestraints, { v: true, slope: false, twist: true, warping: false });
assert.deepEqual(forkEnded32.tipRestraints, { v: true, slope: false, twist: true, warping: false });
assert.equal(forkEnded32.topFree, false);
assert.ok(forkEnded32.Mcr > fixedFree32.Mcr, "Declared fork restraints at both ends must change the FE eigenvalue");

const major = EC3.designColumnEC3(inputFor(uc203(), "major"));
const minor = EC3.designColumnEC3(inputFor(uc203(), "minor"));
assert.equal(major.status, "PASS");
assert.equal(major.derived.mcrMethod, "1D Vlasov FE eigenvalue; fixed root, free tip");
assert.equal(major.derived.feMcrResult.topFree, true);
close(major.derived.NcrY, minor.derived.NcrY, 1e-9, "Physical NcrY must not swap with bending axis");
close(major.derived.NcrZ, minor.derived.NcrZ, 1e-9, "Physical NcrZ must not swap with bending axis");
close(major.derived.NbT, minor.derived.NbT, 1e-9, "Torsional compression check must run for both bending axes");
assert.ok(major.derived.UMy > 0 && major.derived.UMz === 0);
assert.ok(minor.derived.UMy === 0 && minor.derived.UMz > 0);
assert.ok(major.derived.Cmy < 1 && major.derived.Cmy >= 0.4);
assert.ok(major.derived.CmLT < 1 && major.derived.CmLT >= 0.4);
close(major.derived.Cmy, 0.9, 1e-12, "Table B.3 major-axis sway override");
close(major.derived.CmyDiagram, major.derived.CmLT, 1e-12, "Underlying diagram factors must match when their y-y diagram and braced intervals are identical");
close(major.derived.Cmz, 1, 1e-12, "Cmz must be one when no minor-axis moment is present");
close(minor.derived.Cmz, 0.9, 1e-12, "Table B.3 minor-axis sway override");
assert.ok(major.derived.kzy < 1 && major.derived.kzy > 0);

const nonswayInput = inputFor(uc203(), "major");
nonswayInput.swayMode = false;
const nonswayMajor = EC3.designColumnEC3(nonswayInput);
close(nonswayMajor.derived.Cmy, nonswayMajor.derived.CmLT, 1e-12, "Non-sway Cmy and CmLT must match for identical diagrams and braced intervals");

const ncciInput = inputFor(uc203(), "major");
ncciInput.mcrMethod = "ncci";
const ncciMajor = EC3.designColumnEC3(ncciInput);
assert.ok(ncciMajor.derived.mcrMethod.includes("NCCI SN003 / MasterSeries-style C1"));
close(ncciMajor.derived.C1, MCR.masterSeriesC1({ L: ncciInput.H, momentSegments: ncciInput.momentSegments }).C1, 1e-12, "NCCI route must use diagram-derived C1");
assert.equal(ncciMajor.status, "UNVERIFIED");
assert.ok(ncciMajor.issues.some((issue) => issue.includes("requires lateral and torsional restraint at both member ends")));

const nonFixedFeInput = inputFor(uc203(), "major");
nonFixedFeInput.columnBaseFixed = false;
const nonFixedFe = EC3.designColumnEC3(nonFixedFeInput);
assert.equal(nonFixedFe.status, "UNVERIFIED");
assert.ok(nonFixedFe.issues.some((issue) => issue.includes("requires a fixed column base")));

const explicitBoundaryK1Input = inputFor(uc203(), "major");
explicitBoundaryK1Input.columnBaseFixed = false;
explicitBoundaryK1Input.Kx = explicitBoundaryK1Input.KyMajor = 1.0;
explicitBoundaryK1Input.mcrRootRestraints = { v: true, slope: false, twist: true, warping: false };
explicitBoundaryK1Input.mcrTipRestraints = { v: true, slope: false, twist: true, warping: false };
const explicitBoundaryK1 = EC3.designColumnEC3(explicitBoundaryK1Input);
assert.ok(!explicitBoundaryK1.issues.some((issue) => issue.includes("requires a fixed column base")));
assert.ok(explicitBoundaryK1.derived.feMcrResult && explicitBoundaryK1.derived.feMcrResult.Mcr > 0);

const explicitBoundaryK26Input = Object.assign({}, explicitBoundaryK1Input, { Kx: 2.6, KyMajor: 2.6 });
const explicitBoundaryK26 = EC3.designColumnEC3(explicitBoundaryK26Input);
close(explicitBoundaryK26.derived.Mcr, explicitBoundaryK1.derived.Mcr, explicitBoundaryK1.derived.Mcr * 1e-12,
  "Manual compression effective length must not silently alter the declared FE Mcr boundary");
assert.ok(explicitBoundaryK26.derived.NcrY < explicitBoundaryK1.derived.NcrY,
  "Manual compression effective length must still alter the flexural buckling resistance model");

const ubCombined = EC3.designColumnEC3(inputFor(ub356(), "major"));
assert.notEqual(ubCombined.status, "UNVERIFIED");
assert.ok(!ubCombined.issues.some((issue) => issue.includes("Class 4")));
const ubCompressionOnly = EC3.classifyEC3(ub356(), 275, 29.92e3, 0, 0, "major");
assert.equal(ubCompressionOnly.cls, "Class 4");

const pfcInput = inputFor(pfc230(), "major");
const pfcUnconfirmed = EC3.designColumnEC3(pfcInput);
assert.equal(pfcUnconfirmed.status, "UNVERIFIED");
assert.ok(pfcUnconfirmed.issues.some((issue) => issue.includes("PFC bending requires confirmation")));
const pfcMinorUnconfirmed = EC3.designColumnEC3(inputFor(pfc230(), "minor"));
assert.equal(pfcMinorUnconfirmed.status, "UNVERIFIED");
pfcInput.pfcTorsionConfirmed = true;
const pfcConfirmed = EC3.designColumnEC3(pfcInput);
assert.notEqual(pfcConfirmed.status, "UNVERIFIED");
assert.ok(pfcConfirmed.derived.NcrTF > 0);

const slenderSec = Object.assign({}, uc203(), { tw: 1.5, tf: 2, d_fillets: 205, rFillet: 0 });
const slender = EC3.designColumnEC3(inputFor(slenderSec, "major"));
assert.equal(slender.status, "UNVERIFIED");
assert.ok(slender.issues.some((issue) => issue.includes("Class 4")));

const highShearInput = inputFor(uc203(), "major");
highShearInput.Fv = 350;
const highShear = EC3.designColumnEC3(highShearInput);
assert.ok(highShear.derived.rho > 0);
assert.ok(highShear.derived.McY < 799e3 * 345 / 1e6);

const coldBox = {
  label: "SHS-CF test", family: "box-cf", groupId: "SHSCF", coldFormed: true,
  A_cm2: 57.6, Wply_cm3: 524, Wely_cm3: 454, Wplz_cm3: 524, Welz_cm3: 454,
  iy_cm: 9.92, iz_cm: 9.92, IyPhysical_cm4: 5670, IzPhysical_cm4: 5670,
  Iy_cm4: 5670, Iz_cm4: 5670, IT_cm4: 8840, Iw_dm6: 0,
  h: 250, b: 250, tw: 0, tf: 0, t: 6, d_fillets: 0, rFillet: 0, tgov: 6
};
const cold = EC3.designColumnEC3(inputFor(coldBox, "major"));
assert.equal(cold.status, "UNVERIFIED");
assert.ok(cold.issues.some((issue) => issue.includes("EN 1993-1-3")));

console.log("Eurocode regression checks passed.");
