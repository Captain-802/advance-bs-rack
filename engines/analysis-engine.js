"use strict";

/* =====================================================================
   RackFrame2D Pro — application logic
   Solver core (analyze/buildFrame/condensation/interpolation) is identical
   to the verified RackFrame2D build. Only the input + output layers change.
   ===================================================================== */

const DOF = ["Ux", "Uy", "Rz"];
const $ = (id) => document.getElementById(id);
let lastResult = null;
let lastDefl = null;
let systemForce = "M";
const ANIM = { on: false, phase: 1, raf: 0, t0: 0 };
let DEFMULT = 1;
let VB = [0, 0, 1000, 620];
let modelFitPending = true;
let SELMEM = null;
let EXTRUDE = false;
let COLSEC = { group: "UC", designation: "", axis: "major" };
let BASESEC = { group: "UB", designation: "", axis: "major" };
let ARMS = [];
let armSeq = 0;
let BASELOADS = [];

const N_TO_KN = 1 / 1000;
const NMM_TO_KNM = 1 / 1e6;
const MM4_PER_CM4 = 1e4;
const MM2_PER_CM2 = 1e2;

/* ---------------- Section library ---------------- */
const SECTION_GROUPS = [
  { id: "UB", short: "UB", label: "Universal Beams", global: "UNIVERSAL_BEAMS_DATASET", kind: "I",
    iyKey: "second_moment_area_Iy_cm4", izKey: "second_moment_area_Iz_cm4",
    welyKey: "elastic_modulus_Wely_cm3", welzKey: "elastic_modulus_Welz_cm3",
    wplyKey: "plastic_modulus_Wply_cm3", wplzKey: "plastic_modulus_Wplz_cm3",
    iyrKey: "radius_gyration_iy_cm", izrKey: "radius_gyration_iz_cm", itKey: "torsional_constant_IT_cm4" },
  { id: "UC", short: "UC", label: "Universal Columns", global: "UNIVERSAL_COLUMNS_DATASET", kind: "I",
    iyKey: "second_moment_area_Iy_cm4", izKey: "second_moment_area_Iz_cm4",
    welyKey: "elastic_modulus_Wely_cm3", welzKey: "elastic_modulus_Welz_cm3",
    wplyKey: "plastic_modulus_Wply_cm3", wplzKey: "plastic_modulus_Wplz_cm3",
    iyrKey: "radius_gyration_iy_cm", izrKey: "radius_gyration_iz_cm", itKey: "torsional_constant_IT_cm4" },
  { id: "RHS", short: "RHS", label: "Rect. Hollow", global: "HOT_ROLLED_RHS_DATASET", kind: "box",
    iyKey: "second_moment_area_Iy_cm4", izKey: "second_moment_area_Iz_cm4",
    welyKey: "elastic_modulus_Wely_cm3", welzKey: "elastic_modulus_Welz_cm3",
    wplyKey: "plastic_modulus_Wply_cm3", wplzKey: "plastic_modulus_Wplz_cm3",
    iyrKey: "radius_gyration_iy_cm", izrKey: "radius_gyration_iz_cm",
    itKey: "torsion_constant_IT_cm4", sizeKey: "size_hxb_mm", thickKey: "thickness_t_mm" },
  { id: "SHS", short: "SHS", label: "Square Hollow", global: "SHS_SECTIONS_DATASET", kind: "box",
    iyKey: "second_moment_area_I_cm4", izKey: "second_moment_area_I_cm4",
    welyKey: "elastic_modulus_Wel_cm3", welzKey: "elastic_modulus_Wel_cm3",
    wplyKey: "plastic_modulus_Wpl_cm3", wplzKey: "plastic_modulus_Wpl_cm3",
    iyrKey: "radius_gyration_i_cm", izrKey: "radius_gyration_i_cm",
    itKey: "torsion_constant_IT_cm4", sizeKey: "size_hxh_mm", thickKey: "thickness_t_mm" },
  { id: "PFC", short: "PFC", label: "Parallel Flange Channel", global: "PFC_BS5950_DATASET", kind: "channel",
    iyKey: "second_moment_area_Iy_cm4", izKey: "second_moment_area_Iz_cm4",
    welyKey: "elastic_modulus_Wely_cm3", welzKey: "elastic_modulus_Welz_cm3",
    wplyKey: "plastic_modulus_Wply_cm3", wplzKey: "plastic_modulus_Wplz_cm3",
    iyrKey: "radius_gyration_iy_cm", izrKey: "radius_gyration_iz_cm", itKey: "torsional_constant_IT_cm4" },
  { id: "SHSCF", short: "SHS-CF", label: "Sq. Hollow (cold-formed)", global: "SHS_CF_BS5950_DATASET", kind: "box",
    iyKey: "second_moment_area_I_cm4", izKey: "second_moment_area_I_cm4",
    welyKey: "elastic_modulus_Wel_cm3", welzKey: "elastic_modulus_Wel_cm3",
    wplyKey: "plastic_modulus_Wpl_cm3", wplzKey: "plastic_modulus_Wpl_cm3",
    iyrKey: "radius_gyration_i_cm", izrKey: "radius_gyration_i_cm",
    itKey: "torsion_constant_IT_cm4", sizeKey: "size_hxh_mm", thickKey: "thickness_t_mm" }
];

function groupCfg(id) { return SECTION_GROUPS.find((g) => g.id === id); }
function groupDataset(id) { return globalThis[groupCfg(id).global]; }
function listDesignations(id) { return groupDataset(id).sections.map((s) => s.section_designation); }

function dimsOf(g, s) {
  if (g.kind === "I") return { kind: "I", h: s.depth_h_mm, b: s.width_b_mm, tw: s.web_thickness_tw_mm, tf: s.flange_thickness_tf_mm };
  if (g.kind === "channel") return { kind: "channel", h: s.depth_h_mm, b: s.width_b_mm, tw: s.web_thickness_tw_mm, tf: s.flange_thickness_tf_mm };
  const parts = String(s[g.sizeKey]).split(/x/i).map((p) => Number(p.trim()));
  const h = parts[0], b = Number.isFinite(parts[1]) ? parts[1] : parts[0];
  return { kind: "box", h, b, t: s[g.thickKey] };
}

function getSection(groupId, designation, axis) {
  const g = groupCfg(groupId);
  const ds = groupDataset(groupId);
  if (!ds) return null;
  if (!ds.byDesignation) { const m = {}; (ds.sections || []).forEach((row) => { m[row.section_designation] = row; }); ds.byDesignation = m; }
  const s = ds.byDesignation[designation];
  if (!s) return null;
  const Iy = s[g.iyKey], Iz = s[g.izKey];
  const I_cm4 = axis === "minor" ? Iz : Iy;
  const A_cm2 = s.area_A_cm2;
  return {
    groupId, group: g.label, short: g.short, kind: g.kind, designation, axis,
    mass: s.mass_per_metre_kg_per_m,
    A_cm2, A_mm2: A_cm2 * MM2_PER_CM2,
    Iy_cm4: Iy, Iz_cm4: Iz, I_cm4, I_mm4: I_cm4 * MM4_PER_CM4,
    Wely: s[g.welyKey], Welz: s[g.welzKey], Wply: s[g.wplyKey], Wplz: s[g.wplzKey],
    iy: s[g.iyrKey], iz: s[g.izrKey], IT_cm4: s[g.itKey],
    dims: dimsOf(g, s), raw: s
  };
}
function sectionFromObj(o) { return o ? getSection(o.group, o.designation, o.axis) : null; }
function dimsFor(o) { const s = sectionFromObj(o); return s ? s.dims : null; }

/* ---------------- Number helpers ---------------- */
function numberValue(id) {
  const value = Number($(id).value);
  if (!Number.isFinite(value)) throw new Error("Invalid number in " + id + ".");
  return value;
}
function uniqueSorted(values) { return [...new Set(values.map((v) => round(v, 8)))].sort((a, b) => a - b); }
function round(value, digits) { const scale = 10 ** digits; return Math.round(value * scale) / scale; }
function fmt(value, digits = 4) {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs > 0 && (abs < 0.001 || abs >= 1000000)) return value.toExponential(3);
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function kpi(v, unit) { return fmt(v) + ' <small>' + unit + '</small>'; }

/* ---------------- Linear algebra (verified) ---------------- */
function zeros(rows, cols) { return Array.from({ length: rows }, () => Array(cols).fill(0)); }
function matVec(A, x) { return A.map((row) => row.reduce((sum, value, i) => sum + value * x[i], 0)); }
function matMul(A, B) {
  const out = zeros(A.length, B[0].length);
  for (let i = 0; i < A.length; i++) for (let k = 0; k < B.length; k++) { if (A[i][k] === 0) continue; for (let j = 0; j < B[0].length; j++) out[i][j] += A[i][k] * B[k][j]; }
  return out;
}
function transpose(A) { return A[0].map((_, c) => A.map((row) => row[c])); }
function pickMatrix(A, rows, cols) { return rows.map((r) => cols.map((c) => A[r][c])); }
function pickVector(v, rows) { return rows.map((r) => v[r]); }
function subMatrix(A, B) { return A.map((row, i) => row.map((value, j) => value - B[i][j])); }
function subVector(a, b) { return a.map((value, i) => value - b[i]); }
function gaussSolve(Ain, bin) {
  const n = bin.length;
  const A = Ain.map((row) => row.slice());
  const b = bin.slice();
  const scale = Math.max(1, ...A.flat().map((v) => Math.abs(v)));
  const pivotTolerance = scale * 1e-13;
  for (let col = 0; col < n; col++) {
    let pivot = col, pivotAbs = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) { const candidate = Math.abs(A[r][col]); if (candidate > pivotAbs) { pivot = r; pivotAbs = candidate; } }
    if (pivotAbs < pivotTolerance) throw new Error("Stiffness matrix is singular or near-singular near equation " + (col + 1) + ".");
    if (pivot !== col) { [A[pivot], A[col]] = [A[col], A[pivot]]; [b[pivot], b[col]] = [b[col], b[pivot]]; }
    for (let r = col + 1; r < n; r++) { const factor = A[r][col] / A[col][col]; if (factor === 0) continue; for (let c = col; c < n; c++) A[r][c] -= factor * A[col][c]; b[r] -= factor * b[col]; }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let sum = b[i]; for (let j = i + 1; j < n; j++) sum -= A[i][j] * x[j]; x[i] = sum / A[i][i]; }
  return x;
}
function transformMatrix(c, s) {
  return [[ c, s, 0, 0, 0, 0], [-s, c, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0], [0, 0, 0, c, s, 0], [0, 0, 0, -s, c, 0], [0, 0, 0, 0, 0, 1]];
}
function frameLocalStiffness(E, A, I, L) {
  const EA = E * A / L, EI = E * I, L2 = L * L, L3 = L2 * L;
  return [
    [ EA, 0, 0, -EA, 0, 0],
    [ 0, 12 * EI / L3, 6 * EI / L2, 0, -12 * EI / L3, 6 * EI / L2],
    [ 0, 6 * EI / L2, 4 * EI / L, 0, -6 * EI / L2, 2 * EI / L],
    [-EA, 0, 0, EA, 0, 0],
    [ 0, -12 * EI / L3, -6 * EI / L2, 0, 12 * EI / L3, -6 * EI / L2],
    [ 0, 6 * EI / L2, 2 * EI / L, 0, -6 * EI / L2, 4 * EI / L]
  ];
}
function uniformEquivalent(q, L) { return [0, q * L / 2, q * L * L / 12, 0, q * L / 2, -q * L * L / 12]; }
function condenseReleases(k, f, releases) {
  const released = [];
  if (releases.rzI) released.push(2);
  if (releases.rzJ) released.push(5);
  const kept = [0, 1, 2, 3, 4, 5].filter((i) => !released.includes(i));
  if (released.length === 0) return { kBar: k.map((row) => row.slice()), fBar: f.slice(), released, kept, releaseData: null };
  const kRR = pickMatrix(k, kept, kept);
  const kRC = pickMatrix(k, kept, released);
  const kCR = pickMatrix(k, released, kept);
  const kCC = pickMatrix(k, released, released);
  const fR = pickVector(f, kept);
  const fC = pickVector(f, released);
  const invTimesKCR = [];
  for (let col = 0; col < kept.length; col++) invTimesKCR.push(gaussSolve(kCC, kCR.map((row) => row[col])));
  const kCCInvKCR = transpose(invTimesKCR);
  const kCond = subMatrix(kRR, matMul(kRC, kCCInvKCR));
  const fCond = subVector(fR, matVec(kRC, gaussSolve(kCC, fC)));
  const kBar = zeros(6, 6);
  const fBar = Array(6).fill(0);
  for (let i = 0; i < kept.length; i++) { fBar[kept[i]] = fCond[i]; for (let j = 0; j < kept.length; j++) kBar[kept[i]][kept[j]] = kCond[i][j]; }
  return { kBar, fBar, released, kept, releaseData: { kCC, kCR, fC } };
}
function expandLocalDisplacements(condensed, dLocal) {
  const d = dLocal.slice();
  if (!condensed.releaseData) return d;
  const dR = pickVector(dLocal, condensed.kept);
  const rhs = subVector(condensed.releaseData.fC, matVec(condensed.releaseData.kCR, dR));
  const dC = gaussSolve(condensed.releaseData.kCC, rhs);
  condensed.released.forEach((dof, i) => d[dof] = dC[i]);
  return d;
}
function dofIndex(nodeId, localDof) { return (nodeId - 1) * 3 + localDof; }
function dofLabel(globalDof) { const node = Math.floor(globalDof / 3) + 1; return "N" + node + " " + DOF[globalDof % 3]; }
function supportRestraints(type) {
  if (type === "fixed") return [true, true, true];
  if (type === "pin") return [true, true, false];
  if (type === "roller-y") return [false, true, false];
  return [false, false, false];
}

