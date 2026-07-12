/* ===========================================================================
   3. STATE + INPUT UI
   =========================================================================== */
const CASE_LABELS={G:'Dead (G)',Q:'Imposed (Q)',W:'Wind (W)',E:'Other (E)'};
const DEFAULT_COMBOS=[
  {id:'c1', label:'ULS: 1.35G + 1.5Q (Eq 6.10)',          factors:{G:1.35,Q:1.5,W:0,E:0},   sls:false, on:true},
  {id:'c2', label:'ULS: 1.35G + 1.5W',                     factors:{G:1.35,Q:0,W:1.5,E:0},   sls:false, on:false},
  {id:'c3', label:'ULS: 1.35G + 1.5Q + 0.75W',             factors:{G:1.35,Q:1.5,W:0.75,E:0},sls:false, on:false},
  {id:'s1', label:'SLS: Variable actions only (NA 2.23)',  factors:{G:0,  Q:1.0,W:0,E:0},    sls:true,  on:true},
  {id:'s2', label:'SLS: G + Q (total load)',               factors:{G:1.0,Q:1.0,W:0,E:0},    sls:true,  on:false},
];
const DEMO={
  code:"EC3",
  family:"ub", sectionKey:"180x75x20", shsType:"HF", shsKey:"150x150x6.3", ubKey:"457 x 191 x 82", ucKey:"203 x 203 x 60", rhsKey:"200 x 100 x 8.0",
  grade:"S275", py:null, anet:null,
  L:3.0,
  fixedEnd:'left',
  supports:[{pos:0,type:'fixed'}],
  loads:[{type:'udl',x1:0,x2:3.0,w:6,case:'Q',e:0,zg:0},{type:'point',pos:3.0,P:10,case:'Q',e:0,zg:0}],
  combos:JSON.parse(JSON.stringify(DEFAULT_COMBOS)),
  axial:0, leFactor:1.0, destab:false, mLTo:null, mxo:null, C1o:null,
  divisor:180, E:210000, Ke:null, robX:null, robY:null,
  restraint:'ltb',
  eccOn:false, za:0, rootWarp:'free'
};
let S=JSON.parse(JSON.stringify(DEMO));
const $=id=>document.getElementById(id);

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
function syncLoadHeightHint(sec, show){
  const el=$("zaHint");
  if(!el) return;
  el.innerHTML=loadHeightReferenceText(sec);
  el.style.display=show ? '' : 'none';
}

