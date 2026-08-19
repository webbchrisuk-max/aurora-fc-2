/* Aurora 2 — House Reserved Payments by Room v2
 * Presentation + interaction stability for Finance > House Projects.
 * finance-house.js remains the ledger/payment authority.
 *
 * Fixes:
 * - protects Actual inputs from live aurora2:state re-renders while editing
 * - keeps typed Actual drafts if the ledger is rebuilt
 * - opens the existing House Payment modal for Edit
 * - makes Mark Paid / Edit / Delete reliably touchable on iPad/Safari
 */
(function(w){
  'use strict';
  if(w.AuroraFinanceHouseRoomGroups)return;

  const file=String(location.pathname||'').split('/').pop().toLowerCase();
  if(file!=='finance.html')return;

  const $=id=>document.getElementById(id);
  let queued=false;
  let applying=false;
  let observer=null;
  let interactionUntil=0;
  let releaseTimer=null;
  const actualDrafts=new Map();

  const money=v=>{
    const helper=w.Aurora2?.ui?.money;
    return typeof helper==='function'
      ? helper(Number(v)||0)
      : new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)||0);
  };
  const esc=v=>{
    const helper=w.Aurora2?.ui?.escape;
    if(typeof helper==='function')return helper(String(v??''));
    return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  };

  function holdInteraction(ms=3000){
    interactionUntil=Math.max(interactionUntil,Date.now()+ms);
    clearTimeout(releaseTimer);
  }
  function interacting(){
    const active=document.activeElement;
    return Date.now()<interactionUntil || !!active?.matches?.('[data-house-actual],#houseEntryEditor input,#houseEntryEditor select');
  }
  function releaseInteraction(delay=500,redispatch=false){
    clearTimeout(releaseTimer);
    releaseTimer=setTimeout(()=>{
      interactionUntil=0;
      if(redispatch){
        try{w.dispatchEvent(new CustomEvent('aurora2:state',{detail:{source:'house-interaction-release'}}))}catch(_){}
      }
    },delay);
  }

  function injectStyles(){
    if($('auroraHouseRoomGroupStyles'))return;
    const style=document.createElement('style');
    style.id='auroraHouseRoomGroupStyles';
    style.textContent=`
      #houseLedgerList .house-room-reserved-group{
        margin:0 0 16px;
        overflow:hidden;
        border:1px solid rgba(82,221,255,.18);
        border-radius:16px;
        background:rgba(5,18,33,.68);
      }
      #houseLedgerList .house-room-reserved-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        padding:15px 17px;
        border-bottom:1px solid rgba(82,221,255,.13);
        background:linear-gradient(90deg,rgba(16,62,85,.62),rgba(7,27,45,.5));
      }
      #houseLedgerList .house-room-reserved-title{min-width:0}
      #houseLedgerList .house-room-reserved-title small{
        display:block;margin-bottom:3px;color:#52ddff;font-size:10px;font-weight:900;
        letter-spacing:.17em;text-transform:uppercase
      }
      #houseLedgerList .house-room-reserved-title strong{
        display:block;color:#f4fbff;font-size:20px;line-height:1.12;font-weight:900
      }
      #houseLedgerList .house-room-reserved-summary{flex:none;text-align:right}
      #houseLedgerList .house-room-reserved-summary strong{
        display:block;color:#70f0c8;font-size:17px;font-weight:900
      }
      #houseLedgerList .house-room-reserved-summary span{
        display:block;margin-top:2px;color:#91a8bb;font-size:11px;font-weight:700
      }
      #houseLedgerList .house-room-reserved-rows{display:grid;gap:0}
      #houseLedgerList .house-room-reserved-rows > .house-entry{
        margin:0!important;border:0!important;border-radius:0!important;
        border-bottom:1px solid rgba(124,164,190,.12)!important;background:transparent!important
      }
      #houseLedgerList .house-room-reserved-rows > .house-entry:last-child{border-bottom:0!important}
      #houseLedgerList .house-reserved-empty{margin-top:0}

      /* iPad/Safari interaction isolation for the real House controls. */
      #houseLedgerList [data-house-actual]{
        pointer-events:auto!important;touch-action:manipulation!important;user-select:text!important;
        -webkit-user-select:text!important;opacity:1!important;position:relative!important;z-index:4!important;
        font-size:16px!important
      }
      #houseLedgerList [data-house-pay],
      #houseLedgerList [data-house-edit],
      #houseLedgerList [data-house-delete],
      #houseLedgerList [data-house-undo]{
        pointer-events:auto!important;touch-action:manipulation!important;position:relative!important;z-index:5!important
      }
      @media(max-width:700px){
        #houseLedgerList .house-room-reserved-head{align-items:flex-start;padding:14px}
        #houseLedgerList .house-room-reserved-title strong{font-size:18px}
        #houseLedgerList .house-room-reserved-summary strong{font-size:15px}
      }
    `;
    document.head.appendChild(style);
  }

  function stateEntries(){
    const state=w.Aurora2?.core?.read?.();
    const hp=state?.finance?.houseProject||{};
    return {
      entries:Array.isArray(hp.entries)?hp.entries:[],
      rooms:Array.isArray(hp.rooms)?hp.rooms:[]
    };
  }

  function entryIdFromNode(node){
    return node.querySelector('[data-house-pay]')?.dataset.housePay
      || node.querySelector('[data-house-edit]')?.dataset.houseEdit
      || node.querySelector('[data-house-delete]')?.dataset.houseDelete
      || '';
  }

  function normaliseHouseControls(root=document){
    root.querySelectorAll?.('[data-house-pay],[data-house-edit],[data-house-delete],[data-house-undo]').forEach(button=>{
      if(button.tagName==='BUTTON')button.type='button';
      button.style.pointerEvents='auto';
    });
    root.querySelectorAll?.('[data-house-actual]').forEach(input=>{
      input.disabled=false;
      input.readOnly=false;
      input.style.pointerEvents='auto';
      const id=String(input.dataset.houseActual||'');
      if(id&&actualDrafts.has(id)&&document.activeElement!==input)input.value=actualDrafts.get(id);
    });
  }

  function resetExistingGroups(host){
    const groups=[...host.querySelectorAll(':scope > .house-room-reserved-group')];
    if(!groups.length)return;
    const fragment=document.createDocumentFragment();
    groups.forEach(group=>{
      group.querySelectorAll('.house-entry').forEach(row=>fragment.appendChild(row));
      group.remove();
    });
    host.insertBefore(fragment,host.querySelector('.house-reserved-empty')||null);
  }

  function groupReserved(){
    queued=false;
    if(applying)return;
    const host=$('houseLedgerList');
    if(!host)return;

    /* Never regroup underneath a finger/keyboard interaction. */
    if(interacting()){
      queued=true;
      setTimeout(()=>{queued=false;queue()},300);
      return;
    }

    applying=true;
    try{
      resetExistingGroups(host);

      const {entries,rooms}=stateEntries();
      const byId=new Map(entries.map(e=>[String(e.id||''),e]));
      const reservedRows=[...host.querySelectorAll(':scope > .house-entry')].filter(row=>{
        const status=String(row.querySelector('.house-pill')?.textContent||'').trim().toUpperCase();
        return status==='RESERVED' && row.dataset.houseHistoryHidden!=='1';
      });
      if(!reservedRows.length){normaliseHouseControls(host);return}

      const groups=new Map();
      reservedRows.forEach(row=>{
        const id=entryIdFromNode(row);
        const record=byId.get(id)||{};
        const room=String(record.room||'Unassigned').trim()||'Unassigned';
        if(!groups.has(room))groups.set(room,[]);
        groups.get(room).push({row,record});
      });

      const roomOrder=new Map(rooms.map((room,index)=>[String(room),index]));
      const sorted=[...groups.entries()].sort((a,b)=>{
        const ai=roomOrder.has(a[0])?roomOrder.get(a[0]):9999;
        const bi=roomOrder.has(b[0])?roomOrder.get(b[0]):9999;
        return ai-bi || a[0].localeCompare(b[0]);
      });

      const anchor=host.querySelector('.house-reserved-empty');
      sorted.forEach(([room,items])=>{
        const total=items.reduce((sum,item)=>sum+Math.max(0,Number(item.record.estimated)||0),0);
        const section=document.createElement('section');
        section.className='house-room-reserved-group';
        section.dataset.houseRoomGroup=room;
        section.innerHTML=`
          <div class="house-room-reserved-head">
            <div class="house-room-reserved-title">
              <small>Reserved Renovation</small>
              <strong>${esc(room)}</strong>
            </div>
            <div class="house-room-reserved-summary">
              <strong>${money(total)}</strong>
              <span>${items.length} reserved ${items.length===1?'payment':'payments'}</span>
            </div>
          </div>
          <div class="house-room-reserved-rows"></div>`;
        const rows=section.querySelector('.house-room-reserved-rows');
        items.forEach(item=>rows.appendChild(item.row));
        host.insertBefore(section,anchor||null);
      });
      normaliseHouseControls(host);
    }finally{
      applying=false;
    }
  }

  function queue(){
    if(queued||applying)return;
    queued=true;
    requestAnimationFrame(groupReserved);
  }

  function installInteractionGuard(){
    const relevant=target=>target?.closest?.('[data-house-actual],[data-house-pay],[data-house-edit],[data-house-delete],[data-house-undo]');

    /* finance-house.js listens to aurora2:state in the bubble phase and
       rebuilds the whole ledger. Stop that rebuild only while a House control
       is actively being touched/edited. */
    w.addEventListener('aurora2:state',event=>{
      if(interacting())event.stopImmediatePropagation();
    },true);

    document.addEventListener('pointerdown',event=>{
      if(relevant(event.target))holdInteraction(3500);
    },true);
    document.addEventListener('touchstart',event=>{
      if(relevant(event.target))holdInteraction(3500);
    },{capture:true,passive:true});
    document.addEventListener('focusin',event=>{
      const input=event.target?.closest?.('[data-house-actual]');
      if(input){holdInteraction(30000);normaliseHouseControls(input.parentElement||document)}
    },true);
    document.addEventListener('input',event=>{
      const input=event.target?.closest?.('[data-house-actual]');
      if(!input)return;
      const id=String(input.dataset.houseActual||'');
      if(id)actualDrafts.set(id,input.value);
      holdInteraction(30000);
    },true);
    document.addEventListener('focusout',event=>{
      if(event.target?.matches?.('[data-house-actual]'))releaseInteraction(900,false);
    },true);

    /* Edit must open the upgraded modal first; finance-house.js then populates
       the editor during its normal document-bubble click handler. */
    document.addEventListener('click',event=>{
      const edit=event.target?.closest?.('[data-house-edit]');
      if(edit){
        holdInteraction(1800);
        w.AuroraFinanceHouseDashboardUpgrade?.openPaymentEditor?.();
        releaseInteraction(700,false);
        return;
      }
      const pay=event.target?.closest?.('[data-house-pay]');
      if(pay){
        holdInteraction(1600);
        const id=String(pay.dataset.housePay||'');
        const input=document.querySelector(`[data-house-actual="${CSS.escape(id)}"]`);
        if(id&&input)actualDrafts.set(id,input.value);
        /* finance-house.js calls renderAll() itself after payment. Re-emit one
           state notification shortly afterwards so other Finance panels catch up. */
        setTimeout(()=>{
          actualDrafts.delete(id);
          interactionUntil=0;
          try{w.dispatchEvent(new CustomEvent('aurora2:state',{detail:{source:'house-payment-complete'}}))}catch(_){}
        },450);
        return;
      }
      if(event.target?.closest?.('[data-house-delete],[data-house-undo]')){
        holdInteraction(1000);
        releaseInteraction(550,true);
      }
    },true);
  }

  function init(){
    injectStyles();
    installInteractionGuard();
    const host=$('houseLedgerList');
    if(!host)return;
    observer=new MutationObserver(()=>{
      normaliseHouseControls(host);
      queue();
    });
    observer.observe(host,{childList:true,subtree:true,characterData:true});
    normaliseHouseControls(host);
    queue();
  }

  w.AuroraFinanceHouseRoomGroups={refresh:queue};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
  w.addEventListener('aurora2:state',queue);
})(window);
