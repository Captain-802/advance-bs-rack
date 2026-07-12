/* =====================================================================
   SWL CAPACITY ENGINE  (separate from the core analysis engine)
   ---------------------------------------------------------------------
   Serviceability "safe working load" per cantilever arm, considering the
   WHOLE rack geometry.

   An equal characteristic point load is placed on EVERY cantilever arm
   simultaneously (arm 1 + arm 2 + ... + arm n), at one common distance
   from the arm root (root = the cantilever's fixed end at the column).
   The engine returns the largest such per-arm load for which the
   horizontal sway (Ux) at the governing check point stays within the
   sway limit.

   Sway limit at the check point = (height of that point above the fixed
   base) / 150.  The check point is the top arm's junction + half its beam
   depth, i.e. deflectionReport().top.halfHeight (height) and .halfUx (sway).
   So if that point sits at y = 3000 mm above the base, the limit is
   3000 / 150 = 20 mm of sway at that point.

   Method: the frame is linear-elastic, so sway scales linearly with load.
   Two solves (self-weight only, and +1 kN on every arm) give an influence
   coefficient, and the capacity follows by simple proportion. No iteration.

   This module is intentionally standalone so the core analysis engine and
   the original Delta SWL (H/150) check keep working exactly as before.

   Runtime dependencies (globals defined in analysis-engine.js):
     buildFrame, analyze, deflectionReport, $, fmt
   This script must be loaded BEFORE analysis-engine.js so its functions
   exist when the engine's first render runs.
   ===================================================================== */

var SWL_CAPACITY_RATIO = 150;

/* Equal point load on every arm at one shared distance from the root,
   clamped to each arm's own length. A blank/invalid commonPos falls back
   to each arm's own entered load position (or the tip if none). */
function swlCapacityLoadPattern(input, pointLoadKN, commonPos) {
  const hasCommon = Number.isFinite(Number(commonPos));
  const arms = input.arms.map((arm) => {
    let position;
    if (hasCommon) {
      position = Math.max(0, Math.min(arm.len, Number(commonPos)));
    } else {
      const source = arm.loads && arm.loads.length ? arm.loads[0] : null;
      position = source && Number.isFinite(Number(source.a)) ? Number(source.a) : arm.len;
    }
    return { ...arm, P: 0, loads: pointLoadKN > 0 ? [{ a: position, P: pointLoadKN * 1000 }] : [] };
  });
  return { ...input, arms, gammaQ: pointLoadKN > 0 ? 1 : 0, activeCombination: "SWL capacity probe" };
}

/* Read the shared "Load position on each arm (from root)" field. */
function readSwlCommonPos() {
  const el = typeof $ === "function" ? $("swlPos") : null;
  if (!el || el.value === "" || el.value == null) return NaN;
  const v = Number(el.value);
  return Number.isFinite(v) && v >= 0 ? v : NaN;
}

/* Core calculation. slsInput is the SLS analysis input (readModelFromUI
   output already carrying the SLS gammaG/gammaQ). options.commonPos may be
   passed explicitly (mm from root); otherwise it is read from the UI. */