/* ---------------- Read UI -> model input ---------------- */
function safeNum(id) { const v = Number($(id).value); return Number.isFinite(v) ? v : 0; }
function readLoads(loadsArr, maxA) {
  return (loadsArr || [])
    .map((l) => ({ a: Math.max(0, Math.min(maxA, round(Number(l.a) || 0, 6))), P: (Number(l.P) || 0) * 1000 }))
    .filter((l) => Math.abs(l.P) > 1e-9);
}
function readModelFromUI() {
  const columnHeight = numberValue("columnHeight");
  const E = numberValue("E");
  const baseLen = numberValue("baseLen");
  if (columnHeight <= 0 || E <= 0) throw new Error("Column height and modulus must be positive.");
  if (baseLen <= 0) throw new Error("Base beam length must be positive.");

  const colSec = sectionFromObj(COLSEC);
  const baseSec = sectionFromObj(BASESEC);
  if (!colSec) throw new Error("Assign a valid column section.");
  if (!baseSec) throw new Error("Assign a valid base-beam section.");

  const arms = [];
  const seen = new Set();
  ARMS.forEach((a) => {
    const h = round(Number(a.h), 8);
    const len = round(Number(a.len) || 0, 6);
    if (!Number.isFinite(h) || h <= 0 || h > columnHeight) return;   // arms strictly above base, within column
    if (seen.has(h)) return;
    seen.add(h);
    if (len <= 0) throw new Error("Each cantilever arm needs a positive length.");
    const sec = sectionFromObj(a);
    if (!sec) throw new Error("A cantilever arm has no valid section assigned.");
    const P = Number(a.P) || 0;
    const pos = Math.max(0, Math.min(len, round(Number(a.pos != null ? a.pos : len), 6)));
    arms.push({ h, len, P: 0, w: 0, A: sec.A_mm2, I: sec.I_mm4, label: sec.short + " " + sec.designation, secH: sec.dims ? sec.dims.h : 0, secB: sec.dims ? sec.dims.b : 0, selfW: sec.mass ? sec.mass * 9.80665 / 1000 : 0, loads: Math.abs(P) > 1e-9 ? [{ a: pos, P: P * 1000 }] : [] });
  });
  if (arms.length === 0) throw new Error("Add at least one cantilever arm with a height between 0 and the column height.");
  const maxReach = Math.max(baseLen, ...arms.map((a) => a.len));

  const includeSW = $("includeSW") ? $("includeSW").checked : true;
  const gammaG = $("gammaG") ? (Number($("gammaG").value) || 0) : 1.35;
  const gammaQ = $("gammaQ") ? (Number($("gammaQ").value) || 0) : 1.5;
  return {
    columnHeight, baseLen, maxReach, E,
    colSection: { A_mm2: colSec.A_mm2, I_mm4: colSec.I_mm4, label: colSec.short + " " + colSec.designation, secH: colSec.dims ? colSec.dims.h : 0, secB: colSec.dims ? colSec.dims.b : 0, selfW: colSec.mass ? colSec.mass * 9.80665 / 1000 : 0 },
    baseSection: { A_mm2: baseSec.A_mm2, I_mm4: baseSec.I_mm4, label: baseSec.short + " " + baseSec.designation, secH: baseSec.dims ? baseSec.dims.h : 0, secB: baseSec.dims ? baseSec.dims.b : 0, selfW: baseSec.mass ? baseSec.mass * 9.80665 / 1000 : 0 },
    arms,
    baseUDL: 0, baseP: 0,
    baseLoads: [],
    includeSW, gammaG, gammaQ,
    leftSupport: $("leftSupport").value, rightSupport: $("rightSupport").value,
    bottomRelease: $("bottomRelease").value, defScale: numberValue("defScale")
  };
}

/* ---------------- Build + analyze (verified) ---------------- */
function buildFrame(input) {
  const armHeights = uniqueSorted(input.arms.map((a) => a.h));
  const levels = uniqueSorted([0, input.columnHeight, ...armHeights]);
  const nodes = [];
  const colNodeAt = new Map();
  levels.forEach((y) => { const node = { id: nodes.length + 1, x: 0, y, label: "C@" + y }; nodes.push(node); colNodeAt.set(y, node.id); });
  const tipNodeAt = new Map();
  const baseTip = { id: nodes.length + 1, x: input.baseLen, y: 0, label: "B@0" };
  nodes.push(baseTip); tipNodeAt.set(0, baseTip.id);
  input.arms.forEach((a) => { const node = { id: nodes.length + 1, x: a.len, y: a.h, label: "A@" + a.h }; nodes.push(node); tipNodeAt.set(a.h, node.id); });

  const elements = [];
  const F = Array(nodes.length * 3).fill(0);
  const marks = [];
  const gQ = input.gammaQ, swF = (input.includeSW ? input.gammaG : 0);
  let selfWeightN = 0;   // unfactored total member self-weight (N), for display

  for (let i = 0; i < levels.length - 1; i++) {
    const y1 = levels[i], y2 = levels[i + 1];
    if (y2 === y1) continue;
    const Lc = Math.abs(y2 - y1);
    elements.push({ id: elements.length + 1, name: "Column " + y1 + "-" + y2, type: "column", i: colNodeAt.get(y1), j: colNodeAt.get(y2), E: input.E, A: input.colSection.A_mm2, I: input.colSection.I_mm4, releases: { rzI: false, rzJ: false }, qLocalY: 0, sectionLabel: input.colSection.label, secH: input.colSection.secH, secB: input.colSection.secB, fullL: Lc, labelHere: true });
    // a vertical column carries its self-weight axially: lump half of each segment's weight at each end node (downward)
    const wseg = (input.colSection.selfW || 0) * Lc;
    selfWeightN += wseg;
    const halfFac = wseg / 2 * swF;
    F[dofIndex(colNodeAt.get(y1), 1)] -= halfFac;
    F[dofIndex(colNodeAt.get(y2), 1)] -= halfFac;
  }

  // Horizontal beam (column->far end) split at any internal point-load positions.
  function addBeam(startId, endId, y, A, I, qLocalY, relStart, relEnd, loads, type, baseName, sectionLabel, endLoadP, L, secH, secB) {
    const x1 = L;
    const all = (loads || []).slice();
    if (endLoadP) all.push({ a: x1, P: endLoadP });
    const inner = [...new Set(all.map((l) => round(l.a, 6)).filter((a) => a > 1e-6 && a < x1 - 1e-6))].sort((p, q) => p - q);
    const posId = new Map(); posId.set(0, startId); posId.set(round(x1, 6), endId);
    inner.forEach((a) => { const node = { id: nodes.length + 1, x: a, y, label: baseName + "@" + Math.round(a) }; nodes.push(node); F.push(0, 0, 0); posId.set(a, node.id); });
    const stops = [0, ...inner, round(x1, 6)];
    const nseg = stops.length - 1;
    for (let k = 0; k < nseg; k++) {
      elements.push({
        id: elements.length + 1,
        name: baseName + (nseg > 1 ? " [" + (k + 1) + "/" + nseg + "]" : ""),
        type, i: posId.get(stops[k]), j: posId.get(stops[k + 1]), E: input.E, A, I,
        releases: { rzI: k === 0 ? !!relStart : false, rzJ: k === nseg - 1 ? !!relEnd : false },
        qLocalY, sectionLabel, secH, secB, fullL: x1, labelHere: k === 0
      });
    }
    all.forEach((l) => {
      const a = Math.max(0, Math.min(x1, round(l.a, 6)));
      const id = posId.has(a) ? posId.get(a) : startId;
      const P = l.P * gQ;
      F[dofIndex(id, 1)] -= P;
      const nd = nodes[id - 1];
      marks.push({ nodeId: id, x: nd.x, y: nd.y, P: P });
    });
  }

  const baseRel = { rzI: input.bottomRelease === "both" || input.bottomRelease === "left", rzJ: input.bottomRelease === "both" || input.bottomRelease === "right" };
  selfWeightN += (input.baseSection.selfW || 0) * input.baseLen;
  const baseQ = -((input.baseUDL || 0) * gQ + (input.baseSection.selfW || 0) * swF);
  addBeam(colNodeAt.get(0), tipNodeAt.get(0), 0, input.baseSection.A_mm2, input.baseSection.I_mm4, baseQ, baseRel.rzI, baseRel.rzJ, input.baseLoads || [], "bottom", "Base beam", input.baseSection.label, input.baseP || 0, input.baseLen, input.baseSection.secH, input.baseSection.secB);
  input.arms.forEach((a) => {
    selfWeightN += (a.selfW || 0) * a.len;
    const armQ = -((a.w || 0) * gQ + (a.selfW || 0) * swF);
    addBeam(colNodeAt.get(a.h), tipNodeAt.get(a.h), a.h, a.A, a.I, armQ, false, false, a.loads || [], "arm", "Arm @" + a.h, a.label, a.P || 0, a.len, a.secH, a.secB);
  });

  const restraints = Array(nodes.length * 3).fill(false);
  const leftNode = colNodeAt.get(0), rightNode = tipNodeAt.get(0);
  supportRestraints(input.leftSupport).forEach((fixed, d) => { if (fixed) restraints[dofIndex(leftNode, d)] = true; });
  supportRestraints(input.rightSupport).forEach((fixed, d) => { if (fixed) restraints[dofIndex(rightNode, d)] = true; });
  const columnTopNode = colNodeAt.get(input.columnHeight);
  const columnTopDofs = [0, 1, 2].map((d) => dofIndex(columnTopNode, d));
  if (columnTopDofs.some((d) => restraints[d])) throw new Error("The free-standing column top must remain unrestrained.");

  // Number the horizontal members from the bottom up: the base beam is Beam 1,
  // then each cantilever arm by ascending height is Beam 2, 3, ...
  const armHeightsAsc = uniqueSorted(input.arms.map((a) => a.h));
  elements.forEach((el) => {
    if (el.type === "bottom") el.beamNo = 1;
    else if (el.type === "arm") {
      const m = el.name.match(/@(\d+(?:\.\d+)?)/);
      const h = m ? Number(m[1]) : null;
      const rank = armHeightsAsc.indexOf(h);
      el.beamNo = rank >= 0 ? rank + 2 : null;
    }
  });

  return {
    input, nodes, elements, F, restraints, colNodeAt, tipNodeAt, armHeights, selfWeightN, pointLoadMarks: marks,
    columnBoundary: { base: input.leftSupport, top: "free", topNode: columnTopNode },
    protectedFreeDofs: columnTopDofs
  };
}

