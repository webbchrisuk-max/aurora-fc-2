/* Aurora City FC — Finance Pots & Bills action cleanup
   UI-only correction layer. Finance calculations/state remain owned by finance.js.
*/
(function(){
  'use strict';
  if(window.AuroraFinancePotsBillsCleanup)return;
  window.AuroraFinancePotsBillsCleanup=true;

  const A=()=>window.Aurora2;
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const $=id=>document.getElementById(id);

  function state(){
    try{return A()?.core?.read?.()||null}catch{return null}
  }

  function toast(message){
    const el=$('toast');
    if(!el){window.alert(message);return}
    el.textContent=message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t=setTimeout(()=>el.classList.remove('show'),2200);
  }

  function installStyles(){
    if($('auroraFinancePotsBillsCleanupStyles'))return;
    const style=document.createElement('style');
    style.id='auroraFinancePotsBillsCleanupStyles';
    style.textContent=`
      #financeAllPotsDetails{display:none!important}
      #financeNextFiveBills .finance-next-bill-paid,
      #financeNextFiveBills .finance-next-bill-edit,
      #financeNextFiveBills [data-bill-complete],
      #financeNextFiveBills [data-bill-edit],
      #financeNextFiveBills [data-bill-archive],
      #financeNextFiveBills [data-bill-delete],
      #financeNextFiveBills .fv2-bill-actions,
      #financeNextFiveBills .finance-item-actions{display:none!important}
      .aurora-pot-editor-danger{display:flex;gap:10px;flex-wrap:wrap;margin-left:auto}
      .aurora-pot-editor-danger .finance-btn.danger{background:#3a0d14;border-color:#7e2430;color:#ffd8dd}
      .aurora-month-group{margin:0 0 14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;background:rgba(5,10,22,.35)}
      .aurora-month-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.08)}
      .aurora-month-head strong{font-size:.92rem;letter-spacing:.02em}
      .aurora-month-head span{font-size:.82rem;opacity:.72}
      .aurora-month-body{padding:8px}
      .aurora-month-body>article,.aurora-month-body>.finance-item,.aurora-month-body>.fv2-bill-card{margin:8px 0}
    `;
    document.head.appendChild(style);
  }

  function hidePotActionsList(){
    const details=$('financeAllPotsDetails');
    if(!details)return;
    details.open=false;
    details.setAttribute('aria-hidden','true');
  }

  function stripUpcomingBillActions(){
    const host=$('financeNextFiveBills');
    if(!host)return;
    host.querySelectorAll('[data-bill-complete],[data-bill-edit],[data-bill-archive],[data-bill-delete],.finance-next-bill-paid,.finance-next-bill-edit').forEach(el=>el.remove());
    host.querySelectorAll('.fv2-bill-actions,.finance-item-actions').forEach(el=>el.remove());
  }

  function currentPot(){
    const id=$('potId')?.value;
    if(!id)return null;
    return (state()?.finance?.pots||[]).find(p=>String(p.id)===String(id))||null;
  }

  function syncPotEditorActions(){
    const editor=$('potEditor');
    const actions=editor?.querySelector('.finance-actions');
    if(!editor||!actions)return;

    const save=$('savePot');
    const cancel=$('cancelPot');
    const pot=currentPot();
    if(save)save.textContent=pot?'Save Changes':'Save Pot';
    if(cancel)cancel.textContent='Cancel';

    let extra=$('auroraPotEditorActions');
    if(!extra){
      extra=document.createElement('div');
      extra.id='auroraPotEditorActions';
      extra.className='aurora-pot-editor-danger';
      extra.innerHTML='<button type="button" class="finance-btn secondary" id="auroraArchivePot">Archive Pot</button><button type="button" class="finance-btn danger" id="auroraDeletePot">Delete Pot</button>';
      actions.appendChild(extra);
    }

    const archive=$('auroraArchivePot');
    const del=$('auroraDeletePot');
    const isHolding=pot&&norm(pot.name)==='holding pot';
    extra.style.display=pot?'flex':'none';
    if(!pot)return;

    archive.textContent=pot.archived?'Restore Pot':'Archive Pot';
    archive.disabled=!!isHolding;
    del.disabled=!!isHolding;
    archive.title=isHolding?'Holding Pot is protected by the Finance engine.':'';
    del.title=isHolding?'Holding Pot is protected by the Finance engine.':'';
  }

  function archiveCurrentPot(){
    const pot=currentPot();
    const core=A()?.core;
    if(!pot||!core?.update)return;
    if(norm(pot.name)==='holding pot'){toast('Holding Pot is protected and cannot be archived.');return}
    const verb=pot.archived?'restore':'archive';
    if(!window.confirm(`Are you sure you want to ${verb} ${pot.name}?`))return;
    core.update(s=>({
      ...s,
      finance:{...s.finance,pots:(s.finance?.pots||[]).map(p=>String(p.id)===String(pot.id)?{...p,archived:!p.archived,updatedAt:new Date().toISOString()}:p)}
    }));
    location.reload();
  }

  function deleteCurrentPot(){
    const pot=currentPot();
    const core=A()?.core;
    if(!pot||!core?.update)return;
    if(norm(pot.name)==='holding pot'){toast('Holding Pot is protected and cannot be deleted.');return}

    const linked=(state()?.finance?.bills||[]).filter(b=>!b.archived&&norm(b.fundingSource)===norm(pot.name));
    if(linked.length){
      window.alert(`This pot is funding ${linked.length} active bill${linked.length===1?'':'s'}. Edit those bills and change their funding source before deleting this pot.`);
      return;
    }
    if(!window.confirm(`Delete ${pot.name} permanently? This cannot be undone.`))return;
    core.update(s=>({
      ...s,
      finance:{...s.finance,pots:(s.finance?.pots||[]).filter(p=>String(p.id)!==String(pot.id))}
    }));
    location.reload();
  }

  function billIdFromNode(node){
    const action=node.querySelector?.('[data-bill-edit],[data-bill-complete],[data-bill-archive],[data-bill-delete]');
    if(!action)return '';
    return action.dataset.billEdit||action.dataset.billComplete||action.dataset.billArchive||action.dataset.billDelete||'';
  }

  function monthKeyForBill(bill){
    const due=String(bill?.due||'').slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(due)?due.slice(0,7):'no-date';
  }

  function monthLabel(key){
    if(key==='no-date')return 'No date set';
    const [y,m]=key.split('-').map(Number);
    return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  }

  function groupManageBillsByMonth(){
    const host=$('billList');
    const s=state();
    if(!host||!s)return;
    if(host.dataset.auroraMonthGrouped==='1')return;

    const raw=[...host.children].filter(el=>!el.classList.contains('aurora-month-group'));
    const mapped=raw.map(el=>{
      const id=billIdFromNode(el);
      const bill=(s.finance?.bills||[]).find(b=>String(b.id)===String(id));
      return {el,bill,id};
    }).filter(x=>x.id&&x.bill);
    if(!mapped.length)return;

    const groups=new Map();
    mapped.forEach(item=>{
      const key=monthKeyForBill(item.bill);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(item);
    });

    const ordered=[...groups.keys()].sort((a,b)=>{
      if(a==='no-date')return 1;
      if(b==='no-date')return -1;
      return a.localeCompare(b);
    });

    host.innerHTML='';
    ordered.forEach(key=>{
      const items=groups.get(key);
      const total=items.reduce((sum,x)=>sum+Math.max(0,Number(x.bill.amount)||0),0);
      const group=document.createElement('section');
      group.className='aurora-month-group';
      group.innerHTML=`<div class="aurora-month-head"><strong>${monthLabel(key)}</strong><span>${items.length} bill${items.length===1?'':'s'} • £${total.toFixed(2)}</span></div><div class="aurora-month-body"></div>`;
      const body=group.querySelector('.aurora-month-body');
      items.forEach(x=>body.appendChild(x.el));
      host.appendChild(group);
    });
    host.dataset.auroraMonthGrouped='1';
  }

  function resetMonthGroupingFlag(){
    const host=$('billList');
    if(host&&!host.querySelector('.aurora-month-group'))delete host.dataset.auroraMonthGrouped;
  }

  function apply(){
    installStyles();
    hidePotActionsList();
    stripUpcomingBillActions();
    syncPotEditorActions();
    resetMonthGroupingFlag();
    groupManageBillsByMonth();
  }

  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-pot-edit]'))setTimeout(syncPotEditorActions,0);
    if(event.target.closest?.('#savePot,#cancelPot'))setTimeout(syncPotEditorActions,0);
    if(event.target.closest?.('#auroraArchivePot')){event.preventDefault();archiveCurrentPot();}
    if(event.target.closest?.('#auroraDeletePot')){event.preventDefault();deleteCurrentPot();}
  });

  const observer=new MutationObserver(()=>{
    clearTimeout(observer._t);
    observer._t=setTimeout(apply,20);
  });

  function init(){
    apply();
    const panel=$('potsPanel')||document.body;
    observer.observe(panel,{childList:true,subtree:true});
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
