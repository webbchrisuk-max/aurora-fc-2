/* Aurora 2 — Finance Bill Action Bridge v1
 * iPad/Safari-safe interaction bridge for the dynamic Finance bill boards.
 * finance.js remains the bill/payment authority; this file only makes the
 * visible Mark as Paid and Edit controls reliably reach that authority.
 */
(function(w){
  'use strict';
  if(w.AuroraFinanceBillActionsFix)return;

  const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
  if(page!=='finance.html')return;

  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const state=()=>w.Aurora2?.core?.read?.()||null;
  const set=(id,v)=>{const el=$(id);if(el)el.value=v??''};

  function typeOf(b){
    if(['fixed_monthly','rolling_monthly','recurring_yearly','one_off'].includes(b?.commitmentType))return b.commitmentType;
    if(b?.frequency==='yearly')return 'recurring_yearly';
    if(b?.frequency==='monthly')return b?.due?'fixed_monthly':'rolling_monthly';
    return 'one_off';
  }

  function updateDateRequirement(){
    const type=$('billCommitmentType')?.value||'one_off';
    const field=$('billDueField'),input=$('billDue');
    const rolling=type==='rolling_monthly';
    const required=type==='fixed_monthly'||type==='recurring_yearly';
    if(field)field.classList.toggle('is-disabled',rolling);
    if(input){
      input.disabled=rolling;
      input.required=required;
      if(rolling)input.value='';
    }
    const requiredLabel=$('billDueRequired');
    if(requiredLabel)requiredLabel.textContent=rolling?'(not used)':required?'(required)':'(optional)';
    const help=$('billDueHelp');
    if(help)help.textContent=rolling?'Displayed as “Due this month”; no date is stored.':'Use the real calendar date for this commitment.';
  }

  function openEditor(){
    const editor=$('billEditor');
    if(!editor)return;
    editor.classList.remove('fv21-editor-collapsed');
    editor.removeAttribute('hidden');
    editor.setAttribute('aria-hidden','false');
    editor.style.removeProperty('display');
    requestAnimationFrame(()=>editor.scrollIntoView({behavior:'smooth',block:'center'}));
  }

  function editBill(id){
    const s=state();
    const b=arr(s?.finance?.bills).find(x=>String(x?.id||'')===String(id||''));
    if(!b)return false;

    set('billId',b.id);
    set('billName',b.name);
    set('billAmount',b.amount);
    set('billDue',b.due||'');
    set('billCommitmentType',typeOf(b));
    set('billFrequency',b.frequency||'monthly');
    updateDateRequirement();

    // finance.js rebuilds this select from active pots. Preserve the exact
    // canonical funding source when the option already exists.
    const source=$('billFundingSource');
    if(source){
      const wanted=String(b.fundingSource||'Current Account');
      const option=[...source.options].find(o=>o.value===wanted)||[...source.options].find(o=>norm(o.value)===norm(wanted));
      if(option)source.value=option.value;
    }
    set('billCategory',b.category||'Other');
    if($('billIncluded'))$('billIncluded').checked=b.included!==false;
    const title=$('billEditorTitle');
    if(title)title.textContent='Edit Bill';
    openEditor();
    setTimeout(()=>$('billName')?.focus({preventScroll:true}),120);
    return true;
  }

  function canonicaliseFundingSource(id){
    const s=state();if(!s||!w.Aurora2?.core?.update)return;
    const bill=arr(s.finance?.bills).find(b=>String(b?.id||'')===String(id||''));
    if(!bill||norm(bill.fundingSource)==='current account')return;
    const pot=arr(s.finance?.pots).find(p=>!p?.archived&&norm(p?.name)===norm(bill.fundingSource));
    if(!pot||pot.name===bill.fundingSource)return;
    w.Aurora2.core.update(current=>({
      ...current,
      finance:{
        ...current.finance,
        bills:arr(current.finance?.bills).map(b=>String(b?.id||'')===String(id||'')?{...b,fundingSource:pot.name,updatedAt:new Date().toISOString()}:b)
      }
    }));
  }

  function visibleActual(button,id){
    const row=button.closest('.fv2-bill-row,.finance-item,.finance-next-bill,[data-bill-row],article,div');
    const local=row?.querySelector('input[type="number"]');
    if(local&&Number.isFinite(Number(local.value)))return Math.max(0,Number(local.value));
    const b=arr(state()?.finance?.bills).find(x=>String(x?.id||'')===String(id||''));
    return Math.max(0,Number(b?.amount)||0);
  }

  function syncActualInputs(id,actual){
    const target=`actual-${id}`;
    document.querySelectorAll('input').forEach(input=>{
      if(input.id===target)input.value=Number(actual||0).toFixed(2);
    });
  }

  function completeBill(button,id){
    const control=w.Aurora2?.financeCommitmentControl;
    if(typeof control?.completeBill!=='function')return false;
    const actual=visibleActual(button,id);
    canonicaliseFundingSource(id);
    syncActualInputs(id,actual);
    control.completeBill(id);
    return true;
  }

  function normaliseButtons(root=document){
    root.querySelectorAll?.('[data-bill-complete],[data-bill-edit]').forEach(button=>{
      if(button.tagName==='BUTTON')button.type='button';
      button.style.pointerEvents='auto';
    });
  }

  function capture(event){
    const edit=event.target?.closest?.('[data-bill-edit]');
    if(edit){
      event.preventDefault();
      event.stopImmediatePropagation();
      editBill(edit.dataset.billEdit);
      return;
    }

    const paid=event.target?.closest?.('[data-bill-complete]');
    if(paid){
      event.preventDefault();
      event.stopImmediatePropagation();
      completeBill(paid,paid.dataset.billComplete);
    }
  }

  function watch(){
    normaliseButtons();
    const targets=['billList','financeNextFiveBills'].map($).filter(Boolean);
    targets.forEach(host=>{
      const observer=new MutationObserver(()=>normaliseButtons(host));
      observer.observe(host,{childList:true,subtree:true});
    });
  }

  function init(){
    // Window capture runs before Finance UI's document-level adapters and
    // before the native document bubble handler, preventing duplicate payment.
    w.addEventListener('click',capture,true);
    watch();
    [100,350,900].forEach(ms=>setTimeout(()=>normaliseButtons(),ms));
  }

  w.AuroraFinanceBillActionsFix={editBill,completeBill:(id)=>{
    const button=document.querySelector(`[data-bill-complete="${String(id).replace(/"/g,'\\"')}"]`);
    return button?completeBill(button,id):false;
  },refresh:()=>normaliseButtons()};

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})(window);
