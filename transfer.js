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
    return a==='IG'?'IG ISA':a==='T212'?'Trading 212 ISA':'Broker to assign';
  }
  function mission(state=A().core.read()){return state.mission||null}
  function scouting(state=A().core.read()){return state.scouting||{status:'SCOUTING_REVIEW',targets:[]}}
  function validMission(m){
    if(!m||num(m.approvedBudget)<=0)return false;
    return !['CANCELLED','COMPLETED','ARCHIVED'].includes(String(m.status||'').toUpperCase());
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

  function targetScore(t,strategy){
    let base;
    if(strategy==='maximum'){
      base=num(t.maximumScore)>0?num(t.maximumScore):Math.min(100,Math.max(0,num(t.yieldPct))*10);
    }else{
      base=num(t.sustainableScore)>0?num(t.sustainableScore):Math.max(1,num(t.confidence)||(100-Math.max(1,num(t.rank))*5));
    }
    if(String(t.status||'').toLowerCase()==='caution')base*=.82;
    if(String(t.status||'').toLowerCase()==='block')return 0;
    return base;
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
    const state=A().core.read(),m=mission(state),sc=scouting(state);
    const settings={brokerScope:'both',minAllocation:250,increment:25,...(state.transfer?.settings||{})};
    const inheritedStrategy=scoutingStrategy(state);
    if(!validMission(m)){toast('Release a Finance mission first.');return}
    if(sc.status!=='SCOUTING_READY'){toast('Transfer needs a current Scouting-approved shortlist first.');return}
    const engine=A().transferEngine;
    if(!engine?.simulate){toast('Transfer simulation engine is unavailable. Reload the page.');return}

    const sim=engine.simulate(state,{
      budget:routeBudget(state),
      strategy:inheritedStrategy,
      brokerScope:settings.brokerScope,
      minAllocation:settings.minAllocation,
      increment:settings.increment,
      maxTargets:8,
      idFactory:p=>A().core.uid(p)
    });
    if(!sim.allocations.length){toast('No permitted targets match this broker route.');return}

    const previous=state.transfer?.route;
    const route={
      ...sim,
      id:previous?.missionId===m.id?previous.id:A().core.uid('ROUTE'),
      missionId:m.id,
      scoutingStrategy:inheritedStrategy,
      scoutingStatusAtBuild:sc.status,
      status:'DRAFT',
      locked:false,
      createdAt:previous?.missionId===m.id?previous.createdAt:now(),
      updatedAt:now()
    };
    A().core.update(s=>({...s,transfer:{...s.transfer,route,updatedAt:now()}}));
    toast('Draft transfer route built.');
  }

  function updateRouteAmount(id,value){
    const amount=Math.max(0,num(value));
    A().core.update(s=>{
      const r=s.transfer?.route;
      if(!r||r.locked)return s;
      const allocations=arr(r.allocations).map(a=>a.id===id?{
        ...a,amount,expectedAnnualIncome:amount*(num(a.yieldPct)/100)
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

    const approved={...r,...totals,status:'TRANSFER_READY',locked:true,updatedAt:now()};
    A().core.update(s=>({
      ...s,
      transfer:{...s.transfer,route:approved,updatedAt:now()},
      mission:{...s.mission,status:'TRANSFER_READY',transferRouteId:approved.id,updatedAt:now()},
      alerts:[
        {id:A().core.uid('ALERT'),title:'Transfer route approved',note:`${money(totals.allocated)} allocated • ${money(totals.remaining)} held back.`,when:'now'},
        ...arr(s.alerts).filter(a=>a?.title!=='Transfer route approved')
      ].slice(0,8)
    }));
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
      mission:{...s.mission,status:'SCOUTING_READY',updatedAt:now()}
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

    host.innerHTML=triggered.slice(0,8).map(({h,m,mat})=>`
      <article class="chairman-case-row">
        <div class="chairman-case-main">
          <strong>${esc(ticker(h.ticker))} — ${esc(h.name||ticker(h.ticker))}</strong>
          <span>${esc(accountLabel(h.account))} • ${money(m.value)} current value • ${money(m.income)}/yr dividend income${mat.micro?' • MICRO POSITION':''}</span>
        </div>
        <div class="chairman-case-side">
          <span class="status-pill ${mat.micro?'caution':m.profitPct>=10?'pass':'caution'}">${mat.micro?'MICRO POSITION':m.profitPct>=10?'+10% STRONG':'+6% REVIEW'}</span>
          <strong>${m.profitPct>=0?'+':''}${m.profitPct.toFixed(1)}%</strong>
          <span>${m.profit>=0?'+':''}${money(m.profit)} capital P/L</span>
        </div>
      </article>
    `).join('');
  }

  function renderMission(state){
    const m=state.mission,b=validMission(m)?num(m.approvedBudget):0;
    set('missionBudget',money(b));
    set('kFinanceBudget',money(b));
    set('handoffBudget',money(b));
    set('missionStatus',m?.status||'NO ACTIVE MISSION');
    set('missionMeta',m?`${m.id}${m.paydayDate?' • payday '+m.paydayDate:''}`:'Release an investment mission from Finance first.');
    set('missionLock',m?'Finance-authorised budget is read-only in Transfer.':'Budget is locked to Finance.');
    set('handoffMissionId',m?.id||'—');
    set('handoffPayday',m?.paydayDate||'—');
    set('handoffSafe',m?.financeSnapshot?.safeSurplus!=null?money(m.financeSnapshot.safeSurplus):'—');
    set('handoffCommitments',m?.financeSnapshot?.commitments!=null?money(m.financeSnapshot.commitments):'—');
    set('handoffState',validMission(m)?'LOADED':'WAITING');
  }

  function renderTargets(state){
    const sc=scouting(state),targets=arr(sc.targets),host=$('targetList');
    set('kTargets',targets.length);
    set('scoutingState',sc.status||'NOT BUILT');
    set('targetSource',sc.source||'Awaiting Scouting 2.0');
    if(!host)return;
    if(!targets.length){
      host.innerHTML='<div class="empty-state compact"><strong>No approved targets yet</strong><p>Open Scouting, run the logic and approve a shortlist.</p></div>';
      return;
    }
    host.innerHTML=targets.map((t,i)=>`
      <article class="target-row">
        <div class="target-main">
          <strong>#${t.rank||i+1} • ${esc(ticker(t.ticker))} — ${esc(t.name||ticker(t.ticker))}</strong>
          <span>${esc(t.reason||'Approved Scouting target')} • ${accountLabel(t.preferredAccount)}</span>
        </div>
        <div class="target-side">
          <span class="status-pill ${esc(String(t.status||'caution').toLowerCase())}">${esc(t.recommendation||t.status||'WATCH')}</span>
          <strong>${num(t.yieldPct)>0?num(t.yieldPct).toFixed(2)+'%':'—'}</strong>
          <span>S ${Math.round(num(t.sustainableScore))}/100 • M ${Math.round(num(t.maximumScore))}/100</span>
        </div>
      </article>
    `).join('');
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
      if(guard){guard.className='notice';guard.textContent='Waiting for a Finance mission and a Scouting-approved shortlist.'}
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
    $('openAllocation')?.addEventListener('click',()=>document.querySelector('[data-tab="allocationPanel"]')?.click());
  }

  function wire(){
    tabs();
    ['brokerScope','minAllocation','allocationIncrement'].forEach(id=>$(id)?.addEventListener('change',()=>{setSettings();render()}));
    $('autoBuildRoute')?.addEventListener('click',()=>{setSettings();autoRoute()});
    $('resetRoute')?.addEventListener('click',resetRoute);
    $('approveRoute')?.addEventListener('click',approveRoute);
    $('unlockRoute')?.addEventListener('click',unlockRoute);
    $('copyBrokerInstructions')?.addEventListener('click',copyInstructions);
    document.addEventListener('change',e=>{
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
    targetScore,
    chairmanHoldingMetrics,
    chairmanMateriality,
    scoutingStrategy
  };
})(window);
