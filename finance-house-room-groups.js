/* Aurora 2 — House Reserved Payments by Room v1
 * Presentation-only grouping for Finance > House Projects.
 * finance-house.js remains the ledger/payment authority.
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
      #houseLedgerList .house-room-reserved-title{
        min-width:0;
      }
      #houseLedgerList .house-room-reserved-title small{
        display:block;
        margin-bottom:3px;
        color:#52ddff;
        font-size:10px;
        font-weight:900;
        letter-spacing:.17em;
        text-transform:uppercase;
      }
      #houseLedgerList .house-room-reserved-title strong{
        display:block;
        color:#f4fbff;
        font-size:20px;
        line-height:1.12;
        font-weight:900;
      }
      #houseLedgerList .house-room-reserved-summary{
        flex:none;
        text-align:right;
      }
      #houseLedgerList .house-room-reserved-summary strong{
        display:block;
        color:#70f0c8;
        font-size:17px;
        font-weight:900;
      }
      #houseLedgerList .house-room-reserved-summary span{
        display:block;
        margin-top:2px;
        color:#91a8bb;
        font-size:11px;
        font-weight:700;
      }
      #houseLedgerList .house-room-reserved-rows{
        display:grid;
        gap:0;
      }
      #houseLedgerList .house-room-reserved-rows > .house-entry{
        margin:0!important;
        border:0!important;
        border-radius:0!important;
        border-bottom:1px solid rgba(124,164,190,.12)!important;
        background:transparent!important;
      }
      #houseLedgerList .house-room-reserved-rows > .house-entry:last-child{
        border-bottom:0!important;
      }
      #houseLedgerList .house-reserved-empty{margin-top:0}
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

    applying=true;
    try{
      resetExistingGroups(host);

      const {entries,rooms}=stateEntries();
      const byId=new Map(entries.map(e=>[String(e.id||''),e]));
      const reservedRows=[...host.querySelectorAll(':scope > .house-entry')].filter(row=>{
        const status=String(row.querySelector('.house-pill')?.textContent||'').trim().toUpperCase();
        return status==='RESERVED' && row.dataset.houseHistoryHidden!=='1';
      });
      if(!reservedRows.length)return;

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
    }finally{
      applying=false;
    }
  }

  function queue(){
    if(queued||applying)return;
    queued=true;
    requestAnimationFrame(groupReserved);
  }

  function init(){
    injectStyles();
    const host=$('houseLedgerList');
    if(!host)return;
    observer=new MutationObserver(queue);
    observer.observe(host,{childList:true,subtree:true,characterData:true});
    queue();
  }

  w.AuroraFinanceHouseRoomGroups={refresh:queue};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
  w.addEventListener('aurora2:state',queue);
})(window);
