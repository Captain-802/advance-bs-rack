function checksEC3(a){
  const sec=a.sec, fy=a.py, E=a.E; // fy reuses the same Table 9 / EN 10025-2 thickness bands
  const unsupported=[];
  const eps=epsEC3(fy);
  const gM0=1.0, gM1=1.0; // UK NA
  const cl=classifyEC3(sec,eps);
  const clsName=["","Class 1","Class 2","Class 3","Class 4"][cl.cls];
  if(cl.cls>=4) unsupported.push("EC3 Class 4 section: effective-section properties per EN 1993-1-5 are required; gross Wel is not accepted for PASS.");

  const Av=avEC3(sec);
  const VplRd=Av*fy/(Math.sqrt(3)*gM0)/1000; // kN
  const Fv=Math.abs(a.Vmax);
  const lowShear=Fv<=0.5*VplRd; // EC3 cl 6.2.8: high-shear threshold is 0.5 Vpl,Rd (not 0.6 like BS5950)
  const shearBuckle = !sec.isBox && (sec.dt/eps) > 72; // cl 6.2.6(6): web shear-buckling check needed if hw/t>72e/eta (eta~1.0 conservative)
  if(shearBuckle) unsupported.push("EC3 web shear-buckling check per EN 1993-1-5 is required and is not implemented in this calculator.");

  const Zx=sec.Zx*1e3, Sx=sec.Sx*1e3;
  let McRd = cl.cls<=2? Sx*fy/gM0/1e6 : Zx*fy/gM0/1e6;
  let hsNote=null;
  if(!lowShear){
    if(cl.cls<=2 && sec.kind==='I'){
      const rho=Math.pow(2*Fv/VplRd-1,2);
      const Sv=Av*Av/(4*sec.tw);
      McRd=Math.min(McRd,(Sx-rho*Sv)*fy/gM0/1e6);
      hsNote='high-shear reduction applied with A<sub>v</sub> /(4t<sub>w</sub>) for a rolled I/H section';
    } else {
      unsupported.push("Exact EC3 high-shear reduced moment resistance for this section family/class is not implemented.");
    }
  }

  const Ag=sec.A*1e2; // mm2 (gross; bolt-hole deduction not modelled here)
  const NRd=Ag*fy/gM0/1000; // kN
  const F=S.axial||0;
  const n=NRd>0? Math.abs(F)/NRd : 0;
  let MNRd=McRd, awNote=false;
  if(n>0.01 && cl.cls<=2){
    if(sec.kind==='channel'){
      unsupported.push("EC3 reduced moment resistance under axial force is not defined here for PFC/channel sections; use verified Blue Book/software data.");
    } else {
      const aw=Math.min(Math.max((Ag-2*sec.B*sec.tf)/Ag,0),0.5);
      MNRd=Math.min(McRd*(1-n)/(1-0.5*aw), McRd);
      awNote=true;
    }
  }
  const Mx=Math.abs(a.Mmax);
  const localUtil=MNRd>0? Mx/MNRd : 0;

  const isCant=(S.supports.length===1 && S.supports[0].type==='fixed');
  const c1r = S.C1o!=null? {C1:S.C1o, method:'user override'} : computeC1(a,isCant);
  const C1=c1r.C1;

  const LE=S.leFactor*(S.destab?1.2:1)*a.L;
  let MbRd,ltbUtil,lamLT=null,chiLT=null,kc=null,fmod=null,curveInfo=null,Mcr=null,chiLTmod=null;
  if(sec.isBox){
    MbRd=McRd; ltbUtil=MbRd>0? Mx/MbRd:0;
  } else {
    if(sec.kind==='channel' && Mx>1e-9) unsupported.push("EC3 PFC/channel LTB requires a channel-specific Mcr calculation including exact warping/shear-centre/load-position terms; the previous approximate Mcr path is not accepted for PASS.");
    Mcr=mcrEC3(sec,LE,E,fy,C1)/1e6; // kN.m
    const Wy=(cl.cls<=2? Sx : Zx);
    lamLT=Math.sqrt(Wy*fy/(Mcr*1e6));
    curveInfo=ltbCurveEC3(sec);
    chiLT=chiLTEC3(lamLT,curveInfo.alphaLT,0.4,0.75);
    kc=1/Math.sqrt(Math.max(C1,1e-6));
    fmod=Math.min(1-0.5*(1-kc)*(1-2*Math.pow(lamLT-0.8,2)),1.0);
    chiLTmod=Math.min(chiLT/fmod,1.0);
    MbRd=Math.min(chiLTmod*Wy*fy/gM1/1e6, McRd);
    ltbUtil=MbRd>0? Mx/MbRd:0;
  }

  const ry=sec.ry*10, rx=sec.rx*10;
  const lam1=Math.PI*Math.sqrt(E/fy);
  const curveY=strutCurveEC3(sec,'y'), curveZ=strutCurveEC3(sec,'z');
  const lamBarY=(LE/rx)/lam1, lamBarZ=(LE/ry)/lam1;
  const chiY=chiStrutEC3(lamBarY,curveY.alpha), chiZ=chiStrutEC3(lamBarZ,curveZ.alpha);
  const NbRdY=chiY*Ag*fy/gM1/1000, NbRdZ=chiZ*Ag*fy/gM1/1000;
  const Fc=Math.max(F,0);

  // Member-buckling interaction (cl 6.3.3) via Annex B, Method 2   the method
  // recommended by steelconstruction.info as "the simpler approach for manual
  // calculations" (Annex A is the alternative; both are permitted by the UK NA).
  // Table B.1 applies to members NOT susceptible to torsional deformation
  // (CHS/SHS/RHS); Table B.2 applies to members that ARE susceptible (I, H,
  // channel). The two tables share the same kyy/kzz, but differ in kyz/kzy.
  const n_ratio = Fc/Math.max(Ag*fy/gM0/1000,1e-9); // NEd/NRd
  const psiInteraction = a.M0end!==0? Math.max(-1,Math.min(1,a.MLend/(a.M0end||1e-9))) : 0;
  const endMomentOnly = Math.max(Math.abs(a.M0end),Math.abs(a.MLend)) > 0.98*Math.max(Math.abs(a.Mmax),1e-9);
  const Cm = endMomentOnly ? Math.max(0.6+0.4*psiInteraction, 0.4) : 1.0;
  const cmMethod = endMomentOnly ? 'linear end-moment diagram' : 'general transverse-load moment diagram; conservative Cm=1.0';
  const Cmy=Cm, Cmz=Cm, CmLT=Cm;

  const ny=Fc/Math.max(NbRdY,1e-9), nz=Fc/Math.max(NbRdZ,1e-9);
  let kyy,kzz,kyz,kzy;
  if(cl.cls<=2){
    kyy=Math.min(Cmy*(1+(lamBarY-0.2)*ny), Cmy*(1+0.8*ny));
    kzz=Math.min(Cmz*(1+(2*lamBarZ-0.6)*nz), Cmz*(1+1.4*nz));
  } else {
    kyy=Math.min(Cmy*(1+0.6*lamBarY*ny), Cmy*(1+0.6*ny));
    kzz=Math.min(Cmz*(1+0.6*lamBarZ*nz), Cmz*(1+0.6*nz));
  }
  if(sec.isBox){ // Table B.1   not susceptible to torsional deformation
    kyz=kzz;
    kzy=Math.min(0.8*kyy, kyy);
  } else { // Table B.2   susceptible to torsional deformation (I/H/channel)
    kyz=0.6*kzz;
    const denom=Math.max(CmLT-0.25,0.05)*Math.max(chiZ,0.05);
    if(cl.cls<=2) kzy=Math.max(1-0.1*lamBarZ*nz/denom, 1-0.1*nz/denom);
    else kzy=Math.max(1-0.1*lamBarZ*nz/denom, 1-0.1*nz/denom); // same form, NA keeps the 0.1 coefficient for both class groups in this term
  }
  const McRdLT = sec.isBox? McRd : MbRd;
  const u1=ny + kyy*Mx/Math.max(McRdLT,1e-9);          // y-y (in-plane) interaction, Eq 6.61
  const u2=nz + kzy*Mx/Math.max(McRdLT,1e-9);          // z-z (out-of-plane) interaction, Eq 6.62

  const span=a.L, divisor=S.divisor||360, dlimit=span/divisor;
  const dmax=Math.abs(a.dmax), defOk=dmax<=dlimit;

  const utils=[
    {name:"Shear  Ved/Vpl,Rd",val:Fv/VplRd},
    {name:"Bending  Med/MN,Rd",val:localUtil},
    {name: sec.isBox?"Bending Med/Mc,Rd":"LTB  Med/Mb,Rd", val:ltbUtil},
    {name:"Buckling (y-y)",val:u1},
    {name:"Buckling (z-z)",val:u2},
    {name:"Deflection",val:dmax/dlimit},
  ];
  let gov=utils[0]; utils.forEach(u=>{ if(u.val>gov.val) gov=u; });
  const pass=unsupported.length===0 && utils.every(u=>u.val<=1.0001);

  return {eps,cl,clsName,unsupported,fy,Av,VplRd,Fv,lowShear,shearBuckle,McRd,hsNote,Zx,Sx,
    Ag,NRd,F,n,MNRd,awNote,Mx,localUtil,isCant,
    C1,c1method:c1r.method,LE,lamLT,Mcr,curveInfo,chiLT,kc,fmod,chiLTmod,MbRd,ltbUtil,
    lam1,curveY,curveZ,lamBarY,lamBarZ,chiY,chiZ,NbRdY,NbRdZ,Fc,Cm,cmMethod,Cmy,Cmz,CmLT,kyy,kzz,kyz,kzy,n_ratio,psiInteraction,McRdLT,u1,u2,
    span,divisor,dlimit,dmax,defOk,utils,gov,pass};
}

