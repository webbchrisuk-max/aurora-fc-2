/* Aurora City FC — Pots & Bills action ownership fix
   UI-only layer: finance.js remains the source of truth for state/calculations.
*/
(function(){
  'use strict';
  if(window.AuroraFinancePotsBillsCleanupV2)return;
  window.AuroraFinancePotsBillsCleanupV2=true;

  const A=()=>window.Aurora2;
  const $=id=>document.getElementById(id);
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const state=()=>{try{return A()?.core?.read?.()||null}catch{return null}};

  function toast(message){
    const el=$('toast');
    if(!el){alert(message);return}
    el.textContent=message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t=setTimeout(()=>el.classList.remove('show'),2200);
  }

  function installStyles(){
    if($('auroraPotsBillsOwnershipStyles'))return;
    const s=document.createElement('style');
    s.id='auroraPotsBillsOwnershipStyles';
    s.textContent=`
      #financeAllPotsDetails{display:none!important}
      .aurora-pot-editor-extra{display:flex;gap:10px;flex-wrap:wrap;margin-left:auto}
      .aurora-pot-editor-extra .danger{background:#3a0d14;border-color:#7e2430;color:#ffd8dd}
      .aurora-month-group{margin:0 0 14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;background:rgba(5,10,22,.35)}
      .aurora-month-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.08)}
      .aurora-month-head span{font-size:.82rem;opacity:.72}
      .aurora-month-body{padding:8px}
      .aurora-month-body>article,.aurora-month-body>.finance-item,.aurora-month-body>.fv2-commitment-row{margin:8px 0}
    `;
    document.head.appendChild(s);
  }

  function removeOldPotManager(){
    const details=$('financeAllPotsDetails');
    if(details)details.style.display='none';

    const panel=$('potsPanel');
    if(!panel)return;

    panel.querySelectorAll('[data-pot-archive],[data-pot-delete]').forEach(btn=>{
      if(btn.closest('#potEditor'))return;
      const block=btn.closest('section,article,.finance-panel,.fv2-list-section,.finance-manager-details');
      if(block && /manage\s+pots/i.test(block.textContent||''))block.remove();
      else btn.remove();
    });

    [...panel.querySelectorAll('h1,h2,h3,h4,b,strong,span')].forEach(label=>{
      if(!/^manage\s+pots$/i.test((label.textContent||'').trim()))return;
      const block=label.closest('section,article,.finance-panel,.fv2-list-section,.finance-manager-details');
      if(block && !block.querySelector('#financePotProgressDashboard') && !block.querySelector('#potEditor'))block.remove();
    });
  }

  function keepBillActionsOnlyInManager(){
    const panel=$('potsPanel');
    if(!panel)return;
    panel.querySelectorAll('[data-bill-complete],[data-bill-edit],[data-bill-archive],[data-bill-delete]').forEach(btn=>{
      if(btn.closest('#billList') || btn.closest('#billEditor'))return;
      btn.remove();
    });
    panel.querySelectorAll('.finance-next-bill-paid,.finance-next-bill-edit').forEach(btn=>btn.remove());
    panel.querySelectorAll('.fv2-bill-actions,.finance-item-actions').forEach(actions=>{
      if(actions.closest('#billList'))return;
      actions.remove();
    });
  }

  function currentPot(){
    const id=$('potId')?.value;
    if(!id)return null;
    return (state()?.finance?.pots||[]).find(p=>String(p.id)===String(id))||null;
  }

  function syncPotEditor(){
    const editor=$('potEditor');
    const actions=editor?.querySelector('.finance-actions');
    if(!editor||!actions)return;

    const pot=currentPot();
    const save=$('savePot');
    const cancel=$('cancelPot');
    if(save)save.textContent=pot?'Save Changes':'Save Pot';
    if(cancel)cancel.textContent='Cancel';

    let extra=$('auroraPotEditorExtra');
    if(!extra){
      extra=document.createElement('div');
      extra.id='auroraPotEditorExtra';
      extra.className='aurora-pot-editor-extra';
      extra.innerHTML='<button type="button" class="finance-btn secondary" id="auroraArchivePot">Archive Pot</button><button type="button" class="finance-btn danger" id="auroraDeletePot">Delete Pot</button>';
      actions.appendChild(extra);
    }

    extra.style.display=pot?'flex':'none';
    if(!pot)return;
    const holding=norm(pot.name)==='holding pot';
    const archive=$('auroraArchivePot');
    const del=$('auroraDeletePot');
    archive.textContent=pot.archived?'Restore Pot':'Archive Pot';
    archive.disabled=holding;
    del.disabled=holding;
    archive.title=holding?'Holding Pot is protected by Finance.':'';
    del.title=holding?'Holding Pot is protected by Finance.':'';
  }

  function archivePot(){
    const pot=currentPot(),core=A()?.core;
    if(!pot||!core?.update)return;
    if(norm(pot.name)==='holding pot'){toast('Holding Pot is protected and cannot be archived.');return}
    const verb=pot.archived?'restore':'archive';
    if(!confirm(`Are you sure you want to ${verb} ${pot.name}?`))return;
    core.update(s=>({...s,finance:{...s.finance,pots:(s.finance?.pots||[]).map(p=>String(p.id)===String(pot.id)?{...p,archived:!p.archived,updatedAt:new Date().toISOString()}:p)}}));
    location.reload();
  }

  function deletePot(){
    const pot=currentPot(),core=A()?.core;
    if(!pot||!core?.update)return;
    if(norm(pot.name)==='holding pot'){toast('Holding Pot is protected and cannot be deleted.');return}
    const linked=(state()?.finance?.bills||[]).filter(b=>!b.archived&&norm(b.fundingSource)===norm(pot.name));
    if(linked.length){alert(`This pot funds ${linked.length} active bill${linked.length===1?'':'s'}. Change those bill funding sources before deleting it.`);return}
    if(!confirm(`Delete ${pot.name} permanently? This cannot be undone.`))return;
    core.update(s=>({...s,finance:{...s.finance,pots:(s.finance?.pots||[]).filter(p=>String(p.id)!==String(pot.id))}}));
    location.reload();
  }

  function billId(node){
    const a=node.querySelector?.('[data-bill-edit],[data-bill-complete],[data-bill-archive],[data-bill-delete]');
    return a?.dataset.billEdit||a?.dataset.billComplete||a?.dataset.billArchive||a?.dataset.billDelete||'';
  }
  function monthKey(b){
    const due=String(b?.due||'').slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(due)?due.slice(0,7):'no-date';
  }
  function monthLabel(key){
    if(key==='no-date')return 'No date set';
    const [y,m]=key.split('-').map(Number);
    return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  }

  function groupBills(){
    const host=$('billList'),s=state();
    if(!host||!s||host.dataset.auroraMonthGrouped==='1')return;
    const raw=[...host.children].filter(el=>!el.classList.contains('aurora-month-group'));
    const mapped=raw.map(el=>{
      const id=billId(el);
      const bill=(s.finance?.bills||[]).find(b=>String(b.id)===String(id));
      return {el,bill,id};
    }).filter(x=>x.id&&x.bill);
    if(!mapped.length)return;

    const groups=new Map();
    mapped.forEach(item=>{const key=monthKey(item.bill);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)});
    const keys=[...groups.keys()].sort((a,b)=>a==='no-date'?1:b==='no-date'?-1:a.localeCompare(b));
    host.innerHTML='';
    keys.forEach(key=>{
      const items=groups.get(key);
      const total=items.reduce((sum,x)=>sum+Math.max(0,Number(x.bill.amount)||0),0);
      const section=document.createElement('section');
      section.className='aurora-month-group';
      section.innerHTML=`<div class="aurora-month-head"><strong>${monthLabel(key)}</strong><span>${items.length} bill${items.length===1?'':'s'} • £${total.toFixed(2)}</span></div><div class="aurora-month-body"></div>`;
      const body=section.querySelector('.aurora-month-body');
      items.forEach(x=>body.appendChild(x.el));
      host.appendChild(section);
    });
    host.dataset.auroraMonthGrouped='1';
  }

  function apply(){
    installStyles();
    removeOldPotManager();
    keepBillActionsOnlyInManager();
    syncPotEditor();
    const host=$('billList');
    if(host&&!host.querySelector('.aurora-month-group'))delete host.dataset.auroraMonthGrouped;
    groupBills();
  }

  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-pot-edit]'))setTimeout(syncPotEditor,0);
    if(e.target.closest?.('#savePot,#cancelPot'))setTimeout(syncPotEditor,0);
    if(e.target.closest?.('#auroraArchivePot')){e.preventDefault();archivePot()}
    if(e.target.closest?.('#auroraDeletePot')){e.preventDefault();deletePot()}
  });

  const observer=new MutationObserver(()=>{
    clearTimeout(observer._t);
    observer._t=setTimeout(apply,25);
  });

  function init(){
    apply();
    observer.observe($('potsPanel')||document.body,{childList:true,subtree:true});
    setTimeout(apply,250);
    setTimeout(apply,1000);
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