function analyze(frame) {
  const nDof = frame.nodes.length * 3;
  const K = zeros(nDof, nDof);
  const F = frame.F.slice();
  const prepared = [];
  frame.elements.forEach((el) => {
    const ni = frame.nodes[el.i - 1], nj = frame.nodes[el.j - 1];
    const dx = nj.x - ni.x, dy = nj.y - ni.y, L = Math.hypot(dx, dy);
    if (L <= 0) throw new Error("Zero length element: " + el.name);
    const c = dx / L, s = dy / L, T = transformMatrix(c, s);
    const kLocal = frameLocalStiffness(el.E, el.A, el.I, L);
    const fLocal = uniformEquivalent(el.qLocalY || 0, L);
    const condensed = condenseReleases(kLocal, fLocal, el.releases);
    const kGlobal = matMul(transpose(T), matMul(condensed.kBar, T));
    const fGlobal = matVec(transpose(T), condensed.fBar);
    const map = [0, 1, 2, 3, 4, 5].map((local, idx) => dofIndex(idx < 3 ? el.i : el.j, idx % 3));
    for (let a = 0; a < 6; a++) { F[map[a]] += fGlobal[a]; for (let b = 0; b < 6; b++) K[map[a]][map[b]] += kGlobal[a][b]; }
    prepared.push({ ...el, L, c, s, T, kLocal, fLocal, condensed, map });
  });

  const restraints = frame.restraints.slice();
  const notes = [];
  for (let d = 0; d < nDof; d++) {
    if (restraints[d]) continue;
    const rowNorm = K[d].reduce((sum, value) => sum + Math.abs(value), 0);
    if (rowNorm < 1e-8) {
      if (Math.abs(F[d]) > 1e-8) throw new Error("Unrestrained zero-stiffness DOF carries load: " + dofLabel(d) + ".");
      if ((frame.protectedFreeDofs || []).includes(d)) throw new Error("A free column-top DOF became isolated: " + dofLabel(d) + ".");
      restraints[d] = true;
      notes.push("Auto-locked isolated " + dofLabel(d) + ".");
    }
  }
  if ((frame.protectedFreeDofs || []).some((d) => restraints[d])) throw new Error("The solver attempted to restrain the free column top.");
  const free = [], fixed = [];
  restraints.forEach((isFixed, i) => (isFixed ? fixed : free).push(i));
  if (free.length === 0) throw new Error("All degrees of freedom are restrained.");

  const Kff = pickMatrix(K, free, free);
  const Ff = pickVector(F, free);
  const uf = gaussSolve(Kff, Ff);
  const U = Array(nDof).fill(0);
  free.forEach((d, i) => U[d] = uf[i]);
  const frameSpan = Math.max(frame.input.columnHeight, frame.input.maxReach, 1);
  const maxTranslation = Math.max(...U.filter((_, i) => i % 3 !== 2).map(Math.abs), 0);
  if (maxTranslation > frameSpan * 5) throw new Error("The support / release arrangement is a near mechanism. Add base fixity, bracing, or rotational restraint before reading results.");
  if (maxTranslation > frameSpan / 20) notes.push("Large displacement: small-displacement theory may not be valid.");

  const KU = matVec(K, U);
  const R = KU.map((value, i) => value - F[i]);

  const elements = prepared.map((el) => {
    const dGlobal = pickVector(U, el.map);
    const dLocal = matVec(el.T, dGlobal);
    const dLocalReleased = expandLocalDisplacements(el.condensed, dLocal);
    const endForces = subVector(matVec(el.kLocal, dLocalReleased), el.fLocal);
    return { ...el, dGlobal, dLocal: dLocalReleased, endForces };
  });

  const result = { ...frame, K, F, U, R, restraints, elements, notes };
  result.summary = summarize(result);
  result.frame3dd = makeFrame3DD(result);
  return result;
}

function summarize(result) {
  let maxSway = 0, maxTip = 0, maxV = 0, maxM = 0;
  result.nodes.forEach((node) => {
    if (node.x === 0) maxSway = Math.max(maxSway, Math.abs(result.U[dofIndex(node.id, 0)]));
    if (node.x > 0) maxTip = Math.max(maxTip, Math.abs(result.U[dofIndex(node.id, 1)]));
  });
  result.elements.forEach((el) => {
    for (let i = 0; i <= 80; i++) { const x = el.L * i / 80; const v = diagramValue(el, x); maxV = Math.max(maxV, Math.abs(v.V)); maxM = Math.max(maxM, Math.abs(v.M)); }
  });
  return { maxSway, maxTip, maxV, maxM };
}
function diagramValue(el, x) {
  const p = el.endForces, q = el.qLocalY || 0;
  return { N: p[0], V: p[1] + q * x, M: p[2] - p[1] * x - 0.5 * q * x * x };
}
function memberDisplacementAt(el, t) {
  const L = el.L;
  const u1 = el.dLocal[0], v1 = el.dLocal[1], th1 = el.dLocal[2];
  const u2 = el.dLocal[3], v2 = el.dLocal[4], th2 = el.dLocal[5];
  const u = (1 - t) * u1 + t * u2;
  const t2 = t * t, t3 = t2 * t;
  const N1 = 1 - 3 * t2 + 2 * t3, N2 = L * (t - 2 * t2 + t3), N3 = 3 * t2 - 2 * t3, N4 = L * (-t2 + t3);
  let v = N1 * v1 + N2 * th1 + N3 * v2 + N4 * th2;
  const q = el.qLocalY || 0;
  if (q !== 0) { const x = t * L; v += q * x * x * (L - x) * (L - x) / (24 * el.E * el.I); }
  return { dx: el.c * u - el.s * v, dy: el.s * u + el.c * v };
}
function columnDeflectionAt(result, y) {
  const cols = result.elements.filter((el) => result.nodes[el.i - 1].x === 0 && result.nodes[el.j - 1].x === 0);
  if (!cols.length) return null;
  let lo = Infinity, hi = -Infinity;
  cols.forEach((el) => { const a = result.nodes[el.i - 1].y, b = result.nodes[el.j - 1].y; lo = Math.min(lo, a, b); hi = Math.max(hi, a, b); });
  const yc = Math.min(Math.max(y, lo), hi);
  const target = cols.find((el) => { const a = result.nodes[el.i - 1].y, b = result.nodes[el.j - 1].y; return yc >= Math.min(a, b) - 1e-6 && yc <= Math.max(a, b) + 1e-6; }) || cols[cols.length - 1];
  const a = result.nodes[target.i - 1].y, b = result.nodes[target.j - 1].y;
  const t = b === a ? 0 : (yc - a) / (b - a);
  const d = memberDisplacementAt(target, t);
  return { y: yc, sway: d.dx, axial: d.dy, clamped: yc !== y };
}
function columnProfile(result, stations) {
  const top = result.input.columnHeight;
  const rows = []; let maxAbs = 0, maxAt = 0;
  for (let i = 0; i <= stations; i++) {
    const y = top * i / stations;
    const q = columnDeflectionAt(result, y);
    const Ux = q ? q.sway : 0, Uy = q ? q.axial : 0;
    rows.push({ y, Ux, Uy });
    if (Math.abs(Ux) > maxAbs) { maxAbs = Math.abs(Ux); maxAt = y; }
  }
  return { rows, maxAbs, maxAt };
}

/* Lateral sway of the column at any height y.
   Within the column it is the exact deflected-shape value; above the column
   top it is a straight rigid continuation using the end slope (so a point a
   half-beam-depth above the top arm still gets a sensible sway). */
function columnSwayAt(result, y) {
  const top = result.input.columnHeight;
  if (y <= top + 1e-6) { const q = columnDeflectionAt(result, y); return { y, sway: q ? q.sway : 0, extrapolated: false }; }
  const eps = Math.max(1, top * 1e-3);
  const u0 = columnDeflectionAt(result, top).sway;
  const um = columnDeflectionAt(result, top - eps).sway;
  const slope = (u0 - um) / eps;
  return { y, sway: u0 + slope * (y - top), extrapolated: true };
}

/* Per-beam horizontal deflection (Ux) at the column junction and the free tip,
   plus the two headline values for the top-most beam:
   its junction sway, and the sway a half-beam-depth above that junction. */
function deflectionReport(result) {
  const U = result.U;
  const ux = (id) => (id ? U[dofIndex(id, 0)] : 0);
  const beams = [];
  const baseJ = result.colNodeAt.get(0), baseTip = result.tipNodeAt.get(0);
  beams.push({ beamNo: 1, kind: "Base tie", h: 0, secH: result.input.baseSection.secH,
    junctionUx: ux(baseJ), tipUx: ux(baseTip), junctionId: baseJ, tipId: baseTip });
  const arms = result.input.arms.map((a) => a).sort((p, q) => p.h - q.h);
  arms.forEach((a, i) => {
    const j = result.colNodeAt.get(a.h), tip = result.tipNodeAt.get(a.h);
    beams.push({ beamNo: i + 2, kind: "Cantilever arm", h: a.h, secH: a.secH || 0, label: a.label,
      junctionUx: ux(j), tipUx: ux(tip), junctionId: j, tipId: tip });
  });
  let top = null;
  if (arms.length) {
    const ta = arms[arms.length - 1];
    const j = result.colNodeAt.get(ta.h);
    const halfDepth = (ta.secH || 0) / 2;
    const hh = ta.h + halfDepth;
    const s = columnSwayAt(result, hh);
    top = { beamNo: arms.length + 1, h: ta.h, secH: ta.secH || 0, label: ta.label,
      junctionUx: ux(j), junctionId: j, halfDepth, halfHeight: hh, halfUx: s.sway, extrapolated: s.extrapolated };
  }
  return { beams, top };
}

/* ---------------- Render ---------------- */
function render(result) {
  lastResult = result;
  hideError();
  const maxV_kN = result.summary.maxV * N_TO_KN, maxM_kNm = result.summary.maxM * NMM_TO_KNM;
  $("mSway").innerHTML = kpi(result.summary.maxSway, "mm");
  $("mTip").innerHTML = kpi(result.summary.maxTip, "mm");
  $("mShear").innerHTML = kpi(maxV_kN, "kN");
  $("mMoment").innerHTML = kpi(maxM_kNm, "kN\u00B7m");
  const dr = deflectionReport(result);
  lastDefl = dr;
  try { window.lastResult = result; window.lastDefl = dr; } catch (e) {}
  if (dr.top) {
    $("mTopJ").innerHTML = kpi(dr.top.junctionUx, "mm @ " + fmt(dr.top.h, 0));
    $("mHalf").innerHTML = kpi(dr.top.halfUx, "mm @ " + fmt(dr.top.halfHeight, 0) + (dr.top.extrapolated ? " ext" : ""));
  } else {
    $("mTopJ").innerHTML = "\u2013"; $("mHalf").innerHTML = "\u2013";
  }

  const warn = result.notes.length > 0;
  $("statusDot").className = "dot" + (warn ? " warn" : "");
  $("statusText").textContent = warn ? result.notes[0] : "Analysis complete \u00B7 " + result.nodes.length + " nodes, " + result.elements.length + " members";
  if ($("comboNote")) {
    const swkN = (result.selfWeightN || 0) / 1000, gG = result.input.gammaG, gQ = result.input.gammaQ, inc = result.input.includeSW;
    $("comboNote").innerHTML =
      '<span class="ctag">' + fmt(gG, 2) + " G + " + fmt(gQ, 2) + ' Q</span>' +
      '<span class="ctag">column ' + result.input.leftSupport + '-free · top unrestrained</span>' +
      (inc
        ? '<span class="csw">self-weight ' + fmt(swkN, 2) + " kN \u00b7 factored " + fmt(swkN * gG, 2) + " kN downward</span>"
        : '<span class="csw">self-weight excluded</span>');
  }
  $("sbSway").textContent = fmt(result.summary.maxSway) + " mm";
  $("sbMoment").textContent = fmt(maxM_kNm) + " kN\u00B7m";
  $("sbShear").textContent = fmt(maxV_kN) + " kN";
  $("sbCounts").textContent = result.nodes.length + "N / " + result.elements.length + "E";

  renderModelSvg(result);
  renderTables(result);
  renderSystemDiagram(result, "M", "sysM", 620, "bmdMax");
  renderSystemDiagram(result, "V", "sysV", 620, "sfdMax");
  $("frame3ddText").value = result.frame3dd;
}

