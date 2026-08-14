(function(w){
'use strict';

const A=()=>w.Aurora2;
const D=()=>w.AuroraData2Client;
const arr=v=>Array.isArray(v)?v:[];
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(num(v));
const pct=v=>`${num(v)>=0?'+':''}${num(v).toFixed(2)}%`;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const tk=v=>String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();
const norm=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const $=id=>document.getElementById(id);
const set=(id,v)=>{const el=$(id);if(el)el.textContent=v??'—'};
let dashboard=null;
let range='1D';
let chartMode='RETURN';
let makeupMode='BROKER';
let holdingLookup=new Map();

function parseDate(v){
  if(!v)return null;
  const d=new Date(String(v).length<=10?`${String(v).slice(0,10)}T12:00:00`:v);
  return Number.isNaN(d.getTime())?null:d;
}
function todayStart(){
  const d=new Date();d.setHours(0,0,0,0);return d;
}
function daysUntil(v){
  const d=parseDate(v);if(!d)return null;
  return Math.max(0,Math.ceil((d-todayStart())/86400000));
}
function activeHoldings(s){
  return arr(s.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h.status||'ACTIVE').toUpperCase())&&num(h.shares)>0);
}
function holdingIncome(h){
  const shares=num(h.shares),dps=num(h.annualDpsGbp);
  return dps>0?shares*dps:num(h.annualIncomeGbp);
}
function portfolioMetrics(s){
  const hs=activeHoldings(s);
  const value=hs.reduce((x,h)=>x+num(h.marketValueGbp),0);
  const book=hs.reduce((x,h)=>x+num(h.bookCostGbp),0);
  const pl=hs.reduce((x,h)=>x+num(h.profitLossGbp),0);
  const annual=hs.reduce((x,h)=>x+holdingIncome(h),0);
  return {hs,value,book,pl,annual,monthly:annual/12};
}
function nextDividend(s){
  const now=todayStart();
  const list=arr(s.income?.calendar)
    .filter(e=>!['PAID','CANCELLED','ARCHIVED'].includes(String(e.status||'').toUpperCase()))
    .map(e=>({...e,__date:parseDate(e.payDate)}))
    .filter(e=>e.__date&&e.__date>=now)
    .sort((a,b)=>a.__date-b.__date);
  const e=list[0];
  if(e)return {
    ticker:tk(e.ticker),name:e.name||e.ticker||'',account:e.account||'',
    amount:num(e.actualAmountGbp)||num(e.expectedAmountGbp),date:e.payDate,status:e.status||'FORECAST'
  };
  return s.income?.nextDividend||null;
}
function fmtDate(v,opts={day:'2-digit',month:'short'}){
  const d=parseDate(v);return d?d.toLocaleDateString('en-GB',opts):'—';
}
function currentMarket(){
  return dashboard?.market||null;
}

async function loadDashboard(){
  if(!D()?.post)return null;
  try{
    const res=await D().post('nexusDashboardSnapshot',{});
    dashboard=res;
    return res;
  }catch(err){
    dashboard={ok:false,error:String(err?.message||err),market:null,history:[]};
    return dashboard;
  }
}

function stageLabel(v){
  return ({FINANCE_APPROVED:'Finance',SCOUTING_READY:'Scouting',TRANSFER_READY:'Transfer',REGISTERED:'Registered'})[String(v||'')]||'No mission';
}
function financeHoldingPot(s){
  return arr(s.finance?.pots).find(p=>!p.archived&&norm(p.name)==='holding pot')||null;
}
function activeMission(s){
  const m=s.mission;
  return m&&!['CANCELLED','COMPLETED','ARCHIVED'].includes(String(m.status||'').toUpperCase())&&num(m.approvedBudget)>0?m:null;
}
function routeIncome(r){
  if(!r)return 0;
  return num(r.income)||arr(r.allocations).reduce((x,a)=>x+num(a.expectedAnnualIncome),0);
}

function attentionItems(s,metrics,nd){
  const items=[];
  const mission=activeMission(s);
  const drafts=arr(s.transfer?.registrationDrafts);
  const waiting=drafts.filter(d=>!['CONFIRMED','CANCELLED'].includes(String(d.status||'').toUpperCase()));
  const connection=String(s.connection?.status||'LOCAL').toUpperCase();

  if(waiting.length){
    items.push({tone:'block',icon:'!',title:`${waiting.length} purchase${waiting.length===1?'':'s'} waiting at Registration`,note:'Broker reality still needs confirmation.',href:'registration.html',link:'Open Registration'});
  }
  if(mission&&String(mission.status)==='TRANSFER_READY'){
    items.push({tone:'warn',icon:'↗',title:'Transfer route is ready for execution',note:`${money(mission.approvedBudget)} is in the active mission.`,href:'transfer.html',link:'Open Transfer'});
  }
  if(connection!=='CONNECTED'){
    items.push({tone:'warn',icon:'⌁',title:'AuroraData 2 connection needs checking',note:`Current state reports ${connection}.`,href:'club-control.html',link:'Club Control'});
  }
  if(nd&&daysUntil(nd.date)!=null&&daysUntil(nd.date)<=7){
    items.push({tone:'good',icon:'£',title:`${tk(nd.ticker)} dividend due in ${daysUntil(nd.date)} day${daysUntil(nd.date)===1?'':'s'}`,note:`Expected ${money(nd.amount)} on ${fmtDate(nd.date,{weekday:'short',day:'2-digit',month:'short'})}.`,href:'income.html',link:'Income Centre'});
  }
  const strategy=String(s.scouting?.strategy||'sustainable').toLowerCase();
  const key=strategy==='maximum'?'maximumScore':'sustainableScore';
  const leader=[...arr(s.scouting?.targets)].filter(x=>String(x.status||'').toLowerCase()!=='block').sort((a,b)=>num(b[key])-num(a[key]))[0];
  if(leader&&num(leader[key])>=75){
    items.push({tone:'info',icon:'◉',title:`Scouting leader: ${tk(leader.ticker)} ${num(leader[key]).toFixed(0)}/100`,note:`${strategy==='maximum'?'Maximum Income':'Sustainable'} recruitment board leader.`,href:'scouting.html',link:'Open Scouting'});
  }
  if(!items.length){
    items.push({tone:'good',icon:'✓',title:'All departments clear',note:'No immediate manager action is being flagged by Nexus.',href:'index.html',link:'Nexus'});
  }
  return items;
}

