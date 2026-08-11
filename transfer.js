(function(w){
  'use strict';
  const A=()=>w.Aurora2;
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,num(v)));
  const esc=v=>A().ui.escape(v);
  const money=v=>A().ui.money(Number(v)||0);
  const now=()=>new Date().toISOString();
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const LEGACY_DECISION_KEY='aurora_trading_brain_decision_v1';
  const LEGACY_PLAN_KEY='aurora_transfer_plan_v2';
  let legacyScan=null;

  function toast(msg){
    const el=$('toast');if(!el)return;el.textContent=msg;el.style.opacity='1';
    clearTimeout(w.__a2TransferToast);w.__a2TransferToast=setTimeout(()=>el.style.opacity='0',2200);
  }
  function set(id,v){const el=$(id);if(el)el.textContent=v}
  function setValue(id,v){const el=$(id);if(el)el.value=v??''}
  function readJson(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}}
  function mission(state=A().core.read()){return state.mission}
  function transfer(state=A().core.read()){return obj(state.transfer)}
  function scouting(state=A().core.read()){return obj(state.scouting)}
  function validMission(m){return !!(m&&num(m.approvedBudget)>0)}
  function routeEditable(state=A().core.read()){return !state.transfer?.route?.locked}
  function routeBudget(state=A().core.read()){return Math.max(0,num(state.mission?.approvedBudget))}
  function accountCode(v){
    const s=norm(v);
    if(/212/.test(s))return 'T212';
    if(/\big\b|ig isa/.test(s))return 'IG';
    return 'CHECK';
  }
  function accountLabel(v){const c=accountCode(v);return c==='IG'?'IG ISA':c==='T212'?'Trading 212 ISA':'Platform check'}
  function yieldPctFrom(v){
    let y=num(v);
    if(y>0&&y<=1)y*=100;
    return Math.max(0,y);
  }
  function field(o,keys){
    for(const k of keys){if(o&&o[k]!=null&&o[k]!=='')return o[k]}
    return null;
  }
  function targetStatus(raw,ticker){
    if(String(ticker).toUpperCase()==='TSCO')return 'block';
    const s=norm(field(raw,['status','gate','decision','permission','action'])||'');
    if(/block|avoid|no buy|sell only|locked/.test(s))return 'block';
    if(/caution|watch|controlled/.test(s))return 'caution';
    return 'pass';
  }
  function normaliseLegacyTarget(raw,index){
    const ticker=String(field(raw,['ticker','symbol','code','Ticker'])||'').replace(/\..*$/,'').toUpperCase().trim();
    if(!ticker)return null;
    const sustainable=obj(raw.sustainable);
    const rank=index+1;
    const score=clamp(field(raw,['sustainableScore','auroraScore','score','confidence','dataScore'])||sustainable.score||Math.max(40,100-rank*6));
    const y=yieldPctFrom(field(raw,['yieldPct','dividendYield','yield','incomeRate','forwardYield','dividend_yield']));
    const status=targetStatus(raw,ticker);
    let reason=String(field(raw,['reason','note','rationale','summary'])||'Imported from the latest Aurora 1 approved shortlist.');
    if(ticker==='TSCO')reason='Legacy locked / 2029 holding — excluded from active Transfer buys.';
    return {
      id:`A1-SCOUT-${ticker}`,
      ticker,
      name:String(field(raw,['name','company','companyName','securityName'])||ticker),
      preferredAccount:accountCode(field(raw,['preferredAccount','account','platform','broker'])||'CHECK'),
      status,
      reason,
      rank,
      yieldPct:y,
      sustainableScore:score,
      confidence:clamp(field(raw,['confidence','dataConfidence','dataScore'])||score),
      dividendSafety:clamp(field(raw,['dividendSafety','dividendSafetyScore','dividend_safety'])||sustainable.dividendSafety||0),
      incomeScore:clamp(field(raw,['incomeScore'])||sustainable.income||0),
      valuationScore:clamp(field(raw,['valuationScore','valuation'])||sustainable.valuation||0),
      portfolioFit:clamp(field(raw,['portfolioFit','diversificationScore'])||sustainable.portfolioFit||0),
      dividendGrowth:clamp(field(raw,['dividendGrowth','dividendGrowthScore'])||sustainable.dividendGrowth||0),
      businessQuality:clamp(field(raw,['businessQuality','qualityScore'])||sustainable.businessQuality||0),
      source:'AURORA1_SCOUTING',
      createdAt:now(),updatedAt:now()
    };
  }
  function collectPlanTargets(plan){
    for(const key of ['targets','purchases','allocations','items','deals']){
      const rows=arr(plan?.[key]);
      if(rows.length)return rows.map(x=>x.row||x.target||x).filter(Boolean);
    }
    return [];
  }
  function scanLegacy(){
    const decision=readJson(LEGACY_DECISION_KEY), plan=readJson(LEGACY_PLAN_KEY);
    let rows=arr(decision?.targets);
    let source=LEGACY_DECISION_KEY, stale=!!decision?.isStale;
    if(!rows.length){
      rows=collectPlanTargets(plan);source=LEGACY_PLAN_KEY;stale=false;
    }
    const targets=[],seen=new Set();
    rows.forEach((r,i)=>{const t=normaliseLegacyTarget(r,i);if(t&&!seen.has(t.ticker)){seen.add(t.ticker);targets.push(t)}});
    legacyScan={source,targets,stale,decision,plan};
    return legacyScan;
  }

  function importLegacy(){
    const scan=legacyScan||scanLegacy();
    if(!scan.targets.length){toast('No legacy shortlist found.');return}
    A().core.update(s=>{
      const newStatus=scan.stale?'STALE_LEGACY':'SCOUTING_READY';
      const nextMission=validMission(s.mission)&&!scan.stale&&s.mission.status==='FINANCE_APPROVED'
        ? {...s.mission,status:'SCOUTING_READY',updatedAt:now()}
        : s.mission;
      return {
        ...s,
        scouting:{
          ...s.scouting,
          status:newStatus,
          targets:scan.targets,
          importedFromLegacy:true,
          source:scan.source,
          updatedAt:now()
        },
        mission:nextMission,
        alerts:[
          {id:A().core.uid('ALERT'),title:'Scouting shortlist migrated',note:`${scan.targets.length} approved target${scan.targets.length===1?'':'s'} loaded for Transfer 2.0.`,when:'now'},
          ...(s.alerts||[]).filter(a=>a?.title!=='Scouting shortlist migrated')
        ].slice(0,8)
      };
    });
    toast(`${scan.targets.length} Scouting targets imported.`);
  }

  function targetScore(t,strategy){
    if(strategy==='maximum')return Math.max(0,num(t.yieldPct))*10;
    const componentValues=[
      ['dividendSafety',.25],['incomeScore',.20],['valuationScore',.20],
      ['portfolioFit',.15],['dividendGrowth',.10],['businessQuality',.10]
    ];
    const supplied=componentValues.filter(([k])=>num(t[k])>0);
    if(supplied.length>=3){
      const total=componentValues.reduce((s,[k,w])=>s+clamp(t[k])*w,0);
      return total*(Math.max(35,clamp(t.confidence||100))/100);
    }
    return Math.max(1,num(t.sustainableScore)||num(t.confidence)||(100-Math.max(1,num(t.rank))*5));
  }
  function brokerEligible(t,scope){
    if(scope==='both')return true;
    return accountCode(t.preferredAccount)===scope;
  }
  function roundDown(v,inc){return Math.floor((Math.max(0,v)+1e-9)/inc)*inc}
  function routeSummary(route){
    const allocations=arr(route?.allocations);
    const allocated=allocations.reduce((s,a)=>s+num(a.amount),0);
    const income=allocations.reduce((s,a)=>s+num(a.expectedAnnualIncome),0);
    const budget=num(route?.financeBudget);
    return {allocated,income,remaining:Math.max(0,budget-allocated)};
  }
  function autoRoute(){
    const state=A().core.read(), m=mission(state), sc=scouting(state), settings=state.transfer.settings;
    if(!validMission(m)){toast('Release a Finance mission first.');return}
    if(sc.status!=='SCOUTING_READY'){toast('Transfer needs a current Scouting-approved shortlist first.');return}
    const budget=routeBudget(state), min=Math.max(25,num(settings.minAllocation)||250), inc=Math.max(1,num(settings.increment)||25);
    let candidates=arr(sc.targets).filter(t=>t.status!=='block'&&brokerEligible(t,settings.brokerScope));
    candidates.sort((a,b)=>targetScore(b,settings.strategy)-targetScore(a,settings.strategy)||num(a.rank)-num(b.rank));
    if(!candidates.length){toast('No permitted targets match this broker route.');return}
    let count=Math.min(8,candidates.length,Math.max(1,Math.floor(budget/min)));
    if(budget<min)count=1;
    candidates=candidates.slice(0,count);

    const scores=candidates.map(t=>Math.max(1,targetScore(t,settings.strategy)));
    const allocations=candidates.map((t,i)=>({
      id:A().core.uid('ALLOC'),
      targetId:t.id,ticker:t.ticker,name:t.name,
      account:accountCode(t.preferredAccount),
      amount:0,yieldPct:num(t.yieldPct),expectedAnnualIncome:0,
      score:scores[i],reason:t.reason,status:'PLANNED'
    }));

    let remaining=budget;
    if(budget>=min*count){
      allocations.forEach(a=>{a.amount=roundDown(min,inc);remaining-=a.amount});
    }
    const weightSum=scores.reduce((s,x)=>s+x,0)||1;
    const extraRaw=allocations.map((a,i)=>remaining*(scores[i]/weightSum));
    allocations.forEach((a,i)=>{
      const add=roundDown(extraRaw[i],inc);a.amount+=add;remaining-=add;
    });
    let guard=0;
    while(remaining>=inc-.001&&guard<5000){
      guard++;
      const ranked=allocations.map((a,i)=>({i,priority:scores[i]/Math.max(inc,a.amount)})).sort((a,b)=>b.priority-a.priority);
      allocations[ranked[0].i].amount+=inc;remaining-=inc;
    }
    if(budget<min){
      allocations[0].amount=roundDown(budget,inc)||budget;remaining=Math.max(0,budget-allocations[0].amount);
    }
    allocations.forEach(a=>a.expectedAnnualIncome=a.amount*(a.yieldPct/100));
    const route={
      id:state.transfer.route?.missionId===m.id?state.transfer.route.id:A().core.uid('ROUTE'),
      missionId:m.id,financeBudget:budget,strategy:settings.strategy,brokerScope:settings.brokerScope,
      minAllocation:min,increment:inc,allocations,status:'DRAFT',locked:false,
      createdAt:state.transfer.route?.missionId===m.id?state.transfer.route.createdAt:now(),updatedAt:now()
    };
    const totals=routeSummary(route);Object.assign(route,totals);
    A().core.update(s=>({...s,transfer:{...s.transfer,route,updatedAt:now()}}));
    toast('Draft transfer route built.');
  }

  function updateRouteAmount(id,value){
    const amount=Math.max(0,num(value));
    A().core.update(s=>{
      const r=s.transfer.route;if(!r||r.locked)return s;
      const allocations=arr(r.allocations).map(a=>a.id===id?{...a,amount,expectedAnnualIncome:amount*(num(a.yieldPct)/100)}:a);
      const next={...r,allocations,updatedAt:now()};Object.assign(next,routeSummary(next));
      return {...s,transfer:{...s.transfer,route:next,updatedAt:now()}};
    });
  }
  function resetRoute(){
    const s=A().core.read();
    if(s.transfer.route?.locked){toast('Unlock the approved route before resetting it.');return}
    A().core.update(x=>({...x,transfer:{...x.transfer,route:null,updatedAt:now()}}));toast('Draft route cleared.');
  }
  function approveRoute(){
    const state=A().core.read(), r=state.transfer.route, m=state.mission;
    if(!r||!validMission(m)){toast('No route is ready.');return}
    const totals=routeSummary(r);
    if(totals.allocated<=0){toast('Allocate at least one purchase.');return}
    if(totals.allocated>num(m.approvedBudget)+.005){toast('Route is above the Finance ceiling.');return}
    if(r.missionId!==m.id){toast('This route belongs to an older Finance mission. Rebuild it.');return}
    const blockedTickers=new Set(arr(state.scouting.targets).filter(t=>t.status==='block').map(t=>t.ticker));
    if(arr(r.allocations).some(a=>num(a.amount)>0&&blockedTickers.has(a.ticker))){toast('A blocked Scouting target is still allocated.');return}
    const approved={...r,...totals,status:'TRANSFER_READY',locked:true,updatedAt:now()};
    A().core.update(s=>({
      ...s,
      transfer:{...s.transfer,route:approved,updatedAt:now()},
      mission:{...s.mission,status:'TRANSFER_READY',transferRouteId:approved.id,updatedAt:now()},
      alerts:[
        {id:A().core.uid('ALERT'),title:'Transfer route approved',note:`${money(totals.allocated)} allocated • ${money(totals.remaining)} held back.`,when:'now'},
        ...(s.alerts||[]).filter(a=>a?.title!=='Transfer route approved')
      ].slice(0,8)
    }));
    toast('Final route approved and locked.');
  }
  function unlockRoute(){
    const state=A().core.read(), r=state.transfer.route;
    if(!r?.locked)return;
    if(arr(state.transfer.registrationDrafts).some(d=>d.routeId===r.id&&d.status!=='DRAFT')){
      toast('Registration work exists for this route. Remove it before unlocking.');return;
    }
    A().core.update(s=>({
      ...s,
      transfer:{...s.transfer,route:{...s.transfer.route,status:'DRAFT',locked:false,updatedAt:now()},updatedAt:now()},
      mission:{...s.mission,status:'SCOUTING_READY',updatedAt:now()}
    }));
    toast('Route unlocked. Finance budget is still unchanged.');
  }

  function setSettings(){
    const strategy=document.querySelector('input[name="strategy"]:checked')?.value||'sustainable';
    const brokerScope=$('brokerScope')?.value||'both';
    const minAllocation=Math.max(25,num($('minAllocation')?.value)||250);
    const increment=Math.max(1,num($('allocationIncrement')?.value)||25);
    A().core.update(s=>({...s,transfer:{...s.transfer,settings:{...s.transfer.settings,strategy,brokerScope,minAllocation,increment},updatedAt:now()}}));
  }

  function copyInstructions(){
    const s=A().core.read(), r=s.transfer.route;if(!r){toast('Build a route first.');return}
    const ig=arr(r.allocations).filter(a=>accountCode(a.account)==='IG').reduce((x,a)=>x+num(a.amount),0);
    const t212=arr(r.allocations).filter(a=>accountCode(a.account)==='T212').reduce((x,a)=>x+num(a.amount),0);
    const totals=routeSummary(r);
    const lines=arr(r.allocations).filter(a=>num(a.amount)>0).map(a=>`${accountLabel(a.account)}: ${a.ticker} ${money(a.amount)}`);
    const text=`Aurora FC 2.0 — Transfer Route\nFinance mission: ${r.missionId}\nBudget: ${money(r.financeBudget)}\nStrategy: ${r.strategy==='maximum'?'Maximum Income':'Sustainable Income'}\n\nIG ISA: ${money(ig)}\nTrading 212 ISA: ${money(t212)}\nKeep untransferred: ${money(totals.remaining)}\n\n${lines.join('\n')}`;
    navigator.clipboard?.writeText(text).then(()=>toast('Broker instructions copied.')).catch(()=>toast('Clipboard unavailable.'));
  }

  function currentRegistrationAllocation(){
    const s=A().core.read(), id=$('regAllocation')?.value;
    return arr(s.transfer.route?.allocations).find(a=>a.id===id)||null;
  }
  function registrationCalc(){
    const a=currentRegistrationAllocation();
    const shares=Math.max(0,num($('regShares')?.value)), price=Math.max(0,num($('regPrice')?.value));
    const unit=$('regPriceUnit')?.value||'GBP', currency=String($('regCurrency')?.value||'GBP').toUpperCase();
    const fx=Math.max(0,num($('regFx')?.value)), fees=Math.max(0,num($('regFees')?.value));
    const unitPrice=unit==='PENCE'?price/100:price;
    const gross=shares*unitPrice,totalNative=gross+fees,totalGbp=totalNative*(currency==='GBP'?1:fx||0);
    const planned=num(a?.amount),diff=totalGbp-planned;
    set('regPlanned',money(planned));set('regTotal',money(totalGbp));set('regDifference',`${diff>=0?'+':''}${money(diff)}`);
    const ready=!!(a&&shares>0&&price>0&&(currency==='GBP'||fx>0));
    set('regPrecheck',ready?'READY':'WAITING');
    return {a,shares,price,unit,currency,fx:currency==='GBP'?1:fx,fees,gross,totalNative,totalGbp,planned,diff,ready};
  }
  function loadRegistrationAllocation(){
    const a=currentRegistrationAllocation();if(!a)return registrationCalc();
    setValue('regTicker',a.ticker);setValue('regAccount',accountLabel(a.account));registrationCalc();
  }
  function clearRegistration(){
    setValue('regShares','');setValue('regPrice','');setValue('regPriceUnit','GBP');setValue('regCurrency','GBP');setValue('regFx','1');setValue('regFees','0');registrationCalc();
  }
  function saveRegistrationDraft(){
    const c=registrationCalc(), state=A().core.read(), r=state.transfer.route;
    if(!r?.locked){toast('Approve and lock the Transfer route first.');return}
    if(!c.ready){toast('Complete the registration pre-check first.');return}
    const draft={
      id:A().core.uid('REGDRAFT'),routeId:r.id,missionId:r.missionId,allocationId:c.a.id,
      transactionId:A().core.uid('TX'),tradeDate:$('regDate')?.value||'',account:$('regAccount')?.value||'',
      ticker:c.a.ticker,name:c.a.name,side:'BUY',shares:c.shares,priceInput:c.price,priceUnit:c.unit,currency:c.currency,
      fxRateToGbp:c.fx,grossCostNative:c.gross,feesNative:c.fees,totalCostNative:c.totalNative,totalCostGbp:c.totalGbp,
      plannedAmount:c.planned,differenceGbp:c.diff,status:'READY_FOR_BACKEND',createdAt:now(),updatedAt:now()
    };
    A().core.update(s=>({...s,transfer:{...s.transfer,registrationDrafts:[draft,...arr(s.transfer.registrationDrafts)],updatedAt:now()}}));
    clearRegistration();toast('Registration draft saved. No holding was changed.');
  }
  function deleteDraft(id){
    A().core.update(s=>({...s,transfer:{...s.transfer,registrationDrafts:arr(s.transfer.registrationDrafts).filter(d=>d.id!==id),updatedAt:now()}}));
    toast('Registration draft removed.');
  }

  function renderMission(state){
    const m=state.mission,b=validMission(m)?num(m.approvedBudget):0;
    set('missionBudget',money(b));set('kFinanceBudget',money(b));set('handoffBudget',money(b));
    set('missionStatus',m?.status||'NO ACTIVE MISSION');
    set('missionMeta',m?`${m.id}${m.paydayDate?' • payday '+m.paydayDate:''}`:'Release an investment mission from Finance first.');
    set('missionLock',m?'Finance-authorised budget is read-only in Transfer.':'Budget is locked to Finance.');
    set('handoffMissionId',m?.id||'—');set('handoffPayday',m?.paydayDate||'—');
    set('handoffSafe',m?.financeSnapshot?.safeSurplus!=null?money(m.financeSnapshot.safeSurplus):'—');
    set('handoffCommitments',m?.financeSnapshot?.commitments!=null?money(m.financeSnapshot.commitments):'—');
    set('handoffState',validMission(m)?'LOADED':'WAITING');
  }
  function renderTargets(state){
    const sc=scouting(state),targets=arr(sc.targets),host=$('targetList');
    set('kTargets',targets.length);set('scoutingState',sc.status||'NOT BUILT');set('targetSource',sc.source||'Awaiting Scouting 2.0');
    if(!host)return;
    if(!targets.length){host.innerHTML='<div class="empty-state compact"><strong>No approved targets yet</strong><p>Import the latest Aurora 1 shortlist above, or wait for Scouting 2.0.</p></div>';return}
    host.innerHTML=targets.map((t,i)=>`<article class="target-row"><div class="target-main"><strong>#${t.rank||i+1} • ${esc(t.ticker)} — ${esc(t.name)}</strong><span>${esc(t.reason||'Approved Scouting target')} • ${accountLabel(t.preferredAccount)}</span></div><div class="target-side"><span class="status-pill ${esc(t.status)}">${esc(t.status)}</span><strong>${num(t.yieldPct)>0?num(t.yieldPct).toFixed(2)+'%':'—'}</strong><span>${Math.round(targetScore(t,'sustainable'))}/100 route evidence</span></div></article>`).join('');
  }
  function renderLegacy(){
    const scan=scanLegacy(),host=$('legacyScoutingSummary'),btn=$('importLegacyScouting');
    if(!host||!btn)return;
    if(!scan.targets.length){host.innerHTML='<div class="notice">No Aurora 1 shortlist found in browser storage.</div>';btn.disabled=true;return}
    host.innerHTML=`<div class="migration-row"><div><strong>${scan.targets.length} target${scan.targets.length===1?'':'s'} found</strong><span>${esc(scan.source)}${scan.stale?' • source marked stale':''}</span></div><span class="status-pill ${scan.stale?'caution':'pass'}">${scan.stale?'STALE':'READY'}</span></div>`;
    btn.disabled=false;
  }
  function renderSettings(state){
    const st=state.transfer.settings;
    const radio=document.querySelector(`input[name="strategy"][value="${st.strategy}"]`);if(radio)radio.checked=true;
    $('strategySustainable')?.classList.toggle('active',st.strategy==='sustainable');$('strategyMaximum')?.classList.toggle('active',st.strategy==='maximum');
    setValue('brokerScope',st.brokerScope);setValue('minAllocation',st.minAllocation);setValue('allocationIncrement',st.increment);
  }
  function renderRoute(state){
    const r=state.transfer.route,host=$('routeList'),budget=routeBudget(state);
    if(!r){
      set('kAllocated',money(0));set('kHoldback',money(budget));set('kIncome',money(0));set('routeStatus','NO ROUTE');
      set('brokerIg',money(0));set('brokerT212',money(0));set('brokerHold',money(budget));if($('routeProgress'))$('routeProgress').style.width='0%';
      if(host)host.innerHTML='<div class="empty-state compact"><strong>No transfer route yet</strong><p>Choose the strategy and auto-build the deal sheet.</p></div>';
      $('approveRoute').disabled=true;$('unlockRoute').hidden=true;return;
    }
    const totals=routeSummary(r),ig=arr(r.allocations).filter(a=>accountCode(a.account)==='IG').reduce((s,a)=>s+num(a.amount),0),t212=arr(r.allocations).filter(a=>accountCode(a.account)==='T212').reduce((s,a)=>s+num(a.amount),0);
    set('kAllocated',money(totals.allocated));set('kHoldback',money(totals.remaining));set('kIncome',money(totals.income));set('routeStatus',r.status);
    set('brokerIg',money(ig));set('brokerT212',money(t212));set('brokerHold',money(totals.remaining));
    if($('routeProgress'))$('routeProgress').style.width=`${budget>0?Math.min(100,totals.allocated/budget*100):0}%`;
    if(host)host.innerHTML=arr(r.allocations).map(a=>`<article class="route-row"><div class="route-main"><strong>${esc(a.ticker)} — ${esc(a.name)}</strong><span>${accountLabel(a.account)} • ${num(a.yieldPct)>0?num(a.yieldPct).toFixed(2)+'% yield • ':''}${money(a.expectedAnnualIncome)}/yr projected • ${esc(a.reason||'Transfer allocation')}</span></div><div class="route-side">${r.locked?`<strong>${money(a.amount)}</strong>`:`<input class="route-input" data-route-amount="${esc(a.id)}" type="number" min="0" step="${r.increment}" value="${num(a.amount).toFixed(2)}">`}<span>${r.locked?'LOCKED':'editable allocation'}</span></div></article>`).join('');
    const valid=totals.allocated>0&&totals.allocated<=budget+.005&&r.missionId===state.mission?.id;
    $('approveRoute').disabled=!valid||r.locked;$('unlockRoute').hidden=!r.locked;
    const guard=$('routeGuard');
    if(guard){
      if(totals.allocated>budget+.005){guard.className='notice red';guard.textContent=`Blocked: route exceeds Finance by ${money(totals.allocated-budget)}.`}
      else{guard.className='notice good';guard.textContent=`${money(totals.allocated)} allocated from the locked ${money(budget)} mission • ${money(totals.remaining)} held back.`}
    }
  }
  function renderRegistration(state){
    const r=state.transfer.route,select=$('regAllocation'),current=select?.value;
    const eligible=arr(r?.allocations).filter(a=>num(a.amount)>0);
    if(select){
      select.innerHTML=eligible.length?eligible.map(a=>`<option value="${esc(a.id)}">${esc(a.ticker)} • ${accountLabel(a.account)} • ${money(a.amount)}</option>`).join(''):'<option value="">No approved route purchases</option>';
      if(eligible.some(a=>a.id===current))select.value=current;
    }
    loadRegistrationAllocation();
    const drafts=arr(state.transfer.registrationDrafts),host=$('registrationDraftList');set('registrationCount',`${drafts.length} draft${drafts.length===1?'':'s'}`);
    if(!host)return;
    if(!drafts.length){host.innerHTML='<div class="empty-state compact"><strong>No registration drafts</strong><p>Completed broker buys can be prepared here once the route is approved.</p></div>';return}
    host.innerHTML=drafts.map(d=>`<article class="draft-row"><div class="draft-main"><strong>${esc(d.ticker)} • ${esc(d.account)} • ${money(d.totalCostGbp)}</strong><span>${esc(d.transactionId)} • ${esc(d.tradeDate||'date pending')} • ${Number(d.shares).toLocaleString('en-GB')} shares • ${esc(d.status)}</span></div><button class="btn secondary" data-delete-draft="${esc(d.id)}">Delete</button></article>`).join('');
  }
  function render(){
    const state=A().core.read();renderMission(state);renderTargets(state);renderSettings(state);renderRoute(state);renderRegistration(state);set('lastUpdated',new Date(state.updatedAt).toLocaleString('en-GB'));
  }

  function tabs(){
    document.querySelectorAll('.tab[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
      document.querySelectorAll('.tab[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===btn.dataset.tab));
    }));
    $('openAllocation')?.addEventListener('click',()=>document.querySelector('[data-tab="allocationPanel"]')?.click());
  }
  function wire(){
    tabs();renderLegacy();
    $('importLegacyScouting')?.addEventListener('click',importLegacy);
    document.querySelectorAll('input[name="strategy"]').forEach(r=>r.addEventListener('change',()=>{setSettings();render()}));
    ['brokerScope','minAllocation','allocationIncrement'].forEach(id=>$(id)?.addEventListener('change',()=>{setSettings();render()}));
    $('autoBuildRoute')?.addEventListener('click',()=>{setSettings();autoRoute()});
    $('resetRoute')?.addEventListener('click',resetRoute);$('approveRoute')?.addEventListener('click',approveRoute);$('unlockRoute')?.addEventListener('click',unlockRoute);$('copyBrokerInstructions')?.addEventListener('click',copyInstructions);
    document.addEventListener('change',e=>{const input=e.target.closest('[data-route-amount]');if(input)updateRouteAmount(input.dataset.routeAmount,input.value)});
    $('regAllocation')?.addEventListener('change',loadRegistrationAllocation);
    ['regShares','regPrice','regPriceUnit','regCurrency','regFx','regFees'].forEach(id=>$(id)?.addEventListener('input',registrationCalc));
    $('saveRegistrationDraft')?.addEventListener('click',saveRegistrationDraft);$('clearRegistration')?.addEventListener('click',clearRegistration);
    document.addEventListener('click',e=>{const b=e.target.closest('[data-delete-draft]');if(b)deleteDraft(b.dataset.deleteDraft)});
    if($('regDate')&&!$('regDate').value){const d=new Date();$('regDate').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  }
  document.addEventListener('DOMContentLoaded',()=>{wire();render()});
  w.addEventListener('aurora2:state',render);
})(window);