// ---- EN 1993-1-1 Table B.3: equivalent uniform moment factor Cm from the
// governing combination's own moment diagram (single span between restraints).
// Returns {Cm, label}. Loading type: 'uniform' / 'concentrated'; where the two
// give different values (mixed loading) the LARGER (conservative) is used.
function cmTableB3(a){
  const Mm=Math.abs(a.Mmax);
  if(Mm<1e-9) return {Cm:1.0,label:'negligible moment'};
  const fb=a.governM.fb, L=a.L;
  const M0=interpAt(fb.xs,fb.M,0)/1e6, ML=interpAt(fb.xs,fb.M,L)/1e6;
  const Ms=interpAt(fb.xs,fb.M,L/2)/1e6;
  const gfac=a.governM.combo.factors;
  let hasDist=(gfac.G??0)>0, hasConc=false;   // auto self-weight is distributed
  S.loads.forEach(ld=>{ if(ld.isSelfWeight) return; const f=gfac[ld.case]??0; if(!f) return;
    if(ld.type==='point') hasConc=true; else if(ld.type==='udl'||ld.type==='trap') hasDist=true; });
  // 'linear end-moment diagram' means the BMD is actually a straight line
  // between the ends (no transverse-load curvature) - test the midspan value
  // against the chord, NOT just the end magnitudes (a cantilever's Mmax sits
  // at the end but its diagram is far from linear; Table B.3 alpha_s applies).
  const isLinear=Math.abs(Ms-(M0+ML)/2)<=0.02*Mm;
  if(isLinear){
    const Mh2=Math.abs(M0)>=Math.abs(ML)? M0:ML, Mo2=Math.abs(M0)>=Math.abs(ML)? ML:M0;
    const psi=Math.max(-1,Math.min(1,Mo2/(Mh2||1e-9)));
    return {Cm:Math.max(0.6+0.4*psi,0.4),label:'linear end-moment diagram, &psi; = '+psi.toFixed(2)};
  }
  const Mh=Math.abs(M0)>=Math.abs(ML)? M0:ML;
  const Mo=Math.abs(M0)>=Math.abs(ML)? ML:M0;
  const psi=Math.abs(Mh)>1e-9? Math.max(-1,Math.min(1,Mo/Mh)) : 1;
  const evalType=(type)=>{
    if(Math.abs(Mh)<0.02*Mm){ // no significant end moment: alpha_h family with Mh=0
      return type==='uniform'? 0.95 : 0.90;
    }
    if(Math.abs(Ms)<=Math.abs(Mh)+1e-12){
      const as=Math.max(-1,Math.min(1,Ms/Mh));
      if(as>=0) return 0.2+0.8*as;
      if(psi>=0) return type==='uniform'? 0.1-0.8*as : -0.8*as;
      return type==='uniform'? 0.1*(1-psi)-0.8*as : 0.2*(-psi)-0.8*as;
    }
    const ah=Math.max(-1,Math.min(1,Mh/Ms));
    const mod=(ah<0&&psi<0)? (1+2*psi) : 1;
    return type==='uniform'? 0.95+0.05*ah*mod : 0.90+0.10*ah*mod;
  };
  let Cm,label;
  const tag=Math.abs(Ms)<=Math.abs(Mh)? '&alpha;<sub>s</sub> = '+ (Math.abs(Mh)<0.02*Mm?'&mdash;':(Ms/Mh).toFixed(3)) : '&alpha;<sub>h</sub> = '+(Mh/Ms).toFixed(3);
  if(hasDist&&hasConc){ Cm=Math.max(evalType('uniform'),evalType('concentrated')); label='mixed loading (larger of uniform/concentrated), '+tag; }
  else if(hasConc){ Cm=evalType('concentrated'); label='concentrated load diagram, '+tag; }
  else { Cm=evalType('uniform'); label='uniform load diagram, '+tag; }
  return {Cm:Math.max(Cm,0.4),label:label+', M<sub>h</sub> = '+Mh.toFixed(1)+', M<sub>s</sub> = '+Ms.toFixed(1)+', &psi; = '+psi.toFixed(2)};
}
// ---- EN 1993-1-1 cl 6.3.3, Annex B Method 2 (interaction factors kyy, kzz,
// kyz, kzy from Table B.1 [not susceptible to torsional deformation] or B.2
// [susceptible]; Cm from Table B.3). This is a compression-member check, so
// callers should only create it when N_Ed is compressive.
function annexB2(a,sec,fy,cl,MbRdI,useB1,isCant){
  const gM1=1.0, E=a.E;
  const Fc=Math.max(S.axial||0,0);
  const Ag=sec.A*1e2;
  const Lcr=S.leFactor*a.L;                      // strut length: LE factor only (destabilising x1.2 is an LTB concept)
  const lam1=Math.PI*Math.sqrt(E/fy);
  const rx=sec.rx*10, ry=sec.ry*10;
  const lamY=(Lcr/rx)/lam1, lamZ=(Lcr/ry)/lam1;
  const cvY=strutCurveEC3(sec,'y'), cvZ=strutCurveEC3(sec,'z');
  const chiY=chiStrutEC3(lamY,cvY.alpha), chiZ=chiStrutEC3(lamZ,cvZ.alpha);
  const NbY=chiY*Ag*fy/gM1/1000, NbZ=chiZ*Ag*fy/gM1/1000;   // kN
  const ny=Fc/Math.max(NbY,1e-9), nz=Fc/Math.max(NbZ,1e-9);
  const cm=cmTableB3(a);
  let Cmy=cm.Cm, CmLT=cm.Cm, swayNote=false;
  if(isCant && Fc>1e-6 && Cmy<0.9){ Cmy=0.9; CmLT=0.9; swayNote=true; } // Table B.3 note: sway buckling mode -> Cm = 0.9
  const Cmz=1.0;                                   // Mz = 0 in this single-plane solver
  const c12=cl.cls<=2 && sec.kind!=='channel'; // channels: elastic (Class 3/4) k-factor column, conservative (matches MasterSeries)
  const kyy = c12? Math.min(Cmy*(1+(lamY-0.2)*ny), Cmy*(1+0.8*ny))
                 : Math.min(Cmy*(1+0.6*lamY*ny),   Cmy*(1+0.6*ny));
  const kzz = c12? Math.min(Cmz*(1+(2*lamZ-0.6)*nz), Cmz*(1+1.4*nz))
                 : Math.min(Cmz*(1+0.6*lamZ*nz),     Cmz*(1+0.6*nz));
  const kyz = c12? 0.6*kzz : kzz;                  // Table B.1 (shared by B.2)
  let kzy, kzyLbl;
  if(useB1){ kzy=(c12?0.6:0.8)*kyy; kzyLbl='Table B.1: '+(c12?'0.6':'0.8')+'k<sub>yy</sub>'; }
  else {
    const dn=Math.max(CmLT-0.25,1e-6), lz=Math.min(lamZ,1);
    const coef=c12? 0.1 : 0.05;
    let e1=1-coef*lz*nz/dn;
    if(c12 && lamZ<0.4) e1=Math.min(0.6+lamZ,e1);
    kzy=Math.max(e1,0); kzyLbl='Table B.2 (susceptible): 1&minus;'+coef+'&middot;min(&lambda;&#772;<sub>z</sub>,1)&middot;n<sub>z</sub>/(C<sub>mLT</sub>&minus;0.25)';
  }
  const Mrd=Math.max(MbRdI,1e-9), Mx=Math.abs(a.Mmax);
  const u1=ny + kyy*Mx/Mrd;                        // Eq 6.61 (Mz = 0)
  const u2=nz + kzy*Mx/Mrd;                        // Eq 6.62
  return {Fc,Lcr,lam1,lamY,lamZ,cvY,cvZ,chiY,chiZ,NbY,NbZ,ny,nz,
    Cmy,Cmz,CmLT,cmLabel:cm.label,swayNote,useB1,c12,kyy,kzz,kyz,kzy,kzyLbl,MbRdI,u1,u2};
}
function axialInteractionEC3(a, sec, fy, cl, gM0){
  // EC3 cl 6.2.9 cross-section axial + major-axis bending interaction. Returns the
  // axial result object (or null when the axial force is negligible / Class 4).
  // Extracted verbatim from checksEC3Restrained so it can be unit-tested alone.
  const F=S.axial||0;
  const AgAx=sec.A*1e2, AnetAx=(S.anet!=null? S.anet*1e2 : AgAx);
  const fuAx=fuFromGrade(S.grade);
  const NplRd=AgAx*fy/gM0/1000;                              // kN
  const NuRd=0.9*AnetAx*fuAx/1.25/1000;                      // kN, gammaM2 = 1.25 (UK NA)
  const NtRd=Math.min(NplRd,NuRd);
  let ax=null;
  if(Math.abs(F)>1e-9){
    if(sec.kind==='channel' && cl.cls<4){
      const nAx=Math.abs(F)/NplRd;
      const McChan=(cl.cls<=2? sec.Sx:sec.Zx)*1e3*fy/gM0/1e6;
      ax={cls3:false,chan:true,n:nAx,NplRd,NuRd,NtRd,MN:McChan,alpha:1,
        mnLbl:'channel: linear interaction (cl 6.2.1(7); &alpha; = &beta; = 1, conservative &mdash; MasterSeries basis)',
        mUtil:nAx + Math.abs(a.Mmax)/Math.max(McChan,1e-9),
        nUtil: F>0? Math.abs(F)/NplRd : Math.abs(F)/NtRd, tension:F<0};
    } else if(cl.cls>=4){
      /* Class 4 already blocked by the caller */
    } else {
      const nAx=Math.abs(F)/NplRd;
      const Mpl=sec.Sx*1e3*fy/gM0/1e6, Mel=sec.Zx*1e3*fy/gM0/1e6;
      let MN,alpha,mnLbl,waiver=false;
      if(cl.cls<=2){
        const aw=Math.min(Math.max((AgAx-2*sec.B*sec.tf)/AgAx,0),0.5);
        MN=Math.min(Mpl*(1-nAx)/(1-0.5*aw),Mpl);
        if(sec.kind==='I'){
          const hwAx=sec.D-2*sec.tf;
          if(Math.abs(F)*1000<=0.25*NplRd*1000 && Math.abs(F)*1000<=0.5*hwAx*sec.tw*fy/gM0){ MN=Mpl; waiver=true; }
          alpha=2; mnLbl='a = '+g(aw,3)+(waiver? '; small axial (cl 6.2.9.1(4)): no reduction':'');
        } else {
          alpha=Math.min(1.66/(1-1.13*nAx*nAx),6);
          mnLbl='a<sub>w</sub> = '+g(aw,3)+'; &alpha; = &beta; = 1.66/(1&minus;1.13n&sup2;) = '+g(alpha,2);
        }
        ax={cls3:false,n:nAx,NplRd,NuRd,NtRd,MN,alpha,mnLbl,
          mUtil:Math.pow(Math.abs(a.Mmax)/Math.max(MN,1e-9),alpha),
          nUtil: F>0? Math.abs(F)/NplRd : Math.abs(F)/NtRd, tension:F<0};
      } else {
        ax={cls3:true,n:nAx,NplRd,NuRd,NtRd,MN:Mel,alpha:1,mnLbl:'Class 3: elastic, cl 6.2.9.2',
          mUtil:Math.abs(F)/NplRd + Math.abs(a.Mmax)/Math.max(Mel,1e-9),
          nUtil: F>0? Math.abs(F)/NplRd : Math.abs(F)/NtRd, tension:F<0};
      }
    }
  }
  return ax;
}