function renderBriefing(s,m,nd,items){
  const market=currentMarket();
  const sentences=[];
  if(market&&market.status==='READY'){
    const move=num(market.portfolioTodayChangeGbp);
    sentences.push(`Portfolio is ${move>=0?'up':'down'} ${money(Math.abs(move))} today (${pct(market.portfolioTodayChangePct)}).`);
    if(market.best?.ticker)sentences.push(`${market.best.ticker} is today's strongest holding at ${pct(market.best.dayChangePct)}.`);
    if(market.worst?.ticker)sentences.push(`${market.worst.ticker} is the weakest at ${pct(market.worst.dayChangePct)}.`);
  }else{
    sentences.push(`Portfolio value is ${money(m.value)} with annual dividend income of ${money(m.annual)}.`);
  }
  if(nd){
    const d=daysUntil(nd.date);
    sentences.push(`Next dividend is ${money(nd.amount)} from ${tk(nd.ticker)}${d!=null?` in ${d} day${d===1?'':'s'}`:''}.`);
  }
  const first=items.find(x=>x.tone==='block'||x.tone==='warn');
  sentences.push(first?first.title:'No urgent manager action is required.');
  set('hq3Briefing',sentences.join(' '));

  const top=items[0];
  set('hq3AttentionTitle',top.title);
  set('hq3AttentionNote',top.note);
  const a=$('hq3AttentionLink');if(a){a.href=top.href||'index.html';a.textContent=top.link||'Open'}
}

function renderTop(s,m,nd){
  const market=currentMarket();
  set('currentDepartment','NEXUS HQ • CLUB HEADQUARTERS');
  document.title='Aurora City FC — Nexus HQ 4.4';
  set('hq3Connection',String(s.connection?.status||'LOCAL').toUpperCase()==='CONNECTED'?'● CLUB SYSTEMS LIVE':'● CLUB SYSTEMS CHECK');
  const strategy=String(s.transfer?.route?.strategy||s.transfer?.settings?.strategy||s.scouting?.strategy||'—').toUpperCase();
  set('hq3Strategy',`STRATEGY • ${strategy}`);
  const at=dashboard?.at||s.squad?.canonicalSync?.at||s.updatedAt;
  set('hq3DataStamp',`DATA • ${at?new Date(at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'—'}`);

  set('hq3Value',money(m.value));
  set('hq3ValueMeta',`${new Set(m.hs.map(h=>tk(h.ticker))).size} shares • ${m.hs.length} positions`);
  set('hq3Annual',money(m.annual));
  set('hq3Monthly',`${money(m.monthly)} / month`);
  set('hq3NextDividend',nd?tk(nd.ticker):'—');
  set('hq3NextDividendMeta',nd?`${money(nd.amount)} • ${fmtDate(nd.date)}`:'Income calendar pending');

  const plan=s.finance?.plan||{};
  const mission=activeMission(s);
  const release=mission?num(mission.approvedBudget):num(plan.releaseAmount);
  set('hq3SafeRelease',money(release));
  set('hq3Payday',`Payday ${plan.paydayDate?fmtDate(plan.paydayDate,{weekday:'short',day:'2-digit',month:'short'}):'—'}`);

  const todayEl=$('hq3Today'),todayPct=$('hq3TodayPct');
  if(market&&market.status==='READY'){
    const change=num(market.portfolioTodayChangeGbp);
    todayEl.textContent=`${change>=0?'+':'−'}${money(Math.abs(change))}`;
    todayEl.className=change>=0?'positive':'negative';
    todayPct.textContent=pct(market.portfolioTodayChangePct);
  }else{
    todayEl.textContent='—';
    todayEl.className='';
    todayPct.textContent='Daily market engine pending';
  }
}

function hq44AccountCode(v){
  const s=String(v||'').toLowerCase();
  if(s.includes('212'))return 'T212';
  if(/\big\b/.test(s)||s.includes('ig isa'))return 'IG';
  return String(v||'').trim().toUpperCase();
}

function hq44AccountMetrics(s,account){
  const hs=activeHoldings(s).filter(h=>hq44AccountCode(h.account)===account);
  const value=hs.reduce((sum,h)=>sum+num(h.marketValueGbp),0);
  const book=hs.reduce((sum,h)=>sum+num(h.bookCostGbp),0);
  const pl=hs.reduce((sum,h)=>sum+num(h.profitLossGbp),0);
  return {value,book,pl,returnPct:book>0?pl/book*100:0,positions:hs.length};
}

function hq44ReturnPct(value,book){
  return num(book)>0?((num(value)-num(book))/num(book))*100:0;
}

function hq44HistoryValue(row,series,mode){
  if(series==='overall'){
    return mode==='VALUE'?num(row.portfolioValueGbp):hq44ReturnPct(row.portfolioValueGbp,row.bookCostGbp);
  }
  if(series==='ig'){
    if(mode==='VALUE')return num(row.igValueGbp);
    return num(row.igBookCostGbp)>0?hq44ReturnPct(row.igValueGbp,row.igBookCostGbp):null;
  }
  if(series==='t212'){
    if(mode==='VALUE')return num(row.t212ValueGbp);
    return num(row.t212BookCostGbp)>0?hq44ReturnPct(row.t212ValueGbp,row.t212BookCostGbp):null;
  }
  return null;
}

