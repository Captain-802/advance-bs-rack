(function () {
  "use strict";

  var E = 210000;
  var G = E / 2.6;

  function positive(value, name) {
    value = Number(value);
    if (!(value > 0)) throw new Error(name + " must be positive.");
    return value;
  }

  function c1QuarterPoint(M2, M3, M4, Mmax) {
    if (!(Mmax > 0)) return 1;
    var numerator = 35 * Mmax * Mmax;
    var denominator = Mmax * Mmax + 9 * M2 * M2 + 16 * M3 * M3 + 9 * M4 * M4;
    return Math.min(Math.max(Math.sqrt(numerator / denominator), 1), 2.7);
  }

  function c1EC3(M2, M3, M4, Mmax, psi) {
    if (!(Mmax > 0)) return 1;
    var p = psi == null ? 0 : Math.min(Math.max(Number(psi), -1), 1);
    var lin2 = Math.abs(M2 / Mmax - Math.abs(0.75 + 0.25 * p)) < 0.02;
    var lin3 = Math.abs(M3 / Mmax - Math.abs(0.50 + 0.50 * p)) < 0.02;
    var lin4 = Math.abs(M4 / Mmax - Math.abs(0.25 + 0.75 * p)) < 0.02;
    if (lin2 && lin3 && lin4) return Math.min(Math.max(1.77 - 0.88 * p + 0.11 * p * p, 1), 2.7);
    return c1QuarterPoint(M2, M3, M4, Mmax);
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
        var fraction = (y - segment.y1) / Math.max(segment.y2 - segment.y1, 1e-12);
        return segment.M1 + fraction * (segment.M2 - segment.M1);
      }
    }
    return 0;
  }

  function validatedMomentSegments(momentSegments, length) {
    return (momentSegments || []).filter(function (segment) {
      return Number.isFinite(segment.y1) && Number.isFinite(segment.y2) && Number.isFinite(segment.M1) &&
        Number.isFinite(segment.M2) && segment.y2 > segment.y1 && segment.y2 >= 0 && segment.y1 <= length;
    }).map(function (segment) {
      return {
        y1: Math.max(0, segment.y1),
        y2: Math.min(length, segment.y2),
        M1: Number(segment.M1),
        M2: Number(segment.M2)
      };
    }).filter(function (segment) { return segment.y2 > segment.y1; })
      .sort(function (a, b) { return a.y1 - b.y1; });
  }

  function masterSeriesC1(options) {
    options = options || {};
    var length = positive(options.L, "L");
    var segments = validatedMomentSegments(options.momentSegments, length);
    if (!segments.length) throw new Error("A signed moment diagram is required for C1.");

    var baseMoment = momentAt(segments, 0, "right");
    var tipMoment = momentAt(segments, length, "left");
    var reversed = Math.abs(tipMoment) > Math.abs(baseMoment);
    var M1 = reversed ? tipMoment : baseMoment;
    var M2 = reversed ? baseMoment : tipMoment;
    var quarter1 = momentAt(segments, reversed ? 3 * length / 4 : length / 4, reversed ? "left" : "right");
    var mid = momentAt(segments, length / 2, "right");
    var quarter3 = momentAt(segments, reversed ? length / 4 : 3 * length / 4, reversed ? "right" : "left");
    var maximum = 0;
    segments.forEach(function (segment) {
      maximum = Math.max(maximum, Math.abs(segment.M1), Math.abs(segment.M2));
    });
    if (!(maximum > 1e-12)) {
      return { C1: 1, M1: 0, M2: 0, M0: 0, psi: 0, mu: 0, Mq1: 0, Mmid: 0, Mq3: 0, Mmax: 0, reversed: false };
    }

    var M0 = mid - (M1 + M2) / 2;
    var psi = Math.abs(M1) > 1e-12 ? Math.min(Math.max(M2 / M1, -1), 1) : 0;
    var mu = Math.abs(M1) > 1e-12 ? M0 / M1 : 0;
    return {
      C1: c1QuarterPoint(quarter1, mid, quarter3, maximum),
      M1: M1,
      M2: M2,
      M0: M0,
      psi: psi,
      mu: mu,
      Mq1: quarter1,
      Mmid: mid,
      Mq3: quarter3,
      Mmax: maximum,
      reversed: reversed,
      method: "MasterSeries-style Serna/SCI quarter-point expression"
    };
  }

  function matrixZeros(rows, columns) {
    columns = columns == null ? rows : columns;
    return Array.from({ length: rows }, function () { return Array(columns).fill(0); });
  }

  function addBlock(matrix, map, block, offset) {
    offset = offset || 0;
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) matrix[map[i + offset]][map[j + offset]] += block[i][j];
  }

  function beamBlock(length, coefficient) {
    var length2 = length * length;
    return [
      [12 * coefficient, 6 * length * coefficient, -12 * coefficient, 6 * length * coefficient],
      [6 * length * coefficient, 4 * length2 * coefficient, -6 * length * coefficient, 2 * length2 * coefficient],
      [-12 * coefficient, -6 * length * coefficient, 12 * coefficient, -6 * length * coefficient],
      [6 * length * coefficient, 2 * length2 * coefficient, -6 * length * coefficient, 4 * length2 * coefficient]
    ];
  }

  function torsionBlock(length, coefficient) {
    var length2 = length * length;
    return [
      [36 * coefficient, 3 * length * coefficient, -36 * coefficient, 3 * length * coefficient],
      [3 * length * coefficient, 4 * length2 * coefficient, -3 * length * coefficient, -length2 * coefficient],
      [-36 * coefficient, -3 * length * coefficient, 36 * coefficient, -3 * length * coefficient],
      [3 * length * coefficient, -length2 * coefficient, -3 * length * coefficient, 4 * length2 * coefficient]
    ];
  }

  function geometricCouplingBlock(length, moment1, moment2) {
    var block = matrixZeros(4);
    var points = [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)];
    var weights = [5 / 9, 8 / 9, 5 / 9];
    for (var p = 0; p < points.length; p++) {
      var r = (points[p] + 1) / 2;
      var weight = weights[p] * length / 2;
      var moment = moment1 + (moment2 - moment1) * r;
      var derivatives = [
        (-6 * r + 6 * r * r) / length,
        1 - 4 * r + 3 * r * r,
        (6 * r - 6 * r * r) / length,
        -2 * r + 3 * r * r
      ];
      for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) block[i][j] += moment * derivatives[i] * derivatives[j] * weight;
    }
    return block;
  }

  function matrixMultiply(left, right) {
    var output = matrixZeros(left.length, right[0].length);
    for (var i = 0; i < left.length; i++) for (var k = 0; k < right.length; k++) {
      var value = left[i][k];
      if (Math.abs(value) < 1e-30) continue;
      for (var j = 0; j < right[0].length; j++) output[i][j] += value * right[k][j];
    }
    return output;
  }

  function matrixTranspose(matrix) {
    var output = matrixZeros(matrix[0].length, matrix.length);
    for (var i = 0; i < matrix.length; i++) for (var j = 0; j < matrix[0].length; j++) output[j][i] = matrix[i][j];
    return output;
  }

  function choleskyLower(matrix) {
    var n = matrix.length;
    var lower = matrixZeros(n);
    var scale = 0;
    for (var i = 0; i < n; i++) scale = Math.max(scale, Math.abs(matrix[i][i]));
    var tolerance = Math.max(1e-14, scale * 1e-12);
    for (i = 0; i < n; i++) {
      for (var j = 0; j <= i; j++) {
        var sum = matrix[i][j];
        for (var k = 0; k < j; k++) sum -= lower[i][k] * lower[j][k];
        if (i === j) {
          if (sum <= tolerance) throw new Error("Elastic LTB stiffness is not positive definite after applying the root restraints.");
          lower[i][j] = Math.sqrt(sum);
        } else {
          lower[i][j] = sum / lower[j][j];
        }
      }
    }
    return lower;
  }

  function inverseLower(lower) {
    var n = lower.length;
    var inverse = matrixZeros(n);
    for (var column = 0; column < n; column++) {
      for (var i = 0; i < n; i++) {
        var sum = i === column ? 1 : 0;
        for (var k = 0; k < i; k++) sum -= lower[i][k] * inverse[k][column];
        inverse[i][column] = sum / lower[i][i];
      }
    }
    return inverse;
  }

  function jacobiEigenvalues(matrix) {
    var n = matrix.length;
    if (n === 1) return [matrix[0][0]];
    var scale = 0;
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) scale = Math.max(scale, Math.abs(matrix[i][j]));
    if (scale === 0) return Array(n).fill(0);
    var tolerance = scale * 1e-10;
    for (var sweep = 0; sweep < 70; sweep++) {
      var changed = false;
      var maximumOffDiagonal = 0;
      for (var p = 0; p < n - 1; p++) for (var q = p + 1; q < n; q++) {
        var apq = matrix[p][q];
        var magnitude = Math.abs(apq);
        maximumOffDiagonal = Math.max(maximumOffDiagonal, magnitude);
        if (magnitude <= tolerance) continue;
        var app = matrix[p][p];
        var aqq = matrix[q][q];
        var tau = (aqq - app) / (2 * apq);
        var t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        var cosine = 1 / Math.sqrt(1 + t * t);
        var sine = t * cosine;
        matrix[p][p] = app - t * apq;
        matrix[q][q] = aqq + t * apq;
        matrix[p][q] = matrix[q][p] = 0;
        for (var k = 0; k < n; k++) {
          if (k === p || k === q) continue;
          var akp = matrix[k][p];
          var akq = matrix[k][q];
          matrix[k][p] = matrix[p][k] = cosine * akp - sine * akq;
          matrix[k][q] = matrix[q][k] = sine * akp + cosine * akq;
        }
        changed = true;
      }
      if (!changed || maximumOffDiagonal <= tolerance) break;
    }
    return matrix.map(function (row, index) { return row[index]; });
  }

  function eigenMesh(length, segments, subdivisions) {
    var points = [0, length];
    for (var i = 1; i < subdivisions; i++) points.push(length * i / subdivisions);
    segments.forEach(function (segment) { points.push(segment.y1, segment.y2); });
    points.sort(function (a, b) { return a - b; });
    return points.filter(function (point, index) { return index === 0 || Math.abs(point - points[index - 1]) > 1e-6; });
  }

  function solveFixedFreeEigen(options, segments, nodes) {
    var length = options.L;
    var Iz = options.Iz;
    var It = options.It;
    var Iw = options.Iw;
    var elastic = matrixZeros(4 * nodes.length);
    var geometric = matrixZeros(4 * nodes.length);
    for (var element = 0; element < nodes.length - 1; element++) {
      var x1 = nodes[element];
      var x2 = nodes[element + 1];
      var elementLength = x2 - x1;
      var map = [4 * element, 4 * element + 1, 4 * (element + 1), 4 * (element + 1) + 1,
        4 * element + 2, 4 * element + 3, 4 * (element + 1) + 2, 4 * (element + 1) + 3];
      addBlock(elastic, map, beamBlock(elementLength, E * Iz / Math.pow(elementLength, 3)), 0);
      var warping = beamBlock(elementLength, E * Iw / Math.pow(elementLength, 3));
      var torsion = torsionBlock(elementLength, G * It / (30 * elementLength));
      for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) warping[i][j] += torsion[i][j];
      addBlock(elastic, map, warping, 4);
      var moment1 = momentAt(segments, x1, "right") * 1e6;
      var moment2 = momentAt(segments, x2, "left") * 1e6;
      var coupling = geometricCouplingBlock(elementLength, moment1, moment2);
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) {
        geometric[map[i]][map[j + 4]] += coupling[i][j];
        geometric[map[i + 4]][map[j]] += coupling[i][j];
      }
    }

    var restrained = new Set([0, 1, 2]);
    if (options.rootWarpingRestrained) restrained.add(3);
    var free = [];
    for (var degree = 0; degree < elastic.length; degree++) if (!restrained.has(degree)) free.push(degree);
    var elasticReduced = free.map(function (row) { return free.map(function (column) { return elastic[row][column]; }); });
    var geometricReduced = free.map(function (row) { return free.map(function (column) { return geometric[row][column]; }); });
    var diagonalScale = elasticReduced.map(function (row, index) {
      if (!(Math.abs(row[index]) > 0)) throw new Error("Elastic LTB stiffness has a zero diagonal after root restraints.");
      return 1 / Math.sqrt(Math.abs(row[index]));
    });
    var elasticScaled = elasticReduced.map(function (row, i) { return row.map(function (value, j) { return value * diagonalScale[i] * diagonalScale[j]; }); });
    var geometricScaled = geometricReduced.map(function (row, i) { return row.map(function (value, j) { return value * diagonalScale[i] * diagonalScale[j]; }); });
    var lower = choleskyLower(elasticScaled);
    var lowerInverse = inverseLower(lower);
    var transformed = matrixMultiply(matrixMultiply(lowerInverse, geometricScaled), matrixTranspose(lowerInverse));
    for (var r = 0; r < transformed.length; r++) for (var c = r + 1; c < transformed.length; c++) {
      var average = 0.5 * (transformed[r][c] + transformed[c][r]);
      transformed[r][c] = transformed[c][r] = average;
    }
    var eigenvalues = jacobiEigenvalues(transformed).filter(Number.isFinite);
    var governing = 0;
    eigenvalues.forEach(function (value) { if (Math.abs(value) > Math.abs(governing)) governing = value; });
    if (!(Math.abs(governing) > 1e-18)) throw new Error("The LTB geometric stiffness produced no usable eigenvalue.");
    return { alpha: 1 / Math.abs(governing), eigenvalue: governing, freeDof: free.length, restraints: restrained.size };
  }

  function mcrEigenFixedFree(options) {
    options = options || {};
    var length = positive(options.L, "L");
    positive(options.Iz, "Iz");
    positive(options.It, "It");
    positive(options.Iw, "Iw");
    var segments = validatedMomentSegments(options.momentSegments, length);
    if (!segments.length) throw new Error("A signed moment diagram is required for the FE Mcr calculation.");
    var maximumMoment = 0;
    var signedMaximum = 0;
    segments.forEach(function (segment) {
      [segment.M1, segment.M2].forEach(function (moment) {
        if (Math.abs(moment) > maximumMoment) { maximumMoment = Math.abs(moment); signedMaximum = moment; }
      });
    });
    if (!(maximumMoment > 1e-9)) throw new Error("No major-axis moment is present for the FE Mcr calculation.");
    var subdivisions = Math.max(12, Math.min(48, Math.round(Number(options.subdivisions) || 24)));
    var nodes = eigenMesh(length, segments, subdivisions);
    var actual = solveFixedFreeEigen(options, segments, nodes);
    var uniformSegments = [{ y1: 0, y2: length, M1: signedMaximum, M2: signedMaximum }];
    var uniform = solveFixedFreeEigen(options, uniformSegments, nodes);
    var Mcr = actual.alpha * maximumMoment * 1e6;
    var McrUniform = uniform.alpha * maximumMoment * 1e6;
    return {
      method: "1D Vlasov FE eigenvalue; fixed root, free tip",
      Mcr: Mcr,
      McrUniform: McrUniform,
      C1: Mcr / McrUniform,
      alpha: actual.alpha,
      alphaUniform: uniform.alpha,
      Mmax: maximumMoment,
      nodes: nodes.length,
      elements: nodes.length - 1,
      freeDof: actual.freeDof,
      rootWarpingRestrained: !!options.rootWarpingRestrained,
      topFree: true
    };
  }

  var CANTILEVER_K = {
    "top-lateral": [3.0, 2.7, 2.4, 2.1],
    "partial-torsion": [2.0, 1.8, 1.6, 1.4],
    "lat-torsion": [1.0, 0.9, 0.8, 0.7],
    "full": [0.8, 0.7, 0.6, 0.5]
  };
  var TIP_INDEX = { free: 0, lateral: 1, torsional: 2, "lat-torsion": 3 };
  var DESTABILIZING_D = [2.5, 2.8, 1.9, 1.7];
  var DESTABILIZING_D_FULL = [1.75, 2.0, 1.0, 1.0];

  function cantileverFactors(root, tip, destabilizing) {
    root = CANTILEVER_K[root] ? root : "lat-torsion";
    tip = Object.prototype.hasOwnProperty.call(TIP_INDEX, tip) ? tip : "free";
    var index = TIP_INDEX[tip];
    return {
      root: root,
      tip: tip,
      k: CANTILEVER_K[root][index],
      D: destabilizing ? (root === "full" ? DESTABILIZING_D_FULL[index] : DESTABILIZING_D[index]) : 1,
      destabilizing: !!destabilizing
    };
  }

  function mcrSN003(options) {
    options = options || {};
    var L = positive(options.L, "L");
    var Iz = positive(options.Iz, "Iz");
    var It = positive(options.It, "It");
    var Iw = positive(options.Iw, "Iw");
    var k = positive(options.k == null ? 1 : options.k, "k");
    var kw = positive(options.kw == null ? 1 : options.kw, "kw");
    var C1 = positive(options.C1 == null ? 1 : options.C1, "C1");
    var C2 = Number(options.C2) || 0;
    var zg = Number(options.zg) || 0;
    var Le = k * L;
    var eulerTerm = Math.PI * Math.PI * E * Iz / (Le * Le);
    var loadHeight = C2 * zg;
    var radical = Math.pow(k / kw, 2) * Iw / Iz + G * It / eulerTerm + loadHeight * loadHeight;
    return {
      method: "SN003",
      Mcr: C1 * eulerTerm * (Math.sqrt(Math.max(radical, 0)) - loadHeight),
      C1: C1,
      k: k,
      kw: kw,
      D: 1,
      Le: Le
    };
  }

  function cantileverEquivalent(options) {
    options = options || {};
    var L = positive(options.L, "L");
    var A = positive(options.A, "A");
    var Wpl = positive(options.Wpl, "Wpl");
    var Wy = positive(options.Wy, "Wy");
    var Iz = positive(options.Iz, "Iz");
    var Iw = positive(options.Iw, "Iw");
    var iz = positive(options.iz, "iz");
    var fy = positive(options.fy, "fy");
    var factors = cantileverFactors(options.root, options.tip, options.destabilizing);
    var k = options.kOverride > 0 ? Number(options.kOverride) : factors.k;
    var D = factors.D;
    var C1 = 1;
    var lambda1 = Math.PI * Math.sqrt(E / fy);
    var lambdaZBar = (k * L / iz) / lambda1;
    var U = (Wpl / A) * Math.sqrt(Iz / Iw);
    var betaW = Math.min(Math.max(Wy / Wpl, 0.01), 1);
    var lambdaLT = U * lambdaZBar * Math.sqrt(betaW / C1) * D;
    var Mcr = Wy * fy / (lambdaLT * lambdaLT);
    return {
      method: "P360-SN009",
      Mcr: Mcr,
      lambdaLT: lambdaLT,
      C1: C1,
      U: U,
      V: 1,
      betaW: betaW,
      lambdaZBar: lambdaZBar,
      k: k,
      D: D,
      Le: k * L,
      factors: factors,
      conservative: true
    };
  }

  globalThis.RACK_EUROCODE_MCR_ENGINE = {
    E: E,
    G: G,
    c1QuarterPoint: c1QuarterPoint,
    c1EC3: c1EC3,
    masterSeriesC1: masterSeriesC1,
    mcrEigenFixedFree: mcrEigenFixedFree,
    cantileverFactors: cantileverFactors,
    mcrSN003: mcrSN003,
    cantileverEquivalent: cantileverEquivalent
  };
})();
