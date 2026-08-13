
(function(w){
'use strict';

const A=()=>w.Aurora2;
const $=id=>document.getElementById(id);
const text=(id,v)=>{const el=$(id);if(el)el.textContent=v??'—'};
const money=v=>Number.isFinite(Number(v))
  ? new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v))
  : '—';
const pct=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(2)}%`:'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function activeHoldings(s){
  return (s.squad?.holdings||[]).filter(h=>String(h.status||'').toUpperCase()==='ACTIVE' && Number(h.shares)>0);
}
function stageLabel(status){
  return ({
    FINANCE_APPROVED:'Finance',
    SCOUTING_READY:'Scouting',
    TRANSFER_READY:'Transfer',
    REGISTERED:'Registered'
  })[String(status||'')]||'No mission';
}
function goodStatus(v){
  return ['LIVE','CONNECTED','READY','OK','HEALTHY'].includes(String(v||'').toUpperCase());
}

function render(){
  const app=A();
  if(!app?.core?.read)return;
  const s=app.core.read();
  const holdings=activeHoldings(s);

  const market=holdings.reduce((n,h)=>n+(Number(h.marketValueGbp)||0),0);
  const book=holdings.reduce((n,h)=>n+(Number(h.bookCostGbp)||0),0);
  const pl=holdings.reduce((n,h)=>n+(Number(h.profitLossGbp)||0),0);
  const annual=Number(s.portfolio?.annualIncome)||holdings.reduce((n,h)=>n+(Number(h.annualIncomeGbp)||0),0);
  const monthly=Number(s.portfolio?.monthlyIncome)||annual/12;
  const yoc=book>0?annual/book*100:0;
  const uniqueTickers=new Set(holdings.map(h=>String(h.ticker||'').toUpperCase()).filter(Boolean));
  const squadSize=Number(s.portfolio?.squadSize)||uniqueTickers.size;

  text('hqTeamValue',money(Number(s.portfolio?.teamValue)||market));
  text('hqTeamValueMeta',`${squadSize} players • ${holdings.length} positions`);
  text('hqAnnualIncome',money(annual));
  text('hqMonthlyIncome',`${money(monthly)} / month`);
  text('hqProfitLoss',money(pl));
  text('hqBookCost',`Book cost ${money(book)}`);
  text('hqYieldOnCost',pct(yoc));
  text('hqSquadSize',String(squadSize||'—'));
  text('hqPositionMeta',`${holdings.length} active positions`);

  const connection=String(s.connection?.status||'LOCAL').toUpperCase();
  const strategy=String(s.transfer?.route?.strategy||s.transfer?.settings?.strategy||s.scouting?.strategy||'—').toUpperCase();
  text('hqConnectionBadge',goodStatus(connection)?'● Club systems live':'● Local / review');
  text('hqStrategyBadge',`Strategy • ${strategy}`);

  const nd=s.income?.nextDividend;
  text('hqNextDividend',nd?.ticker||'—');
  text('hqNextDividendMeta',nd?`${money(nd.amount)} • ${nd.date||'date pending'}`:'Income calendar pending');

  text('hqDecisionTitle',s.decision?.title||'No current decision');
  text('hqDecisionNote',s.decision?.note||'No manager action has been generated.');

  const mission=s.mission||{};
  const route=s.transfer?.route;
  const missionBudget=Number(mission.approvedBudget)||Number(route?.financeBudget)||0;
  text('hqMissionBadge',`Mission • ${missionBudget?money(missionBudget):'none'}`);
  text('hqMissionBudget',missionBudget?money(missionBudget):'No active mission');
  text('hqBriefBudget',missionBudget?money(missionBudget):'—');
  text('hqBriefStage',stageLabel(mission.status));
  text('hqRouteStatus',route?.status||'—');

  const stages=['FINANCE_APPROVED','SCOUTING_READY','TRANSFER_READY','REGISTERED'];
  const currentIndex=stages.indexOf(String(mission.status||''));
  document.querySelectorAll('[data-hq-stage]').forEach((el,i)=>{
    el.classList.remove('complete','active');
    if(currentIndex>i)el.classList.add('complete');
    else if(currentIndex===i)el.classList.add('active');
  });

  text('hqAllocated',route?money(route.allocated):'—');
  text('hqRemaining',route?money(route.remaining):'—');
  text('hqExpectedIncome',route?`${money(route.expectedAnnualIncome)} / yr`:'—');

  const drafts=s.transfer?.registrationDrafts||[];
  const confirmed=drafts.filter(d=>String(d.status||'').toUpperCase()==='CONFIRMED').length;
  const routeCount=route?.allocations?.length||0;
  text('hqRegistrationProgress',`${confirmed}/${drafts.length||routeCount||0} confirmed`);

  const p=s.finance?.plan||{};
  text('hqPaydayTag',`Payday • ${p.paydayDate||'not set'}`);
  text('hqReleaseAmount',money(Number(p.releaseAmount)||0));
  text('hqNetPay',money(Number(p.netPay)||Number(p.wagesReceived)||Number(p.expectedWages)||0));
  text('hqBillsDue',money(Number(p.billsDue)||0));
  text('hqPotsDue',money(Number(p.potsDue)||0));
  text('hqProtectedCash',money(Number(p.protectedCash)||0));
  const financeNote=[];
  if(Number(p.releaseAmount)>0)financeNote.push(`${money(p.releaseAmount)} is currently released for investment.`);
  if(Number(p.wageDifference))financeNote.push(`Wage difference ${money(p.wageDifference)}.`);
  text('hqFinanceNote',financeNote.join(' ')||'Finance owns the cash decision. Nexus only reports it.');

  text('hqTransferStrategy',strategy);
  text('hqRouteMeta',route?`${route.allocations?.length||0} targets • ${route.locked?'locked':'editable'}`:'No route');
  const routeHost=$('hqRouteList');
  if(routeHost){
    const allocs=(route?.allocations||[]).slice(0,5);
    routeHost.innerHTML=allocs.length?allocs.map(a=>`
      <div class="route-row">
        <div class="route-badge">${esc(a.ticker||'—')}</div>
        <div class="route-copy"><b>${esc(a.name||a.ticker||'Target')}</b><span>${esc(a.account||'CHECK')} • ${Number(a.yieldPct||0).toFixed(2)}% yield</span></div>
        <div class="route-money"><strong>${money(a.amount)}</strong><span>+${money(a.expectedAnnualIncome)}/yr</span></div>
      </div>`).join(''):'<div class="empty-state">No transfer route has been locked.</div>';
  }

  // Squad account split.
  const groups={};
  holdings.forEach(h=>{
    const key=String(h.account||'ACCOUNT').trim()||'ACCOUNT';
    groups[key]=groups[key]||{value:0,income:0,count:0};
    groups[key].value+=Number(h.marketValueGbp)||0;
    groups[key].income+=Number(h.annualIncomeGbp)||0;
    groups[key].count+=1;
  });
  const accountHost=$('hqAccountStrip');
  if(accountHost){
    const rows=Object.entries(groups).sort((a,b)=>b[1].value-a[1].value).slice(0,3);
    accountHost.innerHTML=rows.length?rows.map(([name,g])=>`
      <div class="account-card"><small>${esc(name)}</small><strong>${money(g.value)}</strong><span>${g.count} positions • ${money(g.income)}/yr</span></div>`).join(''):
      '<div class="empty-state">No active squad positions.</div>';
  }

  const best=s.portfolio?.bestDividendPlayer;
  text('hqBestDividend',best?.ticker||'—');
  text('hqBestDividendMeta',best?.annualIncome!=null?`${money(best.annualIncome)} / year`:'Awaiting Income');

  const top=s.portfolio?.topAuroraPlayer;
  text('hqTopAurora',top?.ticker||'—');
  text('hqTopAuroraMeta',top?.score!=null?`${top.score}/100 Aurora score`:'Awaiting Scouting');

  const profitLeader=[...holdings].sort((a,b)=>(Number(b.profitLossGbp)||0)-(Number(a.profitLossGbp)||0))[0];
  text('hqProfitLeader',profitLeader?.ticker||'—');
  text('hqProfitLeaderMeta',profitLeader?`${money(profitLeader.profitLossGbp)} P/L • ${profitLeader.account}`:'Canonical squad');

  const valueLeader=[...holdings].sort((a,b)=>(Number(b.marketValueGbp)||0)-(Number(a.marketValueGbp)||0))[0];
  text('hqValueLeader',valueLeader?.ticker||'—');
  text('hqValueLeaderMeta',valueLeader?`${money(valueLeader.marketValueGbp)} • ${valueLeader.account}`:'Canonical squad');

  // Scouting top three based on active strategy.
  const scoutHost=$('hqScoutingList');
  if(scoutHost){
    const scoreKey=String(s.scouting?.strategy||'sustainable')==='maximum'?'maximumScore':'sustainableScore';
    const targets=[...(s.scouting?.targets||[])]
      .filter(t=>String(t.status||'').toLowerCase()!=='block')
      .sort((a,b)=>(Number(b[scoreKey])||0)-(Number(a[scoreKey])||0))
      .slice(0,4);
    scoutHost.innerHTML=targets.length?targets.map((t,i)=>`
      <div class="scout-row">
        <div class="scout-rank">#${i+1}</div>
        <div class="scout-copy"><b>${esc(t.ticker||'—')} • ${esc(t.name||'Target')}</b><span>${esc(t.recommendation||'WATCH')} • ${Number(t.yieldPct||0).toFixed(2)}% yield • ${esc(t.preferredAccount||'CHECK')}</span></div>
        <div class="scout-score"><strong>${Number(t[scoreKey]||0).toFixed(0)}/100</strong><span>${esc(s.scouting?.strategy||'sustainable')}</span></div>
      </div>`).join(''):'<div class="empty-state">No scouting targets available.</div>';
  }

  // Income.
  const target=Number(s.income?.settings?.monthlyTarget)||0;
  text('hqIncomeMonthly',money(monthly));
  text('hqIncomeTarget',target?`Target ${money(target)} / month`:'Target not set');
  const progress=target>0?Math.max(0,Math.min(100,(monthly/target)*100)):0;
  const bar=$('hqIncomeProgress'); if(bar)bar.style.width=`${progress}%`;
  text('hqIncomeProgressText',target>0?`${progress.toFixed(1)}%`:'—');

  const runway=$('hqDividendRunway');
  if(runway){
    const calendar=[...(s.income?.calendar||[])]
      .filter(e=>String(e.status||'').toUpperCase()!=='CANCELLED' && (e.payDate||e.exDate))
      .sort((a,b)=>new Date(a.payDate||a.exDate)-new Date(b.payDate||b.exDate))
      .slice(0,4);
    runway.innerHTML=calendar.length?calendar.map(e=>{
      const amount=Number(e.actualAmountGbp)||Number(e.expectedAmountGbp)||0;
      return `<div class="dividend-card"><small>${esc(e.payDate||e.exDate||'date pending')}</small><strong>${esc(e.ticker||'—')} • ${money(amount)}</strong><span>${esc(e.account||'CHECK')} • ${esc(e.status||'FORECAST')}</span></div>`;
    }).join(''):'<div class="empty-state">Dividend calendar is waiting for Income Centre data.</div>';
  }

  // Registration.
  const regStatus=String(s.registration?.backend?.status||'NOT_CONNECTED').toUpperCase();
  const receipts=s.registration?.receipts||[];
  text('hqRegistrationBackend',regStatus);
  text('hqRegistrationConfirmed',`${confirmed}/${drafts.length||routeCount||0}`);
  text('hqReceiptCount',String(receipts.length));
  const lastReceipt=[...receipts].sort((a,b)=>new Date(b.confirmedAt||0)-new Date(a.confirmedAt||0))[0];
  text('hqLastReceipt',lastReceipt?.ticker||'—');
  text('hqLastReceiptMeta',lastReceipt?`${lastReceipt.account||''} • ${money(lastReceipt.totalCostGbp)}`:'No receipt yet');

  // Guardian.
  const incomeStatus=String(s.income?.backend?.status||'LOCAL').toUpperCase();
  text('gConnectionValue',connection);
  text('gRegistrationValue',regStatus);
  text('gIncomeValue',incomeStatus);
  const guardianCells=[
    ['gConnection',connection],
    ['gRegistration',regStatus],
    ['gIncome',incomeStatus]
  ];
  guardianCells.forEach(([id,val])=>{
    const el=$(id);if(!el)return;el.classList.remove('good','watch');el.classList.add(goodStatus(val)?'good':'watch');
  });
  const stamp=new Date(s.updatedAt||0);
  const ageMin=Number.isFinite(stamp.getTime())?Math.max(0,Math.floor((Date.now()-stamp.getTime())/60000)):0;
  text('gFreshnessValue',ageMin<2?'NOW':ageMin<60?`${ageMin} MIN`:`${Math.floor(ageMin/60)} HR`);
  text('gFreshnessMeta',s.updatedAt?stamp.toLocaleString('en-GB'):'No timestamp');
  const fresh=$('gFreshness');if(fresh){fresh.classList.remove('good','watch');fresh.classList.add(ageMin<60?'good':'watch')}
  text('hqGuardianTag',goodStatus(connection)&&goodStatus(regStatus)?'Systems healthy':'Review status');

  // Activity.
  const activity=[];
  (s.alerts||[]).slice(0,3).forEach(a=>activity.push({title:a.title||'Aurora alert',note:a.note||'',when:a.when||''}));
  if(lastReceipt)activity.push({title:`${lastReceipt.ticker||'Trade'} registered`,note:`${lastReceipt.account||''} • ${money(lastReceipt.totalCostGbp)}`,when:'confirmed'});
  if(route?.updatedAt)activity.push({title:'Transfer route updated',note:`${route.allocations?.length||0} allocations • ${strategy}`,when:new Date(route.updatedAt).toLocaleDateString('en-GB')});
  if(s.finance?.lastReleasedAt)activity.push({title:'Finance released mission cash',note:money(p.releaseAmount||missionBudget),when:new Date(s.finance.lastReleasedAt).toLocaleDateString('en-GB')});
  activity.push({title:'Nexus state loaded',note:`${squadSize} players • ${holdings.length} positions`,when:'now'});
  const host=$('hqActivity');
  if(host){
    host.innerHTML=activity.slice(0,6).map(r=>`<div class="activity-row"><i class="activity-dot"></i><div><b>${esc(r.title)}</b><span>${esc(r.note)}</span></div><time>${esc(r.when)}</time></div>`).join('');
  }
  text('hqActivityCount',`${Math.min(activity.length,6)} items`);
}

document.addEventListener('DOMContentLoaded',render);
w.addEventListener('aurora2:state',render);
})(window);
