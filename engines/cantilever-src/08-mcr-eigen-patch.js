/* =====================================================================
   mcr-eigen-patch.js
   Replaces the C1-lookup / SN003a / SN006a / PFC-kappa LTB machinery in
   BEAM DESIGN CODE with a direct finite-element eigenvalue solution for
   the elastic critical moment.

   HOW TO APPLY
   ------------
   Paste this entire file inside the app's existing <script> block,
   immediately BEFORE the final `wire(); ... recompute();` lines.
   It reassigns two function bindings and injects one UI panel. Nothing
   else in the file is touched, so the encoding of the existing source is
   preserved.

   Once it is running and you have re-run your validation examples, the
   following become dead and can be deleted in a cp1252-safe editor:

       C1_END_MOMENT        (~line 419)
       SN006 / sn006C       (~lines 425-489)
       sernaC1              (~line 495)
       c1FromPsi            (~line 500)
       computeC1            (~line 508)
       mcrEC3               (~line 528)
       checksEC3            (~lines 1828-1960)   <- already dead, never called
       sn003aC1             (~lines 2282-2309)

   WHAT CHANGES IN THE NUMBERS
   ---------------------------
   * C1 is no longer an input. Mcr comes out of the eigenproblem directly
     and lamLT = sqrt(Wy*fy/Mcr).
   * The old `computeC1`/`sn003aC1` returned C1 = 1.0 for every combined
     end-moment + transverse-load case. The true value is 1.13 to 2.75.
     Expect Mb,Rd to RISE on those beams. This is a correction, not a
     relaxation, but re-run your worked examples before trusting it.
   * The simplified route (P362 Expn 6.55) is gone. It was the design
     basis; the Mcr route was only used to rescue it.
   * Load height enters through zg on every load, for every moment
     diagram - not just the two shapes SN003a tabulates C2 for.
   * The destabilising x1.2 switch no longer affects EC3 LTB (zg does).
     LE-factor no longer affects EC3 LTB (restraint positions do).
     Both still drive the strut check.
   * PFC: lamLT now comes from Mcr, not (L/iz)/kappa. See NOTE ON CHANNELS.
   * Cantilevers: no SN006a table-range blocking (kwt <= 1, -2 <= eta <= 3).

   SIGN CONVENTIONS (must hold, and are asserted at load time)
   -----------------------------------------------------------
     x  along the span, 0..L        [mm]
     z  vertical, POSITIVE UPWARD, from the shear centre
     M  sagging POSITIVE            [N.mm]
     q,P transverse loads POSITIVE DOWNWARD
     zg is read directly from the UI as height above the shear centre;
     POSITIVE when the load acts ABOVE the shear centre
     zj > 0 when the compression flange is the larger flange

   Note the app's own comboLoads() returns downward loads as NEGATIVE.
   This patch reads S.loads directly and re-signs them; it does not use
   comboLoads(). assertSaggingPositive() below verifies the BMD sign at
   load time and throws loudly if a future edit flips it.

   NOTE ON CHANNELS
   ----------------
   A PFC bent about its major axis is symmetric about that axis: the
   mirror across mid-height maps top flange onto bottom flange. Hence
   zj = 0 and the shear centre lies on the horizontal centroidal axis.
   Its offset e0 is HORIZONTAL, and an eccentric load applies a PRIMARY
   TORQUE - a separate action, not a buckling term. It must not be folded
   into zg. So: eigen Mcr with zj = 0 and Iw about the shear centre, then
   the EN 1993-6 Annex A interaction (already in this app) combines it
   with the P385 torsion. If a channel carries eccentric load and the
   Annex A check cannot run, PASS is blocked.
   ===================================================================== */
