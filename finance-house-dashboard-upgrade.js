/* Aurora 2 — House Dashboard UI Upgrade v1
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

  function injectStyles(){
    if($('auroraHouseDashboardUpgradeStyles'))return;
    const style=document.createElement('style');
    style.id='auroraHouseDashboardUpgradeStyles';
    style.textContent=`
      #housePanel .house-quick-actions{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:22px;
        margin:0 0 22px;
        padding:22px 24px;
        border:1px solid rgba(50,211,255,.28);
        border-radius:18px;
        background:linear-gradient(135deg,rgba(7,31,50,.96),rgba(3,15,30,.96));
        box-shadow:0 16px 38px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.035);
      }
      #housePanel .house-quick-copy{min-width:0}
      #housePanel .house-quick-kicker{
        display:block;
        margin-bottom:5px;
        color:#52ddff;
        font-size:13px;
        font-weight:900;
        letter-spacing:.18em;
        text-transform:uppercase;
      }
      #housePanel .house-quick-title{
        display:block;
        color:#f4fbff;
        font-size:clamp(25px,2.5vw,34px);
        line-height:1.05;
        font-weight:900;
        letter-spacing:-.025em;
      }
      #housePanel .house-quick-copy p{
        margin:8px 0 0;
        color:#9db4c7;
        font-size:14px;
        line-height:1.5;
      }
      #houseQuickAddPayment,
      .house-renovation-control .house-inline-add-payment{
        appearance:none;
        border:1px solid rgba(59,225,255,.5);
        border-radius:12px;
        background:linear-gradient(135deg,#17c9ef,#20e0bd);
        color:#02111b;
        min-height:48px;
        padding:0 20px;
        font:900 15px/1 inherit;
        letter-spacing:.035em;
        cursor:pointer;
        box-shadow:0 10px 24px rgba(24,211,226,.16);
        white-space:nowrap;
      }
      #houseQuickAddPayment:hover,
      .house-renovation-control .house-inline-add-payment:hover{filter:brightness(1.07)}

      #housePanel .house-renovation-control .finance-panel-kicker{
        font-size:13px!important;
        letter-spacing:.18em!important;
      }
      #housePanel .house-renovation-control .finance-panel-head h3{
        font-size:clamp(27px,2.6vw,38px)!important;
        line-height:1.05!important;
        letter-spacing:-.025em!important;
      }
      #housePanel .house-renovation-control .finance-panel-note{
        font-size:13px!important;
        line-height:1.4!important;
      }
      #housePanel .house-renovation-control .house-room{
        padding:18px!important;
      }
      #housePanel .house-renovation-control .house-room h3{
        font-size:20px!important;
        line-height:1.15!important;
        margin-bottom:8px!important;
      }
      #housePanel .house-renovation-control .house-room-meta{
        font-size:14px!important;
        line-height:1.6!important;
      }
      #housePanel .house-renovation-control .house-room-actions .btn{
        min-height:40px!important;
        padding:0 13px!important;
        font-size:12px!important;
        font-weight:800!important;
      }

      #houseLedgerList .house-entry[data-house-history-hidden="1"]{display:none!important}
      #houseLedgerList .house-reserved-empty{
        padding:18px;
        border:1px dashed rgba(104,151,184,.28);
        border-radius:14px;
        color:#91a8bb;
        font-size:14px;
        line-height:1.45;
      }
      #housePanel #houseEntryEditor.house-editor-highlight{
        animation:auroraHouseEditorFocus 900ms ease-out 1;
      }
      @keyframes auroraHouseEditorFocus{
        0%{box-shadow:0 0 0 0 rgba(45,220,255,.55)}
        100%{box-shadow:0 0 0 18px rgba(45,220,255,0)}
      }

      @media(max-width:760px){
        #housePanel .house-quick-actions{
          align-items:stretch;
          flex-direction:column;
          padding:18px;
        }
        #houseQuickAddPayment{width:100%}
        #housePanel .house-renovation-control .finance-panel-head{
          align-items:flex-start;
          gap:12px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function activateHouseTab(){
    const tab=document.querySelector('[data-tab="housePanel"]');
    if(tab&&!tab.classList.contains('active'))tab.click();
  }

  function openPaymentEditor(){
    activateHouseTab();
    // finance-house.js owns reset/edit/save behaviour. Reuse its real Clear action.
    $('houseClearEntry')?.click();
    const editor=$('houseEntryEditor');
    if(!editor)return;
    editor.classList.remove('house-editor-highlight');
    void editor.offsetWidth;
    editor.classList.add('house-editor-highlight');
    requestAnimationFrame(()=>{
      editor.scrollIntoView({behavior:'smooth',block:'center'});
      setTimeout(()=>$('houseEntryName')?.focus({preventScroll:true}),360);
    });
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
      if(note)note.insertAdjacentElement('afterend',button);
      else head.appendChild(button);
    }
  }

  function filterHouseLedger(){
    filterQueued=false;
    const host=$('houseLedgerList');if(!host)return;
    host.querySelector('.house-reserved-empty')?.remove();

    const entries=[...host.querySelectorAll('.house-entry')];
    if(!entries.length){
      const meta=$('houseLedgerMeta');
      if(meta)meta.textContent='0 reserved';
      return;
    }

    let reserved=0;
    entries.forEach(entry=>{
      const status=String(entry.querySelector('.house-pill')?.textContent||'').trim().toUpperCase();
      const keep=status==='RESERVED';
      entry.dataset.houseHistoryHidden=keep?'0':'1';
      if(keep)reserved+=1;
    });

    const meta=$('houseLedgerMeta');
    if(meta)meta.textContent=`${reserved} reserved`;

    if(!reserved){
      const empty=document.createElement('div');
      empty.className='house-reserved-empty';
      empty.textContent='No reserved house payments. Paid and historical records are kept in Aurora but hidden from this working list.';
      host.appendChild(empty);
    }
  }

  function queueLedgerFilter(){
    if(filterQueued)return;
    filterQueued=true;
    requestAnimationFrame(filterHouseLedger);
  }

  function watchLedger(){
    const host=$('houseLedgerList');
    if(!host||ledgerObserver)return;
    ledgerObserver=new MutationObserver(queueLedgerFilter);
    ledgerObserver.observe(host,{childList:true,subtree:true,characterData:true});
    queueLedgerFilter();
  }

  function init(){
    injectStyles();
    ensureQuickActions();
    ensureRenovationControl();
    watchLedger();

    // Re-apply presentation after Finance's canonical renderer refreshes the page.
    const panel=$('housePanel');
    if(panel){
      const observer=new MutationObserver(()=>{
        ensureQuickActions();
        ensureRenovationControl();
        queueLedgerFilter();
      });
      observer.observe(panel,{childList:true,subtree:true});
    }
  }

  w.AuroraFinanceHouseDashboardUpgrade={openPaymentEditor,refresh:()=>{ensureQuickActions();ensureRenovationControl();queueLedgerFilter();}};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})(window);
