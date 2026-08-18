/* Aurora 2 — House Dashboard UI Upgrade v2
 * Presentation-only upgrade for Finance > House Projects.
 * Keeps finance-house.js as the calculation/payment authority.
 */
(function(w){
  'use strict';
  if(w.AuroraFinanceHouseDashboardUpgrade)return;

  const file=String(location.pathname||'').split('/').pop().toLowerCase();
  if(file!=='finance.html')return;

  const $=id=>document.getElementById(id);
  let ledgerObserver=null;
  let filterQueued=false;
  let editorHome=null;

  function injectStyles(){
    if($('auroraHouseDashboardUpgradeStyles'))return;
    const style=document.createElement('style');
    style.id='auroraHouseDashboardUpgradeStyles';
    style.textContent=`
      #housePanel .house-quick-actions{
        display:flex;align-items:center;justify-content:space-between;gap:22px;
        margin:0 0 22px;padding:22px 24px;
        border:1px solid rgba(50,211,255,.28);border-radius:18px;
        background:linear-gradient(135deg,rgba(7,31,50,.96),rgba(3,15,30,.96));
        box-shadow:0 16px 38px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.035)
      }
      #housePanel .house-quick-copy{min-width:0}
      #housePanel .house-quick-kicker{display:block;margin-bottom:5px;color:#52ddff;font-size:13px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}
      #housePanel .house-quick-title{display:block;color:#f4fbff;font-size:clamp(25px,2.5vw,34px);line-height:1.05;font-weight:900;letter-spacing:-.025em}
      #housePanel .house-quick-copy p{margin:8px 0 0;color:#9db4c7;font-size:14px;line-height:1.5}
      #houseQuickAddPayment,.house-renovation-control .house-inline-add-payment{
        appearance:none;border:1px solid rgba(59,225,255,.5);border-radius:12px;
        background:linear-gradient(135deg,#17c9ef,#20e0bd);color:#02111b;
        min-height:50px;padding:0 22px;font:900 15px/1 inherit;letter-spacing:.035em;
        cursor:pointer;box-shadow:0 10px 24px rgba(24,211,226,.16);white-space:nowrap
      }
      #houseQuickAddPayment:hover,.house-renovation-control .house-inline-add-payment:hover{filter:brightness(1.07)}

      #housePanel .house-renovation-control .finance-panel-kicker{font-size:13px!important;letter-spacing:.18em!important}
      #housePanel .house-renovation-control .finance-panel-head h3{font-size:clamp(27px,2.6vw,38px)!important;line-height:1.05!important;letter-spacing:-.025em!important}
      #housePanel .house-renovation-control .finance-panel-note{font-size:13px!important;line-height:1.4!important}
      #housePanel .house-renovation-control .house-room{padding:18px!important}
      #housePanel .house-renovation-control .house-room h3{font-size:20px!important;line-height:1.15!important;margin-bottom:8px!important}
      #housePanel .house-renovation-control .house-room-meta{font-size:14px!important;line-height:1.6!important}
      #housePanel .house-renovation-control .house-room-actions .btn{min-height:40px!important;padding:0 13px!important;font-size:12px!important;font-weight:800!important}

      #houseLedgerList .house-entry[data-house-history-hidden="1"]{display:none!important}
      #houseLedgerList .house-reserved-empty{padding:18px;border:1px dashed rgba(104,151,184,.28);border-radius:14px;color:#91a8bb;font-size:14px;line-height:1.45}

      .aurora-house-modal{
        position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;
        padding:24px;background:rgba(0,5,14,.82);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)
      }
      .aurora-house-modal.is-open{display:flex}
      .aurora-house-modal-card{
        width:min(980px,96vw);max-height:min(900px,92vh);overflow:auto;
        border:1px solid rgba(61,216,255,.34);border-radius:22px;
        background:linear-gradient(180deg,#07182a 0%,#03101e 100%);
        box-shadow:0 30px 90px rgba(0,0,0,.62),0 0 0 1px rgba(255,255,255,.025)
      }
      .aurora-house-modal-head{
        position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:18px;
        padding:20px 22px;border-bottom:1px solid rgba(80,176,220,.2);background:rgba(5,19,34,.97)
      }
      .aurora-house-modal-head span{display:block;color:#53dcff;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;margin-bottom:4px}
      .aurora-house-modal-head strong{display:block;color:#fff;font-size:25px;line-height:1.08}
      .aurora-house-modal-close{
        appearance:none;width:46px;height:46px;flex:0 0 46px;border:1px solid rgba(126,172,204,.28);border-radius:12px;
        background:#071424;color:#e8f8ff;font-size:24px;line-height:1;cursor:pointer
      }
      .aurora-house-modal-body{padding:20px}
      .aurora-house-modal #houseEntryEditor{
        display:block!important;margin:0!important;border:0!important;border-radius:0!important;
        background:transparent!important;box-shadow:none!important;padding:0!important;width:100%!important
      }
      .aurora-house-modal #houseEntryEditor .finance-panel-head{margin-bottom:18px}
      .aurora-house-modal #houseEntryEditor .finance-panel-head .finance-panel-kicker{font-size:12px!important}
      .aurora-house-modal #houseEntryEditor #houseEditorTitle{font-size:28px!important}
      .aurora-house-modal #houseEntryEditor .field label{font-size:14px!important;font-weight:800!important}
      .aurora-house-modal #houseEntryEditor input,
      .aurora-house-modal #houseEntryEditor select{
        min-height:50px!important;font-size:16px!important
      }
      .aurora-house-modal #houseEntryEditor .finance-btn{min-height:48px!important;font-size:14px!important}
      body.aurora-house-modal-open{overflow:hidden!important}

      @media(max-width:760px){
        #housePanel .house-quick-actions{align-items:stretch;flex-direction:column;padding:18px}
        #houseQuickAddPayment{width:100%}
        #housePanel .house-renovation-control .finance-panel-head{align-items:flex-start;gap:12px;flex-wrap:wrap}
        .house-renovation-control .house-inline-add-payment{width:100%}
        .aurora-house-modal{padding:10px;align-items:flex-start}
        .aurora-house-modal-card{width:100%;max-height:calc(100vh - 20px);border-radius:18px}
        .aurora-house-modal-head{padding:16px}
        .aurora-house-modal-head strong{font-size:22px}
        .aurora-house-modal-body{padding:14px}
      }
    `;
    document.head.appendChild(style);
  }

  function activateHouseTab(){
    const tab=document.querySelector('[data-tab="housePanel"]');
    if(tab&&!tab.classList.contains('active'))tab.click();
  }

  function ensureModal(){
    let modal=$('auroraHousePaymentModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='auroraHousePaymentModal';
    modal.className='aurora-house-modal';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-label','Add House Payment');
    modal.innerHTML=`
      <div class="aurora-house-modal-card">
        <div class="aurora-house-modal-head">
          <div><span>Renovation Control</span><strong>House Payment</strong></div>
          <button type="button" class="aurora-house-modal-close" aria-label="Close payment editor">×</button>
        </div>
        <div class="aurora-house-modal-body" id="auroraHouseModalBody"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.aurora-house-modal-close')?.addEventListener('click',closePaymentEditor);
    modal.addEventListener('click',event=>{if(event.target===modal)closePaymentEditor()});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal.classList.contains('is-open'))closePaymentEditor()});
    return modal;
  }

  function rememberEditorHome(editor){
    if(editorHome?.isConnected)return editorHome;
    editorHome=document.createElement('div');
    editorHome.id='houseEntryEditorHome';
    editorHome.style.display='none';
    editor.parentNode?.insertBefore(editorHome,editor);
    return editorHome;
  }

  function moveEditorIntoModal(){
    const editor=$('houseEntryEditor');
    const body=$('auroraHouseModalBody');
    if(!editor||!body)return false;
    rememberEditorHome(editor);
    if(editor.parentNode!==body)body.appendChild(editor);
    return true;
  }

  function restoreEditorHome(){
    const editor=$('houseEntryEditor');
    if(!editor||!editorHome?.parentNode)return;
    editorHome.parentNode.insertBefore(editor,editorHome.nextSibling);
  }

  function openPaymentEditor(){
    activateHouseTab();
    const modal=ensureModal();
    if(!moveEditorIntoModal())return;

    // Reuse the real Finance House clear/reset action so the canonical editor is clean.
    $('houseClearEntry')?.click();
    modal.classList.add('is-open');
    document.body.classList.add('aurora-house-modal-open');
    requestAnimationFrame(()=>setTimeout(()=>$('houseEntryName')?.focus({preventScroll:true}),80));
  }

  function closePaymentEditor(){
    const modal=$('auroraHousePaymentModal');
    modal?.classList.remove('is-open');
    document.body.classList.remove('aurora-house-modal-open');
    restoreEditorHome();
  }

  function ensureQuickActions(){
    const panel=$('housePanel');
    if(!panel||$('houseHouseQuickActions'))return;
    const bar=document.createElement('div');
    bar.id='houseHouseQuickActions';
    bar.className='house-quick-actions';
    bar.innerHTML=`
      <div class="house-quick-copy">
        <span class="house-quick-kicker">Renovation Control</span>
        <strong class="house-quick-title">House Project Payments</strong>
        <p>Add the next reserved job here. Paid and historical records stay in Aurora for totals, but remain hidden from this working view.</p>
      </div>
      <button id="houseQuickAddPayment" type="button">+ Add Payment</button>`;
    panel.insertBefore(bar,panel.firstChild||null);
    $('houseQuickAddPayment')?.addEventListener('click',openPaymentEditor);
  }

  function ensureRenovationControl(){
    const panel=$('housePanel');if(!panel)return;
    const renovation=[...panel.querySelectorAll('.finance-panel')].find(card=>
      String(card.querySelector('.finance-panel-kicker')?.textContent||'').trim().toLowerCase()==='renovation control'
    );
    if(!renovation)return;
    renovation.classList.add('house-renovation-control');

    const head=renovation.querySelector('.finance-panel-head');
    if(head&&!head.querySelector('.house-inline-add-payment')){
      const button=document.createElement('button');
      button.type='button';
      button.className='house-inline-add-payment';
      button.textContent='+ Add Payment';
      button.addEventListener('click',openPaymentEditor);
      const note=head.querySelector('.finance-panel-note');
      if(note)note.insertAdjacentElement('afterend',button);else head.appendChild(button);
    }
  }

  function filterHouseLedger(){
    filterQueued=false;
    const host=$('houseLedgerList');if(!host)return;
    host.querySelector('.house-reserved-empty')?.remove();
    const entries=[...host.querySelectorAll('.house-entry')];
    if(!entries.length){const meta=$('houseLedgerMeta');if(meta)meta.textContent='0 reserved';return}

    let reserved=0;
    entries.forEach(entry=>{
      const status=String(entry.querySelector('.house-pill')?.textContent||'').trim().toUpperCase();
      const keep=status==='RESERVED';
      entry.dataset.houseHistoryHidden=keep?'0':'1';
      if(keep)reserved+=1;
    });
    const meta=$('houseLedgerMeta');if(meta)meta.textContent=`${reserved} reserved`;
    if(!reserved){
      const empty=document.createElement('div');
      empty.className='house-reserved-empty';
      empty.textContent='No reserved house payments. Paid and historical records are kept in Aurora but hidden from this working list.';
      host.appendChild(empty);
    }
  }

  function queueLedgerFilter(){if(filterQueued)return;filterQueued=true;requestAnimationFrame(filterHouseLedger)}

  function watchLedger(){
    const host=$('houseLedgerList');if(!host||ledgerObserver)return;
    ledgerObserver=new MutationObserver(queueLedgerFilter);
    ledgerObserver.observe(host,{childList:true,subtree:true,characterData:true});
    queueLedgerFilter();
  }

  function watchSaveSuccess(){
    document.addEventListener('click',event=>{
      const save=event.target.closest?.('#houseSaveEntry');if(!save)return;
      setTimeout(()=>{
        const status=$('houseStatus');
        if(status&&!status.classList.contains('red')&&/saved/i.test(status.textContent||''))closePaymentEditor();
      },80);
    });
  }

  function init(){
    injectStyles();ensureModal();ensureQuickActions();ensureRenovationControl();watchLedger();watchSaveSuccess();
    const panel=$('housePanel');
    if(panel){
      const observer=new MutationObserver(()=>{ensureQuickActions();ensureRenovationControl();queueLedgerFilter()});
      observer.observe(panel,{childList:true,subtree:true});
    }
  }

  w.AuroraFinanceHouseDashboardUpgrade={
    openPaymentEditor,closePaymentEditor,
    refresh:()=>{ensureQuickActions();ensureRenovationControl();queueLedgerFilter()}
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})(window);
