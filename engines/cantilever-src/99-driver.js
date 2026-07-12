/* ===========================================================================
   99. RACK BRIDGE DRIVER
   Headless per-arm cantilever design API exposed to the rack. Each arm is
   treated as a built-in (fixed-root) cantilever carrying one point load at a
   distance from the root; the validated EC3 / BS5950 engine above returns the
   member utilisations, and armCapacity() inverts them (linear in load) to the
   maximum characteristic point load the member can carry.
   =========================================================================== */
function _cd_norm(s){ return String(s==null?'':s).toLowerCase().replace(/×/g,'x').replace(/\s+/g,''); }
function _cd_buildNormMap(list){ const m={}; list.forEach(function(s){ m[_cd_norm(s.key)]=s.key; }); return m; }
var _CD_NMAPS=null;
function _cd_normMaps(){
  if(_CD_NMAPS) return _CD_NMAPS;
  _CD_NMAPS={ ub:_cd_buildNormMap(UB), uc:_cd_buildNormMap(UC), pfc:_cd_buildNormMap(PFC),
              rhs:_cd_buildNormMap(RHS), shsHF:_cd_buildNormMap(SHS_HF), shsCF:_cd_buildNormMap(SHS_CF) };
  return _CD_NMAPS;
}

/* Map a rack section (group + Blue Book designation) to this engine's family/key. */
function resolveSection(group, designation){
  const g=String(group||'').toUpperCase().replace(/[^A-Z]/g,'');
  const n=_cd_norm(designation), M=_cd_normMaps();
  if(g==='UB'  && M.ub[n])  return {family:'ub',  keyField:'ubKey',      key:M.ub[n]};
  if(g==='UC'  && M.uc[n])  return {family:'uc',  keyField:'ucKey',      key:M.uc[n]};
  if(g==='PFC' && M.pfc[n]) return {family:'pfc', keyField:'sectionKey', key:M.pfc[n]};
  if(g==='RHS' && M.rhs[n]) return {family:'rhs', keyField:'rhsKey',     key:M.rhs[n]};
  if(g==='SHS' && M.shsHF[n]) return {family:'shs', keyField:'shsKey', key:M.shsHF[n], shsType:'HF'};
  if((g==='SHSCF'||g==='SHSCOLDFORMED') && M.shsCF[n]) return {family:'shs', keyField:'shsKey', key:M.shsCF[n], shsType:'CF'};
  return null;
}

/* Section depth D (mm) for a resolved section, for top/bottom-flange load height. */
function sectionDepth(p){
  const map = p.family==='ub'?UBmap : p.family==='uc'?UCmap : p.family==='pfc'?PFCmap
            : p.family==='rhs'?RHSmap : (p.shsType==='CF'?SHS_CFmap:SHS_HFmap);
  const s = map && map[p.key];
  return s ? (+s.D||0) : 0;
}

function _cd_setState(p){
  S=JSON.parse(JSON.stringify(DEMO));
  S.code = (p.code==='BS5950'||p.code==='BS')?'BS5950':'EC3';
  S.family=p.family;
  if(p.shsType) S.shsType=p.shsType;
  S[p.keyField]=p.key;
  S.grade=p.grade||'S275'; S.py=(p.py!=null && isFinite(+p.py))?+p.py:null; S.anet=null;
  S.L=+p.L; S.fixedEnd='left'; applyCantileverSupport();
  S.axial=0; S.leFactor=1.0; S.destab=false;
  S.divisor=+p.divisor||180; S.E=210000;
  S.restraint = p.restraint || 'ltb';        // 'full' = compression flange restrained (LTB skipped)
  S.eccOn=false; S.za=+p.za||0; S.rootWarp=p.rootWarp||'free';
  S.mLTo=null; S.mxo=null; S.C1o=null; S.robX=null; S.robY=null; S.Ke=null;
  S.ltbRestraints=[]; S.fixedLateral=true; S.zj=0; S.Cmzo=null;
  S.loads=[{type:'point', pos:+p.pos, P:+p.P, case:'Q', e:0, zg:(+p.za||0)}];
  S.combos=[
    {id:'c1', label:'ULS: 1.35G + 1.5Q', factors:{G:1.35,Q:1.5,W:0,E:0}, sls:false, on:true},
    {id:'s2', label:'SLS: G + Q',         factors:{G:1.0, Q:1.0,W:0,E:0}, sls:true,  on:true},
  ];
}

/* One design pass at the given characteristic point load p.P (kN). */
function designOnce(p){
  try{
    _cd_setState(p);
    syncSelfWeightLoads();
    const a=analyse();
    const r=checks(a);
    return {ok:true, pass:!!r.pass,
            utils:(r.utils||[]).map(function(u){ return {name:u.name, val:+u.val}; }),
            unsupported:(r.unsupported||[]).slice(),
            Mb:(r.Mb!=null?r.Mb:(r.MbRd!=null?r.MbRd:null))};
  }catch(e){ return {ok:false, reason:(e&&e.message)?e.message:String(e)}; }
}

/* Maximum characteristic point load (kN) the arm can carry at p.pos, from the
   governing member check. Two passes (P=0, P=Pref) invert the linear utilisations. */
function armCapacity(p){
  const ref=Math.max(1, +p.Pref||10);
  const r0=designOnce(Object.assign({}, p, {P:0}));
  const r1=designOnce(Object.assign({}, p, {P:ref}));
  if(!r0.ok) return {ok:false, reason:r0.reason};
  if(!r1.ok) return {ok:false, reason:r1.reason};
  const unsupported = (r1.unsupported && r1.unsupported.length) ? r1.unsupported.slice() : [];
  let cap=Infinity, gov=null;
  r1.utils.forEach(function(u,i){
    const u0 = r0.utils[i] ? r0.utils[i].val : 0;
    const slope=(u.val-u0)/ref;
    if(slope>1e-12){ const c=Math.max(0,(1-u0)/slope); if(c<cap){ cap=c; gov=u.name; } }
  });
  return {ok:true, capacity:cap, governing:(isFinite(cap)?gov:'(load-independent)'),
          unsupported:unsupported, refUtil:r1.utils, pass0:r0.pass};
}

globalThis.CANTILEVER_DESIGN = {
  resolveSection: resolveSection,
  sectionDepth: sectionDepth,
  designOnce: designOnce,
  armCapacity: armCapacity
};
