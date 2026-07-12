/* ===========================================================================
   2. SECTION DATA COMMON HELPERS
   Family section tables live in js/sections/*-section-data.js.
   This file normalises the selected family data and provides shared helpers.
   =========================================================================== */
// Normalises the active section (PFC, SHS, or UB) to a single shape so the
// solver/checks/report code can stay section-agnostic wherever the physics
// genuinely is agnostic, and branch only where BS 5950 itself branches
// (classification limits, shear area, LTB applicability, strut curve).
// SCI P385 Appendix A torsional properties (Tables A.1, A.2, A.3, A.7, A.8).
// Open sections: [IT cm4, a m, Iw dm6, Wn0 cm2, Sw1 cm4]; PFC additionally
// [.., Wn2 cm2, Sw1, Sw2, Sw3 cm4, e0 mm, esc mm]; hollow: [IT cm4, Wt cm3].
// Note: P385 IT for open sections includes the Appendix B junction correction,
// so it can differ slightly from the Blue Book value stored in the main tables.
function tp385For(family,key){
  const m=family==='ub'?TP385_UB:family==='uc'?TP385_UC:family==='pfc'?TP385_PFC:family==='shs'?TP385_SHS:family==='rhs'?TP385_RHS:null;
  const r=m&&m[key]; if(!r) return null;
  if(family==='pfc') return {IT:r[0],a:r[1],Iw:r[2],Wn0:r[3],Wn2:r[4],Sw1:r[5],Sw2:r[6],Sw3:r[7],e0:r[8],esc:r[9]};
  if(family==='shs'||family==='rhs') return {IT:r[0],Wt:r[1]};
  return {IT:r[0],a:r[1],Iw:r[2],Wn0:r[3],Sw1:r[4]};
}
function activeSection(){ const s=activeSectionBase(); s.tp=tp385For(S.family,s.key); return s; }
function activeSectionBase(){
  if(S.family==='shs'){
    const map = S.shsType==='CF'? SHS_CFmap : SHS_HFmap;
    const s = map[S.shsKey] || Object.values(map)[0];
    return {key:s.key, mass:s.mass, D:s.D, B:s.D, tw:s.t, tf:s.t, r:0, d:s.dt*s.t,
      bT:s.dt, dt:s.dt, Ix:s.I, Iy:s.I, rx:s.r, ry:s.r, Zx:s.Z, Zy:s.Z, Sx:s.S, Sy:s.S,
      u:null, x:null, J:s.J, A:s.A, isBox:true, boxType:S.shsType, kind:'box'};
  }
  if(S.family==='rhs'){
    const s = RHSmap[S.rhsKey] || RHS[0];
    return {key:s.key, mass:s.mass, D:s.D, B:s.B, tw:s.t, tf:s.t, r:0, d:s.dt*s.t,
      bT:s.bT, dt:s.dt, Ix:s.Ix, Iy:s.Iy, rx:s.rx, ry:s.ry, Zx:s.Zx, Zy:s.Zy, Sx:s.Sx, Sy:s.Sy,
      u:null, x:null, J:s.J, A:s.A, isBox:true, boxType:'HF', kind:'box'};
  }
  if(S.family==='ub'){
    const s = UBmap[S.ubKey] || UB[0];
    return Object.assign({isBox:false, boxType:null, kind:'I'}, s);
  }
  if(S.family==='uc'){
    const s = UCmap[S.ucKey] || UC[0];
    return Object.assign({isBox:false, boxType:null, kind:'I'}, s);
  }
  const s = PFCmap[S.sectionKey] || PFC[0];
  return Object.assign({isBox:false, boxType:null, kind:'channel'}, s);
}


