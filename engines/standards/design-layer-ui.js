(function () {
  "use strict";

  var BS_ENGINE = globalThis.RACK_BS5950_ENGINE;
  var EUROCODE_ENGINE = globalThis.RACK_EUROCODE_ENGINE;
  var LOAD_CASES = globalThis.RACK_EUROCODE_LOAD_CASES;
  if (!BS_ENGINE || !EUROCODE_ENGINE || !LOAD_CASES) throw new Error("Design engines are not loaded.");

  var pyTable9 = BS_ENGINE.pyTable9;
  var designColumn = BS_ENGINE.designColumn;
  var stitchColumn = BS_ENGINE.stitchColumn;
  var PFC_UX = BS_ENGINE.PFC_UX;
  var channelUX = BS_ENGINE.channelUX;
  var designColumnEC3 = EUROCODE_ENGINE.designColumnEC3;
  var fyEC3 = EUROCODE_ENGINE.fyEC3;
  var channelShearCentreY0 = EUROCODE_ENGINE.channelShearCentreY0;
  var channelIw = EUROCODE_ENGINE.channelIw;

  try {
    var DSTATE = {
      code: "BS", grade: "S235",
      Kx: 2.0, Ky: 2.0, KT: 2.0, KLT: 2.0, KLTOverride: null,
      cantilever: true, bracePts: "", mcrMethod: "fe", rootWarpingRestrained: false,
      ulsMethod: "610ab", slsMethod: "q-only",
      psi0: 1.0, psi1: 0.9, psi2: 0.8,
      inspanLimit: 360, swayLimit: 150,
      ltbRoot: "lat-torsion", ltbTip: "free", ltbDestabilizing: false,
      pfcTorsionConfirmed: false
    };

    var css = document.createElement("style");
    css.textContent =
      ".dz-wrap{max-width:1120px}.dz-inputs{display:flex;flex-wrap:wrap;gap:10px 12px;align-items:flex-end;margin-bottom:12px;padding:11px 13px;border:1px solid var(--line);border-radius:6px;background:#f9fbfd}" +
      ".dz-inputs label{display:grid;gap:3px;font-size:11.5px;font-weight:650;color:#334150}.dz-inputs input,.dz-inputs select{height:30px;width:104px;font-family:var(--mono);font-size:12px;border:1px solid var(--line-2);border-radius:5px;padding:4px 7px;background:#fff}" +
      ".dz-inputs label.dz-wide input{width:225px}.dz-inputs label.dz-select-wide select{width:205px}.dz-inputs input[readonly]{background:#eef2f7;color:#334150}.dz-inputs .dz-chk{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:650;padding-bottom:6px;max-width:230px}.dz-inputs .dz-chk input{width:16px;height:16px}" +
      ".dz-gov{border-radius:6px;padding:11px 14px;margin-bottom:12px;font-size:13px;font-weight:700;border:1px solid}.dz-gov.ok{background:#eaf6ef;border-color:#9fd0b3;color:#1d5c3a}.dz-gov.bad{background:#fbeceb;border-color:#e3aaa2;color:#8a1f2a}.dz-gov.hold{background:#fff5df;border-color:#d9b65d;color:#6d4b00}.dz-gov small{display:block;font-weight:500;margin-top:3px;color:inherit;opacity:.9}" +
      ".dz-block{margin-bottom:14px}.dz-block h3{margin:0 0 5px;font-size:13px;font-weight:760}.dz-tab{width:100%;border-collapse:collapse;font-size:11.5px}.dz-tab td{border-bottom:1px solid #e6ebf1;padding:5px 8px;vertical-align:top}.dz-tab td.l{width:31%;font-weight:600;color:#334150}.dz-tab td.s{font-family:var(--mono);color:#586472}.dz-tab td.v{font-family:var(--mono);text-align:right;white-space:nowrap;font-weight:600}.dz-tab td.st{width:96px;text-align:right;font-weight:750}.dz-tab td.st.ok{color:var(--green)}.dz-tab td.st.warn{color:var(--red)}" +
      ".dz-note{font-size:11px;color:var(--muted);margin:8px 0 0;line-height:1.5}.dz-diag{font-family:var(--mono);font-size:11px;color:#475569;background:#f2f5f9;border:1px solid var(--line);border-radius:6px;padding:8px 11px;margin-bottom:12px;line-height:1.6}@media(max-width:700px){.dz-inputs{gap:9px}.dz-inputs label,.dz-inputs label.dz-select-wide{flex:1 1 132px}.dz-inputs input,.dz-inputs select,.dz-inputs label.dz-select-wide select{width:100%}.dz-tab td{padding:4px}.dz-tab td.l{width:27%}}";
    document.head.appendChild(css);

    var printCss = document.createElement("style");
    printCss.textContent =
      "#dzSheet{background:#fff;border:1px solid var(--line);border-radius:6px;padding:18px 26px;font-family:Georgia,'Times New Roman',Times,serif;color:#000}" +
      "#dzSheet .dz-block{margin-bottom:16px}#dzSheet .dz-block h3{font-family:Georgia,'Times New Roman',Times,serif;font-size:16.5px;font-weight:700;color:#000;margin:0 0 3px;letter-spacing:0}" +
      "#dzSheet .dz-tab{font-family:Georgia,'Times New Roman',Times,serif;font-size:13px}#dzSheet .dz-tab td{border:0;padding:1.5px 10px 1.5px 0;color:#000;font-family:inherit}" +
      "#dzSheet .dz-tab td.l{width:29%;font-weight:400;padding-left:14px}#dzSheet .dz-tab td.s{color:#000;font-family:inherit}#dzSheet .dz-tab td.v{font-family:inherit;font-weight:400;text-align:right;white-space:nowrap}#dzSheet .dz-tab td.st{width:115px;text-align:right;font-weight:400}#dzSheet .dz-tab td.st b{font-weight:700;color:#000}#dzSheet .dz-tab td.st.warn b{color:#b00000}" +
      "@media(max-width:700px){#dzSheet{padding:12px 8px;overflow:hidden}#dzSheet .dz-tab{width:100%;table-layout:fixed;font-size:10.5px}#dzSheet .dz-tab td{padding:3px 3px 3px 0;white-space:normal;overflow-wrap:anywhere;word-break:normal}#dzSheet .dz-tab td.l{width:27%;padding-left:0}#dzSheet .dz-tab td.s{width:34%}#dzSheet .dz-tab td.v{width:23%;text-align:left}#dzSheet .dz-tab td.st{width:16%;text-align:right}}";
    document.head.appendChild(printCss);

    var libBtn = document.querySelector('.tab[data-tab="libraryTab"]');
    var strip = document.querySelector(".tabstrip");
    var wrap = document.querySelector(".tabwrap");
    if (!strip || !wrap) throw new Error("RackFrame2D tab containers not found.");

    var btn = document.createElement("button");
    btn.className = "tab";
    btn.type = "button";
    btn.dataset.tab = "designTab";
    btn.textContent = "Column design";
    if (libBtn) libBtn.parentNode.insertBefore(btn, libBtn); else strip.appendChild(btn);

    var panel = document.createElement("div");
    panel.id = "designTab";
    panel.className = "panel";
    panel.innerHTML = '<div class="dz-wrap">' +
      '<div class="dz-inputs">' +
      '<label class="dz-select-wide">Design code<select id="dzCode"><option value="BS">BS 5950-1:2000</option><option value="EC3">EN 1993-1-1 UK NA</option></select></label>' +
      '<label>Steel grade<select id="dzGrade"><option>S235</option><option>S275</option><option>S355</option></select></label>' +
      '<label>K_y about y-y<input id="dzKx" type="number" min="0.1" step="0.05" value="2.0"></label>' +
      '<label>K_z unrestrained<input id="dzKy" type="number" min="0.1" step="0.05" value="2.0"></label>' +
      '<label>K_z,eff<input id="dzKyEff" type="text" value="2.000" readonly></label>' +
      '<label class="dz-ec">K_T<input id="dzKt" type="number" min="0.1" step="0.05" value="2.0"></label>' +
      '<label class="dz-bs">K_LT<input id="dzKlt" type="number" min="0.1" step="0.05" value="2.0"></label>' +
      '<label class="dz-ec dz-select-wide">Mcr method<select id="dzMcrMethod"><option value="fe">FE eigenvalue - fixed/free</option><option value="ncci">NCCI - MasterSeries style</option></select></label>' +
      '<label class="dz-ec dz-ncci">NCCI k<input id="dzEcKlt" type="number" min="0.5" step="0.05" value="1.0"></label>' +
      '<span class="dz-chk"><input id="dzCant" type="checkbox" checked disabled><label for="dzCant">Fixed-free column</label></span>' +
      '<label class="dz-wide">Minor restraints from base (mm)<input id="dzBracePts" type="text" placeholder="1200, 2400, 3600"></label>' +
      '<label class="dz-ec dz-select-wide">ULS method<select id="dzUls"><option value="610ab">EN 1990 6.10a/6.10b envelope</option><option value="610">EN 1990 6.10</option><option value="as-run">Analysis factors as entered</option></select></label>' +
      '<label class="dz-ec">Psi0<input id="dzPsi0" type="number" min="0" max="1" step="0.05" value="1.0"></label>' +
      '<label class="dz-ec dz-select-wide">SLS case<select id="dzSls"><option value="q-only">Variable action only</option><option value="characteristic">Characteristic G + Q</option><option value="frequent">Frequent G + psi1 Q</option><option value="quasi">Quasi-permanent G + psi2 Q</option></select></label>' +
      '<label class="dz-ec">Psi1<input id="dzPsi1" type="number" min="0" max="1" step="0.05" value="0.9"></label>' +
      '<label class="dz-ec">Psi2<input id="dzPsi2" type="number" min="0" max="1" step="0.05" value="0.8"></label>' +
      '<label class="dz-ec">Bow H/<input id="dzInspanLimit" type="number" min="1" step="10" value="360"></label>' +
      '<label class="dz-ec">Sway H/<input id="dzSwayLimit" type="number" min="1" step="10" value="150"></label>' +
      '<label class="dz-ec dz-fe dz-select-wide">FE root warping<select id="dzLtbRoot"><option value="free" selected>Free warping</option><option value="restrained">Restrained warping</option></select></label>' +
      '<label class="dz-ec dz-select-wide">Column tip<select id="dzLtbTip" disabled><option value="free" selected>Free - no fork support</option></select></label>' +
      '<span class="dz-chk dz-ec" title="Required for a PFC because the 2D solver does not model connection torsion."><input id="dzPfcTorsion" type="checkbox"><label for="dzPfcTorsion">PFC torsion restrained / checked</label></span>' +
      '<button id="dzRun" class="btn btn-primary btn-sm" type="button">Re-check</button>' +
      '</div>' +
      '<div id="dzGov"></div><div id="dzDiag"></div><div id="dzSheet"></div>' +
      '<p id="dzNote" class="dz-note"></p>' +
      '</div>';
    wrap.appendChild(panel);

    function numberFrom(id, fallback) {
      var el = document.getElementById(id);
      var value = el ? Number(el.value) : NaN;
      return Number.isFinite(value) ? value : fallback;
    }

    function syncDesignState() {
      DSTATE.code = document.getElementById("dzCode").value;
      DSTATE.grade = document.getElementById("dzGrade").value;
      DSTATE.Kx = numberFrom("dzKx", 2);
      DSTATE.Ky = numberFrom("dzKy", 2);
      DSTATE.KT = numberFrom("dzKt", 2);
      DSTATE.KLT = numberFrom("dzKlt", 2);
      var kltOverride = document.getElementById("dzEcKlt").value;
      DSTATE.KLTOverride = kltOverride === "" ? 1 : numberFrom("dzEcKlt", 1);
      DSTATE.cantilever = true;
      DSTATE.mcrMethod = document.getElementById("dzMcrMethod").value;
      DSTATE.bracePts = document.getElementById("dzBracePts").value || "";
      DSTATE.ulsMethod = document.getElementById("dzUls").value;
      DSTATE.slsMethod = document.getElementById("dzSls").value;
      DSTATE.psi0 = numberFrom("dzPsi0", 1);
      DSTATE.psi1 = numberFrom("dzPsi1", 0.9);
      DSTATE.psi2 = numberFrom("dzPsi2", 0.8);
      DSTATE.inspanLimit = numberFrom("dzInspanLimit", 360);
      DSTATE.swayLimit = numberFrom("dzSwayLimit", 150);
      DSTATE.rootWarpingRestrained = document.getElementById("dzLtbRoot").value === "restrained";
      DSTATE.ltbRoot = "lat-torsion";
      DSTATE.ltbTip = "free";
      DSTATE.ltbDestabilizing = false;
      DSTATE.pfcTorsionConfirmed = document.getElementById("dzPfcTorsion").checked;
    }

    function syncVisibility() {
      var ec3 = DSTATE.code === "EC3";
      document.querySelectorAll("#designTab .dz-ec").forEach(function (el) { el.style.display = ec3 ? "" : "none"; });
      document.querySelectorAll("#designTab .dz-bs").forEach(function (el) { el.style.display = ec3 ? "none" : ""; });
      document.querySelectorAll("#designTab .dz-fe").forEach(function (el) { el.style.display = ec3 && DSTATE.mcrMethod === "fe" ? "" : "none"; });
      document.querySelectorAll("#designTab .dz-ncci").forEach(function (el) { el.style.display = ec3 && DSTATE.mcrMethod === "ncci" ? "" : "none"; });
      document.getElementById("dzNote").textContent = ec3
        ? "EN 1990 and BS EN 1993-1-1 UK NA member scope. Frame forces come from the first-order 2D solver. Mcr uses either the dedicated fixed-free Vlasov eigenvalue solver or the selected NCCI MasterSeries-style coefficient route."
        : "BS 5950-1:2000 member design. Analysis forces are taken from the current RackFrame2D run; explicit minor-axis restraints exclude horizontal cantilever arms.";
    }

    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (item) { item.classList.remove("active"); });
      document.querySelectorAll(".panel").forEach(function (item) { item.classList.remove("active"); });
      btn.classList.add("active");
      panel.classList.add("active");
      refresh();
    });

    var changeIds = ["dzCode", "dzGrade", "dzKx", "dzKy", "dzKt", "dzKlt", "dzEcKlt", "dzMcrMethod", "dzUls", "dzSls", "dzPsi0", "dzPsi1", "dzPsi2", "dzInspanLimit", "dzSwayLimit", "dzLtbRoot", "dzPfcTorsion"];
    changeIds.forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () { syncDesignState(); syncVisibility(); refresh(); });
    });
    document.getElementById("dzBracePts").addEventListener("input", function () { syncDesignState(); refresh(); });
    document.getElementById("dzRun").addEventListener("click", refresh);
    var runBtn = document.getElementById("runBtn");
    if (runBtn) runBtn.addEventListener("click", function () { setTimeout(refresh, 0); });
    var lastSeen = null;
    setInterval(function () { if (window.lastResult && window.lastResult !== lastSeen) refresh(); }, 900);

    function buildSecInput() {
      var so = typeof COLSEC !== "undefined" ? COLSEC : null;
      var selected = typeof sectionFromObj === "function" && so ? sectionFromObj(so) : null;
      if (!selected) return null;
      var raw = selected.raw || {};
      var d = selected.dims || {};
      var family;
      var tw = d.tw || 0;
      var tf = d.tf || 0;
      var t = d.t || 0;
      var u = null;
      var x = null;
      var dFil = null;
      var uxApprox = false;
      if (selected.groupId === "SHS" || selected.groupId === "RHS") family = "box-hf";
      else if (selected.groupId === "SHSCF") family = "box-cf";
      else if (selected.groupId === "PFC") {
        family = "channel";
        var pfc = PFC_UX[selected.designation] || {};
        if (pfc.u != null) { u = pfc.u; x = pfc.x; }
        dFil = pfc.d != null ? pfc.d : d.h - 2 * tf;
      } else if (selected.groupId === "UC") family = "H";
      else family = "I";

      if (family === "I" || family === "H") {
        u = raw.buckling_parameter_U;
        x = raw.torsional_index_X;
        dFil = raw.depth_between_fillets_d_mm;
      }

      var Iw = null;
      var y0 = 0;
      var rFil = 0;
      var IwApprox = false;
      var y0Approx = false;
      if (family === "I" || family === "H") {
        Iw = raw.warping_constant_Iw_dm6 || null;
        rFil = raw.root_radius_r_mm || 0;
        if (Iw == null && d.h && d.b && tf) {
          Iw = selected.Iz_cm4 * 1e4 * Math.pow(d.h - tf, 2) / 4 / 1e12;
          IwApprox = true;
        }
      } else if (family === "channel") {
        var pfcExtra = PFC_UX[selected.designation] || {};
        if (pfcExtra.Iw_dm6 != null) Iw = pfcExtra.Iw_dm6;
        else { Iw = channelIw(d.h, d.b, tw, tf) / 1e12; IwApprox = true; }
        if (pfcExtra.y0 != null) y0 = pfcExtra.y0;
        else { y0 = channelShearCentreY0(d.h, d.b, tw, tf); y0Approx = true; }
        rFil = dFil != null ? Math.max((d.h - 2 * tf - dFil) / 2, 0) : 0;
        if (u == null) {
          var ux = channelUX(selected.A_mm2, selected.Wply * 1e3, selected.Iz_cm4 * 1e4, selected.Iy_cm4 * 1e4, Iw * 1e12, selected.IT_cm4 * 1e4);
          u = ux.u;
          x = ux.x;
          uxApprox = IwApprox;
        }
      }

      var minor = selected.axis === "minor";
      var tgov = Math.max(tf, tw, t);
      return {
        family: family,
        minor: minor,
        pyBS: pyTable9(DSTATE.grade, tgov),
        fy: fyEC3(DSTATE.grade, tgov),
        sec: {
          label: selected.short + " " + selected.designation + (minor ? " (minor-axis bending)" : ""),
          family: family,
          groupId: selected.groupId,
          coldFormed: selected.groupId === "SHSCF",
          A_cm2: selected.A_cm2,
          S_cm3: minor ? selected.Wplz : selected.Wply,
          Z_cm3: minor ? selected.Welz : selected.Wely,
          rx_cm: minor ? selected.iz : selected.iy,
          ry_cm: minor ? selected.iy : selected.iz,
          Iy_cm4: minor ? selected.Iz_cm4 : selected.Iy_cm4,
          Iz_cm4: minor ? selected.Iy_cm4 : selected.Iz_cm4,
          Sz_cm3: minor ? selected.Wply : selected.Wplz,
          Zz_cm3: minor ? selected.Wely : selected.Welz,
          Wply_cm3: selected.Wply,
          Wely_cm3: selected.Wely,
          Wplz_cm3: selected.Wplz,
          Welz_cm3: selected.Welz,
          iy_cm: selected.iy,
          iz_cm: selected.iz,
          IyPhysical_cm4: selected.Iy_cm4,
          IzPhysical_cm4: selected.Iz_cm4,
          h: d.h,
          b: d.b,
          tw: tw,
          tf: tf,
          t: t,
          d_fillets: dFil,
          u: u,
          x: x,
          uxApprox: uxApprox,
          tgov: tgov,
          A_mm2: selected.A_mm2,
          IT_cm4: selected.IT_cm4 || 0,
          Iw_dm6: Iw || 0,
          y0: y0,
          rFillet: rFil,
          IwApprox: IwApprox,
          y0Approx: y0Approx,
          mass: selected.mass
        }
      };
    }

    function parseMinorRestraints(text, H) {
      var values = [];
      String(text || "").split(/[,;\s]+/).forEach(function (part) {
        var value = Number(part);
        if (Number.isFinite(value) && value > 0 && value <= H + 1) values.push(Math.min(value, H));
      });
      values.sort(function (a, b) { return a - b; });
      return values.filter(function (value, index) { return index === 0 || Math.abs(value - values[index - 1]) > 1; });
    }

    function manualMinorBraceKy(text, H, baseFixed) {
      var raw = parseMinorRestraints(text, H);
      if (!raw.length) return { active: false, points: [], ky: null };
      var topRestrained = raw.some(function (point) { return Math.abs(point - H) <= 1; });
      var points = [0].concat(raw.filter(function (point) { return point < H - 1; }), [H]);
      var maxLe = 0;
      var governingSegment = "";
      for (var i = 0; i < points.length - 1; i++) {
        var segment = points[i + 1] - points[i];
        var freeTop = i === points.length - 2 && !topRestrained;
        var k = i === 0 ? (baseFixed ? 0.7 : 1.0) : (freeTop ? 2.0 : 1.0);
        var effective = k * segment;
        if (effective > maxLe) {
          maxLe = effective;
          governingSegment = Math.round(points[i]) + "-" + Math.round(points[i + 1]) + " mm (K=" + k.toFixed(2).replace(/\.00$/, "") + (freeTop ? ", top free" : "") + ")";
        }
      }
      return { active: true, points: raw, ky: maxLe / H, le: maxLe, govSeg: governingSegment, topRestrained: topRestrained };
    }

    function isDeflectionKey(key) { return key === "sway" || key === "inspan" || key === "sls_sway" || key === "sls_inspan"; }
    function strengthWorst(out) {
      return Object.keys(out.utils || {}).reduce(function (maximum, key) { return isDeflectionKey(key) ? maximum : Math.max(maximum, out.utils[key] || 0); }, 0);
    }
    function deflectionWorst(out) {
      return Object.keys(out.utils || {}).reduce(function (maximum, key) { return isDeflectionKey(key) ? Math.max(maximum, out.utils[key] || 0) : maximum; }, 0);
    }
    function percent(value) { return Number.isFinite(value) ? (value * 100).toFixed(1) + "%" : String(value); }

    function analyzeCase(source, gammaG, gammaQ) {
      if (Math.abs(source.input.gammaG - gammaG) < 1e-12 && Math.abs(source.input.gammaQ - gammaQ) < 1e-12) return source;
      var input = Object.assign({}, source.input, { gammaG: gammaG, gammaQ: gammaQ });
      return analyze(buildFrame(input));
    }

    function deflectionsFor(result, H) {
      var profile = columnProfile(result, 36);
      var ux0 = profile.rows[0].Ux;
      var uxH = profile.rows[profile.rows.length - 1].Ux;
      var inspan = 0;
      profile.rows.forEach(function (row) {
        var chord = ux0 + (uxH - ux0) * row.y / H;
        inspan = Math.max(inspan, Math.abs(row.Ux - chord));
      });
      var report = deflectionReport(result);
      if (report && report.top) {
        return { inspan: inspan, sway: Math.abs(report.top.halfUx), note: "top junction + half beam depth at " + Math.round(report.top.halfHeight) + " mm" };
      }
      return { inspan: inspan, sway: profile.maxAbs, note: "maximum column sway" };
    }

    function makeDesignInput(si, st, caseResult, comboLabel, deflection, braceCalc) {
      var minorBracePoints = braceCalc && braceCalc.active ? braceCalc.points : [];
      return {
        grade: DSTATE.grade,
        py: DSTATE.code === "EC3" ? si.fy : si.pyBS,
        H: st.H,
        combo: comboLabel,
        Kx: DSTATE.Kx,
        Ky: DSTATE.Ky,
        KyMajor: DSTATE.Kx,
        KzMinor: DSTATE.Ky,
        KT: DSTATE.KT,
        KLT: DSTATE.KLT,
        KLTOverride: DSTATE.KLTOverride,
        cantileverLTB: DSTATE.cantilever,
        mcrMethod: DSTATE.mcrMethod,
        columnTopFree: true,
        columnBaseFixed: caseResult.input.leftSupport === "fixed",
        swayMode: true,
        rootWarpingRestrained: DSTATE.rootWarpingRestrained,
        axis: si.minor ? "minor" : "major",
        ltbRoot: DSTATE.ltbRoot,
        ltbTip: DSTATE.ltbTip,
        ltbDestabilizing: DSTATE.ltbDestabilizing,
        pfcTorsionConfirmed: DSTATE.pfcTorsionConfirmed,
        F: st.F,
        Fv: st.Fv,
        Mx: st.Mmax,
        M2: st.M2,
        M3: st.M3,
        M4: st.M4,
        M24: st.M24,
        momentSegments: st.momentSegments,
        cmYBracePoints: [0].concat(minorBracePoints, [st.H]),
        cmZBracePoints: [0, st.H],
        cmLTBracePoints: [0, st.H],
        sec: si.sec,
        defl: deflection,
        Mcr_exact: caseResult.Mcr_exact != null ? caseResult.Mcr_exact : null,
        C1_exact: caseResult.C1_exact != null ? caseResult.C1_exact : null
      };
    }

    function refresh() {
      var source = window.lastResult || (typeof lastResult !== "undefined" ? lastResult : null);
      var sheet = document.getElementById("dzSheet");
      var gov = document.getElementById("dzGov");
      var diag = document.getElementById("dzDiag");
      if (!sheet) return;
      syncDesignState();
      syncVisibility();
      lastSeen = source;
      if (!source) {
        gov.innerHTML = "";
        diag.innerHTML = "";
        sheet.innerHTML = '<p class="dz-note">Run the frame analysis before opening the member result.</p>';
        return;
      }

      try {
        var si = buildSecInput();
        if (!si || (DSTATE.code === "EC3" ? si.fy == null : si.pyBS == null)) {
          sheet.innerHTML = '<p class="dz-note">The selected section or material strength is outside the implemented table.</p>';
          return;
        }
        var sourceSt = stitchColumn(source, diagramValue);
        if (!sourceSt) throw new Error("No column members were found.");

        var braceCalc = manualMinorBraceKy(DSTATE.bracePts, sourceSt.H, source.input.leftSupport === "fixed");
        var kzEffective = braceCalc.active ? braceCalc.ky : DSTATE.Ky;
        var kyEffEl = document.getElementById("dzKyEff");
        if (kyEffEl) kyEffEl.value = kzEffective.toFixed(3);

        var braceNote = "";
        if (braceCalc.active) {
          braceNote = "minor-axis restraints " + braceCalc.points.map(function (point) { return Math.round(point); }).join(", ") + " mm; arms ignored; Kz,eff=" + kzEffective.toFixed(3) + "; governing " + braceCalc.govSeg;
        }

        var slsDef;
        if (DSTATE.code === "EC3") {
          var slsCase = LOAD_CASES.slsCase(DSTATE.slsMethod, { psi1: DSTATE.psi1, psi2: DSTATE.psi2 });
          var slsResult = analyzeCase(source, slsCase.gammaG, slsCase.gammaQ);
          slsDef = deflectionsFor(slsResult, sourceSt.H);
          slsDef.combo = slsCase.label;
          slsDef.inspanLimit = DSTATE.inspanLimit;
          slsDef.swayLimit = DSTATE.swayLimit;
        } else {
          slsDef = deflectionsFor(source, sourceSt.H);
        }

        var caseDefs = DSTATE.code === "EC3"
          ? LOAD_CASES.ulsCases(DSTATE.ulsMethod, { psi0: DSTATE.psi0, gammaG: source.input.gammaG, gammaQ: source.input.gammaQ })
          : [{ id: "bs-run", gammaG: source.input.gammaG, gammaQ: source.input.gammaQ, label: source.input.gammaG + "G + " + source.input.gammaQ + "Q as run" }];

        var evaluated = caseDefs.map(function (caseDef) {
          var caseResult = analyzeCase(source, caseDef.gammaG, caseDef.gammaQ);
          var st = stitchColumn(caseResult, diagramValue);
          var input = makeDesignInput(si, st, caseResult, caseDef.label, slsDef, braceCalc);
          input.KzMinor = kzEffective;
          input.Ky = kzEffective;
          var out = DSTATE.code === "EC3" ? designColumnEC3(input) : designColumn(input);
          return { caseDef: caseDef, result: caseResult, st: st, input: input, out: out, score: strengthWorst(out) };
        });
        var selected = evaluated.reduce(function (best, item) { return !best || item.score > best.score ? item : best; }, null);
        var out = selected.out;
        var st = selected.st;
        var designInput = selected.input;

        var impactNote = "";
        if (braceCalc.active) {
          var unbracedInput = Object.assign({}, designInput, { KzMinor: DSTATE.Ky, Ky: DSTATE.Ky });
          var unbracedOut = DSTATE.code === "EC3" ? designColumnEC3(unbracedInput) : designColumn(unbracedInput);
          impactNote = "restraint impact Kz " + DSTATE.Ky.toFixed(3) + " -> " + kzEffective.toFixed(3) + ", strength " + percent(strengthWorst(unbracedOut)) + " -> " + percent(strengthWorst(out));
        }

        var status = out.status || (out.governing.pass ? "PASS" : "FAIL");
        var bannerClass = status === "PASS" ? "ok" : (status === "UNVERIFIED" ? "hold" : "bad");
        var governing = out.governing;
        var issueText = out.issues && out.issues.length ? " | " + out.issues.length + " blocking item" + (out.issues.length === 1 ? "" : "s") : "";
        gov.innerHTML = '<div class="dz-gov ' + bannerClass + '">' + status + " - governing: " + governing.name + " at " + percent(governing.value) +
          "<small>Strength " + percent(strengthWorst(out)) + " | SLS " + percent(deflectionWorst(out)) + issueText + "</small></div>";

        var sumP = 0;
        (selected.result.pointLoadMarks || []).forEach(function (mark) { sumP += Math.max(mark.P, 0); });
        var baseWarning = source.input.leftSupport !== "fixed" ? " | BASE IS " + source.input.leftSupport.toUpperCase() + ": cantilever assumptions require review" : "";
        var mcrText = out.derived && out.derived.mcrMethod ? " | Mcr: " + out.derived.mcrMethod : "";
        diag.innerHTML = '<div class="dz-diag">ULS ' + selected.caseDef.label + " | F=" + st.F.toFixed(3) + " kN | Mmax=" + st.Mmax.toFixed(3) + " kN.m | V=" + st.Fv.toFixed(3) + " kN | quarter-point |M|=" + st.M2.toFixed(2) + "/" + st.M3.toFixed(2) + "/" + st.M4.toFixed(2) + " kN.m | factored point loads=" + (sumP / 1000).toFixed(2) + " kN | SLS " + (slsDef.combo || "analysis case as run") + " | first-order 2D" + baseWarning + (braceNote ? " | " + braceNote : "") + (impactNote ? " | " + impactNote : "") + mcrText + "</div>";

        var html = "";
        out.blocks.forEach(function (designBlock) {
          html += '<div class="dz-block"><h3>' + designBlock.title + '</h3><table class="dz-tab"><tbody>';
          designBlock.rows.forEach(function (row) {
            var warning = row.status === "Warning" || row.status === "UNVERIFIED";
            html += "<tr><td class='l'>" + row.label + "</td><td class='s'>" + row.sub + "</td><td class='v'>" + row.val + (row.unit ? " " + row.unit : "") + "</td><td class='st " + (row.status === "OK" ? "ok" : warning ? "warn" : "") + "'>" + (row.status ? "<b>" + row.status + "</b>" : "") + "</td></tr>";
          });
          html += "</tbody></table></div>";
        });
        sheet.innerHTML = html;
      } catch (error) {
        sheet.innerHTML = '<p class="dz-note">Design layer error: ' + (error && error.message ? error.message : error) + "</p>";
      }
    }

    syncDesignState();
    syncVisibility();
    refresh();
  } catch (glueError) {
    if (typeof console !== "undefined") console.error("Column design layer failed to attach:", glueError);
  }
})();
