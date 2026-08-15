
(function(){
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const label=document.getElementById('currentDepartment');
  if(label)label.textContent='TRANSFER CENTRE • DEADLINE DAY';
  document.title='Aurora City FC — Transfer Centre';
});
})();


/* =========================================================
   TRANSFER UI v1 — DEADLINE COMMAND
   Read-only orchestration of existing Transfer outputs.
   ========================================================= */
(function(){
'use strict';

const $=id=>document.getElementById(id);
const num=v=>{
  const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:0;
};
const upper=v=>String(v||'').trim().toUpperCase();

function setFlow(id,tone,label,metaId,meta){
  const card=$(id);if(!card)return;
  card.classList.remove('good','ready','active');
  if(tone)card.classList.add(tone);
  const badge=card.querySelector(':scope > b');
  if(badge)badge.textContent=label;
  const metaEl=$(metaId);
  if(metaEl)metaEl.textContent=meta;
}
function activateTab(panelId){
  const tab=document.querySelector(`.transfer-tabs [data-tab="${panelId}"]`);
  tab?.click();
}
function stateFromPage(){
  const financeBudget=num($('kFinanceBudget')?.textContent);
  const targets=Math.round(num($('kTargets')?.textContent));
  const allocated=num($('kAllocated')?.textContent);
  const holdback=num($('kHoldback')?.textContent);
  const income=num($('kIncome')?.textContent);
  const routeStatus=upper($('routeStatus')?.textContent);
  const handoff=upper($('handoffState')?.textContent);
  const scouting=upper($('scoutingState')?.textContent);
  const reg=upper($('registrationHandoffState')?.textContent);
  const confirmed=Math.round(num($('registrationConfirmed')?.textContent));
  const routeAllocations=Math.round(num($('registrationAllocations')?.textContent));
  const locked=['LOCKED','APPROVED','READY FOR REGISTRATION','REGISTERED'].some(x=>routeStatus.includes(x));
  const routeExists=allocated>0 || (!['','NO ROUTE','WAITING'].includes(routeStatus) && routeStatus!=='NO ROUTE');
  return {financeBudget,targets,allocated,holdback,income,routeStatus,handoff,scouting,reg,confirmed,routeAllocations,locked,routeExists};
}
function renderCommand(){
  const s=stateFromPage();
  const status=$('transfer3Status');
  if(status)status.className='transfer3-status';

  if(s.financeBudget>0 || ['READY','ACTIVE','LOCKED'].some(x=>s.handoff.includes(x))){
    setFlow('transfer3Finance','good','READY','transfer3FinanceMeta',`${$('kFinanceBudget')?.textContent||'£0.00'} authorised by Finance.`);
  }else{
    setFlow('transfer3Finance','ready','WAITING','transfer3FinanceMeta','Finance has not released an investment mission yet.');
  }

  if(s.targets>0 || ['READY','APPROVED','LIVE'].some(x=>s.scouting.includes(x))){
    setFlow('transfer3Scouting','good','READY','transfer3ScoutingMeta',`${s.targets} approved target${s.targets===1?'':'s'} available to Transfer.`);
  }else{
    setFlow('transfer3Scouting','ready','WAITING','transfer3ScoutingMeta','No approved Scouting shortlist is available yet.');
  }

  if(s.locked){
    setFlow('transfer3Route','good','LOCKED','transfer3RouteMeta',`${$('kAllocated')?.textContent||'£0.00'} allocated • ${$('kHoldback')?.textContent||'£0.00'} held back.`);
  }else if(s.routeExists){
    setFlow('transfer3Route','active','DRAFT','transfer3RouteMeta',`${$('kAllocated')?.textContent||'£0.00'} allocated • projected ${$('kIncome')?.textContent||'£0.00'} annual income.`);
  }else{
    setFlow('transfer3Route','','WAITING','transfer3RouteMeta','Build the deal sheet after Finance and Scouting are ready.');
  }

  if(s.locked || s.reg.includes('READY') || s.routeAllocations>0){
    const done=s.routeAllocations>0&&s.confirmed>=s.routeAllocations;
    setFlow(
      'transfer3Registration',
      done?'good':'ready',
      done?'COMPLETE':'READY',
      'transfer3RegistrationMeta',
      done?`${s.confirmed}/${s.routeAllocations} purchases confirmed.`:`${s.confirmed}/${s.routeAllocations||0} broker executions confirmed.`
    );
  }else{
    setFlow('transfer3Registration','','WAITING','transfer3RegistrationMeta','Registration opens after Transfer locks the final route.');
  }

  const priority=$('transfer3Priority');
  const next=$('transfer3NextAction');
  const meta=$('transfer3NextMeta');
  const btn=$('transfer3NextButton');

  if(!(s.financeBudget>0)){
    if(status)status.textContent='WAITING FOR FINANCE';
    if(priority)priority.textContent='Transfer has no authorised budget to deploy.';
    if(next)next.textContent='Release an investment mission from Finance';
    if(meta)meta.textContent='Finance must establish the safe transfer ceiling before Transfer can build a route.';
    if(btn){btn.textContent='Open Finance';btn.dataset.action='finance'}
  }else if(!(s.targets>0)){
    if(status)status.textContent='WAITING FOR SCOUTING';
    if(priority)priority.textContent='The Finance budget is ready, but Transfer needs an approved Scouting shortlist.';
    if(next)next.textContent='Approve eligible targets in Scouting';
    if(meta)meta.textContent='Scouting owns strategy, scores and eligibility. Transfer will use the approved handoff automatically.';
    if(btn){btn.textContent='Open Scouting';btn.dataset.action='scouting'}
  }else if(!s.routeExists){
    if(status){status.textContent='BUILD ROUTE';status.classList.add('good')}
    if(priority)priority.textContent='Finance and Scouting are ready. Transfer can now construct the final deal sheet.';
    if(next)next.textContent='Auto-build the broker allocation';
    if(meta)meta.textContent='Review broker scope and allocation settings, then build the route.';
    if(btn){btn.textContent='Open Deal Sheet';btn.dataset.action='allocation'}
  }else if(!s.locked){
    if(status){status.textContent='ROUTE REVIEW';status.classList.add('good')}
    if(priority)priority.textContent='A draft route exists and is waiting for final approval.';
    if(next)next.textContent='Review and approve the final route';
    if(meta)meta.textContent=`Current deal sheet allocates ${$('kAllocated')?.textContent||'£0.00'} with ${$('kHoldback')?.textContent||'£0.00'} held back.`;
    if(btn){btn.textContent='Review Route';btn.dataset.action='allocation'}
  }else{
    if(status){status.textContent='ROUTE LOCKED';status.classList.add('good')}
    if(priority)priority.textContent='The Transfer route is locked and Registration now owns broker execution.';
    if(next)next.textContent='Complete the broker purchases in Registration';
    if(meta)meta.textContent='Transfer should stay unchanged unless the approved route is deliberately unlocked.';
    if(btn){btn.textContent='Open Registration';btn.dataset.action='registration'}
  }
}
function bind(){
  $('transfer3NextButton')?.addEventListener('click',()=>{
    const a=$('transfer3NextButton')?.dataset.action;
    if(a==='finance')location.href='finance.html';
    else if(a==='scouting')location.href='scouting.html';
    else if(a==='allocation')activateTab('allocationPanel');
    else if(a==='registration')location.href='registration.html';
  });

  const ids=[
    'kFinanceBudget','kAllocated','kHoldback','kIncome','kTargets',
    'routeStatus','handoffState','scoutingState','registrationHandoffState',
    'registrationConfirmed','registrationAllocations'
  ];
  const obs=new MutationObserver(()=>renderCommand());
  ids.forEach(id=>{
    const el=$(id);
    if(el)obs.observe(el,{childList:true,subtree:true,attributes:true,characterData:true});
  });

  window.addEventListener('storage',()=>setTimeout(renderCommand,50));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(renderCommand,80)});
  setTimeout(renderCommand,80);
  setTimeout(renderCommand,700);
  setTimeout(renderCommand,1800);
}
document.addEventListener('DOMContentLoaded',bind);
})();
