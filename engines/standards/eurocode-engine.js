(function () {
  "use strict";

  var MCR_ENGINE = globalThis.RACK_EUROCODE_MCR_ENGINE;
  if (!MCR_ENGINE) throw new Error("Eurocode Mcr engine must load before the member engine.");

  var E_EC3 = MCR_ENGINE.E;
  var G_EC3 = MCR_ENGINE.G;
  var EC3_ALPHA = { a0: 0.13, a: 0.21, b: 0.34, c: 0.49, d: 0.76 };

  function ratio(numerator, denominator) {
    if (denominator > 0) return numerator / denominator;
    return numerator > 0 ? Infinity : 0;
  }

  function chiEC3(lamBar, curve) {
    if (lamBar <= 0.2) return 1;
    var alpha = EC3_ALPHA[curve];
    var phi = 0.5 * (1 + alpha * (lamBar - 0.2) + lamBar * lamBar);
    return Math.min(1, 1 / (phi + Math.sqrt(Math.max(phi * phi - lamBar * lamBar, 0))));
  }

  function chiLT_EC3(lamLT, curve) {
    var lam0 = 0.4;
    var beta = 0.75;
    if (lamLT <= lam0) return { chi: 1, phi: 0.5 };
    var alpha = EC3_ALPHA[curve];
    var phi = 0.5 * (1 + alpha * (lamLT - lam0) + beta * lamLT * lamLT);
    var chi = 1 / (phi + Math.sqrt(Math.max(phi * phi - beta * lamLT * lamLT, 0)));
    return { chi: Math.min(chi, 1, 1 / (lamLT * lamLT)), phi: phi };
  }

  function fyEC3(grade, thickness) {
    var tables = {
      S235: [[16, 235], [40, 225], [63, 215], [80, 215], [100, 215], [150, 195], [200, 185], [250, 175]],
      S275: [[16, 275], [40, 265], [63, 255], [80, 245], [100, 235], [150, 225], [200, 215], [250, 205]],
      S355: [[16, 355], [40, 345], [63, 335], [80, 325], [100, 315], [150, 295], [200, 285], [250, 275]]
    };
    var table = tables[grade];
    thickness = Number(thickness);
    if (!table || !(thickness > 0)) return null;
    for (var i = 0; i < table.length; i++) if (thickness <= table[i][0]) return table[i][1];
    return null;
  }

  function ec3StrutCurves(family, h, b, tf) {
    if (family === "box-hf") return { y: "a", z: "a" };
    if (family === "box-cf") return { y: "c", z: "c" };
    if (family === "channel") return { y: "c", z: "c" };
    var hb = h / b;
    if (hb > 1.2) {
      if (tf <= 40) return { y: "a", z: "b" };
      if (tf <= 100) return { y: "b", z: "c" };
      return { y: "d", z: "d" };
    }
    return tf <= 100 ? { y: "b", z: "c" } : { y: "d", z: "d" };
  }

  function ec3LTBCurve(family, h, b) {
    if (family === "channel") return "d";
    var hb = h / b;
    return hb <= 2 ? "b" : (hb <= 3.1 ? "c" : "d");
  }

  function ec3LTBCurveGeneral(family, h, b) {
    if (family === "channel" || family === "box-hf" || family === "box-cf") return "d";
    return h / b <= 2 ? "a" : "b";
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function cleanBracePoints(points, height) {
    var cleaned = [0, height];
    (points || []).forEach(function (point) {
      point = Number(point);
      if (Number.isFinite(point) && point > 0 && point < height) cleaned.push(point);
    });
    cleaned.sort(function (a, b) { return a - b; });
    return cleaned.filter(function (point, index) {
      return index === 0 || Math.abs(point - cleaned[index - 1]) > 1e-6;
    });
  }

  function momentAt(segments, y, toward) {
    var tolerance = 1e-6;
    var i;
    if (toward === "right") {
      for (i = 0; i < segments.length; i++) if (Math.abs(segments[i].y1 - y) <= tolerance) return segments[i].M1;
    } else {
      for (i = segments.length - 1; i >= 0; i--) if (Math.abs(segments[i].y2 - y) <= tolerance) return segments[i].M2;
    }
    for (i = 0; i < segments.length; i++) {
      var segment = segments[i];
      if (y >= segment.y1 - tolerance && y <= segment.y2 + tolerance) {
        var length = segment.y2 - segment.y1;
        var fraction = length > 0 ? (y - segment.y1) / length : 0;
        return segment.M1 + fraction * (segment.M2 - segment.M1);
      }
    }
    return 0;
  }

  function cmForInterval(segments, start, end) {
    var mStart = momentAt(segments, start, "right");
    var mEnd = momentAt(segments, end, "left");
    var interior = [];
    var tolerance = 1e-6;
    segments.forEach(function (segment) {
      if (segment.y1 > start + tolerance && segment.y1 < end - tolerance) interior.push({ y: segment.y1, M: segment.M1 });
      if (segment.y2 > start + tolerance && segment.y2 < end - tolerance) interior.push({ y: segment.y2, M: segment.M2 });
    });
    var scale = Math.max(Math.abs(mStart), Math.abs(mEnd), 1);
    interior.forEach(function (point) { scale = Math.max(scale, Math.abs(point.M)); });
    var nonlinear = interior.some(function (point) {
      var linear = mStart + (mEnd - mStart) * (point.y - start) / Math.max(end - start, 1e-9);
      return Math.abs(point.M - linear) > 1e-7 * scale;
    });

    var largerAtStart = Math.abs(mStart) >= Math.abs(mEnd);
    var mhRaw = largerAtStart ? mStart : mEnd;
    var otherRaw = largerAtStart ? mEnd : mStart;
    var mhSign = mhRaw < 0 ? -1 : 1;
    var mh = Math.abs(mhRaw);
    var other = otherRaw * mhSign;
    var psi = mh > 1e-12 ? clamp(other / mh, -1, 1) : 0;

    if (!nonlinear) {
      var linearValue = Math.max(0.6 + 0.4 * psi, 0.4);
      return {
        value: clamp(linearValue, 0.4, 1),
        start: start,
        end: end,
        caseLabel: "linear end moments",
        equation: "max(0.6 + 0.4 psi, 0.4)",
        Mh: mhRaw,
        Ms: null,
        psi: psi,
        alphaName: null,
        alpha: null
      };
    }

    var midPoint = (start + end) / 2;
    var midLeft = momentAt(segments, midPoint, "left");
    var midRight = momentAt(segments, midPoint, "right");
    var midJump = Math.abs(midLeft - midRight) > 1e-7 * scale;
    var msRaw = Math.abs(midLeft) >= Math.abs(midRight) ? midLeft : midRight;
    if (Math.abs(msRaw) <= mh + 1e-9) {
      var alphaS = mh > 1e-12 ? clamp(msRaw * mhSign / mh, -1, 1) : 0;
      var endGoverned;
      var endEquation;
      if (alphaS >= 0) {
        endGoverned = Math.max(0.2 + 0.8 * alphaS, 0.4);
        endEquation = "max(0.2 + 0.8 alpha_s, 0.4)";
      } else if (psi >= 0) {
        endGoverned = Math.max(-0.8 * alphaS, 0.4);
        endEquation = "max(-0.8 alpha_s, 0.4)";
      } else {
        endGoverned = Math.max(0.2 * (-psi) - 0.8 * alphaS, 0.4);
        endEquation = "max(0.2(-psi) - 0.8 alpha_s, 0.4)";
      }
      return {
        value: clamp(endGoverned, 0.4, 1),
        start: start,
        end: end,
        caseLabel: "end moment governs; concentrated rack loads",
        equation: endEquation,
        Mh: mhRaw,
        Ms: msRaw,
        MsAt: midPoint,
        midJump: midJump,
        psi: psi,
        alphaName: "alpha_s",
        alpha: alphaS
      };
    }

    var msSign = msRaw < 0 ? -1 : 1;
    var mhForPeak = mhRaw * msSign;
    var otherForPeak = otherRaw * msSign;
    var alphaH = clamp(mhForPeak / Math.abs(msRaw), -1, 1);
    var peakPsi = Math.abs(mhForPeak) > 1e-12 ? clamp(otherForPeak / mhForPeak, -1, 1) : 0;
    var interiorGoverned = peakPsi >= 0
      ? 0.9 + 0.1 * alphaH
      : 0.9 + 0.1 * alphaH * (1 + 2 * peakPsi);
    return {
      value: clamp(interiorGoverned, 0.4, 1),
      start: start,
      end: end,
      caseLabel: "interior moment governs; concentrated rack loads",
      equation: peakPsi >= 0 ? "0.90 + 0.10 alpha_h" : "0.90 + 0.10 alpha_h(1 + 2 psi)",
      Mh: mhRaw,
      Ms: msRaw,
      MsAt: midPoint,
      midJump: midJump,
      psi: peakPsi,
      alphaName: "alpha_h",
      alpha: alphaH
    };
  }

  function equivalentMomentFactor(momentSegments, bracePoints, height) {
    var segments = (momentSegments || []).filter(function (segment) {
      return Number.isFinite(segment.y1) && Number.isFinite(segment.y2) &&
        Number.isFinite(segment.M1) && Number.isFinite(segment.M2) && segment.y2 > segment.y1;
    }).slice().sort(function (a, b) { return a.y1 - b.y1; });
    if (!segments.length || !(height > 0)) {
      return { value: 1, caseLabel: "moment diagram unavailable", unavailable: true };
    }
    var maximumMoment = segments.reduce(function (maximum, segment) {
      return Math.max(maximum, Math.abs(segment.M1), Math.abs(segment.M2));
    }, 0);
    if (maximumMoment <= 1e-9) return { value: 1, caseLabel: "no moment in this bending plane", noMoment: true };

    var points = cleanBracePoints(bracePoints, height);
    var governing = null;
    for (var i = 0; i < points.length - 1; i++) {
      var result = cmForInterval(segments, points[i], points[i + 1]);
      if (!governing || result.value > governing.value + 1e-12) governing = result;
    }
    governing.intervalCount = points.length - 1;
    return governing;
  }

  function channelShearCentreY0(h, b, tw, tf) {
    var bp = b - tw / 2;
    var hp = h - tf;
    var e = 3 * tf * bp * bp / (6 * bp * tf + hp * tw);
    var Af = 2 * (b - tw) * tf;
    var Aw = h * tw;
    var xbar = (Aw * tw / 2 + Af * (tw + (b - tw) / 2)) / (Af + Aw);
    return e + (xbar - tw / 2);
  }

  function channelIw(h, b, tw, tf) {
    var bp = b - tw / 2;
    var hp = h - tf;
    return (Math.pow(bp, 3) * hp * hp * tf / 12) * (2 * hp * tw + 3 * bp * tf) / (hp * tw + 6 * bp * tf);
  }

  function classifyEC3(sec, fy, F_N, MyEd, MzEd, axis) {
    var eps = Math.sqrt(235 / fy);
    var names = ["Class 1", "Class 2", "Class 3", "Class 4"];
    function grade(value, limits) {
      for (var i = 0; i < limits.length; i++) if (value <= limits[i]) return i;
      return 3;
    }

    var flangeClass;
    var webClass;
    var flangeRatio;
    var webRatio;
    var alpha = null;
    var psi = null;
    var basis = "Conservative Table 5.2 uniform-compression envelope";
    var combinedMajor = axis !== "minor" && MyEd > 1e-6;

    function webLimits(c, tw, webAreaFactor) {
      if (!combinedMajor) return [33 * eps, 38 * eps, 42 * eps];
      alpha = Math.min(1, 0.5 + F_N / (webAreaFactor * c * tw * fy));
      psi = Math.min(Math.max(2 * F_N / (sec.A_cm2 * 100 * fy) - 1, -3), 1);
      var class1 = alpha > 0.5 ? 396 * eps / (13 * alpha - 1) : 36 * eps / Math.max(alpha, 1e-9);
      var class2 = alpha > 0.5 ? 456 * eps / (13 * alpha - 1) : 41.5 * eps / Math.max(alpha, 1e-9);
      var class3 = psi > -1 ? 42 * eps / (0.67 + 0.33 * psi) : 62 * eps * (1 - psi) * Math.sqrt(-psi);
      basis = "Table 5.2 combined compression and major-axis bending (SCI alpha/psi method)";
      return [class1, class2, class3];
    }

    if (sec.family === "box-hf" || sec.family === "box-cf") {
      flangeRatio = (sec.b - 3 * sec.t) / sec.t;
      webRatio = (sec.h - 3 * sec.t) / sec.t;
      flangeClass = grade(flangeRatio, [33 * eps, 38 * eps, 42 * eps]);
      webClass = grade(webRatio, webLimits(sec.h - 3 * sec.t, sec.t, 4));
    } else {
      var r = sec.rFillet || 0;
      var c = sec.family === "channel" ? sec.b - sec.tw - r : (sec.b - sec.tw - 2 * r) / 2;
      var d = sec.d_fillets || (sec.h - 2 * sec.tf);
      flangeRatio = c / sec.tf;
      webRatio = d / sec.tw;
      flangeClass = grade(flangeRatio, [9 * eps, 10 * eps, 14 * eps]);
      webClass = grade(webRatio, webLimits(d, sec.tw, 2));
    }
    var classIndex = Math.max(flangeClass, webClass);
    return {
      cls: names[classIndex],
      classIndex: classIndex,
      slender: classIndex === 3,
      flangeRatio: flangeRatio,
      webRatio: webRatio,
      flangeClass: names[flangeClass],
      webClass: names[webClass],
      alpha: alpha,
      psi: psi,
      basis: basis
    };
  }

  function designColumnEC3(inp) {
    var sec = inp.sec;
    var fy = inp.py;
    if (!(fy > 0)) throw new Error("A valid Eurocode yield strength is required.");

    var axis = inp.axis === "minor" ? "minor" : "major";
    var isBox = sec.family === "box-hf" || sec.family === "box-cf";
    var isChan = sec.family === "channel";
    var A = sec.A_cm2 * 100;
    var Wply = (sec.Wply_cm3 != null ? sec.Wply_cm3 : sec.S_cm3) * 1e3;
    var Wely = (sec.Wely_cm3 != null ? sec.Wely_cm3 : sec.Z_cm3) * 1e3;
    var Wplz = (sec.Wplz_cm3 != null ? sec.Wplz_cm3 : sec.Sz_cm3) * 1e3;
    var Welz = (sec.Welz_cm3 != null ? sec.Welz_cm3 : sec.Zz_cm3) * 1e3;
    var iy = (sec.iy_cm != null ? sec.iy_cm : sec.rx_cm) * 10;
    var iz = (sec.iz_cm != null ? sec.iz_cm : sec.ry_cm) * 10;
    var Iy = (sec.IyPhysical_cm4 != null ? sec.IyPhysical_cm4 : sec.Iy_cm4) * 1e4;
    var Iz = (sec.IzPhysical_cm4 != null ? sec.IzPhysical_cm4 : sec.Iz_cm4) * 1e4;
    var It = (sec.IT_cm4 || 0) * 1e4;
    var Iw = (sec.Iw_dm6 || 0) * 1e12;
    var signedN = Number(inp.F || 0) * 1000;
    var NEd = Math.max(signedN, 0);
    var NtEd = Math.max(-signedN, 0);
    var frameMoment = Math.abs(Number(inp.Mx || 0)) * 1e6;
    var MyEd = axis === "major" ? frameMoment : Math.abs(Number(inp.My || 0)) * 1e6;
    var MzEd = axis === "minor" ? frameMoment : Math.abs(Number(inp.Mz || 0)) * 1e6;
    var VEd = Math.abs(Number(inp.Fv || 0)) * 1000;
    var blocks = [];
    var rows = [];
    var utils = {};
    var issues = [];
    var advisories = [];

    function block(title) {
      var value = { title: title, rows: [] };
      blocks.push(value);
      rows = value.rows;
    }
    function line(label, sub, val, unit, status) {
      rows.push({ label: label, sub: sub || "", val: val == null ? "" : val, unit: unit || "", status: status || "" });
    }
    function addIssue(message) { if (issues.indexOf(message) < 0) issues.push(message); }
    function addAdvisory(message) { if (advisories.indexOf(message) < 0) advisories.push(message); }
    function ok(value) { return value ? "OK" : "Warning"; }
    function f3(value) { return Number.isFinite(value) ? Number(value).toFixed(3) : String(value); }
    function ft(value, digits) {
      if (!Number.isFinite(value)) return String(value);
      return String(Number(Number(value).toFixed(digits == null ? 3 : digits)));
    }

    addAdvisory("Global analysis is first-order 2D by project instruction; P-Delta effects and imperfections are outside this result.");
    addAdvisory("The member check covers one permanent action family and one leading variable action family; wind, accidental, seismic and connection checks require separate cases.");
    if (sec.coldFormed) addIssue("Cold-formed hollow-section design requires EN 1993-1-3 effective properties; EN 1993-1-1 resistance is not verified here.");
    if (NtEd > 1e-6) addIssue("Tension is present: net-section fracture and connection resistance need Anet and fu, which are not available in this model.");
    if (isChan && (MyEd > 1e-6 || MzEd > 1e-6) && !inp.pfcTorsionConfirmed) addIssue("PFC bending requires confirmation that load is introduced through the shear centre or that connection torsion is separately restrained and checked.");
    if (!isBox && sec.IwApprox) addIssue("Open-section stability requires a tabulated warping constant; an approximate Iw is not accepted.");
    if (isChan && sec.y0Approx) addIssue("PFC flexural-torsional buckling requires a tabulated shear-centre offset; an approximate value is not accepted.");

    block("Member Loading and Member Forces");
    line("ULS combination", inp.combo || "EN 1990 combination", "");
    line("Axial force", signedN >= 0 ? "compression" : "tension", ft(Math.abs(signedN) / 1000, 3), "kN");
    line("Major-axis moment My,Ed", axis === "major" ? "from the 2D analysis plane" : "not applied", f3(MyEd / 1e6), "kN.m");
    line("Minor-axis moment Mz,Ed", axis === "minor" ? "from the 2D analysis plane" : "not applied", f3(MzEd / 1e6), "kN.m");
    line("Shear VEd", "", f3(VEd / 1000), "kN");

    var classification = classifyEC3(sec, fy, NEd, MyEd, MzEd, axis);
    var class3 = classification.classIndex === 2;
    var Wy = class3 ? Wely : Wply;
    var Wz = class3 ? Welz : Wplz;
    if (classification.slender) addIssue("Class 4 effective-section properties are not implemented.");

    block("Classification and Material");
    line("Section", sec.label + " [" + inp.grade + ", fy=" + fy + " N/mm2, t=" + ft(sec.tgov, 1) + " mm]", "");
    line("Table 5.2 basis", classification.basis, classification.cls, "", classification.slender ? "UNVERIFIED" : "OK");
    if (classification.alpha != null) line("Web stress parameters", "alpha=" + f3(classification.alpha) + "; psi=" + f3(classification.psi), "SCI P362 / AD 407");
    line("Flange c/t", ft(classification.flangeRatio, 2), classification.flangeClass);
    line("Web c/t", ft(classification.webRatio, 2), classification.webClass);

    var r = sec.rFillet || 0;
    var AvMajor;
    var AvMinor;
    if (isBox) {
      AvMajor = A * sec.h / (sec.h + sec.b);
      AvMinor = A * sec.b / (sec.h + sec.b);
    } else {
      AvMajor = A - 2 * sec.b * sec.tf + (sec.tw + (isChan ? r : 2 * r)) * sec.tf;
      AvMajor = Math.max(AvMajor, (sec.h - 2 * sec.tf) * sec.tw);
      AvMinor = Math.max(A - (sec.h - 2 * sec.tf) * sec.tw, 2 * sec.b * sec.tf);
    }
    var Av = axis === "major" ? AvMajor : AvMinor;
    var Vpl = Av * fy / Math.sqrt(3);
    var shearU = ratio(VEd, Vpl);
    var highShear = VEd > 0.5 * Vpl;
    var rho = highShear ? Math.pow(Math.max(2 * shearU - 1, 0), 2) : 0;
    var shearReduction = Math.max(1 - rho, 0);
    utils.shear = shearU;

    var eps = Math.sqrt(235 / fy);
    var shearPlateRatio = isBox ? (sec.h - 3 * sec.t) / sec.t : (sec.d_fillets || sec.h - 2 * sec.tf) / sec.tw;
    var shearBucklingLimit = 72 * eps / 1.2;
    var shearBucklingRequired = axis === "major" && shearPlateRatio > shearBucklingLimit;
    if (shearBucklingRequired) addIssue("The web exceeds the conservative EN 1993-1-5 shear-buckling screen; a plated-element shear check is required.");

    block("Shear Resistance");
    line("VEd / Vpl,Rd", f3(VEd / 1000) + " / " + f3(Vpl / 1000), f3(shearU), "", ok(shearU <= 1));
    line("High-shear factor rho", highShear ? "rho=(2VEd/Vpl,Rd-1)^2; whole-section moment reduction used conservatively" : "VEd <= 0.5 Vpl,Rd", f3(rho));
    if (axis === "major") line("Shear-buckling screen", ft(shearPlateRatio, 2) + " <= 72 epsilon / 1.2 = " + ft(shearBucklingLimit, 2), shearBucklingRequired ? "Required" : "Not required", "", shearBucklingRequired ? "UNVERIFIED" : "OK");

    var McY0 = Wy * fy;
    var McZ0 = Wz * fy;
    var McY = McY0 * (axis === "major" ? shearReduction : 1);
    var McZ = McZ0 * (axis === "minor" ? shearReduction : 1);
    var Npl = A * fy;
    var n = ratio(NEd, Npl);
    var nt = ratio(NtEd, Npl);
    var MNy = McY;
    var MNz = McZ;
    var localU;

    if (NtEd > 0) {
      localU = nt + ratio(MyEd, McY) + ratio(MzEd, McZ);
    } else if (class3 || isChan) {
      localU = n + ratio(MyEd, McY) + ratio(MzEd, McZ);
    } else if (isBox) {
      var aw = Math.min(Math.max((A - 2 * sec.b * sec.t) / A, 0), 0.5);
      var af = Math.min(Math.max((A - 2 * sec.h * sec.t) / A, 0), 0.5);
      MNy = Math.min(McY, McY * Math.max(1 - n, 0) / Math.max(1 - 0.5 * aw, 0.01));
      MNz = Math.min(McZ, McZ * Math.max(1 - n, 0) / Math.max(1 - 0.5 * af, 0.01));
      localU = ratio(MyEd, MNy) + ratio(MzEd, MNz);
    } else {
      var a = Math.min(Math.max((A - 2 * sec.b * sec.tf) / A, 0), 0.5);
      MNy = Math.min(McY, McY * Math.max(1 - n, 0) / Math.max(1 - 0.5 * a, 0.01));
      if (n > a) MNz = McZ * Math.max(1 - Math.pow((n - a) / Math.max(1 - a, 0.01), 2), 0);
      localU = ratio(MyEd, MNy) + ratio(MzEd, MNz);
    }
    utils.local = localU;

    block("Cross-section Resistance");
    line("Npl,Rd", ft(A / 100, 2) + " cm2 x " + fy + " / gammaM0", f3(Npl / 1000), "kN");
    line("n = Nc,Ed / Npl,Rd", "", f3(n), "", ok(n <= 1));
    if (NtEd > 0) line("Nt,Ed / Npl,Rd (gross yielding)", "Net-section fracture remains outside scope", f3(nt), "", "UNVERIFIED");
    line("Mc,y,Rd", highShear && axis === "major" ? "conservatively reduced by (1-rho)" : (class3 ? "Wel,y fy" : "Wpl,y fy"), f3(McY / 1e6), "kN.m");
    line("Mc,z,Rd", highShear && axis === "minor" ? "conservatively reduced by (1-rho)" : (class3 ? "Wel,z fy" : "Wpl,z fy"), f3(McZ / 1e6), "kN.m");
    line("MN,y,Rd", isChan || class3 ? "conservative linear N-M interaction" : "EN 1993-1-1 6.2.9.1 reduction", f3(MNy / 1e6), "kN.m");
    line("MN,z,Rd", isChan || class3 ? "conservative linear N-M interaction" : "EN 1993-1-1 6.2.9.1 reduction", f3(MNz / 1e6), "kN.m");
    line("Cross-section N-M utilization", "conservative uniaxial/biaxial linear envelope", f3(localU), "", ok(localU <= 1));

    var curves = ec3StrutCurves(sec.family, sec.h, sec.b, sec.tf || 0);
    var KyMajor = Number(inp.KyMajor != null ? inp.KyMajor : inp.Kx);
    var KzMinor = Number(inp.KzMinor != null ? inp.KzMinor : inp.Ky);
    var KT = Number(inp.KT || 2);
    var Ley = KyMajor * inp.H;
    var Lez = KzMinor * inp.H;
    var NcrY = Math.PI * Math.PI * E_EC3 * Iy / (Ley * Ley);
    var NcrZ = Math.PI * Math.PI * E_EC3 * Iz / (Lez * Lez);
    var lamY = Math.sqrt(A * fy / NcrY);
    var lamZ = Math.sqrt(A * fy / NcrZ);
    var chiY = chiEC3(lamY, curves.y);
    var chiZ = chiEC3(lamZ, curves.z);
    var NbY = chiY * A * fy;
    var NbZ = chiZ * A * fy;
    var NbT = null;
    var NcrT = null;
    var NcrTF = null;
    var lamT = null;

    block("Compression Member Resistance");
    line("Lcr,y", "Ky=" + ft(KyMajor, 3) + "; physical y-y properties", f3(Ley / 1000), "m");
    line("lambda-bar y", "sqrt(A fy / Ncr,y), curve " + curves.y, f3(lamY));
    line("Nb,y,Rd", "chi=" + f3(chiY), f3(NbY / 1000), "kN");
    line("Lcr,z", "Kz=" + ft(KzMinor, 3) + "; physical z-z properties", f3(Lez / 1000), "m");
    line("lambda-bar z", "sqrt(A fy / Ncr,z), curve " + curves.z, f3(lamZ));
    line("Nb,z,Rd", "chi=" + f3(chiZ), f3(NbZ / 1000), "kN");

    if (!isBox && It > 0 && Iw > 0) {
      var LeT = KT * inp.H;
      var y0 = isChan ? Math.abs(sec.y0 || 0) : 0;
      var i02 = iy * iy + iz * iz + y0 * y0;
      NcrT = (G_EC3 * It + Math.PI * Math.PI * E_EC3 * Iw / (LeT * LeT)) / i02;
      if (isChan && y0 > 0) {
        var betaTF = 1 - y0 * y0 / i02;
        var sum = NcrZ + NcrT;
        var radical = Math.max(1 - 4 * betaTF * NcrZ * NcrT / (sum * sum), 0);
        NcrTF = sum / (2 * betaTF) * (1 - Math.sqrt(radical));
      } else {
        NcrTF = NcrT;
      }
      var NcrGov = Math.min(NcrT, NcrTF);
      lamT = Math.sqrt(A * fy / NcrGov);
      var chiT = chiEC3(lamT, curves.z);
      NbT = chiT * A * fy;
      line("Lcr,T", "KT=" + ft(KT, 3), f3(LeT / 1000), "m");
      line(isChan ? "Ncr,TF" : "Ncr,T", isChan ? "minor-axis flexural-torsional coupling included" : "St Venant plus warping torsion", f3(NcrGov / 1000), "kN");
      line("Nb,T,Rd", "lambda-bar T=" + f3(lamT) + ", curve " + curves.z, f3(NbT / 1000), "kN");
      utils.un_t = ratio(NEd, NbT);
    } else if (!isBox) {
      addIssue("Open-section torsional buckling properties It and Iw are required.");
    }

    var selectedMcrMethod = inp.mcrMethod === "ncci" ? "ncci" : "fe";
    var ncciC1Result = null;
    try {
      ncciC1Result = MCR_ENGINE.masterSeriesC1({ L: inp.H, momentSegments: inp.momentSegments });
    } catch (c1Error) {
      addIssue("C1 could not be calculated from the signed moment diagram: " + c1Error.message);
      ncciC1Result = { C1: 1, M1: 0, M2: 0, M0: 0, psi: 0, mu: 0, Mq1: 0, Mmid: 0, Mq3: 0, Mmax: 0 };
    }
    var feMcrResult = null;
    if (selectedMcrMethod === "fe" && !isBox && !isChan && axis === "major" && MyEd > 1e-6) {
      var customFeBoundary = !!(inp.mcrRootRestraints || inp.mcrTipRestraints);
      if (!customFeBoundary && inp.columnTopFree === false) {
        addIssue("The fixed-free FE Mcr method requires the column tip to be unrestrained.");
      } else if (!customFeBoundary && inp.columnBaseFixed === false) {
        addIssue("The fixed-free FE Mcr method requires a fixed column base in the frame model.");
      } else {
        try {
          var eigenOptions = {
            L: inp.H,
            Iz: Iz,
            It: It,
            Iw: Iw,
            momentSegments: inp.momentSegments,
            rootWarpingRestrained: !!inp.rootWarpingRestrained,
            subdivisions: 24
          };
          if (customFeBoundary) {
            eigenOptions.rootRestraints = inp.mcrRootRestraints;
            eigenOptions.tipRestraints = inp.mcrTipRestraints;
            feMcrResult = MCR_ENGINE.mcrEigen(eigenOptions);
          } else {
            feMcrResult = MCR_ENGINE.mcrEigenFixedFree(eigenOptions);
          }
        } catch (feError) {
          addIssue("FE Mcr could not be calculated for the selected end restraints: " + feError.message);
        }
      }
    }
    var C1 = feMcrResult ? feMcrResult.C1 : ncciC1Result.C1;
    var noPlaneMoment = { value: 1, caseLabel: "no moment in this bending plane", noMoment: true };
    var cmyResult = MyEd > 1e-6 ? equivalentMomentFactor(inp.momentSegments, inp.cmYBracePoints, inp.H) : noPlaneMoment;
    var cmzResult = MzEd > 1e-6 ? equivalentMomentFactor(inp.momentSegments, inp.cmZBracePoints, inp.H) : noPlaneMoment;
    var cmltResult = MyEd > 1e-6 ? equivalentMomentFactor(inp.momentSegments, inp.cmLTBracePoints, inp.H) : noPlaneMoment;
    var CmyDiagram = cmyResult.value;
    var CmzDiagram = cmzResult.value;
    var cmySwayOverride = !!inp.swayMode && axis === "major" && MyEd > 1e-6;
    var cmzSwayOverride = !!inp.swayMode && axis === "minor" && MzEd > 1e-6;
    var Cmy = cmySwayOverride ? 0.9 : CmyDiagram;
    var Cmz = cmzSwayOverride ? 0.9 : CmzDiagram;
    var CmLT = cmltResult.value;
    [cmyResult, cmzResult, cmltResult].forEach(function (result) {
      if (result.unavailable) addIssue("Signed column moment diagram is required for the EN 1993-1-1 Table B.3 factors.");
    });
    function cmDescription(result, bracingDirection) {
      if (result.noMoment || result.unavailable) return result.caseLabel;
      var detail = "Table B.3; " + result.caseLabel + "; " + bracingDirection + " interval " +
        ft(result.start, 0) + "-" + ft(result.end, 0) + " mm; Mh=" + ft(result.Mh, 3) + " kN.m";
      if (result.Ms != null) detail += ", Ms=" + ft(result.Ms, 3) + " kN.m at mid-span y=" + ft(result.MsAt, 0) + " mm" + (result.midJump ? " (governing face of a moment jump)" : "");
      detail += ", psi=" + ft(result.psi, 3);
      if (result.alphaName) detail += ", " + result.alphaName + "=" + ft(result.alpha, 3);
      return detail + "; " + result.equation;
    }
    block("Equivalent Moment Factors");
    line("Mcr method", selectedMcrMethod === "fe" ? "Dedicated 1D Vlasov eigenvalue model using the declared root and tip v, v-prime, phi and phi-prime restraints" : "NCCI SN003 coefficient route matching the MasterSeries output format", selectedMcrMethod === "fe" ? "FE eigenvalue" : "NCCI");
    line("C1 = fn(M1, M2, M0, psi, mu)",
      "M1=" + ft(ncciC1Result.M1, 3) + ", M2=" + ft(ncciC1Result.M2, 3) + ", M0=" + ft(ncciC1Result.M0, 3) +
      " kN.m; psi=" + ft(ncciC1Result.psi, 3) + ", mu=" + ft(ncciC1Result.mu, 3) +
      "; M(L/4), M(L/2), M(3L/4)=" + ft(ncciC1Result.Mq1, 3) + ", " + ft(ncciC1Result.Mmid, 3) + ", " + ft(ncciC1Result.Mq3, 3),
      f3(ncciC1Result.C1), "", "NCCI");
    if (feMcrResult) line("C1,eff from FE", "Mcr(actual diagram) / Mcr(uniform moment), using the identical mesh and declared end restraints", f3(C1), "", "FE");
    line("Cmy", cmySwayOverride ? "Table B.3 sway-buckling override for y-y bending; diagram value " + f3(CmyDiagram) + " is not used" : cmDescription(cmyResult, "z-z braced"), f3(Cmy));
    line("Cmz", cmzSwayOverride ? "Table B.3 sway-buckling override for z-z bending; diagram value " + f3(CmzDiagram) + " is not used" : cmDescription(cmzResult, "y-y braced"), f3(Cmz));
    line("CmLT", cmDescription(cmltResult, "y-y braced"), f3(CmLT));

    var MbY = McY;
    var Mcr = null;
    var lamLT = 0;
    var chiLT = 1;
    var chiMod = 1;
    var kc = 1;
    var fFactor = 1;
    var mcrMethod = "Not applicable";
    var torsionSusceptible = !isBox;

    block("Lateral-torsional Buckling Resistance");
    if (isBox) {
      line("Mb,y,Rd", "Closed hollow section; LTB is not applicable", f3(MbY / 1e6), "kN.m");
    } else if (axis === "minor") {
      line("Mb,y,Rd", "No major-axis moment; LTB is not applied to minor-axis bending", f3(MbY / 1e6), "kN.m");
    } else {
      var mcrResult = null;
      var curveLT;
      var useRolledMethod = true;
      if (inp.Mcr_exact > 0) {
        Mcr = Number(inp.Mcr_exact);
        C1 = inp.C1_exact > 0 ? Number(inp.C1_exact) : 1;
        mcrMethod = inp.C1_exact > 0 ? "Externally supplied elastic eigenvalue with C1" : "Externally supplied elastic eigenvalue";
        useRolledMethod = inp.C1_exact > 0;
      } else if (isChan) {
        try {
          mcrResult = MCR_ENGINE.cantileverEquivalent({
            L: inp.H,
            A: A,
            Wpl: Wply,
            Wy: Wy,
            Iz: Iz,
            Iw: Iw,
            iz: iz,
            fy: fy,
            root: inp.ltbRoot,
            tip: inp.ltbTip,
            destabilizing: !!inp.ltbDestabilizing,
            kOverride: inp.KLTOverride
          });
          Mcr = mcrResult.Mcr;
          lamLT = mcrResult.lambdaLT;
          C1 = 1;
          mcrMethod = "PFC fallback: SCI P360 / SN009 cantilever method";
          line("PFC cantilever factors", "The doubly symmetric FE/NCCI coefficient routes are not applied to a monosymmetric channel", "k=" + f3(mcrResult.k) + ", D=" + f3(mcrResult.D));
          line("U; lambda-bar z", "U=(Wpl/A)sqrt(Iz/Iw)", f3(mcrResult.U) + "; " + f3(mcrResult.lambdaZBar));
        } catch (mcrError) {
          addIssue("PFC cantilever Mcr could not be calculated: " + mcrError.message);
        }
      } else if (selectedMcrMethod === "fe") {
        if (feMcrResult) {
          mcrResult = feMcrResult;
          Mcr = feMcrResult.Mcr;
          C1 = feMcrResult.C1;
          mcrMethod = feMcrResult.method;
          line("FE eigenproblem", "[KE - alpha KG] delta = 0; actual signed moment diagram; " + feMcrResult.elements + " elements, " + feMcrResult.freeDof + " free DOF", "alpha=" + f3(feMcrResult.alpha));
          function restraintSummary(state) {
            state = state || {};
            var labels = [];
            if (state.v) labels.push("v");
            if (state.slope) labels.push("v-prime");
            if (state.twist) labels.push("phi");
            if (state.warping) labels.push("phi-prime");
            return labels.length ? labels.join(", ") + " restrained" : "all four DOF free";
          }
          line("FE boundary", "root: " + restraintSummary(feMcrResult.rootRestraints) + "; tip: " + restraintSummary(feMcrResult.tipRestraints), feMcrResult.topFree ? "Free tip" : "User-defined tip", "", "OK");
          line("Mcr,uniform", "identical FE mesh under uniform moment; used only to derive C1,eff", f3(feMcrResult.McrUniform / 1e6), "kN.m");
        }
      } else {
        try {
          var ncciK = inp.KLTOverride > 0 ? Number(inp.KLTOverride) : 1;
          mcrResult = MCR_ENGINE.mcrSN003({ L: inp.H, Iz: Iz, It: It, Iw: Iw, k: ncciK, kw: 1, C1: C1, C2: 0, zg: 0 });
          Mcr = mcrResult.Mcr;
          mcrMethod = "NCCI SN003 / MasterSeries-style C1; k=" + f3(ncciK);
          line("NCCI parameters", "C1=" + f3(C1) + ", k=" + f3(ncciK) + ", kw=1, C2 zg=0; the editable FE restraint table is not used by this route", "MasterSeries-style");
          addIssue("The NCCI SN003 expression requires lateral and torsional restraint at both member ends; the free column tip does not satisfy that scope. The MasterSeries-style result is shown for comparison only and does not add a fork restraint to the frame model.");
        } catch (snError) {
          addIssue("SN003 Mcr could not be calculated: " + snError.message);
        }
      }

      if (Mcr > 0) {
        if (!(lamLT > 0)) lamLT = Math.sqrt(Wy * fy / Mcr);
        curveLT = useRolledMethod ? ec3LTBCurve(sec.family, sec.h, sec.b) : ec3LTBCurveGeneral(sec.family, sec.h, sec.b);
        if (useRolledMethod) {
          var reduced = chiLT_EC3(lamLT, curveLT);
          chiLT = reduced.chi;
          kc = Math.min(1, 1 / Math.sqrt(Math.max(C1, 1e-9)));
          fFactor = Math.min(1, 1 - 0.5 * (1 - kc) * (1 - 2 * Math.pow(lamLT - 0.8, 2)));
          chiMod = Math.min(chiLT / Math.max(fFactor, 1e-9), 1, 1 / Math.max(lamLT * lamLT, 1e-9));
        } else {
          chiLT = chiEC3(lamLT, curveLT);
          chiMod = chiLT;
        }
        MbY = Math.min(chiMod * Wy * fy, McY);
        line("Mcr", mcrMethod, f3(Mcr / 1e6), "kN.m");
        line("lambda-bar LT", "sqrt(Wy fy / Mcr)", f3(lamLT));
        line("chiLT,mod", "curve " + curveLT + (useRolledMethod ? ", rolled-section method" : ", general method"), f3(chiMod));
        line("Mb,y,Rd", "chiLT,mod Wy fy <= Mc,y,Rd", f3(MbY / 1e6), "kN.m");
      } else {
        MbY = 0;
        line("Mcr", "No valid method result", "UNVERIFIED", "", "UNVERIFIED");
      }
    }

    var UNy = ratio(NEd, NbY);
    var UNz = ratio(NEd, NbZ);
    var UMy = ratio(MyEd, MbY);
    var UMz = ratio(MzEd, McZ);
    var elasticK = class3 || isChan;
    var kyy;
    var kzz;
    var kyz;
    var kzy;
    if (elasticK) {
      kyy = Math.min(Cmy * (1 + 0.6 * lamY * UNy), Cmy * (1 + 0.6 * UNy));
      kzz = Math.min(Cmz * (1 + 0.6 * lamZ * UNz), Cmz * (1 + 0.6 * UNz));
      kyz = kzz;
      if (torsionSusceptible) {
        var elasticDenominator = Math.max(CmLT - 0.25, 1e-9);
        var elasticLambdaValue = 1 - 0.05 * lamZ * UNz / elasticDenominator;
        var elasticLowerBound = 1 - 0.05 * UNz / elasticDenominator;
        kzy = Math.max(elasticLambdaValue, elasticLowerBound);
      } else {
        kzy = 0.8 * kyy;
      }
    } else {
      if (isBox) {
        kyy = Cmy * (1 + 0.8 * UNy);
        kzz = Math.min(Cmz * (1 + (lamZ - 0.2) * UNz), Cmz * (1 + 0.8 * UNz));
      } else {
        kyy = Math.min(Cmy * (1 + (lamY - 0.2) * UNy), Cmy * (1 + 0.8 * UNy));
        kzz = Math.min(Cmz * (1 + (2 * lamZ - 0.6) * UNz), Cmz * (1 + 1.4 * UNz));
      }
      kyz = 0.6 * kzz;
      if (torsionSusceptible) {
        var plasticDenominator = Math.max(CmLT - 0.25, 1e-9);
        var plasticLambdaValue = 1 - 0.1 * lamZ * UNz / plasticDenominator;
        var plasticLowerBound = 1 - 0.1 * UNz / plasticDenominator;
        kzy = lamZ < 0.4
          ? Math.min(0.6 + lamZ, plasticLambdaValue)
          : Math.max(plasticLambdaValue, plasticLowerBound);
      } else {
        kzy = 0.6 * kyy;
      }
    }
    var eq661 = UNy + kyy * UMy + kyz * UMz;
    var eq662 = UNz + kzy * UMy + kzz * UMz;
    utils.un_y = UNy;
    utils.un_z = UNz;
    utils.um_y = UMy;
    utils.um_z = UMz;
    utils.eq661 = eq661;
    utils.eq662 = eq662;

    block("Member Interaction - EN 1993-1-1 6.3.3 Annex B");
    line("Torsional susceptibility", torsionSusceptible ? "Open section: Table B.2 envelope" : "Closed section: Table B.1", torsionSusceptible ? "Susceptible" : "Not susceptible");
    line("kyy; kyz; kzy; kzz", "Calculated from Annex B Table " + (torsionSusceptible ? "B.2" : "B.1") + " using the Table B.3 moment factors", f3(kyy) + "; " + f3(kyz) + "; " + f3(kzy) + "; " + f3(kzz));
    line("Equation 6.61", f3(UNy) + "+" + f3(kyy) + "x" + f3(UMy) + "+" + f3(kyz) + "x" + f3(UMz), f3(eq661), "", ok(eq661 <= 1));
    line("Equation 6.62", f3(UNz) + "+" + f3(kzy) + "x" + f3(UMy) + "+" + f3(kzz) + "x" + f3(UMz), f3(eq662), "", ok(eq662 <= 1));

    if (inp.defl) {
      var inspanRatio = Number(inp.defl.inspanLimit || 360);
      var swayRatio = Number(inp.defl.swayLimit || 150);
      var inspanLimit = inp.H / inspanRatio;
      var swayLimit = inp.H / swayRatio;
      var inspanU = ratio(Math.abs(inp.defl.inspan), inspanLimit);
      var swayU = ratio(Math.abs(inp.defl.sway), swayLimit);
      utils.sls_inspan = inspanU;
      utils.sls_sway = swayU;
      block("Serviceability - Separate SLS Analysis");
      line("SLS combination", inp.defl.combo || "Variable action only", "");
      line("Column bow project criterion", ft(Math.abs(inp.defl.inspan), 2) + " <= H/" + ft(inspanRatio, 0) + " = " + ft(inspanLimit, 2) + " mm", f3(inspanU), "", ok(inspanU <= 1));
      line("Column sway project criterion", ft(Math.abs(inp.defl.sway), 2) + " <= H/" + ft(swayRatio, 0) + " = " + ft(swayLimit, 2) + " mm" + (inp.defl.note ? " [" + inp.defl.note + "]" : ""), f3(swayU), "", ok(swayU <= 1));
    }

    block("Scope and Verification");
    for (var ai = 0; ai < advisories.length; ai++) line("Declared scope", advisories[ai], "Advisory");
    for (var ii = 0; ii < issues.length; ii++) line("Blocking item", issues[ii], "UNVERIFIED", "", "UNVERIFIED");
    if (!issues.length) line("Implemented member scope", "No blocking EC3 member-design item was triggered", "VERIFIED", "", "OK");

    var names = {
      shear: "Shear resistance",
      local: "Cross-section resistance",
      un_y: "Flexural buckling y-y",
      un_z: "Flexural buckling z-z",
      un_t: "Torsional/flexural-torsional buckling",
      um_y: "Major-axis LTB",
      um_z: "Minor-axis bending",
      eq661: "Interaction equation 6.61",
      eq662: "Interaction equation 6.62",
      sls_inspan: "SLS column bow criterion",
      sls_sway: "SLS column sway criterion"
    };
    var governingKey = null;
    var governingValue = -1;
    Object.keys(utils).forEach(function (key) {
      if (utils[key] > governingValue) {
        governingValue = utils[key];
        governingKey = key;
      }
    });
    if (governingValue < 0) governingValue = 0;
    var verified = issues.length === 0;
    var passed = verified && governingValue <= 1;
    var status = verified ? (passed ? "PASS" : "FAIL") : "UNVERIFIED";

    return {
      blocks: blocks,
      utils: utils,
      issues: issues,
      advisories: advisories,
      verified: verified,
      status: status,
      governing: { key: governingKey, name: names[governingKey] || "No check", value: governingValue, pass: passed, status: status },
      slender: classification.slender,
      highShear: highShear,
      derived: {
        fy: fy,
        Av: Av,
        Vpl: Vpl / 1000,
        rho: rho,
        McY: McY / 1e6,
        McZ: McZ / 1e6,
        Npl: Npl / 1000,
        n: n,
        MNy: MNy / 1e6,
        MNz: MNz / 1e6,
        localU: localU,
        NcrY: NcrY / 1000,
        NcrZ: NcrZ / 1000,
        lamY: lamY,
        lamZ: lamZ,
        NbY: NbY / 1000,
        NbZ: NbZ / 1000,
        NcrT: NcrT == null ? null : NcrT / 1000,
        NcrTF: NcrTF == null ? null : NcrTF / 1000,
        NbT: NbT == null ? null : NbT / 1000,
        lamT: lamT,
        C1: C1,
        mcrSelection: selectedMcrMethod,
        ncciC1Result: ncciC1Result,
        feMcrResult: feMcrResult,
        Cmy: Cmy,
        CmyDiagram: CmyDiagram,
        Cmz: Cmz,
        CmzDiagram: CmzDiagram,
        CmLT: CmLT,
        cmYResult: cmyResult,
        cmZResult: cmzResult,
        cmLTResult: cmltResult,
        Mcr: Mcr == null ? null : Mcr / 1e6,
        mcrMethod: mcrMethod,
        lamLT: lamLT,
        chiLT: chiLT,
        kc: kc,
        f: fFactor,
        chiMod: chiMod,
        MbY: MbY / 1e6,
        UNy: UNy,
        UNz: UNz,
        UMy: UMy,
        UMz: UMz,
        kyy: kyy,
        kyz: kyz,
        kzy: kzy,
        kzz: kzz,
        eq661: eq661,
        eq662: eq662
      }
    };
  }

  globalThis.RACK_EUROCODE_ENGINE = {
    designColumnEC3: designColumnEC3,
    fyEC3: fyEC3,
    chiEC3: chiEC3,
    chiLT_EC3: chiLT_EC3,
    ec3StrutCurves: ec3StrutCurves,
    ec3LTBCurve: ec3LTBCurve,
    ec3LTBCurveGeneral: ec3LTBCurveGeneral,
    c1QuarterPoint: MCR_ENGINE.c1QuarterPoint,
    c1EC3: MCR_ENGINE.c1EC3,
    equivalentMomentFactor: equivalentMomentFactor,
    channelShearCentreY0: channelShearCentreY0,
    channelIw: channelIw,
    classifyEC3: classifyEC3,
    E_EC3: E_EC3,
    G_EC3: G_EC3
  };
})();
