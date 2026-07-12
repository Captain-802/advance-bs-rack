/* ===========================================================================
   4. ORCHESTRATION   run analysis + shared checks dispatcher
   =========================================================================== */
function comboLoads(combo){
  // Always include every load (factor 0 if its case isn't in this combo) so that
  // load/support positions   and therefore the solver's x-grid   are identical
  // across every combination. That's what makes the envelope comparison below valid.
  const loads = S.loads.filter(ld=>!ld.isSelfWeight).map(ld=>{
    const factor = combo.factors[ld.case] ?? 0;
    if(ld.type==='point') return {type:'point',pos:(+ld.pos)*1000,P:-(ld.P||0)*factor*1000};
    if(ld.type==='moment') return {type:'moment',pos:(+ld.pos)*1000,M:(ld.M||0)*factor*1e6};
    if(ld.type==='udl') return {type:'udl',x1:(+ld.x1)*1000,x2:(+ld.x2)*1000,w1:-(ld.w||0)*factor,w2:-(ld.w||0)*factor};
    if(ld.type==='trap') return {type:'udl',x1:(+ld.x1)*1000,x2:(+ld.x2)*1000,w1:-(ld.w1||0)*factor,w2:-(ld.w2||0)*factor};
  });
  const sw=selfWeightValue(activeSection()), gFactor=combo.factors.G ?? 0;
  if(gFactor>0){
    loads.push({type:'udl',x1:0,x2:S.L*1000,w1:-sw*gFactor,w2:-sw*gFactor,isAutoSelfWeight:true});
  }
  return loads;
}
function comboHasServiceLoad(combo){
  const eps=1e-12;
  for(const ld of S.loads.filter(ld=>!ld.isSelfWeight)){
    const factor=Math.abs(combo.factors[ld.case] ?? 0);
    if(factor<eps) continue;
    if(ld.type==='point' && Math.abs(ld.P||0)>eps) return true;
    if(ld.type==='moment' && Math.abs(ld.M||0)>eps) return true;
    if(ld.type==='udl' && Math.abs(ld.w||0)>eps) return true;
    if(ld.type==='trap' && (Math.abs(ld.w1||0)>eps || Math.abs(ld.w2||0)>eps)) return true;
  }
  return Math.abs(combo.factors.G ?? 0)>eps && selfWeightValue(activeSection())>eps;
}
function validateInputs(py,E,ulsCombos,slsCombos){
  const errs=[];
  const finite=(v)=>Number.isFinite(+v);
  const inSpan=(x)=>finite(x) && +x>=-1e-9 && +x<=S.L+1e-9;
  if(!(finite(S.L) && S.L>0)) errs.push("Member length L must be greater than 0.");
  if(!(finite(py) && py>0)) errs.push("Design strength must be greater than 0.");
  if(!(finite(E) && E>0)) errs.push("E must be greater than 0.");
  if(!(finite(S.divisor) && S.divisor>0)) errs.push("Deflection divisor must be greater than 0.");
  if(!(finite(S.leFactor) && S.leFactor>0)) errs.push("Effective length factor must be greater than 0.");
  const seenSupports=new Set();
  S.supports.forEach((sp,i)=>{
    if(!inSpan(sp.pos)) errs.push(`Support ${i+1} position must be within 0 to ${S.L} m.`);
    const key=(+sp.pos).toFixed(6);
    if(seenSupports.has(key)) errs.push(`Duplicate supports at ${g(+sp.pos,3)} m are not allowed; combine them into one support.`);
    seenSupports.add(key);
  });
  S.loads.forEach((ld,i)=>{
    const tag=`Load ${i+1}`;
    if(!CASE_LABELS[ld.case]) errs.push(`${tag} has an unknown load case.`);
    if(ld.type==='point'){
      if(!inSpan(ld.pos)) errs.push(`${tag} point-load position must be within 0 to ${S.L} m.`);
      if(!finite(ld.P)) errs.push(`${tag} point load must be numeric.`);
    } else if(ld.type==='moment'){
      if(!inSpan(ld.pos)) errs.push(`${tag} moment position must be within 0 to ${S.L} m.`);
      if(!finite(ld.M)) errs.push(`${tag} moment must be numeric.`);
    } else if(ld.type==='udl' || ld.type==='trap'){
      if(!inSpan(ld.x1) || !inSpan(ld.x2)) errs.push(`${tag} load extents must be within 0 to ${S.L} m.`);
      if(!(finite(ld.x1) && finite(ld.x2) && +ld.x2>+ld.x1)) errs.push(`${tag} must have x2 greater than x1.`);
      if(ld.type==='udl' && !finite(ld.w)) errs.push(`${tag} UDL intensity must be numeric.`);
      if(ld.type==='trap' && (!finite(ld.w1) || !finite(ld.w2))) errs.push(`${tag} trapezoidal intensities must be numeric.`);
    } else errs.push(`${tag} has an unknown load type.`);
  });
  [...ulsCombos,...slsCombos].forEach(combo=>{
    ['G','Q','W','E'].forEach(cs=>{
      if(!finite(combo.factors[cs])) errs.push(`Combination "${combo.label}" has a non-numeric ${cs} factor.`);
    });
  });
  if(!slsCombos.some(comboHasServiceLoad)){
    errs.push("No SLS loads applied: every enabled SLS combination has zero factors for the active load cases. Enable a non-zero SLS factor for a load case that is present, or add a serviceability load.");
  }
  if(errs.length) throw errs.join(" ");
}
function analyse(){
  const sec=activeSection();
  syncSelfWeightLoads();
  const L=S.L*1000;
  const py = S.py!=null? S.py : pyFromGrade(S.grade,sec.tf);
  const E=S.E;
  const Ix=sec.Ix*1e4, EI=E*Ix;
  if(S.supports.length===0) throw "Add at least one support.";
  const npin=S.supports.filter(s=>s.type==='pinned').length;
  const nfix=S.supports.filter(s=>s.type==='fixed').length;
  const distinct=new Set(S.supports.map(s=>+(+s.pos).toFixed(4))).size;
  if(!((npin+nfix>=1) && (nfix>=1 || distinct>=2)))
    throw "Under-restrained layout (mechanism). Use a Fixed support, or at least two supports at different positions.";
  const supportsMM=S.supports.map(s=>({pos:(+s.pos)*1000,type:s.type}));

  const ulsCombos=S.combos.filter(c=>c.on && !c.sls);
  const slsCombos=S.combos.filter(c=>c.on && c.sls);
  if(ulsCombos.length===0) throw 'Enable at least one ULS load combination (see "Load Combinations").';
  if(slsCombos.length===0) throw 'Enable at least one SLS (deflection) load combination (see "Load Combinations").';
  validateInputs(py,E,ulsCombos,slsCombos);

  // Run every enabled ULS combination; the same load/support geometry means every
  // combo's result lands on an identical x-grid, so elementwise envelopes are valid.
  const ulsResults=ulsCombos.map(combo=>{
    const loads=comboLoads(combo);
    const r=solveBeam(L,EI,supportsMM,loads);
    if(!r.w.every(Number.isFinite)) throw "Under-restrained layout (mechanism). Add a support, or make a support Fixed to prevent rigid-body motion.";
    const fb=sfdBmd(L,supportsMM,loads,r.reactions);
    let Vmax=0; fb.V.forEach(v=>{ if(Math.abs(v)>Math.abs(Vmax)) Vmax=v; });
    let Mmax=0,Mpos=0; fb.xs.forEach((x,i)=>{ if(Math.abs(fb.M[i])>Math.abs(Mmax)){Mmax=fb.M[i];Mpos=x;} });
    return {combo,r,fb,Vmax,Mmax,Mpos};
  });
  const xs=ulsResults[0].fb.xs;
  const Venv=xs.map((_,i)=>{ let best=0; ulsResults.forEach(res=>{ if(Math.abs(res.fb.V[i])>Math.abs(best)) best=res.fb.V[i]; }); return best; });
  const Menv=xs.map((_,i)=>{ let best=0; ulsResults.forEach(res=>{ if(Math.abs(res.fb.M[i])>Math.abs(best)) best=res.fb.M[i]; }); return best; });
  let governV=ulsResults[0]; ulsResults.forEach(r=>{ if(Math.abs(r.Vmax)>Math.abs(governV.Vmax)) governV=r; });
  let governM=ulsResults[0]; ulsResults.forEach(r=>{ if(Math.abs(r.Mmax)>Math.abs(governM.Mmax)) governM=r; });
  const Vmax=governV.Vmax, Mmax=governM.Mmax, Mpos=governM.Mpos;
  // m-factor inputs (quarter-point moments) must come from ONE moment-diagram shape  
  // the governing-moment combo's own BMD   not a mix of different combos' diagrams.
  const gfb=governM.fb;
  const Mq=interpAt(gfb.xs,gfb.M,L*0.25), Mh=interpAt(gfb.xs,gfb.M,L*0.5), Mq3=interpAt(gfb.xs,gfb.M,L*0.75);
  let M24=0; gfb.xs.forEach((x,i)=>{ if(x>=L*0.25-1&&x<=L*0.75+1) M24=Math.max(M24,Math.abs(gfb.M[i])); });
  const M0end=interpAt(gfb.xs,gfb.M,0), MLend=interpAt(gfb.xs,gfb.M,L);
  const reactions=governM.r.reactions;

  // SLS deflection: worst of every enabled SLS combination
  const slsResults=slsCombos.map(combo=>{
    const loads=comboLoads(combo);
    const r=solveBeam(L,EI,supportsMM,loads);
    if(!r.w.every(Number.isFinite)) throw "Under-restrained layout (mechanism). Add a support, or make a support Fixed to prevent rigid-body motion.";
    let dmax=0,dpos=0; r.nodes.forEach((x,i)=>{ if(Math.abs(r.w[i])>Math.abs(dmax)){dmax=r.w[i];dpos=x;} });
    return {combo,r,dmax,dpos};
  });
  let governD=slsResults[0]; slsResults.forEach(r=>{ if(Math.abs(r.dmax)>Math.abs(governD.dmax)) governD=r; });
  const dmax=governD.dmax, dpos=governD.dpos;

  // ---- torsion from load eccentricity (loads at e from the shear centre) ----
  // Torque loads mirror the transverse loads: q_T(x) = w(x)*e, point torques P*e.
  // Every support is a fork support (twist prevented): GIt*phi'' = -q_T with phi=0
  // at supports, solved by 1-dof linear elements (nodal phi exact for this ODE);
  // the torque diagram T(x) then follows by statics, reusing sfdBmd (its V output).
  let tors=null;
  const swE=selfWeightEccentricity(sec);
  const anyUserEcc = S.eccOn && S.loads.some(ld=>!ld.isSelfWeight && ld.type!=='moment' && Math.abs(ld.e||0)>1e-9);
  const anySelfWeightEcc = S.eccOn && Math.abs(swE)>1e-9 && selfWeightValue(sec)>0 &&
    [...ulsCombos,...slsCombos].some(cb=>Math.abs(cb.factors.G??0)>1e-12);
  const anyEcc = anyUserEcc || anySelfWeightEcc;
  const torsErr = (anyEcc && !(sec.J>0))? "the section torsional constant I_T is zero or undefined in the section data" : null;
  if(anyEcc && !torsErr){
    const GIt=81000*sec.J*1e4; // N.mm2 (G = 81000 N/mm2 per SN003a / P385)
    const mkT=(combo)=>{ const out=[]; S.loads.filter(ld=>!ld.isSelfWeight).forEach(ld=>{
      const f=combo.factors[ld.case]??0;
      const le=+(ld.e||0); // this load's own shear-centre offset, mm
      if(ld.type==='point') out.push({type:'point',pos:(+ld.pos)*1000,P:(ld.P||0)*f*1000*le}); // kN -> N, x e mm -> N.mm
      else if(ld.type==='udl') out.push({type:'udl',x1:(+ld.x1)*1000,x2:(+ld.x2)*1000,w1:(ld.w||0)*f*le,w2:(ld.w||0)*f*le});
      else if(ld.type==='trap') out.push({type:'udl',x1:(+ld.x1)*1000,x2:(+ld.x2)*1000,w1:(ld.w1||0)*f*le,w2:(ld.w2||0)*f*le});
    });
      const gF=combo.factors.G??0, sw=selfWeightValue(sec);
      if(Math.abs(gF)>1e-12 && Math.abs(swE)>1e-9 && sw>0){
        out.push({type:'udl',x1:0,x2:S.L*1000,w1:sw*gF*swE,w2:sw*gF*swE,isAutoSelfWeight:true});
      }
      return out; };
    const solveT=(tq)=>{
      const nodes=buildNodes(L,supportsMM,tq,120);
      const n=nodes.length;
      const K=Array.from({length:n},()=>new Array(n).fill(0));
      const F=new Array(n).fill(0);
      for(let el=0;el<n-1;el++){ const Le=nodes[el+1]-nodes[el], k=GIt/Le;
        K[el][el]+=k; K[el][el+1]-=k; K[el+1][el]-=k; K[el+1][el+1]+=k; }
      const idx=new Map(nodes.map((x,i)=>[+x.toFixed(6),i]));
      tq.forEach(ld=>{ if(ld.type==='point'){ const i=idx.get(+(+ld.pos).toFixed(6)); if(i!=null) F[i]+=ld.P; }
        else if(ld.type==='udl'){ for(let el=0;el<n-1;el++){ const xa=nodes[el],xb=nodes[el+1];
          if(xb<=ld.x1+1e-9||xa>=ld.x2-1e-9) continue; const Le=xb-xa;
          const tv=x=>{ if(ld.x2===ld.x1) return ld.w1; const s=(x-ld.x1)/(ld.x2-ld.x1); return ld.w1+(ld.w2-ld.w1)*s; };
          const ta=tv(xa),tb=tv(xb);
          F[el]+=Le*(2*ta+tb)/6; F[el+1]+=Le*(ta+2*tb)/6; } } });
      const fixed=new Set(); S.supports.forEach(s=>{ const i=idx.get(+(((+s.pos)*1000)).toFixed(6)); if(i!=null) fixed.add(i); });
      const free=[]; for(let d2=0;d2<n;d2++) if(!fixed.has(d2)) free.push(d2);
      const phi=new Array(n).fill(0);
      if(free.length){ const Kff=free.map(r=>free.map(cc=>K[r][cc])), Ff=free.map(r=>F[r]);
        const df=linsolve(Kff,Ff); free.forEach((dof,j)=>phi[dof]=df[j]); }
      const R=new Array(n).fill(0);
      for(let i=0;i<n;i++){ let s2=0; for(let j=0;j<n;j++) s2+=K[i][j]*phi[j]; R[i]=s2-F[i]; }
      const reactions=S.supports.map(s=>({pos:(+s.pos)*1000,type:'pinned',V:R[idx.get(+(((+s.pos)*1000)).toFixed(6))]}));
      const fb=sfdBmd(L,supportsMM,tq,reactions);
      let Tm=0,Tp=0; fb.V.forEach((v,i)=>{ if(Math.abs(v)>Math.abs(Tm)){Tm=v;Tp=fb.xs[i];} });
      let pm=0,pp=0; phi.forEach((v,i)=>{ if(Math.abs(v)>Math.abs(pm)){pm=v;pp=nodes[i];} });
      return {nodes,phi,xs:fb.xs,T:fb.V,Tmax:Tm,Tpos:Tp,phiMax:pm,phiPos:pp};
    };
    const uls=ulsCombos.map(cb=>({combo:cb,r:solveT(mkT(cb))}));
    let gT=uls[0]; uls.forEach(u=>{ if(Math.abs(u.r.Tmax)>Math.abs(gT.r.Tmax)) gT=u; });
    const sls=slsCombos.map(cb=>({combo:cb,r:solveT(mkT(cb))}));
    let gW=sls[0]; sls.forEach(u=>{ if(Math.abs(u.r.phiMax)>Math.abs(gW.r.phiMax)) gW=u; });
    tors={on:true, GIt,
      Tmax:Math.abs(gT.r.Tmax)/1e6, Tpos:gT.r.Tpos/1000, governT:gT.combo.label,
      diag:{xs:gT.r.xs.map(x=>x/1000), T:gT.r.T.map(t=>t/1e6)},
      uls,
      TmaxSLS:Math.abs(gW.r.Tmax)/1e6, phiMax:Math.abs(gW.r.phiMax), phiPos:gW.r.phiPos/1000, governTw:gW.combo.label};
  }

  // ---- P385 open-section torsion (Method B closed forms) ----
  let torsO=null;
  if(anyEcc && torsErr && !sec.isBox){ torsO={ok:false,reason:torsErr}; }
  if(anyEcc && !torsErr && !sec.isBox){
    const tp=sec.tp;
    const IT=((tp&&tp.IT)? tp.IT : sec.J)*1e4;                     // mm4, P385 App A preferred
    const IwO=(((tp&&tp.Iw!=null)? tp.Iw : sec.Iw)||0)*1e12;       // mm6
    const GItO=81000*IT;
    const aa=IwO>0? Math.sqrt(210000*IwO/GItO) : 0; // derive a from Iw/IT (3 s.f. tabulated a would desynchronise Mw from phi'')
    const endsOK = S.supports.length===2 &&
      Math.min(...S.supports.map(s=>+s.pos))<=1e-6 &&
      Math.abs(Math.max(...S.supports.map(s=>+s.pos))-S.L)<=1e-6;
    const mk385=(combo)=>{
      const list=[];
      for(const ld of S.loads){
        if(ld.isSelfWeight||ld.type==='moment') continue;
        const f=combo.factors[ld.case]??0, le=+(ld.e||0);
        if(!f||Math.abs(le)<1e-9) continue;
        if(ld.type==='point'){ list.push({kind:'point',alpha:(+ld.pos)*1000/L,T:(ld.P||0)*f*1000*le}); }
        else {
          const x1=(+ld.x1)*1000, x2=(+ld.x2)*1000;
          if(x1>1e-6 || Math.abs(x2-L)>1e-6) return {ok:false,reason:'partial-span eccentric distributed load on an open section: the P385 fork-fork closed forms (Cases 3/4/10) cover full-span distributed torque only'};
          const w1=ld.type==='udl'? (ld.w||0):(ld.w1||0), w2=ld.type==='udl'? (ld.w||0):(ld.w2||0);
          const wu=Math.min(w1,w2), dv=w2-w1;
          if(Math.abs(wu)>1e-12) list.push({kind:'ud',T:wu*f*le*L});
          if(Math.abs(dv)>1e-12) list.push({kind:'lin',T:Math.abs(dv)/2*f*le*L*Math.sign(dv*1), mirror:dv<0});
        }
      }
      const gF=combo.factors.G??0, sw=selfWeightValue(sec);
      if(Math.abs(gF)>1e-12 && Math.abs(swE)>1e-9 && sw>0){
        list.push({kind:'ud',T:sw*gF*swE*L});
      }
      return {ok:true,list};
    };
    if(!(IT>0)) torsO={ok:false,reason:'the torsional constant I_T is zero or undefined'};
    else if(!(IwO>0)||!(aa>0)||!isFinite(aa)) torsO={ok:false,reason:'no warping constant available for this section'};
    else if(!endsOK) torsO={ok:false,reason:'open-section torsion per P385 requires a single span with fork supports at both ends (Cases 3/4/10); cantilevers and multi-span layouts are not covered'};
    else {
      let bad=null;
      const sols=[];
      for(const res of ulsResults){
        const m=mk385(res.combo);
        if(!m.ok){ bad=m.reason; break; }
        sols.push({combo:res.combo, fb:res.fb, sol:p385Solve(L,aa,GItO,m.list)});
      }
      let slsSol=null;
      if(!bad){
        for(const cb of slsCombos){
          const m=mk385(cb);
          if(!m.ok){ bad=m.reason; break; }
          const s2=p385Solve(L,aa,GItO,m.list);
          let pm=0,pp=0; s2.phi.forEach((v,i)=>{ if(Math.abs(v)>Math.abs(pm)){pm=v;pp=s2.xs[i];} });
          if(!slsSol||Math.abs(pm)>Math.abs(slsSol.phiMax)) slsSol={combo:cb,phiMax:pm,phiPos:pp};
        }
      }
      torsO= bad? {ok:false,reason:bad} : {ok:true,aa,X:L/aa,IT,Iw:IwO,GIt:GItO,sols,sls:slsSol};
    }
  }
  return {sec,py,E,L,Ix,tors,torsO,torsErr,swPerM:sec.mass*9.81/1000,ulsResults,
    Vmax:Vmax/1000, Mmax:Mmax/1e6, Mpos:Mpos/1000,
    Mq:Mq/1e6, Mh:Mh/1e6, Mq3:Mq3/1e6, M24:M24/1e6, M0end:M0end/1e6, MLend:MLend/1e6,
    dmax, dpos:dpos/1000,
    diag:{xs:xs.map(x=>x/1000), V:Venv.map(v=>v/1000), M:Menv.map(m=>m/1e6),
          dx:governD.r.nodes.map(x=>x/1000), dw:governD.r.w},
    reactions, ulsResults, slsResults, governV, governM, governD};
}

/* Standard-specific check engines live in js/checks/. */
function checks(a){
  if(S.code==='EC3') return (S.restraint||'full')==='full'? checksEC3Restrained(a) : checksEC3UnrestrainedSCI(a);
  return checksBS5950(a);
}

