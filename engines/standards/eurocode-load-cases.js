(function () {
  "use strict";

  var CATEGORY_E = { psi0: 1.0, psi1: 0.9, psi2: 0.8 };

  function finiteOr(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function ulsCases(method, options) {
    options = options || {};
    var psi0 = finiteOr(options.psi0, CATEGORY_E.psi0);
    var gammaG = finiteOr(options.gammaG, 1.35);
    var gammaQ = finiteOr(options.gammaQ, 1.50);

    if (method === "as-run") {
      return [{
        id: "as-run",
        gammaG: gammaG,
        gammaQ: gammaQ,
        label: "Analysis factors as entered: " + gammaG.toFixed(3) + "G + " + gammaQ.toFixed(3) + "Q"
      }];
    }

    if (method === "610ab") {
      return [
        {
          id: "6.10a",
          gammaG: 1.35,
          gammaQ: 1.50 * psi0,
          label: "EN 1990 6.10a: 1.350G + " + (1.50 * psi0).toFixed(3) + "Q"
        },
        {
          id: "6.10b",
          gammaG: 0.925 * 1.35,
          gammaQ: 1.50,
          label: "EN 1990 6.10b: 1.249G + 1.500Q"
        }
      ];
    }

    return [{
      id: "6.10",
      gammaG: 1.35,
      gammaQ: 1.50,
      label: "EN 1990 6.10: 1.350G + 1.500Q"
    }];
  }

  function slsCase(method, options) {
    options = options || {};
    var psi1 = finiteOr(options.psi1, CATEGORY_E.psi1);
    var psi2 = finiteOr(options.psi2, CATEGORY_E.psi2);

    if (method === "characteristic") {
      return { id: method, gammaG: 1, gammaQ: 1, label: "SLS characteristic: 1.000G + 1.000Q" };
    }
    if (method === "frequent") {
      return { id: method, gammaG: 1, gammaQ: psi1, label: "SLS frequent: 1.000G + " + psi1.toFixed(3) + "Q" };
    }
    if (method === "quasi") {
      return { id: method, gammaG: 1, gammaQ: psi2, label: "SLS quasi-permanent: 1.000G + " + psi2.toFixed(3) + "Q" };
    }
    return { id: "q-only", gammaG: 0, gammaQ: 1, label: "UK NA deflection: variable action only, 0G + 1.000Q" };
  }

  globalThis.RACK_EUROCODE_LOAD_CASES = {
    CATEGORY_E: CATEGORY_E,
    ulsCases: ulsCases,
    slsCase: slsCase
  };
})();