function evaluateTorsionEC3(a, sec, cl, fy, gM0, VcRd, Fv){
  // EC3 cl 6.2.7 torsion. The torsion fields are pre-solved in analyse() into
  // a.tors (St Venant) and a.torsO (P385 open-section warping); this evaluates
  // the box (Ct/Wt) or open-section (P385 Method B) design effects plus the
  // coincident shear+torsion sweep. Returns { tor, unsupported } — the caller
  // appends the unsupported messages. Extracted verbatim for isolated testing.
  const unsupported=[];
  const cshear=(fy/Math.sqrt(3))/gM0;
  const shearTorsionUtil=(VplTRd,V=Fv)=> VplTRd>1e-9 ? V/VplTRd : (V>1e-9 ? 99 : 0);
  const sweepXs=(...sets)=>[...new Set(sets.flat().map(x=>+x.toFixed(4)))].sort((p,q)=>p-q);
  const boxShearTorsionSweep=(Wt)=>{
    let worst={u:-1,x:0,V:0,T:0,tau:0,VplTRd:VcRd,combo:''};
    const torsUls=(a.tors&&a.tors.uls)||[];
    a.ulsResults.forEach(res=>{
      const tr=torsUls.find(u=>u.combo===res.combo);
      if(!tr) return;
      sweepXs(res.fb.xs,tr.r.xs).forEach(x=>{
        const Vx=Math.abs(interpAt(res.fb.xs,res.fb.V,x))/1000;
        const T=Math.abs(interpAt(tr.r.xs,tr.r.T,x))/1e6;
        const tau=T*1e6/Wt;
        const VplTRd=Math.max(0,1-tau/cshear)*VcRd;
        const u=shearTorsionUtil(VplTRd,Vx);
        if(u>worst.u) worst={u,x,V:Vx,T,tau,VplTRd,combo:res.combo.label,zeroCapacity:VplTRd<=1e-9&&Vx>1e-9};
      });
    });
    if(worst.u<0){
      const T=(a.tors&&a.tors.Tmax)||0, tau=T*1e6/Wt;
      const VplTRd=Math.max(0,1-tau/cshear)*VcRd;
      worst={u:shearTorsionUtil(VplTRd,Fv),x:(a.tors&&a.tors.Tpos? a.tors.Tpos:0)*1000,V:Fv,T,tau,VplTRd,combo:(a.tors&&a.tors.governT)||'',zeroCapacity:VplTRd<=1e-9&&Fv>1e-9};
    }
    return worst;
  };
  let tor=null;
  if(a.tors && a.tors.on){
    if(sec.isBox){
      const cb=ctBoxEN10210(sec);
      const Wt=(sec.tp&&sec.tp.Wt)? sec.tp.Wt*1e3 : cb.Ct; // mm3, tabulated P385 value preferred
      const WtSrc=(sec.tp&&sec.tp.Wt)? 'SCI P385 Table A.7/A.8' : 'EN 10210-2 formula';
      const ItShow=(sec.tp&&sec.tp.IT)? sec.tp.IT*1e4 : cb.It;
      const TRd=fy*Wt/(Math.sqrt(3)*gM0)/1e6;                  // kN.m, cl 6.2.7(7); Tw,Ed neglected for hollow sections
      const TEd=a.tors.Tmax;
      const tauMax=TEd*1e6/Wt;                                  // N/mm2, shear stress due to peak torsion
      const vt=boxShearTorsionSweep(Wt);
      tor={box:true,Wt,WtSrc,ItShow,TRd,TEd,
        tau:vt.tau, tauMax, VplTRd:vt.VplTRd, vt,
        torUtil:TRd>0? TEd/TRd:0, vtUtil:vt.u, vtZeroCapacity:!!vt.zeroCapacity,
        GIt:a.tors.GIt,TmaxSLS:a.tors.TmaxSLS,phiMax:a.tors.phiMax,phiDeg:a.tors.phiMax*180/Math.PI,phiPos:a.tors.phiPos,governT:a.tors.governT,governTw:a.tors.governTw};
      if(sec.boxType==='CF') unsupported.push("Torsional constants are computed with hot-finished (EN 10210-2) corner geometry; cold-formed (EN 10219-2) corners differ slightly - verify W_t for a cold-formed section.");
    } else if(a.torsO && a.torsO.ok){
      // ---- SCI P385 Method B: elastic warping analysis + design effects ----
      const O=a.torsO, hh=sec.D-sec.tf;                     // (h - tf) flange lever
      const EIw=210000*O.Iw;
      const chan=sec.kind==='channel';
      const Mply=sec.Sx*1e3*fy/1e6, Mplz=sec.Sy*1e3*fy/1e6; // kNm
      const Mely=sec.Zx*1e3*fy/1e6, Melz=sec.Zy*1e3*fy/1e6;
      const Mplf=chan? sec.B*sec.B*sec.tf/4*fy/1e6 : Mplz/2;  // one flange (plastic)
      const Melf=Melz/2;
      const cls12=cl.cls<=2;
      // evaluate effects on each ULS combo's own coincident (My, phi, Mw) fields
      const SwChan=(chan&&sec.tp)? Math.max(sec.tp.Sw2||0,sec.tp.Sw3||0)*1e4 : 0;
      let cross={u:-1}, grids=[], tauT=0, tauW=0, TtEnds=[0,0], MwMaxAbs=0, MzMax=0, phiUmax=0, MyAtCross=0;
      let vt={u:-1,x:0,V:0,T:0,tauT:0,tauW:0,VplTRd:VcRd,combo:'',zeroCapacity:false};
      O.sols.forEach(se=>{
        const g=se.sol, fb=se.fb;
        const rows=g.xs.map((x,i)=>{
          const My=Math.abs(interpAt(fb.xs,fb.M,x))/1e6;         // kNm
          const Vx=Math.abs(interpAt(fb.xs,fb.V,x))/1000;        // kN, coincident shear
          const phi=g.phi[i];
          const Mw=Math.abs(EIw*g.p2[i]/hh)/1e6;                 // kNm, per flange
          const Mz=Math.abs(phi*interpAt(fb.xs,fb.M,x)/1e6);     // kNm (phi*My)
          const Tt=Math.abs(O.GIt*g.p1[i])/1e6;                  // kNm, coincident St Venant torque
          const tauTi=Tt*1e6*sec.tw/O.IT;                        // N/mm2
          const tauWi=SwChan? Math.abs(210000*SwChan*g.p3[i]/sec.tw) : 0;
          const VplTRdi=chan
            ? Math.max(0,(Math.sqrt(Math.max(0,1-tauTi/(1.25*cshear)))-tauWi/cshear))*VcRd
            : Math.sqrt(Math.max(0,1-tauTi/(1.25*cshear)))*VcRd;
          const vu=shearTorsionUtil(VplTRdi,Vx);
          if(vu>vt.u) vt={u:vu,x,V:Vx,T:Tt,tauT:tauTi,tauW:tauWi,VplTRd:VplTRdi,combo:se.combo.label,zeroCapacity:VplTRdi<=1e-9&&Vx>1e-9};
          tauT=Math.max(tauT,tauTi);
          tauW=Math.max(tauW,tauWi);
          const u=cls12? Math.pow(My/Mply,2)+Mw/Mplf+Mz/Mplz
                        : My/Mely+Mz/Melz+Mw/Melf;
          return {x,My,phi,Mw,Mz,u};
        });
        rows.forEach(r2=>{ if(r2.u>cross.u) cross={...r2,combo:se.combo.label};
          MwMaxAbs=Math.max(MwMaxAbs,r2.Mw); MzMax=Math.max(MzMax,r2.Mz); phiUmax=Math.max(phiUmax,Math.abs(r2.phi)); });
        grids.push({combo:se.combo,rows});
        const n=g.xs.length;
        const Tt0=O.GIt*g.p1[0]/1e6, TtL=O.GIt*g.p1[n-1]/1e6;    // kNm
        if(Math.abs(Tt0)>Math.abs(TtEnds[0])) TtEnds[0]=Tt0;
        if(Math.abs(TtL)>Math.abs(TtEnds[1])) TtEnds[1]=TtL;
      });
      const VplTRd=vt.VplTRd;                                                          // coincident V-T sweep, Eq 6.26/6.27
      // Method A comparison (simplified flange couple - conservative)
      let MwA=0; { let Tud=0;
        (O.sols[0]? O.sols[0].sol.xs:[]);
        // rebuild from the governing-moment combo torque set magnitudes
      }
      // simplified Mw: point torques -> flange SS BM; ud/lin -> F L/8
      const gm=O.sols.find(se=>se.combo===a.governM.combo)||O.sols[0];
      tor={box:false,p385:true,TEd:a.tors.Tmax,governT:a.tors.governT,tp:sec.tp||null,
        e0:(sec.tp&&sec.tp.e0!=null)? sec.tp.e0 : (sec.e0!=null? sec.e0*10 : null),
        esc:(sec.tp&&sec.tp.esc!=null)? sec.tp.esc : null,
        aa:O.aa,X:O.X,IT:O.IT,Iw:O.Iw,chan,cls12,
        Mply,Mplz,Mplf,Mely,Melz,Melf,
        cross,grids,MwMax:MwMaxAbs,MzMax,phiUmax,
        TtEnds,tauT,tauW,VplTRd,vt,vtUtil:vt.u, vtZeroCapacity:!!vt.zeroCapacity,
        phiSer:O.sls? Math.abs(O.sls.phiMax):0, phiSerDeg:O.sls? Math.abs(O.sls.phiMax)*180/Math.PI:0,
        phiSerPos:O.sls? O.sls.phiPos/1000:0, governTw:O.sls? O.sls.combo.label:'',
        GIt:O.GIt};
    } else {
      unsupported.push("Torsion on this open section is NOT COVERED: "+((a.torsO&&a.torsO.reason)||"the P385 St Venant + warping analysis requires a warping constant")+".");
      tor={box:false,TEd:a.tors.Tmax,governT:a.tors.governT,tp:sec.tp||null,
        e0:(sec.tp&&sec.tp.e0!=null)? sec.tp.e0 : (sec.e0!=null? sec.e0*10 : null),
        esc:(sec.tp&&sec.tp.esc!=null)? sec.tp.esc : null};
    }
  }
  return {tor, unsupported};
}

