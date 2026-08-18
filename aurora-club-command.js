/* Aurora City FC — Club Command Layer v1.0
 * Shared operational UX for Aurora 2 pages.
 *
 * Responsibilities:
 *  - global club search / command palette
 *  - one honest live-market freshness indicator
 *  - Nexus "Today at the Club" briefing strip
 *  - Squad live matchday form board
 *
 * This layer is descriptive/navigation only. It never writes Finance money,
 * Scouting scores, Transfer routes, Registration executions or canonical trades.
 */
(function(w){
'use strict';
if(w.__AURORA_CLUB_COMMAND__)return;
w.__AURORA_CLUB_COMMAND__=true;

const RELEASE='AURORA 2.8.18.1';
const SHEET_ID='1ZDdYmyDrvNuz3utKmgsToKL7NqsibzbWyIo0vg-TjcA';
const LIVE_SHEET='LivePrices';
const REFRESH_MS=60*1000;
const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
const arr=v=>Array.isArray(v)?v:[];
const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
const upper=v=>String(v||'').trim().toUpperCase();
const ticker=v=>upper(v).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\..*$/,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money=(v,compact=false)=>{
  const n=Number(v);if(!Number.isFinite(n))return '—';
  return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',notation:compact?'compact':'standard',maximumFractionDigits:compact?1:2}).format(n);
};
const pct=v=>{const n=Number(v);return Number.isFinite(n)?`${n>=0?'+':''}${n.toFixed(2)}%`:'—'};
const nowIso=()=>new Date().toISOString();

let marketRows=[];
let marketRunning=false;
let marketLastSuccess=null;
let marketLastError=null;
let searchOpen=false;
let searchResults=[];

function state(){try{return w.Aurora2?.core?.read?.()||null}catch(_){return null}}
function activeHoldings(s){return arr(s?.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(upper(h?.status))&&num(h?.shares)>0)}
function holdingIncome(h){return num(h?.annualIncomeGbp)||(num(h?.shares)*num(h?.annualDpsGbp))}
function holdingValue(h){return num(h?.marketValueGbp)||(num(h?.shares)*num(h?.livePriceGbp))}

function injectStyle(){
  if(document.getElementById('auroraClubCommandStyle'))return;
  const style=document.createElement('style');style.id='auroraClubCommandStyle';style.textContent=`
  .aurora-shell-search{position:relative}
  #auroraClubSearchButton{font-size:18px!important;font-weight:800!important;color:#bdefff!important}
  #auroraDataFreshness{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 10px;border:1px solid #17455d;border-radius:10px;background:#061322;color:#87a8ba;font-size:8px;font-weight:950;letter-spacing:.09em;text-transform:uppercase;white-space:nowrap}
  #auroraDataFreshness:before{content:'';width:6px;height:6px;border-radius:50%;background:#8095a3;box-shadow:0 0 0 3px #8095a312}
  #auroraDataFreshness.live{color:#8ff2c3;border-color:#176044;background:#062019}#auroraDataFreshness.live:before{background:#40e89e;box-shadow:0 0 12px #40e89e}
  #auroraDataFreshness.stale{color:#ffd27c;border-color:#6d5422;background:#221807}#auroraDataFreshness.stale:before{background:#ffc85b}
  #auroraDataFreshness.offline{color:#ff8795;border-color:#69303a;background:#210b10}#auroraDataFreshness.offline:before{background:#ff657a}
  .aurora-command-backdrop{position:fixed;inset:0;z-index:99990;background:#01050bd9;backdrop-filter:blur(12px);display:none;align-items:flex-start;justify-content:center;padding:clamp(70px,10vh,120px) 14px 30px}.aurora-command-backdrop.open{display:flex}
  .aurora-command-dialog{width:min(760px,100%);max-height:min(760px,80vh);display:flex;flex-direction:column;border:1px solid #235777;border-radius:20px;background:linear-gradient(150deg,#07172a,#030b16);box-shadow:0 30px 90px #000c,0 0 50px #1bdcff14;overflow:hidden}
  .aurora-command-head{padding:16px;border-bottom:1px solid #17354d;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px}.aurora-command-head i{font-style:normal;color:#42ddff;font-size:20px}.aurora-command-head input{width:100%;border:0;outline:0;background:transparent;color:#effaff;font-size:18px;font-weight:800}.aurora-command-head input::placeholder{color:#728da2}.aurora-command-close{border:1px solid #28455b;background:#0a1827;color:#acc5d7;border-radius:9px;width:34px;height:34px;font-size:17px}
  .aurora-command-sub{display:flex;justify-content:space-between;gap:12px;padding:9px 16px;border-bottom:1px solid #132b40;color:#708ca2;font-size:9px;letter-spacing:.09em;text-transform:uppercase}.aurora-command-sub strong{color:#8ee8ff}
  .aurora-command-results{overflow:auto;padding:8px}.aurora-command-result{display:grid;grid-template-columns:40px 1fr auto;gap:12px;align-items:center;padding:11px 12px;border:1px solid transparent;border-radius:12px;text-decoration:none;color:#eefaff}.aurora-command-result:hover,.aurora-command-result:focus{outline:0;background:#0a2036;border-color:#245b7a}.aurora-command-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:10px;background:#0b2841;color:#66e5ff;font-size:17px}.aurora-command-copy strong{display:block;font-size:13px}.aurora-command-copy span{display:block;margin-top:3px;color:#87a3b8;font-size:10px}.aurora-command-tag{color:#5edfff;font-size:8px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.aurora-command-empty{padding:30px 18px;text-align:center;color:#7995aa;font-size:12px}
  .aurora-today-strip{margin:18px 0 0;border:1px solid #1d4b68;border-radius:16px;background:linear-gradient(110deg,#061322f5,#08233af2);box-shadow:0 14px 35px #0004;overflow:hidden}.aurora-today-head{display:flex;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #173b55}.aurora-today-head div:first-child small{display:block;color:#42dbff;font-size:8px;font-weight:950;letter-spacing:.16em}.aurora-today-head strong{display:block;margin-top:3px;font-size:16px}.aurora-today-head span{align-self:center;color:#7ea0b5;font-size:9px}.aurora-today-grid{display:grid;grid-template-columns:repeat(6,1fr)}.aurora-today-card{padding:13px 15px;border-right:1px solid #15354d;min-width:0}.aurora-today-card:last-child{border-right:0}.aurora-today-card small{display:block;color:#7897ad;font-size:8px;letter-spacing:.1em;text-transform:uppercase}.aurora-today-card strong{display:block;margin-top:5px;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aurora-today-card span{display:block;margin-top:4px;color:#7998ad;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aurora-positive{color:#47e9a6!important}.aurora-negative{color:#ff7385!important}.aurora-caution{color:#ffd16e!important}
  .aurora-squad-live{margin:16px 0 20px;border:1px solid #1c4c67;border-radius:17px;background:linear-gradient(145deg,#061729,#04111f);overflow:hidden}.aurora-squad-live-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 18px;border-bottom:1px solid #183b54}.aurora-squad-live-head small{display:block;color:#43ddff;font-size:8px;font-weight:950;letter-spacing:.15em}.aurora-squad-live-head h3{margin:4px 0 0;font-size:18px}.aurora-squad-live-head span{color:#82a1b6;font-size:9px}.aurora-squad-live-table{display:grid}.aurora-squad-live-row{display:grid;grid-template-columns:42px minmax(180px,1.5fr) .7fr .7fr 1fr;gap:8px;align-items:center;padding:10px 15px;border-bottom:1px solid #112e43;cursor:pointer}.aurora-squad-live-row:last-child{border-bottom:0}.aurora-squad-live-row:hover{background:#0a2034}.aurora-squad-live-row .rank{color:#698aa0;font-size:10px;font-weight:900}.aurora-squad-live-row .player strong{display:block;font-size:12px}.aurora-squad-live-row .player span{display:block;margin-top:2px;color:#7797ad;font-size:9px}.aurora-squad-live-row .move,.aurora-squad-live-row .price,.aurora-squad-live-row .value{text-align:right;font-size:11px;font-weight:900}.aurora-squad-live-empty{padding:20px;color:#7f9bae;font-size:11px}
  @media(max-width:900px){#auroraDataFreshness{display:none}.aurora-today-grid{grid-template-columns:repeat(3,1fr)}.aurora-today-card:nth-child(3){border-right:0}.aurora-today-card:nth-child(-n+3){border-bottom:1px solid #15354d}.aurora-squad-live-row{grid-template-columns:34px minmax(130px,1fr) .7fr .8fr}.aurora-squad-live-row .value{display:none}}
  @media(max-width:620px){.aurora-command-backdrop{padding-top:70px}.aurora-command-dialog{border-radius:15px}.aurora-command-sub span:last-child{display:none}.aurora-today-grid{grid-template-columns:1fr 1fr}.aurora-today-card:nth-child(3){border-right:1px solid #15354d}.aurora-today-card:nth-child(even){border-right:0}.aurora-today-card:nth-child(-n+4){border-bottom:1px solid #15354d}.aurora-squad-live-head{align-items:flex-start;flex-direction:column}.aurora-squad-live-row{grid-template-columns:30px 1fr .7fr}.aurora-squad-live-row .price,.aurora-squad-live-row .value{display:none}}
  `;document.head.appendChild(style);
}

const DEPARTMENTS=[
  {icon:'🏟',title:'Nexus Headquarters',meta:'Club command, live portfolio and manager action',tag:'Command',href:'AuroraCityFC_NexusV2.html',keys:'home nexus headquarters manager dashboard command'},
  {icon:'💷',title:'Finance Command',meta:'Payday, bills, pots and protected cash',tag:'Finance',href:'finance.html',keys:'finance money cash payday wages bills pots budget'},
  {icon:'🏠',title:'House Projects',meta:'Reserved renovation payments by room',tag:'Finance',href:'finance.html?auroraSection=house',keys:'house renovation rooms project reserved payment plaster flooring kitchen games living hallway'},
  {icon:'📅',title:'Payday Control',meta:'Next payday forecast and safe release',tag:'Finance',href:'finance.html?auroraSection=payday',keys:'payday wage salary release safe surplus'},
  {icon:'🔎',title:'Scouting Centre',meta:'Research, opportunity watch and shortlist',tag:'Scouting',href:'scouting.html',keys:'scouting research shares prospects watchlist opportunities shortlist'},
  {icon:'🔄',title:'Transfer Centre',meta:'Build the approved broker route',tag:'Transfer',href:'transfer.html',keys:'transfer allocation route broker buy mission'},
  {icon:'📝',title:'Registration Desk',meta:'Record the real broker execution',tag:'Registration',href:'registration.html',keys:'registration execution trade purchase broker'},
  {icon:'⚽',title:'Squad Hub',meta:'Canonical holdings, value and income',tag:'Squad',href:'squad.html',keys:'squad holdings shares portfolio first team'},
  {icon:'💰',title:'Income Centre',meta:'Dividend truth and payment calendar',tag:'Income',href:'income.html',keys:'income dividend dividends calendar yield monthly annual'},
  {icon:'⚽',title:'Match Report',meta:'5PM full-time portfolio review',tag:'Report',href:'match-report.html',keys:'match report 5pm daily performance'},
  {icon:'🛡',title:'System Health',meta:'Sync, data integrity and diagnostics',tag:'System',href:'system-health.html',keys:'system health sync diagnostics data connection'},
  {icon:'⚙',title:'Club Control',meta:'Preferences and club settings',tag:'System',href:'club-control.html',keys:'club control preferences settings'}
];

function dynamicSearchItems(){
  const s=state();if(!s)return [];
  const out=[];
  arr(s?.squad?.holdings).forEach(h=>{
    const tk=ticker(h?.ticker);if(!tk)return;
    const status=upper(h?.status)||'HOLDING';
    out.push({icon:'⚽',title:`${tk} — ${h?.name||tk}`,meta:`Squad • ${status} • ${h?.account||'Account review'} • ${num(h?.shares).toLocaleString('en-GB')} shares`,tag:'Holding',href:`squad.html?auroraSearch=${encodeURIComponent(tk)}`,keys:`${tk} ${h?.name||''} ${h?.account||''} ${status}`});
  });
  arr(s?.scouting?.targets).forEach(t=>{
    const tk=ticker(t?.ticker);if(!tk)return;
    const score=num(t?.sustainableScore||t?.score||t?.confidence);
    out.push({icon:'🔎',title:`${tk} — ${t?.name||tk}`,meta:`Scouting • ${upper(t?.status||t?.recommendation||'WATCH')} • ${score?`${score.toFixed(0)}/100`:'evidence building'}`,tag:'Scouting',href:`scouting.html?auroraSearch=${encodeURIComponent(tk)}`,keys:`${tk} ${t?.name||''} scouting ${t?.status||''} ${t?.recommendation||''}`});
  });
  const potSources=[s?.finance?.pots,s?.pots?.records,s?.pots];
  potSources.flatMap(x=>arr(x)).forEach(p=>{const name=String(p?.name||p?.title||'').trim();if(name)out.push({icon:'▰',title:name,meta:`Finance pot • ${money(num(p?.balance||p?.current||p?.saved))}`,tag:'Pot',href:'finance.html?auroraSection=pots',keys:`${name} pot savings finance`})});
  return out;
}

function ensureSearchUi(){
  const context=document.querySelector('.aurora-shell-context');
  if(context&&!document.getElementById('auroraClubSearchButton')){
    const b=document.createElement('button');b.type='button';b.id='auroraClubSearchButton';b.className='shell-control aurora-shell-search';b.title='Search Aurora';b.setAttribute('aria-label','Search Aurora');b.textContent='⌕';
    const home=context.querySelector('.shell-home');
    if(home?.nextSibling)context.insertBefore(b,home.nextSibling);else context.prepend(b);
    b.addEventListener('click',()=>openSearch());
  }
  if(context&&!document.getElementById('auroraDataFreshness')){
    const f=document.createElement('span');f.id='auroraDataFreshness';f.textContent='FEED CHECKING';
    const live=context.querySelector('.aurora-shell-live');context.insertBefore(f,live||null);
  }
  if(document.getElementById('auroraCommandBackdrop'))return;
  const back=document.createElement('div');back.id='auroraCommandBackdrop';back.className='aurora-command-backdrop';back.innerHTML=`<div class="aurora-command-dialog" role="dialog" aria-modal="true" aria-label="Search Aurora">
    <div class="aurora-command-head"><i>⌕</i><input id="auroraCommandInput" autocomplete="off" spellcheck="false" placeholder="Search shares, departments, payday, house…"><button class="aurora-command-close" id="auroraCommandClose" type="button" aria-label="Close">×</button></div>
    <div class="aurora-command-sub"><span>CLUB COMMAND SEARCH</span><span><strong>${RELEASE}</strong> • ⌘/Ctrl K</span></div>
    <div class="aurora-command-results" id="auroraCommandResults"></div>
  </div>`;
  document.body.appendChild(back);
  back.addEventListener('click',e=>{if(e.target===back)closeSearch()});
  document.getElementById('auroraCommandClose')?.addEventListener('click',closeSearch);
  document.getElementById('auroraCommandInput')?.addEventListener('input',e=>renderSearch(e.target.value));
}
function rankItem(item,q){
  const query=q.toLowerCase().trim();if(!query)return 1;
  const title=item.title.toLowerCase(),keys=`${item.keys||''} ${item.meta||''} ${item.tag||''}`.toLowerCase();
  if(title===query)return 100;if(title.startsWith(query))return 80;if(title.includes(query))return 60;
  const words=query.split(/\s+/).filter(Boolean);return words.every(w=>keys.includes(w)||title.includes(w))?30+words.length:0;
}
function searchItems(q){
  const pool=[...DEPARTMENTS,...dynamicSearchItems()];
  const seen=new Set();
  return pool.map(item=>({item,score:rankItem(item,q)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.item.title.localeCompare(b.item.title)).map(x=>x.item).filter(item=>{const k=`${item.href}|${item.title}`;if(seen.has(k))return false;seen.add(k);return true}).slice(0,14);
}
function renderSearch(q=''){
  const host=document.getElementById('auroraCommandResults');if(!host)return;
  searchResults=searchItems(q);
  host.innerHTML=searchResults.length?searchResults.map((r,i)=>`<a class="aurora-command-result" href="${esc(r.href)}" data-command-index="${i}"><span class="aurora-command-icon">${esc(r.icon)}</span><span class="aurora-command-copy"><strong>${esc(r.title)}</strong><span>${esc(r.meta)}</span></span><span class="aurora-command-tag">${esc(r.tag)}</span></a>`).join(''):`<div class="aurora-command-empty">No Aurora result matches “${esc(q)}”.</div>`;
}
function openSearch(query=''){
  ensureSearchUi();searchOpen=true;
  const back=document.getElementById('auroraCommandBackdrop'),input=document.getElementById('auroraCommandInput');
  back?.classList.add('open');document.body.style.overflow='hidden';if(input){input.value=query;renderSearch(query);setTimeout(()=>input.focus(),40)}
}
function closeSearch(){searchOpen=false;document.getElementById('auroraCommandBackdrop')?.classList.remove('open');document.body.style.overflow=''}

function tableObjects(payload){
  const table=payload?.table||{};
  const cols=arr(table.cols).map((c,i)=>String(c?.label||c?.id||`c${i}`).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''));
  return arr(table.rows).map(r=>{const out={};arr(r?.c).forEach((cell,i)=>{if(!cols[i])return;out[cols[i]]=cell?.f??cell?.v??''});return out});
}
function fetchLivePrices(){
  return new Promise((resolve,reject)=>{
    const cb=`auroraClubLive${Date.now()}${Math.random().toString(36).slice(2)}`;const script=document.createElement('script');let done=false;
    const finish=(err,payload)=>{if(done)return;done=true;clearTimeout(timer);try{delete w[cb]}catch(_){w[cb]=undefined}try{script.remove()}catch(_){}err?reject(err):resolve(tableObjects(payload))};
    const timer=setTimeout(()=>finish(new Error('Live market feed timed out')),16000);w[cb]=payload=>finish(null,payload||{});
    const params=new URLSearchParams({tqx:`out:json;responseHandler:${cb}`,sheet:LIVE_SHEET,headers:'1',tq:'select A,B,C,D,E',_t:String(Date.now())});
    script.src=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${params.toString()}`;script.async=true;script.referrerPolicy='no-referrer';script.onerror=()=>finish(new Error('Live market feed unavailable'));document.head.appendChild(script);
  });
}
function normaliseMarketRows(rows){return arr(rows).map(r=>({name:String(r?.name||''),ticker:ticker(r?.symbol||r?.ticker),price:num(r?.price),change:num(r?.day_change),tradeTime:r?.trade_time||''})).filter(r=>r.ticker&&r.price>0)}
function freshnessText(){
  if(!navigator.onLine)return {cls:'offline',text:'OFFLINE'};
  if(marketLastSuccess){const mins=Math.floor((Date.now()-new Date(marketLastSuccess).getTime())/60000);if(mins<=2)return {cls:'live',text:`FEED LIVE • ${new Date(marketLastSuccess).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`};return {cls:'stale',text:`FEED STALE • ${mins}M`}}
  return marketLastError?{cls:'offline',text:'FEED UNAVAILABLE'}:{cls:'',text:'FEED CHECKING'};
}
function renderFreshness(){const el=document.getElementById('auroraDataFreshness');if(!el)return;const x=freshnessText();el.className=x.cls;el.textContent=x.text}
async function refreshMarket(){
  if(marketRunning)return marketRows;marketRunning=true;marketLastError=null;
  try{const rows=normaliseMarketRows(await fetchLivePrices());if(rows.length){marketRows=rows;marketLastSuccess=nowIso();renderFreshness();renderPageLiveFeatures();w.dispatchEvent(new CustomEvent('aurora:market-live',{detail:{rows:marketRows.slice(),updatedAt:marketLastSuccess}}))}return marketRows}
  catch(err){marketLastError=String(err?.message||err);renderFreshness();renderPageLiveFeatures();return marketRows}
  finally{marketRunning=false}
}

function combinedActive(s){
  const map=new Map();activeHoldings(s).forEach(h=>{const tk=ticker(h?.ticker);if(!tk)return;const row=map.get(tk)||{ticker:tk,name:h?.name||tk,shares:0,value:0,income:0,accounts:new Set()};row.shares+=num(h?.shares);row.value+=holdingValue(h);row.income+=holdingIncome(h);if(h?.account)row.accounts.add(String(h.account));map.set(tk,row)});return [...map.values()]
}
function liveForActive(s){
  const active=new Map(combinedActive(s).map(h=>[h.ticker,h]));
  return marketRows.filter(r=>active.has(r.ticker)).map(r=>({...r,holding:active.get(r.ticker)}));
}
function estimatedDayMove(row){const p=num(row.price),c=num(row.change),shares=num(row.holding?.shares);if(!p||!shares||c<=-99.9)return 0;const prev=p/(1+c/100);return (p-prev)*shares}
function nextDividend(s){
  if(s?.income?.nextDividend)return s.income.nextDividend;
  const rows=arr(s?.income?.calendar||s?.income?.payments).filter(x=>x?.date||x?.paymentDate).map(x=>({...x,_d:new Date(x.date||x.paymentDate)})).filter(x=>Number.isFinite(x._d.getTime())&&x._d>=new Date()).sort((a,b)=>a._d-b._d);return rows[0]||null;
}

function ensureNexusToday(){
  if(page!=='auroracityfc_nexusv2.html')return null;
  let root=document.getElementById('auroraTodayAtClub');if(root)return root;
  root=document.createElement('section');root.id='auroraTodayAtClub';root.className='aurora-today-strip';root.innerHTML=`<div class="aurora-today-head"><div><small>LIVE CLUB BRIEFING</small><strong>Today at Aurora City FC</strong></div><span id="auroraTodayCoverage">Building live position…</span></div><div class="aurora-today-grid" id="auroraTodayGrid"></div>`;
  const anchor=document.getElementById('n2ReplacementLayer')||document.querySelector('main.page .hero,.n2-shell .hero,.hero');if(anchor)anchor.insertAdjacentElement('afterend',root);return root;
}
function renderNexusToday(){
  const root=ensureNexusToday(),s=state();if(!root||!s)return;
  const anchor=document.getElementById('n2ReplacementLayer');if(anchor&&root.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',root);
  const live=liveForActive(s).sort((a,b)=>b.change-a.change),best=live[0],worst=live.at(-1),move=live.reduce((x,r)=>x+estimatedDayMove(r),0),annual=w.AuroraFinancialTruth?.getCurrentAnnualIncome?.(s)??activeHoldings(s).reduce((x,h)=>x+holdingIncome(h),0),nd=nextDividend(s);
  const action=String(s?.decision?.title||s?.mission?.status||'Hold team shape').replaceAll('_',' ');
  const cards=[
    ['Portfolio today',live.length?`${move>=0?'+':''}${money(move)}`:'Awaiting feed',live.length?`${live.filter(x=>x.change>0).length} up • ${live.filter(x=>x.change<0).length} down`:'No live holding movement',move>0?'aurora-positive':move<0?'aurora-negative':''],
    ['Form leader',best?`${best.ticker} ${pct(best.change)}`:'—',best?money(best.price):'Awaiting live market',best?.change>0?'aurora-positive':''],
    ['Biggest drag',worst?`${worst.ticker} ${pct(worst.change)}`:'—',worst?money(worst.price):'Awaiting live market',worst?.change<0?'aurora-negative':''],
    ['Annual income',money(annual),`${money(annual/12)} monthly run-rate`,''],
    ['Next dividend',nd?`${ticker(nd.ticker||nd.symbol)||'DIV'} ${money(num(nd.amount||nd.amountGbp))}`:'Building calendar',nd?.date||nd?.paymentDate||'Income Centre owns payment truth',''],
    ['Manager action',action,marketLastSuccess?'Live club state':'Canonical club state','aurora-caution']
  ];
  const grid=document.getElementById('auroraTodayGrid');if(grid)grid.innerHTML=cards.map(c=>`<div class="aurora-today-card"><small>${esc(c[0])}</small><strong class="${c[3]||''}">${esc(c[1])}</strong><span>${esc(c[2])}</span></div>`).join('');
  const coverage=document.getElementById('auroraTodayCoverage');if(coverage)coverage.textContent=live.length?`${live.length}/${combinedActive(s).length} shares on live form • checked ${new Date(marketLastSuccess).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`:'Live form evidence building';
}

function ensureSquadLive(){
  if(page!=='squad.html')return null;let root=document.getElementById('auroraSquadLiveForm');if(root)return root;
  root=document.createElement('section');root.id='auroraSquadLiveForm';root.className='aurora-squad-live';root.innerHTML=`<div class="aurora-squad-live-head"><div><small>MATCHDAY FORM</small><h3>Live First-Team Form</h3></div><span id="auroraSquadLiveMeta">Waiting for market feed</span></div><div class="aurora-squad-live-table" id="auroraSquadLiveTable"></div>`;
  const score=document.querySelector('.squad-scoreboard');if(score)score.insertAdjacentElement('afterend',root);return root;
}
function renderSquadLive(){
  const root=ensureSquadLive(),s=state();if(!root||!s)return;const combined=new Map(combinedActive(s).map(h=>[h.ticker,h])),rows=marketRows.filter(r=>combined.has(r.ticker)).map(r=>({...r,holding:combined.get(r.ticker)})).sort((a,b)=>b.change-a.change);
  const table=document.getElementById('auroraSquadLiveTable');if(table)table.innerHTML=rows.length?rows.map((r,i)=>{const liveValue=r.price*num(r.holding.shares),tone=r.change>0?'aurora-positive':r.change<0?'aurora-negative':'';return `<div class="aurora-squad-live-row" data-squad-live-ticker="${esc(r.ticker)}"><span class="rank">${String(i+1).padStart(2,'0')}</span><span class="player"><strong>${esc(r.ticker)} — ${esc(r.holding.name||r.name)}</strong><span>${esc([...r.holding.accounts].join(' + ')||'Current squad')}</span></span><span class="move ${tone}">${esc(pct(r.change))}</span><span class="price">${esc(money(r.price))}</span><span class="value">${esc(money(liveValue))}</span></div>`}).join(''):`<div class="aurora-squad-live-empty">Live first-team market evidence is still building. Aurora will not manufacture +0.00% form.</div>`;
  const meta=document.getElementById('auroraSquadLiveMeta');if(meta)meta.textContent=rows.length?`${rows.length}/${combined.size} unique holdings • refreshed ${new Date(marketLastSuccess).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`:'Awaiting live market';
  root.querySelectorAll('[data-squad-live-ticker]').forEach(row=>row.onclick=()=>{const q=row.dataset.squadLiveTicker,input=document.getElementById('holdingSearch');if(input){input.value=q;input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('holdingGrid')?.scrollIntoView({behavior:'smooth',block:'start'})}});
}
function renderPageLiveFeatures(){renderNexusToday();renderSquadLive()}

function routeIncomingQuery(){
  const p=new URLSearchParams(location.search),section=p.get('auroraSection'),q=p.get('auroraSearch');
  if(section){const map={house:'housePanel',payday:'paydayPanel',pots:'potsPanel',overview:'overviewPanel'};const target=map[section];if(target)setTimeout(()=>document.querySelector(`[data-tab="${target}"]`)?.click(),160)}
  if(q&&page==='squad.html')setTimeout(()=>{const input=document.getElementById('holdingSearch');if(input){input.value=q;input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('holdingGrid')?.scrollIntoView({behavior:'smooth',block:'start'})}},450);
}
function canonicalShellTidy(){
  document.querySelectorAll('.shell-home').forEach(a=>{a.href='AuroraCityFC_NexusV2.html';a.title='Nexus Headquarters'});
  document.querySelectorAll('.aurora-shell-crest img,.aurora-shell-nav-crest img').forEach(img=>img.src='assets/aurora-city-fc-badge.svg');
  document.documentElement.dataset.auroraRelease=RELEASE;
}
function bindKeys(){document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&String(e.key).toLowerCase()==='k'){e.preventDefault();searchOpen?closeSearch():openSearch();return}if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')){e.preventDefault();openSearch();return}if(e.key==='Escape'&&searchOpen)closeSearch()})}
function init(){
  injectStyle();canonicalShellTidy();ensureSearchUi();bindKeys();routeIncomingQuery();renderFreshness();ensureNexusToday();ensureSquadLive();renderPageLiveFeatures();
  [100,650,1500].forEach(d=>setTimeout(()=>{canonicalShellTidy();ensureSearchUi();renderPageLiveFeatures()},d));
  refreshMarket();setInterval(()=>{renderFreshness();if(!document.hidden)refreshMarket()},REFRESH_MS);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshMarket()});
  w.addEventListener('online',refreshMarket);w.addEventListener('offline',renderFreshness);w.addEventListener('aurora2:state',()=>setTimeout(()=>{renderPageLiveFeatures();if(searchOpen)renderSearch(document.getElementById('auroraCommandInput')?.value||'')},50));
}

w.AuroraClubCommand={
  release:RELEASE,openSearch,closeSearch,refreshMarket,
  marketRows:()=>marketRows.slice(),
  status:()=>({release:RELEASE,marketLastSuccess,marketLastError,marketCount:marketRows.length})
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
