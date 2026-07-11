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
  includeSW: false,
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

console.log("Fixed-free column boundary checks passed.");
