/* ===========================================================================
   CANTILEVER DESIGN BRIDGE  (rack side)
   Treats each in-range cantilever arm as a standalone built-in cantilever and
   asks the isolated CANTILEVER_DESIGN engine for its member design capacity
   (bending / shear / LTB / tip deflection to EC3 or BS 5950). The governing
   rated SWL per arm is then min( rack serviceability SWL , weakest arm's
   member design capacity ).

   Depends on globals: CANTILEVER_DESIGN (isolated bundle), $ , fmt , ARMS.
   =========================================================================== */

/* Read the member-design controls from the UI (with sensible defaults). */
function swlMemberControls() {
  const restraintEl = $("swlFlange");
  const heightEl = $("swlLoadHeight");
  const gradeEl = $("dzGrade");
  const codeEl = $("dzCode");
  return {
    restraint: restraintEl && restraintEl.value === "full" ? "full" : "ltb",
    loadHeight: heightEl ? heightEl.value : "top",   // top | shear | bottom
    grade: gradeEl ? gradeEl.value : "S275",
    code: codeEl ? (codeEl.value === "EC3" ? "EC3" : "BS5950") : "BS5950"
  };
}

/* Grades outside the engine's S275/S355/S460 table get an explicit fy (N/mm2). */
function swlPyOverride(grade) {
  if (grade === "S275" || grade === "S355" || grade === "S460") return null;
  const map = { S235: 235, S355JR: 355, S420: 420 };
  return map[grade] != null ? map[grade] : 275;
}

/* Load-height zg (mm from shear centre) for a section of depth D. */
function swlZg(loadHeight, D) {
  if (loadHeight === "shear") return 0;
  if (loadHeight === "bottom") return -(D || 0) / 2;
  return (D || 0) / 2; // top flange (destabilising) - default
}

/* Compute the member design capacity for every analysed arm. */
function computeMemberDesign(slsInput) {
  if (typeof CANTILEVER_DESIGN === "undefined" || !CANTILEVER_DESIGN) {
    return { ok: false, reason: "Member design engine not loaded." };
  }
  const arms = (slsInput && slsInput.arms) || [];
  if (!arms.length) return { ok: false, reason: "No cantilever arms to design." };

  const ctl = swlMemberControls();
  const py = swlPyOverride(ctl.grade);

  // Common load position (mm from root) entered on the SWL card; blank = tip.
  const posEl = $("swlPos");
  const rawPos = posEl && posEl.value !== "" ? Number(posEl.value) : NaN;
  const commonPos = Number.isFinite(rawPos) && rawPos >= 0 ? rawPos : null;

  // Match each analysed arm back to its ARMS entry (group + designation) by level.
  const byHeight = new Map();
  (typeof ARMS !== "undefined" ? ARMS : []).forEach((a) => {
    byHeight.set(Math.round((Number(a.h) || 0) * 100) / 100, a);
  });

  const perArm = [];
  let minCap = Infinity, govArm = null;
  let anyUnsupported = [];

  arms.forEach((arm, i) => {
    const src = byHeight.get(Math.round((Number(arm.h) || 0) * 100) / 100);
    const group = src ? src.group : null;
    const designation = src ? src.designation : null;
    const lenMM = Number(arm.len) || 0;
    const posMM = commonPos == null ? lenMM : Math.max(0, Math.min(lenMM, commonPos));

    const label = arm.label || (group ? group + " " + designation : "Arm @" + arm.h);
    const resolved = group ? CANTILEVER_DESIGN.resolveSection(group, designation) : null;
    if (!resolved) {
      perArm.push({ h: arm.h, label, ok: false, reason: "Section not in design library" });
      return;
    }
    const D = CANTILEVER_DESIGN.sectionDepth(resolved);
    const params = Object.assign({}, resolved, {
      code: ctl.code, grade: ctl.grade, py,
      L: lenMM / 1000, pos: posMM / 1000,
      restraint: ctl.restraint, za: swlZg(ctl.loadHeight, D), divisor: 180
    });
    const res = CANTILEVER_DESIGN.armCapacity(params);
    if (!res.ok) {
      perArm.push({ h: arm.h, label, ok: false, reason: res.reason, params });
      return;
    }
    const rec = { h: arm.h, label, ok: true, capacity: res.capacity,
      governing: res.governing, unsupported: res.unsupported || [], params };
    perArm.push(rec);
    if (rec.unsupported.length) anyUnsupported = anyUnsupported.concat(rec.unsupported);
    if (Number.isFinite(res.capacity) && res.capacity < minCap) { minCap = res.capacity; govArm = rec; }
  });

  const anyFail = perArm.some((r) => !r.ok);
  return {
    ok: true, perArm, minCapacity: minCap, govArm,
    control: ctl, anyFail,
    unsupported: Array.from(new Set(anyUnsupported))
  };
}