function renderModelSvg(result) {
  const svg = $("modelSvg");
  svg.replaceChildren();
  const xs = result.nodes.map((n) => n.x), ys = result.nodes.map((n) => n.y);
  const xr = (Math.max(...xs) - Math.min(...xs)) || 1;
  const minX = Math.min(...xs) - xr * 0.14;
  const maxX = Math.max(...xs) + xr * 0.16;
  const minY = Math.min(...ys) - result.input.columnHeight * 0.18;
  const maxY = Math.max(...ys) + result.input.columnHeight * 0.12;
  const W = 1000, H = 620, margin = 56;
  const spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
  const s = Math.min((W - 2 * margin) / spanX, (H - 2 * margin) / spanY);   // single uniform scale -> true proportions
  const ox = margin + ((W - 2 * margin) - spanX * s) / 2;
  const oy = margin + ((H - 2 * margin) - spanY * s) / 2;
  const sx = (x) => ox + (x - minX) * s;
  const sy = (y) => H - oy - (y - minY) * s;

  const maxDisp = Math.max(...result.U.map(Math.abs), 0);
  const autoScale = maxDisp > 0 ? Math.min(2000, (Math.max(spanX, spanY) * 0.08) / maxDisp) : 1;
  const baseScale = result.input.defScale > 0 ? result.input.defScale : autoScale;
  const eff = baseScale * DEFMULT, dScale = eff * ANIM.phase;
  $("scaleLabel").textContent = "Deflection \u00D7 " + fmt(eff, 1);

  rebuildSectionColors();
  const uScale = s;
  // fit the default / reset view to the frame (keeps true proportions while filling the stage)
  const fxs = result.nodes.map((n) => sx(n.x)), fys = result.nodes.map((n) => sy(n.y));
  const fminx = Math.min(...fxs), fmaxx = Math.max(...fxs), fminy = Math.min(...fys), fmaxy = Math.max(...fys);
  const fitVB = [fminx - 44, fminy - 50, (fmaxx - fminx) + 44 + 250, (fmaxy - fminy) + 50 + 64];
  if (modelFitPending) { VB = fitVB.slice(); modelFitPending = false; }

  if (EXTRUDE) {
    drawExtrudedMembers(svg, result, sx, sy, uScale);
    result.nodes.forEach((node) => circle(svg, sx(node.x), sy(node.y), 3.2, "#ffffff", "#1e2a37"));
    $("scaleLabel").textContent = "Extrude view \u00B7 members to section scale";
  } else {
    result.elements.forEach((el, idx) => {
      const ni = result.nodes[el.i - 1], nj = result.nodes[el.j - 1];
      const sel = idx === SELMEM;
      const c = SECTION_COLORS.get(el.sectionLabel) || "#1e2a37";
      if (sel) line(svg, sx(ni.x), sy(ni.y), sx(nj.x), sy(nj.y), "#a7c3e6", 11, 1);
      const ln = line(svg, sx(ni.x), sy(ni.y), sx(nj.x), sy(nj.y), c, sel ? 6 : 4.4, 1);
      ln.setAttribute("data-mi", idx); ln.style.cursor = "pointer";
      attachMemberInteraction(ln, result, el, idx);
    });
    result.elements.forEach((el) => {
      const ni = result.nodes[el.i - 1], nj = result.nodes[el.j - 1];
      const steps = 24, pts = [];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = ni.x + (nj.x - ni.x) * t, py = ni.y + (nj.y - ni.y) * t;
        const d = memberDisplacementAt(el, t);
        pts.push(sx(px + d.dx * dScale) + "," + sy(py + d.dy * dScale));
      }
      polyline(svg, pts.join(" "), "#2c66a8", 3);
    });
    result.nodes.forEach((node) => circle(svg, sx(node.x), sy(node.y), 4, "#ffffff", "#1e2a37"));
  }
  result.elements.forEach((el) => {
    if (!el.labelHere || !el.sectionLabel) return;
    const ni = result.nodes[el.i - 1], nj = result.nodes[el.j - 1];
    const mx = (ni.x + nj.x) / 2, my = (ni.y + nj.y) / 2;
    const lc = SECTION_COLORS.get(el.sectionLabel) || "#8894a2";
    const lenStr = "L = " + Math.round(el.fullL != null ? el.fullL : el.L) + " mm";
    const secLabel = (el.beamNo ? "Beam " + el.beamNo + " \u00B7 " : "") + el.sectionLabel;
    if (el.type === "column") {
      labelText(svg, sx(mx) + 10, sy(my) - 4, secLabel, lc, 11, "start", 700);
      labelText(svg, sx(mx) + 10, sy(my) + 9, lenStr, "#475569", 10, "start", 600);
    } else if (el.type === "bottom") {
      labelText(svg, sx(mx), sy(my) + 18, secLabel, lc, 11, "middle", 700);
      labelText(svg, sx(mx), sy(my) + 31, lenStr, "#475569", 10, "middle", 600);
    } else {
      labelText(svg, sx(mx), sy(my) - 22, secLabel, lc, 11, "middle", 700);
      labelText(svg, sx(mx), sy(my) - 9, lenStr, "#475569", 10, "middle", 600);
    }
  });
  (result.pointLoadMarks || []).forEach((m) => {
    if (Math.abs(m.P) < 1e-9) return;
    const off = result.input.columnHeight * 0.085 * (m.P > 0 ? 1 : -1);
    arrow(svg, sx(m.x), sy(m.y + off), sx(m.x), sy(m.y), "#c1392d", fmt(Math.abs(m.P) * N_TO_KN, 1) + " kN");
  });
  drawSupports(svg, result, sx, sy);
  if (!EXTRUDE) drawDeflectionProbe(svg, result, sx, sy, dScale);
  result.elements.forEach((el) => {
    const ni = result.nodes[el.i - 1], nj = result.nodes[el.j - 1];
    if (el.releases.rzI) hinge(svg, sx(ni.x), sy(ni.y));
    if (el.releases.rzJ) hinge(svg, sx(nj.x), sy(nj.y));
  });
  svg.setAttribute("viewBox", VB.join(" "));
}

function drawExtrudedMembers(svg, result, sx, sy, uScale) {
  const obl = { x: 0.82, y: -0.57 };   // screen direction of the extrusion (up & to the right)
  const bars = result.elements.map((el, idx) => {
    const ni = result.nodes[el.i - 1], nj = result.nodes[el.j - 1];
    const P0 = [sx(ni.x), sy(ni.y)], P1 = [sx(nj.x), sy(nj.y)];
    const dx = P1[0] - P0[0], dy = P1[1] - P0[1], len = Math.hypot(dx, dy) || 1;
    const pxp = -dy / len, pyp = dx / len;                 // unit perpendicular (screen)
    const secH = el.secH || 100, secB = el.secB || 50;
    const dHalf = Math.max(secH * uScale / 2, 2.2);        // half section depth (in-plane), px
    const extr = Math.min(Math.max(secB * uScale * 0.55, 5), 46);  // oblique extrusion length, px
    const ox = obl.x * extr, oy = obl.y * extr;
    const A = [P0[0] + pxp * dHalf, P0[1] + pyp * dHalf], B = [P0[0] - pxp * dHalf, P0[1] - pyp * dHalf];
    const C = [P1[0] - pxp * dHalf, P1[1] - pyp * dHalf], D = [P1[0] + pxp * dHalf, P1[1] + pyp * dHalf];
    const back = [[A[0] + ox, A[1] + oy], [B[0] + ox, B[1] + oy], [C[0] + ox, C[1] + oy], [D[0] + ox, D[1] + oy]];
    const hull = convexHull([A, B, C, D].concat(back));
    const c = SECTION_COLORS.get(el.sectionLabel) || "#64748b";
    return { idx, el, front: [A, B, C, D], hull, c, midY: (P0[1] + P1[1]) / 2 };
  });
  const order = bars.slice().sort((a, b) => a.midY - b.midY);   // top members first; lower overlay
  const pstr = (arr) => arr.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  // pass 1: extruded bodies (the 3D sides)
  order.forEach((b) => {
    svg.appendChild(svgEl("polygon", { points: pstr(b.hull), fill: b.c, "fill-opacity": 0.95, stroke: shadeColor(b.c, 0.32), "stroke-width": 1, "stroke-linejoin": "round" }));
  });
  // pass 2: lit front faces (interactive)
  order.forEach((b) => {
    const sel = b.idx === SELMEM;
    const poly = svgEl("polygon", { points: pstr(b.front), fill: tintColor(b.c, 0.5), stroke: sel ? "#1e3a8a" : shadeColor(b.c, 0.28), "stroke-width": sel ? 2.6 : 1.1, "stroke-linejoin": "round" });
    poly.setAttribute("data-mi", b.idx); poly.style.cursor = "pointer";
    attachMemberInteraction(poly, result, b.el, b.idx);
    svg.appendChild(poly);
  });
}

function drawDeflectionProbe(svg, result, sx, sy, scale) {
  const qy = Number($("colQueryY").value);
  if (!Number.isFinite(qy)) return;
  const q = columnDeflectionAt(result, qy);
  if (!q) return;
  const px = 0 + q.sway * scale, py = q.y + q.axial * scale;
  line(svg, sx(0), sy(q.y), sx(px), sy(py), "#b06f0f", 1.5, 0.95);
  circle(svg, sx(px), sy(py), 5, "#fbf1de", "#b06f0f");
  text(svg, sx(px) + 9, sy(py) - 6, "Ux=" + fmt(q.sway) + " mm @ " + fmt(q.y, 0) + (q.clamped ? " (clamped)" : ""), "#7a4d0a", 12, "start");
}

function drawSupports(svg, result, sx, sy) {
  const base = result.nodes[result.colNodeAt.get(0) - 1];
  supportSymbol(svg, sx(base.x), sy(base.y), result.input.leftSupport);
  const right = result.nodes[result.tipNodeAt.get(0) - 1];
  supportSymbol(svg, sx(right.x), sy(right.y), result.input.rightSupport);
}
function supportSymbol(svg, x, y, type) {
  if (type === "free") return;
  const color = type === "fixed" ? "#0e7c86" : "#c1392d";
  if (type === "fixed") {
    rect(svg, x - 19, y + 5, 38, 8, color);
    for (let i = -16; i <= 16; i += 10) line(svg, x + i, y + 13, x + i - 8, y + 25, color, 2, 1);
    return;
  }
  path(svg, "M " + x + " " + (y + 4) + " L " + (x - 21) + " " + (y + 44) + " L " + (x + 21) + " " + (y + 44) + " Z", "none", color, 3, 1);
  if (type === "roller-y") { circle(svg, x - 11, y + 50, 4, "none", color); circle(svg, x + 11, y + 50, 4, "none", color); }
}

function renderTables(result) {
  const dr = lastDefl || deflectionReport(result);

  /* ----- Headline lateral deflection (Ux) ----- */
  if (dr.top) {
    const t = dr.top;
    $("uxHeadline").innerHTML =
      '<div class="ux-row"><span class="ux-tag">Top beam junction</span>' +
      '<span class="ux-where">Beam ' + t.beamNo + ' \u00b7 column at ' + fmt(t.h, 0) + ' mm</span>' +
      '<span class="ux-val">' + fmt(t.junctionUx) + ' mm</span></div>' +
      '<div class="ux-row hot"><span class="ux-tag">Junction + \u00bd beam depth</span>' +
      '<span class="ux-where">on the column at ' + fmt(t.h, 0) + ' + ' + fmt(t.halfDepth, 0) +
      ' = <b>' + fmt(t.halfHeight, 0) + ' mm</b>' + (t.extrapolated ? ' (extrapolated above column top)' : '') +
      '</span><span class="ux-val">' + fmt(t.halfUx) + ' mm</span></div>';
  } else {
    $("uxHeadline").innerHTML = '<div class="ux-row"><span class="ux-where">Add a cantilever arm to see beam-level sway.</span></div>';
  }

  const beamRows = dr.beams.map((b) => ({
    beam: "Beam " + b.beamNo, kind: b.kind, h: b.h,
    junctionUx: b.junctionUx, tipUx: b.tipUx,
    _top: dr.top && b.beamNo === dr.top.beamNo
  }));
  table($("uxBeamTable"),
    [["beam", "Beam"], ["kind", "Type"], ["h", "Level (mm)"], ["junctionUx", "Junction Ux (mm)"], ["tipUx", "Tip Ux (mm)"]],
    beamRows, {}, (r) => r._top ? "rowhot" : "");
  $("uxNote").textContent = dr.top
    ? "Ux is horizontal sway (+x). \u201cJunction\u201d is the column node where the beam connects; \u201cTip\u201d is the free end (far support for the base tie). The top beam is Beam " + dr.top.beamNo + "; its junction sits at " + fmt(dr.top.h, 0) + " mm and the \u00bd-depth point at " + fmt(dr.top.halfHeight, 0) + " mm (half of its " + fmt(dr.top.secH, 0) + " mm section depth)."
    : "Ux is horizontal sway (+x).";

  /* ----- Node displacements (with a Location label + top-junction highlight) ----- */
  const role = new Map();
  const ch = result.input.columnHeight;
  role.set(result.colNodeAt.get(0), "Beam 1 junction (base)");
  role.set(result.tipNodeAt.get(0), "Beam 1 tip (far support)");
  const armsAsc = result.input.arms.map((a) => a).sort((p, q) => p.h - q.h);
  armsAsc.forEach((a, i) => {
    role.set(result.colNodeAt.get(a.h), "Beam " + (i + 2) + " junction");
    role.set(result.tipNodeAt.get(a.h), "Beam " + (i + 2) + " tip");
  });
  const topJ = result.colNodeAt.get(ch);
  if (topJ && !role.has(topJ)) role.set(topJ, "Column top");
  const topJunctionId = dr.top ? dr.top.junctionId : null;
  const dispRows = result.nodes.map((node) => ({
    node: node.id + " " + node.label,
    loc: (node.id === topJunctionId ? "\u2605 " : "") + (role.get(node.id) || (node.x === 0 ? "Column" : "mid-beam")),
    x: node.x, y: node.y,
    Ux: result.U[dofIndex(node.id, 0)], Uy: result.U[dofIndex(node.id, 1)], Rz: result.U[dofIndex(node.id, 2)],
    _top: node.id === topJunctionId
  }));
  table($("dispTable"),
    [["node", "Node"], ["loc", "Location"], ["x", "x (mm)"], ["y", "y (mm)"], ["Ux", "Ux (mm)"], ["Uy", "Uy (mm)"], ["Rz", "Rz (rad)"]],
    dispRows, { Rz: 7 }, (r) => r._top ? "rowhot" : "");

  const reactRows = [];
  result.restraints.forEach((fixed, d) => {
    if (!fixed) return;
    const node = Math.floor(d / 3) + 1, comp = d % 3;
    reactRows.push({ dof: "N" + node + " " + DOF[comp], reaction: comp === 2 ? result.R[d] * NMM_TO_KNM : result.R[d] * N_TO_KN, unit: comp === 2 ? "kN\u00B7m" : "kN" });
  });
  table($("reactTable"), [["dof", "DOF"], ["reaction", "Reaction"], ["unit", "Unit"]], reactRows);

  const forceRows = result.elements.map((el) => ({
    member: el.id + " " + el.name,
    Ni: el.endForces[0] * N_TO_KN, Vi: el.endForces[1] * N_TO_KN, Mi: el.endForces[2] * NMM_TO_KNM,
    Nj: el.endForces[3] * N_TO_KN, Vj: el.endForces[4] * N_TO_KN, Mj: el.endForces[5] * NMM_TO_KNM
  }));
  table($("forceTable"), [["member", "Member"], ["Ni", "Ni (kN)"], ["Vi", "Vi (kN)"], ["Mi", "Mi (kN\u00B7m)"], ["Nj", "Nj (kN)"], ["Vj", "Vj (kN)"], ["Mj", "Mj (kN\u00B7m)"]], forceRows);

  const prof = columnProfile(result, 12);
  table($("colProfileTable"), [["y", "Height (mm)"], ["Ux", "Sway Ux (mm)"], ["Uy", "Axial Uy (mm)"]], prof.rows);
  $("colProfileNote").textContent = "Lateral sway up the column. Max |Ux| = " + fmt(prof.maxAbs) + " mm at " + fmt(prof.maxAt, 0) + " mm.";
}

