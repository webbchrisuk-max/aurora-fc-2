(function(w){
  'use strict';

  const A=()=>w.Aurora2;
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const esc=v=>A().ui.escape(v);
  const money=v=>A().ui.money(Number(v)||0);
  const now=()=>new Date().toISOString();

  function set(id,v){const el=$(id);if(el)el.textContent=v}
  function setValue(id,v){const el=$(id);if(el)el.value=v??''}
  function toast(msg){
    const el=$('toast');if(!el)return;
    el.textContent=msg;el.style.opacity='1';
    clearTimeout(w.__a2TransferToast);
    w.__a2TransferToast=setTimeout(()=>el.style.opacity='0',2200);
  }
  function ticker(v){
    return String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();
  }
  function accountCode(v){
    const s=String(v||'').toLowerCase();
    if(s.includes('212'))return 'T212';
    if(/\big\b/.test(s)||s.includes('ig isa'))return 'IG';
    const u=String(v||'').toUpperCase();
    return u==='IG'||u==='T212'?u:'CHECK';
  }
  function accountLabel(v){
    const a=accountCode(v);
    return a==='IG'?'IG ISA':a==='T212'?'Trading 212 ISA':'Broker unresolved';
  }
  function mission(state=A().core.read()){return state.mission||null}
  function scouting(state=A().core.read()){return state.scouting||{status:'SCOUTING_REVIEW',targets:[]}}
  function validMission(m){
    if(!m||num(m.approvedBudget)<=0)return false;
    return !['CANCELLED','COMPLETE','COMPLETED','ARCHIVED'].includes(String(m.status||'').toUpperCase());
  }
  function routeBudget(state=A().core.read()){
    const m=mission(state);
    return validMission(m)?Math.max(0,num(m.approvedBudget)):0;
  }

  function scoutingStrategy(state=A().core.read()){
    return String(state.scouting?.strategy||'sustainable').toLowerCase()==='maximum'
      ?'maximum'
      :'sustainable';
  }
  function scoutingStrategyLabel(state=A().core.read()){
    return scoutingStrategy(state)==='maximum'?'Maximum Income':'Sustainable Income';
  }
  function scoutingStrategyReady(state=A().core.read()){
    return String(state.scouting?.status||'').toUpperCase()==='SCOUTING_READY';
  }

  function routeSummary(route){
    const allocations=arr(route?.allocations);
    const allocated=allocations.reduce((s,a)=>s+num(a.amount),0);
    const income=allocations.reduce((s,a)=>s+num(a.expectedAnnualIncome),0);
    const budget=num(route?.financeBudget);
    return {allocated,income,remaining:Math.max(0,budget-allocated)};
  }

  function activeHoldings(state){return arr(state.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h.status||'').toUpperCase())&&num(h.shares)>0)}
  function resolvedBrokerLabel(state,target){const route=A().transferEngine?.resolveBrokerRoute?.(state,target);return A().transferEngine?.brokerRouteLabel?.(route)||accountLabel(route?.account)}
  function holdingValue(h){return num(h.marketValueGbp)||(num(h.shares)*num(h.livePriceGbp))}
  function incomeBaseline(state){
    const canonical=num(state.portfolio?.annualIncome);
    return canonical>0?canonical:activeHoldings(state).reduce((s,h)=>s+(num(h.annualIncomeGbp)||(num(h.shares)*num(h.annualDpsGbp))),0);
  }
  function missionIncomeBaseline(state,r=state.transfer?.route){
    const canonical=incomeBaseline(state);
    if(canonical>0)return canonical;
    const frozen=Number(r?.baselineAnnualIncome);
    return Number.isFinite(frozen)&&frozen>=0?frozen:canonical;
  }
  function portfolioPreview(state,r=state.transfer?.route){
    const allocations=arr(r?.allocations).filter(a=>num(a.amount)>0);
    const totals=r?routeSummary(r):{allocated:0,income:0,remaining:routeBudget(state)};
    const currentAnnualIncome=missionIncomeBaseline(state,r);
    const projectedAnnualIncome=currentAnnualIncome+totals.income;
    const holdings=activeHoldings(state);
    const frozenHoldings=arr(r?.baselineHoldings);
    const previewHoldings=frozenHoldings.length?frozenHoldings:holdings;
    const currentPortfolioValue=previewHoldings.reduce((sum,h)=>sum+holdingValue(h),0);
    const projectedPortfolioValue=currentPortfolioValue+totals.allocated;
    return {
      allocations,totals,previewHoldings,currentAnnualIncome,projectedAnnualIncome,
      currentPortfolioValue,projectedPortfolioValue,
      currentIncomeYield:currentPortfolioValue?currentAnnualIncome/currentPortfolioValue*100:0,
      projectedIncomeYield:projectedPortfolioValue?projectedAnnualIncome/projectedPortfolioValue*100:0
    };
  }
  function routeEvidence(state,a){
    const targets=arr(state.scouting?.targets);
    const target=targets.find(t=>String(t.securityId||'')&&String(t.securityId)===String(a.securityId||''))||
      targets.find(t=>String(t.id)===String(a.targetId))||
      targets.find(t=>ticker(t.ticker)===ticker(a.ticker)&&String(t.exchange||'').toUpperCase()===String(a.exchange||'').toUpperCase())||{};
    const holdings=activeHoldings(state).filter(h=>ticker(h.ticker)===ticker(a.ticker));
    const quoteHolding=holdings.find(h=>num(h.livePriceGbp)>0)||{};
    const priceEvidence=A().transferEngine?.resolveMarketPrice?.(state,target)||{};
    const price=num(priceEvidence.priceGbp);
    const updatedAt=priceEvidence.timestamp||null;
    const moveRaw=target.dayChangePct??target.changePct??quoteHolding.dayChangePct;
    const move=Number(moveRaw);
    const calendar=arr(state.income?.calendar).filter(e=>ticker(e.ticker)===ticker(a.ticker)&&!['CANCELLED','ARCHIVED','PAID'].includes(String(e.status||'').toUpperCase())).sort((x,y)=>String(x.payDate||'9999').localeCompare(String(y.payDate||'9999')))[0];
    return {target,holdings,price,updatedAt,move:Number.isFinite(move)?move:null,calendar};
  }
  function confirmedFor(state,r,a){return arr(state.transfer?.registrationDrafts).find(d=>d.routeId===r?.id&&d.allocationId===a.id&&d.status==='CONFIRMED')}
  function renderTicker(state){
    const host=$('transferTicker'),fresh=$('tickerFreshness'),r=state.transfer?.route;
    if(!host)return;
    const allocations=arr(r?.allocations).filter(a=>num(a.amount)>0);
    const totals=r?routeSummary(r):{allocated:0,income:0,remaining:routeBudget(state)};
    const current=missionIncomeBaseline(state,r),post=current+totals.income,budget=routeBudget(state);
    const relevant=allocations.length?allocations:arr(state.scouting?.targets).slice(0,6);
    const items=[];
    if(budget>0){
      items.push({html:`<span><b>PAYDAY PLAN</b> ${money(budget)} READY</span>`,stale:false});
      items.push({html:`<span><b>${esc(scoutingStrategyLabel(state).toUpperCase())}</b> ${allocations.length} PROPOSED BUY${allocations.length===1?'':'S'}</span>`,stale:false});
      items.push({html:`<span><b>ALLOCATED</b> ${money(totals.allocated)} • <b>UNALLOCATED</b> ${money(totals.remaining)}</span>`,stale:false});
      items.push({html:`<span><b>EST. INCOME</b> +${money(totals.income)}/YEAR</span>`,stale:false});
      items.push({html:`<span><b>POST-TRANSFER INCOME</b> ${money(post)}/YEAR</span>`,stale:false});
      const brokerTotals=['IG','T212'].map(code=>({code,total:allocations.filter(a=>accountCode(a.account)===code).reduce((s,a)=>s+num(a.amount),0)})).filter(x=>x.total>0);
      if(brokerTotals.length)items.push({html:`<span><b>BROKER ROUTE</b> ${brokerTotals.map(x=>`${esc(accountLabel(x.code))} ${money(x.total)}`).join(' • ')}</span>`,stale:false});
    }
    relevant.forEach(a=>{const e=routeEvidence(state,a),stamp=e.updatedAt?Date.parse(e.updatedAt):NaN,stale=!Number.isFinite(stamp)||Date.now()-stamp>24*60*60*1000;
      const px=e.price>0?(e.price<2?`${(e.price*100).toFixed(1)}p`:money(e.price)):'PRICE UNAVAILABLE';
      const movement=e.move==null?'MOVE UNAVAILABLE':`${e.move>=0?'▲':'▼'} ${Math.abs(e.move).toFixed(2)}%`;
      items.push({html:`<span><b>${esc(ticker(a.ticker))}</b> ${px} <i class="${e.move==null?'':e.move>=0?'up':'down'}">${movement}</i>${stale?' • STALE':''}</span>`,stale,stamp});
    });
    const next=arr(state.income?.calendar).filter(e=>!['CANCELLED','ARCHIVED','PAID'].includes(String(e.status||'').toUpperCase())&&relevant.some(a=>ticker(a.ticker)===ticker(e.ticker))).sort((a,b)=>String(a.payDate||'9999').localeCompare(String(b.payDate||'9999')))[0];
    if(next)items.push({html:`<span><b>${next.exDate?'EX-DIV':'NEXT DIVIDEND'}</b> ${esc(ticker(next.ticker))} • ${esc(next.exDate||next.payDate||'DATE PENDING')}${num(next.expectedAmountGbp)>0?` • ${money(next.expectedAmountGbp)}`:''}</span>`,stale:false});
    const chairman=chairmanHoldings(state).map(h=>({h,m:chairmanHoldingMetrics(h)})).filter(x=>x.m.triggered&&chairmanMateriality(state,x.h,x.m).meaningful).sort((a,b)=>b.m.profitPct-a.m.profitPct)[0];
    if(chairman)items.push({html:`<span><b>CHAIRMAN'S OFFER</b> ${esc(ticker(chairman.h.ticker))} REVIEW REQUIRED • +${chairman.m.profitPct.toFixed(1)}%</span>`,stale:false});
    const wire=items.map(x=>x.html).join('<em>•</em>')||'<span>No recommendation is currently available.</span>';
    host.innerHTML=`${wire}<em>•</em>${wire}`;
    const stale=items.some(x=>x.stale); const stamps=items.map(x=>x.stamp).filter(Number.isFinite);
    fresh.textContent=stale?`MARKET DATA STALE / ${stamps.length?new Date(Math.max(...stamps)).toLocaleString('en-GB'):'UPDATE UNKNOWN'}`:'CURRENT';
    fresh.classList.toggle('stale',stale);
  }
  function renderImpact(state){
    const r=state.transfer?.route;
    const preview=portfolioPreview(state,r);
    const {allocations,totals,previewHoldings,currentAnnualIncome:current,projectedAnnualIncome:post,currentPortfolioValue:value}=preview;
    const accounts=code=>previewHoldings.filter(h=>accountCode(h.account)===code).reduce((s,h)=>s+holdingValue(h),0);
    const confirmed=allocations.map(a=>confirmedFor(state,r,a)).filter(Boolean), complete=allocations.length>0&&confirmed.length===allocations.length;
    set('impactMissionState',complete?'TRANSFER COMPLETE':'PROPOSED'); set('heroIncomeUplift',`+${money(totals.income)} / year`); set('heroIncomeJourney',`${money(current)} → ${money(post)}`);
    const brokers=new Set(allocations.map(a=>accountCode(a.account)).filter(x=>x!=='CHECK')); set('heroRouteSummary',`${allocations.length} buys • ${brokers.size} brokers • ${money(totals.remaining)} unallocated`);
    const yieldPct=totals.allocated>0?totals.income/totals.allocated*100:0, efficiency=totals.allocated>0?totals.income/totals.allocated*1000:0;
    if($('impactKpis'))$('impactKpis').innerHTML=[['Current annual income',money(current)],['Estimated additional income',`+${money(totals.income)} / year`],['New annual income',money(post)],['Monthly equivalent',`${money(current/12)} → ${money(post/12)}`],['Transfer income yield',`${yieldPct.toFixed(2)}%`],['Income per £1,000',`${money(efficiency)} / year`]].map(x=>`<div><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join('');
    const monthlyTarget=num(state.income?.settings?.monthlyTarget), annualTarget=monthlyTarget*12;
    if($('incomeMissionProgress'))$('incomeMissionProgress').innerHTML=annualTarget>0?`<strong>${money(post)} of ${money(annualTarget)} annual target</strong><div class="mission-progress"><i style="width:${Math.min(100,post/annualTarget*100)}%"></i></div><span>${money(current)} current • +${money(totals.income)} transfer • ${money(Math.max(0,annualTarget-post))} remaining</span>`:'<div class="empty-state compact"><strong>No income target configured</strong><p>Set a monthly target in Income Centre; Transfer will not invent a milestone.</p></div>';
    if($('portfolioComparison'))$('portfolioComparison').innerHTML=[['Annual income',current,post],['Monthly income',current/12,post/12],['Portfolio value',value,preview.projectedPortfolioValue],['Positions',previewHoldings.length,new Set(previewHoldings.map(h=>`${accountCode(h.account)}|${ticker(h.ticker)}`).concat(allocations.map(a=>`${accountCode(a.account)}|${ticker(a.ticker)}`))).size],['Portfolio income yield',preview.currentIncomeYield,preview.projectedIncomeYield],['IG ISA value',accounts('IG'),accounts('IG')+allocations.filter(a=>accountCode(a.account)==='IG').reduce((s,a)=>s+num(a.amount),0)],['Trading 212 ISA value',accounts('T212'),accounts('T212')+allocations.filter(a=>accountCode(a.account)==='T212').reduce((s,a)=>s+num(a.amount),0)]].map((x,i)=>`<div><small>${x[0]}</small><span class="before-value">${i===3?x[1]:i===4?num(x[1]).toFixed(2)+'%':money(x[1])}</span><b>→</b><strong>${i===3?x[2]:i===4?num(x[2]).toFixed(2)+'%':money(x[2])}</strong></div>`).join('');
    if($('previewCashStrip'))$('previewCashStrip').innerHTML=`<div><small>Transfer cash</small><strong>${money(routeBudget(state))}</strong></div><div><small>Allocated</small><strong>${money(totals.allocated)}</strong></div><div class="${totals.remaining>.005?'warning':''}"><small>Remaining cash</small><strong>${money(totals.remaining)}</strong></div>`;
    renderInstructions(state,allocations,totals,current,post,confirmed,complete);
  }
  function renderInstructions(state,allocations,totals,current,post,confirmed,complete){
    const body=$('allocationInstructions');
    const ranked=[...allocations].sort((a,b)=>num(b.expectedAnnualIncome)-num(a.expectedAnnualIncome));
    if(body)body.innerHTML=ranked.length?ranked.map((a,i)=>{const e=routeEvidence(state,a), existing=e.holdings.reduce((s,h)=>s+holdingValue(h),0), existingShares=e.holdings.reduce((s,h)=>s+num(h.shares),0), shares=e.price>0?Math.floor(num(a.amount)/e.price):null, next=e.calendar?[e.calendar.exDate&&`Ex ${e.calendar.exDate}`,e.calendar.payDate&&`Pay ${e.calendar.payDate}`,shares!=null&&num(e.calendar.dividendPerShareGbp)>0&&`Est. next payment ${money(shares*num(e.calendar.dividendPerShareGbp))}`].filter(Boolean).join(' • '):'No dividend dates recorded'; const reason=a.reason||e.target.reason||arr(e.target.eligibilityReasons)[0]||'Scouting-approved allocation'; return `<tr class="allocation-priority-${Math.min(i+1,4)}"><td data-label="Holding"><strong>${esc(ticker(a.ticker))} — ${esc(a.name||ticker(a.ticker))}</strong><span>#${i+1} income contribution • ${esc(reason)}</span></td><td data-label="Broker">${esc(accountLabel(a.account))}</td><td data-label="Allocation"><strong>${money(a.amount)}</strong></td><td data-label="Est. price">${e.price>0?(e.price<2?(e.price*100).toFixed(1)+'p':money(e.price)):'Unavailable'}</td><td data-label="Shares">${shares==null?'—':`Buy ~${shares.toLocaleString('en-GB')}<span>${existingShares.toLocaleString('en-GB')} → ${(existingShares+shares).toLocaleString('en-GB')}</span>`}</td><td data-label="Annual income"><strong>+${money(a.expectedAnnualIncome)}</strong></td><td data-label="Yield">${num(a.yieldPct).toFixed(2)}%</td><td data-label="Exposure">${money(existing)} → ${money(existing+num(a.amount))}<span>${esc(next)}</span></td></tr>`}).join(''):'<tr><td colspan="8">Build a route to see exact buy instructions.</td></tr>';
    if($('allocationTotals'))$('allocationTotals').innerHTML=`<div><small>Transfer cash</small><strong>${money(num(state.mission?.approvedBudget))}</strong></div><div><small>Total allocated</small><strong>${money(totals.allocated)}</strong></div><div class="${totals.remaining>.005?'unallocated':''}"><small>Unallocated cash</small><strong>${money(totals.remaining)}</strong></div>`;
    const brokerRows=['IG','T212'].map(code=>({label:accountLabel(code),amount:allocations.filter(a=>accountCode(a.account)===code).reduce((s,a)=>s+num(a.amount),0)})).filter(x=>x.amount>0);
    if($('brokerRouteSummary'))$('brokerRouteSummary').innerHTML=brokerRows.length?`${brokerRows.map(x=>`<div><small>${esc(x.label)}</small><strong>${money(x.amount)}</strong></div>`).join('')}<div class="route-total"><small>Total routed</small><strong>${money(totals.allocated)}</strong></div>`:'<div class="empty-state compact">Build a route to see broker destinations.</div>';
    if($('incomeContribution'))$('incomeContribution').innerHTML=ranked.length?ranked.map((a,i)=>`<div><b>${i+1}</b><span>${esc(ticker(a.ticker))}</span><strong>+${money(a.expectedAnnualIncome)}<small>/year</small></strong></div>`).join(''):'<div class="empty-state compact">No proposed income contributions yet.</div>';
    const checks=state.transfer?.executionChecks||{}; if($('executionChecklist'))$('executionChecklist').innerHTML=allocations.length?allocations.map(a=>{const d=confirmedFor(state,state.transfer?.route,a),checked=!!d||!!checks[a.id];return `<label class="execution-check ${d?'registered':checked?'desk-complete':''}"><input type="checkbox" data-execution-check="${esc(a.id)}" ${checked?'checked':''} ${d?'disabled':''}><span>${d?'✓':'○'} ${esc(ticker(a.ticker))} • ${esc(accountLabel(a.account))} • ${money(a.amount)}</span><b>${d?'REGISTERED':checked?'DESK CHECKED — REGISTRATION PENDING':'PENDING'}</b></label>`}).join(''):'<div class="empty-state compact">No planned purchases.</div>';
    const actual=confirmed.reduce((s,d)=>s+num(d.totalCostGbp),0);
    const fills=confirmed.map(d=>`${ticker(d.ticker)} ${num(d.shares).toLocaleString('en-GB')} @ ${d.priceUnit==='PENCE'?num(d.priceInput).toFixed(2)+'p':money(num(d.priceInput))}`).join(' • ');
    if($('executionRecord'))$('executionRecord').innerHTML=complete?`<b>Transfer complete.</b> Planned ${money(totals.allocated)} • actually invested ${money(actual)} • ${confirmed.reduce((s,d)=>s+num(d.shares),0).toLocaleString('en-GB')} shares • original estimated uplift ${money(totals.income)} • current canonical annual income ${money(incomeBaseline(state))} • leftover ${money(Math.max(0,num(state.mission?.approvedBudget)-actual))}.<br>${esc(fills)}`:`<b>${confirmed.length} of ${allocations.length} registered.</b> Remaining transfer cash by confirmed executions: ${money(Math.max(0,num(state.mission?.approvedBudget)-actual))}. Manual checks do not complete the mission.${fills?`<br>${esc(fills)}`:''}`;
  }

  function autoRoute(){
    const state=A().core.read();
    const engine=A().transferEngine;
    if(!engine?.buildMissionPlan){toast('Transfer recommendation engine is unavailable. Reload the page.');return false}
    const planned=engine.buildMissionPlan(state,{
      missionContract:w.AuroraTransferMission,
      now:now(),
      idFactory:p=>A().core.uid(p),
      decorateAllocation:a=>{
        const evidence=routeEvidence(state,a);
        const estimatedPrice=evidence.price>0?evidence.price:0;
        return {
          ...a,
          estimatedPriceGbp:estimatedPrice,
          estimatedShares:estimatedPrice>0?Math.floor(num(a.amount)/estimatedPrice):null,
          quoteUpdatedAt:evidence.updatedAt||null
        };
      }
    });
    if(!planned.ok){
      const messages={NO_FINANCE_MISSION:'Release a Finance mission first.',MISSION_NOT_PLANNABLE:'The current Finance mission cannot be replanned.',SCOUTING_NOT_READY:'Transfer needs a current Scouting-approved shortlist first.',MISSION_CONTRACT_UNAVAILABLE:'The canonical Transfer mission contract is unavailable. Reload the page.',NO_ELIGIBLE_TARGETS:'No permitted targets match this broker route.'};
      toast(messages[planned.reason]||'No eligible recommendation route could be built.');
      return false;
    }
    A().core.update(s=>({...s,mission:planned.mission,transfer:{...s.transfer,route:planned.route,updatedAt:now()}}));
    toast('Draft transfer route built.');
    return true;
  }

  function updateRouteAmount(id,value){
    const amount=Math.max(0,num(value));
    A().core.update(s=>{
      const r=s.transfer?.route;
      if(!r||r.locked)return s;
      const allocations=arr(r.allocations).map(a=>a.id===id?{
        ...a,amount,expectedAnnualIncome:amount*(num(a.yieldPct)/100),
        estimatedShares:num(a.estimatedPriceGbp)>0?Math.floor(amount/num(a.estimatedPriceGbp)):null
      }:a);
      const next={...r,allocations,updatedAt:now()};
      Object.assign(next,routeSummary(next));
      return {...s,transfer:{...s.transfer,route:next,updatedAt:now()}};
    });
  }

  function updateRouteAccount(id,value){
    const account=accountCode(value);
    A().core.update(s=>{
      const r=s.transfer?.route;
      if(!r||r.locked)return s;
      const allocations=arr(r.allocations).map(a=>a.id===id?{...a,account}:a);
      const next={...r,allocations,updatedAt:now()};
      Object.assign(next,routeSummary(next));
      return {...s,transfer:{...s.transfer,route:next,updatedAt:now()}};
    });
  }

  function resetRoute(){
    const s=A().core.read();
    if(s.transfer?.route?.locked){toast('Unlock the approved route before resetting it.');return}
    A().core.update(x=>({...x,transfer:{...x.transfer,route:null,updatedAt:now()}}));
    toast('Draft route cleared.');
  }

  function approveRoute(){
    const state=A().core.read(),r=state.transfer?.route,m=state.mission;
    if(!r||!validMission(m)){toast('No route is ready.');return}
    const totals=routeSummary(r);
    if(totals.allocated<=0){toast('Allocate at least one purchase.');return}
    if(totals.allocated>num(m.approvedBudget)+.005){toast('Route is above the Finance ceiling.');return}
    if(r.missionId!==m.id){toast('This route belongs to an older Finance mission. Rebuild it.');return}
    if(!scoutingStrategyReady(state)){toast('Scouting is no longer approved. Re-approve the shortlist before Transfer approval.');return}
    if(String(r.strategy||'sustainable')!==scoutingStrategy(state)){
      toast(`Scouting is now ${scoutingStrategyLabel(state)}. Rebuild the route before approval.`);
      return;
    }
    const unresolved=arr(r.allocations).filter(a=>num(a.amount)>0&&accountCode(a.account)==='CHECK');
    if(unresolved.length){toast(`Assign a broker to ${unresolved.map(a=>a.ticker).join(', ')} before approval.`);return}

    const blocked=new Set(arr(state.scouting?.targets)
      .filter(t=>String(t.status||'').toLowerCase()==='block')
      .map(t=>ticker(t.ticker)));
    if(arr(r.allocations).some(a=>num(a.amount)>0&&blocked.has(ticker(a.ticker)))){
      toast('A blocked Scouting target is still allocated.');
      return;
    }

    const approved={
      ...r,...totals,
      baselineAnnualIncome:missionIncomeBaseline(state,r),
      baselinePortfolioValue:activeHoldings(state).reduce((sum,h)=>sum+holdingValue(h),0),
      baselineHoldings:activeHoldings(state).map(h=>({ticker:ticker(h.ticker),account:accountCode(h.account),shares:num(h.shares),livePriceGbp:num(h.livePriceGbp),marketValueGbp:holdingValue(h)})),
      status:'READY',locked:false,updatedAt:now()
    };
    A().core.update(s=>{
      const prepared=window.AuroraTransferMission.plan({...s.mission,status:'READY'},approved,now());
      const locked=window.AuroraTransferMission.lock(prepared.mission,prepared.route,now());
      return {
      ...s,
      transfer:{...s.transfer,route:locked.route,updatedAt:now()},
      mission:{...locked.mission,transferRouteId:approved.id},
      alerts:[
        {id:A().core.uid('ALERT'),title:'Transfer route approved',note:`${money(totals.allocated)} allocated • ${money(totals.remaining)} held back.`,when:'now'},
        ...arr(s.alerts).filter(a=>a?.title!=='Transfer route approved')
      ].slice(0,8)
    }});
    toast('Final route approved and locked.');
  }

  function unlockRoute(){
    const state=A().core.read(),r=state.transfer?.route;
    if(!r?.locked)return;
    if(arr(state.transfer?.registrationDrafts).some(d=>d.routeId===r.id&&d.status!=='DRAFT')){
      toast('Registration work exists for this route. Remove it before unlocking.');
      return;
    }
    A().core.update(s=>({
      ...s,
      transfer:{...s.transfer,route:{...s.transfer.route,status:'DRAFT',locked:false,updatedAt:now()},updatedAt:now()},
      mission:{...s.mission,status:'READY',executionStatus:'READY',updatedAt:now()}
    }));
    toast('Route unlocked. Finance budget is still unchanged.');
  }

  function setSettings(){
    const brokerScope=$('brokerScope')?.value||'both';
    const minAllocation=Math.max(25,num($('minAllocation')?.value)||250);
    const increment=Math.max(1,num($('allocationIncrement')?.value)||25);
    A().core.update(s=>{
      const previous={...(s.transfer?.settings||{})};
      delete previous.strategy;
      return {
        ...s,
        transfer:{
          ...s.transfer,
          settings:{...previous,brokerScope,minAllocation,increment},
          updatedAt:now()
        }
      };
    });
  }

  function copyInstructions(){
    const s=A().core.read(),r=s.transfer?.route;
    if(!r){toast('Build a route first.');return}
    const ig=arr(r.allocations).filter(a=>accountCode(a.account)==='IG').reduce((x,a)=>x+num(a.amount),0);
    const t212=arr(r.allocations).filter(a=>accountCode(a.account)==='T212').reduce((x,a)=>x+num(a.amount),0);
    const totals=routeSummary(r);
    const lines=arr(r.allocations).filter(a=>num(a.amount)>0).map(a=>`${accountLabel(a.account)}: ${a.ticker} ${money(a.amount)}`);
    const text=`Aurora FC 2.0 — Transfer Route\nFinance mission: ${r.missionId}\nBudget: ${money(r.financeBudget)}\nStrategy: ${r.strategy==='maximum'?'Maximum Income':'Sustainable Income'}\n\nIG ISA: ${money(ig)}\nTrading 212 ISA: ${money(t212)}\nKeep untransferred: ${money(totals.remaining)}\n\n${lines.join('\n')}`;
    navigator.clipboard?.writeText(text).then(()=>toast('Broker instructions copied.')).catch(()=>toast('Clipboard unavailable.'));
  }

  /* Chairman summary is intentionally read-only. Detailed rotation logic belongs to Club Control. */
  function chairmanHoldings(state){
    return arr(state.squad?.holdings).filter(h=>
      ['ACTIVE','LOCKED'].includes(String(h.status||'').toUpperCase())&&num(h.shares)>0
    );
  }
  function chairmanHoldingMetrics(h){
    const shares=Math.max(0,num(h.shares));
    const price=Math.max(0,num(h.livePriceGbp));
    const value=shares>0&&price>0?shares*price:Math.max(0,num(h.marketValueGbp));
    const book=Math.max(0,num(h.bookCostGbp));
    const dps=Math.max(0,num(h.annualDpsGbp));
    const income=shares>0&&dps>0?shares*dps:Math.max(0,num(h.annualIncomeGbp));
    const profit=value-book;
    const profitPct=book>0?profit/book*100:0;
    const locked=Boolean(h.locked)||String(h.status||'').toUpperCase()==='LOCKED';
    return {value,book,income,profit,profitPct,locked};
  }

  function chairmanOfferDetails(state,h,m){
    const shares=Math.max(0,num(h.shares));
    const averagePrice=shares>0?m.book/shares:0;
    const targetPrice=averagePrice*1.06;
    const livePrice=shares>0?m.value/shares:Math.max(0,num(h.livePriceGbp));
    const targetValue=shares*targetPrice;
    const targetProfit=Math.max(0,targetValue-m.book);
    const events=arr(state.income?.calendar)
      .filter(e=>ticker(e.ticker)===ticker(h.ticker))
      .filter(e=>{
        const account=accountCode(e.account);
        return account==='CHECK'||account===accountCode(h.account);
      })
      .filter(e=>!['CANCELLED','ARCHIVED','PAID'].includes(String(e.status||'').toUpperCase()))
      .filter(e=>{
        const date=new Date(e.exDate||e.ex_date||e.payDate||e.pay_date||'');
        return !Number.isNaN(date.getTime())&&date.getTime()>=Date.now()-86400000;
      })
      .sort((a,b)=>new Date(a.exDate||a.ex_date||a.payDate||a.pay_date)-new Date(b.exDate||b.ex_date||b.payDate||b.pay_date));
    const next=events[0]||null;
    const nextDate=next?(next.exDate||next.ex_date||next.payDate||next.pay_date):'';
    const expected=next?Math.max(0,num(next.expectedAmountGbp||next.expected_amount_gbp||next.grossDividendGbp||next.gross_dividend_gbp)):0;
    const dps=next?Math.max(0,num(next.dividendPerShareGbp||next.dividend_per_share_gbp)):0;
    const nextAmount=expected||(dps>0?shares*dps:0);
    return {shares,averagePrice,targetPrice,livePrice,targetValue,targetProfit,next,nextDate,nextAmount};
  }

  function chairmanMateriality(state,h,m){
    const rows=chairmanHoldings(state).map(x=>chairmanHoldingMetrics(x));
    const totalValue=rows.reduce((s,x)=>s+x.value,0);
    const totalIncome=rows.reduce((s,x)=>s+x.income,0);
    const valueFloor=Math.max(100,totalValue*.001);
    const profitFloor=Math.max(10,totalValue*.0002);
    const incomeFloor=Math.max(5,totalIncome*.005);
    const micro=m.value<valueFloor&&Math.abs(m.profit)<profitFloor&&m.income<incomeFloor;
    const priority=
      (Math.max(0,m.profitPct)*.25)+
      (Math.max(0,m.profit)/Math.max(1,profitFloor))*18+
      (Math.max(0,m.value)/Math.max(1,valueFloor))*4+
      (Math.max(0,m.income)/Math.max(1,incomeFloor))*5;
    return {micro,priority,valueFloor,profitFloor,incomeFloor,totalValue,totalIncome};
  }

  function renderChairman(state){
    const holdings=chairmanHoldings(state);
    const triggered=holdings
      .map(h=>{
        const m=chairmanHoldingMetrics(h);
        return {h,m,mat:chairmanMateriality(state,h,m)};
      })
      .filter(x=>!x.m.locked&&x.m.profitPct>=6)
      .sort((a,b)=>{
        if(a.mat.micro!==b.mat.micro)return a.mat.micro?1:-1;
        return b.mat.priority-a.mat.priority||b.m.profit-a.m.profit;
      });

    const meaningful=triggered.filter(x=>!x.mat.micro);
    const strong=meaningful.filter(x=>x.m.profitPct>=10);
    const micro=triggered.filter(x=>x.mat.micro);
    const incomeRisk=meaningful.reduce((s,x)=>s+x.m.income,0);
    const best=meaningful[0]||null;

    set('chairmanReviewCount',String(meaningful.length));
    set('chairmanStrongCount',String(strong.length));
    set('chairmanIncomeRisk',money(incomeRisk));
    set('chairmanBestTicker',best?ticker(best.h.ticker):meaningful.length?'—':'NO MATERIAL CASE');
    set('chairmanBestMeta',best
      ?`${best.m.profitPct>=0?'+':''}${best.m.profitPct.toFixed(1)}% • ${money(best.m.profit)} capital profit • ${money(best.m.income)}/yr income`
      :micro.length
        ?`${micro.length} percentage trigger${micro.length===1?' is':'s are'} currently micro-sized and muted.`
        :holdings.length?'No meaningful unlocked holding has reached +6% yet.':'No canonical Squad holdings loaded.'
    );
    set('chairmanQueueMeta',`${meaningful.length} meaningful • ${micro.length} micro trigger${micro.length===1?'':'s'}`);

    const badge=$('chairmanConnection');
    if(badge)badge.textContent=holdings.length?'SQUAD LIVE':'SQUAD EMPTY';

    const host=$('chairmanCaseList');
    if(!host)return;
    if(!triggered.length){
      host.innerHTML=`<div class="empty-state compact"><strong>${holdings.length?'No live Chairman trigger':'No Squad holdings connected'}</strong><p>${holdings.length?'No unlocked position is currently at +6% or above.':'Open Squad and load canonical holdings first.'}</p></div>`;
      return;
    }

    host.innerHTML=triggered.slice(0,8).map(({h,m,mat},i)=>{
      const o=chairmanOfferDetails(state,h,m);
      return `<article class="chairman-case-row ${m.profitPct>=10?'strong':''}">
        <header class="chairman-offer-header">
          <div><small>INCOMING OFFER • ${String(i+1).padStart(2,'0')}</small><strong>${esc(ticker(h.ticker))} — ${esc(h.name||ticker(h.ticker))}</strong><span>${esc(accountLabel(h.account))} • rival club enquiry</span></div>
          <span class="status-pill ${mat.micro?'caution':m.profitPct>=10?'pass':'caution'}">${mat.micro?'MICRO OFFER':m.profitPct>=10?'+10% STRONG':'+6% TARGET MET'}</span>
        </header>
        <div class="chairman-offer-price">
          <div><small>FIXED OFFER PRICE</small><strong>${money(o.livePrice)} <em>/ share</em></strong><span>${m.profitPct>=0?'+':''}${m.profitPct.toFixed(2)}% above average price</span></div>
          <b>${m.profit>=0?'+':''}${money(m.profit)}<small>profit above book cost</small></b>
        </div>
        <div class="chairman-offer-data">
          <div><small>Requested Shares</small><strong>${o.shares.toLocaleString('en-GB',{maximumFractionDigits:6})}</strong></div>
          <div><small>Average Price</small><strong>${money(o.averagePrice)}</strong></div>
          <div><small>6% Exit Target</small><strong>${money(o.targetPrice)}</strong></div>
          <div><small>Current Live Price</small><strong>${money(o.livePrice)}</strong></div>
          <div><small>Value at Target Exit</small><strong>${money(o.targetValue)}</strong></div>
          <div><small>Profit at 6% Target</small><strong>+${money(o.targetProfit)}</strong></div>
          <div><small>Current Offer Value</small><strong>${money(m.value)}</strong></div>
          <div><small>Annual Income at Stake</small><strong>${money(m.income)}</strong></div>
        </div>
        <div class="chairman-dividend-watch"><span>NEXT DIVIDEND</span><strong>${o.nextDate?new Date(`${o.nextDate}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'No upcoming event'}</strong><b>${o.nextAmount?money(o.nextAmount):'Income check required'}</b></div>
        <footer><span>Scenario only • offer unlocked at +6% • no automatic sale</span><a href="club-control.html#chairmanReviewBoardV11">Open Chairman Review →</a></footer>
      </article>`;
    }).join('');
  }

  function renderMission(state){
    const m=state.mission,b=validMission(m)?num(m.approvedBudget):0;
    const r=state.transfer?.route,totals=r?routeSummary(r):{allocated:0,remaining:b};
    const allocations=arr(r?.allocations).filter(a=>num(a.amount)>0);
    const complete=allocations.length>0&&allocations.every(a=>!!confirmedFor(state,r,a));
    const missionId=String(m?.id||'').trim();
    const payday=String(m?.paydayDate||'').trim();
    set('missionBudget',money(b));
    set('kFinanceBudget',money(b));
    set('handoffBudget',money(b));
    set('missionStatus',complete?'TRANSFER COMPLETE':m?.status||'NO ACTIVE MISSION');
    set('missionMeta',missionId
      ?`${missionId}${payday?' • payday '+payday:''}`
      :m?'Mission details are incomplete. Return to Finance to release a current mission.':'Release an investment mission from Finance first.');
    set('missionLock',m?'Finance-authorised budget is read-only in Transfer.':'Budget is locked to Finance.');
    set('missionPayday',payday||'Not provided');
    set('missionStrategy',scoutingStrategyLabel(state));
    set('missionAllocated',money(totals.allocated));
    set('missionRemaining',money(totals.remaining));
    set('handoffMissionId',missionId||'—');
    set('handoffPayday',payday||'—');
    set('handoffSafe',m?.financeSnapshot?.safeSurplus!=null?money(m.financeSnapshot.safeSurplus):'—');
    set('handoffCommitments',m?.financeSnapshot?.commitments!=null?money(m.financeSnapshot.commitments):'—');
    set('handoffState',validMission(m)?'LOADED':'WAITING');
  }

  function renderTargets(state){
    const sc=scouting(state),host=$('targetList');
    const strategy=scoutingStrategy(state);
    const rows=w.AuroraScoutingLeagues?.table(arr(sc.targets),strategy)||[];
    const targets=rows.map(row=>row.target);
    const allocations=arr(state.transfer?.route?.allocations);
    const decisions=arr(state.transfer?.route?.candidateDecisions);
    set('kTargets',targets.length);set('targetBoardCount',`${Math.min(targets.length,12)} / 12`);
    set('targetBoardStrategy',strategy==='maximum'?'Maximum Income':'Sustainable');
    const brokers=[...new Set(targets.map(t=>resolvedBrokerLabel(state,t)).filter(x=>x!=='Broker unresolved'))];
    set('targetBoardCoverage',brokers.length?brokers.join(' + '):'Needs assignment');
    set('scoutingState',sc.status||'NOT BUILT');set('targetSource',sc.source||'Awaiting Scouting 2.0');
    if(!host)return;
    if(!targets.length){host.innerHTML='<div class="empty-state compact"><strong>No approved targets yet</strong><p>Open Scouting, run the logic and approve a shortlist.</p></div>';return}
    const findAllocation=t=>allocations.find(a=>String(a.targetId||'')===String(t.id||'')||ticker(a.ticker)===ticker(t.ticker));
    const findDecision=t=>decisions.find(d=>String(d.securityId||'')===String(t.securityId||'')||ticker(d.ticker)===ticker(t.ticker));
    const broker=t=>{try{return String(A().transferEngine?.effectiveBroker?.(state,t)||accountCode(t.preferredAccount)).toUpperCase()}catch(_){return accountCode(t.preferredAccount)}};
    host.innerHTML=`<div class="football-table-scroll"><table class="football-table transfer-deal-table"><thead><tr><th>#</th><th>Target</th><th>League</th><th>Strategy score</th><th>Yield</th><th>Safety</th><th>Confidence</th><th>Broker</th><th>Executable</th><th>Allocation</th><th>Expected Income</th><th>Reason</th></tr></thead><tbody>${rows.map((row,i)=>{const t=row.target,a=findAllocation(t),d=findDecision(t),b=broker(t),executable=d?d.executable:String(t.status).toLowerCase()!=='block'&&b!=='CHECK',reason=d?.reason||(String(t.status).toLowerCase()==='block'?'SKIPPED — BLOCK status':state.transfer?.route?'EXECUTABLE — £0':'READY'),annual=w.AuroraScoutingLeagues.incomePerThousand(t),id=`deal-${esc(t.id||i)}`,reasons=arr(t.eligibilityReasons);return `<tr class="football-data-row" data-expand-deal="${id}" tabindex="0"><td><b>#${row.rank<Number.MAX_SAFE_INTEGER?row.rank:i+1}</b></td><td><strong>${esc(ticker(t.ticker))}</strong><small>${esc(t.name||t.ticker)}</small></td><td>${row.league?`<span class="league-badge league-badge--${row.league.id}">${row.league.name}</span>`:'—'}</td><td><b>${Math.round(row.score)}</b></td><td>${num(t.yieldPct)>0?num(t.yieldPct).toFixed(2)+'%':'—'}<small>${money(annual)}/£1k/yr</small></td><td>${Math.round(num(t.dividendSafety))}</td><td>${Math.round(num(t.confidence))}</td><td>${esc(resolvedBrokerLabel(state,t))}</td><td><span class="deal-executable ${executable?'yes':'no'}">${executable?'YES':'NO'}</span></td><td>${money(d?.allocation??a?.amount??0)}</td><td>${num(a?.expectedAnnualIncome)>0?money(a.expectedAnnualIncome)+'/yr':'—'}</td><td><span class="deal-state deal-state--${reason.toLowerCase().replaceAll(' ','-')}">${esc(reason)}</span></td></tr><tr class="football-detail-row" id="${id}" hidden><td colspan="12"><div class="transfer-row-detail-grid"><div><small>Exchange / country</small><strong>${esc(t.exchange||'—')} • ${esc(t.country||'—')}</strong></div><div><small>Sector</small><strong>${esc(t.sector||'—')}</strong></div><div><small>Supported price</small><strong>${num(t.livePriceGbp)>0?money(t.livePriceGbp):'—'}</strong></div><div><small>Evidence freshness</small><strong>${t.requiresRefresh?'Refresh required':esc(t.evidenceAsOf||t.updatedAt||'Stored evidence')}</strong></div><div><small>Dividend evidence</small><strong>${num(t.yieldPct)>0?num(t.yieldPct).toFixed(2)+'% supported forward yield':'No supported yield'}</strong></div><div><small>Broker eligibility</small><strong>${esc(resolvedBrokerLabel(state,t))}</strong></div><div class="wide"><small>League Rank → Strategy Score → Executable → Allocation → Reason</small><strong>${row.rank<Number.MAX_SAFE_INTEGER?row.rank:i+1} ${esc(ticker(t.ticker))} → ${Math.round(row.score)} → ${executable?'YES':'NO'} → ${money(d?.allocation??a?.amount??0)} → ${esc(reason)}</strong></div><div class="wide"><small>Blocking / caution reasons</small><strong>${esc(reasons.join(' • ')||t.reason||'No caution or blocking reason recorded.')}</strong></div></div></td></tr>`}).join('')}</tbody></table></div>`;
  }

  function renderSettings(state){
    const st={brokerScope:'both',minAllocation:250,increment:25,...(state.transfer?.settings||{})};
    const strategy=scoutingStrategy(state);
    const ready=scoutingStrategyReady(state);

    set('scoutingStrategyTitle',strategy==='maximum'?'Maximum Income':'Sustainable Income');
    set('scoutingStrategyBadge',ready?'APPROVED BY SCOUTING':'AWAITING APPROVAL');
    set('scoutingStrategyMeta',ready
      ?`Transfer will inherit ${strategy==='maximum'?'Maximum Income':'Sustainable Income'} automatically from the approved Scouting shortlist.`
      :`Scouting is ${String(state.scouting?.status||'SCOUTING_REVIEW').replace(/_/g,' ')}. Approve the shortlist before Transfer can deploy this strategy.`
    );

    const inherited=$('scoutingStrategyCard');
    if(inherited){
      inherited.classList.toggle('active',ready);
      inherited.classList.toggle('strategy-waiting',!ready);
    }

    setValue('brokerScope',st.brokerScope);
    setValue('minAllocation',st.minAllocation);
    setValue('allocationIncrement',st.increment);
    set('routeStrategyReadout',ready
      ?`${strategy==='maximum'?'Maximum Income':'Sustainable Income'} • inherited`
      :`${strategy==='maximum'?'Maximum Income':'Sustainable Income'} • not approved`
    );
    set('routeBrokerReadout',st.brokerScope==='both'?'Both brokers':accountLabel(st.brokerScope));
    set('routeMinimumReadout',money(st.minAllocation));
    set('routeIncrementReadout',money(st.increment));
  }

  function renderRoute(state){
    const r=state.transfer?.route,host=$('routeList'),budget=routeBudget(state);
    const approve=$('approveRoute'),unlock=$('unlockRoute');

    if(!r){
      set('kAllocated',money(0));
      set('kHoldback',money(budget));
      set('kIncome',money(0));
      set('routeStatus','NO ROUTE');
      set('brokerIg',money(0));
      set('brokerT212',money(0));
      set('brokerUnassigned',money(0));
      set('brokerHold',money(budget));
      if($('routeProgress'))$('routeProgress').style.width='0%';
      if(host)host.innerHTML='<div class="empty-state compact"><strong>No transfer route yet</strong><p>Choose the strategy and auto-build the deal sheet.</p></div>';
      if(approve)approve.disabled=true;
      if(unlock)unlock.hidden=true;
      const guard=$('routeGuard');
      if(guard){
        guard.className='notice';
        guard.textContent=w.Aurora2?.transferEngine?.routeGuardMessage?.(state)||
          'Waiting for a Finance mission and a Scouting-approved shortlist.';
      }
      return;
    }

    const totals=routeSummary(r);
    const ig=arr(r.allocations).filter(a=>accountCode(a.account)==='IG').reduce((s,a)=>s+num(a.amount),0);
    const t212=arr(r.allocations).filter(a=>accountCode(a.account)==='T212').reduce((s,a)=>s+num(a.amount),0);
    const unresolved=arr(r.allocations).filter(a=>accountCode(a.account)==='CHECK').reduce((s,a)=>s+num(a.amount),0);

    set('kAllocated',money(totals.allocated));
    set('kHoldback',money(totals.remaining));
    set('kIncome',money(totals.income));
    set('routeStatus',r.status);
    set('brokerIg',money(ig));
    set('brokerT212',money(t212));
    set('brokerUnassigned',money(unresolved));
    set('brokerHold',money(totals.remaining));
    if($('routeProgress'))$('routeProgress').style.width=`${budget>0?Math.min(100,totals.allocated/budget*100):0}%`;

    if(host)host.innerHTML=arr(r.allocations).map(a=>`
      <article class="route-row">
        <div class="route-main">
          <strong>${esc(ticker(a.ticker))} — ${esc(a.name||ticker(a.ticker))}</strong>
          <span>${accountLabel(a.account)} • ${num(a.yieldPct)>0?num(a.yieldPct).toFixed(2)+'% yield • ':''}${money(a.expectedAnnualIncome)}/yr projected • ${esc(a.reason||'Transfer allocation')}</span>
        </div>
        <div class="route-side">
          ${r.locked
            ?`<strong>${money(a.amount)}</strong><span>${accountLabel(a.account)} • LOCKED</span>`
            :`<div class="route-edit-stack">
                <select class="route-account" data-route-account="${esc(a.id)}">
                  <option value="CHECK" ${accountCode(a.account)==='CHECK'?'selected':''}>Choose broker</option>
                  <option value="IG" ${accountCode(a.account)==='IG'?'selected':''}>IG ISA</option>
                  <option value="T212" ${accountCode(a.account)==='T212'?'selected':''}>Trading 212 ISA</option>
                </select>
                <input class="route-input" data-route-amount="${esc(a.id)}" type="number" min="0" step="${r.increment}" value="${num(a.amount).toFixed(2)}">
              </div><span>${accountCode(a.account)==='CHECK'?'BROKER REQUIRED':'editable route'}</span>`
          }
        </div>
      </article>
    `).join('');

    const inheritedStrategy=scoutingStrategy(state);
    const strategyMatches=String(r.strategy||'sustainable')===inheritedStrategy;
    const scoutingReady=scoutingStrategyReady(state);
    const valid=totals.allocated>0&&totals.allocated<=budget+.005&&unresolved<=.005&&
      r.missionId===state.mission?.id&&strategyMatches&&scoutingReady;
    if(approve)approve.disabled=!valid||r.locked;
    if(unlock)unlock.hidden=!r.locked;

    const guard=$('routeGuard');
    if(guard){
      if(totals.allocated>budget+.005){
        guard.className='notice red';
        guard.textContent=`Blocked: route exceeds Finance by ${money(totals.allocated-budget)}.`;
      }else if(!scoutingReady){
        guard.className='notice';
        guard.textContent='Blocked: Scouting is no longer approved. Approve the current shortlist before Transfer can approve this route.';
      }else if(!strategyMatches){
        guard.className='notice red';
        guard.textContent=`Blocked: this draft used ${String(r.strategy||'sustainable')==='maximum'?'Maximum Income':'Sustainable Income'}, but Scouting now owns ${scoutingStrategyLabel(state)}. Rebuild the route.`;
      }else if(unresolved>.005){
        guard.className='notice red';
        guard.textContent=`Blocked: ${money(unresolved)} is allocated to target(s) with no broker assigned. Choose IG or Trading 212 in the deal sheet.`;
      }else{
        guard.className='notice good';
        guard.textContent=`${money(totals.allocated)} allocated from the locked ${money(budget)} mission • ${money(totals.remaining)} held back • ${scoutingStrategyLabel(state)} inherited from Scouting.`;
      }
    }
  }

  function renderRegistration(state){
    const r=state.transfer?.route,m=state.mission,drafts=arr(state.transfer?.registrationDrafts);
    const positive=arr(r?.allocations).filter(a=>num(a.amount)>0);
    const confirmed=drafts.filter(d=>d.routeId===r?.id&&d.status==='CONFIRMED');

    set('registrationRouteId',r?.id||'—');
    set('registrationMissionId',m?.id||'—');
    set('registrationAllocations',String(positive.length));
    set('registrationConfirmed',String(confirmed.length));
    set('registrationHandoffState',r?.locked?'READY':'WAITING');

    const host=$('registrationDraftList');
    if(!host)return;
    const rows=drafts.filter(d=>!r?.id||d.routeId===r.id);
    if(!rows.length){
      host.innerHTML='<div class="empty-state compact"><strong>No registration work yet</strong><p>Open Registration after the final Transfer route is approved.</p></div>';
      return;
    }
    host.innerHTML=rows.map(d=>`
      <article class="draft-row">
        <div class="draft-main">
          <strong>${esc(ticker(d.ticker))} • ${esc(d.account)} • ${money(d.totalCostGbp)}</strong>
          <span>${esc(d.transactionId||'draft')} • ${esc(d.tradeDate||'date pending')} • ${Number(d.shares||0).toLocaleString('en-GB')} shares • ${esc(d.status)}</span>
        </div>
        <span class="status-pill ${d.status==='CONFIRMED'?'pass':d.status==='BACKEND_ERROR'?'block':'caution'}">${esc(d.status)}</span>
      </article>
    `).join('');
  }

  function render(){
    const state=A().core.read();
    renderTicker(state);
    renderImpact(state);
    renderMission(state);
    renderTargets(state);
    renderSettings(state);
    renderRoute(state);
    renderRegistration(state);
    renderChairman(state);
    set('lastUpdated',new Date(state.updatedAt).toLocaleString('en-GB'));
  }

  function tabs(){
    document.querySelectorAll('.tab[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
      document.querySelectorAll('.tab[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===btn.dataset.tab));
    }));
    $('openAllocation')?.addEventListener('click',()=>{
      setSettings();
      autoRoute();
      $('allocationReview')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
  }

  function wire(){
    tabs();
    document.addEventListener('click',e=>{
      const row=e.target.closest('[data-expand-deal]');
      if(!row)return;
      const detail=document.getElementById(row.dataset.expandDeal);
      if(detail){detail.hidden=!detail.hidden;row.setAttribute('aria-expanded',String(!detail.hidden))}
    });
    ['brokerScope','minAllocation','allocationIncrement'].forEach(id=>$(id)?.addEventListener('change',()=>{setSettings();render()}));
    $('autoBuildRoute')?.addEventListener('click',()=>{setSettings();autoRoute()});
    $('resetRoute')?.addEventListener('click',resetRoute);
    $('approveRoute')?.addEventListener('click',approveRoute);
    $('unlockRoute')?.addEventListener('click',unlockRoute);
    $('copyBrokerInstructions')?.addEventListener('click',copyInstructions);
    document.addEventListener('change',e=>{
      const check=e.target.closest('[data-execution-check]');
      if(check){
        const id=check.dataset.executionCheck;
        A().core.update(s=>({...s,transfer:{...s.transfer,executionChecks:{...(s.transfer?.executionChecks||{}),[id]:check.checked},updatedAt:now()}}));
        return;
      }
      const input=e.target.closest('[data-route-amount]');
      if(input){updateRouteAmount(input.dataset.routeAmount,input.value);return}
      const account=e.target.closest('[data-route-account]');
      if(account)updateRouteAccount(account.dataset.routeAccount,account.value);
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{wire();render()});
  w.addEventListener('aurora2:state',render);

  w.Aurora2=w.Aurora2||{};
  w.Aurora2.transferEngine={
    ...(w.Aurora2.transferEngine||{}),
    routeSummary,
    chairmanHoldingMetrics,
    chairmanMateriality,
    scoutingStrategy,
    portfolioPreview
  };
})(window);
