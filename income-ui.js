
(function(){
'use strict';

function jump(id){
  const target=document.getElementById(id);
  if(!target)return;
  const offset=(document.querySelector('.aurora-shell-header')?.offsetHeight||0)+(document.querySelector('.income-jumpbar')?.offsetHeight||0)+18;
  const top=target.getBoundingClientRect().top+window.scrollY-offset;
  window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
}

document.addEventListener('click',event=>{
  const btn=event.target.closest('[data-income-jump]');
  if(!btn)return;
  event.preventDefault();
  jump(btn.dataset.incomeJump);
});

document.addEventListener('DOMContentLoaded',()=>{
  const label=document.getElementById('currentDepartment');
  if(label)label.textContent='INCOME CENTRE • DIVIDEND DEPARTMENT';
  document.title='Aurora City FC — Income Centre';
});
})();


/* =========================================================
   INCOME UI v1.1.2 — PROMOTION ENGINE HOTFIX
   Reads the owning Income engine directly. DOM text is fallback only.
   ========================================================= */
(function(){
'use strict';

const A=()=>window.Aurora2;
const $=id=>document.getElementById(id);
const num=v=>{
  const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:0;
};
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)||0);
const sourceText=id=>$(id)?.textContent||'';
const set=(id,value)=>{const el=$(id);if(el)el.textContent=value};

function readIncome(){
  try{
    const core=A()?.core;
    const engine=A()?.income;
    const state=core?.read?.()||null;
    const metrics=state&&engine?.metrics?.(state);
    const next=state&&engine?.nextDividend?.(state);
    return {state,metrics,next};
  }catch(_){
    return {state:null,metrics:null,next:null};
  }
}

function renderPromotion(){
  const {state,metrics,next}=readIncome();

  // Primary source: Income engine. Scorecard text is fallback only.
  const monthly=metrics?num(metrics.monthly):num(sourceText('kMonthly'));
  const annual=metrics?num(metrics.annual):num(sourceText('kAnnual'));
  const yoc=metrics?num(metrics.yoc):num(sourceText('kYoc'));
  const yieldPct=metrics?num(metrics.yieldPct):num(sourceText('kYield'));
  const best=metrics?.best||null;

  const target=625;
  const progress=target>0?Math.max(0,Math.min(100,monthly/target*100)):0;
  const gap=Math.max(0,target-monthly);

  set('income3Monthly',money(monthly));
  set('income3Percent',`${progress.toFixed(1)}% of £625`);
  set('income3Gap',gap>0?money(gap):'TARGET REACHED');
  set('income3Annual',money(annual));

  const ring=$('income3Ring');
  if(ring)ring.style.setProperty('--inc-progress',`${progress*3.6}deg`);
  const bar=$('income3ProgressBar');
  if(bar)bar.style.width=`${progress}%`;

  const status=$('income3PromotionStatus');
  if(status){
    status.classList.toggle('hit',monthly>=target);
    status.textContent=monthly>=target?'PROMOTED':'IN PROGRESS';
  }

  const route=state?.transfer?.route||null;
  const terminalTransferStates=['REGISTERED','COMPLETE','COMPLETED','ARCHIVED'];
  const routeAnnual=route
    && !terminalTransferStates.includes(String(route.status||'').toUpperCase())
    && !terminalTransferStates.includes(String(state?.mission?.status||'').toUpperCase())
    ? num(route.expectedAnnualIncome)
    : 0;
  const projectedMonthly=monthly+(routeAnnual/12);

  if(routeAnnual>0){
    set('income3Projected',`${money(projectedMonthly)}/m`);
    set('income3ProjectedMeta',`includes ${money(routeAnnual)}/yr active Transfer projection`);
  }else{
    set('income3Projected','No active route');
    set('income3ProjectedMeta','current canonical income only');
  }

  const note=$('income3PromotionNote');
  if(note){
    if(monthly>=target){
      note.textContent='The £625 per month promotion target has been reached on the current canonical forward-income run rate.';
    }else{
      note.textContent=`Current forward income is ${money(monthly)} per month. ${money(gap)} per month remains to reach promotion.`;
    }
  }

  let marked=false;
  document.querySelectorAll('#income3Milestones [data-target]').forEach(card=>{
    const t=num(card.dataset.target);
    card.classList.remove('hit','current');
    if(monthly>=t)card.classList.add('hit');
    else if(!marked){card.classList.add('current');marked=true}
  });

  // Matchday also reads the owning Income engine directly.
  set('income3Yoc',`${yoc.toFixed(2)}%`);
  set('income3Yield',`${yieldPct.toFixed(2)}%`);
  set('income3Best',best?.ticker||sourceText('kBest')||'—');
  set(
    'income3BestMeta',
    best ? `${money(best.annual)} / year` : (sourceText('kBestMeta')||'—')
  );

  const nextTicker=next?.ticker||sourceText('kNext')||'—';
  const nextAmount=next?money(next.amount):'Upcoming';
  const nextMeta=next
    ? `${next.account||''}${next.account?' • ':''}${next.date||''}`
    : (sourceText('kNextMeta')||'Calendar event required');

  set('income3NextTicker',nextTicker);
  set('income3NextAmount',nextTicker==='—'?'—':nextAmount);
  set('income3NextMeta',nextMeta);

  const calendar=Array.isArray(state?.income?.calendar)?state.income.calendar:[];
  const activeCalendar=calendar.filter(e=>!['CANCELLED','ARCHIVED'].includes(String(e?.status||'').toUpperCase()));
  set('income3Coverage',String(activeCalendar.length));

  const longTarget=2000;
  const longProgress=Math.max(0,Math.min(100,monthly/longTarget*100));
  const longGap=Math.max(0,longTarget-monthly);
  set('income13Current',money(monthly));
  set('income13CurrentMeta',`${longProgress.toFixed(1)}% of £2,000`);
  set('income13Gap',longGap>0?money(longGap):'TARGET REACHED');

  const longBar=$('income13LongBar');
  if(longBar)longBar.style.width=`${longProgress}%`;

  const longStatus=$('income13GoalStatus');
  if(longStatus){
    longStatus.classList.toggle('hit',monthly>=longTarget);
    longStatus.textContent=monthly>=longTarget?'£2,000 GOAL REACHED':'CAREER TARGET';
  }

  let longMarked=false;
  document.querySelectorAll('#incomeLongTermGoal [data-long-target]').forEach(card=>{
    const t=num(card.dataset.longTarget);
    card.classList.remove('hit','current');
    if(monthly>=t)card.classList.add('hit');
    else if(!longMarked){card.classList.add('current');longMarked=true}
  });
}