function table(container, cols, rows, digits, rowClass) {
  digits = digits || {};
  const tbl = document.createElement("table");
  tbl.className = "data";
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  cols.forEach((c) => { const th = document.createElement("th"); th.textContent = c[1]; trh.appendChild(th); });
  thead.appendChild(trh);
  tbl.appendChild(thead);
  const tb = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    if (rowClass) { const cl = rowClass(row); if (cl) tr.className = cl; }
    cols.forEach((c) => { const td = document.createElement("td"); const v = row[c[0]]; td.textContent = typeof v === "number" ? fmt(v, (c[0] in digits) ? digits[c[0]] : 4) : v; tr.appendChild(td); });
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);
  container.replaceChildren(tbl);
}

function logicalKey(name) { const m = name.match(/^(.*?)\s*\[\d+\/\d+\]$/); return m ? m[1] : name; }
function logicalMembers(result) {
  const groups = [], map = new Map();
  result.elements.forEach((el) => { const k = logicalKey(el.name); if (!map.has(k)) { const g = { key: k, els: [] }; map.set(k, g); groups.push(g); } map.get(k).els.push(el); });
  return groups;
}
function renderMemberSelect(result) {
  const select = $("memberSelect");
  if (!select) return;
  const existing = select.value;
  select.replaceChildren();
  const groups = logicalMembers(result);
  groups.forEach((g) => { const o = document.createElement("option"); o.value = g.key; o.textContent = g.key + (g.els.length > 1 ? " (full)" : ""); select.appendChild(o); });
  if ([...select.options].some((o) => o.value === existing)) { select.value = existing; return; }
  // default to the member whose diagram varies most (clear shape), tie-broken by peak moment,
  // so the detail is never a flat line and the user immediately sees a real SFD/BMD
  let best = groups[0], bestScore = -1;
  groups.forEach((g) => {
    let mn = Infinity, mx = -Infinity, pk = 0;
    g.els.forEach((el) => { for (let i = 0; i <= 24; i++) { const m = diagramValue(el, el.L * i / 24).M; if (m < mn) mn = m; if (m > mx) mx = m; if (Math.abs(m) > pk) pk = Math.abs(m); } });
    const score = (mx - mn) + pk * 1e-9;
    if (score > bestScore) { bestScore = score; best = g; }
  });
  select.value = best.key;
}

function renderDiagram(result) {
  const svg = $("diagramSvg");
  if (!svg || !$("memberSelect")) return;
  svg.replaceChildren();
  if (!result.elements.length) return;
  const groups = logicalMembers(result);
  const key = $("memberSelect").value;
  const g = groups.find((x) => x.key === key) || groups[0];
  const samples = []; let xCum = 0;
  g.els.forEach((el) => {
    const n = 40;
    for (let i = 0; i <= n; i++) { const xl = el.L * i / n; const d = diagramValue(el, xl); samples.push({ x: xCum + xl, V: d.V * N_TO_KN, M: -d.M * NMM_TO_KNM }); }
    xCum += el.L;
  });
  $("diagramInfo").textContent = g.key + " \u00B7 L = " + fmt(xCum, 1) + " mm" + (g.els.length > 1 ? " \u00B7 " + g.els.length + " segments" : "");
  drawDiagramPanel(svg, samples, "V", 40, 42, 920, 230, "#0e7c86", "Shear V (kN)", false);
  drawDiagramPanel(svg, samples, "M", 40, 340, 920, 230, "#c1392d", "Bending M (kN\u00B7m) \u2014 sagging +ve on tension face", true);
}
function drawDiagramPanel(svg, samples, key, x0, y0, w, h, color, title, posDown) {
  const maxAbs = Math.max(...samples.map((s) => Math.abs(s[key])), 1e-9);
  const maxX = Math.max(...samples.map((s) => s.x), 1);
  const dir = posDown ? -1 : 1;
  const sx = (x) => x0 + x / maxX * w;
  const sy = (v) => y0 + h / 2 - dir * v / maxAbs * h * 0.43;
  rect(svg, x0, y0, w, h, "#ffffff", "#d5dde7");
  line(svg, x0, y0 + h / 2, x0 + w, y0 + h / 2, "#9aa8b8", 1, 1);
  polyline(svg, samples.map((s) => sx(s.x) + "," + sy(s[key])).join(" "), color, 3);
  text(svg, x0 + 10, y0 + 22, title, "#26333f", 14, "start");
  text(svg, x0 + w - 10, y0 + 22, "max abs " + fmt(maxAbs), color, 13, "end");
}

/* ---------------- Whole-structure force diagram ---------------- */
function modelTransform(result, margin, H, W) {
  const xs = result.nodes.map((n) => n.x), ys = result.nodes.map((n) => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
  W = W || 1000; H = H || 620;
  const availW = W - 2 * margin, availH = H - 2 * margin;
  const s = Math.min(availW / spanX, availH / spanY);   // uniform scale -> no distortion
  const ox = margin + (availW - spanX * s) / 2;
  const oy = margin + (availH - spanY * s) / 2;
  const sx = (x) => ox + (x - minX) * s;
  const sy = (y) => H - oy - (y - minY) * s;
  return { sx, sy, W, H, s };
}
function systemForceValue(d, ftype) {
  if (ftype === "M") return -d.M * NMM_TO_KNM;   // sagging +ve, kN.m
  if (ftype === "V") return d.V * N_TO_KN;        // kN
  return -d.N * N_TO_KN;                            // axial, tension +ve, kN
}
function memberFriendly(el) {
  if (el.beamNo) return "Beam " + el.beamNo;
  if (el.type === "column") return "column";
  return el.name;
}
function renderSystemDiagram(result, ftype, svgId, H, headlineId) {
  const svg = $(svgId || "systemSvg");
  if (!svg) return;
  svg.replaceChildren();
  if (!result.elements.length) return;
  H = H || 620;
  const margin = 98;
  const tr = modelTransform(result, margin, H, 1000);
  const sx = tr.sx, sy = tr.sy;
  const steps = 48;
  let maxAbs = 0, maxInfo = null;
  const data = result.elements.map((el) => {
    const samples = []; let peak = { v: 0, t: 0 };
    for (let i = 0; i <= steps; i++) {
      const x = el.L * i / steps;
      const v = systemForceValue(diagramValue(el, x), ftype);
      const t = i / steps;
      samples.push({ t, v });
      if (Math.abs(v) > Math.abs(peak.v)) peak = { v, t };
    }
    if (Math.abs(peak.v) > maxAbs) { maxAbs = Math.abs(peak.v); maxInfo = { el, peak }; }
    return { el, samples, peak };
  });
  if (maxAbs <= 0) maxAbs = 1e-9;
  const ordPx = Math.min(margin - 28, Math.round(H * 0.15));
  const pxScale = ordPx / maxAbs;
  const col = ftype === "M" ? "#c1392d" : ftype === "V" ? "#0e7c86" : "#2c66a8";
  const unit = ftype === "M" ? "kN\u00B7m" : "kN";

  // faint member baselines
  data.forEach((dm) => {
    const ni = result.nodes[dm.el.i - 1], nj = result.nodes[dm.el.j - 1];
    line(svg, sx(ni.x), sy(ni.y), sx(nj.x), sy(nj.y), "#aab4c0", 1.6, 1);
  });
  // filled diagram per member
  data.forEach((dm) => {
    const ni = result.nodes[dm.el.i - 1], nj = result.nodes[dm.el.j - 1];
    const aix = sx(ni.x), aiy = sy(ni.y), ajx = sx(nj.x), ajy = sy(nj.y);
    const sdx = ajx - aix, sdy = ajy - aiy, slen = Math.hypot(sdx, sdy) || 1;
    const px = -sdy / slen, py = sdx / slen;
    const pts = [aix + "," + aiy];
    dm.samples.forEach((smp) => {
      const bx = aix + sdx * smp.t, by = aiy + sdy * smp.t, off = smp.v * pxScale;
      pts.push((bx + px * off) + "," + (by + py * off));
    });
    pts.push(ajx + "," + ajy);
    svg.appendChild(svgEl("polygon", { points: pts.join(" "), fill: col, "fill-opacity": 0.16, stroke: col, "stroke-width": 1.6, "stroke-linejoin": "round" }));
  });
  // the frame on top so it reads as the structure
  data.forEach((dm) => {
    const ni = result.nodes[dm.el.i - 1], nj = result.nodes[dm.el.j - 1];
    line(svg, sx(ni.x), sy(ni.y), sx(nj.x), sy(nj.y), "#1e2a37", 2.6, 1);
  });
  result.nodes.forEach((n) => circle(svg, sx(n.x), sy(n.y), 3.2, "#ffffff", "#1e2a37"));

  // value at each member's controlling section; the governing one is boxed
  data.forEach((dm) => {
    if (Math.abs(dm.peak.v) < 0.04 * maxAbs) return;
    const ni = result.nodes[dm.el.i - 1], nj = result.nodes[dm.el.j - 1];
    const aix = sx(ni.x), aiy = sy(ni.y), ajx = sx(nj.x), ajy = sy(nj.y);
    const sdx = ajx - aix, sdy = ajy - aiy, slen = Math.hypot(sdx, sdy) || 1;
    const px = -sdy / slen, py = sdx / slen;
    const bx = aix + sdx * dm.peak.t, by = aiy + sdy * dm.peak.t;
    const ox = bx + px * dm.peak.v * pxScale, oy = by + py * dm.peak.v * pxScale;
    line(svg, bx, by, ox, oy, col, 1.3, 0.85);            // tick at the controlling section
    circle(svg, ox, oy, 2.6, col, col);
    const isMax = maxInfo && dm.el === maxInfo.el;
    const lead = (dm.peak.v >= 0 ? 13 : -13);
    const lx = ox + px * lead, ly = oy + py * lead + 4;
    const label = fmt(dm.peak.v, 1);
    if (isMax) {
      const w = String(label).length * 7.6 + 14;
      svg.appendChild(svgEl("rect", { x: lx - w / 2, y: ly - 14, width: w, height: 19, rx: 4, fill: "#ffffff", stroke: col, "stroke-width": 1.5 }));
      text(svg, lx, ly, label, col, 12.5, "middle");
    } else {
      text(svg, lx, ly, label, col, 11, "middle");
    }
  });
  drawSupports(svg, result, sx, sy);
  // crop the viewBox to the drawn content so the diagram fills the stage (no dead margins)
  const dxs = result.nodes.map((n) => sx(n.x)), dys = result.nodes.map((n) => sy(n.y));
  const pad = ordPx + 30;
  const vbx = Math.min(...dxs) - pad, vby = Math.min(...dys) - pad;
  const vbw = (Math.max(...dxs) - Math.min(...dxs)) + 2 * pad;
  const vbh = (Math.max(...dys) - Math.min(...dys)) + 2 * pad + 16;
  svg.setAttribute("viewBox", vbx.toFixed(1) + " " + vby.toFixed(1) + " " + vbw.toFixed(1) + " " + vbh.toFixed(1));
  if (headlineId && $(headlineId)) {
    const nm = maxInfo ? memberFriendly(maxInfo.el) : "";
    const at = maxInfo ? (Math.abs(maxInfo.peak.t) < 0.02 ? " (start)" : Math.abs(maxInfo.peak.t - 1) < 0.02 ? " (end)" : "") : "";
    $(headlineId).textContent = "max " + fmt(maxAbs, 1) + " " + unit + (nm ? " \u00b7 " + nm + at : "");
  }
}

/* ---------------- Section colours (one per distinct section) ---------------- */
const SECTION_PALETTE = ["#2c66a8", "#0d9488", "#c8801a", "#7c3aed", "#2f855a", "#0891b2", "#c1392d", "#db2777", "#ea580c", "#4f46e5", "#65a30d", "#b45309"];
let SECTION_COLORS = new Map();
function sectionLabelOf(o) { const s = sectionFromObj(o); return s ? (s.short + " " + s.designation) : ""; }
function rebuildSectionColors() {
  SECTION_COLORS = new Map(); let i = 0;
  const add = (lab) => { if (lab && !SECTION_COLORS.has(lab)) SECTION_COLORS.set(lab, SECTION_PALETTE[i++ % SECTION_PALETTE.length]); };
  add(sectionLabelOf(COLSEC)); add(sectionLabelOf(BASESEC)); ARMS.forEach((a) => add(sectionLabelOf(a)));
}
function colorForLabel(lab) { return SECTION_COLORS.get(lab) || "#64748b"; }
function colorForObj(o) { return colorForLabel(sectionLabelOf(o)); }
function tintColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.round(c + (255 - c) * amt);
  return "rgb(" + m(r) + "," + m(g) + "," + m(b) + ")";
}
function shadeColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.round(c * (1 - amt));
  return "rgb(" + m(r) + "," + m(g) + "," + m(b) + ")";
}
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop(); return lower.concat(upper);
}
function memberDimsMax() {
  let mx = 0;
  const consider = (o) => { const d = dimsFor(o); if (d) mx = Math.max(mx, d.h || 0, d.b || 0); };
  consider(COLSEC); consider(BASESEC); ARMS.forEach(consider);
  return mx || 1;
}