(function () {
  'use strict';

  var PI = Math.PI, G_STEEL = 81000;   // N/mm2, per SN003a / P385 (NOT E/2.6)
  // Tool thresholds, not code requirements. Near lamLT ~ 1, chi_LT varies
  // roughly with sqrt(Mcr), so d(MbRd)/MbRd is about 0.5*d(Mcr)/Mcr.
  var MESH_WARN = 0.001;   // 0.1% - mention it
  var MESH_BLOCK = 0.005;  // 0.5% - refuse to certify

  /* ================================================================
     PART 1 - LTB eigenvalue engine
     Verified against: uniform moment (exact), Iw=0 (exact),
     Kitipornchai & Trahair monosymmetric closed form (exact),
     zg reversal identity (exact), midspan restraint -> L/2 problem,
     Timoshenko cantilever constants 4.013 / 12.85.
     ================================================================ */

  function zeros(n, m) { var A = [], i; for (i = 0; i < n; i++) A.push(new Float64Array(m === undefined ? n : m)); return A; }
  function transpose(A) { var n = A.length, m = A[0].length, B = zeros(m, n), i, j; for (i = 0; i < n; i++) for (j = 0; j < m; j++) B[j][i] = A[i][j]; return B; }
  function nrm2(x) { var s = 0, i; for (i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s); }
  function matvec(A, x, out) { var n = A.length, i, j, s, Ai; for (i = 0; i < n; i++) { s = 0; Ai = A[i]; for (j = 0; j < n; j++) s += Ai[j] * x[j]; out[i] = s; } return out; }
  function seedVec(n, s) { var x = new Float64Array(n), i; for (i = 0; i < n; i++) x[i] = Math.sin(1.7 * (i + 1) + s) + 0.31 * Math.cos(0.37 * (i + 1) + s); var d = nrm2(x); for (i = 0; i < n; i++) x[i] /= d; return x; }

  var GP = [[0.033765242898424, 0.085662246189585], [0.169395306766868, 0.180380786524069],
            [0.380690406958402, 0.233956967286346], [0.619309593041598, 0.233956967286346],
            [0.830604693233132, 0.180380786524069], [0.966234757101576, 0.085662246189585]];

  function shape(xi, Le) {
    var x2 = xi * xi, x3 = x2 * xi;
    return {
      N:   [1 - 3 * x2 + 2 * x3, Le * (xi - 2 * x2 + x3), 3 * x2 - 2 * x3, Le * (-x2 + x3)],
      Np:  [(-6 * xi + 6 * x2) / Le, 1 - 4 * xi + 3 * x2, (6 * xi - 6 * x2) / Le, -2 * xi + 3 * x2],
      Npp: [(-6 + 12 * xi) / (Le * Le), (-4 + 6 * xi) / Le, (6 - 12 * xi) / (Le * Le), (-2 + 6 * xi) / Le]
    };
  }
  function kBend(EI, Le) {
    var c = EI / (Le * Le * Le), L = Le, L2 = Le * Le;
    return [[12 * c, 6 * L * c, -12 * c, 6 * L * c], [6 * L * c, 4 * L2 * c, -6 * L * c, 2 * L2 * c],
            [-12 * c, -6 * L * c, 12 * c, -6 * L * c], [6 * L * c, 2 * L2 * c, -6 * L * c, 4 * L2 * c]];
  }
  function kTors(GJ, Le) {
    var c = GJ / (30 * Le), L = Le, L2 = Le * Le;
    return [[36 * c, 3 * L * c, -36 * c, 3 * L * c], [3 * L * c, 4 * L2 * c, -3 * L * c, -L2 * c],
            [-36 * c, -3 * L * c, 36 * c, -3 * L * c], [3 * L * c, -L2 * c, -3 * L * c, 4 * L2 * c]];
  }
  function cholesky(A) {
    var n = A.length, L = zeros(n), i, j, k, s;
    for (i = 0; i < n; i++) for (j = 0; j <= i; j++) {
      s = A[i][j]; for (k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (s <= 1e-300) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
    }
    return L;
  }
  function solveLower(L, B) {
    var n = L.length, m = B[0].length, X = zeros(n, m), i, j, c, s;
    for (c = 0; c < m; c++) for (i = 0; i < n; i++) {
      s = B[i][c]; for (j = 0; j < i; j++) s -= L[i][j] * X[j][c]; X[i][c] = s / L[i][i];
    }
    return X;
  }
  function solveUpperT(L, b) {
    var n = L.length, x = new Float64Array(n), i, j, s;
    for (i = n - 1; i >= 0; i--) { s = b[i]; for (j = i + 1; j < n; j++) s -= L[j][i] * x[j]; x[i] = s / L[i][i]; }
    return x;
  }

  /* Spectral radius via power iteration on A^2.
     Necessary because when zg = zj = 0 the elastic matrix has no v-phi
     coupling, Cholesky preserves the (v,phi) block split, Kg is purely
     off-diagonal, and A = [[0,C],[C^T,0]] has an exactly symmetric +-mu
     spectrum on which plain power iteration silently returns a wrong,
     "converged" Rayleigh quotient. Squaring makes the dominant eigenvalue
     simple; shifting afterwards keeps it that way. */
  function spectralRadius(A) {
    var n = A.length, x = seedVec(n, 0.3), v = new Float64Array(n), w = new Float64Array(n);
    var r2 = 0, r2o = NaN, i, it, nw;
    for (it = 0; it < 5000; it++) {
      matvec(A, x, v);
      r2 = 0; for (i = 0; i < n; i++) r2 += v[i] * v[i];
      matvec(A, v, w); nw = nrm2(w);
      if (nw < 1e-300 || r2 < 1e-300) return Math.sqrt(Math.max(r2, 0));
      for (i = 0; i < n; i++) x[i] = w[i] / nw;
      if (it > 3 && Math.abs(r2 - r2o) <= 1e-15 * r2) break;
      r2o = r2;
    }
    return Math.sqrt(r2);
  }
  function dominantShifted(A, shift, seed) {
    var n = A.length, x = seedVec(n, seed), y = new Float64Array(n), Ax = new Float64Array(n);
    var mu = 0, muOld = NaN, i, it, ny, conv = false;
    for (it = 0; it < 20000; it++) {
      matvec(A, x, Ax);
      for (i = 0; i < n; i++) y[i] = Ax[i] - shift * x[i];
      ny = nrm2(y); if (ny < 1e-300) { mu = shift; conv = true; break; }
      for (i = 0; i < n; i++) x[i] = y[i] / ny;
      matvec(A, x, Ax);
      mu = 0; for (i = 0; i < n; i++) mu += x[i] * Ax[i];
      if (it > 3 && Math.abs(mu - muOld) <= 1e-14) { conv = true; break; }
      muOld = mu;
    }
    return { mu: mu, vec: x, converged: conv };
  }

  function meshNodes(L, forced, nElem) {
    var pts = [0, L], i, j;
    forced.forEach(function (x) { if (x > 1e-9 && x < L - 1e-9) pts.push(x); });
    pts.sort(function (a, b) { return a - b; });
    var uniq = [pts[0]];
    for (i = 1; i < pts.length; i++) if (pts[i] - uniq[uniq.length - 1] > 1e-6) uniq.push(pts[i]);
    var nodes = [uniq[0]];
    for (i = 0; i < uniq.length - 1; i++) {
      var a = uniq[i], b = uniq[i + 1], k = Math.max(1, Math.round(nElem * (b - a) / L));
      for (j = 1; j <= k; j++) nodes.push(a + (b - a) * j / k);
    }
    return nodes;
  }
  function nearestNode(nodes, x) {
    var bi = 0, bd = Infinity, i;
    for (i = 0; i < nodes.length; i++) { var d = Math.abs(nodes[i] - x); if (d < bd) { bd = d; bi = i; } }
    return bi;
  }

  function mcrOnce(p) {
    var E = p.E, G = p.G === undefined ? G_STEEL : p.G;
    var Iz = p.Iz, It = p.It, Iw = p.Iw || 0, L = p.L, zj = p.zj || 0;
    var nElem = p.nElem || 32, dl = p.distLoads || [], pl = p.pointLoads || [], rst = p.restraints || [];
    var M = p.moment, i, j, k;

    var forced = [];
    rst.forEach(function (r) { forced.push(r.x); });
    pl.forEach(function (q) { forced.push(q.x); });
    dl.forEach(function (q) { forced.push(q.x1); forced.push(q.x2); });
    var nodes = meshNodes(L, forced, nElem), nn = nodes.length, nd = 4 * nn;

    function qzg(x) {
      var s = 0, d, w;
      for (var t = 0; t < dl.length; t++) {
        d = dl[t];
        if (x < d.x1 - 1e-9 || x > d.x2 + 1e-9) continue;
        w = (d.x2 - d.x1 < 1e-9) ? d.w1 : d.w1 + (d.w2 - d.w1) * (x - d.x1) / (d.x2 - d.x1);
        s += w * (d.zg || 0);
      }
      return s;
    }

    var Ke = zeros(nd), Kg = zeros(nd), vL = [0, 1, 4, 5], pLoc = [2, 3, 6, 7];
    for (var e = 0; e < nn - 1; e++) {
      var x0 = nodes[e], Le = nodes[e + 1] - x0;
      var Kb = kBend(E * Iz, Le), Kw = kBend(E * Iw, Le), Kt = kTors(G * It, Le);
      var g = []; for (i = 0; i < 8; i++) g.push(4 * e + i);
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) {
        Ke[g[vL[i]]][g[vL[j]]] += Kb[i][j];
        Ke[g[pLoc[i]]][g[pLoc[j]]] += Kw[i][j] + Kt[i][j];
      }
      var cpl = zeros(4, 4), gpp = zeros(4, 4);
      for (k = 0; k < GP.length; k++) {
        var xi = GP[k][0], wt = GP[k][1] * Le, x = x0 + xi * Le;
        var S2 = shape(xi, Le), Mx = M(x), qz = qzg(x);
        for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) {
          cpl[i][j] += Mx * S2.Npp[i] * S2.N[j] * wt;                       // INT M v'' phi
          gpp[i][j] += (2 * zj * Mx * S2.Np[i] * S2.Np[j]                   // Wagner
                        - qz * S2.N[i] * S2.N[j]) * wt;                     // load height
        }
      }
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) {
        Kg[g[vL[i]]][g[pLoc[j]]] += cpl[i][j];
        Kg[g[pLoc[j]]][g[vL[i]]] += cpl[i][j];
        Kg[g[pLoc[i]]][g[pLoc[j]]] += gpp[i][j];
      }
    }
    pl.forEach(function (q) {
      var ni = nearestNode(nodes, q.x);
      Kg[4 * ni + 2][4 * ni + 2] += -q.P * (q.zg || 0);
    });

    var fixed = {};
    rst.forEach(function (r) {
      var ni = nearestNode(nodes, r.x);
      if (r.v === undefined ? true : !!r.v) fixed[4 * ni + 0] = 1;
      if (r.vp) fixed[4 * ni + 1] = 1;
      if (r.phi === undefined ? true : !!r.phi) fixed[4 * ni + 2] = 1;
      if (r.phip) fixed[4 * ni + 3] = 1;
    });
    var free = []; for (var d2 = 0; d2 < nd; d2++) if (!fixed[d2]) free.push(d2);
    var nf = free.length;
    if (nf < 2) throw new Error('LTB model has fewer than 2 free degrees of freedom.');

    var Kef = zeros(nf), Kgf = zeros(nf);
    for (i = 0; i < nf; i++) for (j = 0; j < nf; j++) { Kef[i][j] = Ke[free[i]][free[j]]; Kgf[i][j] = Kg[free[i]][free[j]]; }

    var Lc = cholesky(Kef);
    if (!Lc) throw new Error('LTB elastic stiffness is singular: the member is laterally under-restrained. ' +
      'Provide at least two points of lateral restraint, or lateral-bending restraint at a built-in support.');

    var X = solveLower(Lc, Kgf), Y = solveLower(Lc, transpose(X)), A = transpose(Y);
    for (i = 0; i < nf; i++) for (j = i + 1; j < nf; j++) { var m = 0.5 * (A[i][j] + A[j][i]); A[i][j] = m; A[j][i] = m; }

    var rho = spectralRadius(A);
    if (!(rho > 0)) throw new Error('LTB geometric stiffness is null: the moment diagram is identically zero.');
    var As = zeros(nf);
    for (i = 0; i < nf; i++) for (j = 0; j < nf; j++) As[i][j] = A[i][j] / rho;
    var sig = 1 + 1e-6;
    var dLo = dominantShifted(As, sig, 0.7), dHi = dominantShifted(As, -sig, 1.9);
    var muMin = dLo.mu * rho, muMax = dHi.mu * rho;

    var Mref = 0;
    for (i = 0; i <= 2000; i++) { var av = Math.abs(M(L * i / 2000)); if (av > Mref) Mref = av; }

    var eps = 1e-12 * Math.max(Math.abs(muMin), Math.abs(muMax), 1e-300);
    var lamPos = (muMin < -eps) ? -1 / muMin : Infinity;
    var lamNeg = (muMax > eps) ? -1 / muMax : -Infinity;

    var mode = null;
    if (dLo.vec) {
      var dv = solveUpperT(Lc, dLo.vec), full = new Float64Array(nd);
      for (i = 0; i < nf; i++) full[free[i]] = dv[i];
      var pk = 0; for (i = 0; i < nn; i++) pk = Math.max(pk, Math.abs(full[4 * i + 2]));
      mode = { x: nodes.slice(), phi: [], v: [] };
      for (i = 0; i < nn; i++) { mode.phi.push(pk > 0 ? full[4 * i + 2] / pk : 0); mode.v.push(full[4 * i]); }
    }
    return { Mcr: lamPos * Mref, lambda: lamPos, McrRev: Math.abs(lamNeg) * Mref, lambdaRev: lamNeg,
             Mref: Mref, nElem: nn - 1, converged: dLo.converged && dHi.converged, mode: mode };
  }

  /* Richardson extrapolation on the O(h^4) eigenvalue error of cubic Hermite. */
  function mcrEigen(p) {
    if (!p.refine) return mcrOnce(p);
    var n0 = p.nElem || 32;
    var co = mcrOnce(Object.assign({}, p, { nElem: n0, refine: false }));
    var fi = mcrOnce(Object.assign({}, p, { nElem: 2 * n0, refine: false }));
    function rich(a, b) { return (isFinite(a) && isFinite(b)) ? (16 * b - a) / 15 : b; }
    fi.lambda = rich(co.lambda, fi.lambda); fi.Mcr = fi.lambda * fi.Mref;
    fi.lambdaRev = rich(co.lambdaRev, fi.lambdaRev); fi.McrRev = Math.abs(fi.lambdaRev) * fi.Mref;
    fi.meshError = Math.abs(fi.Mcr - co.lambda * co.Mref) / Math.max(Math.abs(fi.Mcr), 1e-9);
    fi.converged = co.converged && fi.converged;
    fi.refined = true;
    return fi;
  }

  function momentFromSamples(xs, Ms) {
    return function (x) {
      var n = xs.length;
      if (x <= xs[0]) return Ms[0];
      if (x >= xs[n - 1]) return Ms[n - 1];
      var lo = 0, hi = n - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
      var t = (x - xs[lo]) / (xs[hi] - xs[lo]);
      return Ms[lo] + (Ms[hi] - Ms[lo]) * t;
    };
  }

  /* ================================================================
     PART 2 - sign-convention assertion
     Runs once at load. If a future edit flips comboLoads() or sfdBmd(),
     this fails loudly instead of quietly inverting the zg term (which
     would make top-flange loading look STABILISING).
     ================================================================ */
  function assertSaggingPositive() {
    var L = 6000, EI = 210000 * 3.71e8;
    var sup = [{ pos: 0, type: 'pinned' }, { pos: L, type: 'pinned' }];
    var loads = [{ type: 'udl', x1: 0, x2: L, w1: -10, w2: -10 }];  // downward, app's sign
    var r = solveBeam(L, EI, sup, loads);
    var fb = sfdBmd(L, sup, loads, r.reactions);
    var Mmid = interpAt(fb.xs, fb.M, L / 2);
    if (!(Mmid > 0)) throw new Error(
      'mcr-eigen-patch: BMD sign convention check FAILED. A simply supported beam under downward ' +
      'UDL returned M(L/2) = ' + Mmid + ', expected sagging POSITIVE. The zg load-height term would ' +
      'be inverted. Fix the convention before using this patch.');
    return true;
  }

  /* ================================================================
     PART 3 - build the eigen model from the app's state
     ================================================================ */

  /* Section properties, mm units. Prefers the P385 / Blue Book values
     (tp.IT, tp.Iw) which are taken about the SHEAR CENTRE for channels. */
  function secProps(sec) {
    var tp = sec.tp || {};
    return {
      Iz: sec.Iy * 1e4,                                        // minor-axis I, mm4
      It: ((tp.IT != null ? tp.IT : sec.J) || 0) * 1e4,        // St Venant, mm4
      Iw: ((tp.Iw != null ? tp.Iw : sec.Iw) || 0) * 1e12,      // warping, mm6 (about shear centre)
      hs: sec.D - sec.tf                                       // flange centroid separation
    };
  }

  /* zj: zero for every section in this app's library.
     - I/H (UB, UC): doubly symmetric.
     - PFC: symmetric about the MAJOR axis (top flange maps onto bottom).
     - SHS/RHS: doubly symmetric.
     Non-zero zj belongs to unequal-flange plated I-sections and tees.
     S.zj is exposed so a future plated-section path can supply it. */
  function zjFor(sec) { return (S.zj != null && isFinite(S.zj)) ? +S.zj : 0; }

  function ltbRestraintsFor(a) {
    var out = [], warpRoot = (S.rootWarp === 'restrained') ? 1 : 0;
    var fixLat = (S.fixedLateral === false) ? 0 : 1;
    S.supports.forEach(function (s) {
      var x = (+s.pos) * 1000;
      if (s.type === 'fixed') out.push({ x: x, v: 1, vp: fixLat, phi: 1, phip: warpRoot });
      else out.push({ x: x, v: 1, phi: 1 });
    });
    (S.ltbRestraints || []).forEach(function (r) {
      out.push({ x: (+r.pos) * 1000, v: r.v !== false, vp: !!r.vp, phi: r.phi !== false, phip: !!r.phip });
    });
    return out;
  }

  /* Transverse loads of the governing ULS combination, re-signed DOWNWARD
     POSITIVE, each carrying the load-height zg. Moment loads contribute to
     M(x) but have no load-height term, so they are excluded here.
     This deliberately does NOT call comboLoads(), whose sign is inverted. */
  function unitLoadsFor(a) {
    var fac = a.governM.combo.factors;
    var dl = [], pl = [];
    S.loads.forEach(function (ld) {
      if (ld.isSelfWeight || ld.type === 'moment') return;
      var f = fac[ld.case] != null ? fac[ld.case] : 0;
      if (!f) return;
      var zg = typeof loadZgValue === 'function' ? loadZgValue(ld) : (+S.za || 0);
      if (ld.type === 'point') pl.push({ x: (+ld.pos) * 1000, P: (ld.P || 0) * f * 1000, zg: zg });
      else if (ld.type === 'udl') dl.push({ x1: (+ld.x1) * 1000, x2: (+ld.x2) * 1000, w1: (ld.w || 0) * f, w2: (ld.w || 0) * f, zg: zg });
      else if (ld.type === 'trap') dl.push({ x1: (+ld.x1) * 1000, x2: (+ld.x2) * 1000, w1: (ld.w1 || 0) * f, w2: (ld.w2 || 0) * f, zg: zg });
    });
    var gF = fac.G != null ? fac.G : 0;
    var sw = selfWeightValue(a.sec);
    if (gF > 0 && sw > 0) dl.push({ x1: 0, x2: a.L, w1: sw * gF, w2: sw * gF, zg: 0 }); // self-weight acts at the centroid
    return { distLoads: dl, pointLoads: pl };
  }

  /* Full LTB solve. Returns Mcr, plus a GENERALISED C1 defined as
        C1 = Mcr(actual diagram, zg=0, zj=0) / Mcr(uniform moment, same restraints)
     which reduces to the textbook C1 on a fork-fork span and remains
     meaningful for multi-span and intermediately restrained members,
     where no tabulated C1 exists. Used only for kc (NA 2.18). */
  function solveLTB(a, sec) {
    var sp = secProps(sec), zj = zjFor(sec), ul = unitLoadsFor(a);
    var gfb = a.governM.fb;
    var base = { E: a.E, G: G_STEEL, Iz: sp.Iz, It: sp.It, Iw: sp.Iw, L: a.L,
                 restraints: ltbRestraintsFor(a), nElem: 32, refine: true };

    var actual = mcrEigen(Object.assign({}, base, {
      moment: momentFromSamples(gfb.xs, gfb.M), zj: zj,
      distLoads: ul.distLoads, pointLoads: ul.pointLoads
    }));

    var shapeOnly = mcrEigen(Object.assign({}, base, {
      moment: momentFromSamples(gfb.xs, gfb.M), zj: 0,
      distLoads: ul.distLoads.map(function (d) { return Object.assign({}, d, { zg: 0 }); }),
      pointLoads: ul.pointLoads.map(function (q) { return Object.assign({}, q, { zg: 0 }); })
    }));

    var uniform = mcrEigen(Object.assign({}, base, { moment: function () { return 1e6; }, zj: 0 }));

    var C1 = uniform.Mcr > 0 ? shapeOnly.Mcr / uniform.Mcr : 1;
    var zgVals = ul.distLoads.map(function(d){ return d.zg || 0; }).concat(ul.pointLoads.map(function(q){ return q.zg || 0; }));
    var zgRep = 0;
    zgVals.forEach(function(z){ if(Math.abs(z)>Math.abs(zgRep)) zgRep = z; });
    var zgUnique = [];
    zgVals.forEach(function(z){
      if(!zgUnique.some(function(u){ return Math.abs(u-z)<1e-9; })) zgUnique.push(z);
    });
    return { Mcr: actual.Mcr, McrRev: actual.McrRev, mode: actual.mode,
             meshError: actual.meshError, mcrConverged: actual.converged,
             c1Converged: shapeOnly.converged && uniform.converged,
             C1: C1, McrUniform: uniform.Mcr, McrShape: shapeOnly.Mcr,
             zg: zgRep, zgValues: zgUnique, zgUniform: zgUnique.length <= 1, zj: zj, nElem: actual.nElem, sp: sp };
  }

  function ltbCurve(sec) {
    if (sec.isBox) return { alphaLT: 0.76, curve: 'd' };           // not listed in NA Table 6.3
    if (sec.kind === 'channel') return { alphaLT: 0.76, curve: 'd' }; // not doubly symmetric
    var hb = sec.D / sec.B;
    return hb <= 2 ? { alphaLT: 0.34, curve: 'b' } : hb <= 3.1 ? { alphaLT: 0.49, curve: 'c' } : { alphaLT: 0.76, curve: 'd' };
  }

  /* ================================================================
     PART 4 - replacement LTB check
     ================================================================ */
  /* Rack bundle: rebind the closure-local binding (not window.*) so the
     dispatch inside checks() picks up this validated Mcr-eigen LTB check. */
  checksEC3UnrestrainedSCI = function (a) {
    var b = checksEC3Restrained(a);
    var sec = a.sec, fy = a.py, gM1 = 1.0, Wy = b.Wy;
    var unsupported = b.unsupported.slice();
    var isCant = (S.supports.length === 1 && S.supports[0].type === 'fixed');
    var ltb, warn = [];

    if (sec.isBox) {
      ltb = { na: true, closed: true, box: true, MbRd: b.McRd, MbMcr: b.McRd, MbSimp: b.McRd,
              Mcr: null, C1: null, kc: 1, lamLT: null, warn: warn };
      return Object.assign({}, b, { sci: false, sciU: true, unsupported: unsupported, ltb: ltb,
        ltbUtil: b.momUtil, ltbBasis: 'closed hollow section not susceptible to lateral-torsional buckling per EN 1993-1-1 cl 6.3.2.1(2); M_b,Rd = M_c,Rd',
        C1: null, c1label: 'not required for closed hollow sections', LE: a.L,
        utils: b.utils, gov: b.gov, pass: b.pass, annex: null, buck: b.buck });
    }

    var sol;
    try {
      sol = solveLTB(a, sec);
    } catch (err) {
      unsupported.push('Elastic critical moment: ' + err.message);
      ltb = { eigen: true, failed: true, err: err.message, MbRd: 0, Mcr: 0, C1: 1, kc: 1,
              curve: ltbCurve(sec), ign: false, chi: 0, f: 1, chiMod: 0, lamLT: 0, warn: warn };
      var Mx0 = b.Mx;
      return Object.assign({}, b, { sci: false, sciU: true, unsupported: unsupported, ltb: ltb,
        ltbUtil: 99, ltbBasis: 'Mcr could not be computed', C1: 1, c1label: 'n/a',
        LE: a.L, utils: [{ name: 'LTB', val: 99 }], gov: { name: 'LTB', val: 99 }, pass: false,
        annex: null, buck: null });
    }
    if (!sol.mcrConverged) {
      unsupported.push('Elastic critical moment: the eigensolver did not reach convergence tolerance at one or both mesh levels. ' +
        'M<sub>cr</sub> is not reliable for design and PASS is blocked. Verify M<sub>cr</sub> independently.');
    }
    if (sol.meshError > MESH_BLOCK) {
      unsupported.push('Elastic critical moment: mesh convergence error is ' + (sol.meshError * 100).toFixed(2) +
        ' %, above the ' + (MESH_BLOCK * 100).toFixed(1) + ' % limit this tool will certify. PASS is blocked.');
    } else if (sol.meshError > MESH_WARN) {
      warn.push('Mesh convergence error ' + (sol.meshError * 100).toFixed(2) + ' % (below the blocking limit, but worth noting).');
    }

    if (Math.abs(sol.zg || 0) > 1e-9 && S.destab) warn.push('The destabilising x1.2 switch is ignored on the EC3 path: load height is carried exactly by per-load zg. Untick it to avoid confusion.');
    if (Math.abs(S.leFactor - 1) > 1e-9) warn.push('The LE factor no longer affects EC3 LTB; buckling length is set by the restraint positions. It still drives the strut check when axial compression is present.');

    var Mcr = sol.Mcr / 1e6;                     // kN.m
    var lamLT = Math.sqrt(Wy * fy / sol.Mcr);
    var curve = ltbCurve(sec);

    /* kc = 1/sqrt(C1), NA 2.18. C1 is SHAPE-ONLY (zg = zj = 0): load height
       and monosymmetry are already inside Mcr, and folding them into kc
       would double-count them. Not applied to cantilevers (no published kc). */
    var C1 = sol.C1;
    var c1label = 'back-calculated from the eigen solution: M<sub>cr</sub>(z<sub>g</sub>=0,z<sub>j</sub>=0)/M<sub>cr</sub>(uniform moment, same restraints)';
    var c1Trusted = sol.c1Converged;
    if (S.C1o != null) {
      c1label = 'user override for k<sub>c</sub> (eigen value was ' + C1.toFixed(3) + ')';
      C1 = S.C1o;
      c1Trusted = true;
    }
    var kc = 1.0;
    if (c1Trusted) kc = Math.min(1 / Math.sqrt(Math.max(C1, 1e-6)), 1.0);
    else warn.push('The reference solves used to back-calculate C<sub>1</sub> did not converge; k<sub>c</sub> = 1.0 has been used, which is the conservative value (f = 1.0, hence the lower M<sub>b,Rd</sub>). M<sub>cr</sub> itself is unaffected.');

    var Phi = null, chi = 1, f = 1, chiMod = 1, ign = true;
    if (lamLT > 0.4) {
      Phi = 0.5 * (1 + curve.alphaLT * (lamLT - 0.4) + 0.75 * lamLT * lamLT);
      chi = Math.min(1 / (Phi + Math.sqrt(Math.max(Phi * Phi - 0.75 * lamLT * lamLT, 1e-12))), 1, 1 / (lamLT * lamLT));
      f = isCant ? 1 : Math.min(1 - 0.5 * (1 - kc) * (1 - 2 * Math.pow(lamLT - 0.8, 2)), 1);
      chiMod = Math.min(chi / f, 1, 1 / (lamLT * lamLT));
      ign = false;
    }
    var MbRd = Math.min(chiMod * Wy * fy / gM1 / 1e6, b.McRd);

    /* Channel + eccentric load: the eigen Mcr is the LTB half of the story.
       The primary torque from e0 must be carried by the EN 1993-6 Annex A
       interaction. If that check cannot run, do not allow a PASS. */
    var chanTorsionGap = false;
    if (sec.kind === 'channel' && a.tors && a.tors.on && !(b.tor && b.tor.p385)) {
      chanTorsionGap = true;
      unsupported.push('Channel with eccentric load: the LTB check is valid (z<sub>j</sub> = 0, I<sub>w</sub> about the shear centre), ' +
        'but the primary torque from e<sub>0</sub> must be combined with it through the EN 1993-6 Annex A interaction, ' +
        'which is not available for this support/load arrangement (it needs a fork-fork single span with full-span or point torques). PASS is blocked.');
    }

    ltb = { eigen: true, na: false, cant: isCant, channel: sec.kind === 'channel', box: !!sec.isBox,
            Mcr: Mcr, McrRev: sol.McrRev / 1e6, McrUniform: sol.McrUniform / 1e6, McrShape: sol.McrShape / 1e6,
            C1: C1, c1label: c1label, kc: kc, lamLT: lamLT, lamLTmcr: lamLT,
            curve: curve, Phi: Phi, chi: chi, f: f, chiMod: chiMod, ign: ign, ignM: ign,
            chiM: chi, chiModM: chiMod, fM: f, PhiM: Phi,           // aliases: Annex A block reads chiM
             MbRd: MbRd, MbMcr: MbRd, MbSimp: MbRd, McrBack: Mcr,    // aliases: Annex A reads Mcr / McrBack
             zg: sol.zg, zj: sol.zj, nElem: sol.nElem, meshError: sol.meshError,
             zgValues: sol.zgValues, zgUniform: sol.zgUniform,
             c1Trusted: c1Trusted, mcrConverged: sol.mcrConverged,
             mode: sol.mode, warn: warn, chanTorsionGap: chanTorsionGap,
             Iz: sol.sp.Iz, It: sol.sp.It, Iw: sol.sp.Iw, hs: sol.sp.hs };

    var Mx = b.Mx;
    var ltbUtil = ltb.MbRd > 0 ? Mx / ltb.MbRd : 99;
    var ltbBasis = 'elastic critical moment from the finite-element eigenvalue solution ' +
      '(4 DOF/node: v, v\', &phi;, &phi;\'; z<sub>g</sub> and z<sub>j</sub> included; ' + ltb.nElem + ' elements, Richardson-extrapolated)';

    /* ---- EN 1993-6 Annex A: LTB + minor-axis bending + torsion ---- */
    var annex = null;
    if (b.tor && b.tor.p385) {
      var chiA = ign ? 1 : chi;                      // chi_LT without the f-factor (P385 basis)
      var MbA = chiA * Wy * fy / gM1 / 1e6;
      var McrA = Mcr;
      /* Cmz is an equivalent-uniform-moment factor for the minor-axis moment
         diagram (EN 1993-1-1 Annex B, Table B.3). C1 describes the major-axis
         diagram's effect on Mcr. Different quantities, different diagrams.

         The old lookup only worked because the retired sn003aC1() returned C1
         from a discrete table, where 1.348 meant "SS + central point load" and
         1.127 meant "SS + UDL". It was a proxy for the load case, not for C1.
         C1 is now a continuous eigenvalue ratio that also absorbs intermediate
         restraints and multi-span shape, so hitting a +/-0.02 window is
         coincidental and can reduce the minor-axis demand spuriously.

         1.0 is conservative: the term enters additively as +Cmz*Mz/MzR.
         Proper derivation = Table B.3 applied to the Mz(x)=phi(x)*My(x)
         diagram in b.tor.grids. NOTE this is not cmTableB3(), which reads the
         major-axis diagram a.governM.fb and returns Cmy. Not implemented. */
      var Cmz = (S.Cmzo != null && isFinite(S.Cmzo)) ? +S.Cmzo : 1.0;
      var MyMax = 0; b.tor.grids.forEach(function (g2) { g2.rows.forEach(function (r2) { MyMax = Math.max(MyMax, r2.My); }); });
      var MzR = b.tor.cls12 ? b.tor.Mplz : b.tor.Melz;
      var MfR = b.tor.cls12 ? b.tor.Mplf : b.tor.Melf;
      if (MyMax >= McrA * 0.999) {
        unsupported.push('M_y,Ed reaches the elastic critical moment M_cr: the Annex A amplifier k_alpha is unbounded; the member is inadequate as arranged.');
        annex = { u: 99, kAlpha: Infinity, Cmz: Cmz, MbA: MbA, McrA: McrA, MzR: MzR, MfR: MfR };
      } else {
        var kAlpha = 1 / (1 - MyMax / McrA), worst = { u: -1 };
        b.tor.grids.forEach(function (g2) {
          g2.rows.forEach(function (r2) {
            var kw = Math.max(0.7 - 0.2 * r2.Mw / MfR, 0), kzw = Math.max(1 - r2.Mz / MzR, 0);
            var u = r2.My / MbA + Cmz * r2.Mz / MzR + kw * kzw * kAlpha * r2.Mw / MfR;
            if (u > worst.u) worst = { u: u, x: r2.x, My: r2.My, Mz: r2.Mz, Mw: r2.Mw, kw: kw, kzw: kzw, combo: g2.combo.label };
          });
        });
        annex = Object.assign({}, worst, { kAlpha: kAlpha, Cmz: Cmz, MbA: MbA, McrA: McrA, MzR: MzR, MfR: MfR });
      }
    }

    var useB1u = sec.isBox || (ltb.MbRd >= b.McRd * 0.9999);
    var buck = (b.ax && !b.ax.tension) ? annexB2(a, sec, fy, b.cl, ltb.MbRd > 0 ? ltb.MbRd : b.McRd, useB1u, isCant) : null;

    var utils = [
      { name: 'Shear  V_Ed/V_c,Rd', val: b.shearUtil },
      { name: 'Bending  M_Ed/M_c,Rd', val: b.momUtil },
      { name: 'LTB  M_Ed/M_b,Rd', val: ltbUtil },
      { name: 'Deflection', val: b.dmax / b.dlimit }
    ];
    if (b.ax) {
      utils.push({ name: b.ax.tension ? 'Tension  N_Ed/N_t,Rd' : 'Compression  N_Ed/N_pl,Rd', val: b.ax.nUtil });
      utils.push({ name: 'Bending+axial cross-section (6.2.9)', val: b.ax.mUtil });
      if (!b.ax.tension && buck) {
        utils.push({ name: 'Member buckling y-y (Eq 6.61)', val: buck.u1 });
        utils.push({ name: 'Member buckling z-z (Eq 6.62)', val: buck.u2 });
      }
    }
    if (annex) utils.push({ name: 'LTB+torsion (EN 1993-6 Annex A)', val: annex.u });
    if (b.coex) utils.push({ name: b.coex.pureShearFail ? 'Pure shear failure at M-V check point (6.2.6)' : 'Bending+shear coexistent (6.2.8)', val: b.coex.u });
    if (b.tor && b.tor.box) {
      utils.push({ name: 'Torsion  T_Ed/T_Rd', val: b.tor.torUtil });
      utils.push({ name: 'Shear+torsion  V_Ed/V_pl,T,Rd', val: b.tor.vtUtil });
    }
    if (b.tor && b.tor.p385) {
      utils.push({ name: 'Bending+torsion cross-section (P385 3.1.2)', val: b.tor.cross.u });
      utils.push({ name: 'Shear+torsion  V_Ed/V_pl,T,Rd', val: b.tor.vtUtil });
    }
    var gov = utils[0]; utils.forEach(function (u) { if (u.val > gov.val) gov = u; });
    var pass = unsupported.length === 0 && utils.every(function (u) { return u.val <= 1.0001; });

    return Object.assign({}, b, { sci: false, sciU: true, unsupported: unsupported, ltb: ltb,
      ltbUtil: ltbUtil, ltbBasis: ltbBasis, C1: C1, c1label: c1label, LE: a.L,
      utils: utils, gov: gov, pass: pass, annex: annex, buck: buck });
  };

  /* ================================================================
     PART 5 - report block
     Replaces the `sciUltbBlocks` template in render().
     Pure ASCII + HTML entities, so it survives the file's cp1252 encoding.
     ================================================================ */
  window.ltbEigenReport = function (c, a, sec) {
    var LT = c.ltb || {};
    if (LT.na && LT.closed) return '<div class="section-title smallgap">Lateral&ndash;Torsional Buckling (Cl. 6.3.2.1(2))</div>' +
      '<div class="calc-block">' +
      '<div>Closed hollow section</div><div class="formula">' + (S.family === 'rhs' ? 'RHS' : 'SHS') + ' / closed box section &mdash; not susceptible to lateral-torsional buckling</div><div class="value">LTB not required</div><div class="status ok">Not required</div>' +
      '<div>M<sub>b,Rd</sub> = M<sub>c,Rd</sub></div><div class="formula">Full cross-section bending resistance used directly; adequacy is governed by the Clause 6.2 moment check above</div><div class="value">' + f1(LT.MbRd, 1) + ' kN&middot;m</div><div></div>' +
      '</div>';
    if (!LT.eigen) return '';
    if (LT.failed) return '<div class="section-title smallgap">Lateral&ndash;Torsional Buckling</div>' +
      '<div class="calc-block"><div>M<sub>cr</sub></div><div class="formula">' + LT.err +
      '</div><div class="value">&mdash;</div><div class="status fail">BLOCKED</div></div>';

    var Wy = c.cl.cls <= 2 ? sec.Sx : sec.Zx;
    var restr = (S.ltbRestraints || []).length;
    var rows = '';
    rows += '<div>Buckling model</div><div class="formula">FE eigenvalue solution of (K<sub>e</sub> + &lambda;K<sub>g</sub>)d = 0 over the governing BMD; ' +
            'Hermite cubics, 4 DOF/node (v, v&prime;, &phi;, &phi;&prime;); ' + LT.nElem + ' elements, Richardson-extrapolated</div>' +
            '<div class="value">mesh err &lt; ' + g(Math.max(LT.meshError || 0, 1e-6) * 100, 3) + ' %</div><div></div>';
    rows += '<div>Section properties</div><div class="formula">I<sub>z</sub> = ' + g(LT.Iz / 1e4, 0) + ' cm<sup>4</sup>; I<sub>T</sub> = ' + g(LT.It / 1e4, 1) +
            ' cm<sup>4</sup>; I<sub>w</sub> = ' + g(LT.Iw / 1e12, 4) + ' dm<sup>6</sup>' + (LT.channel ? ' (about the shear centre)' : '') +
            '; G = 81000 N/mm&sup2;</div><div class="value">z<sub>j</sub> = ' + g(LT.zj, 1) + ' mm</div><div></div>';
    rows += '<div>Lateral restraints</div><div class="formula">' + S.supports.length + ' support(s) taken as fork restraints (v = &phi; = 0)' +
            (restr ? '; ' + restr + ' intermediate restraint(s)' : '') +
            (LT.cant ? '; cantilever root warping ' + (S.rootWarp === 'restrained' ? 'restrained' : 'free') : '') +
            '</div><div class="value">&mdash;</div><div></div>';
    var zref = (typeof loadHeightReference === 'function') ? loadHeightReference(sec) : null;
    var zrefText = zref ? '; refs: top +' + g(zref.topSurface, 0) + ' mm, bottom ' + g(zref.bottomSurface, 0) + ' mm' : '';
    var zfmt = function(z){ return (z>0?'+':'') + g(z,0); };
    var zgText = (LT.zgValues && LT.zgValues.length > 1)
      ? 'per-load z<sub>g</sub> = ' + LT.zgValues.map(zfmt).join(', ') + ' mm above the shear centre'
      : 'z<sub>g</sub> = ' + zfmt(LT.zg || 0) + ' mm above the shear centre';
    rows += '<div>Load height</div><div class="formula">' + zgText + zrefText +
            (LT.zg > 0 ? ' (max value destabilising)' : LT.zg < 0 ? ' (max value stabilising)' : '') + '</div><div class="value">M<sub>cr</sub> (load reversed) = ' + f1(LT.McrRev, 1) + ' kN&middot;m</div><div></div>';
    rows += '<div><b>M<sub>cr</sub></b></div><div class="formula">eigenvalue &times; max|M(x)| &mdash; no C<sub>1</sub>, C<sub>2</sub> or C<sub>3</sub> used</div>' +
            '<div class="value"><b>' + f1(LT.Mcr, 1) + ' kN&middot;m</b></div><div></div>';
    rows += '<div>&lambda;&#772;<sub>LT</sub> = &radic;(W<sub>y</sub>f<sub>y</sub>/M<sub>cr</sub>)</div><div class="formula">&radic;(' + g(Wy, 0) + '&times;10&sup3;&times;' + g(a.py, 0) + '/' + f1(LT.Mcr, 1) + '&times;10<sup>6</sup>)</div><div class="value">' + f1(LT.lamLT, 3) + '</div><div></div>';
    rows += '<div>Buckling curve</div><div class="formula">' + (sec.isBox ? 'closed section, not listed in NA Table 6.3' : sec.kind === 'channel' ? 'not doubly symmetric' : 'NA Table 6.3, h/b = ' + g(sec.D / sec.B, 2)) +
            '</div><div class="value">curve ' + LT.curve.curve + ' (&alpha;<sub>LT</sub> = ' + g(LT.curve.alphaLT, 2) + ')</div><div></div>';
    if (LT.ign) {
      rows += '<div>&lambda;&#772;<sub>LT</sub> &le; 0.4 (NA 2.17)</div><div class="formula">LTB effects may be ignored (cl 6.3.2.2(4))</div><div class="value">&chi;<sub>LT,mod</sub> = 1.000</div><div class="status ok">Ignored</div>';
    } else {
      rows += '<div>&Phi;<sub>LT</sub>; &chi;<sub>LT</sub></div><div class="formula">&lambda;&#772;<sub>LT,0</sub> = 0.4, &beta; = 0.75 (NA 2.17); &Phi; = ' + g(LT.Phi, 3) + '</div><div class="value">&chi;<sub>LT</sub> = ' + g(LT.chi, 3) + '</div><div></div>';
      rows += '<div>C<sub>1</sub> (for k<sub>c</sub> only)</div><div class="formula">' + LT.c1label + '</div><div class="value">C<sub>1</sub> = ' + g(LT.C1, 3) + '</div><div></div>';
      if (LT.cant) rows += '<div>k<sub>c</sub> / f</div><div class="formula">not applied to cantilevers (no published k<sub>c</sub>)</div><div class="value">f = 1.000</div><div></div>';
      else rows += '<div>k<sub>c</sub> = 1/&radic;C<sub>1</sub>; f = 1&minus;0.5(1&minus;k<sub>c</sub>)[1&minus;2(&lambda;&#772;<sub>LT</sub>&minus;0.8)&sup2;] &le; 1</div><div class="formula">k<sub>c</sub> = ' + g(LT.kc, 3) + ' (NA 2.18)</div><div class="value">f = ' + g(LT.f, 3) + '</div><div></div>';
      rows += '<div>&chi;<sub>LT,mod</sub> = &chi;<sub>LT</sub>/f &le; min(1, 1/&lambda;&#772;&sup2;)</div><div class="formula">' + g(LT.chi, 3) + '/' + g(LT.f, 3) + '</div><div class="value">' + g(LT.chiMod, 3) + '</div><div></div>';
    }
    rows += '<div>M<sub>b,Rd</sub> = &chi;<sub>LT,mod</sub>W<sub>' + (c.cl.cls <= 2 ? 'pl' : 'el') + ',y</sub>f<sub>y</sub>/&gamma;<sub>M1</sub> &le; M<sub>c,Rd</sub></div>' +
            '<div class="formula">' + g(LT.ign ? 1 : LT.chiMod, 3) + '&times;' + g(Wy, 0) + '&times;' + g(a.py, 0) + '/1.0</div><div class="value">' + f1(LT.MbRd, 1) + ' kN&middot;m</div><div></div>';
    rows += '<div>M<sub>Ed</sub> / M<sub>b,Rd</sub></div><div class="formula">' + f1(c.Mx, 1) + ' / ' + f1(LT.MbRd, 1) + '</div><div class="value">' + g(c.Mx / Math.max(LT.MbRd, 1e-9), 2) + '</div>' + st(c.ltbUtil <= 1, 'OK', 'exceeded');

    var warnHtml = (LT.warn && LT.warn.length) ? '<div class="note" style="margin-left:0">' + LT.warn.map(function (w) { return '&bull; ' + w; }).join('<br>') + '</div>' : '';

    return '<div class="section-title smallgap">Lateral&ndash;Torsional Buckling &mdash; Elastic Critical Moment (FE eigenvalue solution)</div>' +
           '<div class="calc-block">' + rows + '</div>' + warnHtml;
  };

  /* ================================================================
     PART 6 - intermediate lateral restraint UI
     ================================================================ */
  if (S.ltbRestraints == null) S.ltbRestraints = [];
  if (S.fixedLateral == null) S.fixedLateral = true;
  if (S.zj == null) S.zj = 0;
  if (S.Cmzo === undefined) S.Cmzo = null;   // verified Cmz override; null = conservative 1.0

  function injectUI() {
    var host = document.getElementById('restraintRow');
    if (!host || document.getElementById('ltbRestraintPanel')) return;
    var div = document.createElement('div');
    div.id = 'ltbRestraintPanel';
    div.innerHTML =
      '<div class="list" id="ltbRestraintList"></div>' +
      '<div class="addbar"><button type="button" id="addLtbRestraint">+ Add lateral restraint</button></div>' +
      '<label class="checkline ltb-fixed"><input type="checkbox" id="fixedLateral"> <span>Fixed supports restrain lateral bending (v&prime; = 0)</span></label>' +
      '<div class="hint">Every vertical support is taken as a fork restraint: lateral displacement and twist prevented, ' +
      'warping and lateral bending free. Add intermediate restraints where purlins, ties or secondary beams hold the member. ' +
      'The buckling length follows from these positions &mdash; the L<sub>E</sub> factor and the destabilising &times;1.2 switch ' +
      'no longer affect EC3 LTB (they still drive the strut check). A cantilever needs lateral-bending restraint at its root, ' +
      'or the lateral stiffness matrix is singular.</div>';
    host.parentNode.insertBefore(div, host.nextSibling);
    document.getElementById('addLtbRestraint').addEventListener('click', function () {
      S.ltbRestraints.push({ pos: (S.L / 2).toFixed(3), v: true, phi: true, vp: false, phip: false });
      renderLtbRestraintList(); recompute();
    });
    document.getElementById('fixedLateral').addEventListener('change', function (e) {
      S.fixedLateral = e.target.checked; recompute();
    });
  }

  function renderLtbRestraintList() {
    var el = document.getElementById('ltbRestraintList');
    if (!el) return;
    var fl = document.getElementById('fixedLateral');
    if (fl) fl.checked = !!S.fixedLateral;
    el.innerHTML = (S.ltbRestraints || []).map(function (r, i) {
      return '<div class="row"><div class="rowhead">' +
        '<label style="flex:1">x, m <input type="number" step="0.01" data-i="' + i + '" data-k="pos" value="' + r.pos + '"></label>' +
        '<button type="button" class="del" data-del="' + i + '">Remove</button></div>' +
        '<div class="ltb-checks">' +
        chk(i, 'v', 'lateral v', r.v !== false) + chk(i, 'phi', 'twist &phi;', r.phi !== false) +
        chk(i, 'vp', 'lat. bending v&prime;', !!r.vp) + chk(i, 'phip', 'warping &phi;&prime;', !!r.phip) +
        '</div></div>';
    }).join('');
    function chk(i, k, lbl, on) {
      return '<label class="checkline"><input type="checkbox" data-i="' + i + '" data-k="' + k + '"' + (on ? ' checked' : '') + '> <span>' + lbl + '</span></label>';
    }
    el.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var i = +inp.dataset.i, k = inp.dataset.k;
        S.ltbRestraints[i][k] = inp.type === 'checkbox' ? inp.checked : inp.value;
        recompute();
      });
    });
    el.querySelectorAll('button[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        S.ltbRestraints.splice(+btn.dataset.del, 1); renderLtbRestraintList(); recompute();
      });
    });
  }
  window.renderLtbRestraintList = renderLtbRestraintList;

  /* keep the panel in step with syncInputs(), and hide it when LTB is off */
  var _sync = window.syncInputs;
  window.syncInputs = function () {
    _sync.apply(this, arguments);
    injectUI(); renderLtbRestraintList();
    var show = (S.code === 'EC3' && (S.restraint || 'full') !== 'full');
    var p = document.getElementById('ltbRestraintPanel');
    if (p) p.style.display = show ? '' : 'none';
    var c1h = document.getElementById('c1Hint');
    if (c1h) c1h.innerHTML = 'M<sub>cr</sub> is solved directly by the FE eigensolver &mdash; C<sub>1</sub> is not an input. ' +
      'It is back-calculated purely to form k<sub>c</sub> = 1/&radic;C<sub>1</sub> (NA 2.18). Override only to force k<sub>c</sub>; ' +
      'the eigen value is printed alongside.';
  };

  /* validate restraint positions */
  var _validate = window.validateInputs;
  window.validateInputs = function (py, E, uls, sls) {
    _validate.apply(this, arguments);
    (S.ltbRestraints || []).forEach(function (r, i) {
      var x = +r.pos;
      if (!isFinite(x) || x < 0 || x > S.L) throw 'Lateral restraint ' + (i + 1) + ' at x = ' + r.pos + ' m lies outside the span (0 to ' + S.L + ' m).';
    });
    if (S.Cmzo != null && !(isFinite(S.Cmzo) && S.Cmzo > 0)) throw 'C_mz override must be a positive number.';
  };

  assertSaggingPositive();
  if (typeof syncInputs === 'function') { try { injectUI(); renderLtbRestraintList(); } catch (e) {} }

  window.LTB_EIGEN = { mcrEigen: mcrEigen, solveLTB: solveLTB, momentFromSamples: momentFromSamples,
                       assertSaggingPositive: assertSaggingPositive };
})();