function checksEC3Restrained(a){
  // SCI worked-example procedure: fully laterally restrained beam to BS EN 1993-1-1 (UK NA).
  // Sequence: classification -> shear (6.2.6) -> shear buckling screen (6.2.6(6)) ->
  // moment (6.2.5, with the 6.2.8 shear check made AT the point of maximum moment) ->
  // vertical deflection (NA 2.23).
  const sec=a.sec, fy=a.py;
  const unsupported=[];
  const eps=epsEC3(fy);
  const gM0=1.0, eta=1.0; // UK NA gammaM0; eta=1.0 taken conservatively (EN 1993-1-5)
  const cl=classifyEC3(sec,eps);
  const clsName=["","Class 1","Class 2","Class 3","Class 4"][cl.cls];
  if(cl.cls>=4) unsupported.push("EC3 Class 4 (slender) section: effective-section properties per EN 1993-1-5 are required; not covered by the restrained-beam procedure.");
  const F=S.axial||0;
  const ax=axialInteractionEC3(a,sec,fy,cl,gM0);   // cl 6.2.9 cross-section axial + major-axis bending
  // geometry
  const hw=sec.D-2*sec.tf;                                   // clear web depth h - 2tf
  const cOut = sec.kind==='I'? (sec.B-sec.tw-2*sec.r)/2 : null; // outstand flange width
  // shear area, cl 6.2.6(3)
  const A=sec.A*100; let Av,AvRaw=null,avFloor=null;
  if(sec.isBox){ Av=A*sec.D/(sec.D+sec.B); }
  else if(sec.kind==='channel'){ Av=A-2*sec.B*sec.tf+(sec.tw+sec.r)*sec.tf; }
  else { AvRaw=A-2*sec.B*sec.tf+(sec.tw+2*sec.r)*sec.tf; avFloor=eta*hw*sec.tw; Av=Math.max(AvRaw,avFloor); }
  const VcRd=Av*fy/(Math.sqrt(3)*gM0)/1000;                   // kN
  const Fv=Math.abs(a.Vmax);
  const shearUtil=VcRd>0? Fv/VcRd : 0;
  // shear buckling screen, cl 6.2.6(6): hw/tw <= 72 eps/eta (unstiffened web)
  const sbRatio = sec.isBox? sec.dt : hw/sec.tw;
  const sbLimit = 72*eps/eta;
  const sbOk = sbRatio<=sbLimit+1e-9;
  if(!sbOk) unsupported.push("h_w/t_w exceeds 72*eps/eta: web shear-buckling resistance per EN 1993-1-5 must be checked and is not implemented in this calculator.");
  // torsion (cl 6.2.7): pre-solved in analyse() into a.tors / a.torsO
  const _tors=evaluateTorsionEC3(a,sec,cl,fy,gM0,VcRd,Fv);
  const tor=_tors.tor;
  _tors.unsupported.forEach(m=>unsupported.push(m));
  if(a.torsErr) unsupported.push("Eccentric loads are active but torsion cannot be evaluated: "+a.torsErr+".");
  // moment resistance, cl 6.2.5, with the cl 6.2.8 shear check at the point of maximum moment
  const Zx=sec.Zx*1e3, Sx=sec.Sx*1e3;
  const Wy = cl.cls<=2? Sx : Zx;
  let McRd=Wy*fy/gM0/1e6;                                     // kN.m
  const gfb=a.governM.fb;
  const VatM=Math.abs(interpAt(gfb.xs,gfb.V,a.Mpos*1000))/1000; // kN, shear at x of Mmax (governing combo)
  const VplMoment=(tor&&tor.VplTRd!=null)? tor.VplTRd : VcRd;
  const halfVpl=0.5*VplMoment; // cl 6.2.8(4): use Vpl,T,Rd when torsion is present
  const lowShearAtM = VatM<=halfVpl+1e-9;
  let hsNote=null;
  if(!lowShearAtM){
    if(VatM>VplMoment+1e-9){
      hsNote="V<sub>Ed</sub> at the point of maximum moment exceeds V<sub>pl,Rd</sub>: the member has already failed the pure shear resistance check, so the cl 6.2.8 reduced moment formula is not valid";
    } else if(cl.cls<=2 && sec.kind==='I'){
      const rho=Math.min(Math.pow(2*VatM/VplMoment-1,2),1);
      const Sv=Av*Av/(4*sec.tw);
      McRd=Math.min(McRd,Math.max((Sx-rho*Sv)*fy/gM0/1e6,0));
      hsNote="V<sub>Ed</sub> at the point of maximum moment exceeds 0.5V<sub>pl,Rd</sub>: moment resistance reduced per cl 6.2.8(3) with &rho;=(2V<sub>Ed</sub>/V<sub>pl,Rd</sub>&minus;1)&sup2;";
    } else {
      unsupported.push("High shear coincident with the maximum moment: the cl 6.2.8 reduced moment resistance for this section family/class is not implemented.");
    }
  }
  if(ax && !lowShearAtM) unsupported.push("High shear coincident with axial force: the combined cl 6.2.10 reduction is not implemented; PASS is blocked.");
  const Mx=Math.abs(a.Mmax);
  const momUtil=McRd>0? Mx/McRd : 0;
  // span-wise coexistent M-V check (cl 6.2.8): rolled I/H Class 1/2 only; at
  // every x with V > 0.5*Vpl(,T),Rd the moment is checked against the reduced
  // Mv,Rd = (Wpl - rho*Av^2/(4tw))*fy. Other families keep the at-max-moment check.
  let coex=null;
  if(sec.kind==='I' && cl.cls<=2){
    const VplB=(tor&&tor.VplTRd!=null)? tor.VplTRd : VcRd;
    const Sv=Av*Av/(4*sec.tw);
    let worst={u:momUtil,x:a.Mpos*1000,red:false};
    gfb.xs.forEach((x,i)=>{
      const Vx=Math.abs(gfb.V[i])/1e3, Mxx=Math.abs(gfb.M[i])/1e6;
      if(Mxx<1e-9) return;
      let MvRd=McRd;
      if(Vx>VplB+1e-9){
        const u=Vx/Math.max(VplB,1e-9);
        if(!worst.pureShearFail || Mxx>worst.M+1e-9 || (Math.abs(Mxx-worst.M)<=1e-9 && u>worst.u))
          worst={u,x,red:true,pureShearFail:true,V:Vx,M:Mxx,VplRd:VplB,MvRd:null};
        return;
      } else if(Vx>0.5*VplB){
        const rho=Math.min(Math.pow(2*Vx/VplB-1,2),1);
        MvRd=Math.min(McRd,Math.max((Sx-rho*Sv)*fy/gM0/1e6,0));
      }
      const u=Mxx/Math.max(MvRd,1e-9);
      if(!worst.pureShearFail && u>worst.u) worst={u,x,red:true,V:Vx,M:Mxx,MvRd};
    });
    if(worst.red){
      coex=worst;
      if(!hsNote) hsNote=worst.pureShearFail
        ? "Coexistent shear and moment (cl 6.2.8): at x = "+(worst.x/1000).toFixed(2)+" m, V<sub>Ed</sub> = "+worst.V.toFixed(0)+" kN exceeds V<sub>pl,Rd</sub> = "+worst.VplRd.toFixed(0)+" kN, so pure shear failure governs and the reduced M<sub>v,Rd</sub> formula is not valid"
        : "Coexistent shear and moment (cl 6.2.8): at x = "+(worst.x/1000).toFixed(2)+" m, V<sub>Ed</sub> = "+worst.V.toFixed(0)+" kN &gt; 0.5V<sub>pl,Rd</sub> and the reduced M<sub>v,Rd</sub> = "+worst.MvRd.toFixed(0)+" kN&middot;m governs";
    }
  }
  // vertical deflection (NA 2.23) - governing enabled SLS combination
  const span=a.L, divisor=S.divisor||360, dlimit=span/divisor;
  const dmax=Math.abs(a.dmax), defOk=dmax<=dlimit;
  const isCantR=(S.supports.length===1 && S.supports[0].type==='fixed');
  const buck=(ax && !ax.tension)? annexB2(a,sec,fy,cl,McRd,true,isCantR) : null; // fully restrained: not susceptible -> Table B.1; MbRd = Mc,Rd
  const utils=[
    {name:"Shear  V_Ed/V_c,Rd",val:shearUtil},
    {name:"Bending  M_Ed/M_c,Rd",val:momUtil},
    {name:"Deflection",val:dmax/dlimit},
  ];
  if(ax){
    utils.push({name: ax.tension? "Tension  N_Ed/N_t,Rd" : "Compression  N_Ed/N_pl,Rd", val:ax.nUtil});
    utils.push({name:"Bending+axial cross-section (6.2.9)",val:ax.mUtil});
    if(!ax.tension && buck){
      utils.push({name:"Member buckling y-y (Eq 6.61)",val:buck.u1});
      utils.push({name:"Member buckling z-z (Eq 6.62)",val:buck.u2});
    }
  }
  if(coex) utils.push({name:coex.pureShearFail? "Pure shear failure at M-V check point (6.2.6)" : "Bending+shear coexistent (6.2.8)",val:coex.u});
  if(tor&&tor.box){
    utils.push({name:"Torsion  T_Ed/T_Rd",val:tor.torUtil});
    utils.push({name:"Shear+torsion  V_Ed/V_pl,T,Rd",val:tor.vtUtil});
  }
  if(tor&&tor.p385){
    utils.push({name:"Bending+torsion cross-section (P385 3.1.2)",val:tor.cross.u});
    utils.push({name:"Shear+torsion  V_Ed/V_pl,T,Rd",val:tor.vtUtil});
  }
  let gov=utils[0]; utils.forEach(u=>{ if(u.val>gov.val) gov=u; });
  const pass=unsupported.length===0 && utils.every(u=>u.val<=1.0001);
  return {sci:true,tor,coex,ax,buck,eps,cl,clsName,unsupported,fy,eta,hw,cOut,Av,AvRaw,avFloor,VcRd,Fv,shearUtil,
    sbRatio,sbLimit,sbOk,Zx,Sx,Wy,McRd,hsNote,VatM,halfVpl,lowShearAtM,Mx,momUtil,F,
    span,divisor,dlimit,dmax,defOk,utils,gov,pass};
}

