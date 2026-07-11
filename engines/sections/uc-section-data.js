/*
  Machine-readable Universal Columns (UC) section properties extracted from:
  D:/STEEL SECTIONS/UC-secpropsdimsprops-EC3UKNA-UK-6-27-2026.xlsx

  Data shape:
  - properties: ordered schema for each row value, including units.
  - rows: compact row arrays in the same order as properties.
  - sections: row arrays expanded into objects keyed by property name.
  - byDesignation: lookup object keyed by section_designation.

  Browser use:
    globalThis.UNIVERSAL_COLUMNS_DATASET.sections

  Node/CommonJS use:
    const dataset = require("./universal_columns_agent_dataset.js");
*/
(function () {
  const metadata = {
    name: "Universal columns section properties",
    section_type: "UC",
    standard: "Eurocode 3, UK National Annex, BS EN 10365:2017",
    source_file: "D:/STEEL SECTIONS/UC-secpropsdimsprops-EC3UKNA-UK-6-27-2026.xlsx",
    source_url: "http://www.steelforlifebluebook.co.uk/uc/ec3-ukna/section-properties-dimensions-properties/",
    downloaded_at_local: "2026-06-27 18:31:48",
    record_count: 46,
    note: "+ sections are in addition to the range of BS EN 10365 sections."
  };

  const properties = [
    { key: "section_designation", label: "Section designation", unit: null, type: "string" },
    { key: "nominal_size", label: "Nominal size", unit: "mm", type: "string" },
    { key: "mass_designation", label: "Mass designation", unit: "kg/m", type: "string" },
    { key: "additional_to_bs_en_10365", label: "Additional to BS EN 10365", unit: null, type: "boolean" },
    { key: "mass_per_metre_kg_per_m", label: "Mass per metre", unit: "kg/m", type: "number" },
    { key: "depth_h_mm", label: "Depth of section h", unit: "mm", type: "number" },
    { key: "width_b_mm", label: "Width of section b", unit: "mm", type: "number" },
    { key: "web_thickness_tw_mm", label: "Web thickness tw", unit: "mm", type: "number" },
    { key: "flange_thickness_tf_mm", label: "Flange thickness tf", unit: "mm", type: "number" },
    { key: "root_radius_r_mm", label: "Root radius r", unit: "mm", type: "number" },
    { key: "depth_between_fillets_d_mm", label: "Depth between fillets d", unit: "mm", type: "number" },
    { key: "local_buckling_ratio_web_cw_over_tw", label: "Local buckling ratio web cw/tw", unit: null, type: "number" },
    { key: "local_buckling_ratio_flange_cf_over_tf", label: "Local buckling ratio flange cf/tf", unit: null, type: "number" },
    { key: "end_clearance_C_mm", label: "End clearance C", unit: "mm", type: "number" },
    { key: "notch_N_mm", label: "Detailing notch N", unit: "mm", type: "number" },
    { key: "notch_n_mm", label: "Detailing notch n", unit: "mm", type: "number" },
    { key: "surface_area_per_metre_m2_per_m", label: "Surface area per metre", unit: "m^2/m", type: "number" },
    { key: "surface_area_per_tonne_m2_per_tonne", label: "Surface area per tonne", unit: "m^2/tonne", type: "number" },
    { key: "second_moment_area_Iy_cm4", label: "Second moment of area Iy", unit: "cm^4", type: "number" },
    { key: "second_moment_area_Iz_cm4", label: "Second moment of area Iz", unit: "cm^4", type: "number" },
    { key: "radius_gyration_iy_cm", label: "Radius of gyration iy", unit: "cm", type: "number" },
    { key: "radius_gyration_iz_cm", label: "Radius of gyration iz", unit: "cm", type: "number" },
    { key: "elastic_modulus_Wely_cm3", label: "Elastic modulus Wely", unit: "cm^3", type: "number" },
    { key: "elastic_modulus_Welz_cm3", label: "Elastic modulus Welz", unit: "cm^3", type: "number" },
    { key: "plastic_modulus_Wply_cm3", label: "Plastic modulus Wply", unit: "cm^3", type: "number" },
    { key: "plastic_modulus_Wplz_cm3", label: "Plastic modulus Wplz", unit: "cm^3", type: "number" },
    { key: "buckling_parameter_U", label: "Buckling parameter U", unit: null, type: "number" },
    { key: "torsional_index_X", label: "Torsional index X", unit: null, type: "number" },
    { key: "warping_constant_Iw_dm6", label: "Warping constant Iw", unit: "dm^6", type: "number" },
    { key: "torsional_constant_IT_cm4", label: "Torsional constant IT", unit: "cm^4", type: "number" },
    { key: "area_A_cm2", label: "Area of section A", unit: "cm^2", type: "number" },
    { key: "source_line", label: "Source workbook row", unit: null, type: "number" }
  ];

  const rowText = String.raw`
356 x 406 x 1299|356 x 406|x 1299|false|1299|600|476|100|140|15.4|290|2.9|1.23|52|198|156|2.88|2.22|755000|254000|21.4|12.4|25200|10700|33200|16700|0.846|3.42|133.1|94500|1655|11
356 x 406 x 1202|356 x 406|x 1202|false|1202|580|471|95|130|15.4|290|3.05|1.33|50|198|146|2.83|2.35|664000|229000|20.8|12.2|22900|9710|30000|15200|0.842|3.59|114.6|76300|1531|12
356 x 406 x 1086|356 x 406|x 1086|false|1086|569|454|78|125|15|290|3.72|1.38|41|198|140|2.77|2.55|596000|196000|20.7|11.9|20900|8640|27200|13400|0.852|3.79|96.1|60500|1386|13
356 x 406 x 990|356 x 406|x 990|false|990|550|448|71.9|115|15|290|4.03|1.5|38|200|130|2.72|2.75|519000|173000|20.3|11.7|18900|7740|24300|12000|0.851|4.02|81.5|46900|1262|14
356 x 406 x 900|356 x 406|x 900|false|900|531|442|65.9|106|15|290|4.4|1.63|35|200|122|2.67|2.97|450000|153000|19.8|11.6|17000|6940|21600|10700|0.849|4.26|68.9|36400|1149|15
356 x 406 x 818|356 x 406|x 818|false|818|514|437|60.5|97|15|290|4.79|1.79|32|200|112|2.63|3.22|392000|136000|19.4|11.4|15300|6200|19300|9560|0.847|4.55|58.6|27800|1043|16
356 x 406 x 744|356 x 406|x 744|false|744|498|432|55.6|88.9|15|290|5.22|1.95|30|200|104|2.59|3.48|342000|120000|19|11.3|13700|5550|17200|8550|0.845|4.86|50|21400|948|17
356 x 406 x 677|356 x 406|x 677|false|677|483|428|51.2|81.5|15|290|5.66|2.13|28|200|98|2.55|3.77|300000|107000|18.6|11.1|12400|4990|15400|7680|0.844|5.19|42.9|16400|863|18
356 x 406 x 634|356 x 406|x 634|false|633.9|474.6|424|47.6|77|15.2|290.2|6.1|2.25|26|200|94|2.52|3.98|275000|98100|18.4|11|11600|4630|14200|7110|0.842|5.46|38.8|13700|808|19
356 x 406 x 592|356 x 406|x 592|false|592|465|421|45|72.3|15|290|6.44|2.39|25|198|88|2.5|4.22|250000|90200|18.2|10.9|10800|4280|13100|6570|0.843|5.72|34.7|11400|755|20
356 x 406 x 551|356 x 406|x 551|false|551|455.6|418.5|42.1|67.5|15.2|290.2|6.89|2.56|23|200|84|2.48|4.49|227000|82700|18|10.9|9960|3950|12100|6060|0.842|6.05|31.1|9240|702|21
356 x 406 x 509|356 x 406|x 509|false|509|446|416|39.1|62.7|15|290|7.42|2.77|22|200|78|2.45|4.81|204000|75400|17.8|10.8|9170|3620|11000|5550|0.84|6.42|27.6|7390|649|22
356 x 406 x 467|356 x 406|x 467|false|467|436.6|412.2|35.8|58|15.2|290.2|8.11|2.98|20|200|74|2.42|5.18|183000|67800|17.5|10.7|8380|3290|10000|5030|0.839|6.85|24.3|5810|595|23
356 x 406 x 393|356 x 406|x 393|false|393|419|407|30.6|49.2|15.2|290.2|9.48|3.52|17|200|66|2.38|6.06|147000|55400|17.1|10.5|7000|2720|8220|4150|0.837|7.85|18.9|3550|501|24
356 x 406 x 340|356 x 406|x 340|false|339.9|406.4|403|26.6|42.9|15.2|290.2|10.9|4.03|15|200|60|2.35|6.91|123000|46900|16.8|10.4|6030|2330|7000|3540|0.836|8.85|15.5|2340|433|25
356 x 406 x 287|356 x 406|x 287|false|287.1|393.6|399|22.6|36.5|15.2|290.2|12.8|4.74|13|200|52|2.31|8.05|99900|38700|16.5|10.3|5070|1940|5810|2950|0.835|10.2|12.3|1440|366|26
356 x 406 x 235|356 x 406|x 235|false|235.1|381|394.8|18.4|30.2|15.2|290.2|15.8|5.73|11|200|46|2.28|9.7|79100|31000|16.3|10.2|4150|1570|4690|2380|0.835|12|9.54|812|299|27
356 x 368 x 202|356 x 368|x 202|false|201.9|374.6|374.7|16.5|27|15.2|290.2|17.6|6.07|10|190|44|2.19|10.8|66300|23700|16.1|9.6|3540|1260|3970|1920|0.844|13.3|7.16|558|257|28
356 x 368 x 177|356 x 368|x 177|false|177|368.2|372.6|14.4|23.8|15.2|290.2|20.2|6.89|9|190|40|2.17|12.3|57100|20500|15.9|9.54|3100|1100|3460|1670|0.843|15|6.09|381|226|29
356 x 368 x 153|356 x 368|x 153|false|152.9|362|370.5|12.3|20.7|15.2|290.2|23.6|7.92|8|190|36|2.16|14.1|48600|17600|15.8|9.49|2680|948|2960|1430|0.843|17|5.11|251|195|30
356 x 368 x 129|356 x 368|x 129|false|129|355.6|368.6|10.4|17.5|15.2|290.2|27.9|9.37|7|190|34|2.14|16.6|40200|14600|15.6|9.43|2260|793|2480|1200|0.845|19.8|4.18|153|164|31
305 x 305 x 283|305 x 305|x 283|false|282.9|365.3|322.2|26.8|44.1|15.2|246.7|9.21|3|15|158|60|1.94|6.86|78900|24600|14.8|8.27|4320|1530|5110|2340|0.856|7.65|6.35|2030|360|32
305 x 305 x 240|305 x 305|x 240|false|240|352.5|318.4|23|37.7|15.2|246.7|10.7|3.51|14|158|54|1.91|7.96|64200|20300|14.5|8.15|3640|1280|4250|1950|0.854|8.74|5.03|1270|306|33
305 x 305 x 198|305 x 305|x 198|false|198.1|339.9|314.5|19.1|31.4|15.2|246.7|12.9|4.22|12|158|48|1.87|9.44|50900|16300|14.2|8.04|3000|1040|3440|1580|0.854|10.2|3.88|734|252|34
305 x 305 x 158|305 x 305|x 158|false|158.1|327.1|311.2|15.8|25|15.2|246.7|15.6|5.3|10|158|42|1.84|11.6|38700|12600|13.9|7.9|2370|808|2680|1230|0.852|12.4|2.87|378|201|35
305 x 305 x 137|305 x 305|x 137|false|136.9|320.5|309.2|13.8|21.7|15.2|246.7|17.9|6.11|9|158|38|1.82|13.3|32800|10700|13.7|7.83|2050|692|2300|1050|0.852|14.1|2.39|249|174|36
305 x 305 x 118|305 x 305|x 118|false|117.9|314.5|307.4|12|18.7|15.2|246.7|20.6|7.09|8|158|34|1.81|15.4|27700|9060|13.6|7.77|1760|589|1960|895|0.852|16.1|1.98|161|150|37
305 x 305 x 97|305 x 305|x 97|false|96.9|307.9|305.3|9.9|15.4|15.2|246.7|24.9|8.6|7|158|32|1.79|18.5|22200|7310|13.4|7.69|1450|479|1590|726|0.851|19.2|1.56|91.2|123|38
254 x 254 x 167|254 x 254|x 167|false|167.1|289.1|265.2|19.2|31.7|12.7|200.3|10.4|3.48|12|134|46|1.58|9.46|30000|9870|11.9|6.81|2080|744|2420|1140|0.851|8.48|1.63|626|213|39
254 x 254 x 132|254 x 254|x 132|false|132|276.3|261.3|15.3|25.3|12.7|200.3|13.1|4.36|10|134|38|1.55|11.7|22500|7530|11.6|6.69|1630|576|1870|878|0.85|10.3|1.19|319|168|40
254 x 254 x 107|254 x 254|x 107|false|107.1|266.7|258.8|12.8|20.5|12.7|200.3|15.6|5.38|8|134|34|1.52|14.2|17500|5930|11.3|6.59|1310|458|1480|697|0.848|12.4|0.898|172|136|41
254 x 254 x 89|254 x 254|x 89|false|88.9|260.3|256.3|10.3|17.3|12.7|200.3|19.4|6.38|7|134|30|1.5|16.9|14300|4860|11.2|6.55|1100|379|1220|575|0.85|14.5|0.717|102|113|42
254 x 254 x 73|254 x 254|x 73|false|73.1|254.1|254.6|8.6|14.2|12.7|200.3|23.3|7.77|6|134|28|1.49|20.4|11400|3910|11.1|6.48|898|307|992|465|0.849|17.2|0.562|57.6|93.1|43
203 x 203 x 127|203 x 203|x 127|true|127.5|241.4|213.9|18.1|30.1|10.2|160.8|8.88|2.91|11|108|42|1.28|10|15400|4920|9.75|5.5|1280|460|1520|704|0.856|7.36|0.549|427|162|44
203 x 203 x 113|203 x 203|x 113|true|113.5|235|212.1|16.3|26.9|10.2|160.8|9.87|3.26|10|108|38|1.27|11.2|13300|4290|9.59|5.45|1130|404|1330|618|0.852|8.11|0.464|305|145|45
203 x 203 x 100|203 x 203|x 100|true|99.6|228.6|210.3|14.5|23.7|10.2|160.8|11.1|3.7|9|108|34|1.25|12.6|11300|3680|9.44|5.39|988|350|1150|534|0.852|9.01|0.386|210|127|46
203 x 203 x 86|203 x 203|x 86|false|86.1|222.2|209.1|12.7|20.5|10.2|160.8|12.7|4.29|8|110|32|1.24|14.4|9450|3130|9.28|5.34|850|299|977|456|0.849|10.2|0.318|137|110|47
203 x 203 x 71|203 x 203|x 71|false|71|215.8|206.4|10|17.3|10.2|160.8|16.1|5.09|7|110|28|1.22|17.2|7620|2540|9.18|5.3|706|246|799|374|0.853|11.9|0.25|80.2|90.4|48
203 x 203 x 60|203 x 203|x 60|false|60|209.6|205.8|9.4|14.2|10.2|160.8|17.1|6.2|7|110|26|1.21|20.2|6120|2060|8.96|5.2|584|201|656|305|0.846|14.1|0.197|47.2|76.4|49
203 x 203 x 52|203 x 203|x 52|false|52|206.2|204.3|7.9|12.5|10.2|160.8|20.4|7.04|6|110|24|1.2|23.1|5260|1780|8.91|5.18|510|174|567|264|0.847|15.8|0.167|31.8|66.3|50
203 x 203 x 46|203 x 203|x 46|false|46.1|203.2|203.6|7.2|11|10.2|160.8|22.3|8|6|110|22|1.19|25.8|4570|1550|8.82|5.13|450|152|497|231|0.847|17.7|0.143|22.2|58.7|51
152 x 152 x 51|152 x 152|x 51|true|51.2|170.2|157.4|11|15.7|7.6|123.6|11.2|4.18|8|84|24|0.935|18.3|3230|1020|7.04|3.96|379|130|438|199|0.848|10.1|0.061|48.8|65.2|52
152 x 152 x 44|152 x 152|x 44|true|44|166|155.9|9.5|13.6|7.6|123.6|13|4.82|7|84|22|0.924|21|2700|860|6.94|3.92|326|110|372|169|0.847|11.5|0.05|31.7|56.1|53
152 x 152 x 37|152 x 152|x 37|false|37|161.8|154.4|8|11.5|7.6|123.6|15.5|5.7|6|84|20|0.912|24.6|2210|706|6.85|3.87|273|91.5|309|140|0.848|13.3|0.04|19.2|47.1|54
152 x 152 x 30|152 x 152|x 30|false|30|157.6|152.9|6.5|9.4|7.6|123.6|19|6.98|5|84|18|0.901|30|1750|560|6.76|3.83|222|73.3|248|112|0.847|16.1|0.031|10.5|38.3|55
152 x 152 x 23|152 x 152|x 23|false|23|152.4|152.2|5.8|6.8|7.6|123.6|21.3|9.65|5|84|16|0.889|38.7|1250|400|6.54|3.7|164|52.6|182|80.1|0.842|20.6|0.021|4.63|29.2|56
`.trim();

  const rows = rowText.split(/\r?\n/).map((line) =>
    line.split("|").map((value, index) => {
      if (properties[index].type === "number") return Number(value);
      if (properties[index].type === "boolean") return value === "true";
      return value;
    })
  );

  const sections = rows.map((row) =>
    Object.fromEntries(properties.map((property, index) => [property.key, row[index]]))
  );

  const byDesignation = Object.fromEntries(
    sections.map((section) => [section.section_designation, section])
  );

  const dataset = { metadata, properties, rows, sections, byDesignation };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = dataset;
  }
  globalThis.UNIVERSAL_COLUMNS_DATASET = dataset;
})();
