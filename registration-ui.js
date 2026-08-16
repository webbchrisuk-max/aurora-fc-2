
(function(){
'use strict';
function jump(id){
  const target=document.getElementById(id);
  if(!target)return;
  const offset=(document.querySelector('.aurora-shell-header')?.offsetHeight||0)+(document.querySelector('.registration-jumpbar')?.offsetHeight||0)+18;
  const top=target.getBoundingClientRect().top+window.scrollY-offset;
  window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
}
document.addEventListener('click',event=>{
  const btn=event.target.closest('[data-reg-jump]');
  if(!btn)return;
  event.preventDefault();
  jump(btn.dataset.regJump);
});
document.addEventListener('DOMContentLoaded',()=>{
  const label=document.getElementById('currentDepartment');
  if(label)label.textContent='REGISTRATION DESK • BROKER REALITY';
  document.title='Aurora City FC — Registration Desk';
});
})();


/* =========================================================
   REGISTRATION UI v1 — COMMAND FLOW
   Read-only orchestration of existing Registration state.
   No transaction, allocation or backend maths lives here.
   ========================================================= */
(function(){
'use strict';

const A=()=>window.Aurora2;
const D=()=>window.AuroraData2Client;
const arr=v=>Array.isArray(v)?v:[];
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const $=id=>document.getElementById(id);
const upper=v=>String(v||'').trim().toUpperCase();

function routeState(s){
  const route=s?.transfer?.route||null;
  const status=upper(route?.status);
  const locked=!!route&&(route.locked===true||['LOCKED','PARTIALLY_REGISTERED','COMPLETE'].includes(status));
  const allocations=arr(route?.allocations).filter(a=>num(a.amount)>0);
  const drafts=arr(s?.transfer?.registrationDrafts).filter(d=>!route?.id||d.routeId===route.id);
  const confirmed=drafts.filter(d=>upper(d.status)==='CONFIRMED');
  const registeredAllocations=allocations.filter(a=>upper(a.status)==='REGISTERED');
  const receipts=arr(s?.registration?.receipts);
  const complete=!!route&&allocations.length>0&&(
    status==='REGISTERED' ||
    status==='COMPLETE' ||
    registeredAllocations.length===allocations.length ||
    confirmed.length>=allocations.length
  );
  return {route,status,locked,allocations,drafts,confirmed,registeredAllocations,receipts,complete};
}

function setFlow(id,tone,label,metaId,meta){
  const card=$(id);if(!card)return;
  card.classList.remove('good','ready','warn','bad');
  if(tone)card.classList.add(tone);
  const badge=card.querySelector(':scope > b');
  if(badge)badge.textContent=label;
  const m=$(metaId);if(m)m.textContent=meta;
}

function backendConnected(){
  try{
    const cfg=D()?.config?.();
    if(cfg?.endpoint&&cfg?.token)return true;
  }catch(_){}
  const state=upper($('connectionState')?.textContent);
  return state.includes('CONNECTED')||state.includes('LIVE')||state.includes('READY');
}

function jumpTo(id){
  const target=$(id);if(!target)return;
  const offset=(document.querySelector('.aurora-shell-header')?.offsetHeight||0)+(document.querySelector('.registration-jumpbar')?.offsetHeight||0)+18;
  window.scrollTo({top:Math.max(0,target.getBoundingClientRect().top+window.scrollY-offset),behavior:'smooth'});
}

function openConnection(){
  const section=$('connectionSection');
  if(!section)return;
  section.classList.add('is-open');
  setTimeout(()=>jumpTo('connectionSection'),30);
}

function closeConnection(){
  $('connectionSection')?.classList.remove('is-open');
}

function renderCommandFlow(){
  if(!A()?.core?.read)return;
  const s=A().core.read();
  const r=routeState(s);
  const connected=backendConnected();

  if(!r.route){
    setFlow('regFlowRoute','warn','WAITING','regFlowRouteMeta','Transfer has not handed over a locked route.');
    setFlow('regFlowExecution','','WAITING','regFlowExecutionMeta','Broker execution opens after Transfer approval.');
  }else if(!r.locked){
    setFlow('regFlowRoute','warn','UNLOCKED','regFlowRouteMeta','The current route exists but is not locked for Registration.');
    setFlow('regFlowExecution','','WAITING','regFlowExecutionMeta','Lock the route in Transfer before registering.');
  }else{
    setFlow('regFlowRoute','good','READY','regFlowRouteMeta',`${r.allocations.length} approved purchase${r.allocations.length===1?'':'s'} authorised by Transfer.`);
    const remaining=Math.max(0,r.allocations.length-r.confirmed.length);
    if(r.complete){
      setFlow('regFlowExecution','good','COMPLETE','regFlowExecutionMeta',`${r.confirmed.length} purchase${r.confirmed.length===1?'':'s'} backend-confirmed.`);
    }else if(r.drafts.length){
      setFlow('regFlowExecution','ready','IN PROGRESS','regFlowExecutionMeta',`${r.confirmed.length} confirmed • ${remaining} still to register.`);
    }else{
      setFlow('regFlowExecution','ready','READY','regFlowExecutionMeta',`${remaining} broker execution${remaining===1?'':'s'} waiting.`);
    }
  }

  if(connected){
    const receiptText=r.receipts.length?`${r.receipts.length} canonical receipt${r.receipts.length===1?'':'s'} available.`:'Connection ready for canonical write.';
    setFlow('regFlowBackend','good','CONNECTED','regFlowBackendMeta',receiptText);
  }else{
    setFlow('regFlowBackend','bad','OFFLINE','regFlowBackendMeta','Reconnect AuroraData 2 before confirming a purchase.');
  }

  if(r.complete){
    setFlow('regFlowSquad','good','CONFIRMED','regFlowSquadMeta','Registration is complete and Squad can read the confirmed canonical holdings.');
  }else if(r.confirmed.length){
    setFlow('regFlowSquad','ready','UPDATING','regFlowSquadMeta',`${r.confirmed.length} confirmed purchase${r.confirmed.length===1?'':'s'} already passed canonical read-back.`);
  }else{
    setFlow('regFlowSquad','','WAITING','regFlowSquadMeta','Squad only changes after backend confirmation.');
  }

  const status=$('regDeskStatus'), priority=$('regDeskPriority');
  const next=$('regNextAction'), meta=$('regNextActionMeta'), btn=$('regNextActionButton');
  if(status)status.className='reg3-command-chip';

  if(!connected){
    if(status){status.textContent='ATTENTION';status.classList.add('bad')}
    if(priority)priority.textContent='AuroraData 2 needs attention before a canonical registration can complete.';
    if(next)next.textContent='Reconnect AuroraData 2';
    if(meta)meta.textContent='Open backend settings, save the endpoint/token and run the connection test.';
    if(btn){btn.textContent='Open Backend Settings';btn.dataset.target='connection'}
  }else if(!r.route||!r.locked){
    if(status)status.textContent='WAITING FOR TRANSFER';
    if(priority)priority.textContent='Registration is clear. A locked Transfer route is required before broker execution.';
    if(next)next.textContent='Approve the Transfer route';
    if(meta)meta.textContent='Transfer owns the budget, ticker list and broker route. Registration will not create its own.';
    if(btn){btn.textContent='Open Transfer';btn.dataset.target='transfer'}
  }else if(!r.complete){
    const remaining=Math.max(0,r.allocations.length-r.confirmed.length);
    if(status){status.textContent='EXECUTION READY';status.classList.add('good')}
    if(priority)priority.textContent=`${remaining} approved purchase${remaining===1?' is':'s are'} still waiting for broker confirmation.`;
    if(next)next.textContent='Register the next broker execution';
    if(meta)meta.textContent='Choose the approved allocation, enter the broker shares/price/fees and confirm the canonical write.';
    if(btn){btn.textContent='Open Broker Execution';btn.dataset.target='execution'}
  }else{
    if(status){status.textContent='BATCH COMPLETE';status.classList.add('good')}
    if(priority)priority.textContent='All approved purchases are confirmed. Complete and archive the Registration batch.';
    if(next)next.textContent='Archive the completed registration';
    if(meta)meta.textContent='The completed-operation control will reset the desk ready for the next Transfer route.';
    if(btn){btn.textContent='Open Completion';btn.dataset.target='operations'}
  }
}

function bind(){
  $('regConnectionJump')?.addEventListener('click',openConnection);
  $('regConnectionClose')?.addEventListener('click',closeConnection);
  $('regNextActionButton')?.addEventListener('click',()=>{
    const target=$('regNextActionButton')?.dataset.target;
    if(target==='connection')openConnection();
    else if(target==='transfer')location.href='transfer.html';
    else if(target==='execution')jumpTo('executionSection');
    else if(target==='operations')jumpTo('registrationOperationsUpgrade');
  });

  // The existing business UI updates these elements after state changes.
  // Observe them so the command-flow view follows without owning the data.
  const watchIds=['routeStatus','routeBudget','kConfirmed','kRemaining','kPurchases','connectionState','receiptCount','queueCount','executionState'];
  const obs=new MutationObserver(()=>renderCommandFlow());
  watchIds.forEach(id=>{const el=$(id);if(el)obs.observe(el,{childList:true,subtree:true,attributes:true})});

  window.addEventListener('storage',()=>setTimeout(renderCommandFlow,40));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(renderCommandFlow,50)});

  // Connection settings stay hidden when healthy, but open automatically if offline.
  if(!backendConnected())$('connectionSection')?.classList.add('is-open');

  setTimeout(renderCommandFlow,60);
  setTimeout(renderCommandFlow,700);
}

document.addEventListener('DOMContentLoaded',bind);
})();
