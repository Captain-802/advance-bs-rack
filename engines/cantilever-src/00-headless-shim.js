/* ===========================================================================
   0. HEADLESS SHIM  (rack bundle)
   The DOM-free parts of 03-state-ui.js that the compute path needs, with all
   render/sync/DOM functions and the getElementById `$` helper removed.
   =========================================================================== */
const CASE_LABELS={G:'Dead (G)',Q:'Imposed (Q)',W:'Wind (W)',E:'Other (E)'};
const DEFAULT_COMBOS=[
  {id:'c1', label:'ULS: 1.35G + 1.5Q (Eq 6.10)',          factors:{G:1.35,Q:1.5,W:0,E:0},   sls:false, on:true},
  {id:'s2', label:'SLS: G + Q (total load)',               factors:{G:1.0,Q:1.0,W:0,E:0},    sls:true,  on:true},
];
const DEMO={
  code:"EC3",
  family:"ub", sectionKey:"180x75x20", shsType:"HF", shsKey:"150x150x6.3", ubKey:"457 x 191 x 82", ucKey:"203 x 203 x 60", rhsKey:"200 x 100 x 8.0",
  grade:"S275", py:null, anet:null,
  L:3.0,
  fixedEnd:'left',
  supports:[{pos:0,type:'fixed'}],
  loads:[{type:'point',pos:3.0,P:10,case:'Q',e:0,zg:0}],
  combos:JSON.parse(JSON.stringify(DEFAULT_COMBOS)),
  axial:0, leFactor:1.0, destab:false, mLTo:null, mxo:null, C1o:null,
  divisor:180, E:210000, Ke:null, robX:null, robY:null,
  restraint:'ltb',
  eccOn:false, za:0, rootWarp:'free'
};
let S=JSON.parse(JSON.stringify(DEMO));

function fmtMM(v){
  if(!isFinite(v)) return " ";
  const s=(Math.abs(v)<5e-7?0:v).toFixed(1);
  return s.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
}
function loadHeightReference(sec){
  const depth=+sec.D || 0;
  const wallOrFlange=+sec.tf || 0;
  return {
    topSurface: depth/2,
    topLine: Math.max(depth/2 - wallOrFlange/2, 0),
    bottomSurface: -depth/2
  };
}
function loadHeightReferenceText(sec){
  const ref=loadHeightReference(sec);
  return "Refs from shear centre: top +" + fmtMM(ref.topSurface) + " mm; bottom " +
    fmtMM(ref.bottomSurface) + " mm. Positive z<sub>g</sub> = destabilising.";
}
function loadHeightPerLoadOn(){
  return S.code==='EC3' && (S.restraint||'full')!=='full';
}
function loadZgValue(ld){
  return S.eccOn && ld && ld.zg!=null && isFinite(+ld.zg) ? +ld.zg : (+S.za||0);
}
function applyCantileverSupport(){
  if(S.fixedEnd!=='left' && S.fixedEnd!=='right') S.fixedEnd='left';
  const root = (S.fixedEnd==='right') ? +(+S.L).toFixed(6) : 0;
  S.supports=[{pos:root,type:'fixed'}];
}
