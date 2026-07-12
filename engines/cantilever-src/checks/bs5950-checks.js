function checksBS5950(a){
  const sec=a.sec, py=a.py, E=a.E;
  const unsupported=[];
  const eps=Math.sqrt(275/py);
  const cl = sec.isBox? classifyBox(sec.bT,sec.dt,eps,sec.boxType) : classify(sec.bT,sec.dt,eps,sec.kind);
  const clsName=["","Plastic","Compact","Semi-compact","Slender"][cl.cls];
  if(cl.cls>=4) unsupported.push("BS 5950 slender section: effective-section design is required; gross Zx is not accepted for PASS.");
  // shear   BS 5950 cl 4.2.3: open section Av=tw D; box section Av=A D/(D+B)
  // (for a square SHS, D=B, so this reduces exactly to A/2 as before).
  const Av = sec.isBox? sec.A*100*sec.D/(sec.D+sec.B) : sec.tw*sec.D; // sec.A is cm  for box ? mm ; PFC/UB/UC path unaffected
  const Pv=0.6*py*Av/1000, Fv=Math.abs(a.Vmax);
  const lowShear=Fv<=0.6*Pv;
  const shearBuckle=sec.dt>70*eps;
  if(shearBuckle) unsupported.push("BS 5950 shear buckling check is required and is not implemented in this calculator.");
  // moment capacity
  const Zx=sec.Zx*1e3, Sx=sec.Sx*1e3;
  let Mcx;
  if(cl.cls<=2) Mcx=Math.min(py*Sx,1.2*py*Zx)/1e6;
  else Mcx=py*Zx/1e6;
  let hsNote=null;
  if(!lowShear && cl.cls<=2){
    if(sec.isBox){
      unsupported.push("BS 5950 high-shear moment reduction for box/RHS/SHS sections is section-specific and is not implemented exactly.");
    } else {
      const rho=Math.pow(2*Fv/Pv-1,2);
      const Sv=Av*Av/(4*sec.tw); // mm3, web shear area plastic modulus for open sections
      Mcx=Math.min(py*(Sx-rho*Sv),1.2*py*Zx)/1e6;
      hsNote=`high-shear reduction applied with S<sub>v</sub>=A<sub>v</sub> /(4t<sub>w</sub>)`;
    }
  }
  // effective area & axial
  const Ag=sec.A*1e2, Anet=(S.anet!=null? S.anet*1e2 : Ag);
  const Ke=(S.Ke!=null? S.Ke : (KeByGrade[S.grade]||1.2));
  const Ae=Math.min(Ke*Anet,Ag);
  const Pz=Ae*py/1000;
  const F=S.axial||0;
  const n=Pz>0? Math.abs(F)/Pz : 0;
  // reduced plastic modulus. Only the covered I/H-section path is allowed to
  // feed PASS; box/channel axial+bending is blocked unless exact data is added.
  let Srx=Sx;
  const tEff = sec.isBox? 2*sec.tw : sec.tw;
  if(n>0.02){
    if(sec.isBox || sec.kind==='channel') unsupported.push("BS 5950 axial-load plus major-axis bending requires section-family-specific reduced modulus data; this calculator does not use an adapted approximate formula for PASS.");
    else Srx=Math.max(0, Sx-(Ag*Ag*n*n)/(4*tEff));
  }
  const Mrx=py*Srx/1e6;
  const Mx=Math.abs(a.Mmax);
  const localUtil=Mrx>0? Mx/Mrx : 0;
  // m-factors
  const isCant=(S.supports.length===1 && S.supports[0].type==='fixed');
  const mf=mFactors(a.Mq,a.Mh,a.Mq3,a.Mmax,a.M24);
  let mLT=isCant?1:mf.mLT, mx=mf.mx;
  if(S.mLTo!=null) mLT=S.mLTo;
  if(S.mxo!=null) mx=S.mxo;
  // LTB   BS 5950 box-section path. SHS naturally returns very low ?LT because
  // Ix Iy; RHS uses the closed-section ?LT expression rather than a rough Table
  // 15 screen.
  const LE=S.leFactor*(S.destab?1.2:1)*a.L;
  const ry=sec.ry*10;
  let lam=null,v=null,betaW=null,lamLT=null,pb=null,lamL0=null,Mb,ltbUtil,rhsFlag=false,phiB=null,gammaPrime=null;
  if(sec.isBox){
    lam=LE/ry; lamL0=0.4*Math.sqrt(Math.PI*Math.PI*E/py);
    betaW=cl.cls<=2?1:Zx/Sx;
    const Ixmm=sec.Ix*1e4, Iymm=sec.Iy*1e4, Jmm=sec.J*1e4;
    gammaPrime=Math.max(0,(1-Iymm/Ixmm)*(1-Jmm/(2.6*Ixmm)));
    phiB=Math.sqrt(Math.max((Sx*Sx*gammaPrime)/(Ag*Jmm),0));
    lamLT=2.25*Math.sqrt(Math.max(phiB*lam*betaW,0));
    ({pb,lamL0}=pbFunc(lamLT,py,E));
    Mb=Math.min((cl.cls<=2? pb*Sx : pb*Zx)/1e6, Mcx);
    mLT=1; ltbUtil=Mb>0? Mx/Mb : 0;
  } else {
    lam=LE/ry;
    v=1/Math.pow(1+0.05*Math.pow(lam/sec.x,2),0.25);
    betaW=cl.cls<=2?1:Zx/Sx;
    lamLT=sec.u*v*lam*Math.sqrt(betaW);
    ({pb,lamL0}=pbFunc(lamLT,py,E));
    Mb=(cl.cls<=2? pb*Sx : pb*Zx)/1e6;
    ltbUtil=Mb>0? Mx/Mb : 0;
  }
  // strut (axial term)   rx=ry for a square SHS, so Pc=Pcy automatically there;
  // for UB the major/minor axis curves genuinely differ (Table 23).
  const autoRob = defaultRobertson(S.family,sec.boxType,sec.tf);
  const a_robX = S.robX!=null? S.robX : autoRob.x;
  const a_robY = S.robY!=null? S.robY : autoRob.y;
  const rx=sec.rx*10;
  const pcx=pcFunc(LE/rx,py,a_robX,E), pcy=pcFunc(LE/ry,py,a_robY,E);
  const Pc=Ag*pcx/1000, Pcy=Ag*pcy/1000;
  const Fc=Math.max(F,0);
  if(Fc>0 && sec.kind==='channel') unsupported.push("BS 5950 PFC/channel compression must use the UK channel strut approach/Table 25 or verified Blue Book data; the previous generic Robertson placeholder is not accepted.");
  const pyZx=py*Zx/1e6;
  const u1=Fc/Pc + mx*Mx/pyZx;
  const u2=Fc/Pcy + mLT*Mx/Mb;
  // deflection
  const span=a.L, divisor=S.divisor||360, dlimit=span/divisor;
  const dmax=Math.abs(a.dmax), defOk=dmax<=dlimit;

  if(S.eccOn && S.loads.some(ld=>Math.abs(ld.e||0)>1e-9)) unsupported.push("Load eccentricity / torsion design is implemented for the EC3 code path only; switch Design code to EC3.");
  const utils=[
    {name:"Shear  Fv/Pv",val:Fv/Pv},
    {name:"Bending  Mx/Mrx",val:localUtil},
    {name: sec.isBox? "Mx/Mcx":"LTB  Mx/Mb", val:ltbUtil},
    {name:"Buckling (in-plane)",val:u1},
    {name:"Buckling (LTB interaction)",val:u2},
    {name:"Deflection",val:dmax/dlimit},
  ];
  let gov=utils[0]; utils.forEach(u=>{ if(u.val>gov.val) gov=u; });
  const pass=unsupported.length===0 && utils.every(u=>u.val<=1.0001);

  return {eps,cl,clsName,unsupported,Av,Pv,Fv,lowShear,shearBuckle,Mcx,hsNote,Zx,Sx,rhsFlag,
    Ag,Anet,Ke,Ae,Pz,F,n,Srx,Mrx,Mx,localUtil,isCant,mLT,mx,mf,
    LE,lam,v,betaW,phiB,gammaPrime,lamLT,pb,lamL0,Mb,ltbUtil,a_robX,a_robY,pcx,pcy,Pc,Pcy,Fc,pyZx,u1,u2,
    span,divisor,dlimit,dmax,defOk,utils,gov,pass};
}