/* Remember the last member-design result + governing load so the "design
   details" buttons can open the right arm at the right load in a new tab. */
var _cdLastMember = null;
var _cdLastRated = null;

function bundledCantileverDesignerHtml() {
  const node = document.getElementById("cantileverDesignerBundle");
  const b64 = node ? (node.textContent || "").trim() : "";
  if (!b64 || b64.indexOf("__CANTILEVER_DESIGNER_BASE64__") >= 0) return null;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch (e) {
    console.error("Unable to decode bundled beam designer", e);
    return null;
  }
}

function closeBeamDesigner() {
  const shell = document.getElementById("beamDesignerShell");
  const frame = document.getElementById("beamDesignerFrame");
  if (shell) shell.hidden = true;
  document.body.classList.remove("beam-design-open");
  if (frame) {
    frame.removeAttribute("srcdoc");
    frame.src = "about:blank";
  }
}

/* Open the complete Cantilever Beam Designer inside the rack app, prefilled
   for the chosen arm and loaded with the governing rated SWL. The standalone
   Google Sites build uses the bundled designer; local development falls back
   to the neighbouring cantilever-designer.html file. */
function openArmDesign(h) {
  if (!_cdLastMember || !_cdLastMember.perArm) return;
  const rec = _cdLastMember.perArm.find((r) => Math.abs(r.h - h) < 1e-6);
  if (!rec || !rec.params) {
    alert("Design details unavailable: this beam's section isn't in the design library or the beam is out of range.");
    return;
  }
  const load = (_cdLastRated != null && isFinite(_cdLastRated)) ? _cdLastRated
             : (isFinite(rec.capacity) ? rec.capacity : 1);
  const p = Object.assign({}, rec.params, { P: Math.round(load * 1000) / 1000, label: rec.label });
  const hash = "#arm=" + encodeURIComponent(JSON.stringify(p));
  const shell = document.getElementById("beamDesignerShell");
  const frame = document.getElementById("beamDesignerFrame");
  const label = document.getElementById("beamDesignerLabel");
  if (!shell || !frame) return;

  if (label) label.textContent = rec.label + " @ " + fmt(rec.h, 0) + " mm";
  const bundled = bundledCantileverDesignerHtml();
  if (bundled) {
    const preset = "<script>location.hash=" + JSON.stringify(hash) + ";<\/script>";
    frame.removeAttribute("src");
    frame.srcdoc = bundled.replace(/<head([^>]*)>/i, function (match) { return match + preset; });
  } else {
    frame.removeAttribute("srcdoc");
    frame.src = "cantilever-designer.html" + hash;
  }
  shell.hidden = false;
  document.body.classList.add("beam-design-open");
}

function openGoverningBeamDesign() {
  if (_cdLastMember && _cdLastMember.govArm) openArmDesign(_cdLastMember.govArm.h);
  else alert("Analyze the rack first so a governing cantilever beam can be selected.");
}