/* ---------------- Section glyph (true-scale, colour-coded) ---------------- */
function drawSectionGlyph(svg, dims, axis, opts) {
  opts = opts || {};
  svg.replaceChildren();
  if (!dims || !Number.isFinite(dims.h) || !Number.isFinite(dims.b)) return;
  const pad = 22, box = 150 - 2 * pad, cx = 75, cy = 75;
  // common scale across all members -> a deeper/larger section renders larger
  const sc = opts.commonMax ? (box / opts.commonMax) : Math.min(box / dims.h, box / dims.b);
  const dh = dims.h * sc, db = dims.b * sc;
  const x0 = cx - db / 2, y0 = cy - dh / 2;
  const ink = opts.color || "#1e2a37", fill = tintColor(opts.color || "#9fb0c2", 0.74);
  if (dims.kind === "I") {
    const tf = Math.max(dims.tf * sc, 1.1), tw = Math.max(dims.tw * sc, 1.1);
    gRect(svg, x0, y0, db, tf, fill, ink);
    gRect(svg, x0, y0 + dh - tf, db, tf, fill, ink);
    gRect(svg, cx - tw / 2, y0 + tf, tw, dh - 2 * tf, fill, ink);
  } else if (dims.kind === "channel") {
    const tf = Math.max(dims.tf * sc, 1.1), tw = Math.max(dims.tw * sc, 1.1);
    gRect(svg, x0, y0, tw, dh, fill, ink);
    gRect(svg, x0, y0, db, tf, fill, ink);
    gRect(svg, x0, y0 + dh - tf, db, tf, fill, ink);
  } else {
    const t = Math.max(dims.t * sc, 1.1);
    gRect(svg, x0, y0, db, dh, fill, ink);
    gRect(svg, x0 + t, y0 + t, db - 2 * t, dh - 2 * t, "#ffffff", ink);
  }
  const yyActive = axis !== "minor";
  gAxis(svg, x0 - 8, cy, x0 + db + 8, cy, yyActive);
  gAxis(svg, cx, y0 - 8, cx, y0 + dh + 8, !yyActive);
  gAxisLabel(svg, x0 + db + 10, cy + 4, "y", yyActive);
  gAxisLabel(svg, cx - 3, y0 - 11, "z", !yyActive);
}
// Redraw every member glyph + colour dot on one shared scale (no picker rebuild -> keeps focus)
function refreshAllGlyphs() {
  rebuildSectionColors();
  const cm = memberDimsMax();
  const cg = $("colGlyph"); if (cg) drawSectionGlyph(cg, dimsFor(COLSEC), COLSEC.axis, { commonMax: cm, color: colorForObj(COLSEC) });
  const bg = $("baseGlyph"); if (bg) drawSectionGlyph(bg, dimsFor(BASESEC), BASESEC.axis, { commonMax: cm, color: colorForObj(BASESEC) });
  const cards = $("armsList") ? $("armsList").querySelectorAll(".armcard") : [];
  ARMS.forEach((arm, i) => {
    const card = cards[i]; if (!card) return;
    const gl = card.querySelector(".mglyph"); if (gl) drawSectionGlyph(gl, dimsFor(arm), arm.axis, { commonMax: cm, color: colorForObj(arm) });
    const dot = card.querySelector(".dotmark"); if (dot) dot.style.background = colorForObj(arm);
  });
  renderSectionLegend();
}
function renderSectionLegend() {
  const box = $("sectionLegend"); if (!box) return;
  box.replaceChildren();
  if (!SECTION_COLORS.size) return;
  const t = document.createElement("span"); t.className = "leg-title"; t.textContent = "Members by section:";
  box.appendChild(t);
  SECTION_COLORS.forEach((color, label) => {
    const chip = document.createElement("span"); chip.className = "leg-chip";
    const sw = document.createElement("span"); sw.className = "leg-sw"; sw.style.background = color;
    const tx = document.createElement("span"); tx.textContent = label;
    chip.append(sw, tx); box.appendChild(chip);
  });
}
function gRect(svg, x, y, w, h, fill, stroke) {
  if (w <= 0 || h <= 0) return;
  svg.appendChild(svgEl("rect", { x, y, width: w, height: h, fill, stroke, "stroke-width": 1.4 }));
}
function gAxis(svg, x1, y1, x2, y2, active) {
  svg.appendChild(svgEl("line", { x1, y1, x2, y2, stroke: active ? "#2c66a8" : "#9fb0c2", "stroke-width": active ? 1.8 : 1, "stroke-dasharray": "4 3" }));
}
function gAxisLabel(svg, x, y, t, active) {
  const el = svgEl("text", { x, y, fill: active ? "#1f4e88" : "#9fb0c2", "font-size": 11, "font-family": "monospace", "font-weight": 700, "text-anchor": "middle" });
  el.textContent = t; svg.appendChild(el);
}

