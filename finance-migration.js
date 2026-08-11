(function(w){
  'use strict';

  const A=()=>w.Aurora2;
  const $=id=>document.getElementById(id);
  const money=v=>A().ui.money(Number(v)||0);
  const esc=v=>A().ui.escape(v);
  const now=()=>new Date().toISOString();

  const LEGACY_SOURCES=[
    {key:'aurora_wealth_centre',area:'local',label:'Aurora 1 primary',priority:3},
    {key:'aurora_wealth_centre_backup_v3',area:'local',label:'Aurora 1 backup',priority:2},
    {key:'aurora_wealth_centre_session_v3',area:'session',label:'Aurora 1 session copy',priority:1}
  ];
  const BACKUP_LATEST='aurora2:pre-migration:latest';
  const BACKUP_PREFIX='aurora2:pre-migration:';
  const RECEIPT_KEY='aurora2:finance-migration:last:v1';

  let selected=null;
  let preview={pots:[],activeBills:[],historyBills:[],warnings:[],houseKeys:[]};

  function storage(area){return area==='session'?w.sessionStorage:w.localStorage}
  function safeGet(area,key){try{return storage(area).getItem(key)||''}catch(_){return ''}}
  function safeSet(area,key,value){try{storage(area).setItem(key,value);return true}catch(_){return false}}
  function safeParse(raw){try{return JSON.parse(raw)}catch(_){return null}}
  function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
  function arr(v){return Array.isArray(v)?v:[]}
  function num(v){const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0}
  function truthy(v){return v===true||v===1||String(v).toLowerCase()==='true'}
  function norm(v){return String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ' ).trim()}
  function slug(v){return String(v??'item').trim().replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'item'}
  function isValidLegacy(s){
    return !!(s&&typeof s==='object'&&!Array.isArray(s)&&(
      Array.isArray(s.scheduledBills)||Array.isArray(s.futureCosts)||Array.isArray(s.editablePots)||
      s.monzoPots&&typeof s.monzoPots==='object'||Object.prototype.hasOwnProperty.call(s,'holdingBalance')
    ));
  }
  function unwrap(value){
    if(isValidLegacy(value))return value;
    for(const key of ['plannerState','state','data','planner']){
      if(isValidLegacy(value?.[key]))return value[key];
    }
    return value;
  }
  function savedAt(s){
    const candidates=[s?._persistence?.savedAt,s?.savedAt,s?.updatedAt,s?._persistence?.savedIso];
    for(const v of candidates){
      const direct=Number(v); if(Number.isFinite(direct)&&direct>0)return direct;
      const date=Date.parse(v); if(Number.isFinite(date))return date;
    }
    return 0;
  }
  function dateLabel(ms){
    if(!ms)return 'No saved timestamp in source';
    try{return new Date(ms).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}catch(_){return new Date(ms).toString()}
  }
  function currentA2Summary(){
    const s=A().core.read(), f=s.finance||{};
    return `${arr(f.pots).length} pots • ${arr(f.bills).length} bills • ${arr(f.payments).length} payment records`;
  }

  function sourceCandidates(){
    return LEGACY_SOURCES.map(def=>{
      const raw=safeGet(def.area,def.key), parsed=unwrap(safeParse(raw));
      return {...def,raw,state:parsed,valid:isValidLegacy(parsed),savedAt:savedAt(parsed)};
    });
  }
  function renderSources(candidates=[]){
    const host=$('sourceList'); if(!host)return;
    host.innerHTML=candidates.map(c=>`<div class="source-row"><div><strong>${esc(c.label)}</strong><span>${esc(c.key)}${c.valid?` • ${esc(dateLabel(c.savedAt))}`:''}</span></div><span class="source-pill ${c.valid?'good':'red'}">${c.valid?'FOUND':'NOT FOUND'}</span></div>`).join('')||'<div class="source-row"><span class="muted">No scan results yet.</span></div>';
  }
  function selectBest(candidates){
    const valid=candidates.filter(c=>c.valid);
    valid.sort((a,b)=>b.savedAt-a.savedAt||b.priority-a.priority);
    return valid[0]||null;
  }

  function legacyPots(state){
    if(arr(state?.editablePots).length)return arr(state.editablePots);
    const mp=obj(state?.monzoPots);
    return Object.entries(mp).map(([id,p])=>({id,name:p?.name||id.replace(/_/g,' '),...obj(p)}));
  }
  function fundingValue(p){
    for(const key of ['fundingPerPayday','paydayFunding','paydayContribution','contributionPerPayday','funding']){
      if(p&&Object.prototype.hasOwnProperty.call(p,key))return {value:Math.max(0,num(p[key])),explicit:true};
    }
    return {value:0,explicit:false};
  }
  function spentValue(p){
    for(const key of ['spent','spentToDate','qualifyingSpent','actualSpent','fundedSpend']){
      if(p&&Object.prototype.hasOwnProperty.call(p,key))return {value:Math.max(0,num(p[key])),explicit:true};
    }
    return {value:0,explicit:false};
  }
  function normalisePot(p,index){
    const id=String(p?.id||p?.key||`pot-${index+1}`), name=String(p?.name||id.replace(/_/g,' ')).trim()||`Legacy Pot ${index+1}`;
    const fund=fundingValue(p), spent=spentValue(p), isHouse=/house/.test(norm(name));
    const explicitMode=String(p?.goalMode||p?.goal_mode||'').toLowerCase();
    const goalMode=!isHouse&&(explicitMode==='funded-progress'||explicitMode==='funded_progress'||spent.explicit&&spent.value>0)?'funded-progress':'balance';
    return {
      key:`pot:${id}`,
      id:`A1-POT-${slug(id)}`,
      legacyId:id,
      name,
      balance:Math.max(0,num(p?.balance??p?.current??p?.amount)),
      target:Math.max(0,num(p?.target??p?.payday_target??p?.goal)),
      fundingPerPayday:fund.value,
      sourceHasFunding:fund.explicit,
      priority:[1,2,3].includes(Number(p?.priority))?Number(p.priority):2,
      goalMode,
      spent:goalMode==='funded-progress'?spent.value:0,
      archived:truthy(p?.archived),
      createdAt:p?.createdAt||now(),updatedAt:now(),
      source:p
    };
  }

  function potNameForSource(source,pots){
    const s=norm(source);
    if(!s||s==='current account')return 'Current Account';
    if(s.includes('track only')||s.includes('already funded'))return 'Current Account';
    const exact=pots.find(p=>norm(p.name)===s); if(exact)return exact.name;
    if(s==='house pot'||s==='house fund'){const p=pots.find(x=>/house/.test(norm(x.name)));if(p)return p.name;}
    if(s==='dentist pot'||s==='dentist'){const p=pots.find(x=>/dent/.test(norm(x.name)));if(p)return p.name;}
    if(s==='christmas pot'){const p=pots.find(x=>/christ/.test(norm(x.name)));if(p)return p.name;}
    if(s==='spending pot'){const p=pots.find(x=>/spending/.test(norm(x.name)));if(p)return p.name;}
    if(s==='season ticket pot'){
      const p=pots.find(x=>/season ticket/.test(norm(x.name)))||pots.find(x=>/coventry.*ticket/.test(norm(x.name))); if(p)return p.name;
    }
    if(s==='holding pot')return 'Holding Pot';
    return 'Current Account';
  }
  function inferLegacySource(item){
    if(item?.fundingSource)return String(item.fundingSource);
    const t=norm(`${item?.name||''} ${item?.category||''} ${item?.notes||''}`);
    if(/dentist|tooth|hygien/.test(t))return 'Dentist Pot';
    if(/season ticket|coventry/.test(t))return 'Season Ticket Pot';
    if(/christmas/.test(t))return 'Christmas Pot';
    if(/house|floor|decor|plaster/.test(t))return 'House Pot';
    return item?.included===false?'Track only / already funded':'Holding Pot';
  }
  function normaliseFrequency(item,section){
    const raw=norm(item?.frequency||item?.repeat||item?.recurrence||item?.cadence||item?.cycle);
    if(section==='yearlyRecurringCosts'||/year|annual/.test(raw))return 'yearly';
    if(section==='recurringCosts'&&!raw)return 'monthly';
    if(/5 week|five week/.test(raw))return '5-weeks';
    if(/4 week|four week/.test(raw))return '4-weeks';
    if(/week/.test(raw))return 'weekly';
    if(/month/.test(raw))return 'monthly';
    return 'one-off';
  }
  function billKey(item,section,index){return `${section}:${String(item?.id||item?.key||item?.name||index)}`}
  function normaliseBill(item,section,index,pots,forceHistory=false){
    const name=String(item?.name||item?.title||`Legacy bill ${index+1}`).trim();
    const legacySource=inferLegacySource(item), mapped=potNameForSource(legacySource,pots);
    const trackOnly=/track only|already funded/.test(norm(legacySource));
    const paid=forceHistory||truthy(item?.paid)||truthy(item?.completed);
    const archived=forceHistory||truthy(item?.archived);
    const actual=Math.max(0,num(item?.actualPaid??item?.paidAmount??item?.actual??(paid?item?.amount:0)));
    const due=String(item?.due||item?.dueDate||item?.date||'').slice(0,10);
    const frequency=normaliseFrequency(item,section);
    const baseId=String(item?.id||item?.key||slug(`${name}-${due}-${index}`));
    const history=paid||archived;
    return {
      key:billKey(item,section,index),
      id:`A1-${history?'HIST':'BILL'}-${slug(baseId)}${history&&due?'-'+slug(due):''}`,
      legacyId:baseId,name,amount:Math.max(0,num(item?.amount??item?.plannedAmount??item?.cost)),due,frequency,
      fundingSource:mapped,legacyFundingSource:legacySource,
      category:String(item?.category||'Other'),
      included:trackOnly?false:item?.included!==false,
      paid,archived,actualPaid:actual,
      paidAt:item?.paidAt||item?.completedAt||item?.lastPaidDate||item?.updatedAt||null,
      createdAt:item?.createdAt||now(),updatedAt:now(),source:item
    };
  }
  function billSignature(b){
    const base=`${norm(b.name)}|${b.frequency}|${norm(b.fundingSource)}`;
    return b.frequency==='one-off'?`${base}|${b.due}`:base;
  }
  function collectBills(state,pots){
    const rows=[];
    const sections=['scheduledBills','futureCosts','recurringCosts','yearlyRecurringCosts'];
    sections.forEach(section=>arr(state?.[section]).forEach((item,index)=>rows.push(normaliseBill(item,section,index,pots,false))));
    arr(state?.archivedBills).forEach((item,index)=>rows.push(normaliseBill(item,'archivedBills',index,pots,true)));
    const seen=new Map();
    rows.forEach(b=>{
      const key=b.legacyId?`${b.legacyId}|${b.paid?'H':'A'}`:`${billSignature(b)}|${b.paid?'H':'A'}`;
      const existing=seen.get(key);
      if(!existing)seen.set(key,b);
      else if(existing.archived&&!b.archived)seen.set(key,b);
    });
    const unique=[...seen.values()];
    return {
      active:unique.filter(b=>!b.paid&&!b.archived),
      history:unique.filter(b=>b.paid||b.archived)
    };
  }

  function detectHouseKeys(){
    const found=[];
    try{
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i)||'';
        if(/house|renov|m27/i.test(key)&&!key.startsWith('aurora2:'))found.push(key);
      }
    }catch(_){ }
    return [...new Set(found)].slice(0,12);
  }
  function buildPreview(state){
    const pots=legacyPots(state).map(normalisePot);
    const bills=collectBills(state,pots);
    const warnings=[];
    if(num(state?.holdingBalance)>0)warnings.push(`Legacy Holding Pot balance detected: ${money(state.holdingBalance)}. It is selected for import by default.`);
    const remaps=[...bills.active,...bills.history].filter(b=>norm(b.legacyFundingSource)!=='current account'&&norm(b.legacyFundingSource)!=='holding pot'&&b.fundingSource==='Current Account'&&!/track only|already funded/.test(norm(b.legacyFundingSource)));
    if(remaps.length)warnings.push(`${remaps.length} bill${remaps.length===1?'':'s'} had a funding source that could not be matched to a migrated pot and will preview as Current Account. Review those rows before import.`);
    const cov=pots.filter(p=>/coventry|season ticket|tickets travel/.test(norm(p.name))&&p.goalMode!=='funded-progress');
    if(cov.length)warnings.push(`${cov.length} Coventry/ticket pot${cov.length===1?'':'s'} did not contain an explicit funded-progress field in Aurora 1. Import will preserve the source as a balance target; review Goal Type in Finance 2.0 afterwards if needed.`);
    if(pots.some(p=>/house/.test(norm(p.name))))warnings.push('House Fund cash/target can migrate now, but room-by-room house project logic is intentionally held for the separate House migration.');
    if(!savedAt(state))warnings.push('This Aurora 1 source has no reliable saved timestamp. Verify the preview values before importing.');
    return {pots,activeBills:bills.active,historyBills:bills.history,warnings,houseKeys:detectHouseKeys()};
  }

  function setSelected(candidate,labelOverride){
    selected=candidate;
    preview=buildPreview(candidate.state);
    $('selectedSource').textContent=labelOverride||candidate.label;
    $('selectedSourceKey').textContent=candidate.key||'PASTED JSON';
    $('selectedSaved').textContent=dateLabel(candidate.savedAt);
    $('sourceBadge').textContent='SOURCE READY'; $('sourceBadge').className='good';
    $('scanBadge').textContent='FOUND'; $('scanBadge').className='good';
    $('previewBadge').textContent='DRY RUN READY'; $('previewBadge').className='good';
    $('importBadge').textContent='READY'; $('importBadge').className='good';
    $('importBtn').disabled=false;
    renderPreview();
  }

  function scan(){
    const candidates=sourceCandidates(); renderSources(candidates);
    const best=selectBest(candidates);
    $('currentA2Summary').textContent=currentA2Summary();
    if(!best){
      selected=null; $('scanBadge').textContent='NOT FOUND'; $('scanBadge').className='red';
      $('sourceBadge').textContent='WAITING'; $('sourceBadge').className='muted';
      $('selectedSource').textContent='No Aurora 1 planner found in this browser'; $('selectedSourceKey').textContent='—'; $('selectedSaved').textContent='—';
      $('previewBadge').textContent='USE FALLBACK IF NEEDED'; $('previewBadge').className='muted'; $('importBtn').disabled=true;
      preview={pots:[],activeBills:[],historyBills:[],warnings:['No valid Aurora 1 planner was found. Open Aurora 1 Finance once in this same browser, then return and scan again; or paste an exported planner JSON below.'],houseKeys:detectHouseKeys()};
      renderPreview(); return;
    }
    setSelected(best);
  }

  function usePasted(){
    const raw=$('pasteSource').value.trim(); if(!raw){alert('Paste an Aurora 1 planner JSON first.');return;}
    const state=unwrap(safeParse(raw)); if(!isValidLegacy(state)){alert('That text does not look like a valid Aurora 1 Finance planner backup.');return;}
    const candidate={key:'pasted-backup',area:'memory',label:'Pasted Aurora 1 backup',priority:0,raw,state,valid:true,savedAt:savedAt(state)};
    setSelected(candidate,'Pasted Aurora 1 planner backup');
  }

  function checkbox(kind,key,checked){return `<input type="checkbox" data-select-kind="${kind}" data-select-key="${esc(key)}" ${checked?'checked':''}>`}
  function renderPreview(){
    $('kpiPots').textContent=preview.pots.length;
    $('kpiBills').textContent=preview.activeBills.length;
    $('kpiHistory').textContent=preview.historyBills.length;
    $('kpiHolding').textContent=money(selected?.state?.holdingBalance||0);

    $('potPreviewBody').innerHTML=preview.pots.length?preview.pots.map(p=>`<tr><td>${checkbox('pot',p.key,true)}</td><td><strong>${esc(p.name)}</strong><br><span class="muted">${esc(p.legacyId)}</span></td><td>${money(p.balance)}</td><td>${money(p.target)}</td><td>P${p.priority}</td><td>${p.goalMode==='funded-progress'?'Funded progress':'Balance target'}${p.sourceHasFunding?`<br><span class="muted">${money(p.fundingPerPayday)}/payday</span>`:''}</td></tr>`).join(''):'<tr><td colspan="6" class="muted">No legacy pots detected.</td></tr>';
    $('billPreviewBody').innerHTML=preview.activeBills.length?preview.activeBills.map(b=>`<tr><td>${checkbox('bill',b.key,true)}</td><td><strong>${esc(b.name)}</strong><br><span class="muted">${esc(b.category)}</span></td><td>${money(b.amount)}</td><td>${esc(b.due||'No date')}</td><td>${esc(b.frequency)}</td><td>${esc(b.fundingSource)}${b.included===false?'<br><span class="muted">Excluded</span>':''}</td></tr>`).join(''):'<tr><td colspan="6" class="muted">No active legacy bills detected.</td></tr>';
    $('historyPreviewBody').innerHTML=preview.historyBills.length?preview.historyBills.map(b=>`<tr><td>${checkbox('history',b.key,false)}</td><td><strong>${esc(b.name)}</strong><br><span class="muted">${esc(b.category)}</span></td><td>${money(b.actualPaid||b.amount)}</td><td>${esc(b.due||'—')}</td><td>${b.paid?'Paid':'Archived'}</td><td>${esc(b.fundingSource)}</td></tr>`).join(''):'<tr><td colspan="6" class="muted">No historical records detected.</td></tr>';

    const warnings=preview.warnings.length?preview.warnings:['Preview looks clean. No special migration warnings were detected.'];
    $('warningList').innerHTML=warnings.map((x,i)=>`<div class="warning-row ${preview.warnings.length?'':'good'}"><i class="warning-dot"></i><span>${esc(x)}</span></div>`).join('');
    $('houseKeys').textContent=preview.houseKeys.length?`House-related browser keys detected for the next pass: ${preview.houseKeys.join(' • ')}`:'No separate house-related storage key was identified by name. The next House migration will inspect the Finance state and ledger logic directly.';
    $('houseBadge').textContent=preview.houseKeys.length?'DATA DETECTED':'SEPARATE PASS';
    $('currentA2Summary').textContent=currentA2Summary();
  }

  function selectedKeys(kind){return new Set([...document.querySelectorAll(`[data-select-kind="${kind}"]:checked`)].map(x=>x.dataset.selectKey))}
  function getMode(){return document.querySelector('input[name="mode"]:checked')?.value==='replace'?'replace':'merge'}
  function mergePots(existing,incoming){
    const out=[...existing];
    incoming.forEach(p=>{
      const idx=out.findIndex(x=>norm(x.name)===norm(p.name)||x.id===p.id);
      if(idx<0){out.push(cleanPot(p));return;}
      const old=out[idx];
      out[idx]=cleanPot({...old,...p,id:old.id||p.id,fundingPerPayday:p.sourceHasFunding?p.fundingPerPayday:old.fundingPerPayday,createdAt:old.createdAt||p.createdAt,updatedAt:now()});
    });
    return out;
  }
  function cleanPot(p){return {id:p.id,name:p.name,balance:p.balance,target:p.target,fundingPerPayday:p.fundingPerPayday,priority:p.priority,goalMode:p.goalMode,spent:p.spent,archived:p.archived,createdAt:p.createdAt||now(),updatedAt:now()}}
  function cleanBill(b){return {id:b.id,name:b.name,amount:b.amount,due:b.due,frequency:b.frequency,fundingSource:b.fundingSource,category:b.category,included:b.included,paid:b.paid,archived:b.archived,actualPaid:b.actualPaid,createdAt:b.createdAt||now(),updatedAt:now()}}
  function mergeActiveBills(existing,incoming){
    const out=[...existing];
    incoming.forEach(b=>{
      const sig=billSignature(b);
      const idx=out.findIndex(x=>!x.archived&&!x.paid&&(x.id===b.id||billSignature(x)===sig));
      if(idx<0){out.push(cleanBill(b));return;}
      const old=out[idx]; out[idx]=cleanBill({...old,...b,id:old.id||b.id,createdAt:old.createdAt||b.createdAt,updatedAt:now()});
    });
    return out;
  }
  function mergeHistoryBills(existing,incoming){
    const out=[...existing];
    incoming.forEach(b=>{
      const idx=out.findIndex(x=>x.id===b.id);
      if(idx<0)out.push(cleanBill(b)); else out[idx]=cleanBill({...out[idx],...b,id:out[idx].id,createdAt:out[idx].createdAt||b.createdAt});
    });
    return out;
  }
  function historyPayments(bills){
    return bills.filter(b=>b.paid).map(b=>({
      id:`A1-PAY-${slug(b.id)}`,billId:b.id,billName:b.name,amount:Math.max(0,b.actualPaid||b.amount),fundingSource:b.fundingSource,
      paidAt:b.paidAt||now(),dueAtPayment:b.due||'',reversed:false,reversedAt:null,beforeBill:{},beforePot:null
    }));
  }
  function mergePayments(existing,incoming){
    const out=[...existing]; incoming.forEach(p=>{const idx=out.findIndex(x=>x.id===p.id);if(idx<0)out.push(p);else out[idx]={...out[idx],...p}}); return out;
  }

  function makeHoldingPot(state){
    const balance=Math.max(0,num(state?.holdingBalance)); if(balance<=0)return null;
    return {id:'A1-POT-HOLDING',name:'Holding Pot',balance,target:Math.max(balance,Math.max(0,num(state?.minimumBuffer))),fundingPerPayday:0,priority:1,goalMode:'balance',spent:0,archived:false,createdAt:now(),updatedAt:now(),sourceHasFunding:false};
  }

  function backupCurrent(){
    const key=`${BACKUP_PREFIX}${Date.now()}`;
    const raw=safeGet('local',A().core.KEY)||JSON.stringify(A().core.read());
    if(!safeSet('local',key,raw)||!safeSet('local',BACKUP_LATEST,raw))throw new Error('Could not create Aurora 2 rollback backup. Import stopped before any changes were made.');
    return key;
  }

  function importSelected(){
    if(!selected){alert('Scan and select an Aurora 1 source first.');return;}
    const potKeys=selectedKeys('pot'),billKeys=selectedKeys('bill'),histKeys=selectedKeys('history');
    let pots=preview.pots.filter(p=>potKeys.has(p.key));
    const active=preview.activeBills.filter(b=>billKeys.has(b.key));
    const history=preview.historyBills.filter(b=>histKeys.has(b.key));
    if($('includeHolding').checked){const h=makeHoldingPot(selected.state);if(h&&!pots.some(p=>norm(p.name)==='holding pot'))pots=[...pots,h];}
    if(!pots.length&&!active.length&&!history.length){alert('Select at least one pot, bill or history record to import.');return;}

    const mode=getMode();
    if(mode==='replace'&&!confirm('Replace Finance 2.0 pots, bills and payment history with the selected Aurora 1 records? Your current full Aurora 2 state will be backed up first.'))return;

    let backupKey;
    try{backupKey=backupCurrent()}catch(err){alert(err.message);return;}
    const receipt={id:A().core.uid('MIGRATION'),migratedAt:now(),mode,sourceKey:selected.key||'pasted-backup',sourceSavedAt:selected.savedAt||0,backupKey,selected:{pots:pots.length,activeBills:active.length,history:history.length}};

    A().core.update(s=>{
      const f=s.finance||{};
      let nextPots,nextBills,nextPayments;
      if(mode==='replace'){
        nextPots=pots.map(cleanPot);
        nextBills=[...active,...history].map(cleanBill);
        nextPayments=historyPayments(history);
      }else{
        nextPots=mergePots(arr(f.pots),pots);
        nextBills=mergeActiveBills(arr(f.bills),active);
        nextBills=mergeHistoryBills(nextBills,history);
        nextPayments=mergePayments(arr(f.payments),historyPayments(history));
      }
      return {
        ...s,
        finance:{...f,pots:nextPots,bills:nextBills,payments:nextPayments,migration:receipt},
        alerts:[{id:A().core.uid('ALERT'),title:'Finance migration completed',note:`${pots.length} pots • ${active.length} active bills${history.length?` • ${history.length} history`:''} imported from Aurora 1.`,when:'now'},...(s.alerts||[]).filter(a=>a?.title!=='Finance migration completed')].slice(0,8)
      };
    });

    const verified=A().core.read(), vf=verified.finance||{};
    receipt.verified={pots:arr(vf.pots).length,bills:arr(vf.bills).length,payments:arr(vf.payments).length,potCash:arr(vf.pots).filter(p=>!p.archived).reduce((sum,p)=>sum+num(p.balance),0),activeBillValue:arr(vf.bills).filter(b=>!b.archived&&!b.paid&&b.included!==false).reduce((sum,b)=>sum+num(b.amount),0)};
    safeSet('local',RECEIPT_KEY,JSON.stringify(receipt));
    $('restoreBtn').disabled=false;
    renderReceipt(receipt);
    $('importBadge').textContent='COMPLETE'; $('importBadge').className='good';
    $('currentA2Summary').textContent=currentA2Summary();
  }

  function renderReceipt(r){
    const v=r.verified||{}; $('receiptPanel').style.display='block';
    $('receiptList').innerHTML=[
      ['Migration',`${r.mode.toUpperCase()} • ${r.id}`],
      ['Imported',`${r.selected.pots} pots • ${r.selected.activeBills} active bills • ${r.selected.history} history records`],
      ['Aurora 2 verified',`${v.pots} total pots • ${v.bills} total bills • ${v.payments} payment records`],
      ['Active pot cash',money(v.potCash)],
      ['Open included bills',money(v.activeBillValue)],
      ['Rollback backup',r.backupKey]
    ].map(([k,vv])=>`<div class="receipt-row"><div><strong>${esc(k)}</strong><span>${esc(vv)}</span></div></div>`).join('');
    $('receiptPanel').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function restoreBackup(){
    const raw=safeGet('local',BACKUP_LATEST); if(!raw){alert('No pre-migration Aurora 2 backup was found.');return;}
    const state=safeParse(raw); if(!state){alert('The rollback backup could not be read.');return;}
    if(!confirm('Restore Aurora 2 to the exact state it had immediately before the last migration? Aurora 1 is not affected.'))return;
    A().core.write(state);
    $('importBadge').textContent='ROLLED BACK'; $('importBadge').className='muted';
    $('receiptPanel').style.display='none'; $('currentA2Summary').textContent=currentA2Summary();
    alert('Aurora 2 was restored to the pre-migration backup.');
  }

  function toggleKind(kind){
    const boxes=[...document.querySelectorAll(`[data-select-kind="${kind}"]`)]; if(!boxes.length)return;
    const makeChecked=boxes.some(b=>!b.checked); boxes.forEach(b=>b.checked=makeChecked);
  }

  function wire(){
    $('scanBtn').addEventListener('click',scan);
    $('usePasteBtn').addEventListener('click',usePasted);
    $('importBtn').addEventListener('click',importSelected);
    $('restoreBtn').addEventListener('click',restoreBackup);
    $('togglePotsBtn').addEventListener('click',()=>toggleKind('pot'));
    $('toggleBillsBtn').addEventListener('click',()=>toggleKind('bill'));
    $('toggleHistoryBtn').addEventListener('click',()=>toggleKind('history'));
    $('currentA2Summary').textContent=currentA2Summary();
    $('restoreBtn').disabled=!safeGet('local',BACKUP_LATEST);
    scan();
  }

  document.addEventListener('DOMContentLoaded',wire);
})(window);