function historyWindow(rows,windowName){
  const now=Date.now();
  const spans={ '1D':36*3600000,'7D':7*86400000,'30D':30*86400000,'3M':93*86400000,'1Y':366*86400000};
  const span=spans[windowName]||spans['1D'];
  const filtered=arr(rows).filter(x=>{
    const t=new Date(x.timestamp||x.at||x.recordedAt||0).getTime();
    return Number.isFinite(t)&&t>=now-span&&num(x.portfolioValueGbp)>0;
  });
  return filtered.length?filtered:arr(rows).filter(x=>num(x.portfolioValueGbp)>0).slice(-2);
}

function renderLineChart(s,m){
  const ig=hq44AccountMetrics(s,'IG');
  const t212=hq44AccountMetrics(s,'T212');
  const overallReturn=m.book>0?m.pl/m.book*100:0;

  set('hq3PL',`${m.pl>=0?'+':''}${money(m.pl)}`);
  const pl=$('hq3PL');if(pl)pl.className=m.pl>=0?'positive':'negative';
  set('hq44OverallMeta',`${money(m.value)} value • ${pct(overallReturn)} return`);

  set('hq44IgPL',`${ig.pl>=0?'+':''}${money(ig.pl)}`);
  const igPl=$('hq44IgPL');if(igPl)igPl.className=ig.pl>=0?'positive':'negative';
  set('hq44IgMeta',`${money(ig.value)} value • ${pct(ig.returnPct)} return`);

  set('hq44T212PL',`${t212.pl>=0?'+':''}${money(t212.pl)}`);
  const tPl=$('hq44T212PL');if(tPl)tPl.className=t212.pl>=0?'positive':'negative';
  set('hq44T212Meta',`${money(t212.value)} value • ${pct(t212.returnPct)} return`);

  const market=currentMarket();
  if(market&&market.status==='READY'){
    const move=num(market.portfolioTodayChangeGbp);
    set('hq3ChartToday',`${move>=0?'+':'−'}${money(Math.abs(move))}`);
    const e=$('hq3ChartToday');if(e)e.className=move>=0?'positive':'negative';
    set('hq44TodayMeta',`${pct(market.portfolioTodayChangePct)} today`);
  }else{
    set('hq3ChartToday','—');
    set('hq44TodayMeta','Daily market engine pending');
  }

  const rows=historyWindow(dashboard?.history||[],range);
  const svg=$('hq3PortfolioChart'),empty=$('hq3ChartEmpty'),note=$('hq44BrokerHistoryNote');
  if(!svg)return;
  if(rows.length<2){
    svg.innerHTML='';
    if(empty)empty.hidden=false;
    return;
  }
  if(empty)empty.hidden=true;

  const W=800,H=280,L=42,R=18,T=18,B=30;
  const x=i=>L+(W-L-R)*(i/(rows.length-1));
  const defs=[
    {key:'overall',cls:'overall',label:'Overall Portfolio'},
    {key:'ig',cls:'ig',label:'IG ISA'},
    {key:'t212',cls:'t212',label:'Trading 212 ISA'}
  ];
  const series=defs.map(def=>({
    ...def,
    points:rows.map((row,i)=>({i,value:hq44HistoryValue(row,def.key,chartMode)}))
      .filter(p=>p.value!=null&&Number.isFinite(Number(p.value))&&(def.key==='overall'||chartMode==='RETURN'||num(p.value)>0))
  })).filter(sx=>sx.points.length>=2);

  const values=series.flatMap(sx=>sx.points.map(p=>num(p.value)));
  if(!values.length){
    svg.innerHTML='';
    if(empty)empty.hidden=false;
    return;
  }

  let min=Math.min(...values),max=Math.max(...values);
  if(chartMode==='RETURN'){
    min=Math.min(min,0);max=Math.max(max,0);
  }
  const spread=Math.max(.5,max-min);
  const pad=spread*.16;
  min-=pad;max+=pad;
  const y=v=>T+(H-T-B)*(1-(v-min)/(max-min||1));

  const pathFor=pts=>pts.map((p,j)=>`${j?'L':'M'} ${x(p.i).toFixed(2)} ${y(num(p.value)).toFixed(2)}`).join(' ');
  const paths=series.map(sx=>{
    const path=pathFor(sx.points);
    const last=sx.points[sx.points.length-1];
    return `<path d="${path}" class="hq44-chart-line ${sx.cls}"></path><circle cx="${x(last.i)}" cy="${y(num(last.value))}" r="3.7" class="hq44-chart-dot ${sx.cls}"></circle>`;
  }).join('');

  const firstDate=new Date(rows[0].timestamp||rows[0].at);
  const lastDate=new Date(rows[rows.length-1].timestamp||rows[rows.length-1].at);
  const axisTop=chartMode==='VALUE'?money(max):`${max.toFixed(2)}%`;
  const axisBottom=chartMode==='VALUE'?money(min):`${min.toFixed(2)}%`;
  const zeroLine=chartMode==='RETURN'&&min<0&&max>0
    ?`<line x1="${L}" y1="${y(0)}" x2="${W-R}" y2="${y(0)}" class="hq44-zero-line"></line>`:'';

  svg.innerHTML=`
    ${zeroLine}
    ${paths}
    <text x="${L}" y="${H-8}" class="hq3-chart-axis">${esc(firstDate.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}))}</text>
    <text x="${W-R}" y="${H-8}" text-anchor="end" class="hq3-chart-axis">${esc(lastDate.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}))}</text>
    <text x="${L}" y="${T+10}" class="hq3-chart-axis">${esc(axisTop)}</text>
    <text x="${L}" y="${H-B-6}" class="hq3-chart-axis">${esc(axisBottom)}</text>
  `;

  const hasIg=series.some(x=>x.key==='ig');
  const hasT212=series.some(x=>x.key==='t212');
  if(note){
    note.textContent=hasIg&&hasT212
      ?`${chartMode==='RETURN'?'Return %':'£ value'} history is live for Overall, IG ISA and Trading 212 ISA.`
      :'Overall history is live. Broker-specific history starts from the first Nexus Dashboard Engine v1.1 snapshot and will build automatically each hour.';
  }
}
function renderMovers(){
  const market=currentMarket();
  const status=$('hq3MarketStatus');

  if(!market||market.status!=='READY'){
    if(status){status.textContent='PENDING';status.className='hq4-status-chip'}
    set('hq43PulseMove','—');
    set('hq43PulsePct','—');
    set('hq43PulseTone','Daily market engine is waiting for live previous-close data.');
    set('hq43Advancers','—');
    set('hq43Decliners','—');
    set('hq43Flat','—');
    set('hq43Breadth','—');
    set('hq43PositiveContribution','Positive contribution —');
    set('hq43NegativeContribution','Negative contribution —');
    set('hq43Coverage','Coverage —');
    set('hq43BreadthMeta','Advancers vs decliners');
    set('hq43BiggestLift','—');
    set('hq43BiggestDrag','—');
    const bar=$('hq43BreadthBar'); if(bar)bar.style.width='50%';
    return;
  }

  const movers=arr(market.movers).filter(x=>Number.isFinite(Number(x.dayChangePct)));
  const adv=movers.filter(x=>num(x.dayChangePct)>0);
  const dec=movers.filter(x=>num(x.dayChangePct)<0);
  const flat=movers.filter(x=>num(x.dayChangePct)===0);

  const positive=adv.reduce((sum,x)=>sum+Math.max(0,num(x.dayChangeGbp)),0);
  const negative=dec.reduce((sum,x)=>sum+Math.min(0,num(x.dayChangeGbp)),0);
  const totalMove=movers.reduce((sum,x)=>sum+num(x.dayChangeGbp),0);

  const state=A()?.core?.read?.()||{};
  const hs=activeHoldings(state);
  const totalValue=hs.reduce((sum,h)=>sum+num(h.marketValueGbp),0);
  const pct=totalValue?totalMove/(totalValue-totalMove)*100:0;

  const breadthDen=Math.max(1,adv.length+dec.length);
  const breadthPct=(adv.length/breadthDen)*100;

  let tone='BALANCED';
  if(totalMove>0 && adv.length>=dec.length) tone='POSITIVE SESSION';
  else if(totalMove<0 && dec.length>adv.length) tone='PRESSURE SESSION';
  else if(Math.abs(totalMove)<1) tone='FLAT SESSION';

  if(status){
    status.textContent='LIVE';
    status.className='hq4-status-chip';
  }

  set('hq43PulseMove',`${totalMove>=0?'+':''}${money(totalMove)}`);
  set('hq43PulsePct',`${pct>=0?'+':''}${pct.toFixed(2)}%`);
  set('hq43PulseTone',`${tone} • ${adv.length} up / ${dec.length} down`);
  set('hq43Advancers',String(adv.length));
  set('hq43Decliners',String(dec.length));
  set('hq43Flat',String(flat.length));
  set('hq43Breadth',`${breadthPct.toFixed(0)}%`);
  set('hq43PositiveContribution',`+${money(positive)} contribution`);
  set('hq43NegativeContribution',`${money(negative)} contribution`);
  set('hq43Coverage',`${movers.length} live tickers`);
  set('hq43BreadthMeta',`${adv.length} advancers vs ${dec.length} decliners`);

  const bar=$('hq43BreadthBar');
  if(bar)bar.style.width=`${Math.max(0,Math.min(100,breadthPct))}%`;

  const lift=[...movers].sort((a,b)=>num(b.dayChangeGbp)-num(a.dayChangeGbp))[0];
  const drag=[...movers].sort((a,b)=>num(a.dayChangeGbp)-num(b.dayChangeGbp))[0];

  set('hq43BiggestLift',lift?`${tk(lift.ticker)} • ${num(lift.dayChangeGbp)>=0?'+':''}${money(num(lift.dayChangeGbp))}`:'—');
  set('hq43BiggestDrag',drag?`${tk(drag.ticker)} • ${money(num(drag.dayChangeGbp))}`:'—');
}
function marketMoveForTicker(ticker){
  const wanted=tk(ticker);
  return arr(currentMarket()?.movers).find(x=>tk(x.ticker)===wanted)||null;
}