/* ---------------- Member section controls ---------------- */
function mkSelect(opts, val) { const sel = document.createElement("select"); fillSelect(sel, opts, val); return sel; }
function fillSelect(sel, opts, val) {
  sel.replaceChildren();
  opts.forEach((o) => { const opt = document.createElement("option"); opt.value = o[0]; opt.textContent = o[1]; sel.appendChild(opt); });
  if (val != null && [...sel.options].some((o) => o.value === val)) sel.value = val;
  else if (sel.options.length) sel.value = sel.options[0].value;
}
function buildPicker(container, secObj, onAny) {
  container.replaceChildren();
  const wrap = document.createElement("div"); wrap.className = "picker";
  const g = mkSelect(availableGroups().map((x) => [x.id, x.short]), secObj.group);
  const s = mkSelect(listDesignations(secObj.group).map((d) => [d, d]), secObj.designation);
  const a = mkSelect([["major", "y-y"], ["minor", "z-z"]], secObj.axis);
  g.title = "Family"; s.title = "Designation"; a.title = "Bending axis";
  secObj.group = g.value; secObj.designation = s.value; secObj.axis = a.value;
  wrap.append(g, s, a); container.appendChild(wrap);
  g.addEventListener("change", () => { secObj.group = g.value; fillSelect(s, listDesignations(secObj.group).map((d) => [d, d]), pickDefault(secObj.group, "beam")); secObj.designation = s.value; onAny(); });
  s.addEventListener("change", () => { secObj.designation = s.value; onAny(); });
  a.addEventListener("change", () => { secObj.axis = a.value; onAny(); });
}
function updateSummary(el, secObj) {
  rebuildSectionColors();
  if (!el) return;
  const sec = sectionFromObj(secObj);
  if (!sec) { el.innerHTML = '<span class="mdes">\u2014</span>'; return; }
  rebuildSectionColors();
  const c = colorForObj(secObj);
  el.innerHTML = '<span class="secdot" style="background:' + c + '"></span><span class="mdes">' + sec.short + " " + sec.designation + "</span>" +
    '<span class="mdim">' + dimCaption(sec) + "</span>" +
    "I<sub>" + (sec.axis === "minor" ? "z" : "y") + "</sub> <b>" + fmt(sec.I_cm4, 0) + "</b> cm\u2074 \u00B7 A <b>" + fmt(sec.A_cm2, 1) + "</b> cm\u00B2 \u00B7 <b>" + fmt(sec.mass, 1) + "</b> kg/m";
}
function dimCaption(sec) {
  const d = sec && sec.dims; if (!d) return "";
  if (d.kind === "box") return "\u25A1 <b>" + fmt(d.h, 0) + "\u00D7" + fmt(d.b, 0) + "</b> \u00D7 t <b>" + fmt(d.t, 1) + "</b> mm";
  return "d\u00D7b <b>" + fmt(d.h, 1) + "\u00D7" + fmt(d.b, 1) + "</b> \u00B7 t<sub>w</sub>/t<sub>f</sub> <b>" + fmt(d.tw, 1) + "/" + fmt(d.tf, 1) + "</b> mm";
}
function renderSectionControl(picker, glyph, summary, secObj, onChange) {
  const refresh = () => { updateSummary(summary, secObj); refreshAllGlyphs(); onChange(); };
  buildPicker(picker, secObj, refresh);
  updateSummary(summary, secObj);
  refreshAllGlyphs();
}
function renderColumnSection() { renderSectionControl($("colPicker"), $("colGlyph"), $("colSummary"), COLSEC, run); }
function renderBaseSection() { renderSectionControl($("basePicker"), $("baseGlyph"), $("baseSummary"), BASESEC, run); }
function defaultArmSection() { const g = firstAvailable(["UB", "UC", "SHS", "RHS"]); return { group: g, designation: pickDefault(g, "beam"), axis: "major" }; }
function makeStepper(input) {
  const wrap = document.createElement("div"); wrap.className = "numwrap";
  const dec = document.createElement("button"); dec.type = "button"; dec.className = "stepbtn"; dec.textContent = "\u2212"; dec.tabIndex = -1; dec.setAttribute("aria-label", "decrease");
  const inc = document.createElement("button"); inc.type = "button"; inc.className = "stepbtn"; inc.textContent = "+"; inc.tabIndex = -1; inc.setAttribute("aria-label", "increase");
  const bump = (dir) => {
    const step = Number(input.step) || 1;
    let v = (Number(input.value) || 0) + dir * step;
    v = Math.round(v * 1e6) / 1e6;
    if (input.hasAttribute("min") && input.min !== "") v = Math.max(v, Number(input.min));
    input.value = String(v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  dec.addEventListener("click", () => bump(-1));
  inc.addEventListener("click", () => bump(1));
  wrap.append(dec, input, inc);   // moves input into wrap
  return wrap;
}
function enhanceStaticSteppers() { /* steppers removed — number fields are plain type-in inputs */ }
const CARD_ICONS = [
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 3h8M4 13h8M8 3v10"/></svg>',
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 7h11M4 11l1.4-2M12 11l-1.4-2"/></svg>',
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 2.5v11M4 5.5h9M4 10.5h9"/></svg>',
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5v8M5 10.5l-2-2.5M5 10.5l2-2.5M11 2.5v8M11 10.5l-2-2.5M11 10.5l2-2.5M2 13.5h12"/></svg>',
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v5.5"/><path d="M4.7 13L8 8 11.3 13z"/><path d="M3 13h10"/></svg>'
];
function setupCollapsibles() {
  document.querySelectorAll(".rail .card").forEach((card, i) => {
    const head = card.querySelector(".card-head");
    if (!head || head.dataset.collapsible) return;
    head.dataset.collapsible = "1";
    head.classList.add("card-toggle");
    const eyebrow = head.querySelector(".eyebrow"), h2 = head.querySelector("h2");
    const htext = document.createElement("div"); htext.className = "htext";
    if (eyebrow) htext.appendChild(eyebrow);
    if (h2) htext.appendChild(h2);
    const icon = document.createElement("span"); icon.className = "card-ico"; icon.innerHTML = CARD_ICONS[i] || CARD_ICONS[0];
    const chev = document.createElement("span"); chev.className = "chev"; chev.setAttribute("aria-hidden", "true");
    head.replaceChildren(icon, htext, chev);
    const toggle = () => card.classList.toggle("collapsed");
    head.addEventListener("click", toggle);
    head.setAttribute("role", "button"); head.tabIndex = 0;
    head.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });
}
function numField(label, unit, value, step, onChange) {
  const lab = document.createElement("label");
  const span = document.createElement("span");
  span.innerHTML = label + ' <span class="u">' + unit + "</span>";
  const inp = document.createElement("input");
  inp.type = "number"; inp.step = String(step); inp.value = String(value);
  inp.addEventListener("change", () => onChange(Number(inp.value)));
  lab.append(span, inp);
  return lab;
}
function numMini(value, step, ph, onChange) {
  const inp = document.createElement("input");
  inp.type = "number"; inp.step = String(step); inp.value = String(value); if (ph) inp.placeholder = ph;
  inp.addEventListener("change", () => onChange(Number(inp.value)));
  return inp;
}
function renderPointLoads(container, loads, getMax, onChange) {
  container.replaceChildren();
  container.className = "plblock";
  const head = document.createElement("div"); head.className = "plhead"; head.textContent = "Point loads along span";
  container.appendChild(head);
  if (loads.length) {
    const cols = document.createElement("div"); cols.className = "plcols";
    cols.innerHTML = "<span>dist from column (mm)</span><span>load (kN \u2193)</span><span></span>";
    container.appendChild(cols);
  }
  loads.forEach((ld, i) => {
    const row = document.createElement("div"); row.className = "plrow";
    row.appendChild(numMini(ld.a, 25, "mm", (v) => { ld.a = v; onChange(); }));
    row.appendChild(numMini(ld.P, 0.5, "kN", (v) => { ld.P = v; onChange(); }));
    const del = document.createElement("button"); del.className = "rowdel"; del.type = "button"; del.textContent = "\u00D7"; del.title = "Remove load";
    del.addEventListener("click", () => { loads.splice(i, 1); renderPointLoads(container, loads, getMax, onChange); onChange(); });
    row.appendChild(del);
    container.appendChild(row);
  });
  const add = document.createElement("button"); add.className = "btn btn-ghost btn-xs"; add.type = "button"; add.textContent = "+ point load";
  add.addEventListener("click", () => { const mx = getMax() || 1000; loads.push({ a: Math.round(mx * 0.5), P: 5 }); renderPointLoads(container, loads, getMax, onChange); onChange(); });
  container.appendChild(add);
}
function renderBaseLoads() { if ($("baseLoadsWrap")) renderPointLoads($("baseLoadsWrap"), BASELOADS, () => safeNum("baseLen") || 2400, run); }
function renderArms() {
  const list = $("armsList");
  list.replaceChildren();
  ARMS.sort((a, b) => (Number(a.h) || 0) - (Number(b.h) || 0));   // bottom-up: lowest arm first
  ARMS.forEach((arm, idx) => {
    if (arm.len == null) arm.len = 2400;
    if (arm.pos == null) arm.pos = arm.len;
    const card = document.createElement("div"); card.className = "armcard";
    const head = document.createElement("div"); head.className = "armcard-head";
    const title = document.createElement("div"); title.className = "armcard-title";
    title.innerHTML = '<span class="dotmark"></span>Beam ' + (idx + 2);
    const del = document.createElement("button"); del.className = "rowdel"; del.type = "button"; del.textContent = "\u00D7"; del.title = "Remove beam";
    del.addEventListener("click", () => { ARMS.splice(idx, 1); renderArms(); run(); });
    head.append(title, del); card.appendChild(head);
    const fields = document.createElement("div"); fields.className = "arm-fields";
    fields.appendChild(numField("Level", "mm", arm.h, 50, (v) => { arm.h = v; renderArms(); run(); }));
    fields.appendChild(numField("Length", "mm", arm.len, 50, (v) => { arm.len = v; renderArms(); run(); }));
    fields.appendChild(numField("Point P", "kN", arm.P, 0.5, (v) => { arm.P = v; run(); }));
    fields.appendChild(numField("Load pos.", "mm", arm.pos, 50, (v) => { arm.pos = v; run(); }));
    card.appendChild(fields);
    const picker = document.createElement("div");
    card.appendChild(picker);
    list.appendChild(card);
    renderSectionControl(picker, null, null, arm, run);
  });
}

/* ---------------- Section library tab ---------------- */
function renderLibrary() {
  const gid = $("libGroup").value, g = groupCfg(gid), ds = groupDataset(gid);
  const filter = ($("libFilter").value || "").toLowerCase().trim();
  let rows = ds.sections;
  if (filter) rows = rows.filter((s) => s.section_designation.toLowerCase().includes(filter));
  $("libCount").textContent = rows.length + " of " + ds.sections.length + " sections";
  const tbl = document.createElement("table");
  tbl.className = "data";
  const heads = ["Designation", "Mass kg/m", "A cm\u00B2", "Iy cm\u2074", "Iz cm\u2074", "Wpl,y cm\u00B3", "iy cm", "Assign"];
  const thead = document.createElement("thead"), trh = document.createElement("tr");
  heads.forEach((hd) => { const th = document.createElement("th"); th.textContent = hd; trh.appendChild(th); });
  thead.appendChild(trh); tbl.appendChild(thead);
  const tb = document.createElement("tbody");
  rows.forEach((s) => {
    const tr = document.createElement("tr");
    const cells = [s.section_designation, fmt(s.mass_per_metre_kg_per_m, 1), fmt(s.area_A_cm2, 1), fmt(s[g.iyKey], 0), fmt(s[g.izKey], 0), fmt(s[g.wplyKey], 0), fmt(s[g.iyrKey], 2)];
    cells.forEach((c) => { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); });
    const tdA = document.createElement("td");
    const wrap = document.createElement("div"); wrap.className = "lib-act";
    const mk = (label, target) => { const b = document.createElement("button"); b.className = "pill"; b.type = "button"; b.textContent = label; b.addEventListener("click", () => assignFromLibrary(target, gid, s.section_designation)); return b; };
    wrap.append(mk("\u2192 Col", "col"), mk("\u2192 Base", "base"), mk("\u2192 Arms", "arms"));
    tdA.appendChild(wrap); tr.appendChild(tdA);
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);
  $("libTable").replaceChildren(tbl);
}
function assignFromLibrary(target, gid, des) {
  if (target === "col") { COLSEC = { group: gid, designation: des, axis: "major" }; renderColumnSection(); }
  else if (target === "base") { BASESEC = { group: gid, designation: des, axis: "major" }; renderBaseSection(); }
  else { ARMS.forEach((a) => { a.group = gid; a.designation = des; a.axis = "major"; }); renderArms(); }
  run();
  $("statusText").textContent = "Assigned " + des + " to " + (target === "col" ? "columns" : target === "base" ? "the base beam" : "all arms");
}

/* ---------------- Frame3DD export (verified) ---------------- */
function makeFrame3DD(result) {
  const E = result.input.E, nu = 0.3, G = E / (2 * (1 + nu));
  const lines = [];
  lines.push("RackFrame2D export: 2D rack model in X-Y plane, units N and mm");
  lines.push("# Generated by RackFrame2D. Source solver: direct stiffness; format follows pslack/frame3dd examples.");
  lines.push("# Member end releases are not native in Frame3DD input. Released members are flagged below.");
  lines.push("# Distributed (UDL) member loads are exported as work-equivalent NODAL loads, not native");
  lines.push("# Frame3DD uniform loads. Nodal displacements will match RackFrame2D; member internal force");
  lines.push("# diagrams within a UDL-loaded member read linear in Frame3DD (no parabolic term).");
  lines.push("");
  lines.push(result.nodes.length + " # number of nodes");
  lines.push("#.node x y z r");
  result.nodes.forEach((n) => lines.push(n.id + " " + n.x + " " + n.y + " 0 0"));
  lines.push("");
  lines.push(result.nodes.length + " # number of nodes with reactions");
  lines.push("#.n x y z xx yy zz 1=fixed, 0=free");
  result.nodes.forEach((n) => {
    const rx = result.restraints[dofIndex(n.id, 0)] ? 1 : 0;
    const ry = result.restraints[dofIndex(n.id, 1)] ? 1 : 0;
    const rzz = result.restraints[dofIndex(n.id, 2)] ? 1 : 0;
    lines.push(n.id + " " + rx + " " + ry + " 1 1 1 " + rzz);
  });
  lines.push("");
  lines.push(result.elements.length + " # number of frame elements");
  lines.push("#e n1 n2 Ax Asy Asz Jxx Iyy Izz E G roll density");
  result.elements.forEach((el) => {
    const releaseNote = (el.releases.rzI || el.releases.rzJ) ? " # RELEASED IN RackFrame2D" : "";
    const J = Math.max(el.I * 2, 1e-9);
    lines.push(el.id + " " + el.i + " " + el.j + " " + el.A + " " + el.A + " " + el.A + " " + J + " " + el.I + " " + el.I + " " + E + " " + G + " 0 0" + releaseNote);
  });
  lines.push("");
  lines.push("0 # 1: include shear deformation");
  lines.push("0 # 1: include geometric stiffness");
  lines.push("40 # exaggerate mesh deformations");
  lines.push("1 # zoom scale for 3D plotting");
  lines.push(Math.max(result.input.maxReach / 20, 25).toFixed(6) + " # x-axis increment for internal forces");
  lines.push("");
  lines.push("1 # number of static load cases");
  lines.push("# Begin Static Load Case 1 of 1");
  lines.push("0 0 0 # gravitational acceleration for self-weight loading");
  const nodal = new Map();
  function addNodeLoad(node, fx, fy, mzz) {
    const prev = nodal.get(node) || { fx: 0, fy: 0, mzz: 0 };
    prev.fx += fx; prev.fy += fy; prev.mzz += mzz; nodal.set(node, prev);
  }
  (result.pointLoadMarks || []).forEach((m) => { if (m.P) addNodeLoad(m.nodeId, 0, -m.P, 0); });
  result.elements.forEach((el) => {
    if (!el.qLocalY) return;
    const f = uniformEquivalent(el.qLocalY, el.L);
    addNodeLoad(el.i, 0, f[1], f[2]);
    addNodeLoad(el.j, 0, f[4], f[5]);
  });
  const loaded = [...nodal.entries()].filter((e) => Math.abs(e[1].fx) + Math.abs(e[1].fy) + Math.abs(e[1].mzz) > 1e-9);
  lines.push(loaded.length + " # number of loaded nodes");
  lines.push("#.n Fx Fy Fz Mxx Myy Mzz");
  loaded.forEach((e) => lines.push(e[0] + " " + e[1].fx + " " + e[1].fy + " 0 0 0 " + e[1].mzz));
  lines.push("0 # number of uniform loads");
  lines.push("0 # number of trapezoidal loads");
  lines.push("0 # number of internal concentrated loads");
  lines.push("0 # number of temperature loads");
  lines.push("0 # number of nodes with prescribed displacements");
  lines.push("# End Static Load Case 1 of 1");
  lines.push("0 # number of dynamic modes");
  lines.push("# End of input data file");
  return lines.join("\n");
}

/* ---------------- SVG helpers ---------------- */
function svgEl(name, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
  return el;
}
function line(svg, x1, y1, x2, y2, stroke, width, opacity) {
  const el = svgEl("line", { x1, y1, x2, y2, stroke, "stroke-width": width, "stroke-linecap": "round", opacity });
  svg.appendChild(el); return el;
}
function rect(svg, x, y, w, h, fill, stroke) {
  svg.appendChild(svgEl("rect", { x, y, width: w, height: h, fill, stroke: stroke || "none", "stroke-width": 1 }));
}
function circle(svg, cx, cy, r, fill, stroke) {
  svg.appendChild(svgEl("circle", { cx, cy, r, fill, stroke, "stroke-width": 2 }));
}
function path(svg, d, fill, stroke, width, opacity) {
  svg.appendChild(svgEl("path", { d, fill, stroke, "stroke-width": width, "stroke-linejoin": "round", opacity }));
}
function polyline(svg, points, stroke, width) {
  svg.appendChild(svgEl("polyline", { points, fill: "none", stroke, "stroke-width": width, "stroke-linejoin": "round", "stroke-linecap": "round" }));
}
function text(svg, x, y, content, fill, size, anchor) {
  const el = svgEl("text", { x, y, fill, "font-size": size, "text-anchor": anchor, "font-family": "Segoe UI, Arial, sans-serif" });
  el.textContent = content; svg.appendChild(el);
}
function labelText(svg, x, y, content, fill, size, anchor, weight) {
  const el = svgEl("text", { x, y, fill, "font-size": size, "text-anchor": anchor, "font-family": "Segoe UI, Arial, sans-serif", "font-weight": weight || 600, stroke: "#ffffff", "stroke-width": 3.4, "stroke-linejoin": "round", "paint-order": "stroke" });
  el.textContent = content; svg.appendChild(el);
}
function hinge(svg, x, y) { circle(svg, x, y, 5.5, "#ffffff", "#b06f0f"); }
function arrow(svg, x1, y1, x2, y2, color, label) {
  line(svg, x1, y1, x2, y2, color, 3, 1);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const a1 = angle + Math.PI * 0.78, a2 = angle - Math.PI * 0.78, r = 11;
  path(svg, "M " + x2 + " " + y2 + " L " + (x2 + Math.cos(a1) * r) + " " + (y2 + Math.sin(a1) * r) + " M " + x2 + " " + y2 + " L " + (x2 + Math.cos(a2) * r) + " " + (y2 + Math.sin(a2) * r), "none", color, 3, 1);
  text(svg, x1 + 6, y1 - 6, label, color, 12, "start");
}
function downloadText(filename, txt) {
  const blob = new Blob([txt], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}

/* ---------------- Section defaults ---------------- */
const PREF_COL = { UB: "457 x 191 x 67", UC: "203 x 203 x 71", RHS: "200 x 200 x 10", SHS: "200 x 200 x 10", PFC: "300 x 100 x 46", SHSCF: "200 x 200 x 10.0" };
const PREF_BEAM = { UB: "356 x 171 x 51", UC: "152 x 152 x 37", RHS: "200 x 100 x 8", SHS: "150 x 150 x 8", PFC: "230 x 75 x 26", SHSCF: "150 x 150 x 8.0" };
function groupAvailable(id) { const c = groupCfg(id); return !!(c && globalThis[c.global] && globalThis[c.global].sections && globalThis[c.global].sections.length); }
function availableGroups() { return SECTION_GROUPS.filter((g) => groupAvailable(g.id)); }
function firstAvailable(pref) { const a = availableGroups().map((g) => g.id); for (let i = 0; i < pref.length; i++) if (a.includes(pref[i])) return pref[i]; return a[0]; }
function pickDefault(gid, role) {
  const list = listDesignations(gid);
  const sub = (role === "col" ? PREF_COL : PREF_BEAM)[gid] || "";
  return list.find((d) => d.includes(sub)) || list[Math.floor(list.length / 2)] || list[0];
}

/* ---------------- Run / errors / reset ---------------- */
function run() {
  try {
    const input = readModelFromUI();
    const frame = buildFrame(input);
    const result = analyze(frame);
    render(result);
  } catch (err) {
    showError(err.message);
  }
}
function showError(msg) {
  $("errorBox").textContent = msg;
  $("errorBox").classList.add("show");
  $("statusDot").className = "dot err";
  $("statusText").textContent = "Check input";
}
function hideError() { $("errorBox").classList.remove("show"); }

function initDefaults() {
  const cg = firstAvailable(["UC", "UB", "RHS", "SHS"]);
  const bg = firstAvailable(["UB", "UC", "SHS", "RHS"]);
  COLSEC = { group: cg, designation: pickDefault(cg, "col"), axis: "major" };
  BASESEC = { group: bg, designation: pickDefault(bg, "beam"), axis: "major" };
  ARMS.length = 0; armSeq = 0; BASELOADS.length = 0;
  ARMS.push({ id: ++armSeq, h: 1500, len: 2400, P: 8, pos: 2400, group: bg, designation: pickDefault(bg, "beam"), axis: "major" });
  ARMS.push({ id: ++armSeq, h: 3000, len: 2400, P: 8, pos: 2400, group: bg, designation: pickDefault(bg, "beam"), axis: "major" });
}
function resetDefaults() {
  $("columnHeight").value = 3600; $("baseLen").value = 2400; $("E").value = 210000;
  $("leftSupport").value = "fixed"; $("rightSupport").value = "pin"; $("bottomRelease").value = "both";
  $("defScale").value = 0; $("colQueryY").value = 3600;
  if ($("includeSW")) $("includeSW").checked = true; if ($("gammaG")) $("gammaG").value = "1.35"; if ($("gammaQ")) $("gammaQ").value = "1.50";
  initDefaults();
  renderColumnSection(); renderBaseSection(); renderArms(); renderBaseLoads();
  run();
}

/* ---------------- Init ---------------- */
/* ---------------- Dynamic model visualization ---------------- */
function memberPeaks(el) {
  const steps = 32; let M = 0, V = 0, N = 0;
  for (let i = 0; i <= steps; i++) {
    const d = diagramValue(el, el.L * i / steps);
    if (Math.abs(d.M) > Math.abs(M)) M = d.M;
    if (Math.abs(d.V) > Math.abs(V)) V = d.V;
    if (Math.abs(d.N) > Math.abs(N)) N = d.N;
  }
  return { M: -M * NMM_TO_KNM, V: V * N_TO_KN, N: -N * N_TO_KN };
}
function showMemberTip(e, el) {
  const tipEl = $("modelTip"); if (!tipEl) return;
  const p = memberPeaks(el);
  const stage = tipEl.parentElement, r = stage.getBoundingClientRect();
  tipEl.innerHTML = '<div class="tt-title">' + el.name + '</div>' +
    (el.sectionLabel ? '<div class="tt-sec">' + el.sectionLabel + '</div>' : '') +
    '<div class="tt-row"><span>M peak</span><span>' + fmt(p.M, 1) + ' kN\u00B7m</span></div>' +
    '<div class="tt-row"><span>V peak</span><span>' + fmt(p.V, 1) + ' kN</span></div>' +
    '<div class="tt-row"><span>Axial</span><span>' + fmt(p.N, 1) + ' kN</span></div>';
  tipEl.style.left = (e.clientX - r.left) + "px";
  tipEl.style.top = (e.clientY - r.top) + "px";
  tipEl.hidden = false;
}
function hideTip() { const t = $("modelTip"); if (t) t.hidden = true; }
function attachMemberInteraction(ln, result, el, idx) {
  ln.addEventListener("mouseenter", () => { if (!ANIM.on) { ln.setAttribute("stroke", "#2c66a8"); ln.setAttribute("stroke-width", "6.5"); } });
  ln.addEventListener("mousemove", (e) => showMemberTip(e, el));
  ln.addEventListener("mouseleave", () => { hideTip(); if (!ANIM.on && idx !== SELMEM) { ln.setAttribute("stroke", "#1e2a37"); ln.setAttribute("stroke-width", "4.5"); } });
  ln.addEventListener("click", (e) => {
    e.stopPropagation(); SELMEM = idx;
    const sel = $("memberSelect");
    if (sel) { sel.value = logicalKey(el.name); if (lastResult) renderDiagram(lastResult); }
    renderModelSvg(result);
  });
}
function resetView() { modelFitPending = true; if (lastResult) renderModelSvg(lastResult); }
function wireCanvas() {
  const svg = $("modelSvg"); if (!svg) return;
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect(), w = r.width || 1, h = r.height || 1;
    const ux = VB[0] + (e.clientX - r.left) / w * VB[2], uy = VB[1] + (e.clientY - r.top) / h * VB[3];
    const f = e.deltaY < 0 ? 0.86 : 1.16;
    const nw = Math.min(4000, Math.max(120, VB[2] * f)), nh = Math.min(2480, Math.max(74, VB[3] * f));
    VB = [ux - (ux - VB[0]) * (nw / VB[2]), uy - (uy - VB[1]) * (nh / VB[3]), nw, nh];
    svg.setAttribute("viewBox", VB.join(" "));
  }, { passive: false });
  let pan = null;
  svg.addEventListener("pointerdown", (e) => {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-mi")) return;
    pan = { x: e.clientX, y: e.clientY, vb: VB.slice() }; svg.style.cursor = "grabbing";
    try { svg.setPointerCapture(e.pointerId); } catch (x) {}
  });
  svg.addEventListener("pointermove", (e) => {
    if (!pan) return;
    const r = svg.getBoundingClientRect();
    const dx = (e.clientX - pan.x) / (r.width || 1) * pan.vb[2], dy = (e.clientY - pan.y) / (r.height || 1) * pan.vb[3];
    VB = [pan.vb[0] - dx, pan.vb[1] - dy, pan.vb[2], pan.vb[3]];
    svg.setAttribute("viewBox", VB.join(" "));
  });
  const endPan = () => { pan = null; const s = $("modelSvg"); if (s) s.style.cursor = ""; };
  svg.addEventListener("pointerup", endPan);
  svg.addEventListener("pointerleave", endPan);
}
function animLoop(now) {
  if (!ANIM.on) return;
  if (!ANIM.t0) ANIM.t0 = now;
  const t = ((now - ANIM.t0) / 1500) % 1;
  ANIM.phase = 0.5 - 0.5 * Math.cos(t * 2 * Math.PI);
  if (lastResult) renderModelSvg(lastResult);
  ANIM.raf = requestAnimationFrame(animLoop);
}
function toggleAnim() {
  const btn = $("animBtn");
  ANIM.on = !ANIM.on;
  if (ANIM.on) {
    if (typeof requestAnimationFrame !== "function") { ANIM.on = false; return; }
    if (btn) { btn.innerHTML = "\u275A\u275A Pause"; btn.classList.add("is-on"); }
    ANIM.t0 = 0; ANIM.raf = requestAnimationFrame(animLoop);
  } else {
    if (btn) { btn.innerHTML = "\u25B6 Animate"; btn.classList.remove("is-on"); }
    if (ANIM.raf) cancelAnimationFrame(ANIM.raf);
    ANIM.phase = 1; if (lastResult) renderModelSvg(lastResult);
  }
}

function init() {
  const libG = firstAvailable(["UB", "UC", "RHS", "SHS"]);
  fillSelect($("libGroup"), availableGroups().map((g) => [g.id, g.short + " \u2014 " + g.label]), libG);
  initDefaults();
  renderColumnSection();
  renderBaseSection();
  renderArms();
  renderBaseLoads();
  renderLibrary();
  setupCollapsibles();
  enhanceStaticSteppers();

  ["columnHeight", "baseLen", "E", "leftSupport", "rightSupport", "bottomRelease", "defScale", "colQueryY", "baseUDL", "baseP", "gammaG", "gammaQ", "includeSW"].forEach((id) => { const el = $(id); if (el) el.addEventListener("change", run); });

  $("addArm").addEventListener("click", () => {
    const last = ARMS.length ? ARMS[ARMS.length - 1].h : 0;
    const lastLen = ARMS.length ? (Number(ARMS[ARMS.length - 1].len) || 2400) : 2400;
    const def = defaultArmSection();
    ARMS.push({ id: ++armSeq, h: Math.round(last + 1500), len: lastLen, P: 8, pos: lastLen, group: def.group, designation: def.designation, axis: def.axis });
    renderArms(); run();
  });

  $("libGroup").addEventListener("change", renderLibrary);
  $("libFilter").addEventListener("input", renderLibrary);

  document.querySelectorAll(".tab").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "diagramTab" && lastResult) { renderSystemDiagram(lastResult, "M", "sysM", 620, "bmdMax"); renderSystemDiagram(lastResult, "V", "sysV", 620, "sfdMax"); }
  }));

  document.querySelectorAll("#forceSeg .segbtn").forEach((b) => b.addEventListener("click", () => {
    systemForce = b.dataset.force;
    document.querySelectorAll("#forceSeg .segbtn").forEach((x) => x.classList.toggle("active", x === b));
    if (lastResult) renderSystemDiagram(lastResult, systemForce);
  }));

  $("runBtn").addEventListener("click", run);
  $("resetBtn").addEventListener("click", resetDefaults);
  document.querySelectorAll(".subtab").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll(".subtab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".subpanel").forEach((p) => p.classList.remove("active"));
    const panel = $(btn.dataset.sub); if (panel) panel.classList.add("active");
    if (lastResult) {
      if (btn.dataset.sub === "sfdPanel") renderSystemDiagram(lastResult, "V", "sysV", 620, "sfdMax");
      else renderSystemDiagram(lastResult, "M", "sysM", 620, "bmdMax");
    }
  }));
  const msSel = $("memberSelect"); if (msSel) msSel.addEventListener("change", () => lastResult && renderDiagram(lastResult));
  $("download3dd").addEventListener("click", () => lastResult && downloadText("rackframe2d.3dd", lastResult.frame3dd));
  $("downloadJson").addEventListener("click", () => lastResult && downloadText("rackframe2d-results.json", JSON.stringify(lastResult, (k, v) => (k === "K" || k === "kLocal" || k === "fLocal" || k === "T" || k === "condensed") ? undefined : v, 2)));
  $("copy3dd").addEventListener("click", async () => { if (lastResult && navigator.clipboard) await navigator.clipboard.writeText(lastResult.frame3dd); });
  wireCanvas();
  if ($("animBtn")) $("animBtn").addEventListener("click", toggleAnim);
  if ($("resetView")) $("resetView").addEventListener("click", resetView);
  if ($("extrudeBtn")) $("extrudeBtn").addEventListener("click", () => {
    EXTRUDE = !EXTRUDE;
    const b = $("extrudeBtn");
    b.textContent = EXTRUDE ? "Line view" : "Extrude";
    b.classList.toggle("active", EXTRUDE);
    if (lastResult) renderModelSvg(lastResult);
  });
  if ($("defMult")) $("defMult").addEventListener("input", () => { DEFMULT = Number($("defMult").value); $("defMultVal").textContent = "\u00D7" + DEFMULT.toFixed(1); if (lastResult) renderModelSvg(lastResult); });

  run();
}

globalThis.RACK_ANALYSIS_ENGINE = {
  buildFrame,
  analyze,
  dofIndex,
  diagramValue,
  supportRestraints,
  frameLocalStiffness,
  condenseReleases
};

if (typeof document !== "undefined") init();
