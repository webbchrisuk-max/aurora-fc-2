/* Aurora 2 — Finance Bill Action Bridge v2
 * iPad/Safari-safe interaction bridge for dynamic Finance bill boards.
 * finance.js remains the bill/payment authority. This bridge keeps payment
 * amount entry outside live/re-rendered bill rows, then hands the confirmed
 * amount to finance.js's canonical completeBill() engine.
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
  let paymentBillId='';

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
    const rolling=type==='rolling_monthly';
    const required=type==='fixed_monthly'||type==='recurring_yearly';
    if(field)field.classList.toggle('is-disabled',rolling);
    if(input){input.disabled=rolling;input.required=required;if(rolling)input.value='';}
    const requiredLabel=$('billDueRequired');
    if(requiredLabel)requiredLabel.textContent=rolling?'(not used)':required?'(required)':'(optional)';
    const help=$('billDueHelp');
    if(help)help.textContent=rolling?'Displayed as “Due this month”; no date is stored.':'Use the real calendar date for this commitment.';
  }

  function injectStyles(){
    if($('auroraBillActionsFixStylesV2'))return;
    const style=document.createElement('style');
    style.id='auroraBillActionsFixStylesV2';
    style.textContent=`
      /* Amount entry lives in the stable modal, not in a live bill row. */
      #financeNextFiveBills .fv2-actual,
      #billList .mini-actual,
      #billList .fv2-actual{display:none!important}

      .aurora-bill-payment-modal{
        position:fixed;inset:0;z-index:120000;display:none;align-items:center;justify-content:center;
        padding:22px;background:rgba(0,5,14,.84);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)
      }
      .aurora-bill-payment-modal.is-open{display:flex}
      .aurora-bill-payment-card{
        width:min(560px,96vw);border:1px solid rgba(49,214,255,.34);border-radius:22px;
        background:linear-gradient(180deg,#081b2e,#03101e);box-shadow:0 28px 80px rgba(0,0,0,.62);overflow:hidden
      }
      .aurora-bill-payment-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 22px;border-bottom:1px solid rgba(79,172,213,.2)}
      .aurora-bill-payment-head small{display:block;color:#55dcff;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;margin-bottom:5px}
      .aurora-bill-payment-head strong{display:block;color:#f4fbff;font-size:25px;line-height:1.08}
      .aurora-bill-payment-close{width:44px;height:44px;border:1px solid rgba(122,168,200,.3);border-radius:12px;background:#071525;color:#fff;font-size:23px;cursor:pointer}
      .aurora-bill-payment-body{padding:22px}
      .aurora-bill-payment-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
      .aurora-bill-payment-meta div{padding:12px 14px;border:1px solid rgba(99,153,190,.18);border-radius:12px;background:rgba(7,24,40,.7)}
      .aurora-bill-payment-meta small{display:block;color:#7f9bb0;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:5px}
      .aurora-bill-payment-meta strong{color:#eaf8ff;font-size:14px}
      .aurora-bill-payment-field label{display:block;margin:0 0 8px;color:#ddecf5;font-size:14px;font-weight:850}
      .aurora-bill-payment-field .money-box{display:flex;align-items:center;gap:10px;border:1px solid rgba(70,209,244,.34);border-radius:14px;background:#04111f;padding:0 14px}
      .aurora-bill-payment-field .money-box span{color:#57ddff;font-size:22px;font-weight:900}
      #auroraBillPaymentAmount{width:100%;min-height:58px;border:0!important;outline:0!important;background:transparent!important;color:#fff!important;font:900 24px/1.1 inherit!important;padding:0!important;box-shadow:none!important;opacity:1!important;pointer-events:auto!important;-webkit-text-fill-color:#fff!important}
      .aurora-bill-payment-help{margin-top:8px;color:#8da7ba;font-size:12px;line-height:1.45}
      .aurora-bill-payment-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:22px}
      .aurora-bill-payment-actions button{min-height:48px;padding:0 18px;border-radius:12px;font-weight:900;cursor:pointer}
      #auroraBillPaymentCancel{border:1px solid rgba(122,168,200,.28);background:#071525;color:#ddecf5}
      #auroraBillPaymentConfirm{border:1px solid rgba(37,232,171,.45);background:linear-gradient(135deg,#18c9ee,#22dcae);color:#021319}
      body.aurora-bill-payment-open{overflow:hidden!important}
      @media(max-width:600px){.aurora-bill-payment-modal{padding:10px}.aurora-bill-payment-meta{grid-template-columns:1fr}.aurora-bill-payment-actions{flex-direction:column-reverse}.aurora-bill-payment-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensurePaymentModal(){
    let modal=$('auroraBillPaymentModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='auroraBillPaymentModal';
    modal.className='aurora-bill-payment-modal';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-label','Record bill payment');
    modal.innerHTML=`
      <div class="aurora-bill-payment-card">
        <div class="aurora-bill-payment-head">
          <div><small>Finance • Bill Payment</small><strong id="auroraBillPaymentName">Record Payment</strong></div>
          <button type="button" class="aurora-bill-payment-close" aria-label="Close">×</button>
        </div>
        <div class="aurora-bill-payment-body">
          <div class="aurora-bill-payment-meta">
            <div><small>Planned</small><strong id="auroraBillPaymentPlanned">£0.00</strong></div>
            <div><small>Funding source</small><strong id="auroraBillPaymentSource">Current Account</strong></div>
          </div>
          <div class="aurora-bill-payment-field">
            <label for="auroraBillPaymentAmount">Actual amount paid</label>
            <div class="money-box"><span>£</span><input id="auroraBillPaymentAmount" type="number" min="0" step="0.01" inputmode="decimal" autocomplete="off"></div>
            <div class="aurora-bill-payment-help">Change this to the real amount that left your account or pot, then confirm the payment.</div>
          </div>
          <div class="aurora-bill-payment-actions">
            <button type="button" id="auroraBillPaymentCancel">Cancel</button>
            <button type="button" id="auroraBillPaymentConfirm">Confirm Payment</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.aurora-bill-payment-close')?.addEventListener('click',closePaymentModal);
    $('auroraBillPaymentCancel')?.addEventListener('click',closePaymentModal);
    $('auroraBillPaymentConfirm')?.addEventListener('click',submitPaymentModal);
    modal.addEventListener('click',event=>{if(event.target===modal)closePaymentModal()});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal.classList.contains('is-open'))closePaymentModal()});
    return modal;
  }

  function openPaymentModal(id){
    const b=billById(id);if(!b)return false;
    paymentBillId=String(b.id||'');
    ensurePaymentModal();
    const name=$('auroraBillPaymentName');if(name)name.textContent=b.name||'Record Payment';
    const planned=$('auroraBillPaymentPlanned');if(planned)planned.textContent=money(b.amount);
    const source=$('auroraBillPaymentSource');if(source)source.textContent=b.fundingSource||'Current Account';
    const amount=$('auroraBillPaymentAmount');
    if(amount){amount.disabled=false;amount.readOnly=false;amount.value=Number(b.amount||0).toFixed(2)}
    $('auroraBillPaymentModal')?.classList.add('is-open');
    document.body.classList.add('aurora-bill-payment-open');
    setTimeout(()=>{amount?.focus({preventScroll:true});amount?.select?.()},100);
    return true;
  }

  function closePaymentModal(){
    $('auroraBillPaymentModal')?.classList.remove('is-open');
    document.body.classList.remove('aurora-bill-payment-open');
    paymentBillId='';
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
    editor.classList.remove('fv21-editor-collapsed');editor.removeAttribute('hidden');editor.setAttribute('aria-hidden','false');editor.style.removeProperty('display');
    requestAnimationFrame(()=>editor.scrollIntoView({behavior:'smooth',block:'center'}));
  }

  function editBill(id){
    const b=billById(id);if(!b)return false;
    set('billId',b.id);set('billName',b.name);set('billAmount',b.amount);set('billDue',b.due||'');set('billCommitmentType',typeOf(b));set('billFrequency',b.frequency||'monthly');updateDateRequirement();
    const source=$('billFundingSource');
    if(source){const wanted=String(b.fundingSource||'Current Account');const option=[...source.options].find(o=>o.value===wanted)||[...source.options].find(o=>norm(o.value)===norm(wanted));if(option)source.value=option.value}
    set('billCategory',b.category||'Other');if($('billIncluded'))$('billIncluded').checked=b.included!==false;
    if($('billEditorTitle'))$('billEditorTitle').textContent='Edit Bill';openEditor();setTimeout(()=>$('billName')?.focus({preventScroll:true}),120);return true;
  }

  function canonicaliseFundingSource(id){
    const s=state();if(!s||!w.Aurora2?.core?.update)return;
    const bill=arr(s.finance?.bills).find(b=>String(b?.id||'')===String(id||''));
    if(!bill||norm(bill.fundingSource)==='current account')return;
    const pot=arr(s.finance?.pots).find(p=>!p?.archived&&norm(p?.name)===norm(bill.fundingSource));
    if(!pot||pot.name===bill.fundingSource)return;
    w.Aurora2.core.update(current=>({...current,finance:{...current.finance,bills:arr(current.finance?.bills).map(b=>String(b?.id||'')===String(id||'')?{...b,fundingSource:pot.name,updatedAt:new Date().toISOString()}:b)}}));
  }

  function paymentCount(id){
    return arr(state()?.finance?.payments).filter(p=>String(p?.billId||'')===String(id||'')&&!p?.reversed).length;
  }

  function invokeCanonicalComplete(id,actual){
    const control=w.Aurora2?.financeCommitmentControl;
    if(typeof control?.completeBill!=='function')return false;
    canonicaliseFundingSource(id);

    // finance.js currently reads actual-{billId}. The live bill boards may
    // contain duplicate/re-rendered copies, so temporarily give Finance one
    // stable input containing the modal amount.
    const target=`actual-${id}`;
    const clashes=[...document.querySelectorAll('input[id]')].filter(el=>el.id===target);
    clashes.forEach((el,index)=>{el.dataset.auroraHeldActualId=target;el.id=`${target}-held-${index}`});
    const input=document.createElement('input');
    input.type='number';input.id=target;input.value=Number(actual).toFixed(2);input.style.cssText='position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(input);
    try{control.completeBill(id)}finally{
      input.remove();
      clashes.forEach(el=>{if(el.isConnected){el.id=target;delete el.dataset.auroraHeldActualId}});
    }
    return true;
  }

  function submitPaymentModal(){
    const id=paymentBillId;if(!id)return;
    const amount=Math.max(0,Number($('auroraBillPaymentAmount')?.value)||0);
    if(amount<=0){alert('Enter the actual amount paid.');$('auroraBillPaymentAmount')?.focus();return}
    const before=paymentCount(id);
    invokeCanonicalComplete(id,amount);
    const after=paymentCount(id);
    if(after>before){closePaymentModal();return}
    // If Finance blocked the payment (for example insufficient pot cash),
    // keep the modal open so the user can correct the amount or cancel.
    setTimeout(()=>$('auroraBillPaymentAmount')?.focus({preventScroll:true}),50);
  }

  function normaliseButtons(root=document){
    root.querySelectorAll?.('[data-bill-complete],[data-bill-edit]').forEach(button=>{if(button.tagName==='BUTTON')button.type='button';button.style.pointerEvents='auto'});
  }

  function capture(event){
    const edit=event.target?.closest?.('[data-bill-edit]');
    if(edit){event.preventDefault();event.stopImmediatePropagation();editBill(edit.dataset.billEdit);return}
    const paid=event.target?.closest?.('[data-bill-complete]');
    if(paid){event.preventDefault();event.stopImmediatePropagation();openPaymentModal(paid.dataset.billComplete)}
  }

  function watch(){
    normaliseButtons();
    ['billList','financeNextFiveBills'].map($).filter(Boolean).forEach(host=>{const observer=new MutationObserver(()=>normaliseButtons(host));observer.observe(host,{childList:true,subtree:true})});
  }

  function init(){
    injectStyles();ensurePaymentModal();w.addEventListener('click',capture,true);watch();[100,350,900].forEach(ms=>setTimeout(()=>normaliseButtons(),ms));
  }

  w.AuroraFinanceBillActionsFix={editBill,openPayment:openPaymentModal,refresh:()=>normaliseButtons()};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})(window);