function holdingAnnual(h){
  return holdingIncome(h);
}

function holdingYieldPct(h){
  const value=num(h.marketValueGbp),annual=holdingAnnual(h);
  return value>0?(annual/value)*100:0;
}

function holdingKey(h,index){
  return String(h.holdingId||`${h.account||'ACCOUNT'}:${tk(h.ticker)}:${index}`);
}

function aggregateDailyHolding(ticker,m,move){
  const rows=m.hs.filter(h=>tk(h.ticker)===tk(ticker));
  if(!rows.length)return null;
  const shares=rows.reduce((sum,h)=>sum+num(h.shares),0);
  const book=rows.reduce((sum,h)=>sum+num(h.bookCostGbp),0);
  const value=rows.reduce((sum,h)=>sum+num(h.marketValueGbp),0);
  const annual=rows.reduce((sum,h)=>sum+holdingAnnual(h),0);
  const pl=rows.reduce((sum,h)=>sum+num(h.profitLossGbp),0);
  const accounts=[...new Set(rows.map(h=>String(h.account||'').trim()).filter(Boolean))];
  const sectors=[...new Set(rows.map(h=>String(h.sector||'').trim()).filter(Boolean))];
  return {
    holdingId:`NEXUS-DAILY-${tk(ticker)}`,
    ticker:tk(ticker), name:move?.name||rows[0]?.name||tk(ticker),
    account:accounts.join(' + ')||'Canonical Squad', shares,
    bookCostGbp:book, marketValueGbp:value, profitLossGbp:pl,
    annualDpsGbp:shares>0?annual/shares:0, annualIncomeGbp:annual,
    livePriceGbp:num(move?.livePriceGbp)||num(rows[0]?.livePriceGbp),
    sector:sectors.length===1?sectors[0]:(sectors.length?'MULTI-SECTOR':''),
    role:'Daily Nexus portfolio form', status:'ACTIVE',
    source:'AURORA2_CANONICAL_DAILY_FORM',
    sourceUpdatedAt:currentMarket()?.updatedAt||currentMarket()?.generatedAt||''
  };
}