function pyFromGrade(grade,t){
  const T=[ [16,40,63,80,100,150],
    {S275:[275,265,255,245,235,225],S355:[355,345,335,325,315,295],S460:[460,440,430,410,400,400]} ];
  const bands=T[0], vals=T[1][grade]||T[1].S275;
  for(let i=0;i<bands.length;i++) if(t<=bands[i]) return vals[i];
  return vals[vals.length-1];
}
const KeByGrade={S275:1.2,S355:1.1,S460:1.0};
function fuFromGrade(grade){ return ({S275:410,S355:470,S460:540})[grade]||410; }
// ---- SCI P385 Appendix C closed-form torsion solution, fork-fork ends ----
// phi, phi', phi'', phi''' for: Case 3 (point torque T at alpha*L), Case 4
// (uniform torque, total T), Case 10 (linear torque 0 -> 2T/L, total T; mirror
// for descending). All hyperbolic terms evaluated in exponential-ratio form to
// avoid catastrophic cancellation at large L/a (P385 Section numerical note).
// Units: L,a in mm; T in N.mm (TOTAL applied torque per P385 p.70 convention);
// GIt in N.mm2. Returns grids over x.
function p385Solve(L,aa,GIt,tqs,nGrid){
  const X=L/aa;
  const e2=u=>Math.exp(-2*Math.max(u,0));
  const den=1-e2(X);
  const ff=(u,v)=>Math.exp(u+v-X)*(1-e2(u))*(1-e2(v))/(2*den);   // sinh(u)sinh(v)/sinh(X)
  const fg=(u,v)=>Math.exp(u+v-X)*(1-e2(u))*(1+e2(v))/(2*den);   // sinh(u)cosh(v)/sinh(X)
  const shR=u=>Math.exp(u-X)*(1-e2(u))/den;                       // sinh(u)/sinh(X)
  const chR=u=>Math.exp(u-X)*(1+e2(u))/den;                       // cosh(u)/sinh(X)
  const H=X/2, dH=1+e2(H);
  const c4=w=>{ const q=Math.abs(H-w); return Math.exp(q-H)*(1+e2(q))/dH; }           // cosh(H-w)/cosh(H)
  const s4=w=>{ const q=Math.abs(H-w); return Math.sign(H-w)*Math.exp(q-H)*(1-e2(q))/dH; } // sinh(H-w)/cosh(H)
  // grid: even spacing + torque application points
  const set=new Set(); const n=nGrid||241;
  for(let i=0;i<=n;i++) set.add(+(L*i/n).toFixed(4));
  tqs.forEach(t=>{ if(t.kind==='point'){ const p=t.alpha*L; [p-0.01,p,p+0.01].forEach(v=>{ if(v>=0&&v<=L) set.add(+v.toFixed(4)); }); } });
  const xs=[...set].sort((p,q)=>p-q);
  const phi=xs.map(()=>0), p1=xs.map(()=>0), p2=xs.map(()=>0), p3=xs.map(()=>0);
  const addCase3=(alpha,T)=>{
    xs.forEach((x,i)=>{
      let al=alpha, xx=x, sgn=1;
      if(x>alpha*L+1e-9){ al=1-alpha; xx=L-x; sgn=-1; }   // mirror for the far segment
      const u1=(1-al)*X, v=xx/aa;
      phi[i]+= (T*aa/GIt)*((1-al)*v - ff(u1,v));
      p1[i] += sgn*(T/GIt)*((1-al) - fg(u1,v));
      p2[i] += -(T/(GIt*aa))*ff(u1,v);
      p3[i] += -sgn*(T/(GIt*aa*aa))*fg(u1,v);
    });
  };
  const addCase4=(T)=>{
    const t=T/L;
    xs.forEach((x,i)=>{
      const w=x/aa;
      phi[i]+= (t*aa*aa/GIt)*( x*(L-x)/(2*aa*aa) + c4(w) - 1 );
      p1[i] += (t*aa/GIt)*( (L-2*x)/(2*aa) - s4(w) );
      p2[i] += (t/GIt)*( c4(w) - 1 );
      p3[i] += -(t/(GIt*aa))*s4(w);
    });
  };
  const addCase10=(T,mirror)=>{
    xs.forEach((x,i)=>{
      const xx=mirror? L-x : x, sgn=mirror? -1 : 1, v=xx/aa;
      phi[i]+= (2*T/GIt)*( xx/6 - xx*aa*aa/(L*L) + (aa*aa/L)*shR(v) - xx*xx*xx/(6*L*L) );
      p1[i] += sgn*(2*T/GIt)*( 1/6 - aa*aa/(L*L) + (aa/L)*chR(v) - xx*xx/(2*L*L) );
      p2[i] += (2*T/GIt)*( shR(v)/L - xx/(L*L) );
      p3[i] += sgn*(2*T/GIt)*( chR(v)/(aa*L) - 1/(L*L) );
    });
  };
  tqs.forEach(t=>{
    if(t.kind==='point') addCase3(Math.min(Math.max(t.alpha,1e-6),1-1e-6),t.T);
    else if(t.kind==='ud') addCase4(t.T);
    else if(t.kind==='lin') addCase10(t.T,!!t.mirror);
  });
  return {xs,phi,p1,p2,p3,X};
}