function reorderBrokerCashJump(){
  const nav=document.querySelector('.income-jumpbar');
  const cash=nav?.querySelector('[data-income-jump="brokerDividendCashSection"]');
  const runway=nav?.querySelector('[data-income-jump="incomeRunwaySection"]');
  const promotion=nav?.querySelector('[data-income-jump="incomePromotionSection"]');
  if(cash&&runway&&cash.previousElementSibling!==promotion){
    nav.insertBefore(cash,runway);
    cash.textContent='Broker Cash';
  }
}

function bind(){
  // Observe only the legacy authoritative output cells as a fallback signal.
  const ids=['kMonthly','kAnnual','routeUplift','kYoc','kYield','kBest','kBestMeta','kNext','kNextMeta','calendarCoverage'];
  const observer=new MutationObserver(()=>renderPromotion());
  ids.forEach(id=>{
    const el=$(id);
    if(el)observer.observe(el,{childList:true,subtree:true,characterData:true});
  });

  window.addEventListener('aurora2:state',()=>setTimeout(renderPromotion,0));
  window.addEventListener('storage',()=>setTimeout(renderPromotion,40));
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)setTimeout(renderPromotion,40);
  });
  document.addEventListener('click',()=>setTimeout(renderPromotion,80));

  // Multiple safe passes cover first load and async canonical holdings sync.
  [0,80,250,700,1600].forEach(ms=>setTimeout(()=>{
    renderPromotion();
    reorderBrokerCashJump();
  },ms));
}

document.addEventListener('DOMContentLoaded',bind);
})();


/* =========================================================
   INCOME UI v1.1 — DIVIDEND COMMAND ROOM
   Reads Aurora2.income.metrics() and existing Income state.
   ========================================================= */