function dailyFormRow(move,m,index,side){
  const h=aggregateDailyHolding(move.ticker,m,move); if(!h)return '';
  const key=`DAILY:${tk(move.ticker)}`; holdingLookup.set(key,h);
  const pctMove=num(move.dayChangePct),cashMove=num(move.dayChangeGbp);
  const annual=holdingAnnual(h),value=num(h.marketValueGbp);
  const tone=pctMove>0?'up':pctMove<0?'down':'flat';
  return `
    <button class="hq42-form-row ${side} ${tone}" type="button" data-hq41-holding="${esc(key)}">
      <i class="hq42-rank">${index+1}</i>
      <div class="hq42-form-id"><strong>${esc(tk(move.ticker))}</strong><span>${esc(move.name||h.name||tk(move.ticker))}</span></div>
      <div class="hq42-form-value"><small>MARKET VALUE</small><strong>${money(value)}</strong></div>
      <div class="hq42-form-income"><small>ANNUAL INCOME</small><strong>${money(annual)}</strong></div>
      <div class="hq42-form-move ${tone}"><strong>${pctMove>=0?'+':''}${pctMove.toFixed(2)}%</strong><span>${cashMove>=0?'+':''}${money(cashMove)} today</span></div>
      <b>›</b>
    </button>`;
}

function renderPortfolioForm(s,m){
  const bestHost=$('hq42BestFive'),worstHost=$('hq42WorstFive');
  if(!bestHost||!worstHost)return;
  holdingLookup=new Map();
  const market=currentMarket();
  const movers=arr(market?.movers).filter(x=>Number.isFinite(Number(x.dayChangePct))).sort((a,b)=>num(b.dayChangePct)-num(a.dayChangePct));
  const coverage=$('hq42DailyCoverage'),stamp=$('hq42DailyStamp');
  if(!market||market.status!=='READY'||!movers.length){
    if(coverage)coverage.textContent='ENGINE PENDING';
    bestHost.innerHTML='<div class="hq42-form-empty">Daily form is waiting for live previous-close market data.</div>';
    worstHost.innerHTML='<div class="hq42-form-empty">Run the Nexus Dashboard Engine to populate today’s ranking.</div>';
    if(stamp)stamp.textContent='Market movement pending'; return;
  }
  const top=movers.slice(0,5);
  const worst=[...movers].sort((a,b)=>num(a.dayChangePct)-num(b.dayChangePct)).slice(0,5);
  if(coverage)coverage.textContent=`${movers.length} LIVE`;
  if(stamp){const at=market.updatedAt||market.generatedAt||market.at;stamp.textContent=at?`Updated ${fmtDate(at,{hour:'2-digit',minute:'2-digit'})}`:'Live previous-close feed';}
  bestHost.innerHTML=top.map((move,index)=>dailyFormRow(move,m,index,'best')).join('');
  worstHost.innerHTML=worst.map((move,index)=>dailyFormRow(move,m,index,'worst')).join('');
}
function openHoldingDrawer(key){
  const h=holdingLookup.get(String(key));
  if(!h)return;

  const drawer=$('hq41HoldingDrawer'),backdrop=$('hq41HoldingBackdrop'),content=$('hq41HoldingDrawerContent');
  if(!drawer||!backdrop||!content)return;

  const ticker=tk(h.ticker),annual=holdingAnnual(h),value=num(h.marketValueGbp),book=num(h.bookCostGbp);
  const y=holdingYieldPct(h),move=marketMoveForTicker(ticker),day=move?num(move.dayChangePct):null;
  const pl=num(h.profitLossGbp),shares=num(h.shares),price=num(h.livePriceGbp),dps=num(h.annualDpsGbp);

  content.innerHTML=`
    <div class="hq41-drawer-hero">
      <small>${esc(h.account||'Canonical Holding')}</small>
      <h2>${esc(ticker)}</h2>
      <p>${esc(h.name||ticker)}</p>
      <span>${esc(String(h.status||'ACTIVE').toUpperCase())}${h.sector?` • ${esc(h.sector)}`:''}</span>
    </div>

    <div class="hq41-drawer-metrics">
      <div><small>Market Value</small><strong>${money(value)}</strong></div>
      <div class="income"><small>Annual Income</small><strong>${money(annual)}</strong></div>
      <div><small>Shares / Units</small><strong>${shares.toLocaleString('en-GB',{maximumFractionDigits:4})}</strong></div>
      <div><small>Live Price</small><strong>${money(price)}</strong></div>
      <div><small>Book Cost</small><strong>${money(book)}</strong></div>
      <div class="${pl>=0?'positive':'negative'}"><small>Total P/L</small><strong>${pl>=0?'+':''}${money(pl)}</strong></div>
      <div><small>Portfolio Yield</small><strong>${y.toFixed(2)}%</strong></div>
      <div><small>Annual DPS</small><strong>${dps>0?money(dps):'—'}</strong></div>
    </div>

    <div class="hq41-drawer-section">
      <h4>Live Form</h4>
      <div class="hq41-form-line ${day==null?'neutral':day>0?'positive':day<0?'negative':'neutral'}">
        <i>${day==null?'—':day>0?'W':day<0?'L':'D'}</i>
        <div>
          <strong>${day==null?'Daily market move pending':`${day>=0?'+':''}${day.toFixed(2)}% today`}</strong>
          <span>${move?`${money(num(move.previousCloseGbp))} previous close → ${money(num(move.livePriceGbp))} live`:'Aurora 2 currently stores the live / previous-close session for this holding.'}</span>
        </div>
      </div>
    </div>

    <div class="hq41-drawer-section">
      <h4>Canonical Record</h4>
      <p>${esc(h.role||'Active income-squad holding')}${h.source?` • source ${esc(h.source)}`:''}${h.sourceUpdatedAt?` • updated ${esc(fmtDate(h.sourceUpdatedAt,{day:'2-digit',month:'short',year:'numeric'}))}`:''}</p>
    </div>

    <div class="hq41-drawer-links">
      <a href="squad.html">Open Squad Hub</a>
      <a href="income.html">Open Income Centre</a>
    </div>
  `;

  backdrop.hidden=false;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden','false');
}

