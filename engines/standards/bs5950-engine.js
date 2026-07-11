(function () {
  "use strict";
  var E_DESIGN = 205000;                       // N/mm2, BS 5950 cl. 3.1.3
  var ROBERTSON = { a: 2.0, b: 3.5, c: 5.5, d: 8.0 };   // Annex C.2

  /* ------------------------------------------------------------------
     PURE ENGINE (no DOM). Exported for Node verification tests.
     ------------------------------------------------------------------ */

  function pyTable9(grade, t) {
    // Table 9 design strength vs governing element thickness (mm)
    var g = {
      S235: [[16, 235], [40, 225], [63, 215], [80, 215]],
      S275: [[16, 275], [40, 265], [63, 255], [80, 245]],
      S355: [[16, 355], [40, 345], [63, 335], [80, 325]]
    }[grade];
    if (!g) return null;
    for (var i = 0; i < g.length; i++) if (t <= g[i][0]) return g[i][1];
    return g[g.length - 1][1];
  }

  function pcAnnexC(py, lam, curve) {
    // Compressive strength pc == Table 24, generated per Annex C.1
    var a = ROBERTSON[curve];
    var pE = Math.PI * Math.PI * E_DESIGN / (lam * lam);
    var lam0 = 0.2 * Math.sqrt(Math.PI * Math.PI * E_DESIGN / py);
    var eta = Math.max(0, a * (lam - lam0) / 1000);
    var phi = (py + (eta + 1) * pE) / 2;
    return pE * py / (phi + Math.sqrt(phi * phi - pE * py));
  }

  function pbAnnexB(py, lamLT) {
    // Bending strength pb == Table 16 (rolled), per Annex B.2 (aLT = 7.0)
    var lamL0 = 0.4 * Math.sqrt(Math.PI * Math.PI * E_DESIGN / py);
    if (lamLT <= lamL0) return py;                        // plateau, B.2.2
    var pE = Math.PI * Math.PI * E_DESIGN / (lamLT * lamLT);
    var etaLT = Math.max(0, 7.0 * (lamLT - lamL0) / 1000);
    var phi = (py + (etaLT + 1) * pE) / 2;
    return pE * py / (phi + Math.sqrt(phi * phi - pE * py));
  }

  function channelUX(A, Sx, IyMinor, IxMajor, Iw, J) {
    // Annex B.2.3, channels with equal flanges (all in mm units):
    // u = (Iy.Sx^2.gamma/(A^2.H))^0.25, x = 1.132(A.H/(Iy.J))^0.5,
    // gamma = 1 - Iy/Ix (cl. 4.3.6.7). H = warping constant.
    var gamma = 1 - IyMinor / IxMajor;
    return {
      u: Math.pow(IyMinor * Sx * Sx * gamma / (A * A * Iw), 0.25),
      x: 1.132 * Math.sqrt(A * Iw / (IyMinor * J))
    };
  }

  function mTable26(M2, M3, M4, Mmax, M24) {
    if (!(Mmax > 0)) return 1;
    var m = 0.2 + (0.1 * M2 + 0.6 * M3 + 0.1 * M4) / Mmax;
    m = Math.max(m, 0.8 * (M24 || 0) / Mmax);
    return Math.min(Math.max(m, 0), 1);
  }
  function mTable18(M2, M3, M4, Mmax) {
    if (!(Mmax > 0)) return 1;
    var m = 0.2 + (0.15 * M2 + 0.5 * M3 + 0.15 * M4) / Mmax;
    return Math.min(Math.max(m, 0.44), 1);
  }

  /* Table 23 strut-curve selection (tf <= 40 mm assumed; bumped if not) */
  function strutCurves(family, tf) {
    var c;
    if (family === "box-hf") c = { x: "a", y: "a" };
    else if (family === "box-cf") c = { x: "c", y: "c" };
    else if (family === "channel") c = { x: "c", y: "c" };
    else if (family === "H") c = { x: "b", y: "c" };       // rolled H (UC)
    else c = { x: "a", y: "b" };                            // rolled I (UB)
    var bumped = false;
    if ((family === "I" || family === "H") && tf > 40) {
      var next = { a: "b", b: "c", c: "d", d: "d" };
      c = { x: next[c.x], y: next[c.y] }; bumped = true;
    }
    return { curves: c, bumped: bumped };
  }

  /* Classification to Table 11 (rolled) / Table 12 (hollow).
     sec: {family, b,h,tw,tf,t,d_fillets, A_mm2}, forces in N / N.mm */
  function classifySection(sec, py, F_N) {
    var eps = Math.sqrt(275 / py);
    var out = { lines: [], cls: "Plastic", slender: false };
    function grade(ratio, lims) {   // lims = [plastic, compact, semi]
      if (ratio <= lims[0]) return 0;
      if (ratio <= lims[1]) return 1;
      if (ratio <= lims[2]) return 2;
      return 3;
    }
    var names = ["Plastic", "Compact", "Semi-compact", "Slender"];
    var worst = 0;

    if (sec.family === "box-hf" || sec.family === "box-cf") {
      var cf = 3; // P363: c = b-3t for both hot-finished and cold-formed
      var c_t = (sec.b - cf * sec.t) / sec.t;
      var d_t = (sec.h - cf * sec.t) / sec.t;
      var r1 = Math.min(Math.max(F_N / ((sec.h - cf * sec.t) * 2 * sec.t * py), -1), 1);
      var webPl = Math.max(64 * eps / (1 + 0.6 * r1), 40 * eps);
      var webCo = Math.max(80 * eps / (1 + r1), 40 * eps);
      var flPl = Math.min(28 * eps, 80 * eps - d_t);
      var flCo = Math.min(32 * eps, 62 * eps - 0.5 * d_t);
      worst = Math.max(grade(c_t, [flPl, flCo, 40 * eps]),
                       grade(d_t, [webPl, webCo, 120 * eps / (1 + 2 * r1)]));
      out.lines.push(["b/t, d/t (Table 12" + (sec.family === "box-cf" ? "" : ", c=b-3t") + ")",
        c_t.toFixed(2) + ", " + d_t.toFixed(2) + "  (limits " + flPl.toFixed(1) + " / " + webPl.toFixed(1) + " plastic)", names[worst], worst <= 2]);
      out.axialNonSlender = d_t <= 40 * eps && c_t <= 40 * eps;
    } else {
      var bT = (sec.family === "channel" ? sec.b : sec.b / 2) / sec.tf;
      var d = sec.d_fillets;
      var dt = d / sec.tw;
      var r1w = Math.min(Math.max(F_N / (d * sec.tw * py), -1), 1);
      var r2 = F_N / (sec.A_mm2 * py);
      var flangeCls = grade(bT, [9 * eps, 10 * eps, 15 * eps]);
      var webCls = grade(dt, [Math.max(80 * eps / (1 + r1w), 40 * eps),
                              Math.max(100 * eps / (1 + 1.5 * r1w), 40 * eps),
                              Math.max(120 * eps / (1 + 2 * r2), 40 * eps)]);
      worst = Math.max(flangeCls, webCls);
      out.lines.push(["b/T, d/t (Table 11; r1=" + r1w.toFixed(3) + ")",
        bT.toFixed(2) + ", " + dt.toFixed(2) + "  (limits " + (9 * eps).toFixed(1) + " / " + Math.max(80 * eps / (1 + r1w), 40 * eps).toFixed(1) + " plastic)", names[worst], worst <= 2]);
      out.axialNonSlender = worst <= 2;
    }
    out.cls = names[worst];
    out.classIndex = worst;
    out.slender = worst === 3;
    return out;
  }

  /* Full member check. All section moduli in cm units, lengths mm,
     forces kN, moments kN.m — matching the MasterKey sheet layout. */
  function designColumn(inp) {
    var sec = inp.sec;
    var py = inp.py;
    var A = sec.A_cm2 * 100;                    // mm2
    var S = sec.S_cm3 * 1e3, Z = sec.Z_cm3 * 1e3; // mm3 (bending-axis)
    var rx = sec.rx_cm * 10, ry = sec.ry_cm * 10; // mm
    var F = Math.max(inp.F, 0), Mx = Math.abs(inp.Mx), Fv = Math.abs(inp.Fv || 0);
    var rows = [], blocks = [], utils = {};
    function block(t) { var b = { title: t, rows: [] }; blocks.push(b); rows = b.rows; return b; }
    function line(l, sub, val, unit, ok) { rows.push({ label: l, sub: sub, val: val, unit: unit || "", status: ok === undefined ? "" : (ok ? "OK" : "Warning") }); }
    var f1 = function (v, d) { return Number(v).toFixed(d === undefined ? 3 : d); };

    /* ---- Member loading (MasterKey header) ---- */
    block("Member Loading and Member Forces");
    line("Loading Combination", inp.combo || "\u03B3G\u00B7G + \u03B3Q\u00B7Q as run in RackFrame2D", "", "");
    line("Axial Force (kN)  End1 / End2", "", f1(F) + "C / 0.000C", "");
    line("Shear Force (kN)  End1 / End2", "", f1(Fv) + " / 0.000", "");
    line("Bending Moment (kN.m)  End1 / End2", "", "-" + f1(Mx) + " / 0.000", "");

    /* ---- Classification ---- */
    var cl = classifySection(sec, py, F * 1000);
    var b0 = block("Classification and Properties (BS 5950: 2000)");
    line("Section" + (sec.mass ? " (" + Number(Number(sec.mass).toFixed(2)) + " kg/m)" : ""), sec.label + "  [py = " + py + " N/mm\u00B2, " + inp.grade + ", t = " + f1(sec.tgov, 1) + " mm, Table 9]", "", "");
    cl.lines.forEach(function (L) { line(L[0], L[1], L[2] + (cl.axialNonSlender ? "  (Axial: Non-Slender)" : ""), "", L[3]); });
    if (cl.slender) line("WARNING", "Section is Slender \u2014 these checks are NOT valid for slender sections", "", "", false);

    var semi = cl.classIndex === 2;

    /* ---- Shear capacity ---- */
    var Pv;
    if (sec.family === "box-hf" || sec.family === "box-cf") Pv = 0.6 * py * A * sec.h / (sec.h + sec.b) / 1000;
    else Pv = 0.6 * py * sec.tw * sec.h / 1000;
    var highShear = Fv > 0.6 * Pv;
    block("Shear Capacity Check");
    line("Fvx/Pvx", f1(Fv) + " / " + f1(Pv) + " =", f1(Fv / Pv), "", Fv <= Pv);

    /* ---- Local capacity ---- */
    block("Local Capacity Check");
    line("Fvx/Pvx", f1(Fv) + " / " + f1(Pv) + " =", f1(Fv / Pv), "", true);
    line("", "", highShear ? "High Shear \u2014 moment reduction NOT applied, verify" : "Low Shear", "", !highShear);
    var Mcx = Math.min(py * S, 1.2 * py * Z) / 1e6;
    if (semi) Mcx = py * Z / 1e6;
    line("Mcx = py.Sx \u2264 1.2 py.Zx" + (semi ? " (semi-compact: py.Zx)" : ""),
      py + " x " + f1(S / 1e3, 2) + " \u2264 1.2 x " + py + " x " + f1(Z / 1e3, 2), f1(Mcx), "kN.m");
    var Pz = A * py / 1000;
    line("Pz = Ag.py", f1(A / 100, 2) + " x " + py, f1(Pz, 3), "kN");
    var n = F / Pz;
    line("n = F/Pz", f1(F, 3) + " / " + f1(Pz, 3), f1(n), "", true);

    var localU, Mrx = null, srNote = "";
    var webShare, dS = null;
    if (sec.family === "box-hf" || sec.family === "box-cf") {
      webShare = 2 * sec.t * (sec.h - 2 * sec.t) / A;
      if (!semi && n <= webShare) dS = Math.pow(A * n, 2) / (8 * sec.t);
    } else {
      webShare = sec.tw * (sec.h - 2 * sec.tf) / A;
      if (!semi && n <= webShare) dS = Math.pow(A * n, 2) / (4 * sec.tw);
    }
    if (dS !== null) {
      var Sr = S - dS;
      Mrx = Math.min(py * Sr / 1e6, Mcx);
      line("Srx = Fn(Sx, n)", f1(S / 1e3, 2) + ", " + f1(n), f1(Sr / 1e3, 2), "cm\u00B3");
      line("Mrx = Srx.py", f1(Sr / 1e3, 2) + " x " + py, f1(Mrx, 2), "kN.m");
      var z1 = (sec.family === "box-hf" || sec.family === "box-cf") ? 5 / 3 : (sec.family === "channel" ? 1 : 2);
      localU = Math.pow(Mx / Mrx, z1);
      line("(Mx/Mrx)^z1 + (My/Mry)^z2   [z1 = " + (z1 === 5 / 3 ? "5/3" : z1) + "]",
        "(" + f1(Mx) + "/" + f1(Mrx, 2) + ")^" + f1(z1, 3) + " + 0", f1(localU), "", localU <= 1);
    } else {
      localU = F / Pz + Mx / Mcx;
      srNote = semi ? "semi-compact" : "n exceeds web capacity (" + f1(webShare) + ")";
      line("F/Pz + Mx/Mcx  [simplified 4.8.2.3(a); " + srNote + "]",
        f1(F, 2) + "/" + f1(Pz, 2) + " + " + f1(Mx, 2) + "/" + f1(Mcx, 2), f1(localU), "", localU <= 1);
    }
    utils.local = localU;

    /* ---- Compression resistance ---- */
    block("Compression Resistance Pc");
    var scv = strutCurves(sec.family, sec.tf || 0);
    var lx = inp.Kx * inp.H / rx, ly = inp.Ky * inp.H / ry;
    var pcx = pcAnnexC(py, lx, scv.curves.x), pcy = pcAnnexC(py, ly, scv.curves.y);
    var Pcx = A * pcx / 1000, Pcy = A * pcy / 1000;
    line("\u03BBx = Lex/rx", f1(inp.Kx, 1) + " x " + inp.H + " / " + f1(rx, 1), f1(lx, 1), "");
    line("Pcx = Ag.pcx", f1(A / 100, 2) + " x " + f1(pcx) + " / 10", f1(Pcx, 3), "kN  [Table 24 " + scv.curves.x + (scv.bumped ? ", tf>40 bump" : "") + "]");
    line("\u03BBy = Ley/ry", f1(inp.Ky, 1) + " x " + inp.H + " / " + f1(ry, 1), f1(ly, 1), "");
    line("Pcy = Ag.pcy", f1(A / 100, 2) + " x " + f1(pcy) + " / 10", f1(Pcy, 3), "kN  [Table 24 " + scv.curves.y + "]");
    var Pc = Math.min(Pcx, Pcy);

    /* ---- m factors ---- */
    block("Equivalent Uniform Moment Factors mLT, mx, my and myx");
    var mx = (inp._mxOverride != null) ? inp._mxOverride : mTable26(inp.M2, inp.M3, inp.M4, Mx, inp.M24);
    var mLT;
    if (inp._mLTOverride != null) { mLT = inp._mLTOverride; line("mLT", "test override", f1(mLT, 2), ""); }
    else if (inp.cantileverLTB) { mLT = 1.0; line("mLT", "Cantilever without intermediate lateral restraint", "1", "  [Table 18]"); }
    else { mLT = mTable18(inp.M2, inp.M3, inp.M4, Mx); line("mLT = 0.2+(.15M2+.5M3+.15M4)/Mmax \u2265 0.44", "0.2+(.15x" + f1(inp.M2, 1) + "+.5x" + f1(inp.M3, 1) + "+.15x" + f1(inp.M4, 1) + ")/" + f1(Mx, 1), f1(mLT, 2), "  [Table 18]"); }
    line("mx = 0.2+(.1M2+.6M3+.1M4)/Mmax \u2265 .8M24/Mmax",
      "0.2+(.1x" + f1(inp.M2, 2) + "+.6x" + f1(inp.M3, 2) + "+.1x" + f1(inp.M4, 2) + ")/" + f1(Mx, 2) + " \u2265 .8x" + f1(inp.M24, 2) + "/" + f1(Mx, 2), f1(mx, 2), "  [Table 26]");
    line("my = myx", "My = 0", "1", "  [Table 26]");

    /* ---- LTB ---- */
    block("Lateral Buckling Check Mb");
    var Mb, ltbNote = "", lamLTout = null, vOut = null, pbOut = null;
    if (inp.Mcr_exact != null && inp.Mcr_exact > 0 && inp.C1_exact != null && inp.C1_exact > 0 && inp.axis !== "minor") {
      /* FE eigensolver Mcr supplied -> BS equivalent slenderness via the
         Perry-Robertson bridge lamLT = pi*sqrt(E*W/Mcr), W = Sx (plastic/
         compact) or Zx (semi-compact). CRITICAL: BS 5950 Mb is a UNIFORM-
         moment resistance (lamLT = u.v.lam.sqrt(betaW) has no moment-shape
         term); the moment gradient is applied separately as mLT (Table 18)
         on the demand in cl. 4.8.3.3 / Annex I. So the value fed here must be
         the UNIFORM-moment critical moment Mcr(C1=1) = Mcr_actual / C1_eff,
         otherwise the shape benefit is counted twice. Mcr in N.mm. (Without
         C1_exact this branch is skipped and the verified analytical u.v.lam
         estimate is used instead.) */
      var Mcr_unifBS = inp.Mcr_exact / inp.C1_exact;
      var WbsFE = (semi ? Z : S);
      var lamLTfe = Math.PI * Math.sqrt(E_DESIGN * WbsFE / Mcr_unifBS);
      var pbFE = pbAnnexB(py, lamLTfe);
      lamLTout = lamLTfe; pbOut = pbFE;
      Mb = Math.min(WbsFE * pbFE / 1e6, Mcx);
      line("Mcr,unif (FE eigensolver)", "Mcr(actual)/C1 = " + f1(inp.Mcr_exact / 1e6, 2) + "/" + f1(inp.C1_exact, 3) + " = uniform-moment Mcr", f1(Mcr_unifBS / 1e6, 2), "kN.m");
      line("\u03BBLT = \u03C0\u221A(E.W/Mcr)", E_DESIGN + ", W = " + f1(WbsFE / 1e3, 1) + " cm\u00B3 (" + (semi ? "Zx" : "Sx") + "), Mcr = " + f1(Mcr_unifBS / 1e6, 2), f1(lamLTfe, 1), "");
      line("pb = Fn(py, \u03BBLT)", py + ", " + f1(lamLTfe, 1), f1(pbFE, 2), "N/mm\u00B2  [Annex B.2, rolled]");
      line("Mb = Sx.pb \u2264 Mc", f1(WbsFE / 1e3, 1) + " x " + f1(pbFE, 2), f1(Mb, 3), "kN.m  [shape via mLT downstream]");
    } else if (sec.family === "box-hf" || sec.family === "box-cf") {
      /* Annex B.2.6 box (incl. RHS): lamLT = 2.25(phi_b.lam.betaW)^0.5,
         gamma_b = (1 - Iy/Ix)(1 - J/2.6Ix). Square SHS: gamma_b = 0 -> Mb = Mc. */
      var IxB = (sec.Iy_cm4 || 0) * 1e4, IyB = (sec.Iz_cm4 || 0) * 1e4, JB = (sec.IT_cm4 || 0) * 1e4;
      var gamB = (IxB > 0 && JB > 0) ? Math.max((1 - IyB / IxB) * (1 - JB / (2.6 * IxB)), 0) : 0;
      if (gamB < 1e-9) {
        Mb = Mcx; line("Mb = Mc", "Box section \u2014 \u03B3b = 0 per Annex B.2.6 (square/near-square): not susceptible", f1(Mb), "kN.m");
      } else {
        var lamB = inp.KLT * inp.H / ry;
        var betaWB = (semi ? Z / S : 1.0);
        var phiB = Math.sqrt(S * S * gamB / (A * JB));
        var lamLTB = 2.25 * Math.sqrt(phiB * lamB * betaWB);
        var pbB = pbAnnexB(py, lamLTB);
        Mb = Math.min((semi ? Z : S) * pbB / 1e6, Mcx);
        lamLTout = lamLTB; pbOut = pbB;
        line("\u03BBLT = 2.25(\u03C6b.\u03BB.\u03B2w)^0.5", "\u03C6b = " + f1(phiB) + ", \u03B3b = " + f1(gamB) + ", \u03BB = " + f1(lamB, 1) + "   [Annex B.2.6]", f1(lamLTB, 2), "");
        line("Mb = Sx.pb \u2264 Mc", f1((semi ? Z : S) / 1e3, 1) + " x " + f1(pbB, 2), f1(Mb, 3), "kN.m");
      }
    } else if (inp.axis === "minor") {
      Mb = Mcx; line("Mb = Mc", "Bending about the minor axis \u2014 LTB not applicable", f1(Mb), "kN.m");
    } else {
      var Le = inp.KLT * inp.H, lam = Le / ry;
      var betaW = (semi ? Z / S : 1.0);
      var v = 1 / Math.pow(1 + 0.05 * Math.pow(lam / sec.x, 2), 0.25);
      var lamLT = sec.u * v * lam * Math.sqrt(betaW);
      var pb = pbAnnexB(py, lamLT);
      lamLTout = lamLT; vOut = v; pbOut = pb;
      Mb = Math.min((semi ? Z : S) * pb / 1e6, Mcx);
      line("Le = KLT.L", f1(inp.KLT, 1) + " x " + inp.H / 1000, f1(Le / 1000, 1), "m");
      line("\u03BB = Le/ry", f1(Le / 1000, 1) * 1000 / 1 + " / " + f1(ry, 1), f1(lam, 1), "");
      line("v = Fn(x, \u03BB)", "x = " + f1(sec.x, 1) + (sec.uxApprox ? "  [u, x per Annex B.2.3 with approximated Iw \u2014 verify]" : "  [section tables]"), f1(v), "  [Table 19]");
      line("\u03BBLT = u.v.\u03BB.\u221A\u03B2w", f1(sec.u, 3) + " x " + f1(v) + " x " + f1(lam, 1) + " x \u221A" + f1(betaW, 3), f1(lamLT, 1), "");
      line("pb = Fn(py, \u03BBLT)", py + ", " + f1(lamLT, 1), f1(pb, 2), "N/mm\u00B2  [Table 16 / Annex B.2, rolled]");
      line("Mb = Sx.pb \u2264 Mc", f1((semi ? Z : S) / 1e3, 1) + " x " + f1(pb, 2), f1(Mb, 3), "kN.m");
    }

    /* ---- Interaction values (computed for all families) ---- */
    var pyZ = py * Z / 1e6;
    var s1 = F / Pc + mx * Mx / pyZ;
    var s2 = F / Pcy + mLT * Mx / Mb;
    utils.simple1 = s1; utils.simple2 = s2;
    var e1 = null, e2 = null, Max = null;
    var isIH = sec.family === "I" || sec.family === "H";
    if (!semi && Mrx !== null) {
      Max = Mcx / (1 + 0.5 * F / Pcx);
      e1 = F / Pcx + mx * Mx / Max;
      e2 = isIH ? (F / Pcy + mLT * Mx / Mb) : (F / Pcy + 0.5 * mLT * Mx / Mcx);
      utils.exact1 = e1; utils.exact2 = e2;
    }

    var AI = null;
    var epsA = Math.sqrt(275 / py), lim858 = 85.8 * epsA;
    var annexIApplies = isIH && !semi && Mrx !== null && inp.axis !== "minor" && lamLTout !== null &&
      Math.min(lx, ly, lamLTout) < lim858;   // AD 301 condition 3
    if (annexIApplies) {
      /* ---- Annex I (I and H sections; AD 301 conditions: doubly symmetric,
         Class 1/2, and at least one of lx/ly/lLT < 85.8*eps) ----
         Max/May/Mab interpolate linearly between the short-strut value at
         lam0 = 17.15*eps (lamRo for Mab) and the slender value at
         lam1 = 85.8*eps; Max/May verified exactly against MasterKey. */
      block("Combined Axial Compression and Bending to Annex I");
      line("Annex I1 applicability", "Doubly symmetric, Class 1/2, min(\u03BBx, \u03BBy, \u03BBLT) = " + f1(Math.min(lx, ly, lamLTout), 1) + " < 85.8\u03B5 = " + f1(lim858, 1) + "   [AD 301]", "", "", true);
      var eps = Math.sqrt(275 / py);
      var lam1 = 85.8 * eps;   // Annex I1 revert point (= pi*sqrt(E/py); AD 301)
      var lam0 = 17.15 * eps;
      function interpI(lam, l0, Mhigh, Mlow) {
        if (lam <= l0) return Mhigh;
        if (lam >= lam1) return Mlow;
        return Mhigh - (Mhigh - Mlow) * (lam - l0) / (lam1 - l0);
      }
      var rb = mLT * Mx / Mb, rc = F / Pcy;
      var lamR = (rb * lamLTout + rc * ly) / (rb + rc);
      var lamRo = lam0 * (2 * rb + rc) / (rb + rc);
      var Mob = Mb * (1 - F / Pcy);
      var Mxy = Mcx * Math.sqrt(1 - F / Pcy);
      var Mox = Mcx * (1 - F / Pcx) / (1 + 0.5 * F / Pcx);
      var Mcy = Math.min(py * (sec.Sz_cm3 || 0) * 1e3, 1.2 * py * (sec.Zz_cm3 || sec.Sz_cm3 || 0) * 1e3) / 1e6;
      var Moy = Mcy * (1 - F / Pcy) / (1 + 1.0 * F / Pcy);
      var Mab = Math.max(interpI(lamR, lamRo, Mrx, Mob), Mob);
      Mab = Math.min(Mab, Mxy);   // Annex I.1: Mab <= Mxy cap
      var MaxI = interpI(lx, lam0, Mrx, Mox);
      var MayI = interpI(ly, lam0, Mcy, Moy);
      var iax = mx * Mx / MaxI, iab = mLT * Mx / Mab;
      line("rb=mLT.MLT/Mb", f1(mLT, 3) + "x" + f1(Mx, 1) + "/" + f1(Mb, 1), f1(rb), "");
      line("rc=Fc/Pcy", f1(F, 1) + "/" + f1(Pcy, 1), f1(rc), "");
      line("\u03BBr=(rb\u03BBLT+rc\u03BBy)/(rb+rc)", "(" + f1(rb) + "\u2022" + f1(lamLTout, 1) + "+" + f1(rc) + "\u2022" + f1(ly, 1) + ")/(" + f1(rb) + "+" + f1(rc) + ")", f1(lamR), "");
      line("\u03BBro=17.15 \u03B5 (2rb+rc)/(rb+rc)", "17.15\u2022" + f1(eps) + "\u2022(2\u2022" + f1(rb) + "+" + f1(rc) + ")/(" + f1(rb) + "+" + f1(rc) + ")", f1(lamRo), "");
      line("Mob= Mb(1-Fc/Pcy)", f1(Mb) + "(1-" + f1(F, 1) + "/" + f1(Pcy, 1) + ")", f1(Mob), "");
      line("Mxy= Mcx(1-Fc/Pcy)\u00BD", f1(Mcx) + "(1-" + f1(F, 1) + "/" + f1(Pcy, 1) + ")\u00BD", f1(Mxy), "");
      line("Mox= Mcx(1-Fc/Pcx)/(1+0.5Fc/Pcx)", f1(Mcx) + "(1-" + f1(F, 1) + "/" + f1(Pcx, 1) + ")/(1+0.5\u2022" + f1(F, 1) + "/" + f1(Pcx, 1) + ")", f1(Mox), "");
      line("Moy= Mcy(1-Fc/Pcy)/(1+ky(Fc/Pcy))", f1(Mcy) + "(1-" + f1(F, 1) + "/" + f1(Pcy, 1) + ")/(1+1.0(" + f1(F, 1) + "/" + f1(Pcy, 1) + "))", f1(Moy), "");
      line("Mab=fn( \u03BBr, \u03BBro, \u03B5, Mxy, Mob)", f1(lamR) + ", " + f1(lamRo) + ", " + f1(eps) + ", " + f1(Mxy) + ", " + f1(Mob) + "   [Mrx\u2192Mob interpolation, capped \u2264 Mxy; Annex I.1]", f1(Mab), "");
      line("Max=fn( \u03BBx, \u03B5, Mrx, Mox)", f1(lx) + ", " + f1(eps) + ", " + f1(Mrx) + ", " + f1(Mox), f1(MaxI), "");
      line("May=fn( \u03BBy, \u03B5, Mry, Moy)", f1(ly) + ", " + f1(eps) + ", " + f1(Mcy) + ", " + f1(Moy), f1(MayI), "");
      line("mx.Mx/Max", f1(mx, 3) + "x" + f1(Mx, 1) + "/" + f1(MaxI, 1), f1(iax), "", iax <= 1);
      line("mLT.MLT/Mab", f1(mLT, 3) + "x" + f1(Mx, 1) + "/" + f1(Mab, 1), f1(iab), "", iab <= 1);
      line("mx.Mx/Max", f1(mx, 3) + "x" + f1(Mx, 1) + "/" + f1(MaxI, 1), f1(iax), "", iax <= 1);
      var e3info = mx * Mx * (1 + 0.5 * F / Pcx) / (Mcx * (1 - F / Pcx));
      line("Compare with Simplified to 4.8.3.3", f1(s1) + ", " + f1(s2) + ", " + f1(Math.max(s1, s2)) + "   [AD 301: Annex I1 and 4.8.3.3 unity factors are not directly comparable; both retained, worst governs]", f1(Math.max(s1, s2)), "");
      line("Compare with MoreExact to 4.8.3.3", f1(e1) + ", " + f1(e2) + ", " + f1(e3info) + " (interactive, informational)", f1(Math.max(e1, e2)), "");
      utils.annexI_ax = iax; utils.annexI_ab = iab;
      AI = { rb: rb, rc: rc, lamR: lamR, lamRo: lamRo, Mob: Mob, Mxy: Mxy, Mox: Mox, Mcy: Mcy, Moy: Moy, Mab: Mab, MaxI: MaxI, MayI: MayI, iax: iax, iab: iab };
    } else {
      /* ---- Simplified interaction (channels, boxes, semi-compact, minor axis) ---- */
      block("Simplified Approach (cl. 4.8.3.3.1)");
      line("py.Zx", py + " x " + f1(Z / 1e3, 1), f1(pyZ, 3), "kN.m");
      line("F/Pc + mx.Mx/py.Zx", f1(F, 2) + "/" + f1(Pc, 2) + " + " + f1(mx, 2) + "x" + f1(Mx, 1) + "/" + f1(pyZ, 1), f1(s1), "", s1 <= 1);
      line("F/Pcy + mLT.MLT/Mb", f1(F, 2) + "/" + f1(Pcy, 2) + " + " + f1(mLT, 2) + "x" + f1(Mx, 1) + "/" + f1(Mb, 1), f1(s2), "", s2 <= 1);
      if (e1 !== null) {
        block("More Exact Approach (cl. 4.8.3.3.2, as implemented by MasterKey)");
        line("Max = Mcx/(1+.5F/Pcx)", f1(Mcx, 1) + "/(1+.5x" + f1(F, 1) + "/" + f1(Pcx, 1) + ")", f1(Max), "kN.m");
        line("F/Pcx + mx.Mx/Max", f1(F, 1) + "/" + f1(Pcx, 1) + " + " + f1(mx, 2) + "x" + f1(Mx, 1) + "/" + f1(Max, 1), f1(e1), "", e1 <= 1);
        line("F/Pcy + .5mLT.MLT/Mcx", f1(F, 1) + "/" + f1(Pcy, 1) + " + .5x" + f1(mLT, 2) + "x" + f1(Mx, 1) + "/" + f1(Mcx, 1), f1(e2), "", e2 <= 1);
      }
    }

    /* ---- Deflections (app's own combination, per user instruction) ---- */
    if (inp.defl) {
      block("Deflection Checks \u2014 taken from the analysis load combination as run");
      var lim1 = inp.H / 360, lim2 = inp.H / 150;
      line("In-span \u03B4 \u2264 Span/360", f1(inp.defl.inspan, 2) + " \u2264 " + inp.H + "/360 = " + f1(lim1, 2), f1(inp.defl.inspan, 2), "mm", inp.defl.inspan <= lim1);
      line("Lateral sway \u03B4 \u2264 Span/150" + (inp.defl.note ? "  [" + inp.defl.note + "]" : ""),
        f1(inp.defl.sway, 2) + " \u2264 " + inp.H + "/150 = " + f1(lim2, 2), f1(inp.defl.sway, 2), "mm", inp.defl.sway <= lim2);
      utils.sway = inp.defl.sway / lim2;
      utils.inspan = inp.defl.inspan / lim1;
    }

    /* ---- Governing summary ---- */
    var names = { local: "Local capacity (4.8.2.3)", simple1: "Buckling, major (4.8.3.3.1)", simple2: "Buckling, LTB (4.8.3.3.1)", exact1: "Buckling, major (4.8.3.3.2)", exact2: "Buckling, LTB (4.8.3.3.2)", annexI_ax: "Annex I, major axis", annexI_ab: "Annex I, lateral buckling", sway: "Lateral sway H/150", inspan: "In-span deflection H/360" };
    var gk = null, gv = -1;
    Object.keys(utils).forEach(function (k) { if (utils[k] > gv) { gv = utils[k]; gk = k; } });
    return { blocks: blocks, utils: utils, governing: { key: gk, name: names[gk], value: gv, pass: gv <= 1 && !cl.slender && !highShear }, slender: cl.slender, highShear: highShear, derived: { Pv: Pv, Mcx: Mcx, Pz: Pz, n: n, Mrx: Mrx, Pcx: Pcx, Pcy: Pcy, mx: mx, mLT: mLT, Mb: Mb, Max: Max, s1: s1, s2: s2, e1: e1, e2: e2, localU: localU, lx: lx, ly: ly, lamLT: lamLTout, v: vOut, pb: pbOut, AI: AI } };
  }

  /* ------------------------------------------------------------------
     COLUMN STITCHER — rebuilds the full-height member from the solved
     segments and samples N(y), V(y), M(y). Read-only on `result`.
     ------------------------------------------------------------------ */
  function stitchColumn(result, diagramValueFn) {
    var segs = result.elements.filter(function (el) {
      var ni = result.nodes[el.i - 1], nj = result.nodes[el.j - 1];
      return ni.x === 0 && nj.x === 0;
    }).slice().sort(function (a, b) { return result.nodes[a.i - 1].y - result.nodes[b.i - 1].y; });
    if (!segs.length) return null;
    var H = result.input.columnHeight;
    var N_TO_KN = 1 / 1000, NMM_TO_KNM = 1 / 1e6;
    function at(y) {
      var yc = Math.min(Math.max(y, 0), H);
      for (var s = 0; s < segs.length; s++) {
        var el = segs[s], y1 = result.nodes[el.i - 1].y, y2 = result.nodes[el.j - 1].y;
        if (yc <= y2 + 1e-6 || s === segs.length - 1) {
          var d = diagramValueFn(el, Math.min(Math.max(yc - y1, 0), el.L));
          return { N: d.N * N_TO_KN, V: d.V * N_TO_KN, M: d.M * NMM_TO_KNM };
        }
      }
      return { N: 0, V: 0, M: 0 };
    }
    var momentSegments = segs.map(function (el, index) {
      var y1 = result.nodes[el.i - 1].y;
      var y2 = result.nodes[el.j - 1].y;
      var d1 = diagramValueFn(el, 0);
      var d2 = diagramValueFn(el, el.L);
      return {
        index: index,
        y1: y1,
        y2: y2,
        M1: d1.M * NMM_TO_KNM,
        M2: d2.M * NMM_TO_KNM
      };
    });
    var stations = 96, Mmax = 0, Fv = 0, F = 0;
    momentSegments.forEach(function (segment) {
      Mmax = Math.max(Mmax, Math.abs(segment.M1), Math.abs(segment.M2));
    });
    for (var i = 0; i <= stations; i++) {
      var q = at(H * i / stations);
      if (Math.abs(q.M) > Mmax) Mmax = Math.abs(q.M);
      if (Math.abs(q.V) > Fv) Fv = Math.abs(q.V);
      if (q.N > F) F = q.N;      // compression positive: p0 = EA/L(u_i - u_j) > 0 when shortened
    }
    var M2 = Math.abs(at(H / 4).M), M3 = Math.abs(at(H / 2).M), M4 = Math.abs(at(3 * H / 4).M);
    var M24 = 0;
    for (var j = 0; j <= 48; j++) { var yy = H / 4 + (H / 2) * j / 48; var m = Math.abs(at(yy).M); if (m > M24) M24 = m; }
    return { H: H, F: F, Fv: Fv, Mmax: Mmax, M2: M2, M3: M3, M4: M4, M24: M24, at: at, segments: segs.length, momentSegments: momentSegments };
  }

  /* PFC supplementary data from SCI P363 (Blue Book): d = depth between
     fillets (mm), Iw = warping constant (dm6), y0 = centroid-to-shear-
     centre distance (mm, computed from P363 e0 via y0 = e0 + cz - tw/2).
     BS-mode u/x are computed from Annex B.2.3 using these; the two entries
     marked with u/x were additionally verified against MasterKey output. */
  var PFC_UX = {
    "430 x 100 x 64": { d: 362, Iw_dm6: 0.219000, y0: 53.45 },
    "380 x 100 x 54": { d: 315, Iw_dm6: 0.150000, y0: 57.96 },
    "300 x 100 x 46": { d: 237, Iw_dm6: 0.081300, y0: 62.78 },
    "300 x 90 x 41":  { d: 245, Iw_dm6: 0.058100, y0: 53.27 },
    "260 x 90 x 35":  { d: 208, Iw_dm6: 0.037900, y0: 56.50 },
    "260 x 75 x 28":  { d: 212, Iw_dm6: 0.020300, y0: 43.92 },
    "230 x 90 x 32":  { d: 178, Iw_dm6: 0.027900, y0: 60.12 },
    "230 x 75 x 26":  { d: 181, Iw_dm6: 0.015300, y0: 47.54 },
    "200 x 90 x 30":  { u: 0.954, x: 12.9, d: 148, Iw_dm6: 0.019700, y0: 63.70 },
    "200 x 75 x 23":  { d: 151, Iw_dm6: 0.010700, y0: 50.80 },
    "180 x 90 x 26":  { d: 131, Iw_dm6: 0.014100, y0: 64.71 },
    "180 x 75 x 20":  { d: 135, Iw_dm6: 0.007540, y0: 50.01 },
    "150 x 90 x 24":  { d: 102, Iw_dm6: 0.008900, y0: 66.87 },
    "150 x 75 x 18":  { d: 106, Iw_dm6: 0.004670, y0: 52.90 },
    "125 x 65 x 15":  { d:  82, Iw_dm6: 0.001940, y0: 45.30 },
    "100 x 50 x 10":  { d:  65, Iw_dm6: 0.000491, y0: 34.24 }
  };

  var ENGINE = {
    pyTable9: pyTable9, pcAnnexC: pcAnnexC, pbAnnexB: pbAnnexB,
    mTable26: mTable26, mTable18: mTable18, strutCurves: strutCurves,
    classifySection: classifySection, designColumn: designColumn,
    stitchColumn: stitchColumn, PFC_UX: PFC_UX, E_DESIGN: E_DESIGN,
    channelUX: channelUX
  };
  globalThis.RACK_BS5950_ENGINE = ENGINE;
})();
