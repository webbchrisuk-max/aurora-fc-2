(function(w){
  'use strict';
  const A=()=>w.Aurora2;
  const D=()=>w.AuroraData2Client;
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const num=v=>{const n=Number(String(v??'').replace(/[£,%]/g,'').replace(/,/g,''));return Number.isFinite(n)?n:0};
  const money=v=>A().ui.money(Number(v)||0);
  const esc=v=>A().ui.escape(v);
  const now=()=>new Date().toISOString();
  let publishing=false,backendBusy=false,freezingEligibility=false,engineBusy=false;

  function toast(msg){const el=$('toast');if(!el)return;el.textContent=msg;el.style.opacity='1';clearTimeout(w.__a2IncomeToast);w.__a2IncomeToast=setTimeout(()=>el.style.opacity='0',2300)}
  function set(id,v){const el=$(id);if(el)el.textContent=v}
  function setValue(id,v){const el=$(id);if(el)el.value=v??''}
  function accountCode(v){const s=String(v||'').toLowerCase();if(s.includes('212'))return 'T212';if(/\big\b/.test(s)||s.includes('ig isa'))return 'IG';const u=String(v||'').toUpperCase();return u==='IG'||u==='T212'?u:'CHECK'}
  function accountLabel(v){const a=accountCode(v);return a==='IG'?'IG ISA':a==='T212'?'Trading 212 ISA':'Account review'}
  function ticker(v){return String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim()}
  function parseDate(v){if(!v)return null;const d=new Date(`${String(v).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?null:d}
  function dateISO(d){if(!(d instanceof Date)||Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function addMonthsClamped(d,m){const x=new Date(d.getTime()),day=x.getDate();x.setDate(1);x.setMonth(x.getMonth()+m);const last=new Date(x.getFullYear(),x.getMonth()+1,0).getDate();x.setDate(Math.min(day,last));return x}
  function activeHoldings(state=A().core.read()){return arr(state.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h.status||'').toUpperCase())&&num(h.shares)>0)}
  function incomeExempt(h){
    if(!h)return false;
    if(h.incomeExempt===true||h.dividendEligible===false)return true;
    const tk=ticker(h.ticker),acct=accountCode(h.account);
    const reason=String(`${h.lockReason||''} ${h.role||''} ${h.source||''}`).toLowerCase();
    // Tesco SAYE / 2029 legacy holding is an asset position, not a dividend-income position.
    // Scope this to the legacy/account-review position so a future normal TSCO holding
    // inside IG or Trading 212 can still participate in Income.
    return tk==='TSCO'&&(acct==='CHECK'||/saye|save as you earn|2029|legacy/.test(reason));
  }
  function dividendEligibleHoldings(state=A().core.read()){return activeHoldings(state).filter(h=>!incomeExempt(h))}
  function holdingIncome(h){if(incomeExempt(h))return 0;const shares=num(h.shares),dps=num(h.annualDpsGbp);return shares>0&&dps>0?shares*dps:Math.max(0,num(h.annualIncomeGbp))}
  function holdingValue(h){const shares=num(h.shares),price=num(h.livePriceGbp);return shares>0&&price>0?shares*price:Math.max(0,num(h.marketValueGbp))}
  function holdingBook(h){return Math.max(0,num(h.bookCostGbp))}

  function metrics(state=A().core.read()){
    const holdings=activeHoldings(state),eligibleHoldings=holdings.filter(h=>!incomeExempt(h)),exemptHoldings=holdings.filter(incomeExempt),byAccount=new Map(),byTicker=new Map();
    let annual=0,value=0,book=0;
    holdings.forEach(h=>{
      const income=holdingIncome(h),mv=holdingValue(h),bc=holdingBook(h),acct=accountCode(h.account),tk=ticker(h.ticker);
      annual+=income;value+=mv;book+=bc;
      if(incomeExempt(h))return;
      const a=byAccount.get(acct)||{account:acct,annual:0,value:0,book:0,positions:0};a.annual+=income;a.value+=mv;a.book+=bc;a.positions+=1;byAccount.set(acct,a);
      const t=byTicker.get(tk)||{ticker:tk,name:h.name||tk,annual:0,value:0,book:0,shares:0,accounts:new Set(),positions:0};t.annual+=income;t.value+=mv;t.book+=bc;t.shares+=num(h.shares);t.accounts.add(acct);t.positions+=1;byTicker.set(tk,t);
    });
    const players=[...byTicker.values()].map(x=>({...x,accounts:[...x.accounts]})).sort((a,b)=>b.annual-a.annual||a.ticker.localeCompare(b.ticker));
    const monthly=annual/12;
    return {holdings,eligibleHoldings,exemptHoldings,annual,monthly,value,book,yoc:book>0?annual/book*100:0,yieldPct:value>0?annual/value*100:0,byAccount:[...byAccount.values()],players,best:players[0]||null};
  }

  function holdingForEvent(state,e){const ac=accountCode(e.account),tk=ticker(e.ticker);return dividendEligibleHoldings(state).find(h=>accountCode(h.account)===ac&&ticker(h.ticker)===tk)||null}
  function eventAmount(state,e){
    if(String(e.status||'').toUpperCase()==='PAID'&&num(e.actualAmountGbp)>0)return num(e.actualAmountGbp);
    const dps=num(e.dividendPerShareGbp),eligible=num(e.sharesEligible);
    if(dps>0&&eligible>0)return eligible*dps;
    const h=holdingForEvent(state,e);
    if(h&&dps>0)return num(h.shares)*dps;
    return Math.max(0,num(e.expectedAmountGbp));
  }
  function eventIncomeExempt(state,e){const ac=accountCode(e.account),tk=ticker(e.ticker);const h=activeHoldings(state).find(x=>accountCode(x.account)===ac&&ticker(x.ticker)===tk);return h?incomeExempt(h):(tk==='TSCO'&&ac==='CHECK')}
  function activeCalendar(state=A().core.read()){return arr(state.income?.calendar).filter(e=>!['CANCELLED','ARCHIVED'].includes(String(e.status||'').toUpperCase())&&!eventIncomeExempt(state,e))}
  function upcoming(state=A().core.read()){
    const today=new Date();today.setHours(0,0,0,0);
    return activeCalendar(state).map(e=>({...e,computedAmount:eventAmount(state,e),date:parseDate(e.payDate)}))
      .filter(e=>e.date&&e.date.getTime()>=today.getTime()&&String(e.status).toUpperCase()!=='PAID')
      .sort((a,b)=>a.date-b.date||ticker(a.ticker).localeCompare(ticker(b.ticker)));
  }
  function nextDividend(state=A().core.read()){const e=upcoming(state)[0];return e?{ticker:ticker(e.ticker),name:e.name,account:accountLabel(e.account),amount:Number(e.computedAmount.toFixed(2)),date:e.payDate,exDate:e.exDate,status:e.status}:null}

  function monthForecast(state=A().core.read()){
    const months=Math.max(3,Math.min(24,num(state.income?.settings?.horizonMonths)||12)),start=new Date();start.setDate(1);start.setHours(12,0,0,0);
    const out=[];for(let i=0;i<months;i++){const d=addMonthsClamped(start,i);out.push({key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,date:d,total:0,count:0})}
    const map=new Map(out.map(x=>[x.key,x]));
    activeCalendar(state).forEach(e=>{if(String(e.status).toUpperCase()==='PAID')return;const d=parseDate(e.payDate);if(!d)return;const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,m=map.get(key);if(!m)return;m.total+=eventAmount(state,e);m.count+=1});
    return out;
  }

  function registeredUplift(state=A().core.read()){
    const seen=new Set();let total=0,count=0;
    arr(state.transfer?.registrationDrafts).filter(d=>d.status==='CONFIRMED').forEach(d=>{const key=d.transactionId||d.id;if(seen.has(key))return;seen.add(key);total+=Math.max(0,num(d.expectedAnnualIncomeGbp));count++});
    return {total,count};
  }
  function activeTransferIncome(state=A().core.read()){
    const route=state.transfer?.route;
    const terminal=new Set(['REGISTERED','COMPLETE','COMPLETED','ARCHIVED']);
    return route&&!terminal.has(String(route.status||'').toUpperCase())&&!terminal.has(String(state.mission?.status||'').toUpperCase())
      ?Math.max(0,num(route.expectedAnnualIncome))
      :0;
  }

  function publishDerived(){
    if(publishing||!A()?.core)return;
    const state=A().core.read(),m=metrics(state),nd=nextDividend(state),oldAnnual=num(state.portfolio?.annualIncome),last=arr(state.income?.history)[0];
    const annual=Number(m.annual.toFixed(2)),monthly=Number(m.monthly.toFixed(2));
    const best=m.best?{ticker:m.best.ticker,name:m.best.name,annualIncome:Number(m.best.annual.toFixed(2))}:null;
    const changed=Math.abs(oldAnnual-annual)>.005||Math.abs(num(state.portfolio?.monthlyIncome)-monthly)>.005||JSON.stringify(state.income?.nextDividend||null)!==JSON.stringify(nd)||JSON.stringify(state.portfolio?.bestDividendPlayer||null)!==JSON.stringify(best);
    const needHistory=!last||Math.abs(num(last.annualIncome)-annual)>.01;
    if(!changed&&!needHistory)return;
    publishing=true;
    try{
      A().core.update(s=>({
        ...s,
        portfolio:{...s.portfolio,annualIncome:annual,monthlyIncome:monthly,bestDividendPlayer:best},
        income:{...s.income,source:'SQUAD_CANONICAL',nextDividend:nd,lastCalculatedAt:now(),updatedAt:now(),history:needHistory?[{id:A().core.uid('INCOME'),annualIncome:annual,monthlyIncome:monthly,at:now(),reason:last?'Forward income changed':'Income Centre baseline'},...arr(s.income?.history)].slice(0,60):s.income?.history},
        alerts:needHistory&&last?[{id:A().core.uid('ALERT'),title:'Dividend income changed',note:`Forward annual income is now ${money(annual)} (${money(monthly)} / month).`,when:'now'},...arr(s.alerts).filter(a=>a?.title!=='Dividend income changed')].slice(0,8):s.alerts
      }));
    }finally{publishing=false}
  }

  function populateHoldingSelect(state=A().core.read(),selected){const el=$('eventHolding');if(!el)return;const hs=dividendEligibleHoldings(state).sort((a,b)=>ticker(a.ticker).localeCompare(ticker(b.ticker))||accountCode(a.account).localeCompare(accountCode(b.account)));el.innerHTML=hs.length?hs.map(h=>{const v=`${accountCode(h.account)}|${ticker(h.ticker)}`;return `<option value="${esc(v)}">${esc(ticker(h.ticker))} • ${esc(accountLabel(h.account))} • ${num(h.shares).toLocaleString('en-GB',{maximumFractionDigits:6})} shares</option>`}).join(''):'<option value="">No dividend-eligible Squad holdings</option>';if(selected&&hs.some(h=>`${accountCode(h.account)}|${ticker(h.ticker)}`===selected))el.value=selected}
  function selectedHolding(state=A().core.read()){const [ac,tk]=String($('eventHolding')?.value||'').split('|');return dividendEligibleHoldings(state).find(h=>accountCode(h.account)===ac&&ticker(h.ticker)===tk)||null}
  function eventPreview(){
    const h=selectedHolding(),dps=Math.max(0,num($('eventDps')?.value)),lockedShares=Math.max(0,num($('eventEligible')?.value)),ex=parseDate($('eventExDate')?.value),today=new Date();today.setHours(12,0,0,0);
    const pastOrToday=ex&&ex.getTime()<=today.getTime(),calcShares=lockedShares>0?lockedShares:(pastOrToday?0:num(h?.shares));
    const auto=h&&dps>0&&calcShares>0?calcShares*dps:Math.max(0,num($('eventExpected')?.value));
    if(h&&dps>0&&calcShares>0)setValue('eventExpected',auto.toFixed(2));
    const eligibility=lockedShares>0?`${lockedShares.toLocaleString('en-GB',{maximumFractionDigits:6})} eligible shares locked`:pastOrToday?'eligible shares required — ex-date has arrived':`live forecast from ${num(h?.shares).toLocaleString('en-GB',{maximumFractionDigits:6})} current shares`;
    set('eventPreview',h?`${ticker(h.ticker)} • ${accountLabel(h.account)} • ${eligibility} • expected ${money(auto)}`:'Choose a dividend-eligible Squad holding.');
    return {h,amount:auto,sharesEligible:lockedShares,pastOrToday}
  }
  function clearEvent(){setValue('eventId','');['eventExDate','eventPayDate','eventEligible','eventDps','eventExpected','eventActual','eventNotes'].forEach(id=>setValue(id,''));setValue('eventStatus','FORECAST');populateHoldingSelect();set('editorMode','NEW EVENT');eventPreview()}
  function editEvent(id){const s=A().core.read(),e=arr(s.income?.calendar).find(x=>x.id===id);if(!e)return;setValue('eventId',e.id);populateHoldingSelect(s,`${accountCode(e.account)}|${ticker(e.ticker)}`);setValue('eventHolding',`${accountCode(e.account)}|${ticker(e.ticker)}`);setValue('eventExDate',e.exDate);setValue('eventPayDate',e.payDate);setValue('eventEligible',e.sharesEligible||'');setValue('eventDps',e.dividendPerShareGbp||'');setValue('eventExpected',e.expectedAmountGbp||'');setValue('eventActual',e.actualAmountGbp||'');setValue('eventStatus',e.status||'FORECAST');setValue('eventNotes',e.notes||'');set('editorMode',`EDIT ${ticker(e.ticker)}`);eventPreview();document.querySelector('article:has(#eventHolding)')?.scrollIntoView({behavior:'smooth',block:'start'})}

  async function backendUpsert(event){const cfg=D()?.config?.();if(!cfg?.endpoint||!cfg?.token)return {synced:false};try{const res=await D().post('upsertDividend',{dividend:event});return {synced:true,result:res}}catch(err){return {synced:false,error:String(err.message||err)}}}
  async function saveEvent(){const state=A().core.read(),p=eventPreview(),h=p.h;if(!h){toast('Choose a Squad holding.');return}const payDate=$('eventPayDate')?.value;if(!payDate){toast('Enter the payment date.');return}const id=$('eventId')?.value||A().core.uid('DIV');const old=arr(state.income?.calendar).find(e=>e.id===id);const exDate=$('eventExDate')?.value||'',ex=parseDate(exDate),today=new Date();today.setHours(12,0,0,0);let sharesEligible=Math.max(0,num($('eventEligible')?.value));if(sharesEligible<=0&&ex&&ex.getTime()<=today.getTime()){toast('Enter the shares that were eligible before saving a past/current ex-date.');return}const dps=Math.max(0,num($('eventDps')?.value)),calcAmount=dps>0?(sharesEligible>0?sharesEligible:num(h.shares))*dps:Math.max(0,p.amount);const event={...old,id,ticker:ticker(h.ticker),name:h.name||ticker(h.ticker),account:accountCode(h.account),exDate,payDate,sharesEligible,dividendPerShareGbp:dps,expectedAmountGbp:Math.max(0,calcAmount),actualAmountGbp:Math.max(0,num($('eventActual')?.value)),status:String($('eventStatus')?.value||'FORECAST').toUpperCase(),notes:String($('eventNotes')?.value||''),source:old?.source||'AURORA2_INCOME',createdAt:old?.createdAt||now(),updatedAt:now()};A().core.update(s=>({...s,income:{...s.income,calendar:[event,...arr(s.income?.calendar).filter(e=>e.id!==id)],updatedAt:now()}}));const sync=await backendUpsert(event);if(sync.synced){A().core.update(s=>({...s,income:{...s.income,backend:{...s.income.backend,status:'CONNECTED',lastSyncAt:now(),lastError:null}}}));toast('Dividend saved and synced to AuroraData 2.')}else if(sync.error){A().core.update(s=>({...s,income:{...s.income,backend:{...s.income.backend,status:'LOCAL',lastError:sync.error}}}));toast('Dividend saved locally; backend calendar upgrade is not active yet.')}else toast('Dividend saved.');clearEvent();publishDerived()}
  function removeEvent(id){const s=A().core.read(),e=arr(s.income?.calendar).find(x=>x.id===id);if(!e)return;if(!confirm(`Archive ${ticker(e.ticker)} dividend event?`))return;A().core.update(x=>({...x,income:{...x.income,calendar:arr(x.income?.calendar).map(v=>v.id===id?{...v,status:'ARCHIVED',updatedAt:now()}:v),updatedAt:now()}}));toast('Dividend event archived.');publishDerived()}

  async function syncBackend(){if(backendBusy)return;backendBusy=true;const btn=$('syncIncomeBackend');if(btn)btn.disabled=true;try{const cfg=D()?.config?.();if(!cfg?.endpoint||!cfg?.token)throw new Error('AuroraData 2 connection is not configured in this browser.');const res=await D().post('incomeSnapshot',{});const incoming=arr(res.dividends).map(x=>({id:String(x.id||x.dividendId||A().core.uid('DIV')),ticker:ticker(x.ticker),name:x.name||x.ticker,account:accountCode(x.account),exDate:x.exDate||'',payDate:x.payDate||'',sharesEligible:num(x.sharesEligible),dividendPerShareGbp:num(x.dividendPerShareGbp),expectedAmountGbp:num(x.expectedAmountGbp),actualAmountGbp:num(x.actualAmountGbp),status:String(x.status||'FORECAST').toUpperCase(),notes:x.notes||'',source:x.source||'AURORADATA2',backendId:x.id||'',createdAt:x.createdAt||now(),updatedAt:x.updatedAt||now()}));A().core.update(s=>{const local=arr(s.income?.calendar),map=new Map(local.map(e=>[e.id,e]));incoming.forEach(e=>map.set(e.id,e));return {...s,income:{...s.income,calendar:[...map.values()],backend:{...s.income.backend,status:'CONNECTED',lastSyncAt:now(),lastError:null},updatedAt:now()}}});toast(`Dividend calendar synced • ${incoming.length} backend event${incoming.length===1?'':'s'}.`);await freezeDueEligibility();publishDerived()}catch(err){const msg=String(err.message||err);A().core.update(s=>({...s,income:{...s.income,backend:{...s.income.backend,status:'LOCAL',lastError:msg}}}));toast('Income works locally; backend dividend sync needs the v0.2 script upgrade.')}finally{backendBusy=false;if(btn)btn.disabled=false}}

  async function freezeDueEligibility(){
    if(freezingEligibility||!A()?.core)return;
    const state=A().core.read(),today=new Date();today.setHours(12,0,0,0);const changed=[];
    const next=arr(state.income?.calendar).map(e=>{
      const status=String(e.status||'').toUpperCase(),ex=parseDate(e.exDate),dps=num(e.dividendPerShareGbp);
      const tomorrow=new Date(today.getTime());tomorrow.setDate(tomorrow.getDate()+1);
      if(['PAID','CANCELLED','ARCHIVED'].includes(status)||!ex||dateISO(ex)!==dateISO(tomorrow)||num(e.sharesEligible)>0||dps<=0)return e;
      const h=holdingForEvent(state,e);if(!h)return e;
      const shares=num(h.shares),updated={...e,sharesEligible:shares,expectedAmountGbp:Number((shares*dps).toFixed(2)),updatedAt:now(),notes:String(e.notes||'')+(String(e.notes||'').includes('Eligibility pre-locked')?'':`${e.notes?' • ':''}Eligibility pre-locked the day before ex-date`)};
      changed.push(updated);return updated;
    });
    if(!changed.length)return;
    freezingEligibility=true;
    try{
      A().core.update(s=>({...s,income:{...s.income,calendar:next,updatedAt:now()}}));
      for(const e of changed){try{await backendUpsert(e)}catch(_){}}
      toast(`${changed.length} dividend eligibilit${changed.length===1?'y':'ies'} locked to ex-date shares.`);
    }finally{freezingEligibility=false}
  }

  function engineTime(v){if(!v)return 'Never';const d=new Date(v);return Number.isNaN(d.getTime())?'Never':d.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
  function renderDividendEngineStatus(res){
    const ok=res&&res.ok!==false,installed=Boolean(res?.installed),coverage=res?.coverage||{},last=res?.lastSummary||{};
    const alpha=res?.alphaVantage||{};
    set('engineBadge',!ok?'ENGINE ERROR':installed?'AUTO ON':'AUTO OFF');
    set('engineAuto',installed?'Nightly':'Off');
    set('engineAlpha',alpha.configured?'CONNECTED':'NOT SET');
    set('engineCoverage',`${coverage.covered||0}/${coverage.eligibleTickers||0}`);
    set('engineLastRun',engineTime(res?.lastRunAt));
    set('engineUpdated',num(last.autoUpdated||last.updated||0));
    set('engineReviews',num(res?.openReviewCount));
    const failures=num(last.errors),sources=num(last.sourcesChecked),alphaCalls=num(last.alphaCalls),alphaCached=num(last.alphaCached),alphaMatched=num(last.alphaMatchedOfficial),review=num(res?.openReviewCount);
    set('engineNote',!ok?String(res?.message||'Dividend engine status unavailable.'):installed?`Nightly scan enabled • Alpha ${alpha.configured?'connected':'not configured'} • ${alphaCalls} API call${alphaCalls===1?'':'s'} + ${alphaCached} cached • ${alphaMatched} official match${alphaMatched===1?'':'es'} • ${sources||coverage.covered||0} official source${(sources||coverage.covered||0)===1?'':'s'} checked • ${failures} error${failures===1?'':'s'} • ambiguous findings are never auto-written.`:`Auto update is off. Run it manually or enable the nightly trigger. Ambiguous findings are never auto-written.`);
    const host=$('engineReviewList'),rows=arr(res?.openReviews).slice(0,4);
    if(host)host.innerHTML=rows.length?rows.map(x=>`<div class="engine-review"><strong>${esc(x.ticker||'Review')} • ${esc(x.reason||'Needs review')}</strong><span>${esc(x.summary||x.sourceUrl||'Open DividendReview item in AuroraData 2.')}</span></div>`).join(''):'';
  }
  async function loadDividendEngineStatus(){
    try{
      const cfg=D()?.config?.();if(!cfg?.endpoint||!cfg?.token){renderDividendEngineStatus({ok:false,message:'AuroraData 2 connection is not configured in this browser.'});return}
      renderDividendEngineStatus(await D().post('dividendEngineStatus',{}));
    }catch(err){renderDividendEngineStatus({ok:false,message:String(err.message||err)})}
  }
  async function runDividendEngineNow(){
    if(engineBusy)return;engineBusy=true;const btn=$('runDividendEngine');if(btn)btn.disabled=true;
    try{
      toast('Checking official dividend sources…');
      const res=await D().post('runDividendUpdate',{});
      renderDividendEngineStatus(res.status||res);
      await syncBackend();
      await loadDividendEngineStatus();
      toast(`Dividend update complete • ${num(res.autoUpdated)} updated • ${num(res.reviewAdded)} review.`);
    }catch(err){toast(`Dividend update failed: ${String(err.message||err)}`)}
    finally{engineBusy=false;if(btn)btn.disabled=false}
  }
  async function enableDividendEngine(){
    try{const res=await D().post('installDividendUpdateTrigger',{});renderDividendEngineStatus(res.status||res);toast('Nightly Dividend Update Engine enabled.');await loadDividendEngineStatus()}catch(err){toast(String(err.message||err))}
  }
  async function disableDividendEngine(){
    try{const res=await D().post('removeDividendUpdateTrigger',{});renderDividendEngineStatus(res.status||res);toast('Nightly Dividend Update Engine disabled.');await loadDividendEngineStatus()}catch(err){toast(String(err.message||err))}
  }

  function saveSettings(){const target=Math.max(0,num($('monthlyTarget')?.value)),horizon=Math.max(3,Math.min(24,num($('horizonMonths')?.value)||12));A().core.update(s=>({...s,income:{...s.income,settings:{...s.income.settings,monthlyTarget:target,horizonMonths:horizon},updatedAt:now()}}));toast('Income settings saved.')}

  function renderAccounts(m){const host=$('accountGrid');if(!host)return;const order=['IG','T212','CHECK'];const map=new Map(m.byAccount.map(x=>[x.account,x]));host.innerHTML=order.filter(k=>map.has(k)).map(k=>{const x=map.get(k);return `<div class="account-card"><small>${esc(accountLabel(k))}</small><strong>${money(x.annual)}</strong><span>${money(x.annual/12)} / month • ${x.positions} position${x.positions===1?'':'s'} • ${x.book>0?(x.annual/x.book*100).toFixed(2):'0.00'}% yield on cost</span></div>`}).join('')||'<div class="notice">No active account-scoped holdings.</div>'}
  function renderPlayers(m){const host=$('playerList');set('playerCount',`${m.players.length} dividend player${m.players.length===1?'':'s'}`);if(!host)return;if(!m.players.length){host.innerHTML='<div class="empty-state compact"><strong>No income-producing holdings</strong><p>Squad needs active holdings with annual DPS or annual income evidence.</p></div>';return}host.innerHTML=m.players.map((p,i)=>`<article class="player-row ${i===0?'top':''}"><div class="row-copy"><strong>#${i+1} • ${esc(p.ticker)} — ${esc(p.name)}</strong><span>${p.accounts.map(accountLabel).join(' + ')} • ${p.shares.toLocaleString('en-GB',{maximumFractionDigits:6})} shares • ${p.book>0?(p.annual/p.book*100).toFixed(2):'0.00'}% yield on cost</span></div><div class="row-side"><strong>${money(p.annual)}</strong><span>${money(p.annual/12)} / month</span></div></article>`).join('')}
  function renderMonths(state){const rows=monthForecast(state),host=$('monthGrid'),max=Math.max(1,...rows.map(x=>x.total));if(!host)return;host.innerHTML=rows.map(x=>`<div class="month-card"><small>${x.date.toLocaleDateString('en-GB',{month:'short',year:'2-digit'})}</small><strong>${money(x.total)}</strong><span>${x.count} event${x.count===1?'':'s'}</span><div class="month-bar"><i style="width:${Math.min(100,x.total/max*100).toFixed(1)}%"></i></div></div>`).join('');set('calendarCoverage',`${activeCalendar(state).length} recorded event${activeCalendar(state).length===1?'':'s'}`)}
  function renderCalendar(state){const rows=upcoming(state).slice(0,20),host=$('calendarList');if(!host)return;if(!rows.length){host.innerHTML='<div class="empty-state compact"><strong>No upcoming dividend dates recorded</strong><p>Add a dividend event or sync AuroraData 2. Income will not guess payment dates.</p></div>';return}host.innerHTML=rows.map(e=>`<article class="calendar-row"><div class="row-copy"><strong>${esc(ticker(e.ticker))} • ${esc(accountLabel(e.account))} • ${money(e.computedAmount)}</strong><span>Pay ${esc(e.payDate)}${e.exDate?' • ex '+esc(e.exDate):''} • ${num(e.dividendPerShareGbp)>0?money(e.dividendPerShareGbp)+' / share • ':''}${num(e.sharesEligible)>0?num(e.sharesEligible).toLocaleString('en-GB',{maximumFractionDigits:6})+' eligible shares • ':''}${esc(e.status)}</span></div><div class="row-side"><span class="status-pill ${e.status==='CONFIRMED'?'pass':'caution'}">${esc(e.status)}</span><div class="action-row" style="justify-content:flex-end;margin-top:6px"><button class="btn secondary" data-edit-event="${esc(e.id)}">Edit</button><button class="btn secondary" data-remove-event="${esc(e.id)}">Archive</button></div></div></article>`).join('')}
  function renderHistory(state){const rows=arr(state.income?.history),host=$('historyList');if(!host)return;if(!rows.length){host.innerHTML='<div class="empty-state compact"><strong>No snapshots yet</strong><p>Income will create a baseline automatically.</p></div>';return}host.innerHTML=rows.slice(0,20).map((x,i)=>{const older=rows[i+1],diff=older?num(x.annualIncome)-num(older.annualIncome):0;return `<div class="history-row2"><div class="row-copy"><strong>${money(x.annualIncome)} / year • ${money(x.monthlyIncome)} / month</strong><span>${new Date(x.at).toLocaleString('en-GB')} • ${esc(x.reason||'Income change')}</span></div><div class="row-side"><strong class="${diff>0?'good':diff<0?'red':''}">${older?(diff>=0?'+ ':'− ')+money(Math.abs(diff)):'BASELINE'}</strong><span>${older?'annual change':''}</span></div></div>`}).join('')}
  function renderHealth(state,m){const missing=m.eligibleHoldings.filter(h=>num(h.annualDpsGbp)<=0&&num(h.annualIncomeGbp)<=0).length,events=activeCalendar(state).length,b=state.income?.backend||{},exempt=m.exemptHoldings.length;set('healthHoldings',m.holdings.length);set('healthExempt',exempt);set('healthDps',missing);set('healthCalendar',events);set('healthBackend',b.status||'LOCAL');set('healthNote',missing?`${missing} dividend-eligible holding${missing===1?' has':'s have'} no annual DPS/income evidence, so the forward total may be incomplete.`:exempt?`Every dividend-eligible holding has income evidence. ${exempt} income-exempt holding${exempt===1?' is':'s are'} intentionally excluded from dividend income and the calendar (Tesco SAYE / legacy plan).`:'Every dividend-eligible holding has income evidence. Dividend payment dates remain separate calendar data.')}
  function render(){if(!A()?.core)return;const state=A().core.read(),m=metrics(state),up=registeredUplift(state),nd=nextDividend(state);set('heroAnnual',money(m.annual));set('heroMonthly',`${money(m.monthly)} / month`);set('heroMeta',`${m.holdings.length} active account-scoped position${m.holdings.length===1?'':'s'}${m.exemptHoldings.length?` • ${m.exemptHoldings.length} income-exempt`:''} • ${money(m.annual/52)} / week equivalent`);set('kAnnual',money(m.annual));set('kMonthly',money(m.monthly));set('kYoc',`${m.yoc.toFixed(2)}%`);set('kYield',`${m.yieldPct.toFixed(2)}%`);set('kBest',m.best?.ticker||'—');set('kBestMeta',m.best?`${money(m.best.annual)} / year`:'—');set('kNext',nd?.ticker||'—');set('kNextMeta',nd?`${money(nd.amount)} • ${nd.date}`:'Calendar needed');set('registeredUplift',money(up.total));set('routeUplift',money(activeTransferIncome(state)));const target=num(state.income?.settings?.monthlyTarget);set('targetProgress',target>0?`${Math.min(999,m.monthly/target*100).toFixed(1)}%`:'Not set');set('targetMeta',target>0?`${money(m.monthly)} of ${money(target)} / month`:'Optional target below');renderAccounts(m);renderPlayers(m);renderMonths(state);renderCalendar(state);renderHistory(state);renderHealth(state,m);populateHoldingSelect(state,$('eventHolding')?.value);setValue('monthlyTarget',target||0);setValue('horizonMonths',state.income?.settings?.horizonMonths||12);set('lastUpdated',new Date(state.updatedAt).toLocaleString('en-GB'));const b=state.income?.backend;if(b?.lastError)set('growthNote',`Income calculations are live from Squad. Dividend calendar backend sync note: ${b.lastError}`);}

  function wire(){populateHoldingSelect();$('recalculateIncome')?.addEventListener('click',()=>{publishDerived();toast('Income recalculated from canonical Squad holdings.')});$('syncIncomeBackend')?.addEventListener('click',syncBackend);$('saveEvent')?.addEventListener('click',saveEvent);$('clearEvent')?.addEventListener('click',clearEvent);$('saveIncomeSettings')?.addEventListener('click',saveSettings);$('eventHolding')?.addEventListener('change',()=>{setValue('eventEligible','');eventPreview()});['eventEligible','eventDps','eventStatus','eventExDate'].forEach(id=>$(id)?.addEventListener('change',eventPreview));$('eventExpected')?.addEventListener('input',eventPreview);$('runDividendEngine')?.addEventListener('click',runDividendEngineNow);$('enableDividendEngine')?.addEventListener('click',enableDividendEngine);$('disableDividendEngine')?.addEventListener('click',disableDividendEngine);document.addEventListener('click',e=>{const edit=e.target.closest('[data-edit-event]');if(edit){editEvent(edit.dataset.editEvent);return}const rem=e.target.closest('[data-remove-event]');if(rem)removeEvent(rem.dataset.removeEvent)})}
  document.addEventListener('DOMContentLoaded',()=>{wire();publishDerived();render();clearEvent();freezeDueEligibility();loadDividendEngineStatus()});
  w.addEventListener('aurora2:state',()=>{if(publishing||freezingEligibility)return;publishDerived();render();freezeDueEligibility()});
  w.Aurora2=w.Aurora2||{};w.Aurora2.income={metrics,nextDividend,eventAmount,publishDerived,monthForecast,incomeExempt,dividendEligibleHoldings,freezeDueEligibility,activeTransferIncome};
})(window);
