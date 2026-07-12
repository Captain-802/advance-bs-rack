"use strict";

const assert = require("node:assert/strict");

require("../engines/analysis-engine.js");
require("../engines/standards/bs5950-engine.js");
require("../engines/standards/eurocode-mcr-engine.js");

const FE = globalThis.RACK_ANALYSIS_ENGINE;
const BS = globalThis.RACK_BS5950_ENGINE;
const MCR = globalThis.RACK_EUROCODE_MCR_ENGINE;

const model = {
  columnHeight: 3600,
  baseLen: 2400,
  maxReach: 2400,
  E: 210000,
  colSection: { A_mm2: 6500, I_mm4: 14100e4, label: "test column", secH: 355, secB: 171, selfW: 0 },
  baseSection: { A_mm2: 6500, I_mm4: 14100e4, label: "test tie", secH: 355, secB: 171, selfW: 0 },
  arms: [{
    h: 3000,
    len: 2400,
    A: 6500,
    I: 14100e4,
    label: "test arm",
    secH: 355,
    secB: 171,
    selfW: 0,
    w: 0,
    P: 0,
    loads: [{ a: 2400, P: 8000 }]
  }],
  baseUDL: 0,
  baseP: 0,
  baseLoads: [],
  gammaG: 1,
  gammaQ: 1,
  leftSupport: "fixed",
  rightSupport: "pin",
  bottomRelease: "both",
  defScale: 0
};

const frame = FE.buildFrame(model);
const topNode = frame.colNodeAt.get(model.columnHeight);
const topDofs = [0, 1, 2].map((d) => FE.dofIndex(topNode, d));

assert.equal(frame.columnBoundary.base, "fixed");
assert.equal(frame.columnBoundary.top, "free");
topDofs.forEach((d) => assert.equal(frame.restraints[d], false, "column-top FE DOF must be free"));

const result = FE.analyze(frame);
topDofs.forEach((d) => {
  assert.equal(result.restraints[d], false, "solver must not auto-lock a column-top DOF");
  assert.ok(Math.abs(result.R[d]) < 1e-5, "free column-top DOF must not develop a support reaction");
});

const topColumn = result.elements.find((element) => element.type === "column" && element.j === topNode);
assert.ok(topColumn, "top column segment must exist");
assert.ok(Math.abs(topColumn.endForces[4]) < 1e-5, "free column tip shear must be zero");
assert.ok(Math.abs(topColumn.endForces[5]) < 1e-5, "free column tip moment must be zero");

const stitched = BS.stitchColumn(result, FE.diagramValue);
assert.ok(stitched.momentSegments.length > 1, "signed column segments must reach the design layer");
const eigen = MCR.mcrEigenFixedFree({
  L: stitched.H,
  Iz: 971.2e4,
  It: 23.81e4,
  Iw: 0.2852e12,
  momentSegments: stitched.momentSegments,
  subdivisions: 16
});
assert.equal(eigen.topFree, true);
assert.ok(eigen.Mcr > 0 && eigen.C1 > 0, "fixed-free FE Mcr and C1 must be available from the solved frame diagram");

const swl = FE.calculateDeltaSWL(model);
assert.equal(swl.ok, true, "Delta SWL should be available for a cantilever model");
assert.equal(swl.limit, model.columnHeight / 150, "Delta SWL must use the H/150 limit");
assert.ok(swl.allowable > 0, "Delta SWL must return a positive characteristic point-load capacity");

// Permanent member self-weight is always controlled by gammaG: 1.0 is the
// full characteristic value and 0.0 removes it without a separate switch.
const selfWeightModel = {
  ...model,
  colSection: { ...model.colSection, selfW: 0.5 },
  baseSection: { ...model.baseSection, selfW: 0.25 },
  arms: model.arms.map((arm) => ({ ...arm, selfW: 0.2, loads: [], P: 0 })),
  gammaQ: 0
};
const noG = FE.buildFrame({ ...selfWeightModel, gammaG: 0 });
const fullG = FE.buildFrame({ ...selfWeightModel, gammaG: 1 });
assert.ok(noG.F.every((value) => Math.abs(value) < 1e-12), "G=0 must remove nodal self-weight");
assert.ok(noG.elements.every((element) => Math.abs(element.qLocalY) < 1e-12), "G=0 must remove distributed self-weight");
assert.ok(fullG.F.some((value) => value < 0), "G=1 must apply full column self-weight");
assert.ok(fullG.elements.some((element) => element.type !== "column" && element.qLocalY < 0), "G=1 must apply full beam self-weight");

console.log("Fixed-free column boundary checks passed.");