(function(){
'use strict';

const A=()=>window.Aurora2;
const $=id=>document.getElementById(id);
const arr=v=>Array.isArray(v)?v:[];
const num=v=>{
  const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:0;
};
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)||0);
const pct=v=>`${(Number(v)||0).toFixed(1)}%`;
const esc=v=>String(v??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");

function set(id,value){const el=$(id);if(el)el.textContent=value}
function state(){try{return A()?.core?.read?.()||{}}catch(_){return {}}}
function metrics(){try{return A()?.income?.metrics?.(state())||null}catch(_){return null}}
function accountLabel(v){
  const s=String(v||'').toUpperCase();
  if(s==='IG'||s.includes('IG ISA'))return 'IG ISA';
  if(s==='T212'||s.includes('212'))return 'Trading 212 ISA';
  return 'Account review';
}
function ticker(v){
  return String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();
}
function todayISO(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function calendarState(e){
  const status=String(e?.status||'FORECAST').toUpperCase();
  if(status==='CANCELLED'||status==='ARCHIVED')return 'cancelled';
  if(status==='PAID')return 'paid';
  const pay=String(e?.payDate||'').slice(0,10);
  if(pay&&pay<todayISO())return 'late';
  if(status==='CONFIRMED')return 'confirmed';
  return 'forecast';
}
function eventAmount(e){
  try{return num(A()?.income?.eventAmount?.(state(),e))}catch(_){
    return num(e?.actualAmountGbp)||num(e?.expectedAmountGbp);
  }
}
function holdingAnnual(h){
  const shares=num(h?.shares),dps=num(h?.annualDpsGbp);
  return shares>0&&dps>0?shares*dps:Math.max(0,num(h?.annualIncomeGbp));
}
function readJson(key){
  try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}
}

/* Reliability */
function reliabilityData(s,m){
  const all=arr(s?.income?.calendar);
  const counts={paid:0,confirmed:0,forecast:0,late:0,cancelled:0};
  all.forEach(e=>counts[calendarState(e)]++);
  const eligiblePlayers=new Set(arr(m?.players).map(p=>ticker(p.ticker)).filter(Boolean));
  const covered=new Set(
    all.filter(e=>calendarState(e)!=='cancelled')
      .map(e=>ticker(e.ticker))
      .filter(t=>eligiblePlayers.has(t))
  );
  const coverage=eligiblePlayers.size?covered.size/eligiblePlayers.size*100:0;
  return {all,counts,coverage,covered:covered.size,totalPlayers:eligiblePlayers.size};
}
function renderReliability(s,m){
  const d=reliabilityData(s,m);
  set('income11Coverage',pct(d.coverage));
  set('income11CoverageMeta',`${d.covered} of ${d.totalPlayers} dividend players have calendar data`);
  set('income11Reliable',String(d.counts.paid+d.counts.confirmed));
  set('income11ReliableMeta',`${d.all.length} recorded calendar event${d.all.length===1?'':'s'}`);
  set('income11Late',String(d.counts.late));
  set('income11LateMeta',d.counts.late?'Payment date passed without PAID status':'No late items');
  set('income11Paid',String(d.counts.paid));
  set('income11Confirmed',String(d.counts.confirmed));
  set('income11Forecast',String(d.counts.forecast));
  set('income11LateCount',String(d.counts.late));
  set('income11Cancelled',String(d.counts.cancelled));

  const badge=$('income11ReliabilityBadge');
  if(badge)badge.textContent=d.counts.late?'ATTENTION':'CALENDAR CURRENT';

  const rows=d.all.slice().sort((a,b)=>{
    const sa=calendarState(a),sb=calendarState(b);
    const weight={late:0,confirmed:1,forecast:2,paid:3,cancelled:4};
    return (weight[sa]-weight[sb]) ||
      String(a.payDate||'9999').localeCompare(String(b.payDate||'9999'));
  }).slice(0,7);

  const host=$('income11ReliabilityList');
  if(!host)return;
  if(!rows.length){
    host.innerHTML='<div class="income11-empty">No dividend calendar events are recorded yet.</div>';
    return;
  }
  host.innerHTML=rows.map(e=>{
    const st=calendarState(e);
    const amount=eventAmount(e);
    return `<div class="income11-reliability-row">
      <div>
        <strong>${esc(ticker(e.ticker)||'—')} • ${esc(accountLabel(e.account))} • ${money(amount)}</strong>
        <span>${e.payDate?`Pay ${esc(e.payDate)}`:'Payment date missing'}${e.exDate?` • ex ${esc(e.exDate)}`:''}</span>
      </div>
      <b class="income11-state ${st}">${st.toUpperCase()}</b>
    </div>`;
  }).join('');
}

/* Concentration */
function sectorRows(m){
  const map=new Map();
  arr(m?.eligibleHoldings).forEach(h=>{
    const sector=String(h?.sector||'Unclassified').trim()||'Unclassified';
    map.set(sector,(map.get(sector)||0)+holdingAnnual(h));
  });
  return [...map.entries()]
    .map(([name,annual])=>({name,annual}))
    .filter(x=>x.annual>0)
    .sort((a,b)=>b.annual-a.annual);
}
function barRow(name,annual,total){
  const share=total>0?annual/total*100:0;
  return `<div class="income11-bar-row">
    <div class="income11-bar-copy">
      <strong>${esc(name)}</strong>
      <span>${money(annual)} / yr</span>
      <div class="income11-bar"><i style="width:${Math.min(100,share).toFixed(1)}%"></i></div>
    </div>
    <b>${pct(share)}</b>
  </div>`;
}
function renderConcentration(m){
  const annual=num(m?.annual);
  const players=arr(m?.players);
  const accounts=arr(m?.byAccount).slice().sort((a,b)=>num(b.annual)-num(a.annual));
  const sectors=sectorRows(m);
  const top5Annual=players.slice(0,5).reduce((sum,p)=>sum+num(p.annual),0);
  const top5Pct=annual>0?top5Annual/annual*100:0;
  set('income11Top5',pct(top5Pct));
  set('income11Top5Meta',`${money(top5Annual)} of ${money(annual)} forward income`);

  const p=players[0];
  set('income11LargestPlayer',p?.ticker||'—');
  set('income11LargestPlayerMeta',p&&annual>0?`${money(p.annual)} • ${pct(p.annual/annual*100)}`:'—');

  const a=accounts[0];
  set('income11LargestBroker',a?accountLabel(a.account):'—');
  set('income11LargestBrokerMeta',a&&annual>0?`${money(a.annual)} • ${pct(a.annual/annual*100)}`:'—');

  const sec=sectors[0];
  set('income11LargestSector',sec?.name||'—');
  set('income11LargestSectorMeta',sec&&annual>0?`${money(sec.annual)} • ${pct(sec.annual/annual*100)}`:'—');

  const playerHost=$('income11PlayerBars');
  if(playerHost)playerHost.innerHTML=players.length
    ?players.slice(0,5).map(x=>barRow(x.ticker,x.annual,annual)).join('')
    :'<div class="income11-empty">No dividend players.</div>';

  const brokerHost=$('income11BrokerBars');
  if(brokerHost)brokerHost.innerHTML=accounts.length
    ?accounts.map(x=>barRow(accountLabel(x.account),x.annual,annual)).join('')
    :'<div class="income11-empty">No broker income.</div>';

  const sectorHost=$('income11SectorBars');
  if(sectorHost)sectorHost.innerHTML=sectors.length
    ?sectors.slice(0,5).map(x=>barRow(x.name,x.annual,annual)).join('')
    :'<div class="income11-empty">No sector income.</div>';
}

/* Cash cycle */
function brokerCash(){
  const ig=num($('cashBalanceIG')?.textContent);
  const t212=num($('cashBalanceT212')?.textContent);
  return {ig,t212,total:ig+t212};
}
function renderCashCycle(s){
  const cal=arr(s?.income?.calendar);
  const paid=cal.filter(e=>calendarState(e)==='paid').length;
  const ledgerRows=[...document.querySelectorAll('#cashLedger .cash-ledger-row')];
  const dividendRecords=ledgerRows.filter(row=>/dividend/i.test(row.textContent||'')).length;
  const cash=brokerCash();
  const plan=readJson('aurora2:broker-cash-plan:v1');
  const alloc=arr(plan?.allocations);
  const registered=alloc.filter(a=>String(a?.status||'').toUpperCase()==='REGISTERED').length;

  set('income11Cash',money(cash.total));
  set('income11CashMeta',`${money(cash.ig)} IG • ${money(cash.t212)} T212`);
  set('income11CyclePaidMeta',`${paid} paid calendar event${paid===1?'':'s'}`);
  set('income11CycleRecordedMeta',`${dividendRecords} visible dividend settlement${dividendRecords===1?'':'s'}`);
  set('income11CycleCashMeta',`${money(cash.total)} available • ${money(cash.ig)} IG • ${money(cash.t212)} T212`);
  set('income11CycleDeployMeta',plan&&alloc.length
    ?`${String(plan.strategy||'').toUpperCase()} • ${registered}/${alloc.length} registered • ${money(plan.allocated||0)} planned`
    :'No active dividend-cash deployment plan');

  const stages=[
    ['income11CyclePaid',paid>0],
    ['income11CycleRecorded',dividendRecords>0],
    ['income11CycleCash',cash.total>0],
    ['income11CycleDeploy',!!(plan&&alloc.length)]
  ];
  stages.forEach(([id,on])=>{
    const el=$(id);
    if(!el)return;
    el.classList.toggle('good',!!on);
    el.classList.toggle('active',!on);
  });
}

/* Promotion forecast */
function paceFromHistory(s){
  const rows=arr(s?.income?.history)
    .map(x=>({at:new Date(x.at),annual:num(x.annualIncome)}))
    .filter(x=>Number.isFinite(x.at.getTime())&&x.annual>=0)
    .sort((a,b)=>a.at-b.at);
  if(rows.length<2)return null;

  const latest=rows[rows.length-1];
  let earliest=rows[0];
  // Prefer a recent history window if sufficient.
  const cutoff=latest.at.getTime()-180*86400000;
  const recent=rows.filter(x=>x.at.getTime()>=cutoff);
  if(recent.length>=2)earliest=recent[0];

  const days=(latest.at-earliest.at)/86400000;
  const deltaAnnual=latest.annual-earliest.annual;
  if(days<14||deltaAnnual<=0)return {days,deltaAnnual,paceMonthly:0,usable:false};

  const months=days/30.4375;
  const monthlyIncomeGain=deltaAnnual/12;
  const paceMonthly=monthlyIncomeGain/months;
  if(!(paceMonthly>0))return {days,deltaAnnual,paceMonthly:0,usable:false};
  return {days,deltaAnnual,paceMonthly,usable:true,earliest,latest};
}
function addMonths(date,months){
  return new Date(date.getTime()+months*30.4375*86400000);
}
function forecastTarget(current,target,pace,maxMonths=240){
  const gap=Math.max(0,target-current);
  if(current>=target)return {status:'reached',months:0,date:new Date()};
  if(!pace?.usable)return {status:'building'};
  const months=gap/pace.paceMonthly;
  if(!Number.isFinite(months)||months<0||months>maxMonths)return {status:'beyond',months};
  return {status:'forecast',months,date:addMonths(new Date(),months)};
}
function renderForecast(s,m){
  const current=num(m?.monthly);
  const routeAnnual=num($('routeUplift')?.textContent);
  const routeMonthly=routeAnnual/12;
  const afterRoute=current+routeMonthly;
  const target625=625;
  const target2000=2000;

  set('income11ForecastCurrent',`${money(current)}/m`);
  set('income11ForecastRoute',`${money(afterRoute)}/m`);
  set('income11ForecastRouteMeta',routeAnnual>0
    ?`${money(routeAnnual)}/yr remains a Transfer scenario until Registration`
    :'No active Transfer-route uplift');

  const pace=paceFromHistory(s);
  const longForecast=forecastTarget(current,target2000,pace,240);

  if(longForecast.status==='reached'){
    set('income13LikelyDate','GOAL REACHED');
    set('income13LikelyMeta','Canonical monthly income is already at or above £2,000.');
    set('income13ForecastDate2','GOAL REACHED');
    set('income13ForecastVerdict2','£2,000/month has already been achieved.');
  }else if(longForecast.status==='forecast'){
    const dateText=longForecast.date.toLocaleDateString('en-GB',{month:'short',year:'numeric'});
    set('income13LikelyDate',dateText);
    set('income13LikelyMeta',`about ${longForecast.months.toFixed(1)} months at the current observed Income pace`);
    set('income13ForecastDate2',dateText);
    set('income13ForecastVerdict2',`Observed Income growth points to roughly ${dateText} if the same pace is sustained.`);
    set('income13EstimateNote',`Estimate uses ${pace.days.toFixed(0)} days of observed Income history. It is a projection, not a guarantee.`);
  }else if(longForecast.status==='beyond'){
    set('income13LikelyDate','Beyond 20 years');
    set('income13LikelyMeta','Current observed pace is too slow for a useful long-term date.');
    set('income13ForecastDate2','Beyond range');
    set('income13ForecastVerdict2','Observed Income pace would need to improve to reach £2,000/month within 20 years.');
  }else{
    const historyText=pace
      ?`${Math.max(0,pace.days).toFixed(0)} days observed • need 14+ days and positive growth`
      :'Income history needs at least two snapshots';
    set('income13LikelyDate','Building');
    set('income13LikelyMeta',historyText);
    set('income13ForecastDate2','Building');
    set('income13ForecastVerdict2','Aurora needs enough observed positive Income growth to estimate the £2,000/month date.');
  }

  if(current>=target625){
    set('income11ForecastPace','TARGET REACHED');
    set('income11ForecastPaceMeta','Canonical monthly income is already at or above £625.');
    set('income11ForecastDate','PROMOTED');
    set('income11ForecastDateMeta','First target achieved');
    set('income11TargetVerdict','£625/month has already been reached. The roadmap now continues toward £2,000/month.');
    return;
  }

  if(!pace?.usable){
    set('income11ForecastPace','Building');
    set('income11ForecastPaceMeta',pace
      ?`${Math.max(0,pace.days).toFixed(0)} days of usable history • need 14+ days and positive growth`
      :'Income history needs at least two snapshots');
    set('income11ForecastDate','—');
    set('income11ForecastDateMeta','Historical pace only appears when evidence is sufficient');
    const routeGap=Math.max(0,target625-afterRoute);
    set('income11TargetVerdict',routeAnnual>0
      ?`After the current Transfer scenario, ${money(routeGap)}/month would still remain to £625.`
      :'Building enough Income history to judge the 1 Mar 2028 pace.');
    return;
  }

  const firstForecast=forecastTarget(current,target625,pace,120);
  if(firstForecast.status!=='forecast'){
    set('income11ForecastPace',`${money(pace.paceMonthly)}/m`);
    set('income11ForecastPaceMeta',`${pace.days.toFixed(0)} days of observed Income history`);
    set('income11ForecastDate','Beyond range');
    set('income11ForecastDateMeta','Observed pace is too slow for a useful 10-year projection');
    set('income11TargetVerdict','Observed pace currently needs improvement versus the £625/month target.');
    return;
  }

  const targetDate=new Date('2028-03-01T12:00:00');
  set('income11ForecastPace',`${money(pace.paceMonthly)}/m`);
  set('income11ForecastPaceMeta',`monthly-income gain per month, observed across ${pace.days.toFixed(0)} days`);
  set('income11ForecastDate',firstForecast.date.toLocaleDateString('en-GB',{month:'short',year:'numeric'}));
  set('income11ForecastDateMeta',`about ${firstForecast.months.toFixed(1)} months at the same observed pace`);
  set('income11TargetVerdict',firstForecast.date<=targetDate
    ?'Observed Income pace is currently ahead of the 1 Mar 2028 target date.'
    :'Observed Income pace currently lands after 1 Mar 2028.');
}

/* Income change feed */
function renderChangeFeed(s){
  const rows=arr(s?.income?.history);
  const changes=[];
  for(let i=0;i<rows.length-1;i++){
    const current=rows[i],older=rows[i+1];
    const diff=num(current?.annualIncome)-num(older?.annualIncome);
    if(Math.abs(diff)<0.005)continue;
    changes.push({current,diff});
  }
  set('income11ChangeCount',`${Math.min(6,changes.length)} CHANGE${Math.min(6,changes.length)===1?'':'S'}`);

  const host=$('income11ChangeList');
  if(!host)return;
  if(!changes.length){
    host.innerHTML='<div class="income11-empty">No forward-income changes have been recorded beyond the current baseline yet.</div>';
    return;
  }
  host.innerHTML=changes.slice(0,6).map(x=>{
    const annual=x.diff;
    const monthly=annual/12;
    const positive=annual>0;
    const when=x.current?.at?new Date(x.current.at).toLocaleString('en-GB'):'Unknown time';
    return `<div class="income11-change-row">
      <div>
        <strong>${esc(x.current?.reason||'Forward income changed')}</strong>
        <span>${esc(when)} • new run-rate ${money(x.current?.annualIncome||0)}/yr</span>
      </div>
      <div class="income11-change-delta ${positive?'good':'bad'}">
        ${positive?'+':'−'} ${money(Math.abs(annual))}
        <small>${positive?'+':'−'} ${money(Math.abs(monthly))}/month</small>
      </div>
    </div>`;
  }).join('');
}

function render(){
  const s=state();
  const m=metrics();
  if(!m)return;

  renderReliability(s,m);
  renderConcentration(m);
  renderCashCycle(s);
  renderForecast(s,m);
  renderChangeFeed(s);

  const late=reliabilityData(s,m).counts.late;
  const status=$('income11CommandStatus');
  if(status){
    status.className='income11-command-status';
    if(late){
      status.textContent='ATTENTION';
      status.classList.add('warn');
    }else{
      status.textContent='INCOME CURRENT';
      status.classList.add('good');
    }
  }
}

function jump(id){
  const el=$(id);
  if(!el)return;
  const offset=(document.querySelector('.aurora-shell-header')?.offsetHeight||0)+(document.querySelector('.income-jumpbar')?.offsetHeight||0)+18;
  window.scrollTo({top:Math.max(0,el.getBoundingClientRect().top+window.scrollY-offset),behavior:'smooth'});
}

function bind(){
  $('income11OpenTreasury')?.addEventListener('click',()=>jump('brokerDividendCashSection'));

  // Existing Income / Treasury renderers update these surfaces.
  const observer=new MutationObserver(()=>render());
  const ids=[
    'kAnnual','kMonthly','routeUplift','playerList','accountGrid',
    'calendarList','calendarCoverage','historyList','cashBalanceIG','cashBalanceT212','cashLedger','cashPlan'
  ];
  ids.forEach(id=>{
    const el=$(id);
    if(el)observer.observe(el,{childList:true,subtree:true,characterData:true});
  });

  // Treasury is injected dynamically. Watch only until it appears,
  // attach observers to its live values once, then disconnect the body watcher.
  // Never render from an always-on body observer: rendering this UI changes the
  // DOM itself and would otherwise create a self-triggering render loop.
  const treasuryIds=['cashBalanceIG','cashBalanceT212','cashLedger','cashPlan'];
  const attachTreasuryObservers=()=>{
    let found=0;
    treasuryIds.forEach(id=>{
      const el=$(id);
      if(!el)return;
      found++;
      if(!el.dataset.income11Observed){
        el.dataset.income11Observed='1';
        observer.observe(el,{childList:true,subtree:true,characterData:true});
      }
    });
    return found===treasuryIds.length || !!$('brokerDividendCashSection');
  };

  if(attachTreasuryObservers()){
    setTimeout(render,0);
  }else{
    const bodyObserver=new MutationObserver(()=>{
      if(!attachTreasuryObservers())return;
      bodyObserver.disconnect();
      setTimeout(render,0);
    });
    bodyObserver.observe(document.body,{childList:true,subtree:true});
    // Safety stop if the treasury module never injects.
    setTimeout(()=>bodyObserver.disconnect(),5000);
  }

  window.addEventListener('storage',()=>setTimeout(render,70));
  window.addEventListener('aurora2:state',()=>setTimeout(render,40));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(render,80)});
  document.addEventListener('click',()=>setTimeout(render,100));

  setTimeout(render,90);
  setTimeout(render,700);
  setTimeout(render,1800);
}

