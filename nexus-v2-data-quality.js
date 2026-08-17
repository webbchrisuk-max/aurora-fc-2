/* Aurora City FC — Nexus V2 data-quality + tactical profile guard v1.1
 * - blank market fields stay missing rather than becoming false zeroes
 * - the same ticker across brokers is one squad player
 * - Starting XI uses an Analysis Room-style vertical football pitch
 * - tapping a player opens a right-hand analytical company profile drawer
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_V2_DATA_QUALITY_V11__)return;
w.__AURORA_NEXUS_V2_DATA_QUALITY_V11__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

const arr=v=>Array.isArray(v)?v:[];
const rawNumber=v=>{
  if(v===null||v===undefined)return null;
  if(typeof v==='string'&&v.trim()==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
};
const num=v=>rawNumber(v)??0;
const esc=v=>w.Aurora2?.ui?.escape?.(v)||String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>w.Aurora2?.ui?.money?.(v)||new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(num(v));
const active=s=>arr(s?.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&num(h?.shares)>0);
const ticker=h=>String(h?.ticker||h?.name||'UNKNOWN').trim().toUpperCase();
const value=h=>num(h?.marketValueGbp)||(num(h?.shares)*num(h?.livePriceGbp))||num(h?.bookCostGbp);
const book=h=>num(h?.bookCostGbp)||(num(h?.shares)*num(h?.avgCostGbp));
const income=h=>num(h?.annualIncomeGbp)||(num(h?.shares)*num(h?.annualDpsGbp));
const accountLabel=h=>{const a=String(h?.account||h?.platform||'').toLowerCase();return a.includes('212')?'T212':a.includes('ig')?'IG':String(h?.account||'OTHER').toUpperCase()};

let groupCache=[];
let stateCache=null;
let drawerTicker='';
let drawerOrder=[];

const positions=[
  {left:50,top:88},
  {left:18,top:72},{left:39,top:69},{left:61,top:69},{left:82,top:72},
  {left:28,top:48},{left:50,top:43},{left:72,top:48},
  {left:18,top:22},{left:50,top:15},{left:82,top:22}
];

function firstNumber(obj,keys){
  for(const k of keys){const n=rawNumber(obj?.[k]);if(n!==null)return n;}
  return null;
}
function dayGbp(h){return firstNumber(h,['dailyChangeGbp','todayChangeGbp','dayChangeGbp']);}
function dayPct(h){
  const direct=firstNumber(h,['dailyChangePct','todayChangePct','dayChangePct']);
  if(direct!==null)return direct;
  const d=dayGbp(h),mv=value(h);
  if(d===null)return null;
  const base=mv-d;
  return base?d/base*100:0;
}
function scoreValue(h){return firstNumber(h,['confidence','score','auroraScore','qualityScore','dataQuality']);}
function hasMarket(h){return dayGbp(h)!==null||dayPct(h)!==null;}
function textFirst(rows,key){
  for(const row of rows){const x=String(row?.[key]||'').trim();if(x)return x;}
  return '';
}

function aggregate(rows){
  const map=new Map();
  rows.forEach(h=>{
    const key=ticker(h);
    if(!map.has(key))map.set(key,{ticker:key,name:h?.name||key,shares:0,marketValueGbp:0,bookCostGbp:0,annualIncomeGbp:0,dayChangeGbp:0,dayEvidence:false,pctNumerator:0,pctWeight:0,scores:[],accounts:new Set(),rows:[]});
    const g=map.get(key),v=value(h),d=dayGbp(h),p=dayPct(h),sc=scoreValue(h);
    g.rows.push(h);g.shares+=num(h?.shares);g.marketValueGbp+=v;g.bookCostGbp+=book(h);g.annualIncomeGbp+=income(h);g.accounts.add(accountLabel(h));
    if(d!==null){g.dayChangeGbp+=d;g.dayEvidence=true;}
    if(p!==null){const wt=Math.max(1,v);g.pctNumerator+=p*wt;g.pctWeight+=wt;g.dayEvidence=true;}
    if(sc!==null)g.scores.push(sc);
  });
  return [...map.values()].map(g=>{
    g.dayChangePct=g.pctWeight?g.pctNumerator/g.pctWeight:(g.dayEvidence&&g.marketValueGbp-g.dayChangeGbp?g.dayChangeGbp/(g.marketValueGbp-g.dayChangeGbp)*100:null);
    g.confidence=g.scores.length?g.scores.reduce((a,b)=>a+b,0)/g.scores.length:null;
    g.accounts=[...g.accounts];
    g.yieldPct=g.marketValueGbp?g.annualIncomeGbp/g.marketValueGbp*100:0;
    g.livePriceGbp=g.shares?g.marketValueGbp/g.shares:0;
    g.avgCostGbp=g.shares?g.bookCostGbp/g.shares:0;
    g.profitLossGbp=g.marketValueGbp-g.bookCostGbp;
    g.profitLossPct=g.bookCostGbp?g.profitLossGbp/g.bookCostGbp*100:0;
    g.annualDpsGbp=g.shares?g.annualIncomeGbp/g.shares:0;
    g.sector=textFirst(g.rows,'sector')||'Unclassified';
    g.role=textFirst(g.rows,'role')||'Squad holding';
    return g;
  });
}

function currentLens(){return document.querySelector('.lens.active')?.dataset?.lens||'value';}
function lensScore(h,l){
  if(l==='income')return h.annualIncomeGbp;
  if(l==='form')return h.dayEvidence?(h.dayChangePct??0):-1e9+h.marketValueGbp/1e9;
  if(l==='risk')return h.confidence!==null?100-h.confidence:h.marketValueGbp/1000;
  return h.marketValueGbp;
}
function lensLabel(h,l){
  if(l==='income')return `${money(h.annualIncomeGbp)}/yr`;
  if(l==='form')return h.dayEvidence?`${(h.dayChangePct??0)>=0?'+':''}${(h.dayChangePct??0).toFixed(2)}%`:'Feed pending';
  if(l==='risk')return h.confidence!==null?`${h.confidence.toFixed(0)}/100`:'Not scored';
  return money(h.marketValueGbp);
}

function installTacticalStyle(){
  if(document.getElementById('nexusV2TacticalProfileStyle'))return;
  const style=document.createElement('style');
  style.id='nexusV2TacticalProfileStyle';
  style.textContent=`
    .pitch-panel .pitch{position:relative!important;min-height:610px!important;overflow:hidden!important;border:1px solid rgba(52,211,153,.28)!important;border-radius:22px!important;background:linear-gradient(180deg,rgba(5,46,22,.38),rgba(5,35,26,.64)),repeating-linear-gradient(90deg,rgba(255,255,255,.023) 0 10%,rgba(255,255,255,.052) 10% 20%)!important;box-shadow:inset 0 0 58px rgba(0,0,0,.24)!important;transform:none!important;clip-path:none!important;}
    .pitch-panel .pitch:before{content:""!important;position:absolute!important;inset:13px!important;border:1px solid rgba(209,250,229,.30)!important;border-radius:16px!important;background:linear-gradient(180deg,transparent calc(50% - .5px),rgba(209,250,229,.28) 50%,transparent calc(50% + .5px)),radial-gradient(circle at center,transparent 0 62px,rgba(209,250,229,.28) 63px 64px,transparent 65px)!important;pointer-events:none!important;}
    .pitch-panel .pitch:after{content:""!important;position:absolute!important;left:50%!important;top:50%!important;width:6px!important;height:6px!important;transform:translate(-50%,-50%)!important;border-radius:50%!important;background:rgba(236,253,245,.72)!important;pointer-events:none!important;}
    .pitch-panel .players{position:absolute!important;inset:0!important;display:block!important;z-index:3!important;pointer-events:none!important;}
    .n2-pitch-box{position:absolute;left:50%;width:43%;height:74px;transform:translateX(-50%);border:1px solid rgba(209,250,229,.28);z-index:1;pointer-events:none}.n2-pitch-box.top{top:13px;border-top:0}.n2-pitch-box.bottom{bottom:13px;border-bottom:0}
    .n2-player-node{position:absolute;z-index:4;width:94px;min-height:57px;transform:translate(-50%,-50%);padding:7px 8px;border:1px solid rgba(125,211,252,.26);border-radius:15px;background:rgba(2,6,23,.90);color:#e0f2fe;text-align:center;cursor:pointer;touch-action:manipulation;pointer-events:auto;box-shadow:0 10px 26px rgba(0,0,0,.32);transition:transform .18s,border-color .18s,box-shadow .18s;-webkit-appearance:none;appearance:none}
    .n2-player-node:hover,.n2-player-node:focus-visible,.n2-player-node.selected{transform:translate(-50%,-54%) scale(1.05);border-color:rgba(167,139,250,.66);box-shadow:0 14px 34px rgba(0,0,0,.42),0 0 24px rgba(167,139,250,.18);outline:none}
    .n2-player-node.good{border-color:rgba(52,211,153,.42)}.n2-player-node.review{border-color:rgba(251,191,36,.44)}
    .n2-player-node b{display:block;font-size:12px;letter-spacing:.02em}.n2-player-node span{display:block;margin-top:3px;color:#86efac;font-size:9px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.n2-player-node.review span{color:#fde68a}
    .n2-player-node:after{content:"";position:absolute;left:50%;bottom:-9px;width:2px;height:8px;background:rgba(125,211,252,.28)}
    .n2-player-number{position:absolute;right:6px;top:5px;color:#64748b!important;font-size:7px!important;font-weight:1000!important;margin:0!important}
    .n2-tactical-hint{display:inline-flex;align-items:center;gap:7px;margin-left:8px;color:#c4b5fd;font-weight:850}.n2-tactical-hint:before{content:"↗"}

    .n2-player-drawer-backdrop{position:fixed;inset:0;z-index:390;background:rgba(2,6,23,.68);backdrop-filter:blur(7px)}
    .n2-player-drawer{position:fixed;right:0;top:0;bottom:0;z-index:391;width:min(515px,94vw);display:flex;flex-direction:column;transform:translateX(105%);border-left:1px solid rgba(167,139,250,.30);background:linear-gradient(180deg,rgba(10,23,46,.995),rgba(3,9,20,.998));box-shadow:-28px 0 80px rgba(0,0,0,.58);transition:transform .28s cubic-bezier(.2,.85,.25,1)}
    .n2-player-drawer.open{transform:translateX(0)}
    .n2-drawer-head{display:flex;justify-content:space-between;gap:14px;padding:22px;border-bottom:1px solid rgba(167,139,250,.16)}.n2-drawer-head h2{margin:6px 0 0;font-size:29px;letter-spacing:-.055em}.n2-drawer-head p{margin:5px 0 0;color:#8fa1b8;font-size:11px;line-height:1.45}.n2-drawer-head button{width:42px;height:42px;border:1px solid rgba(167,139,250,.23);border-radius:14px;background:rgba(76,29,149,.18);color:#e9d5ff;font-size:25px;cursor:pointer}
    .n2-drawer-content{flex:1;min-height:0;overflow:auto;padding:18px 22px;-webkit-overflow-scrolling:touch}.n2-drawer-kicker{display:block;color:#a78bfa;font-size:9px;text-transform:uppercase;letter-spacing:.13em;font-weight:1000}
    .n2-drawer-hero{display:grid;grid-template-columns:110px minmax(0,1fr);gap:15px;align-items:center;padding:16px;border:1px solid rgba(167,139,250,.17);border-radius:20px;background:radial-gradient(circle at 15% 15%,rgba(167,139,250,.16),transparent 40%),rgba(2,6,23,.28)}
    .n2-drawer-rating{width:110px;height:110px;display:grid;place-items:center;border-radius:50%;background:conic-gradient(#34d399 var(--rating-progress,0deg),rgba(148,163,184,.12) 0);box-shadow:0 0 28px rgba(52,211,153,.10)}.n2-drawer-rating span{width:88px;height:88px;display:grid;place-items:center;border-radius:50%;background:#071426;color:#86efac;font-size:24px;font-weight:1000;text-align:center}.n2-drawer-hero h3{margin:0;color:#f0f9ff;font-size:21px}.n2-drawer-hero p{margin:7px 0 0;color:#91a3ba;font-size:11px;line-height:1.5}
    .n2-drawer-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:13px}.n2-drawer-metric{padding:12px;border:1px solid rgba(148,163,184,.12);border-radius:15px;background:rgba(2,6,23,.28)}.n2-drawer-metric small{display:block;color:#71839c;font-size:8px;text-transform:uppercase;font-weight:1000}.n2-drawer-metric strong{display:block;margin-top:7px;color:#e0f2fe;font-size:16px;overflow-wrap:anywhere}
    .n2-drawer-section{margin-top:16px}.n2-drawer-section h4{margin:0 0 9px;color:#c4b5fd;font-size:11px;text-transform:uppercase;letter-spacing:.11em}.n2-drawer-card{padding:12px;border:1px solid rgba(148,163,184,.12);border-radius:15px;background:rgba(2,6,23,.28);color:#cbd5e1;font-size:11px;line-height:1.55}.n2-drawer-card b{color:#f0f9ff}.n2-drawer-card + .n2-drawer-card{margin-top:8px}
    .n2-drawer-bar{margin-top:8px}.n2-drawer-bar-head{display:flex;justify-content:space-between;color:#91a3ba;font-size:9px}.n2-drawer-bar-track{height:7px;margin-top:5px;border-radius:999px;background:rgba(148,163,184,.12);overflow:hidden}.n2-drawer-bar-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#a78bfa,#22d3ee)}
    .n2-broker-row{display:grid;grid-template-columns:70px 1fr auto;gap:9px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(148,163,184,.08)}.n2-broker-row:last-child{border-bottom:0}.n2-broker-row strong{font-size:11px}.n2-broker-row span{font-size:9px;color:#8fa1b8}.n2-broker-row em{font-style:normal;font-size:10px;font-weight:900;color:#dff7ff;text-align:right}
    .n2-drawer-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:14px 18px calc(14px + env(safe-area-inset-bottom));border-top:1px solid rgba(167,139,250,.16)}.n2-drawer-actions button,.n2-drawer-actions a{display:grid;place-items:center;min-height:42px;border:1px solid rgba(167,139,250,.20);border-radius:13px;background:rgba(76,29,149,.17);color:#e9d5ff;font-size:9px;font-weight:900;cursor:pointer;text-decoration:none}
    @media(max-width:760px){.pitch-panel .pitch{min-height:520px!important}.n2-player-node{width:78px;padding:6px}.n2-player-node b{font-size:10px}.n2-drawer-hero{grid-template-columns:1fr;text-align:center}.n2-drawer-rating{margin:auto}}
    @media(max-width:480px){.n2-drawer-metrics{grid-template-columns:1fr}.n2-drawer-actions{grid-template-columns:1fr 1fr}.n2-drawer-actions a{grid-column:1/-1;order:-1}}
  `;
  document.head.appendChild(style);
}

function ensurePitchGeometry(){
  const pitch=document.querySelector('.pitch-panel .pitch');
  if(!pitch)return;
  if(!pitch.querySelector('.n2-pitch-box.top')){
    const top=document.createElement('div');top.className='n2-pitch-box top';
    const bottom=document.createElement('div');bottom.className='n2-pitch-box bottom';
    pitch.append(top,bottom);
  }
}

function ensureDrawer(){
  if(document.getElementById('n2PlayerDrawer'))return;
  const backdrop=document.createElement('div');backdrop.id='n2PlayerDrawerBackdrop';backdrop.className='n2-player-drawer-backdrop';backdrop.hidden=true;
  const drawer=document.createElement('aside');drawer.id='n2PlayerDrawer';drawer.className='n2-player-drawer';drawer.setAttribute('aria-hidden','true');drawer.setAttribute('aria-label','Holding analytical profile');
  drawer.innerHTML=`
    <div class="n2-drawer-head"><div><span class="n2-drawer-kicker">Player analytical profile</span><h2 id="n2DrawerTitle">Player</h2><p id="n2DrawerSubtitle">Loading profile…</p></div><button id="n2DrawerClose" type="button" aria-label="Close player profile">×</button></div>
    <div class="n2-drawer-content" id="n2DrawerContent"></div>
    <div class="n2-drawer-actions"><button id="n2DrawerPrevious" type="button">← Previous</button><a href="squad.html">Open Squad Hub</a><button id="n2DrawerNext" type="button">Next →</button></div>`;
  document.body.append(backdrop,drawer);
}

function scoutingRow(s,t){
  return arr(s?.scouting?.targets).find(x=>ticker(x)===t)||null;
}
function routeAllocation(s,t){
  return arr(s?.transfer?.route?.allocations).find(x=>String(x?.ticker||x?.securityId||'').trim().toUpperCase()===t)||null;
}
function calendarRows(s){
  return [...arr(s?.income?.calendar),...arr(s?.income?.dividends),...arr(s?.dividends?.calendar),...arr(s?.dividends)];
}
function nextDividendFor(s,t){
  const now=Date.now();
  return calendarRows(s).filter(x=>String(x?.ticker||'').trim().toUpperCase()===t).map(x=>({row:x,time:Date.parse(x?.payDate||x?.paymentDate||x?.date||x?.exDate||'')})).filter(x=>Number.isFinite(x.time)&&x.time>=now).sort((a,b)=>a.time-b.time)[0]?.row||null;
}
function metricScore(value,max){return max?Math.max(0,Math.min(100,value/max*100)):0;}
function drawerBar(label,value){const v=Math.max(0,Math.min(100,num(value)));return `<div class="n2-drawer-bar"><div class="n2-drawer-bar-head"><span>${esc(label)}</span><b>${Math.round(v)}/100</b></div><div class="n2-drawer-bar-track"><i style="width:${v}%"></i></div></div>`;}
function signMoney(v){return `${num(v)>=0?'+':''}${money(v)}`;}
function signPct(v){return `${num(v)>=0?'+':''}${num(v).toFixed(2)}%`;}

function profileCall(g){
  if(g.dayEvidence&&num(g.dayChangePct)>0.5)return 'Strong live form';
  if(g.dayEvidence&&num(g.dayChangePct)<-0.5)return 'Under pressure today';
  if(g.profitLossGbp<0)return 'Below book cost — monitor position';
  if(g.yieldPct>=8)return 'High-income squad player';
  if(g.annualIncomeGbp>0)return 'Established income contributor';
  return 'Stable squad holding';
}
function profileDetail(g,totalValue,totalIncome){
  const vw=totalValue?g.marketValueGbp/totalValue*100:0,iw=totalIncome?g.annualIncomeGbp/totalIncome*100:0;
  return `${g.ticker} contributes ${iw.toFixed(1)}% of annual portfolio income and ${vw.toFixed(1)}% of total club value.`;
}

function openDrawer(t){
  const g=groupCache.find(x=>x.ticker===t);if(!g||!stateCache)return;
  drawerTicker=t;
  const totalValue=groupCache.reduce((a,b)=>a+b.marketValueGbp,0),totalIncome=groupCache.reduce((a,b)=>a+b.annualIncomeGbp,0);
  const scout=scoutingRow(stateCache,t),route=routeAllocation(stateCache,t),nextDiv=nextDividendFor(stateCache,t);
  const scoutScore=firstNumber(scout,['score','confidence','maximumScore','sustainableScore']);
  const rating=g.confidence!==null?g.confidence:scoutScore;
  const valueInfluence=metricScore(g.marketValueGbp,Math.max(...groupCache.map(x=>x.marketValueGbp),1));
  const incomeInfluence=metricScore(g.annualIncomeGbp,Math.max(...groupCache.map(x=>x.annualIncomeGbp),1));
  const profitInfluence=Math.max(0,Math.min(100,50+g.profitLossPct*3));
  const movementText=g.dayEvidence?`${signMoney(g.dayChangeGbp)} • ${signPct(g.dayChangePct??0)}`:'Market feed pending';
  const scoreText=rating!==null&&rating!==undefined?`${num(rating).toFixed(0)}`:'—';
  const accounts=g.accounts.join(' / ');
  const title=document.getElementById('n2DrawerTitle'),subtitle=document.getElementById('n2DrawerSubtitle'),content=document.getElementById('n2DrawerContent');
  if(title)title.textContent=`${g.ticker} — ${g.name}`;
  if(subtitle)subtitle.textContent=`${g.role} • ${g.sector} • ${accounts}`;
  if(content)content.innerHTML=`
    <div class="n2-drawer-hero">
      <div class="n2-drawer-rating" style="--rating-progress:${rating!==null&&rating!==undefined?Math.max(0,Math.min(100,num(rating)))*3.6:0}deg"><span>${scoreText}${scoreText==='—'?'':'/100'}</span></div>
      <div><h3>${esc(profileCall(g))}</h3><p>${esc(profileDetail(g,totalValue,totalIncome))}</p></div>
    </div>
    <div class="n2-drawer-metrics">
      <div class="n2-drawer-metric"><small>Market value</small><strong>${money(g.marketValueGbp)}</strong></div>
      <div class="n2-drawer-metric"><small>Shares</small><strong>${g.shares.toLocaleString('en-GB',{maximumFractionDigits:4})}</strong></div>
      <div class="n2-drawer-metric"><small>Live price</small><strong>${money(g.livePriceGbp)}</strong></div>
      <div class="n2-drawer-metric"><small>Average cost</small><strong>${money(g.avgCostGbp)}</strong></div>
      <div class="n2-drawer-metric"><small>Profit / loss</small><strong class="${g.profitLossGbp>=0?'n2u-positive':'n2u-negative'}">${signMoney(g.profitLossGbp)} • ${signPct(g.profitLossPct)}</strong></div>
      <div class="n2-drawer-metric"><small>Today</small><strong class="${g.dayEvidence&&g.dayChangeGbp<0?'n2u-negative':g.dayEvidence&&g.dayChangeGbp>0?'n2u-positive':''}">${esc(movementText)}</strong></div>
      <div class="n2-drawer-metric"><small>Annual income</small><strong>${money(g.annualIncomeGbp)}</strong></div>
      <div class="n2-drawer-metric"><small>Monthly income</small><strong>${money(g.annualIncomeGbp/12)}</strong></div>
      <div class="n2-drawer-metric"><small>Dividend yield</small><strong>${g.yieldPct.toFixed(2)}%</strong></div>
      <div class="n2-drawer-metric"><small>Portfolio weight</small><strong>${(totalValue?g.marketValueGbp/totalValue*100:0).toFixed(1)}%</strong></div>
    </div>
    <div class="n2-drawer-section"><h4>Tactical contribution</h4>${drawerBar('Value influence',valueInfluence)}${drawerBar('Income influence',incomeInfluence)}${drawerBar('Book-cost position',profitInfluence)}${drawerBar('Aurora / scouting score',rating??0)}</div>
    <div class="n2-drawer-section"><h4>Broker dressing rooms</h4><div class="n2-drawer-card">${g.rows.map(r=>`<div class="n2-broker-row"><strong>${esc(accountLabel(r))}</strong><span>${num(r?.shares).toLocaleString('en-GB',{maximumFractionDigits:4})} shares • ${money(value(r))}</span><em class="${value(r)-book(r)>=0?'n2u-positive':'n2u-negative'}">${signMoney(value(r)-book(r))}</em></div>`).join('')}</div></div>
    <div class="n2-drawer-section"><h4>Aurora intelligence</h4>
      ${scout?`<div class="n2-drawer-card"><b>Scouting:</b> ${esc(scout?.recommendation||scout?.status||'Tracked')}<br>${firstNumber(scout,['sustainableScore'])!==null?`Sustainable ${firstNumber(scout,['sustainableScore']).toFixed(0)}/100 • `:''}${firstNumber(scout,['maximumScore'])!==null?`Maximum ${firstNumber(scout,['maximumScore']).toFixed(0)}/100`:''}${scout?.reason||scout?.note?`<br>${esc(scout.reason||scout.note)}`:''}</div>`:'<div class="n2-drawer-card"><b>Scouting:</b> No current scouting target row for this holding.</div>'}
      ${route?`<div class="n2-drawer-card"><b>Transfer route:</b> ${money(route?.amount||route?.allocationGbp||0)} currently allocated${rawNumber(route?.expectedAnnualIncome)!==null?` • ${money(route.expectedAnnualIncome)} expected annual income`:''}.</div>`:'<div class="n2-drawer-card"><b>Transfer route:</b> Not part of the current recommended purchase route.</div>'}
      ${nextDiv?`<div class="n2-drawer-card"><b>Next dividend:</b> ${esc(nextDiv?.payDate||nextDiv?.paymentDate||nextDiv?.date||'Scheduled')} ${rawNumber(nextDiv?.amount)!==null?`• ${money(nextDiv.amount)}`:''}</div>`:''}
    </div>
    <div class="n2-drawer-section"><h4>Manager interpretation</h4><div class="n2-drawer-card"><b>${esc(profileCall(g))}</b><br>${g.dayEvidence?`Today's supported movement is ${signPct(g.dayChangePct??0)}.`:'Daily movement evidence is not currently available.'} The position is ${g.profitLossGbp>=0?'above':'below'} book cost by ${money(Math.abs(g.profitLossGbp))} and currently contributes ${money(g.annualIncomeGbp)} a year in dividend income.</div></div>`;
  const backdrop=document.getElementById('n2PlayerDrawerBackdrop'),drawer=document.getElementById('n2PlayerDrawer');
  if(backdrop)backdrop.hidden=false;if(drawer){drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');}
  document.querySelectorAll('.n2-player-node').forEach(x=>x.classList.toggle('selected',x.dataset.n2Player===t));
}
function closeDrawer(){
  drawerTicker='';
  const backdrop=document.getElementById('n2PlayerDrawerBackdrop'),drawer=document.getElementById('n2PlayerDrawer');
  if(backdrop)backdrop.hidden=true;if(drawer){drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true');}
  document.querySelectorAll('.n2-player-node.selected').forEach(x=>x.classList.remove('selected'));
}
function stepDrawer(direction){
  if(!drawerOrder.length)return;
  let index=Math.max(0,drawerOrder.indexOf(drawerTicker));
  index=(index+direction+drawerOrder.length)%drawerOrder.length;
  openDrawer(drawerOrder[index]);
}

function renderStartingXI(groups){
  const target=document.getElementById('players'),note=document.getElementById('pitchNote');if(!target)return;
  ensurePitchGeometry();
  const l=currentLens(),selected=[...groups].sort((a,b)=>lensScore(b,l)-lensScore(a,l)).slice(0,11);
  drawerOrder=selected.map(x=>x.ticker);
  target.innerHTML=selected.length?selected.map((h,i)=>{
    const pos=positions[i]||positions[positions.length-1],good=l==='form'&&h.dayEvidence&&(h.dayChangePct??0)>0,review=(l==='risk'&&h.confidence!==null&&h.confidence<60)||(l==='form'&&h.dayEvidence&&(h.dayChangePct??0)<0);
    return `<button type="button" class="n2-player-node ${review?'review':good?'good':''}${drawerTicker===h.ticker?' selected':''}" style="left:${pos.left}%;top:${pos.top}%" data-n2-player="${esc(h.ticker)}" title="${esc(h.name)} • ${esc(h.sector)}"><span class="n2-player-number">${i+1}</span><b>${esc(h.ticker)}</b><span>${esc(lensLabel(h,l))}</span></button>`;
  }).join(''):'<div class="empty">No active holdings are available in canonical squad state.</div>';
  if(note){const covered=groups.filter(h=>h.dayEvidence).length;note.innerHTML=`${selected.length} of ${groups.length} active securities shown • ${esc(l.charAt(0).toUpperCase()+l.slice(1))} lens • ${covered}/${groups.length} have genuine daily market evidence. <span class="n2-tactical-hint">Tap any player for full company analysis</span>`;}
}

function leagueRow(pos,h,scoreText,ratingText){
  const acc=h.accounts.length>1?` • ${h.accounts.join(' + ')}`:'';
  return `<div class="n2u-league-row"><span class="n2u-pos">${String(pos).padStart(2,'0')}</span><div class="n2u-player"><b>${esc(h.ticker)}</b><span>${esc(h.name||h.ticker)}${esc(acc)}</span></div><span class="n2u-league-score">${scoreText}</span><span class="n2u-league-rating">${ratingText}</span></div>`;
}
function renderLeagues(groups){
  const form=document.getElementById('n2uFormTable'),inc=document.getElementById('n2uIncomeTable');
  if(form){
    const evidence=groups.filter(h=>h.dayEvidence).sort((a,b)=>(b.dayChangePct??0)-(a.dayChangePct??0));
    form.innerHTML=evidence.length?evidence.slice(0,10).map((h,i)=>{const p=h.dayChangePct??0,rating=Math.max(1,Math.min(10,6+p*1.6));return leagueRow(i+1,h,`${p>=0?'+':''}${p.toFixed(2)}%`,rating.toFixed(1));}).join(''):'<div class="n2u-compact-note" style="padding:18px">Awaiting a genuine daily market feed. Blank market fields are no longer treated as +0.00% form.</div>';
  }
  if(inc){const ranked=[...groups].sort((a,b)=>b.annualIncomeGbp-a.annualIncomeGbp);inc.innerHTML=ranked.slice(0,10).map((h,i)=>leagueRow(i+1,h,money(h.annualIncomeGbp),`${h.yieldPct.toFixed(1)}%`)).join('');}
}

function renderMatch(groups){
  const evidence=groups.filter(h=>h.dayEvidence),result=document.getElementById('n2uResult');if(!result)return;
  if(!evidence.length){result.textContent='AWAITING MARKET';result.classList.remove('good','bad','draw');result.classList.add('draw');const summary=document.getElementById('n2uMatchSummary');if(summary)summary.textContent='The portfolio result will publish when Aurora receives genuine daily movement evidence. Blank fields are not counted as a draw.';['n2uAdvancers','n2uDecliners','n2uMotm','n2uDrag'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='—';});const status=document.getElementById('n2uMatchStatus');if(status)status.textContent='AWAITING FEED';return;}
  const total=evidence.reduce((x,h)=>x+h.dayChangeGbp,0),adv=evidence.filter(h=>h.dayChangeGbp>0),dec=evidence.filter(h=>h.dayChangeGbp<0),best=[...evidence].sort((a,b)=>b.dayChangeGbp-a.dayChangeGbp)[0],worst=[...evidence].sort((a,b)=>a.dayChangeGbp-b.dayChangeGbp)[0];
  result.textContent=`${total>0?'WIN':total<0?'DEFEAT':'DRAW'} ${total>=0?'+':''}${money(total)}`;result.classList.remove('good','bad','draw');result.classList.add(total>0?'good':total<0?'bad':'draw');const summary=document.getElementById('n2uMatchSummary');if(summary)summary.textContent=`Aurora City FC have ${adv.length} advancer${adv.length===1?'':'s'} against ${dec.length} decliner${dec.length===1?'':'s'} in the current session.`;const vals={n2uAdvancers:String(adv.length),n2uDecliners:String(dec.length),n2uMotm:best?.ticker||'—',n2uDrag:worst?.ticker||'—'};Object.entries(vals).forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.textContent=v;});
}

function renderLeaders(groups){
  const leaderList=document.getElementById('leaderList');if(!leaderList)return;
  const byValue=[...groups].sort((a,b)=>b.marketValueGbp-a.marketValueGbp)[0],byIncome=[...groups].sort((a,b)=>b.annualIncomeGbp-a.annualIncomeGbp)[0],scored=groups.filter(h=>h.confidence!==null),topScore=[...scored].sort((a,b)=>b.confidence-a.confidence)[0],lowScore=[...scored].sort((a,b)=>a.confidence-b.confidence)[0];
  const s=stateCache||{},permitted=arr(s?.scouting?.targets).filter(x=>!x?.restricted&&!['BLOCKED','RESTRICTED','REJECTED'].includes(String(x?.status||'').toUpperCase())).sort((a,b)=>num(b?.score||b?.confidence)-num(a?.score||a?.confidence))[0];
  const cards=[['Value Leader',byValue,byValue?money(byValue.marketValueGbp):'—','Largest current squad position'],['Income Leader',byIncome,byIncome?`${money(byIncome.annualIncomeGbp)} / year`:'—','Sets the income tempo'],['Confidence Leader',topScore,topScore?`${topScore.confidence.toFixed(0)}/100`:'Not scored','No false zero scores'],['Best Opportunity',permitted,permitted?`${num(permitted.score||permitted.confidence).toFixed(0)}/100`:'—','Permitted scouting route'],['Needs Attention',lowScore,lowScore?`${lowScore.confidence.toFixed(0)}/100`:'Not scored','Awaiting genuine confidence evidence']];
  leaderList.innerHTML=cards.map(([label,h,val,note])=>`<div class="leader"><small>${esc(label)}</small><div class="leader-top"><b>${esc(h?.ticker||'—')}</b><strong>${esc(val)}</strong></div><p>${esc(h?.name||note)} • ${esc(note)}</p></div>`).join('');
}

function patchTouchline(groups){
  const scored=groups.filter(h=>h.confidence!==null),top=[...scored].sort((a,b)=>b.confidence-a.confidence)[0],low=[...scored].sort((a,b)=>a.confidence-b.confidence)[0];
  document.querySelectorAll('#intelGrid .mini').forEach(card=>{const label=String(card.querySelector('small')?.textContent||'').trim().toLowerCase(),strong=card.querySelector('strong'),span=card.querySelector('span');if(!strong)return;if(label==='top confidence'){strong.textContent=top?.ticker||'Not scored';if(span)span.textContent=top?`${top.confidence.toFixed(0)}/100 squad score`:'No genuine holding confidence score is available.';}if(label==='lowest confidence'){strong.textContent=low?.ticker||'Not scored';if(span)span.textContent=low?`${low.confidence.toFixed(0)}/100 — review form`:'No genuine holding confidence score is available.';}});
}
function patchHealth(groups){const live=groups.some(h=>h.dayEvidence);document.querySelectorAll('#healthStrip .health').forEach(card=>{if(String(card.querySelector('small')?.textContent||'').trim().toLowerCase()!=='market data')return;const strong=card.querySelector('strong');if(!strong)return;strong.textContent=live?'LIVE':'AWAITING FEED';strong.classList.toggle('check',!live);});}
function patchCommand(groups){const live=groups.filter(h=>h.dayEvidence),copy=document.getElementById('n2uCommandCopy');if(copy){const strategy=String(stateCache?.transfer?.settings?.strategy||'sustainable').toLowerCase()==='maximum'?'Maximum Income':'Sustainable Income';copy.textContent=`${groups.length} active securities • ${strategy} • ${live.length}/${groups.length} securities have genuine daily market evidence.`;}if(!live.length){const today=document.getElementById('n2uToday');if(today)today.textContent='Awaiting feed';const form=document.getElementById('n2uFormLeader');if(form)form.textContent='Awaiting feed';const meta=document.getElementById('n2uFormLeaderMeta');if(meta)meta.textContent='No genuine daily movement yet';}}

function render(){
  const s=w.Aurora2?.core?.read?.();if(!s)return;
  stateCache=s;groupCache=aggregate(active(s));
  installTacticalStyle();ensureDrawer();ensurePitchGeometry();
  renderStartingXI(groupCache);renderLeagues(groupCache);renderMatch(groupCache);renderLeaders(groupCache);patchTouchline(groupCache);patchHealth(groupCache);patchCommand(groupCache);
  if(drawerTicker&&groupCache.some(x=>x.ticker===drawerTicker))openDrawer(drawerTicker);
}
function init(){
  installTacticalStyle();ensureDrawer();render();
  document.addEventListener('click',e=>{
    const player=e.target.closest('[data-n2-player]');if(player){openDrawer(player.dataset.n2Player);return;}
    if(e.target.closest('[data-lens]')){setTimeout(render,0);return;}
    if(e.target.closest('#n2DrawerClose')||e.target===document.getElementById('n2PlayerDrawerBackdrop')){closeDrawer();return;}
    if(e.target.closest('#n2DrawerPrevious')){stepDrawer(-1);return;}
    if(e.target.closest('#n2DrawerNext')){stepDrawer(1);return;}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawerTicker)closeDrawer();});
  w.addEventListener('aurora2:state',()=>setTimeout(render,0));
  setTimeout(render,350);setTimeout(render,1300);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