function applyCantileverSupport(){
  // A cantilever has exactly ONE built-in (fixed) support at the chosen root.
  // Root at x = L when the right end is fixed, otherwise at x = 0. The opposite
  // end is free. This is the only support layout this tool produces.
  if(S.fixedEnd!=='left' && S.fixedEnd!=='right') S.fixedEnd='left';
  const root = (S.fixedEnd==='right') ? +(+S.L).toFixed(6) : 0;
  S.supports=[{pos:root,type:'fixed'}];
}
function renderSupportList(){
  const c=$("supportList"); if(!c) return;
  applyCantileverSupport();
  const root=(S.fixedEnd==='right') ? +(+S.L).toFixed(3) : 0;
  const tip =(S.fixedEnd==='right') ? 0 : +(+S.L).toFixed(3);
  c.innerHTML=`<div class="row"><div class="rowhead"><b style="font-size:12px">Built-in cantilever support</b></div>
    <div style="font-size:12px;color:#374151;padding:2px 0;line-height:1.5">
      Fixed (vertical + rotational restraint) at <b>x = ${root} m</b>.<br>
      Free end at <b>x = ${tip} m</b> &nbsp;&bull;&nbsp; length L = ${+(+S.L).toFixed(3)} m.
    </div></div>`;
}
function loadFields(ld,i){
  const f=(label,key,val)=>`<div class="fld"><span>${label}</span><input type="number" step="0.01" value="${val}" data-ld="${key}" data-i="${i}"></div>`;
  const caseSel=`<div class="fld"><span>Case</span><select data-ld="case" data-i="${i}">${Object.entries(CASE_LABELS).map(([k,v])=>`<option value="${k}"${ld.case===k?' selected':''}>${v}</option>`).join("")}</select></div>`;
  if(ld.type==='point') return `<div class="grid3">${f("Position, m","pos",ld.pos)}${f("P, kN (?)","P",ld.P)}${caseSel}</div>`;
  if(ld.type==='moment') return `<div class="grid3">${f("Position, m","pos",ld.pos)}${f("M, kN m (?)","M",ld.M)}${caseSel}</div>`;
  if(ld.type==='udl') return `<div class="grid2">${f("Start x1, m","x1",ld.x1)}${f("End x2, m","x2",ld.x2)}</div><div class="grid2" style="margin-top:6px">${f("w, kN/m (?)","w",ld.w)}${caseSel}</div>`;
  if(ld.type==='trap') return `<div class="grid2">${f("Start x1, m","x1",ld.x1)}${f("End x2, m","x2",ld.x2)}</div><div class="grid3" style="margin-top:6px">${f("w1, kN/m","w1",ld.w1)}${f("w2, kN/m","w2",ld.w2)}${caseSel}</div>`;
  return "";
}
function loadOffsetFields(ld,i){
  if(!S.eccOn || ld.type==='moment' || ld.isSelfWeight) return '';
  const eVal = ld.e??0;
  const zgFld = loadHeightPerLoadOn()
    ? `<div class="fld"><span>z<sub>g</sub>, mm (0 = shear centre, + above)</span><input type="number" step="1" value="${loadZgValue(ld)}" data-ld="zg" data-i="${i}"></div>`
    : `<div></div>`;
  return `<div class="grid2" style="margin-top:6px"><div class="fld"><span>e, mm (shear-centre offset; 0 = through shear centre)</span><input type="number" step="1" value="${eVal}" data-ld="e" data-i="${i}"></div>${zgFld}</div>`;
}
function renderLoadList(){
  const c=$("loadList"); c.innerHTML="";
  if(S.loads.length===0) c.innerHTML='<div style="font-size:11px;color:#6b7280;margin:2px 0 6px;">No loads yet &mdash; add one below.</div>';
  S.loads.forEach((ld,i)=>{
    const row=document.createElement("div"); row.className="row";
    const types={point:"Point load",udl:"UDL / partial UDL",trap:"Trapezoidal",moment:"Applied moment"};
    const tag = ld.isSelfWeight? ` <span style="font-size:10px;font-weight:700;color:#7a4;border:1px solid #bcd9a0;background:#f2f8ec;border-radius:4px;padding:1px 5px;">self-weight</span>` : '';
    row.innerHTML=`<div class="rowhead">
      <select data-lt="${i}">${Object.entries(types).map(([k,v])=>`<option value="${k}"${ld.type===k?' selected':''}>${v}</option>`).join("")}</select>${tag}
      <button class="del" data-li="${i}">remove</button></div>${loadFields(ld,i)}${loadOffsetFields(ld,i)}`;
    c.appendChild(row);
  });
  c.querySelectorAll("[data-ld]").forEach(el=>el.addEventListener(el.tagName==='SELECT'?"change":"input",e=>{
    const i=+e.target.dataset.i,k=e.target.dataset.ld;
    S.loads[i][k]= k==='case'? e.target.value : (parseFloat(e.target.value)||0);
    recompute();
  }));
  c.querySelectorAll("[data-lt]").forEach(sel=>sel.addEventListener("change",e=>{
    const i=+e.target.dataset.lt, t=e.target.value, L=S.L, cs=S.loads[i].case||'Q';
    const old=S.loads[i];
    const base={point:{type:'point',pos:+(L/2).toFixed(3),P:10,case:cs},
                udl:{type:'udl',x1:0,x2:L,w:9,case:cs},
                trap:{type:'trap',x1:0,x2:L,w1:0,w2:12,case:cs},
                moment:{type:'moment',pos:+(L/2).toFixed(3),M:10,case:cs}}[t];
    if(t!=='moment'){ base.e=old.e??0; base.zg=old.zg??(+S.za||0); }
    S.loads[i]=base; renderLoadList(); recompute();
  }));
  c.querySelectorAll(".del").forEach(b=>b.addEventListener("click",e=>{
    S.loads.splice(+e.target.dataset.li,1); renderLoadList(); recompute(); }));
}
function renderComboList(){
  const c=$("comboList"); c.innerHTML="";
  S.combos.forEach((combo,i)=>{
    const row=document.createElement("div"); row.className="row";
    const cases=['G','Q','W','E'];
    const factorFlds=cases.map(cs=>`<div class="fld"><span>${cs}</span><input type="number" step="0.05" value="${combo.factors[cs]??0}" data-cf="${cs}" data-ci="${i}"></div>`).join("");
    row.innerHTML=`<div class="rowhead">
      <label style="display:flex;align-items:center;gap:6px;flex:1;font-size:12px;font-weight:700;margin:0">
        <input type="checkbox" style="width:auto" data-con="${i}" ${combo.on?'checked':''}>
        <input type="text" data-clabel="${i}" value="${combo.label}" style="border:none;background:transparent;font-weight:700;padding:2px 0;width:100%">
      </label>
      <span style="font-size:10px;font-weight:700;color:${combo.sls?'#166534':'#1e40af'};border:1px solid ${combo.sls?'#bcd9a0':'#b9c6e6'};background:${combo.sls?'#f2f8ec':'#eef2fb'};border-radius:4px;padding:1px 5px;white-space:nowrap">${combo.sls?'SLS':'ULS'}</span>
      <button class="del" data-cdel="${i}">remove</button></div>
      <div class="grid3" style="grid-template-columns:repeat(4,1fr)">${factorFlds}</div>`;
    c.appendChild(row);
  });
  c.querySelectorAll("[data-con]").forEach(el=>el.addEventListener("change",e=>{
    S.combos[+e.target.dataset.con].on=e.target.checked; recompute(); }));
  c.querySelectorAll("[data-clabel]").forEach(el=>el.addEventListener("input",e=>{
    S.combos[+e.target.dataset.clabel].label=e.target.value; }));
  c.querySelectorAll("[data-cf]").forEach(el=>el.addEventListener("input",e=>{
    const i=+e.target.dataset.ci, cs=e.target.dataset.cf;
    S.combos[i].factors[cs]=parseFloat(e.target.value)||0; recompute(); }));
  c.querySelectorAll("[data-cdel]").forEach(b=>b.addEventListener("click",e=>{
    S.combos.splice(+e.target.dataset.cdel,1); renderComboList(); recompute(); }));
}
function syncInputs(){
  const pfcSel=$("pfcSelect"); pfcSel.innerHTML="";
  PFC.forEach(s=>{ const o=document.createElement("option"); o.value=s.key;
    o.textContent=`${s.key.replace(/x/g,'   ')} PFC  (${s.mass} kg/m)`; pfcSel.appendChild(o); });
  pfcSel.value=S.sectionKey;

  const shsSel=$("shsSelect"); shsSel.innerHTML="";
  const shsArr = S.shsType==='CF'? SHS_CF : SHS_HF;
  shsArr.forEach(s=>{ const o=document.createElement("option"); o.value=s.key;
    o.textContent=`${s.key.replace(/x/g,'   ')} SHS  (${s.mass} kg/m)`; shsSel.appendChild(o); });
  if(!(S.shsKey in (S.shsType==='CF'? SHS_CFmap : SHS_HFmap))) S.shsKey = shsArr[0].key;
  shsSel.value=S.shsKey;

  const ubSel=$("ubSelect"); ubSel.innerHTML="";
  UB.forEach(s=>{ const o=document.createElement("option"); o.value=s.key;
    o.textContent=`${s.key} UB  (${s.mass} kg/m)`; ubSel.appendChild(o); });
  if(!(S.ubKey in UBmap)) S.ubKey = UB[0].key;
  ubSel.value=S.ubKey;

  const ucSel=$("ucSelect"); ucSel.innerHTML="";
  UC.forEach(s=>{ const o=document.createElement("option"); o.value=s.key;
    o.textContent=`${s.key} UC  (${s.mass} kg/m)`; ucSel.appendChild(o); });
  if(!(S.ucKey in UCmap)) S.ucKey = UC[0].key;
  ucSel.value=S.ucKey;

  const rhsSel=$("rhsSelect"); rhsSel.innerHTML="";
  RHS.forEach(s=>{ const o=document.createElement("option"); o.value=s.key;
    o.textContent=`${s.key} RHS  (${s.mass} kg/m)`; rhsSel.appendChild(o); });
  if(!(S.rhsKey in RHSmap)) S.rhsKey = RHS[0].key;
  rhsSel.value=S.rhsKey;

  $("code").value=S.code;
  $("family").value=S.family;
  $("shsType").value=S.shsType;
  $("pfcRow").style.display = S.family==='pfc'? '' : 'none';
  $("shsRow").style.display = S.family==='shs'? '' : 'none';
  $("shsTypeRow").style.display = S.family==='shs'? '' : 'none';
  $("ubRow").style.display = S.family==='ub'? '' : 'none';
  $("ucRow").style.display = S.family==='uc'? '' : 'none';
  $("rhsRow").style.display = S.family==='rhs'? '' : 'none';
  $("restraint").value = S.restraint||'full';
  $("eccOn").checked = !!S.eccOn;
  const sciMode = S.code==='EC3' && (S.restraint||'full')==='full';
  const sec=activeSection();
  $("restraintRow").style.display = S.code==='EC3'? '' : 'none';
  $("bsFactorsRow").style.display = S.code==='EC3'? 'none' : '';
  $("ec3FactorsRow").style.display = (S.code==='EC3' && !sciMode)? '' : 'none';
  $("leRow").style.display = sciMode? 'none' : '';
  $("za").value = S.za||0;
  $("rootWarp").value = S.rootWarp||'free';
  $("zaRow").style.display = (S.code==='EC3' && !sciMode)? '' : 'none';
  syncLoadHeightHint(sec, S.code==='EC3' && !sciMode);
  $("warpRow").style.display = (S.code==='EC3' && !sciMode)? '' : 'none';
  $("destabRow").style.display = sciMode? 'none' : '';
  $("robRow").style.display = S.code==='EC3'? 'none' : '';

  $("grade").value=S.grade;
  $("py").value = S.py!=null? S.py : pyFromGrade(S.grade,sec.tf);
  $("anet").value = S.anet!=null? S.anet : "";
  $("length").value=S.L;
  { const fe=$("fixedEnd"); if(fe) fe.value = (S.fixedEnd==='right')?'right':'left'; }
  $("axial").value=S.axial; $("leFactor").value=S.leFactor;
  $("destab").checked=S.destab; $("mLTo").value=S.mLTo??""; $("mxo").value=S.mxo??"";
  $("C1o").value=S.C1o??"";
  $("divisor").value=S.divisor; $("E").value=S.E; $("Ke").value=S.Ke??"";
  const autoRob=defaultRobertson(S.family,sec.boxType,sec.tf);
  $("robertsonX").value = S.robX!=null? S.robX : autoRob.x;
  $("robertsonY").value = S.robY!=null? S.robY : autoRob.y;
  renderSupportList(); renderLoadList(); renderComboList();
}