/* Render the governing rated-SWL card: min( serviceability , member design ). */
function renderGoverningSWL(swl, member) {
  _cdLastMember = member;
  const card = $("govCard");
  if (!card) return;

  const wSls = swl && swl.ok && Number.isFinite(swl.allowable) ? swl.allowable : null;
  const wCant = member && member.ok && Number.isFinite(member.minCapacity) ? member.minCapacity : null;

  const setTxt = (id, t) => { const el = $(id); if (el) el.textContent = t; };

  const detailsBtn = $("govDetails");
  if (!member || !member.ok) {
    card.classList.add("is-error");
    setTxt("govMember", "–");
    setTxt("govSls", wSls != null ? fmt(wSls, 2) + " kN/arm" : "–");
    setTxt("govRated", "–");
    setTxt("govNote", member && member.reason ? member.reason : "Member design unavailable.");
    _cdLastRated = null;
    if (detailsBtn) detailsBtn.style.display = "none";
    return;
  }

  const governedBy = (wSls != null && wCant != null)
    ? (wSls <= wCant ? "serviceability (rack sway h/150)" : "member design (" + (member.govArm ? member.govArm.governing : "member") + ")")
    : (wCant != null ? "member design" : "serviceability");
  const rated = [wSls, wCant].filter((v) => v != null);
  const wRated = rated.length ? Math.min.apply(null, rated) : null;
  _cdLastRated = wRated;
  if (detailsBtn) {
    if (member.govArm) {
      detailsBtn.style.display = "";
      detailsBtn.onclick = () => openArmDesign(member.govArm.h);
    } else {
      detailsBtn.style.display = "none";
    }
  }

  card.classList.toggle("is-error", member.anyFail || (member.unsupported && member.unsupported.length > 0));

  setTxt("govSls", wSls != null ? fmt(wSls, 2) + " kN/arm" : "–");
  setTxt("govMember", wCant != null ? fmt(wCant, 2) + " kN/arm" : "–");
  setTxt("govRated", wRated != null ? fmt(wRated, 2) + " kN/arm" : "–");

  const armTxt = member.govArm
    ? (member.govArm.label + " @ " + fmt(member.govArm.h, 0) + " mm, governed by " + member.govArm.governing)
    : "";
  let note = "Governing rated SWL = the lower of rack serviceability and member design. "
    + "Rated by " + governedBy + ". "
    + (armTxt ? "Weakest arm: " + armTxt + " (" + member.control.code + ", "
        + (member.control.restraint === "full" ? "compression flange restrained"
           : "unrestrained, " + member.control.loadHeight + "-flange load") + "). " : "");
  if (member.control.code === "BS5950") {
    note += "The compression-flange and load-height controls apply to EC3; BS 5950 uses its own simplified LTB (no load-height term). ";
  }
  const problems = [];
  member.perArm.filter((r) => !r.ok).forEach((r) => problems.push(r.label + ": " + r.reason));
  (member.unsupported || []).forEach((u) => problems.push(u));
  if (problems.length) note += "⚠ " + problems.join("  ⚠ ");
  setTxt("govNote", note);
}

/* Entry point called from the rack's run(). */
function renderRatedSWL(swlResult, slsInput) {
  try {
    const member = computeMemberDesign(slsInput);
    renderGoverningSWL(swlResult, member);
    return member;
  } catch (e) {
    const card = $("govCard");
    if (card) { card.classList.add("is-error"); const n = $("govNote"); if (n) n.textContent = "Rated SWL unavailable: " + ((e && e.message) ? e.message : e); }
    return null;
  }
}

const beamDesignBtn = document.getElementById("beamDesignBtn");
if (beamDesignBtn) beamDesignBtn.addEventListener("click", openGoverningBeamDesign);
const closeBeamDesignBtn = document.getElementById("closeBeamDesigner");
if (closeBeamDesignBtn) closeBeamDesignBtn.addEventListener("click", closeBeamDesigner);
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") closeBeamDesigner();
});
