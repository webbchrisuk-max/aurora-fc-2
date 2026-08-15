(function(w){
  'use strict';
  const A=()=>w.Aurora2;
  const $=id=>document.getElementById(id);
  const money=v=>A().ui.money(Number(v)||0);
  const esc=v=>A().ui.escape(v);
  const now=()=>new Date().toISOString();
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const arr=v=>Array.isArray(v)?v:[];
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const LEGACY_KEYS=[['local','aurora_wealth_centre'],['local','aurora_wealth_centre_backup_v3'],['session','aurora_wealth_centre_session_v3']];
  const DEFAULT_ROOMS=['Games Room','Living Room','Hallway','Kitchen','Whole House'];
  let syncingDerived=false;
  const HOUSE_BACKUP='aurora2:pre-house-migration:latest';
  let legacySource=null;

  function house(state=A().core.read()){return obj(state.finance?.houseProject)}
  function housePot(state=A().core.read()){
    return arr(state.finance?.pots).find(p=>String(p.id||'').toLowerCase().includes('house')||/house/.test(norm(p.name)))||null;
  }
  function metrics(state=A().core.read()){
    const hp=house(state), pot=housePot(state);
    const cash=num(pot?.balance), target=num(hp.target||pot?.target);
    const entries=arr(hp.entries);
    const reserved=entries.filter(e=>e.status==='reserved').reduce((s,e)=>s+num(e.estimated),0);
    const entrySpend=entries.filter(e=>e.status==='paid'||e.status==='historical').reduce((s,e)=>s+num(e.actual),0);
    const spent=num(hp.openingHistoricalSpend)+entrySpend;
    const funded=cash+spent, remaining=Math.max(0,target-funded), available=Math.max(0,cash-reserved);
    const progress=target>0?Math.min(100,funded/target*100):(funded>0?100:0);
    const rooms=arr(hp.rooms).map((room,index)=>{
      const rows=entries.filter(e=>e.room===room);
      const estimated=rows.reduce((s,e)=>s+num(e.estimated),0);
      const actual=rows.filter(e=>e.status==='paid'||e.status==='historical').reduce((s,e)=>s+num(e.actual),0);
      const pending=rows.filter(e=>e.status==='reserved').reduce((s,e)=>s+num(e.estimated),0);
      return {room,index,rows,estimated,actual,pending,variance:estimated-actual};
    });
    return {hp,pot,cash,target,reserved,spent,funded,remaining,available,progress,rooms};
  }

  function set(id,v){const el=$(id);if(el)el.textContent=v}
  function setValue(id,v){const el=$(id);if(el)el.value=v??''}
  function value(id){return $(id)?.value||''}
  function showStatus(msg,bad=false){const el=$('houseStatus');if(!el)return;el.textContent=msg;el.className=bad?'notice red':'notice good'}

  function ensureHouseDefaults(state){
    const finance=obj(state.finance), hp={...obj(finance.houseProject)}, pot=housePot(state);
    let changed=false;
    if(!arr(hp.rooms).length){hp.rooms=[...DEFAULT_ROOMS];changed=true;}
    else{
      const rooms=[...new Set(arr(hp.rooms).map(x=>String(x).trim()).filter(Boolean))];
      DEFAULT_ROOMS.forEach(room=>{if(!rooms.includes(room))rooms.push(room)});
      if(JSON.stringify(rooms)!==JSON.stringify(hp.rooms)){hp.rooms=rooms;changed=true;}
    }
    if(num(hp.target)<=0&&num(pot?.target)>0){hp.target=num(pot.target);changed=true;}
    if(!Array.isArray(hp.entries)){hp.entries=[];changed=true;}
    if(!Array.isArray(hp.actions)){hp.actions=[];changed=true;}
    if(!changed)return state;
    hp.updatedAt=now();
    return {...state,finance:{...finance,houseProject:hp}};
  }

  function syncHousePotDraft(state){
    const hp=house(state), pots=[...arr(state.finance?.pots)], pi=pots.findIndex(p=>String(p.id||'').toLowerCase().includes('house')||/house/.test(norm(p.name)));
    if(pi<0)return state;
    const spent=num(hp.openingHistoricalSpend)+arr(hp.entries).filter(e=>e.status==='paid'||e.status==='historical').reduce((s,e)=>s+num(e.actual),0);
    const current=pots[pi], target=num(hp.target||current.target), mode='funded-progress';
    if(Math.abs(num(current.target)-target)<.005 && current.goalMode===mode && Math.abs(num(current.spent)-spent)<.005)return state;
    pots[pi]={...current,target,goalMode:mode,spent,updatedAt:now()};
    return {...state,finance:{...state.finance,pots}};
  }

  function renderKpis(m){
    set('houseTargetKpi',money(m.target));set('houseCashKpi',money(m.cash));set('houseReservedKpi',money(m.reserved));
    set('houseAvailableKpi',money(m.available));set('houseSpentKpi',money(m.spent));set('houseFundedKpi',money(m.funded));set('houseRemainingKpi',money(m.remaining));
    set('houseProgressPct',`${Math.round(m.progress)}%`);set('houseProgressCaption',`${money(m.funded)} funded of ${money(m.target)}`);
    const bar=$('houseProgressBar');if(bar)bar.style.width=`${m.progress.toFixed(1)}%`;
  }

  function renderRooms(m){
    const host=$('houseRoomGrid');if(!host)return;
    if(!m.rooms.length){host.innerHTML='<div class="house-empty">No rooms yet.</div>';return}
    host.innerHTML=m.rooms.map(r=>`<article class="house-room"><h3>${esc(r.room)}</h3><div class="house-room-meta">Estimated ${money(r.estimated)} • Actual ${money(r.actual)}<br>Reserved ${money(r.pending)} • Variance ${money(r.variance)}</div><div class="progress-mini"><i style="width:${r.estimated>0?Math.min(100,r.actual/r.estimated*100):0}%"></i></div><div class="house-room-actions"><button class="btn secondary" data-house-room-rename="${esc(r.room)}">Rename</button><button class="btn danger" data-house-room-delete="${esc(r.room)}">Remove</button></div></article>`).join('');
  }

  function statusPill(e){return e.status==='reserved'?'<span class="house-pill watch">RESERVED</span>':e.status==='paid'?'<span class="house-pill good">PAID</span>':'<span class="house-pill good">HISTORICAL</span>'}
  function renderLedger(m){
    const host=$('houseLedgerList');if(!host)return;
    const rank={reserved:0,paid:1,historical:2};
    const rows=[...arr(m.hp.entries)].sort((a,b)=>(rank[a.status]??3)-(rank[b.status]??3)||String(a.due||'9999').localeCompare(String(b.due||'9999'))||String(a.name).localeCompare(String(b.name)));
    set('houseLedgerMeta',`${rows.length} record${rows.length===1?'':'s'}`);
    if(!rows.length){host.innerHTML='<div class="house-empty">No House payments yet. Import Aurora 1 or add a payment.</div>';return}
    host.innerHTML=rows.map(e=>`<article class="house-entry"><div class="house-entry-head"><div><strong>${esc(e.name)}</strong><div class="house-entry-meta">${esc(e.room)} • ${esc(e.category)} • ${esc(e.due||'No date')}<br>Estimated ${money(e.estimated)} • Actual ${money(e.actual)}${e.notes?` • ${esc(e.notes)}`:''}</div></div>${statusPill(e)}</div><div class="house-entry-actions">${e.status==='reserved'?`<div class="house-actual"><label>Actual</label><input type="number" min="0" step="0.01" value="${num(e.actual).toFixed(2)}" data-house-actual="${esc(e.id)}"></div><button class="btn primary" data-house-pay="${esc(e.id)}">Mark Paid</button>`:''}<button class="btn secondary" data-house-edit="${esc(e.id)}">Edit</button>${e.status==='paid'&&e.deducted?`<button class="btn secondary" data-house-undo="${esc(e.id)}">Undo</button>`:''}<button class="btn danger" data-house-delete="${esc(e.id)}">Delete</button></div></article>`).join('');
  }

  function renderSetup(m){
    const target=$('houseProjectTarget'), balance=$('houseCurrentBalance'), opening=$('houseOpeningSpent');
    if(target&&document.activeElement!==target)target.value=m.target||'';
    if(balance&&document.activeElement!==balance)balance.value=num(m.cash).toFixed(2);
    if(opening&&document.activeElement!==opening)opening.value=m.hp.openingHistoricalSpend||0;
  }
  function renderRoomSelect(m){const sel=$('houseEntryRoom');if(!sel)return;const current=sel.value;sel.innerHTML=m.hp.rooms.map(r=>`<option>${esc(r)}</option>`).join('');if(m.hp.rooms.includes(current))sel.value=current}
  function renderActions(m){const host=$('houseActionHistory');if(!host)return;const actions=arr(m.hp.actions).slice(0,20);if(!actions.length){host.innerHTML='<div class="house-empty">No Aurora 2 House actions yet.</div>';return}host.innerHTML=actions.map(a=>`<div class="house-history-row"><div><strong>${esc(a.label)}</strong><span>${money(a.amount)} • ${new Date(a.at).toLocaleString('en-GB')}${a.reversed?' • UNDONE':''}</span></div></div>`).join('')}

  function renderAll(){
    if(!A()?.core)return;
    let state=A().core.read();
    let next=ensureHouseDefaults(state);
    next=syncHousePotDraft(next);
    const changed=JSON.stringify(next.finance?.houseProject)!==JSON.stringify(state.finance?.houseProject) || JSON.stringify(next.finance?.pots)!==JSON.stringify(state.finance?.pots);
    if(changed&&!syncingDerived){
      syncingDerived=true;
      try{state=A().core.write(next);}finally{syncingDerived=false;}
    }else state=next;
    const m=metrics(state);renderKpis(m);renderRooms(m);renderLedger(m);renderRoomSelect(m);renderActions(m);renderSetup(m);renderMigration();
  }

  function resetEditor(){setValue('houseEntryId','');setValue('houseEntryName','');setValue('houseEntryEstimated','');setValue('houseEntryActual','');setValue('houseEntryDue','');setValue('houseEntryCategory','House project');setValue('houseEntryType','reserved');setValue('houseEntryNotes','');set('houseEditorTitle','Add House Payment')}
  function editEntry(id){const e=arr(house().entries).find(x=>x.id===id);if(!e)return;setValue('houseEntryId',e.id);setValue('houseEntryName',e.name);setValue('houseEntryRoom',e.room);setValue('houseEntryEstimated',e.estimated);setValue('houseEntryActual',e.actual);setValue('houseEntryDue',e.due);setValue('houseEntryCategory',e.category);setValue('houseEntryType',e.status==='reserved'?'reserved':'historical');setValue('houseEntryNotes',e.notes);set('houseEditorTitle','Edit House Payment');$('houseEntryEditor')?.scrollIntoView({behavior:'smooth',block:'center'})}

  function saveEntry(){
    const id=value('houseEntryId')||A().core.uid('HOUSE'), name=value('houseEntryName').trim(), room=value('houseEntryRoom'), estimated=num(value('houseEntryEstimated')), actual=num(value('houseEntryActual')), type=value('houseEntryType'), due=value('houseEntryDue'), category=value('houseEntryCategory').trim()||'House project', notes=value('houseEntryNotes').trim();
    if(!name){showStatus('Enter a house payment description.',true);return}
    if(type==='reserved'&&estimated<=0){showStatus('Reserved work needs an estimated cost above £0.',true);return}
    if(type==='historical'&&actual<=0){showStatus('Historical spending needs the actual amount paid.',true);return}
    A().core.update(s=>{
      const hp={...s.finance.houseProject,entries:[...arr(s.finance.houseProject?.entries)],actions:[...arr(s.finance.houseProject?.actions)]};
      const idx=hp.entries.findIndex(e=>e.id===id), old=idx>=0?hp.entries[idx]:null;
      const wasDeducted=old?.status==='paid'&&old?.deducted;
      const entry={...(old||{}),id,name,room,estimated:type==='historical'?(estimated||actual):estimated,actual,status:type==='historical'?'historical':'reserved',deducted:false,paidDate:type==='historical'?(old?.paidDate||due||today()):'',due,category,notes,createdAt:old?.createdAt||now(),updatedAt:now()};
      let next={...s,finance:{...s.finance,houseProject:hp}};
      if(wasDeducted){
        const pots=[...arr(s.finance.pots)], pi=pots.findIndex(p=>p.id===housePot(s)?.id); if(pi>=0)pots[pi]={...pots[pi],balance:num(pots[pi].balance)+num(old.actual),updatedAt:now()}; next={...next,finance:{...next.finance,pots}};
      }
      if(idx>=0)hp.entries[idx]=entry;else hp.entries.push(entry);
      hp.updatedAt=now();
      return syncHousePotDraft(next);
    });
    resetEditor();showStatus('House payment saved.');renderAll();
  }

  function payEntry(id){
    const input=document.querySelector(`[data-house-actual="${CSS.escape(id)}"]`), actual=num(input?.value);
    if(actual<=0){showStatus('Enter the actual cost before marking this payment paid.',true);return}
    let message='Payment recorded.';
    A().core.update(s=>{
      const hp={...s.finance.houseProject,entries:[...arr(s.finance.houseProject?.entries)],actions:[...arr(s.finance.houseProject?.actions)]};
      const ei=hp.entries.findIndex(e=>e.id===id);if(ei<0||hp.entries[ei].status!=='reserved')return s;
      const pots=[...arr(s.finance.pots)], pot=housePot(s), pi=pots.findIndex(p=>p.id===pot?.id);if(pi<0){message='House Fund pot is missing.';return s}
      if(num(pots[pi].balance)+.009<actual){message=`House Fund has ${money(pots[pi].balance)}, not enough for ${money(actual)}.`;return s}
      const beforeEntry={...hp.entries[ei]}, beforePot={...pots[pi]};
      pots[pi]={...pots[pi],balance:Math.max(0,num(pots[pi].balance)-actual),updatedAt:now()};
      hp.entries[ei]={...hp.entries[ei],actual,status:'paid',deducted:true,paidDate:today(),updatedAt:now()};
      hp.actions.unshift({id:A().core.uid('HOUSEACT'),type:'payment',entryId:id,label:`${hp.entries[ei].name} paid`,amount:actual,at:now(),reversed:false,reversedAt:null,beforeEntry,beforePot});
      hp.updatedAt=now();
      const diff=num(beforeEntry.estimated)-actual;message=`${hp.entries[ei].name} paid at ${money(actual)}${Math.abs(diff)>.009?` • ${diff>=0?money(diff)+' under estimate':money(Math.abs(diff))+' over estimate'}`:''}.`;
      return syncHousePotDraft({...s,finance:{...s.finance,pots,houseProject:hp}});
    });
    showStatus(message,!/paid at|Payment recorded/.test(message));renderAll();
  }

  function undoEntry(id){
    A().core.update(s=>{
      const hp={...s.finance.houseProject,entries:[...arr(s.finance.houseProject?.entries)],actions:[...arr(s.finance.houseProject?.actions)]};
      const ei=hp.entries.findIndex(e=>e.id===id);if(ei<0||hp.entries[ei].status!=='paid'||!hp.entries[ei].deducted)return s;
      const pots=[...arr(s.finance.pots)], pot=housePot(s), pi=pots.findIndex(p=>p.id===pot?.id);if(pi<0)return s;
      const amount=num(hp.entries[ei].actual);pots[pi]={...pots[pi],balance:num(pots[pi].balance)+amount,updatedAt:now()};
      hp.entries[ei]={...hp.entries[ei],status:'reserved',deducted:false,paidDate:'',updatedAt:now()};
      const ai=hp.actions.findIndex(a=>a.entryId===id&&a.type==='payment'&&!a.reversed);if(ai>=0)hp.actions[ai]={...hp.actions[ai],reversed:true,reversedAt:now()};
      hp.updatedAt=now();return syncHousePotDraft({...s,finance:{...s.finance,pots,houseProject:hp}});
    });
    showStatus('Payment undone and cash restored to the House Fund.');renderAll();
  }

  function deleteEntry(id){
    const current=arr(house().entries).find(e=>e.id===id);if(!current)return;
    if(!confirm(`Delete ${current.name}?${current.status==='paid'&&current.deducted?' Its cash deduction will be restored.':''}`))return;
    A().core.update(s=>{
      const hp={...s.finance.houseProject,entries:[...arr(s.finance.houseProject?.entries)]};
      const ei=hp.entries.findIndex(e=>e.id===id);if(ei<0)return s;const e=hp.entries[ei];let pots=[...arr(s.finance.pots)];
      if(e.status==='paid'&&e.deducted){const pot=housePot(s),pi=pots.findIndex(p=>p.id===pot?.id);if(pi>=0)pots[pi]={...pots[pi],balance:num(pots[pi].balance)+num(e.actual),updatedAt:now()}}
      hp.entries.splice(ei,1);hp.updatedAt=now();return syncHousePotDraft({...s,finance:{...s.finance,pots,houseProject:hp}});
    });
    showStatus('House payment deleted.');renderAll();
  }

  function saveSetup(){
    const target=num(value('houseProjectTarget')), opening=num(value('houseOpeningSpent')), requestedBalance=num(value('houseCurrentBalance'));
    let balanceChanged=false, beforeBalance=0, afterBalance=requestedBalance;
    A().core.update(s=>{
      const hp={
        ...s.finance.houseProject,
        target,
        openingHistoricalSpend:opening,
        actions:[...arr(s.finance.houseProject?.actions)],
        updatedAt:now()
      };
      const pots=[...arr(s.finance.pots)], pot=housePot(s), pi=pots.findIndex(p=>p.id===pot?.id);
      if(pi>=0){
        beforeBalance=num(pots[pi].balance);
        balanceChanged=Math.abs(beforeBalance-requestedBalance)>.005;
        if(balanceChanged){
          pots[pi]={...pots[pi],balance:requestedBalance,updatedAt:now()};
          hp.actions.unshift({
            id:A().core.uid('HOUSEACT'),
            type:'balance-adjustment',
            entryId:'',
            label:`House Fund balance changed ${money(beforeBalance)} → ${money(requestedBalance)}`,
            amount:Math.abs(requestedBalance-beforeBalance),
            at:now(),
            reversed:false,
            reversedAt:null,
            beforeEntry:null,
            beforePot:{...pot}
          });
        }
      }
      return syncHousePotDraft({...s,finance:{...s.finance,pots,houseProject:hp}});
    });
    showStatus(balanceChanged
      ? `House Fund balance updated from ${money(beforeBalance)} to ${money(afterBalance)}. No spending entry was created.`
      : 'House setup saved.');
    renderAll();
  }

  function addRoom(){const name=prompt('New room name:','').trim();if(!name)return;A().core.update(s=>{const rooms=[...arr(s.finance.houseProject?.rooms)];if(!rooms.some(r=>norm(r)===norm(name)))rooms.push(name);return {...s,finance:{...s.finance,houseProject:{...s.finance.houseProject,rooms,updatedAt:now()}}}});renderAll()}
  function renameRoom(oldName){const name=prompt('Rename room:',oldName)?.trim();if(!name||name===oldName)return;A().core.update(s=>{const hp={...s.finance.houseProject,rooms:arr(s.finance.houseProject?.rooms).map(r=>r===oldName?name:r),entries:arr(s.finance.houseProject?.entries).map(e=>e.room===oldName?{...e,room:name,updatedAt:now()}:e),updatedAt:now()};return {...s,finance:{...s.finance,houseProject:hp}}});renderAll()}
  function deleteRoom(name){const hp=house(), used=arr(hp.entries).some(e=>e.room===name);if(used){showStatus('Move or delete that room’s payments before removing the room.',true);return}if(!confirm(`Remove room ${name}?`))return;A().core.update(s=>({...s,finance:{...s.finance,houseProject:{...s.finance.houseProject,rooms:arr(s.finance.houseProject?.rooms).filter(r=>r!==name),updatedAt:now()}}}));renderAll()}

  function unwrap(v){if(v?.houseProjectLedger||Array.isArray(v?.editablePots))return v;for(const k of ['plannerState','state','data','planner'])if(v?.[k]?.houseProjectLedger)return v[k];return null}
  function scanLegacy(){
    const found=[];
    for(const [area,key] of LEGACY_KEYS){
      try{
        const store=area==='session'?sessionStorage:localStorage;
        const raw=store.getItem(key), state=unwrap(JSON.parse(raw||'null'));
        if(!state?.houseProjectLedger)continue;
        const saved=Date.parse(state?._persistence?.savedAt||state?.updatedAt||'')||Number(state?._persistence?.savedAt)||0;
        found.push({area,key,state,saved});
      }catch(_){ }
    }
    found.sort((a,b)=>b.saved-a.saved);legacySource=found[0]||null;return legacySource;
  }
  function legacyHousePot(state){return arr(state?.editablePots).find(p=>String(p.id||'')==='house_fund'||/house/.test(norm(p.name)))||null}
  function legacyEntry(e,index){const status=['reserved','paid','historical'].includes(e?.status)?e.status:(e?.paid?'paid':'reserved');const legacy=num(e?.amount), estimated=num(e?.estimated??legacy), actual=num(e?.actual??((status==='paid'||status==='historical')?legacy:0));return {id:String(e?.id||`A1-HOUSE-${index}`),name:String(e?.name||'House payment'),estimated,actual,due:String(e?.due||''),room:String(e?.room||e?.category||'Whole House'),category:String(e?.category||'House project'),status,deducted:Boolean(e?.deducted),paidDate:String(e?.paidDate||''),notes:String(e?.notes||''),createdAt:now(),updatedAt:now()}}

  function renderMigration(){
    const src=scanLegacy(), badge=$('houseMigrationBadge'), summary=$('houseMigrationSummary'), btn=$('houseImportBtn');if(!badge||!summary||!btn)return;
    if(!src){badge.textContent='NOT FOUND';badge.className='red';summary.textContent='No Aurora 1 House Project Ledger was found in this browser. Aurora 2 House Projects can still be used manually.';btn.disabled=true;return}
    const l=obj(src.state.houseProjectLedger), pot=legacyHousePot(src.state), entries=arr(l.entries), paid=entries.filter(e=>e.status==='paid'||e.status==='historical').length, reserved=entries.filter(e=>e.status==='reserved').length;
    badge.textContent=house().migrated?'IMPORTED':'FOUND';badge.className='good';summary.textContent=`Found ${entries.length} House records across ${arr(l.rooms).length} rooms • ${reserved} reserved • ${paid} paid/historical • legacy target ${money(pot?.target||0)}. Import merges by record ID and does not deduct House Fund cash again.`;btn.disabled=false;
  }

  function importLegacy(){
    const src=scanLegacy();if(!src){showStatus('Aurora 1 House Ledger not found.',true);return}
    const raw=localStorage.getItem(A().core.KEY)||JSON.stringify(A().core.read());localStorage.setItem(HOUSE_BACKUP,raw);
    const legacyLedger=obj(src.state.houseProjectLedger), lp=legacyHousePot(src.state), incoming=arr(legacyLedger.entries).map(legacyEntry);
    A().core.update(s=>{
      const hp={...s.finance.houseProject,rooms:[...new Set([...arr(s.finance.houseProject?.rooms),...arr(legacyLedger.rooms).map(String).filter(Boolean)])],entries:[...arr(s.finance.houseProject?.entries)],openingHistoricalSpend:num(legacyLedger.openingHistoricalSpend),target:num(lp?.target||s.finance.houseProject?.target),migrated:true,migration:{sourceKey:src.key,sourceSavedAt:src.saved||0,importedAt:now(),entryCount:incoming.length},updatedAt:now()};
      incoming.forEach(e=>{const i=hp.entries.findIndex(x=>x.id===e.id);if(i>=0)hp.entries[i]={...hp.entries[i],...e};else hp.entries.push(e)});
      let next={...s,finance:{...s.finance,houseProject:hp}};const existing=housePot(next);
      if(!existing&&lp){next.finance.pots=[...arr(next.finance.pots),{id:'A1-POT-house_fund',name:String(lp.name||'House Fund'),balance:num(lp.balance),target:num(lp.target),fundingPerPayday:0,fundingOverride:0,fundingReason:'',fundingRequired:0,priority:2,goalMode:'funded-progress',spent:0,deadline:'',note:String(lp.note||'Renovation and home projects'),archived:false,createdAt:now(),updatedAt:now()}]}
      return syncHousePotDraft(next);
    });
    showStatus(`Aurora 1 House Ledger imported: ${incoming.length} records. Current House Fund cash was not deducted again.`);renderAll();
  }

  function wire(){
    $('houseSaveEntry')?.addEventListener('click',saveEntry);$('houseClearEntry')?.addEventListener('click',resetEditor);$('houseSaveSetup')?.addEventListener('click',saveSetup);$('houseAddRoom')?.addEventListener('click',addRoom);$('houseImportBtn')?.addEventListener('click',importLegacy);
    document.addEventListener('click',e=>{const pay=e.target.closest('[data-house-pay]');if(pay){payEntry(pay.dataset.housePay);return}const edit=e.target.closest('[data-house-edit]');if(edit){editEntry(edit.dataset.houseEdit);return}const undo=e.target.closest('[data-house-undo]');if(undo){undoEntry(undo.dataset.houseUndo);return}const del=e.target.closest('[data-house-delete]');if(del){deleteEntry(del.dataset.houseDelete);return}const ren=e.target.closest('[data-house-room-rename]');if(ren){renameRoom(ren.dataset.houseRoomRename);return}const rd=e.target.closest('[data-house-room-delete]');if(rd){deleteRoom(rd.dataset.houseRoomDelete);return}});
  }

  document.addEventListener('DOMContentLoaded',()=>{resetEditor();renderAll();wire()});
  w.addEventListener('aurora2:state',()=>{if(!syncingDerived)renderAll()});
  w.Aurora2=w.Aurora2||{};w.Aurora2.house={metrics,renderAll,importLegacy};
})(window);