function sn003aC1(a,isCant){
  // C1 for the Mcr calculation (SN003a Table 3.1/3.2) and 1/sqrt(C1) for the
  // P362 Eq 6.55 simplified slenderness / NA 2.18 kc factor.
  if(S.C1o!=null) return {C1:S.C1o, C2:null, label:'user override'};
  if(isCant) return {C1:1.0, C2:null, label:'cantilever'};
  const Mm=Math.abs(a.Mmax);
  if(Mm<1e-9) return {C1:1.0, C2:0, label:'negligible moment'};
  const endLevel=Math.max(Math.abs(a.M0end),Math.abs(a.MLend))/Mm;
  const fbM=a.governM.fb;
  const Mat=x=>interpAt(fbM.xs,fbM.M,x)/1e6;
  if(endLevel>0.98){
    const psi=Math.max(-1,Math.min(1,a.MLend/(a.M0end||1e-9)));
    const c=Math.pow(1.33-0.33*psi,2); // SCI curve C1=(1.33-0.33psi)^2 = 1.77-0.88psi+0.11psi^2 (NA kc inverted)
    return {C1:c, C2:0, label:'linear end-moment gradient, &psi; = '+psi.toFixed(2)+' (SCI curve, NA 2.18)'};
  }
  if(endLevel<0.02){
    // identify the transverse-load shape from the governing BMD: quarter-point/midspan ratio
    const r=(Math.abs(a.Mq)+Math.abs(a.Mq3))/(2*Mm);
    if(Math.abs(r-0.75)<=0.02) return {C1:1.127, C2:0.454, label:'simply supported + uniformly distributed load (SN003a Table 3.2)'};
    if(Math.abs(r-0.50)<=0.02) return {C1:1.348, C2:0.630, label:'simply supported + central point load (SN003a Table 3.2)'};
  }
  { // general diagram: Serna et al. quarter-point expression (SCI, NSC Nov 2013)
    const L=a.L, Mm=Math.max(Math.abs(a.Mmax),1e-9);
    const M2=Mat(L/4), M3=Mat(L/2), M4=Mat(3*L/4);
    const c=sernaC1(Mm,M2,M3,M4);
    return {C1:c, C2:null, label:'general moment diagram &mdash; Serna et al. quarter-point expression (SCI): M(L/4)='+M2.toFixed(1)+', M(L/2)='+M3.toFixed(1)+', M(3L/4)='+M4.toFixed(1)+', M<sub>max</sub>='+Mm.toFixed(1)+' kN&middot;m'};
  }
}

