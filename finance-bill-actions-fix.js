/* Aurora 2 — Finance Bill Action Bridge v3
 * iPad/Safari-safe bill interaction.
 *
 * finance.js remains the payment authority. This bridge deliberately uses the
 * browser's native prompt for the actual payment amount so no live Aurora row,
 * modal, observer or CSS layer can steal focus while the user is typing.
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
  let busy=false;

  function money(v){
    const n=Number(v)||0;
    try{return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n)}
    catch(_){return `£${n.toFixed(2)}`}
  }

  function typeOf(b){
    if(['fixed_monthly','rolling_monthly','recurring_yearly','one_off'].includes(b?.commitmentType))return b.commitmentType;
    if(b?.frequency==='yearly')return 'recurring_yearly';
    if(b?.frequency==='monthly')return b?.due?'fixed_monthly':'rolling_monthly';
    return 'one_off';
  }

  function billById(id){
    return arr(state()?.finance?.bills).find(x=>String(x?.id||'')===String(id||''))||null;
  }

  function updateDateRequirement(){
    const type=$('billCommitmentType')?.value||'one_off';
    const field=$('billDueField'),input=$('billDue');
    const rolling=type==='rolling_monthly',required=type==='fixed_monthly'||type==='recurring_yearly';
    if(field)field.classList.toggle('is-disabled',rolling);
    if(input){input.disabled=rolling;input.required=required;if(rolling)input.value=''}
    if($('billDueRequired'))$('billDueRequired').textContent=rolling?'(not used)':required?'(required)':'(optional)';
    if($('billDueHelp'))$('billDueHelp').textContent=rolling?'Displayed as “Due this month”; no date is stored.':'Use the real calendar date for this commitment.';
  }

  function openEditor(){
    const editor=$('billEditor');if(!editor)return;
    editor.classList.remove('fv21-editor-collapsed');
    editor.removeAttribute('hidden');
    editor.setAttribute('aria-hidden','false');
    editor.style.setProperty('display','block','important');
    requestAnimationFrame(()=>editor.scrollIntoView({behavior:'smooth',block:'center'}));
  }

  function editBill(id){
    const b=billById(id);if(!b)return false;
    set('billId',b.id);
    set('billName',b.name);
    set('billAmount',b.amount);
    set('billDue',b.due||'');
    set('billCommitmentType',typeOf(b));
    set('billFrequency',b.frequency||'monthly');
    updateDateRequirement();

    const source=$('billFundingSource');
    if(source){
      const wanted=String(b.fundingSource||'Current Account');
      const option=[...source.options].find(o=>o.value===wanted)||[...source.options].find(o=>norm(o.value)===norm(wanted));
      if(option)source.value=option.value;
    }
    set('billCategory',b.category||'Other');
    if($('billIncluded'))$('billIncluded').checked=b.included!==false;
    if($('billEditorTitle'))$('billEditorTitle').textContent='Edit Bill';
    openEditor();
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

  function paymentCount(id){
    return arr(state()?.finance?.payments).filter(p=>String(p?.billId||'')===String(id||'')&&!p?.reversed).length;
  }

  function invokeCanonicalComplete(id,actual){
    const control=w.Aurora2?.financeCommitmentControl;
    if(typeof control?.completeBill!=='function'){
      alert('Finance payment engine is still loading. Please try again in a moment.');
      return false;
    }

    canonicaliseFundingSource(id);

    // finance.js reads actual-{billId}. Give it one stable hidden value while
    // the canonical completion runs, then restore any rendered copies.
    const target=`actual-${id}`;
    const clashes=[...document.querySelectorAll('input[id]')].filter(el=>el.id===target);
    clashes.forEach((el,index)=>{el.id=`${target}-held-${index}`});

    const input=document.createElement('input');
    input.type='number';
    input.id=target;
    input.value=Number(actual).toFixed(2);
    input.style.cssText='position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(input);

    try{control.completeBill(id)}finally{
      input.remove();
      clashes.forEach(el=>{if(el.isConnected)el.id=target});
    }
    return true;
  }

  function askForPayment(id){
    if(busy)return false;
    const b=billById(id);if(!b)return false;
    busy=true;
    try{
      const planned=Math.max(0,Number(b.amount)||0);
      const raw=w.prompt(
        `Actual amount paid for ${b.name}\n\nPlanned: ${money(planned)}\nFunding: ${b.fundingSource||'Current Account'}\n\nEnter the real amount paid:`,
        planned.toFixed(2)
      );
      if(raw===null)return false;

      const cleaned=String(raw).trim().replace(/£/g,'').replace(/,/g,'.').replace(/[^0-9.-]/g,'');
      const actual=Number(cleaned);
      if(!Number.isFinite(actual)||actual<=0){
        alert('Enter a valid payment amount above £0.');
        return false;
      }

      const ok=w.confirm(`Record ${money(actual)} as paid for ${b.name}?`);
      if(!ok)return false;

      const before=paymentCount(id);
      invokeCanonicalComplete(id,actual);
      const after=paymentCount(id);
      if(after<=before){
        // Finance itself may have blocked it, e.g. insufficient named-pot cash.
        return false;
      }
      return true;
    }finally{
      setTimeout(()=>{busy=false},120);
    }
  }

  function normaliseButtons(root=document){
    root.querySelectorAll?.('[data-bill-complete],[data-bill-edit]').forEach(button=>{
      if(button.tagName==='BUTTON')button.type='button';
      button.style.setProperty('pointer-events','auto','important');
      button.style.setProperty('touch-action','manipulation','important');
    });

    // Old inline payment fields are intentionally hidden. The native Safari
    // amount prompt is now the sole actual-payment editor.
    root.querySelectorAll?.('#financeNextFiveBills .fv2-actual,#billList .mini-actual,#billList .fv2-actual').forEach(el=>{
      el.style.setProperty('display','none','important');
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
      askForPayment(paid.dataset.billComplete);
    }
  }

  function watch(){
    normaliseButtons();
    ['billList','financeNextFiveBills'].map($).filter(Boolean).forEach(host=>{
      const observer=new MutationObserver(()=>normaliseButtons(host));
      observer.observe(host,{childList:true,subtree:true});
    });
  }

  function init(){
    w.addEventListener('click',capture,true);
    watch();
    [80,250,650,1200].forEach(ms=>setTimeout(()=>normaliseButtons(),ms));
  }

  w.AuroraFinanceBillActionsFix={
    editBill,
    completeBill:askForPayment,
    refresh:()=>normaliseButtons()
  };

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})(window);
