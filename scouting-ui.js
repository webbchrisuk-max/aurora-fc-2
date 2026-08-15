
(function(){
'use strict';
function jump(id){
  const target=document.getElementById(id);
  if(!target)return;
  const offset=(document.querySelector('.aurora-shell-header')?.offsetHeight||0)+(document.querySelector('.scouting-jumpbar')?.offsetHeight||0)+18;
  const top=target.getBoundingClientRect().top+window.scrollY-offset;
  window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
}
document.addEventListener('click',event=>{
  const btn=event.target.closest('[data-scout-jump]');
  if(!btn)return;
  event.preventDefault();
  jump(btn.dataset.scoutJump);
});
document.addEventListener('DOMContentLoaded',()=>{
  const label=document.getElementById('currentDepartment');
  if(label)label.textContent='SCOUTING CENTRE • RECRUITMENT INTELLIGENCE';
  document.title='Aurora City FC — Scouting Centre';
});
})();


/* =========================================================
   SCOUTING UI v1 — RECRUITMENT COMMAND
   Mirrors existing Scouting outputs; does not score candidates itself.
   ========================================================= */
(function(){
'use strict';

const $=id=>document.getElementById(id);
const num=v=>{
  const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:0;
};
const upper=v=>String(v||'').trim().toUpperCase();

function jumpTo(id){
  const target=$(id);
  if(!target)return;
  const offset=(document.querySelector('.aurora-shell-header')?.offsetHeight||0)+(document.querySelector('.scouting-jumpbar')?.offsetHeight||0)+18;
  const top=target.getBoundingClientRect().top+window.scrollY-offset;
  window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
}
function setFlow(id,tone,label,metaId,meta){
  const card=$(id);if(!card)return;
  card.classList.remove('good','active','info');
  if(tone)card.classList.add(tone);
  const badge=card.querySelector(':scope > b');
  if(badge)badge.textContent=label;
  const metaEl=$(metaId);
  if(metaEl)metaEl.textContent=meta;
}
function isShortlistApproved(){
  const s=upper($('scoutingStatus')?.textContent);
  return s.includes('APPROVED')||s.includes('LOCKED')||s.includes('TRANSFER');
}
function renderCommand(){
  const candidates=Math.round(num($('kCandidates')?.textContent));
  const pass=Math.round(num($('kPass')?.textContent));
  const caution=Math.round(num($('kCaution')?.textContent));
  const blocked=Math.round(num($('kBlock')?.textContent));
  const approved=isShortlistApproved();

  setFlow('scouting3Network','info','LIVE','scouting3NetworkMeta',
    'Global Network remains the broad monitoring layer; candidates enter Active Scouting only after promotion.');

  if(candidates>0){
    setFlow('scouting3Active','good','READY','scouting3ActiveMeta',
      `${candidates} active candidate${candidates===1?'':'s'} • ${pass} pass • ${caution} caution • ${blocked} blocked.`);
  }else{
    setFlow('scouting3Active','active','EMPTY','scouting3ActiveMeta',
      'No stored Active Scouting candidates are ready for ranking.');
  }

  if(approved){
    setFlow('scouting3Shortlist','good','APPROVED','scouting3ShortlistMeta',
      `${pass+caution} eligible target${pass+caution===1?'':'s'} handed to Transfer under the approved lens.`);
    setFlow('scouting3Transfer','good','READY','scouting3TransferMeta',
      'Transfer can now build its route from this approved Scouting authority.');
  }else if(pass+caution>0){
    setFlow('scouting3Shortlist','active','REVIEW','scouting3ShortlistMeta',
      `${pass+caution} eligible target${pass+caution===1?'':'s'} waiting for Director of Football approval.`);
    setFlow('scouting3Transfer','','WAITING','scouting3TransferMeta',
      'Transfer waits until the current shortlist is approved.');
  }else{
    setFlow('scouting3Shortlist','','WAITING','scouting3ShortlistMeta',
      'Run Scouting and resolve evidence before approving a shortlist.');
    setFlow('scouting3Transfer','','WAITING','scouting3TransferMeta',
      'No Transfer-ready shortlist is available.');
  }

  const status=$('scouting3Status');
  if(status)status.className='scouting3-status';

  const priority=$('scouting3Priority');
  const next=$('scouting3NextAction');
  const meta=$('scouting3NextMeta');
  const btn=$('scouting3NextButton');

  if(candidates===0){
    if(status){status.textContent='NETWORK SEARCH';status.classList.add('info')}
    if(priority)priority.textContent='Active Scouting is empty. The recruitment network is the next place to work.';
    if(next)next.textContent='Review the Global Scouting Network';
    if(meta)meta.textContent='Promote evidence-backed prospects into Active Scouting before ranking.';
    if(btn){btn.textContent='Open Global Network';btn.dataset.action='network'}
  }else if(pass+caution===0){
    if(status)status.textContent='EVIDENCE REVIEW';
    if(priority)priority.textContent='Candidates exist, but none currently pass the eligibility gates.';
    if(next)next.textContent='Review candidate evidence and blocked reasons';
    if(meta)meta.textContent='Use the shortlist and Evidence Room to resolve missing or weak evidence.';
    if(btn){btn.textContent='Open Evidence Room';btn.dataset.action='evidence'}
  }else if(!approved){
    if(status){status.textContent='SHORTLIST READY';status.classList.add('good')}
    if(priority)priority.textContent='The ranked shortlist has eligible targets and is waiting for approval.';
    if(next)next.textContent='Review and approve the current shortlist';
    if(meta)meta.textContent='Approval freezes the current Scouting result as Transfer authority.';
    if(btn){btn.textContent='Open Ranked Shortlist';btn.dataset.action='shortlist'}
  }else{
    if(status){status.textContent='TRANSFER READY';status.classList.add('good')}
    if(priority)priority.textContent='The shortlist is approved and Transfer can deploy the Finance mission across it.';
    if(next)next.textContent='Build the deployment route in Transfer';
    if(meta)meta.textContent='Scouting should only be changed if new evidence warrants a fresh shortlist.';
    if(btn){btn.textContent='Open Transfer';btn.dataset.action='transfer'}
  }
}
function bind(){
  $('scouting3NextButton')?.addEventListener('click',()=>{
    const a=$('scouting3NextButton')?.dataset.action;
    if(a==='network')jumpTo('globalNetworkSection');
    else if(a==='evidence')jumpTo('candidateLab');
    else if(a==='shortlist')jumpTo('shortlistSection');
    else if(a==='transfer')location.href='transfer.html';
  });

  const ids=[
    'kCandidates','kPass','kCaution','kBlock',
    'scoutingStatus','shortlistMeta','healthFull','healthReview'
  ];
  const observer=new MutationObserver(()=>renderCommand());
  ids.forEach(id=>{
    const el=$(id);
    if(el)observer.observe(el,{childList:true,subtree:true,attributes:true,characterData:true});
  });

  window.addEventListener('storage',()=>setTimeout(renderCommand,50));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(renderCommand,70)});
  setTimeout(renderCommand,80);
  setTimeout(renderCommand,700);
  setTimeout(renderCommand,1800);
}
document.addEventListener('DOMContentLoaded',bind);
})();