document.addEventListener('DOMContentLoaded',bind);
})();


/* =========================================================
   INCOME UI v1.1.5 — RUNWAY INTELLIGENCE
   Rendering only; Income Runway Intelligence owns the summary.
   ========================================================= */
(function(){
'use strict';

const A=()=>window.Aurora2;
const $=id=>document.getElementById(id);
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(num(v));

function getSummary(){
  try{
    const s=A()?.core?.read?.()||{};
    return A()?.incomeRunway?.summary?.(s)||s.income?.runwaySummary||null;
  }catch(_){return null}
}
function set(id,v){const el=$(id);if(el)el.textContent=v}
function jump(id){
  const el=$(id);if(!el)return;
  const offset=(document.querySelector('.aurora-shell-header')?.offsetHeight||0)+(document.querySelector('.income-jumpbar')?.offsetHeight||0)+18;
  window.scrollTo({top:Math.max(0,el.getBoundingClientRect().top+window.scrollY-offset),behavior:'smooth'});
}

function render(){
  const r=getSummary();
  if(!r)return;

  set('income15Confirmed',money(r.confirmedGbp));
  set('income15ConfirmedMeta',`${r.confirmedCount||0} confirmed event${r.confirmedCount===1?'':'s'}`);
  set('income15Forecast',money(r.forecastGbp));
  set('income15ForecastMeta',`${r.forecastCount||0} forecast event${r.forecastCount===1?'':'s'}`);
  set('income15UnscheduledAmount',money(r.unscheduledAnnualGbp));
  set('income15Mapped',`${num(r.mappedPct).toFixed(1)}%`);
  set('income15MappedMeta',`${r.confidence||'LOW'} calendar confidence • ${money(r.scheduledGbp)} dated`);
  set('calendarCoverage',`${(r.confirmedCount||0)+(r.forecastCount||0)} dated • ${money(r.unscheduledAnnualGbp)} unscheduled`);
  set('income15UnscheduledHeadline',`${money(r.unscheduledAnnualGbp)}/year still needs calendar intelligence`);

  const note=$('income15UnscheduledNote');
  if(note){
    note.textContent=num(r.unscheduledAnnualGbp)>0
      ?'This income is real in the canonical forward run-rate, but Aurora does not yet have a trusted future payment date for it. Dividend Intelligence or a manual update will move it into the dated runway.'
      :'The full forward annual run-rate is represented by dated confirmed/forecast events in the next 12 months.';
  }

  const host=$('monthGrid');
  if(host){
    host.innerHTML=(r.months||[]).map(m=>{
      const total=num(m.totalGbp),confirmed=num(m.confirmedGbp),forecast=num(m.forecastGbp);
      const classes=['month-card','income15-month-card'];
      if(confirmed>0)classes.push('has-confirmed');
      if(forecast>0)classes.push('has-forecast');
      return `<article class="${classes.join(' ')}">
        <small>${m.label} ${String(m.year).slice(-2)}</small>
        <strong>${total>0?money(total):'—'}</strong>
        <span>${total>0?`${(m.confirmedCount||0)+(m.forecastCount||0)} dated payment${((m.confirmedCount||0)+(m.forecastCount||0))===1?'':'s'}`:'No dated events'}</span>
        ${total>0?`<div class="income15-month-split">
          <div class="confirmed"><span>Confirmed</span><b>${confirmed>0?money(confirmed):'—'}</b></div>
          <div class="forecast"><span>Forecast</span><b>${forecast>0?money(forecast):'—'}</b></div>
        </div>`:'<em class="income15-month-empty">Income stays unscheduled until a reliable date exists.</em>'}
      </article>`;
    }).join('');
  }
}

function bind(){
  $('income15RunIntelligence')?.addEventListener('click',()=>{
    const btn=$('runDividendEngine');
    if(btn){btn.click();setTimeout(()=>jump('dividendEngineSection'),80)}
    else jump('dividendEngineSection');
  });
  $('income15AddDividend')?.addEventListener('click',()=>jump('dividendCalendarSection'));

  window.addEventListener('aurora2:state',()=>setTimeout(render,0));
  window.addEventListener('storage',()=>setTimeout(render,30));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(render,30)});
  [0,100,450,1200].forEach(ms=>setTimeout(render,ms));
}
document.addEventListener('DOMContentLoaded',bind);
})();