function closeHoldingDrawer(){
  const drawer=$('hq41HoldingDrawer'),backdrop=$('hq41HoldingBackdrop');
  if(drawer){drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true')}
  if(backdrop)backdrop.hidden=true;
}

function renderIncomeRace(s,m){
  const target=625;
  const current=m.monthly;
  const progress=Math.max(0,Math.min(100,(current/target)*100));
  const gap=Math.max(0,target-current);
  const route=s.transfer?.route;
  const routeBoost=routeIncome(route)/12;
  const projected=current+routeBoost;

  set('hq41IncomeMonthly',money(current));
  set('hq41IncomeProgress',`${progress.toFixed(1)}% of £625`);
  set('hq41IncomeGap',gap>0?`${money(gap)}/m`:'TARGET REACHED');
  set('hq41IncomeAnnual',`${money(m.annual)}/yr`);
  set('hq41IncomeProjected',routeBoost>0?`${money(projected)}/m`:'No active route');

  const ring=$('hq41IncomeRing');
  if(ring)ring.style.setProperty('--progress',`${progress*3.6}deg`);

  const summary=$('hq41IncomeRaceSummary');
  if(summary){
    summary.textContent=gap>0
      ?`Current monthly income is ${money(current)}. ${money(gap)} per month remains to promotion. ${routeBoost>0?`The active Transfer route would add ${money(routeBoost)} per month if fully registered.`:'No active Transfer-route income is currently being added to the projection.'}`
      :`The £625 per month promotion target has been reached on the current canonical income run rate.`;
  }

  const milestones=[350,425,500,625];
  let nextMarked=false;
  const host=$('hq41IncomeMilestones');
  if(host){
    host.innerHTML=milestones.map(targetValue=>{
      const hit=current>=targetValue;
      const currentStep=!hit&&!nextMarked?(nextMarked=true,true):false;
      return `
        <div class="${hit?'hit':currentStep?'current':''}">
          <small>${hit?'PROMOTED':currentStep?'NEXT DIVISION':'FUTURE DIVISION'}</small>
          <strong>${money(targetValue)}/m</strong>
          <span>${hit?'Milestone achieved':`${money(Math.max(0,targetValue-current))} remaining`}</span>
        </div>
      `;
    }).join('');
  }
}

function renderDividends(s,m,nd){
  set('hq3DividendTicker',nd?tk(nd.ticker):'—');
  set('hq3DividendAmount',nd?money(nd.amount):'—');
  set('hq3DividendDate',nd?`${fmtDate(nd.date,{weekday:'long',day:'2-digit',month:'long'})} • ${nd.account||'account pending'}`:'Income calendar pending');
  set('hq3IncomeMonthly',money(m.monthly));

  const calendar=arr(s.income?.calendar);
  const now=new Date(),year=now.getFullYear();
  let received=0,next30=0;
  const in30=new Date(now.getTime()+30*86400000);
  calendar.forEach(e=>{
    const d=parseDate(e.payDate),amount=num(e.actualAmountGbp)||num(e.expectedAmountGbp);
    if(!d)return;
    if(d.getFullYear()===year&&String(e.status||'').toUpperCase()==='PAID')received+=amount;
    if(d>=todayStart()&&d<=in30&&!['PAID','CANCELLED','ARCHIVED'].includes(String(e.status||'').toUpperCase()))next30+=amount;
  });
  set('hq3IncomeReceived',money(received));
  set('hq3Income30',money(next30));
  set('hq3DividendYear',String(year));

  const upcoming=calendar
    .filter(e=>!['PAID','CANCELLED','ARCHIVED'].includes(String(e.status||'').toUpperCase()))
    .map(e=>({...e,__date:parseDate(e.payDate)})).filter(e=>e.__date&&e.__date>=todayStart())
    .sort((a,b)=>a.__date-b.__date).slice(0,5);
  const timeline=$('hq3DividendTimeline');
  if(timeline)timeline.innerHTML=upcoming.length?upcoming.map(e=>`
    <div class="event"><small>${esc(fmtDate(e.payDate,{day:'2-digit',month:'short'}))}</small><strong>${esc(tk(e.ticker))} • ${money(num(e.actualAmountGbp)||num(e.expectedAmountGbp))}</strong><span>${esc(e.account||'CHECK')} • ${esc(e.status||'FORECAST')}</span></div>
  `).join(''):'<div class="hq3-chart-empty" style="position:static;grid-column:1/-1;min-height:70px">No upcoming dividend events are currently published.</div>';

  const monthly=Array.from({length:12},()=>0);
  calendar.forEach(e=>{
    const d=parseDate(e.payDate);if(!d||d.getFullYear()!==year||String(e.status||'').toUpperCase()==='CANCELLED')return;
    monthly[d.getMonth()]+=num(e.actualAmountGbp)||num(e.expectedAmountGbp);
  });
  const max=Math.max(1,...monthly),months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const bars=$('hq3DividendBars');
  if(bars)bars.innerHTML=monthly.map((v,i)=>`
    <div class="month"><div class="bar-wrap"><i style="height:${Math.max(2,v/max*100)}%"></i></div><b>${v?money(v).replace('£','£'):''}</b><span>${months[i]}</span></div>
  `).join('');
}

function makeupData(s,m,mode){
  const map=new Map();
  m.hs.forEach(h=>{
    let key;
    if(mode==='BROKER'){
      const a=norm(h.account);
      key=a.includes('212')?'Trading 212':a.includes('ig')?'IG ISA':h.account||'Other';
    }else{
      key=String(h.sector||'Unclassified').trim()||'Unclassified';
    }
    map.set(key,(map.get(key)||0)+num(h.marketValueGbp));
  });
  return [...map.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
}
function renderMakeup(s,m){
  document.querySelectorAll('#hq3MakeupMode button').forEach(b=>b.classList.toggle('active',b.dataset.mode===makeupMode));
  const rows=makeupData(s,m,makeupMode),total=rows.reduce((x,r)=>x+r.value,0)||1;
  const palette=['#67e8f9','#34d399','#fbbf24','#a78bfa','#60a5fa','#2dd4bf','#fb7185','#94a3b8','#38bdf8','#f59e0b'];
  const svg=$('hq3Donut');
  if(svg){
    let offset=0;
    svg.innerHTML=`<circle cx="90" cy="90" r="63" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="21"/>`+
      rows.slice(0,10).map((r,i)=>{
        const frac=r.value/total,circ=2*Math.PI*63,dash=frac*circ;
        const el=`<circle cx="90" cy="90" r="63" fill="none" stroke="${palette[i%palette.length]}" stroke-width="21" stroke-dasharray="${dash} ${circ-dash}" stroke-dashoffset="${-offset*circ}" />`;
        offset+=frac;return el;
      }).join('');
  }
  set('hq3DonutValue',money(m.value));
  const legend=$('hq3MakeupLegend');
  if(legend)legend.innerHTML=rows.slice(0,8).map((r,i)=>`
    <div class="legend-row"><i style="background:${palette[i%palette.length]}"></i><strong>${esc(r.name)}</strong><span>${(r.value/total*100).toFixed(1)}% • ${money(r.value)}</span></div>`).join('');

  const incomeRows=m.hs.map(h=>({ticker:tk(h.ticker),income:holdingIncome(h)})).filter(x=>x.income>0).sort((a,b)=>b.income-a.income).slice(0,7);
  const maxIncome=Math.max(1,...incomeRows.map(x=>x.income));
  const host=$('hq3IncomeConcentration');
  if(host)host.innerHTML=incomeRows.map(x=>`
    <div class="hq3-bar-row"><strong>${esc(x.ticker)}</strong><div class="hq3-bar-track"><i style="width:${x.income/maxIncome*100}%"></i></div><span>${money(x.income)}/yr</span></div>
  `).join('');
}

function renderScouting(s){
  const strategy=String(s.scouting?.strategy||'sustainable').toLowerCase();
  const key=strategy==='maximum'?'maximumScore':'sustainableScore';
  const rows=[...arr(s.scouting?.targets)]
    .filter(x=>String(x.status||'').toLowerCase()!=='block')
    .sort((a,b)=>num(b[key])-num(a[key])).slice(0,6);
  const max=Math.max(100,...rows.map(x=>num(x[key])));
  const host=$('hq3ScoutingBars');
  if(host)host.innerHTML=rows.length?rows.map(x=>`
    <div class="hq3-bar-row"><strong>${esc(tk(x.ticker))}</strong><div class="hq3-bar-track"><i style="width:${Math.min(100,num(x[key])/max*100)}%"></i></div><span>${num(x[key]).toFixed(0)}/100 • ${num(x.yieldPct).toFixed(2)}%</span></div>
  `).join(''):'<div class="hq3-chart-empty" style="position:static;min-height:100px">No active scouting targets are available.</div>';
}

function renderAttention(items){
  set('hq3AttentionCount',`${items.filter(x=>x.tone!=='good').length} ITEMS`);
  const host=$('hq3AttentionList');
  if(host)host.innerHTML=items.map(x=>`
    <div class="hq3-attention-item ${esc(x.tone||'info')}"><i>${esc(x.icon||'•')}</i><div><strong>${esc(x.title)}</strong><span>${esc(x.note)}</span></div><a href="${esc(x.href||'index.html')}">${esc(x.link||'Open')} →</a></div>
  `).join('');
}

function renderFinance(s){
  const p=s.finance?.plan||{},hp=financeHoldingPot(s);
  const commitments=num(p.billsDue)+num(p.potsDue)+num(p.annualBillFunding)+num(p.holdingPotTopUp)+num(p.otherPlanned);
  set('hq3HoldingPot',money(hp?.balance));
  set('hq3FinancePayday',p.paydayDate?fmtDate(p.paydayDate,{day:'2-digit',month:'short'}):'—');
  set('hq3FinanceCommitments',money(commitments));
  set('hq3FinanceSurplus',money(num(p.releaseAmount)));
  set('hq3FinanceStatus',hp?`Holding Pot is ${money(hp.balance)}. Finance remains the only department allowed to determine the investment release.`:'Holding Pot is not currently available in Finance state.');
}


function renderDepartmentCommand(s,m,nd,items){
  const plan=s.finance?.plan||{};
  const targets=arr(s.scouting?.targets).filter(t=>String(t.status||'').toLowerCase()!=='block');
  const mission=activeMission(s);
  const route=s.transfer?.route;
  const drafts=arr(s.transfer?.registrationDrafts);
  const waiting=drafts.filter(d=>!['CONFIRMED','CANCELLED'].includes(String(d.status||'').toUpperCase())).length;

  set('hq4DeptFinance',`${money(num(plan.releaseAmount))} safe release • ${plan.paydayDate?fmtDate(plan.paydayDate,{day:'2-digit',month:'short'}):'payday pending'}`);
  set('hq4DeptScouting',targets.length?`${targets.length} active target${targets.length===1?'':'s'} • ${String(s.scouting?.strategy||'sustainable').toUpperCase()}`:'No active targets');
  set('hq4DeptTransfer',mission?`${stageLabel(mission.status)} stage • ${money(mission.approvedBudget)}`:(route?.locked?'Route locked':'Standby'));
  set('hq4DeptRegistration',waiting?`${waiting} waiting for broker confirmation`:'Registration clear');
  set('hq4DeptSquad',`${m.hs.length} active position${m.hs.length===1?'':'s'} • ${money(m.value)}`);
  set('hq4DeptIncome',nd?`${money(nd.amount)} next from ${tk(nd.ticker)}`:`${money(m.annual)}/yr`);

  const ticket=$('hq4ManagerTicket');
  const pulse=$('hq4ManagerPulse');
  const top=items[0]||{tone:'good'};
  if(ticket){
    ticket.classList.remove('good','warn','block','info');
    ticket.classList.add(top.tone||'info');
  }
  if(pulse){
    pulse.textContent=top.tone==='block'?'ACTION':top.tone==='warn'?'WATCH':'CLEAR';
  }

  const deptStates=[
    ['hq4DeptFinance',num(plan.releaseAmount)>=0?'good':'warn'],
    ['hq4DeptScouting',targets.length?'info':'good'],
    ['hq4DeptTransfer',mission?'warn':'good'],
    ['hq4DeptRegistration',waiting?'block':'good'],
    ['hq4DeptSquad',m.hs.length?'good':'warn'],
    ['hq4DeptIncome',nd?'good':'info']
  ];
  deptStates.forEach(([id,tone])=>{
    const el=$(id);
    const card=el?.closest('a');
    if(!card)return;
    card.classList.remove('good','warn','block','info');
    card.classList.add(tone);
  });
}

function renderMission(s){
  const m=activeMission(s),panel=$('hq3MissionPanel'),r=s.transfer?.route;
  if(!panel)return;
  panel.hidden=!m;
  if(!m)return;
  set('hq3MissionBudget',money(m.approvedBudget));
  set('hq3MissionAllocated',money(r?.allocated));
  set('hq3MissionRemaining',money(r?.remaining));
  set('hq3MissionIncome',`${money(routeIncome(r))}/yr`);
  const drafts=arr(s.transfer?.registrationDrafts),confirmed=drafts.filter(d=>String(d.status||'').toUpperCase()==='CONFIRMED').length;
  set('hq3MissionRegistration',`${confirmed}/${drafts.length||arr(r?.allocations).length||0}`);
  const stages=['FINANCE_APPROVED','SCOUTING_READY','TRANSFER_READY','REGISTERED'],idx=stages.indexOf(String(m.status||''));
  document.querySelectorAll('[data-hq3-stage]').forEach((el,i)=>{
    el.classList.toggle('complete',idx>i);el.classList.toggle('active',idx===i);
  });
}

function render(){
  if(!A()?.core?.read)return;
  const s=A().core.read(),m=portfolioMetrics(s),nd=nextDividend(s),items=attentionItems(s,m,nd);
  renderTop(s,m,nd);
  renderBriefing(s,m,nd,items);
  renderLineChart(s,m);
  renderMovers();
  renderPortfolioForm(s,m);
  renderDividends(s,m,nd);
  renderIncomeRace(s,m);
  renderMakeup(s,m);
  renderScouting(s);
  renderAttention(items);
  renderFinance(s);
  renderDepartmentCommand(s,m,nd,items);
  renderMission(s);
}

function wire(){
  $('hq3Range')?.addEventListener('click',e=>{
    const b=e.target.closest('[data-range]');if(!b)return;
    range=b.dataset.range;
    document.querySelectorAll('#hq3Range button').forEach(x=>x.classList.toggle('active',x===b));
    render();
  });
  $('hq44ChartMode')?.addEventListener('click',e=>{
    const b=e.target.closest('[data-chart-mode]');if(!b)return;
    chartMode=b.dataset.chartMode;
    document.querySelectorAll('#hq44ChartMode button').forEach(x=>x.classList.toggle('active',x===b));
    render();
  });
  $('hq3MakeupMode')?.addEventListener('click',e=>{
    const b=e.target.closest('[data-mode]');if(!b)return;
    makeupMode=b.dataset.mode;render();
  });

  const bindDailyFormHost=id=>{
    $(id)?.addEventListener('click',e=>{
      const card=e.target.closest('[data-hq41-holding]');if(!card)return;
      openHoldingDrawer(card.dataset.hq41Holding);
    });
  };
  bindDailyFormHost('hq42BestFive');
  bindDailyFormHost('hq42WorstFive');

  $('hq41HoldingClose')?.addEventListener('click',closeHoldingDrawer);
  $('hq41HoldingBackdrop')?.addEventListener('click',closeHoldingDrawer);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeHoldingDrawer()});
}

async function start(){
  if(!A()?.core?.read){setTimeout(start,200);return}
  wire();
  render();
  await loadDashboard();
  render();
  setInterval(async()=>{
    if(document.visibilityState!=='visible')return;
    await loadDashboard();render();
  },15*60*1000);
  document.addEventListener('visibilitychange',async()=>{
    if(document.visibilityState==='visible'){await loadDashboard();render()}
  });
  w.addEventListener('aurora2:state',render);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

})(window);
