(function(){
'use strict';
function gbp(v){
    return Number.isFinite(Number(v))
      ? new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2}).format(Number(v))
      : '—';
  }
  function pct(v){return Number.isFinite(Number(v))?`${Number(v).toFixed(2)}%`:'—'}
  function setText(id,value){const el=document.getElementById(id);if(el)el.textContent=value??'—'}
  function activeHoldings(s){return (s.squad?.holdings||[]).filter(h=>h.status==='ACTIVE'&&Number(h.shares)>0)}
  function renderHq(){
    const A=window.Aurora2;
    if(!A?.core?.read)return;
    const s=A.core.read();
    const holdings=activeHoldings(s);
    const book=holdings.reduce((n,h)=>n+(Number(h.bookCostGbp)||0),0);
    const market=holdings.reduce((n,h)=>n+(Number(h.marketValueGbp)||0),0);
    const pl=holdings.reduce((n,h)=>n+(Number(h.profitLossGbp)||0),0);
    const annual=Number(s.portfolio?.annualIncome)||holdings.reduce((n,h)=>n+(Number(h.annualIncomeGbp)||0),0);
    const monthly=Number(s.portfolio?.monthlyIncome)||annual/12;
    const yoc=book>0?annual/book*100:0;
    const positions=holdings.length;
    const unique=new Set(holdings.map(h=>h.ticker)).size;
    const mission=s.mission||{};
    const route=s.transfer?.route;
    const drafts=s.transfer?.registrationDrafts||[];
    const receipts=s.registration?.receipts||[];
    const confirmedDrafts=drafts.filter(d=>String(d.status).toUpperCase()==='CONFIRMED').length;
    const strategy=String(route?.strategy||s.transfer?.settings?.strategy||s.scouting?.strategy||'—').toUpperCase();
    const status=String(s.connection?.status||'LOCAL').toUpperCase();
    const regStatus=String(s.registration?.backend?.status||'NOT_CONNECTED').toUpperCase();
    const incomeStatus=String(s.income?.backend?.status||'LOCAL').toUpperCase();

    setText('hqTeamValue',gbp(Number(s.portfolio?.teamValue)||market));
    setText('hqTeamValueMeta',`${unique||Number(s.portfolio?.squadSize)||0} players • ${positions} positions`);
    setText('hqAnnualIncome',gbp(annual));
    setText('hqMonthlyIncome',`${gbp(monthly)} / month`);
    setText('hqProfitLoss',gbp(pl));
    setText('hqBookCost',`Book cost ${gbp(book)}`);
    setText('hqYieldOnCost',pct(yoc));
    setText('hqSquadSize',String(Number(s.portfolio?.squadSize)||unique||0));
    setText('hqPositionMeta',`${positions} active positions`);
    setText('hqStrategyBadge',`Strategy • ${strategy}`);
    setText('hqTransferStrategy',`Strategy • ${strategy}`);

    const nd=s.income?.nextDividend;
    setText('hqNextDividend',nd?.ticker||'—');
    setText('hqNextDividendMeta',nd?`${gbp(nd.amount)} • ${nd.date||'date pending'}`:'Income calendar pending');
    setText('hqIncomeNext',nd?.ticker||'—');
    setText('hqIncomeNextMeta',nd?`${gbp(nd.amount)} • ${nd.date||'date pending'} • ${nd.account||''}`:'Calendar pending');

    setText('hqDecisionTitle',s.decision?.title||'No decision');
    setText('hqDecisionNote',s.decision?.note||'No current manager decision.');

    const missionBudget=Number(mission.approvedBudget)||Number(route?.financeBudget)||0;
    setText('hqMissionBudget',missionBudget?gbp(missionBudget):'No active mission');
    setText('hqMissionBadge',`Mission • ${missionBudget?gbp(missionBudget):'none'}`);

    const stages=['FINANCE_APPROVED','SCOUTING_READY','TRANSFER_READY','REGISTERED'];
    const current=String(mission.status||'');
    const currentIndex=stages.indexOf(current);
    document.querySelectorAll('[data-hq-stage]').forEach((el,i)=>{
      el.classList.remove('complete','active');
      if(currentIndex>i)el.classList.add('complete');
      else if(currentIndex===i)el.classList.add('active');
    });

    setText('hqRouteStatus',route?.status||'—');
    setText('hqRouteMeta',route?`${route.allocations?.length||0} allocations • ${route.locked?'locked':'editable'}`:'No transfer route');
    setText('hqAllocatedRemaining',route?`${gbp(route.allocated)} / ${gbp(route.remaining)} left`:'—');
    setText('hqRegistrationProgress',route?`${confirmedDrafts}/${drafts.length||route.allocations?.length||0} confirmed`:`${receipts.length} receipts`);

    const p=s.finance?.plan||{};
    setText('hqPaydayTag',`Payday • ${p.paydayDate||'not set'}`);
    setText('hqNetPay',gbp(Number(p.netPay)||Number(p.wagesReceived)||Number(p.expectedWages)||0));
    setText('hqBillsPots',gbp((Number(p.billsDue)||0)+(Number(p.potsDue)||0)));
    setText('hqProtectedCash',gbp(Number(p.protectedCash)||0));
    setText('hqReleaseAmount',gbp(Number(p.releaseAmount)||0));

    const routeHost=document.getElementById('hqRouteList');
    if(routeHost){
      const allocs=(route?.allocations||[]).slice(0,5);
      routeHost.innerHTML=allocs.length?allocs.map(a=>`
        <div class="route-row">
          <div class="route-ticker">${String(a.ticker||'—')}</div>
          <div class="route-copy"><b>${String(a.name||a.ticker||'Target')}</b><span>${String(a.account||'CHECK')} • ${Number(a.yieldPct||0).toFixed(2)}% yield</span></div>
          <div class="route-money"><strong>${gbp(a.amount)}</strong><span>+${gbp(a.expectedAnnualIncome)}/yr</span></div>
        </div>`).join(''):'<div class="empty-line">No locked transfer route yet.</div>';
    }

    const best=s.portfolio?.bestDividendPlayer;
    setText('hqBestDividend',best?.ticker||'—');
    setText('hqBestDividendMeta',best?.annualIncome!=null?`${gbp(best.annualIncome)} / year`:'Awaiting Income');
    const top=s.portfolio?.topAuroraPlayer;
    setText('hqTopAurora',top?.ticker||'—');
    setText('hqTopAuroraMeta',top?.score!=null?`${top.score}/100 Aurora score`:'Awaiting Scouting');
    const profitLeader=[...holdings].sort((a,b)=>(Number(b.profitLossGbp)||0)-(Number(a.profitLossGbp)||0))[0];
    setText('hqProfitLeader',profitLeader?.ticker||'—');
    setText('hqProfitLeaderMeta',profitLeader?`${gbp(profitLeader.profitLossGbp)} P/L • ${profitLeader.account}`:'Canonical squad');

    const target=Number(s.income?.settings?.monthlyTarget)||0;
    setText('hqIncomeMonthly',gbp(monthly));
    setText('hqIncomeTarget',target?gbp(target):'Not set');
    const prog=target>0?Math.max(0,Math.min(100,monthly/target*100)):0;
    const progEl=document.getElementById('hqIncomeProgress');if(progEl)progEl.style.width=`${prog}%`;
    setText('hqIncomeProgressText',target>0?`${prog.toFixed(1)}%`:'Target not set');

    setText('gConnectionValue',status);
    setText('gRegistrationValue',regStatus);
    setText('gIncomeValue',incomeStatus);
    const goodish=x=>['LIVE','CONNECTED','OK','READY'].includes(String(x).toUpperCase());
    document.getElementById('gConnection')?.classList.add(goodish(status)?'good':'watch');
    document.getElementById('gRegistration')?.classList.add(goodish(regStatus)?'good':'watch');
    document.getElementById('gIncome')?.classList.add(goodish(incomeStatus)?'good':'watch');
    const ageMs=Date.now()-new Date(s.updatedAt||0).getTime();
    const ageMin=Number.isFinite(ageMs)?Math.max(0,Math.floor(ageMs/60000)):0;
    setText('gFreshnessValue',ageMin<2?'NOW':ageMin<60?`${ageMin} MIN`:`${Math.floor(ageMin/60)} HR`);
    setText('gFreshnessMeta',s.updatedAt?new Date(s.updatedAt).toLocaleString('en-GB'):'No timestamp');
    document.getElementById('gFreshness')?.classList.add(ageMin<60?'good':'watch');
    const guardianOkay=goodish(status)&&goodish(regStatus);
    setText('hqGuardianTag',guardianOkay?'Systems healthy':'Review status');
    const connBadge=document.getElementById('hqConnectionBadge');
    if(connBadge)connBadge.textContent=goodish(status)?'● Club systems live':'● Local / review';

    const activityHost=document.getElementById('hqActivity');
    if(activityHost){
      const rows=[];
      (s.alerts||[]).slice(0,3).forEach(a=>rows.push({title:a.title||'Aurora alert',note:a.note||'',when:a.when||''}));
      const lastReceipt=[...receipts].sort((a,b)=>new Date(b.confirmedAt||0)-new Date(a.confirmedAt||0))[0];
      if(lastReceipt)rows.push({title:`${lastReceipt.ticker||'Trade'} registered`,note:`${lastReceipt.account||''} • ${gbp(lastReceipt.totalCostGbp)}`,when:'confirmed'});
      rows.push({title:'Aurora 2.0 state loaded',note:`${unique} players • ${positions} active positions`,when:'now'});
      activityHost.innerHTML=rows.slice(0,5).map(r=>`
        <div class="activity-row"><i class="activity-dot"></i><div><b>${String(r.title)}</b><span>${String(r.note)}</span></div><time>${String(r.when)}</time></div>`).join('');
    }
  }
document.addEventListener('DOMContentLoaded',renderHq);
window.addEventListener('aurora2:state',renderHq);
})();