function ctBoxEN10210(sec){
  // Torsional constants for a hot-finished hollow section per EN 10210-2 Annex A
  // (mean corner radius 1.25t). Verified against SCI P363 Blue Book It and Ct.
  const t=sec.tf, h=sec.D, b=sec.B, Rc=1.25*t;
  const hp=2*((h-t)+(b-t))-2*Rc*(4-Math.PI);
  const Ah=(h-t)*(b-t)-Rc*Rc*(4-Math.PI);
  const K=2*Ah*t/hp;
  const It=t*t*t*hp/3+2*K*Ah;
  return {Ct:It/(t+K/t), It:It};
}
function defaultRobertson(family,boxType,tf){
  // BS 5950-1:2000 Table 23 (allocation of strut curve) -> Table 24(a..d) Robertson
  // constants a=2.0/3.5/5.5/8.0 for curves a/b/c/d respectively.
  if(family==='shs') return boxType==='CF'? {x:5.5,y:5.5} : {x:2.0,y:2.0}; // HF box: curve a both axes; CF box: curve c both axes
  if(family==='rhs') return {x:2.0,y:2.0}; // hot-finished box section -> curve a, both axes (Table 23)
  if(family==='ub'){
    // Rolled I-section: x-x/y-y = a/b up to 40mm flange, b/c over 40mm.
    return (tf||0)<=40 ? {x:2.0,y:3.5} : {x:3.5,y:5.5};
  }
  if(family==='uc'){
    // Rolled H-section: x-x/y-y = b/c up to 40mm flange, c/d over 40mm   one
    // curve lower than a rolled I-section at the same thickness (Table 23).
    return (tf||0)<=40 ? {x:3.5,y:5.5} : {x:5.5,y:8.0};
  }
  // PFC (channel): Table 23 directs channels to Table 25 (angle/channel/T-section
  // struts), a distinct method from the generic a/b/c/d curves used here.
  // Channel compression is blocked from PASS unless verified Table 25/Blue Book
  // data is implemented or supplied.
  return {x:5.5,y:5.5};
}

function selfWeightValue(sec){
  return +(sec.mass*9.81/1000).toFixed(4); // kg/m -> kN/m
}
function selfWeightEccentricity(sec){
  // Self-weight acts through the centroid. For doubly symmetric sections that is
  // also the shear centre; for PFCs the centroid is horizontally eccentric.
  if(sec.kind==='channel'){
    if(sec.tp && sec.tp.esc!=null && isFinite(+sec.tp.esc)) return +sec.tp.esc;
    return 0;
  }
  return 0;
}
function syncSelfWeightLoads(){
  // Self-weight is now automatic in comboLoads(). Remove legacy manual
  // self-weight rows so old states or button clicks cannot double-count it.
  S.loads = S.loads.filter(ld=>!ld.isSelfWeight);
}