function computeSwlCapacity(slsInput, options) {
  options = options || {};
  const arms = (slsInput && slsInput.arms) || [];
  if (!slsInput || !arms.length) {
    return { ok: false, reason: "Add at least one cantilever arm to calculate the SWL capacity." };
  }
  const commonPos = ("commonPos" in options) ? options.commonPos : readSwlCommonPos();

  try {
    const slsGammaG = Number(slsInput.gammaG) || 0;
    const baseInput = swlCapacityLoadPattern(slsInput, 0, commonPos);
    baseInput.gammaG = slsGammaG;
    const unitInput = swlCapacityLoadPattern(slsInput, 1, commonPos);
    unitInput.gammaG = slsGammaG;

    const baseDef = deflectionReport(analyze(buildFrame(baseInput)));
    const unitDef = deflectionReport(analyze(buildFrame(unitInput)));
    if (!baseDef.top || !unitDef.top) {
      return { ok: false, reason: "A top cantilever arm is required for the sway check." };
    }

    // Check point: top arm junction + half beam depth. Its height above the
    // fixed base sets the sway limit; the horizontal sway (Ux) there is the
    // quantity being limited.
    const checkHeight = unitDef.top.halfHeight;             // mm above base
    const limit = checkHeight / SWL_CAPACITY_RATIO;         // allowable sway (mm)

    const baseSway = Math.abs(baseDef.top.halfUx);          // self-weight sway
    const influencePerArm = Math.abs(unitDef.top.halfUx - baseDef.top.halfUx); // mm sway per 1 kN on all arms
    const qFactor = Number(slsInput.gammaQ) || 0;
    const remaining = limit - baseSway;                     // spare sway budget

    const allowable = (qFactor > 1e-12 && influencePerArm > 1e-12)
      ? Math.max(0, remaining / (qFactor * influencePerArm))
      : Infinity;

    // Position actually applied to each arm (reflects any per-arm clamping).
    const appliedPositions = unitInput.arms
      .map((a) => (a.loads && a.loads.length ? Number(a.loads[0].a) : null))
      .filter((v) => v != null && Number.isFinite(v));
    const firstPosition = appliedPositions.length ? appliedPositions[0] : null;
    const samePosition = firstPosition != null
      && appliedPositions.every((p) => Math.abs(p - firstPosition) < 1e-6);

    return {
      ok: true,
      allowable,                                            // kN per arm (characteristic)
      totalAllowable: Number.isFinite(allowable) ? allowable * arms.length : Infinity,
      limit,                                                // mm
      ratio: SWL_CAPACITY_RATIO,
      checkHeight,                                          // mm above base
      baselineSway: baseSway,
      influencePerArm,
      armCount: arms.length,
      loadPosition: samePosition ? firstPosition : null,
      commonPos: Number.isFinite(commonPos) ? commonPos : null,
      qFactor,
      extrapolated: !!unitDef.top.extrapolated
    };
  } catch (error) {
    return { ok: false, reason: "SWL capacity unavailable: " + ((error && error.message) ? error.message : error) };
  }
}

/* Render onto the existing Delta SWL card. */
function renderSwlCapacity(res) {
  const card = typeof $ === "function" ? $("swlCard") : null;
  if (!card) return;
  const f = typeof fmt === "function" ? fmt : (v, d) => Number(v).toFixed(d == null ? 2 : d);
  card.classList.toggle("is-error", !res || !res.ok);

  if (!res || !res.ok) {
    if ($("deltaSwl")) $("deltaSwl").textContent = "–";
    if ($("swlLimit")) $("swlLimit").textContent = "–";
    if ($("swlLocation")) $("swlLocation").textContent = "–";
    if ($("swlNote")) $("swlNote").textContent = (res && res.reason) ? res.reason : "SWL capacity unavailable.";
    return;
  }

  $("deltaSwl").textContent = Number.isFinite(res.allowable) ? f(res.allowable, 2) + " kN / arm" : "No finite limit";
  $("swlLimit").textContent = f(res.limit, 2) + " mm (h/" + res.ratio + ")";
  $("swlLocation").textContent = f(res.checkHeight, 0) + " mm above base" + (res.extrapolated ? " (ext)" : "");

  let position;
  if (res.loadPosition != null) {
    position = f(res.loadPosition, 0) + " mm from each arm root";
  } else if (res.commonPos != null) {
    position = f(res.commonPos, 0) + " mm from each arm root (clamped to shorter arms)";
  } else {
    position = "each arm's own load position";
  }
  const total = Number.isFinite(res.totalAllowable)
    ? " (≈ " + f(res.totalAllowable, 2) + " kN total across " + res.armCount + " arms)"
    : "";
  $("swlNote").textContent =
    "Largest equal characteristic point load on all " + res.armCount + " arm(s) at " + position + total +
    " before sway at the check point (" + f(res.checkHeight, 0) + " mm above base) reaches h/" + res.ratio +
    " = " + f(res.limit, 2) + " mm. Self-weight is included at the SLS G factor; this is a deflection-only " +
    "indication and does not replace ULS strength, connection or stability checks.";
}

/* Expose for reuse / tests. */
if (typeof globalThis !== "undefined") {
  globalThis.RACK_SWL_CAPACITY_ENGINE = {
    computeSwlCapacity,
    swlCapacityLoadPattern,
    renderSwlCapacity,
    readSwlCommonPos,
    RATIO: SWL_CAPACITY_RATIO
  };
}