function checksEC3UnrestrainedSCI(a){
  // SCI worked-example procedure: unrestrained beam to BS EN 1993-1-1 (UK NA).
  // Cross-section checks are identical to the restrained case; LTB is verified by
  // BOTH published routes: (A) simplified slenderness, P362 Expn (6.55)
  // lamLT = (1/sqrt(C1))*0.9*lamZbar*sqrt(betaW); (B) elastic critical moment,
  // SN003a with zg=0, k=kw=1, G=81000 N/mm2. chiLT per cl 6.3.2.3 with
  // lamLT0=0.4, beta=0.75 (NA 2.17), curve from NA Table 6.3 (h/b<=2: b;
  // 2<h/b<=3.1: c; h/b>3.1: d), then chiLT,mod = chiLT/f with kc = 1/sqrt(C1)
  // (NA 2.18). Design basis: route (A); if (A) is exceeded but (B) passes,
  // adequacy is taken from (B), which the SCI example itself shows is the
  // accurate value ((A) can be significantly conservative).
  const b=checksEC3Restrained(a);
  const sec=a.sec, fy=a.py, E=a.E, gM1=1.0;
  const unsupported=b.unsupported.slice();
  const Wy=b.Wy;
  const isCant=(S.supports.length===1 && S.supports[0].type==='fixed');
  const LE=S.leFactor*(S.destab?1.2:1)*a.L;
  const c1r=sn003aC1(a,isCant);
  const C1=c1r.C1, invSqrtC1=1/Math.sqrt(C1), kc=invSqrtC1;
  let ltb;
  if(sec.isBox){
    // SCI hollow-section example: check the slenderness explicitly. Warping is
    // neglected (Iw ~ 0 for a closed section): Mcr = C1*(pi^2*E*Iz/L^2)*sqrt(GIt/(pi^2*E*Iz/L^2)).
    const G=81000, Iz=sec.Iy*1e4, It=sec.J*1e4;
    const T1=Math.PI*Math.PI*E*Iz/(LE*LE);
    const Mcr=C1*T1*Math.sqrt(Math.max(G*It/T1,0));
    const lamLT=Math.sqrt(Wy*fy/Mcr);
    let Phi=null,chi=1,f=1,chiMod=1,ign=true;
    if(lamLT>0.4){ // hollow sections are not listed in NA Table 6.3 -> curve d
      const alphaLT=0.76;
      Phi=0.5*(1+alphaLT*(lamLT-0.4)+0.75*lamLT*lamLT);
      chi=Math.min(1/(Phi+Math.sqrt(Math.max(Phi*Phi-0.75*lamLT*lamLT,1e-12))),1,1/(lamLT*lamLT));
      f=Math.min(1-0.5*(1-kc)*(1-2*Math.pow(lamLT-0.8,2)),1);
      chiMod=Math.min(chi/f,1,1/(lamLT*lamLT)); ign=false;
    }
    const Mb=Math.min(chiMod*Wy*fy/gM1/1e6,b.McRd);
    ltb={na:true, box:true, T1:T1/1e3, Mcr:Mcr/1e6, lamLTmcr:lamLT, ignM:ign,
      PhiM:Phi, chiM:chi, fM:f, chiModM:chiMod, MbSimp:Mb, MbMcr:Mb, MbRd:Mb};
  } else if(isCant && sec.kind==='I'){
    // NCCI SN006a-EN-EU cantilever path (doubly symmetric I/H):
    // Mcr = C*Mcr0; the SN006a boundary conditions replace the effective-length
    // machinery (L_E factor / destabilising switch are NOT applied here; the
    // load height enters through eta, warping via the root condition).
    const G=81000, Iz=sec.Iy*1e4, It=sec.J*1e4, Iw=(sec.Iw||0)*1e12;
    const Lc=a.L;
    const Mcr0=Math.PI/Lc*Math.sqrt(E*Iz*G*It);        // N.mm
    const kwt=Math.sqrt(E*Iw/(G*It))/Lc;
    const hs=sec.D-sec.tf;
    const eta=(+S.za||0)/(hs/2);
    const warp=(S.rootWarp==='restrained')?'restr':'free';
    // classify tip loading from the loads (2% de-minimis on the support moment)
    let Mq=0,MF=0,Mm2=0,nF2=0,nM2=0,other=false;
    const gfac=a.governM.combo.factors;
    S.loads.forEach(ld=>{
      if(ld.isSelfWeight) return;
      const f=gfac[ld.case]??0; if(!f) return; // zero-factor loads do not shape this combination
      if(ld.type==='udl'&&(+ld.x1)<=1e-6&&Math.abs((+ld.x2)-S.L)<=1e-6) Mq+=(ld.w||0)*f*S.L*S.L/2;
      else if(ld.type==='point'&&Math.abs((+ld.pos)-S.L)<=0.02*S.L){ MF+=(ld.P||0)*f*S.L; nF2++; }
      else if(ld.type==='moment'&&Math.abs((+ld.pos)-S.L)<=0.02*S.L){ Mm2+=Math.abs(ld.M||0)*f; nM2++; }
      else other=true;
    });
    Mq+=(a.swPerM||0)*(gfac.G??0)*S.L*S.L/2;
    const tot=Math.abs(Mq)+Math.abs(MF)+Mm2;
    const dm=0.02*Math.max(tot,1e-9);
    const hasQ=Math.abs(Mq)>dm, hasF=Math.abs(MF)>dm, hasM=Mm2>dm;
    let C=null,Cq=null,CF=null,caseLbl='';
    if(other||hasM&&(hasQ||hasF)||nM2>1){ C=null; caseLbl='loading outside SN006a Tables 3.1-3.3'; }
    else if(hasM&&!hasQ&&!hasF){ C=sn006C('M',warp,kwt,0); caseLbl='external moment at the free end (Table 3.3)'; }
    else if(hasQ&&hasF){ Cq=sn006C('q',warp,kwt,eta); CF=sn006C('F',warp,kwt,eta);
      if(Cq!=null&&CF!=null) C=(Math.abs(Mq)+Math.abs(MF))/(Math.abs(Mq)/Cq+Math.abs(MF)/CF);
      caseLbl='uniform load + tip point load, interaction Eq (7)'; }
    else if(hasQ){ C=sn006C('q',warp,kwt,eta); caseLbl='uniformly distributed load (Table 3.1)'; }
    else if(hasF){ C=sn006C('F',warp,kwt,eta); caseLbl='point load at the free end (Table 3.2)'; }
    else { C=sn006C('q',warp,kwt,eta); caseLbl='self-weight only (Table 3.1)'; }
    if(C==null){
      if(kwt>1) unsupported.push("Cantilever LTB: &kappa;<sub>wt</sub> = "+kwt.toFixed(2)+" exceeds the SN006a table range (0&ndash;1); use a longer cantilever, a torsionally stiffer section, or a specialist tool (LTBeam).");
      else if(Math.abs(eta)>0&&(eta<-2||eta>3)) unsupported.push("Cantilever LTB: load-height parameter &eta; = "+eta.toFixed(2)+" is outside the SN006a table range (&minus;2 to +3).");
      else unsupported.push("Cantilever LTB: "+caseLbl+" &mdash; not covered by SN006a; PASS is blocked (conservative C1=1.0 route removed in favour of the published method).");
      ltb={na:false,cant:true,Mcr0:Mcr0/1e6,kwt,eta,warp,caseLbl,C:0,Cq,CF,Mq,MF,
        lamLTsimp:0,lamLTmcr:0,ignS:true,ignM:true,chiM:1,fM:1,chiModM:1,PhiM:null,
        curve:{alphaLT:0,curve:'-'},kc:1,invSqrtC1:1,MbSimp:0,MbMcr:0,MbRd:0,Mcr:0,T1:0,IwIz:0,GIt:0};
    } else {
      const Mcr=C*Mcr0;
      const lamLT=Math.sqrt(Wy*fy/Mcr);
      const hb=sec.D/sec.B;
      const curve = hb<=2? {alphaLT:0.34,curve:'b'} : hb<=3.1? {alphaLT:0.49,curve:'c'} : {alphaLT:0.76,curve:'d'};
      let Phi=null,chi=1,f=1,chiMod=1,ign=true;
      if(lamLT>0.4){
        Phi=0.5*(1+curve.alphaLT*(lamLT-0.4)+0.75*lamLT*lamLT);
        chi=Math.min(1/(Phi+Math.sqrt(Math.max(Phi*Phi-0.75*lamLT*lamLT,1e-12))),1,1/(lamLT*lamLT));
        f=1; // kc/f-factor not applied for cantilevers (no published kc)
        chiMod=chi; ign=false;
      }
      const Mb=Math.min(chiMod*Wy*fy/gM1/1e6,b.McRd);
      ltb={na:false,cant:true,Mcr0:Mcr0/1e6,kwt,eta,warp,caseLbl,C,Cq,CF,Mq,MF,
        lamLTsimp:lamLT,lamLTmcr:lamLT,PhiS:Phi,chiS:chi,ignS:ign,
        PhiM:Phi,chiM:chi,fM:1,chiModM:chiMod,ignM:ign,curve,kc:1,invSqrtC1:1,
        lamZ:0,lam1:0,lamZbar:0,rootBw:1,hb,
        MbSimp:Mb,MbMcr:Mb,MbRd:Mb,Mcr:Mcr/1e6,McrBack:Mcr/1e6,T1:0,IwIz:0,GIt:0,fS:1,chiModS:chiMod};
    }
  } else if(sec.kind==='channel'){
    // P385 / P362 channel chain (spec 13.4): lamLT = (L/i_z)/kappa, curve d,
    // rolled-section chi formulas (validated: Ex 4 chi = 0.29), no f-factor;
    // M_cr back-calculated = W_y*f_y / lamLT^2 (needed for the Annex A k_alpha).
    const ry=sec.ry*10;
    const kappa=({S275:96,S355:85,S460:74})[S.grade]||96;
    const lamLT=(LE/ry)/kappa;
    const alphaLT=0.76; // curve d (non-doubly-symmetric)
    let chi=1,Phi=null,ign=true;
    if(lamLT>0.4){
      Phi=0.5*(1+alphaLT*(lamLT-0.4)+0.75*lamLT*lamLT);
      chi=Math.min(1/(Phi+Math.sqrt(Math.max(Phi*Phi-0.75*lamLT*lamLT,1e-12))),1,1/(lamLT*lamLT));
      ign=false;
    }
    const Mb=chi*Wy*fy/gM1/1e6;
    const McrBack=Wy*fy/(lamLT*lamLT)/1e6;
    // Mcr route for channels: a PFC bent about its major axis is symmetric about
    // the axis of bending (Wagner term zj = 0), so with the load through the
    // SHEAR CENTRE and fork supports at both ends the doubly-symmetric Mcr
    // expression is theoretically exact (validated against the MasterSeries
    // channel example: Mcr 330.9, chi 0.881, f 0.838, Mb = Mc 97.625). Route is
    // OFFERED only under those conditions: no active torsion (e = 0 everywhere),
    // z_a = 0, two end fork supports (not a cantilever). The kappa chain stays
    // the primary basis; the Mcr route rescues it, mirroring the I-section pattern.
    let chanMcr=null;
    const chanMcrOK = !(a.tors&&a.tors.on) && Math.abs(+S.za||0)<1e-9 && !isCant &&
      S.supports.length===2 && Math.min(...S.supports.map(s=>+s.pos))<=1e-6 &&
      Math.abs(Math.max(...S.supports.map(s=>+s.pos))-S.L)<=1e-6 && (sec.Iw||0)>0;
    let MbMcr2=Mb;
    if(chanMcrOK){
      const G=81000, Iz=sec.Iy*1e4, It=sec.J*1e4, Iw=(sec.Iw||0)*1e12;
      const T1c=Math.PI*Math.PI*E*Iz/(LE*LE);
      const McrC=C1*T1c*Math.sqrt(Math.max(Iw/Iz+G*It/T1c,0));
      const lamC=Math.sqrt(Wy*fy/McrC);
      let PhiC=null,chiC=1,fC=1,chiModC=1,ignC=true;
      if(lamC>0.4){
        PhiC=0.5*(1+0.76*(lamC-0.4)+0.75*lamC*lamC);
        chiC=Math.min(1/(PhiC+Math.sqrt(Math.max(PhiC*PhiC-0.75*lamC*lamC,1e-12))),1,1/(lamC*lamC));
        fC=Math.min(1-0.5*(1-invSqrtC1)*(1-2*Math.pow(lamC-0.8,2)),1);
        chiModC=Math.min(chiC/fC,1,1/(lamC*lamC)); ignC=false;
      }
      MbMcr2=Math.min(chiModC*Wy*fy/gM1/1e6, b.McRd);
      chanMcr={Mcr:McrC/1e6,lam:lamC,Phi:PhiC,chi:chiC,f:fC,chiMod:chiModC,ign:ignC,Mb:MbMcr2,T1:T1c/1e3};
    }
    ltb={na:false,channel:true,chanMcr,ry,kappa,lamLTsimp:lamLT,lamLTmcr:lamLT,PhiS:Phi,chiS:chi,ignS:ign,
      PhiM:Phi,chiM:chi,fM:1,chiModM:chi,ignM:ign,curve:{alphaLT:0.76,curve:'d'},kc:invSqrtC1,invSqrtC1,
      lamZ:LE/ry,lam1:0,lamZbar:0,rootBw:1,hb:sec.D/sec.B,
      MbSimp:Mb,MbMcr:MbMcr2,MbRd:Mb,Mcr:McrBack,McrBack,T1:0,IwIz:0,GIt:0,fS:1,chiModS:chi};
  } else {
    const ry=sec.ry*10;
    const lamZ=LE/ry;
    const lam1=Math.PI*Math.sqrt(E/fy);
    const lamZbar=lamZ/lam1;
    const rootBw=b.cl.cls<=2? 1 : Math.sqrt(sec.Zx/sec.Sx);
    const hb=sec.D/sec.B;
    const curve = hb<=2? {alphaLT:0.34,curve:'b'} : hb<=3.1? {alphaLT:0.49,curve:'c'} : {alphaLT:0.76,curve:'d'};
    const chiChain=(lamLT)=>{
      if(lamLT<=0.4) return {Phi:null,chi:1,f:1,chiMod:1,ign:true};
      const Phi=0.5*(1+curve.alphaLT*(lamLT-0.4)+0.75*lamLT*lamLT);
      let chi=1/(Phi+Math.sqrt(Math.max(Phi*Phi-0.75*lamLT*lamLT,1e-12)));
      chi=Math.min(chi,1,1/(lamLT*lamLT));
      let f=1-0.5*(1-kc)*(1-2*Math.pow(lamLT-0.8,2)); f=Math.min(f,1);
      const chiMod=Math.min(chi/f,1,1/(lamLT*lamLT));
      return {Phi,chi,f,chiMod,ign:false};
    };
    // (A) simplified slenderness
    const lamLTsimp=invSqrtC1*0.9*lamZbar*rootBw;
    const sA=chiChain(lamLTsimp);
    const MbSimp=sA.chiMod*Wy*fy/gM1/1e6;
    // (B) elastic critical moment (SN003a; k=kw=1; C2*zg load-height term when
    // z_a is supplied and C2 is published for the recognised diagram)
    const G=81000;
    const Iz=sec.Iy*1e4, It=sec.J*1e4, Iw=(sec.Iw||0)*1e12;
    const T1=Math.PI*Math.PI*E*Iz/(LE*LE);            // N
    const IwIz=Iw/Iz;                                  // mm2
    const GIt=G*It;                                    // N.mm2
    const zg=(+S.za||0);                               // mm, + above shear centre (destabilising for gravity loads)
    const C2=c1r.C2;
    const zgUsed=(Math.abs(zg)>1e-9 && C2!=null && C2>0);
    const zgTerm=zgUsed? C2*zg : 0;
    const Mcr=C1*T1*(Math.sqrt(Math.max(IwIz+GIt/T1+zgTerm*zgTerm,0))-zgTerm); // N.mm
    const lamLTmcr=Math.sqrt(Wy*fy/Mcr);
    const sB=chiChain(lamLTmcr);
    const MbMcr=sB.chiMod*Wy*fy/gM1/1e6;
    ltb={na:false,ry,lamZ,lam1,lamZbar,rootBw,hb,curve,kc,invSqrtC1,
      lamLTsimp,PhiS:sA.Phi,chiS:sA.chi,fS:sA.f,chiModS:sA.chiMod,ignS:sA.ign,MbSimp,
      T1:T1/1e3,IwIz:IwIz/1e2,GIt:GIt/1e9,Mcr:Mcr/1e6,zg,C2,zgUsed,
      lamLTmcr,PhiM:sB.Phi,chiM:sB.chi,fM:sB.f,chiModM:sB.chiMod,ignM:sB.ign,MbMcr,
      MbRd:MbSimp};
  }
  const Mx=b.Mx;
  let ltbUtil = ltb.MbRd>0? Mx/ltb.MbRd : 0;
  let ltbBasis = ltb.na? 'closed section &mdash; not susceptible to LTB (cl 6.3.2.1(2)), M<sub>b,Rd</sub> = M<sub>c,Rd</sub>' : 'simplified slenderness (P362 Expn 6.55)';
  if(!ltb.na && ltbUtil>1.0001 && ltb.MbMcr>0 && Mx/ltb.MbMcr<=1.0001){
    ltbUtil=Mx/ltb.MbMcr; ltb.MbRd=ltb.MbMcr;
    ltbBasis='M<sub>cr</sub> method (SN003a) &mdash; the simplified route is exceeded, but it is conservative; adequacy is demonstrated by the M<sub>cr</sub> route';
  }
  // ---- BS EN 1993-6 Annex A: LTB + minor-axis bending + torsion interaction (P385 6.2/8.2) ----
  let annex=null;
  if(b.tor && b.tor.p385 && !ltb.na){
    // chi_LT WITHOUT the f-factor (P385 validation basis), curve per table
    const chiA=ltb.channel? ltb.chiM : (ltb.ignM? 1 : ltb.chiM);
    const MbA=chiA*Wy*fy/gM1/1e6;
    const McrA=ltb.channel? ltb.McrBack : ltb.Mcr;
    const Cmz = Math.abs(C1-1.348)<1e-6? 0.9 : Math.abs(C1-1.127)<1e-6? 0.95 : 1.0;
    let MyMax=0; b.tor.grids.forEach(g2=>g2.rows.forEach(r2=>{ MyMax=Math.max(MyMax,r2.My); }));
    // resistances CLASS-CONSISTENT (elastic for Class 3) - required: with plastic
    // values a Class 3 member scores unconservatively (exposed by the MasterSeries
    // UC 152x152x23 warping-torsion example: elastic gives 1.03-1.05 FAIL, plastic
    // would have shown 0.91 PASS).
    const MzR=b.tor.cls12? b.tor.Mplz : b.tor.Melz;
    const MfR=b.tor.cls12? b.tor.Mplf : b.tor.Melf;
    if(MyMax>=McrA*0.999){
      unsupported.push("M_y,Ed reaches the elastic critical moment M_cr: the Annex A amplifier k_alpha is unbounded; the member is inadequate as arranged.");
      annex={u:99,kAlpha:Infinity,Cmz,MbA,McrA,MzR,MfR};
    } else {
      const kAlpha=1/(1-MyMax/McrA);
      let worst={u:-1};
      b.tor.grids.forEach(g2=>g2.rows.forEach(r2=>{
        const kw=Math.max(0.7-0.2*r2.Mw/MfR,0);
        const kzw=Math.max(1-r2.Mz/MzR,0);
        const u=r2.My/MbA + Cmz*r2.Mz/MzR + kw*kzw*kAlpha*r2.Mw/MfR;
        if(u>worst.u) worst={u,x:r2.x,My:r2.My,Mz:r2.Mz,Mw:r2.Mw,kw,kzw,combo:g2.combo.label};
      }));
      annex={...worst,kAlpha,Cmz,MbA,McrA,MzR,MfR};
    }
  }
  // member buckling: susceptible to torsional deformation unless closed section
  // or LTB plays no part (chiLT = 1); cantilever/channel handled per path
  const isCantU=(S.supports.length===1 && S.supports[0].type==='fixed');
  const useB1u = sec.isBox || ltb.na || (ltb.MbRd>=b.McRd*0.9999);
  const buck=(b.ax && !b.ax.tension)? annexB2(a,sec,fy,b.cl,ltb.MbRd>0? ltb.MbRd : b.McRd,useB1u,isCantU) : null;
  const utils=[
    {name:"Shear  V_Ed/V_c,Rd",val:b.shearUtil},
    {name:"Bending  M_Ed/M_c,Rd",val:b.momUtil},
    {name:"LTB  M_Ed/M_b,Rd",val:ltbUtil},
    {name:"Deflection",val:b.dmax/b.dlimit},
  ];
  if(b.ax){
    utils.push({name: b.ax.tension? "Tension  N_Ed/N_t,Rd" : "Compression  N_Ed/N_pl,Rd", val:b.ax.nUtil});
    utils.push({name:"Bending+axial cross-section (6.2.9)",val:b.ax.mUtil});
    if(!b.ax.tension && buck){
      utils.push({name:"Member buckling y-y (Eq 6.61)",val:buck.u1});
      utils.push({name:"Member buckling z-z (Eq 6.62)",val:buck.u2});
    }
  }
  if(annex) utils.push({name:"LTB+torsion (EN 1993-6 Annex A)",val:annex.u});
  if(b.coex) utils.push({name:b.coex.pureShearFail? "Pure shear failure at M-V check point (6.2.6)" : "Bending+shear coexistent (6.2.8)",val:b.coex.u});
  if(b.tor&&b.tor.box){
    utils.push({name:"Torsion  T_Ed/T_Rd",val:b.tor.torUtil});
    utils.push({name:"Shear+torsion  V_Ed/V_pl,T,Rd",val:b.tor.vtUtil});
  }
  if(b.tor&&b.tor.p385){
    utils.push({name:"Bending+torsion cross-section (P385 3.1.2)",val:b.tor.cross.u});
    utils.push({name:"Shear+torsion  V_Ed/V_pl,T,Rd",val:b.tor.vtUtil});
  }
  let gov=utils[0]; utils.forEach(u=>{ if(u.val>gov.val) gov=u; });
  const pass=unsupported.length===0 && utils.every(u=>u.val<=1.0001);
  return Object.assign({},b,{sci:false,sciU:true,unsupported,ltb,ltbUtil,ltbBasis,C1,c1label:c1r.label,LE,utils,gov,pass,annex,buck});
}

