/* Aurora City FC — Nexus 2.0 replacement intelligence
 * Rebuilds the strongest legacy Nexus concepts on Aurora 2 canonical state.
 * No legacy backend calls and no browser-only financial truth.
 */
(function(w){
  'use strict';
  if(w.__AURORA_NEXUS_V2_UPGRADE__)return;
  w.__AURORA_NEXUS_V2_UPGRADE__=true;

  const A=()=>w.Aurora2;
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const esc=v=>A()?.ui?.escape?.(v)||String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>A()?.ui?.money?.(v)||new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(num(v));
  const pct=v=>`${num(v)>=0?'+':''}${num(v).toFixed(2)}%`;
  const isPage=()=>((String(location.pathname||'').split('/').pop()||'').toLowerCase()==='auroracityfc_nexusv2.html');

  function active(s){return arr(s?.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&num(h?.shares)>0)}
  function value(h){return num(h?.marketValueGbp)||(num(h?.shares)*num(h?.livePriceGbp))}
  function book(h){return num(h?.bookCostGbp)||(num(h?.shares)*num(h?.avgCostGbp))}
  function income(h){return num(h?.annualIncomeGbp)||(num(h?.shares)*num(h?.annualDpsGbp))}
  function daily(h){return num(h?.dailyChangeGbp||h?.todayChangeGbp||h?.dayChangeGbp)}
  function dailyPct(h){
    const direct=[h?.dailyChangePct,h?.todayChangePct,h?.dayChangePct].map(num).find(v=>v!==0);
    if(direct)return direct;
    const mv=value(h),d=daily(h),base=mv-d;
    return base?d/base*100:0;
  }
  function pnl(h){return num(h?.profitLossGbp)||(value(h)-book(h))}
  function pnlPct(h){const b=book(h);return b?pnl(h)/b*100:0}
  function yieldPct(h){const v=value(h);return v?income(h)/v*100:0}
  function confidence(h){return num(h?.confidence||h?.score||h?.auroraScore||h?.qualityScore)}
  function hasDaily(h){return ['dailyChangeGbp','todayChangeGbp','dayChangeGbp','dailyChangePct','todayChangePct','dayChangePct'].some(k=>Number.isFinite(Number(h?.[k])))}
  function account(h){const s=String(h?.account||h?.platform||'').toLowerCase();return s.includes('212')?'T212':s.includes('ig')?'IG':'OTHER'}
  function annualIncome(s){return w.AuroraFinancialTruth?.getCurrentAnnualIncome?.(s)??active(s).reduce((x,h)=>x+income(h),0)}
  function strategy(s){return String(s?.transfer?.settings?.strategy||s?.scouting?.strategy||'sustainable').toLowerCase()==='maximum'?'Maximum Income':'Sustainable Income'}
  function routeSummary(s){
    const route=s?.transfer?.route, allocations=arr(route?.allocations).filter(x=>num(x?.amount)>0);
    return {route,allocations,allocated:allocations.reduce((x,r)=>x+num(r.amount),0),uplift:allocations.reduce((x,r)=>x+num(r.expectedAnnualIncome),0)};
  }
  function publishedReport(s){return s?.matchday?.latest||s?.matchdayReport?.latest||s?.matchdayReport||s?.matchReport?.latest||null}

  function ensureStyle(){
    if(document.querySelector('link[data-nexus-v2-upgrade]'))return;
    const link=document.createElement('link');link.rel='stylesheet';link.href='nexus-v2-upgrade.css?v=20260817-replacement-1';link.dataset.nexusV2Upgrade='1';document.head.appendChild(link);
  }

  function ensureDom(){
    if(!isPage()||document.getElementById('n2ReplacementLayer'))return;
    const hero=document.querySelector('main.page .hero');
    if(!hero)return;
    const root=document.createElement('section');
    root.id='n2ReplacementLayer';
    root.className='section n2-upgrade-command';
    root.innerHTML=`
      <div class="n2-upgrade-grid">
        <article class="n2u-panel">
          <div class="n2u-inner">
            <div class="n2u-command-top"><div><span class="n2u-kicker">Manager command cockpit</span><h2 class="n2u-title">Today at Aurora City FC</h2><p class="n2u-copy" id="n2uCommandCopy">Building the manager's live position from the current club state.</p></div><span class="n2u-status" id="n2uCommandStatus">CHECKING</span></div>
            <div class="n2u-score-strip">
              <div class="n2u-score"><small>Portfolio Value</small><strong id="n2uValue">—</strong></div>
              <div class="n2u-score"><small>Today's Result</small><strong id="n2uToday">—</strong></div>
              <div class="n2u-score"><small>Annual Income</small><strong id="n2uAnnual">—</strong></div>
              <div class="n2u-score"><small>Monthly Income</small><strong id="n2uMonthly">—</strong></div>
              <div class="n2u-score"><small>Transfer Strategy</small><strong id="n2uStrategy">—</strong></div>
              <div class="n2u-score"><small>Mission</small><strong id="n2uMission">—</strong></div>
            </div>
            <div class="n2u-action-board">
              <div class="n2u-action-main"><small class="n2u-kicker">Next manager action</small><strong id="n2uNextAction">Reviewing club state…</strong><span id="n2uNextActionNote">Aurora is identifying the department that needs you next.</span><div class="n2u-actions"><a class="n2u-link primary" id="n2uActionLink" href="index.html">Open department →</a><a class="n2u-link" href="match-report.html">Open 5PM Match Report</a></div></div>
              <div class="n2u-action"><small class="n2u-kicker">Form leader</small><strong id="n2uFormLeader">—</strong><span id="n2uFormLeaderMeta">Market evidence pending</span></div>
              <div class="n2u-action"><small class="n2u-kicker">Income leader</small><strong id="n2uIncomeLeader">—</strong><span id="n2uIncomeLeaderMeta">Squad income</span></div>
              <div class="n2u-action"><small class="n2u-kicker">Watch player</small><strong id="n2uWatchPlayer">—</strong><span id="n2uWatchPlayerMeta">Risk / form watch</span></div>
            </div>
          </div>
        </article>
        <article class="n2u-panel"><div class="n2u-inner n2u-match-card"><div><div class="n2u-command-top"><div><span class="n2u-kicker">5PM Matchday</span><h2 class="n2u-title">Full-Time Result</h2></div><span class="n2u-status" id="n2uMatchStatus">LIVE VIEW</span></div><div class="n2u-result draw" id="n2uResult">—</div><p class="n2u-copy" id="n2uMatchSummary">Today's portfolio result will appear here as market evidence becomes available.</p><div class="n2u-match-meta"><div class="n2u-stat"><small>Advancers</small><strong id="n2uAdvancers">—</strong></div><div class="n2u-stat"><small>Decliners</small><strong id="n2uDecliners">—</strong></div><div class="n2u-stat"><small>Man of Match</small><strong id="n2uMotm">—</strong></div><div class="n2u-stat"><small>Biggest Drag</small><strong id="n2uDrag">—</strong></div></div></div><div class="n2u-actions"><a class="n2u-link primary" href="match-report.html">Read Full Match Report →</a></div></div></article>
      </div>

      <article class="n2u-panel"><div class="n2u-inner"><div class="n2u-command-top"><div><span class="n2u-kicker">Portfolio command</span><h2 class="n2u-title">Overall • IG ISA • Trading 212</h2><p class="n2u-copy">Three dressing rooms, one canonical squad. Values and P/L are calculated from the same Aurora 2 holdings.</p></div><span class="n2u-status" id="n2uBrokerStatus">SQUAD TRUTH</span></div><div class="n2u-broker-grid" id="n2uBrokerGrid"></div></div></article>

      <article class="n2u-panel"><div class="n2u-inner"><div class="n2u-command-top"><div><span class="n2u-kicker">Transfer window</span><h2 class="n2u-title">Mission & Payday Deployment</h2><p class="n2u-copy">The live Transfer strategy and recommendation, without taking ownership away from Finance, Scouting or Transfer.</p></div><a class="n2u-link" href="transfer.html">Open Transfer Centre →</a></div><div class="n2u-route-grid"><div class="n2u-route-cell"><small>Strategy</small><strong id="n2uRouteStrategy">—</strong></div><div class="n2u-route-cell"><small>Approved Budget</small><strong id="n2uRouteBudget">—</strong></div><div class="n2u-route-cell"><small>Allocated</small><strong id="n2uRouteAllocated">—</strong></div><div class="n2u-route-cell"><small>Recommended Buys</small><strong id="n2uRouteBuys">—</strong></div><div class="n2u-route-cell"><small>Income Uplift</small><strong id="n2uRouteIncome">—</strong></div></div><div class="n2u-route-summary" id="n2uRouteSummary">No live route built yet.</div></div></article>

      <article class="n2u-panel"><div class="n2u-inner"><div class="n2u-command-top"><div><span class="n2u-kicker">Dividend runway</span><h2 class="n2u-title">Next 12 Months</h2><p class="n2u-copy">A Nexus-level runway view using Income Centre's calendar only — the Income Centre remains the owner of dividend truth.</p></div><a class="n2u-link" href="income.html">Open Income Centre →</a></div><div class="n2u-runway" id="n2uRunway"></div><div class="n2u-runway-summary"><div class="n2u-route-cell"><small>12M Scheduled</small><strong id="n2uScheduled">—</strong></div><div class="n2u-route-cell"><small>Strongest Month</small><strong id="n2uBestMonth">—</strong></div><div class="n2u-route-cell"><small>Weakest Month</small><strong id="n2uWeakMonth">—</strong></div><div class="n2u-route-cell"><small>Calendar Coverage</small><strong id="n2uCoverage">—</strong></div></div></div></article>

      <article class="n2u-panel"><div class="n2u-inner"><div class="n2u-command-top"><div><span class="n2u-kicker">Premier League tables</span><h2 class="n2u-title">Squad Form & Income Table</h2><p class="n2u-copy">A modern version of the original Nexus league tables, ranked from current Aurora 2 holdings.</p></div><a class="n2u-link" href="squad.html">Open Squad Hub →</a></div><div class="n2u-league-grid"><div class="n2u-league"><div class="n2u-league-head"><strong>Daily Form Table</strong><span>Today %</span></div><div id="n2uFormTable"></div></div><div class="n2u-league"><div class="n2u-league-head"><strong>Income Premier League</strong><span>Annual income</span></div><div id="n2uIncomeTable"></div></div></div><div class="n2u-compact-note">Tables are descriptive manager views only. Transfer and Scouting remain the decision owners for new purchases.</div></div></article>
    `;
    hero.insertAdjacentElement('afterend',root);
  }

  function set(id,text,cls){const el=document.getElementById(id);if(!el)return;el.textContent=text;if(cls){el.classList.remove('n2u-positive','n2u-negative','good','bad','draw','warn');el.classList.add(cls)}}

  function managerAction(s){
    const status=String(s?.mission?.status||'WAITING').toUpperCase();
    if(/REGISTER|EXECUT/.test(status))return ['Complete registration','Record the real broker executions so the squad and income truth can update.','registration.html'];
    if(/TRANSFER/.test(status))return ['Set the Transfer route','Choose the strategy, review broker routing and build the payday recommendation.','transfer.html'];
    if(/SCOUT/.test(status))return ['Review Scouting','Approve the eligible shortlist before Transfer can deploy the mission.','scouting.html'];
    if(/FINANCE/.test(status))return ['Review the released budget','Finance owns the money. Confirm the current mission before Scouting and Transfer act.','finance.html'];
    if(s?.transfer?.route&&!s?.transfer?.route?.locked)return ['Review the draft route','A Transfer recommendation exists and is waiting for manager approval.','transfer.html'];
    if(s?.decision?.title)return [String(s.decision.title),String(s.decision.note||'Aurora has published the current manager instruction.'),'AuroraCityFC_NexusV2.html'];
    return ['Hold team shape','No urgent mission gate is waiting. Review the 5PM report and current squad form.','match-report.html'];
  }

  function renderBrokers(hs){
    const total=hs.reduce((x,h)=>x+value(h),0);
    const groups=[['overall','Overall',hs],['ig','IG ISA',hs.filter(h=>account(h)==='IG')],['t212','Trading 212',hs.filter(h=>account(h)==='T212')]];
    const html=groups.map(([cls,label,list])=>{
      const v=list.reduce((x,h)=>x+value(h),0), b=list.reduce((x,h)=>x+book(h),0), p=list.reduce((x,h)=>x+pnl(h),0), d=list.filter(hasDaily).reduce((x,h)=>x+daily(h),0), inc=list.reduce((x,h)=>x+income(h),0), weight=total?Math.min(100,v/total*100):0;
      return `<div class="n2u-broker ${cls}"><div class="n2u-broker-head"><b>${label}</b><span>${list.length} holding${list.length===1?'':'s'}</span></div><div class="n2u-broker-value">${money(v)}</div><div class="n2u-broker-meta"><span>P/L <b class="${p>=0?'n2u-positive':'n2u-negative'}">${p>=0?'+':''}${money(p)}</b></span><span>Today <b class="${d>=0?'n2u-positive':'n2u-negative'}">${d>=0?'+':''}${money(d)}</b></span></div><div class="n2u-broker-meta"><span>Book ${money(b)}</span><span>Income ${money(inc)}/yr</span></div><div class="n2u-broker-bar"><i style="width:${weight.toFixed(1)}%"></i></div></div>`;
    }).join('');
    const el=document.getElementById('n2uBrokerGrid');if(el)el.innerHTML=html;
  }

  function renderRoute(s){
    const r=routeSummary(s), budget=num(s?.mission?.approvedBudget), names=r.allocations.map(x=>String(x.ticker||x.name||'').toUpperCase()).filter(Boolean);
    set('n2uRouteStrategy',strategy(s));set('n2uRouteBudget',money(budget));set('n2uRouteAllocated',money(r.allocated));set('n2uRouteBuys',String(r.allocations.length));set('n2uRouteIncome',`+${money(r.uplift)}`);
    set('n2uRouteSummary',r.route?`${strategy(s)} recommends ${r.allocations.length} purchase${r.allocations.length===1?'':'s'}${names.length?` — ${names.join(' • ')}`:''}. ${money(Math.max(0,budget-r.allocated))} remains unallocated.`:'No live route is built yet. Transfer will populate this board when the current mission reaches the deployment stage.');
  }

  function calendarRows(s){
    const now=new Date(), first=new Date(now.getFullYear(),now.getMonth(),1), months=[];
    for(let i=0;i<12;i++){const d=new Date(first.getFullYear(),first.getMonth()+i,1);months.push({key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,name:d.toLocaleDateString('en-GB',{month:'short'}).toUpperCase(),amount:0,count:0})}
    const map=Object.fromEntries(months.map(m=>[m.key,m]));
    arr(s?.income?.calendar).forEach(row=>{
      const raw=String(row?.paymentDate||row?.date||row?.payDate||row?.exDate||'');if(!raw)return;const d=new Date(raw);if(Number.isNaN(d.getTime()))return;const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;if(!map[key])return;map[key].amount+=num(row?.amountGbp||row?.amount||row?.expectedAmountGbp||row?.forecastAmountGbp);map[key].count++;
    });
    return months;
  }

  function renderRunway(s){
    const months=calendarRows(s), scheduled=months.reduce((x,m)=>x+m.amount,0), populated=months.filter(m=>m.count>0), avg=populated.length?scheduled/populated.length:0, best=[...months].sort((a,b)=>b.amount-a.amount)[0], weak=[...months].filter(m=>m.count>0).sort((a,b)=>a.amount-b.amount)[0];
    const el=document.getElementById('n2uRunway');if(el)el.innerHTML=months.map(m=>`<div class="n2u-month ${m.amount>=avg&&m.count?'covered':m.count?'weak':''}"><small>${m.name}</small><strong>${money(m.amount)}</strong><span>${m.count?`${m.count} payment${m.count===1?'':'s'}`:'No mapped payment'}</span></div>`).join('');
    set('n2uScheduled',money(scheduled));set('n2uBestMonth',best&&best.amount?`${best.name} • ${money(best.amount)}`:'Building');set('n2uWeakMonth',weak?`${weak.name} • ${money(weak.amount)}`:'Building');set('n2uCoverage',`${populated.length}/12 months`);
  }

  function leagueRow(h,i,score,rating,meta){return `<div class="n2u-league-row"><span class="n2u-pos">${String(i+1).padStart(2,'0')}</span><span class="n2u-player"><b>${esc(h?.ticker||h?.name||'—')}</b><span>${esc(meta||h?.name||'')}</span></span><span class="n2u-league-score">${score}</span><span class="n2u-league-rating">${rating}</span></div>`}
  function renderLeagues(hs){
    const dailyRows=hs.filter(hasDaily).sort((a,b)=>dailyPct(b)-dailyPct(a)).slice(0,10), incomeRows=[...hs].sort((a,b)=>income(b)-income(a)).slice(0,10);
    const form=document.getElementById('n2uFormTable');if(form)form.innerHTML=dailyRows.length?dailyRows.map((h,i)=>leagueRow(h,i,pct(dailyPct(h)),`${Math.max(1,Math.min(10,6+dailyPct(h)*1.2)).toFixed(1)}`,h.name)).join(''):'<div class="empty">Daily holding-level market evidence is still building.</div>';
    const inc=document.getElementById('n2uIncomeTable');if(inc)inc.innerHTML=incomeRows.length?incomeRows.map((h,i)=>leagueRow(h,i,money(income(h)),`${yieldPct(h).toFixed(1)}%`,h.name)).join(''):'<div class="empty">No active dividend-paying holdings found.</div>';
  }

  function render(s){
    if(!isPage()||!s)return;ensureDom();
    const hs=active(s), total=hs.reduce((x,h)=>x+value(h),0)||num(s?.portfolio?.teamValue), evidenced=hs.filter(hasDaily), today=evidenced.length?evidenced.reduce((x,h)=>x+daily(h),0):num(s?.portfolio?.todayChangeGbp||s?.market?.todayChangeGbp), annual=num(annualIncome(s)), month=annual/12, adv=evidenced.filter(h=>daily(h)>0), dec=evidenced.filter(h=>daily(h)<0), form=[...evidenced].sort((a,b)=>dailyPct(b)-dailyPct(a)), incomeRank=[...hs].sort((a,b)=>income(b)-income(a)), watch=[...hs].sort((a,b)=>dailyPct(a)-dailyPct(b));
    const report=publishedReport(s), mission=String(s?.mission?.status||'WAITING').replaceAll('_',' '), action=managerAction(s);

    set('n2uValue',money(total));set('n2uToday',evidenced.length?`${today>=0?'+':''}${money(today)}`:'Awaiting feed',today>0?'n2u-positive':today<0?'n2u-negative':'');set('n2uAnnual',money(annual));set('n2uMonthly',money(month));set('n2uStrategy',strategy(s));set('n2uMission',mission);
    set('n2uCommandStatus',evidenced.length?'CLUB SYSTEMS LIVE':'AWAITING MARKET',evidenced.length?'good':'warn');set('n2uCommandCopy',`${hs.length} active holdings • ${strategy(s)} • ${evidenced.length}/${hs.length} holdings have daily market evidence.`);
    set('n2uNextAction',action[0]);set('n2uNextActionNote',action[1]);const link=document.getElementById('n2uActionLink');if(link)link.href=action[2];
    set('n2uFormLeader',form[0]?.ticker||'Awaiting feed');set('n2uFormLeaderMeta',form[0]?`${pct(dailyPct(form[0]))} today • ${money(daily(form[0]))}`:'No holding-level daily move yet');set('n2uIncomeLeader',incomeRank[0]?.ticker||'—');set('n2uIncomeLeaderMeta',incomeRank[0]?`${money(income(incomeRank[0]))}/yr • ${yieldPct(incomeRank[0]).toFixed(1)}% yield`:'No income evidence');set('n2uWatchPlayer',watch[0]?.ticker||'—');set('n2uWatchPlayerMeta',watch[0]&&evidenced.length?`${pct(dailyPct(watch[0]))} today`:'Daily risk/form evidence pending');

    const tone=today>0?'good':today<0?'bad':'draw', label=today>0?'WIN':today<0?'DEFEAT':'DRAW';set('n2uResult',evidenced.length?`${label} ${today>=0?'+':''}${money(today)}`:'MATCH IN PROGRESS',tone);set('n2uMatchStatus',report?'5PM REPORT PUBLISHED':evidenced.length?'LIVE SESSION':'AWAITING FEED',report||evidenced.length?'good':'warn');set('n2uMatchSummary',report?.summary||report?.manager_report||report?.managerReport||(evidenced.length?`Aurora City FC have ${adv.length} advancer${adv.length===1?'':'s'} against ${dec.length} decliner${dec.length===1?'':'s'} in the current session.`:'The full-time result will build from canonical portfolio movement and the published Matchday report.'));set('n2uAdvancers',String(adv.length));set('n2uDecliners',String(dec.length));set('n2uMotm',form[0]?.ticker||report?.man_of_the_match||'—');set('n2uDrag',watch[0]?.ticker||report?.biggest_drag||'—');

    renderBrokers(hs);renderRoute(s);renderRunway(s);renderLeagues(hs);
  }

  function init(){if(!isPage())return;ensureStyle();ensureDom();const state=A()?.core?.read?.();if(state)render(state);w.addEventListener('aurora2:state',e=>render(e.detail||A()?.core?.read?.()));setTimeout(()=>{const s=A()?.core?.read?.();if(s)render(s)},250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
