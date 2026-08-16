/* Aurora 2.0 canonical Finance -> Transfer -> Registration workflow contract. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.AuroraTransferMission=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const STATUS=Object.freeze({DRAFT:'DRAFT',READY:'READY',LOCKED:'LOCKED',PARTIAL:'PARTIALLY_REGISTERED',COMPLETE:'COMPLETE',CANCELLED:'CANCELLED',ERROR:'ERROR'});
  const num=v=>Math.max(0,Number(v)||0);
  const arr=v=>Array.isArray(v)?v:[];
  const round=v=>Number(num(v).toFixed(2));
  const broker=v=>{const s=String(v||'').toLowerCase();return s.includes('212')?'T212':(/\big\b/.test(s)||s.includes('ig isa'))?'IG':String(v||'').toUpperCase()};
  const ticker=v=>String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').toUpperCase().trim();
  const stableLegId=(missionId,a,index)=>String(a.legId||a.leg_id||`${missionId}-${ticker(a.ticker)}-${broker(a.account)||index+1}`);

  function create({id,paydayDate,amount,strategy,createdAt,financeSnapshot}){
    const stamp=createdAt||new Date().toISOString();
    return {id,mission_id:id,paydayDate:paydayDate||'',sourceRelease:{paydayDate:paydayDate||'',releaseAmount:round(amount)},createdAt:stamp,
      transferAmount:round(amount),approvedBudget:round(amount),availableCash:round(amount),strategy:strategy||'',
      allocationPlan:null,brokerRoutes:[],legIds:[],amountAllocated:0,amountRemaining:round(amount),actualInvested:0,
      executionStatus:STATUS.DRAFT,registrationStatus:{registered:0,total:0},status:STATUS.DRAFT,
      completionTimestamp:null,updatedAt:stamp,source:'Finance',financeSnapshot:financeSnapshot||{}};
  }

  function plan(mission,route,stamp=new Date().toISOString()){
    if(!mission||!route||String(route.missionId)!==String(mission.id))throw new Error('Route does not belong to this mission.');
    if([STATUS.LOCKED,STATUS.PARTIAL,STATUS.COMPLETE].includes(mission.status))throw new Error('Approved mission cannot be silently replanned.');
    const legs=arr(route.allocations).filter(a=>num(a.amount)>0).map((a,i)=>({...a,id:stableLegId(mission.id,a,i),legId:stableLegId(mission.id,a,i),leg_id:stableLegId(mission.id,a,i),status:'PLANNED'}));
    const allocated=round(legs.reduce((s,l)=>s+num(l.amount),0));
    if(allocated>num(mission.approvedBudget)+.005)throw new Error('Allocation exceeds Finance release.');
    const brokers=[...new Set(legs.map(l=>broker(l.account)).filter(Boolean))];
    return {mission:{...mission,strategy:route.strategy||mission.strategy,allocationPlan:{routeId:route.id,legIds:legs.map(l=>l.id)},brokerRoutes:brokers,
      legIds:legs.map(l=>l.id),amountAllocated:allocated,amountRemaining:round(num(mission.approvedBudget)-allocated),executionStatus:STATUS.READY,
      registrationStatus:{registered:0,total:legs.length},status:STATUS.READY,updatedAt:stamp},route:{...route,allocations:legs,allocated,remaining:round(num(mission.approvedBudget)-allocated),status:STATUS.READY,locked:false,updatedAt:stamp}};
  }

  function lock(mission,route,stamp=new Date().toISOString()){
    if(!mission||!route||route.missionId!==mission.id||mission.allocationPlan?.routeId!==route.id)throw new Error('Build the current mission plan before lock.');
    if(mission.status!==STATUS.READY||!arr(route.allocations).length)throw new Error('Only a ready route can be locked.');
    return {mission:{...mission,status:STATUS.LOCKED,executionStatus:STATUS.LOCKED,lockedAt:stamp,updatedAt:stamp},route:{...route,status:STATUS.LOCKED,locked:true,lockedAt:stamp,updatedAt:stamp}};
  }

  function validateRegistration(state,input){
    const m=state?.mission,r=state?.transfer?.route,legId=String(input?.legId||input?.allocationId||'');
    const leg=arr(r?.allocations).find(x=>String(x.id)===legId||String(x.legId)===legId);
    const errors=[];
    if(!m||String(input?.missionId)!==String(m.id))errors.push('Mission does not exist.');
    if(!r?.locked||![STATUS.LOCKED,STATUS.PARTIAL].includes(String(m?.status)))errors.push('Mission is not locked.');
    if(!leg)errors.push('Purchase leg does not exist.');
    const receipts=arr(state?.registration?.receipts),drafts=arr(state?.transfer?.registrationDrafts);
    if((leg&&leg.status==='REGISTERED')||receipts.some(x=>x.missionId===m?.id&&(x.legId===legId||x.allocationId===legId))||drafts.some(x=>x.missionId===m?.id&&(x.legId===legId||x.allocationId===legId)&&x.status==='CONFIRMED'))errors.push('Purchase leg is already registered.');
    if(leg&&broker(leg.account)!==broker(input?.account))errors.push('Broker does not match the locked route.');
    if(leg&&ticker(leg.ticker)!==ticker(input?.ticker))errors.push('Ticker does not match the locked route.');
    if(!(num(input?.shares)>0))errors.push('Shares must be greater than zero.');
    if(!(num(input?.price)>0))errors.push('Price must be greater than zero.');
    return {ok:errors.length===0,errors,leg};
  }

  function reconcile(mission,route,drafts,stamp=new Date().toISOString()){
    const legs=arr(route?.allocations).filter(l=>num(l.amount)>0),confirmed=arr(drafts).filter(d=>d.routeId===route?.id&&d.status==='CONFIRMED');
    const txByLeg=new Map(confirmed.map(d=>[String(d.legId||d.allocationId),d]));
    const nextLegs=legs.map(l=>txByLeg.has(String(l.id))?{...l,status:'REGISTERED',transactionId:txByLeg.get(String(l.id)).transactionId}:l);
    const registered=nextLegs.filter(l=>l.status==='REGISTERED').length,total=nextLegs.length;
    const actual=round(confirmed.reduce((s,d)=>s+num(d.totalCostGbp),0)),remaining=round(num(mission.approvedBudget)-actual);
    const status=total&&registered===total?STATUS.COMPLETE:registered?STATUS.PARTIAL:STATUS.LOCKED;
    return {mission:{...mission,status,executionStatus:status,registrationStatus:{registered,total},actualInvested:actual,amountRemaining:remaining,
      completionTimestamp:status===STATUS.COMPLETE?(mission.completionTimestamp||stamp):null,updatedAt:stamp},route:{...route,allocations:nextLegs,status,locked:true,actualInvested:actual,actualRemaining:remaining,updatedAt:stamp}};
  }

  function progress(state){
    const m=state?.mission,r=state?.transfer?.route,d=arr(state?.transfer?.registrationDrafts);
    if(!m||!r)return {registered:0,total:0,actualInvested:0,remaining:num(m?.approvedBudget),status:m?.status||null};
    const x=reconcile(m,r,d,m.updatedAt);return {...x.mission.registrationStatus,actualInvested:x.mission.actualInvested,remaining:x.mission.amountRemaining,status:x.mission.status};
  }
  return Object.freeze({STATUS,create,plan,lock,validateRegistration,reconcile,progress,stableLegId});
});
