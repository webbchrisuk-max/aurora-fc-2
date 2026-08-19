/* Aurora City FC — Nexus V2 Live Performance Authority v1.0
 * One presentation authority for every intraday Nexus figure.
 * Source of market truth: AuroraClubCommand / LivePrices.
 * Source of confidence + dividend schedule: current AuroraMaster export.
 * Read-only: never writes holdings, Finance, Scouting, Transfer or Registration.
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_LIVE_PERFORMANCE_AUTHORITY__)return;
w.__AURORA_NEXUS_LIVE_PERFORMANCE_AUTHORITY__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

const arr=v=>Array.isArray(v)?v:[];
const raw=v=>{if(v===null||v===undefined||(typeof v==='string'&&!v.trim()))return null;const n=Number(String(v).replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
const num=v=>raw(v)??0;
const ticker=v=>String(v||'').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'').replace(/\..*$/,'');
const money=v=>{const n=Number(v);if(!Number.isFinite(n))return '—';return `£${Math.abs(n).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`};
const signedMoney=v=>{const n=Number(v);if(!Number.isFinite(n))return '—';return `${n>0?'+':n<0?'-':''}${money(n)}`};
const pct=v=>{const n=Number(v);return Number.isFinite(n)?`${n>0?'+':''}${n.toFixed(2)}%`:'—'};
const state=()=>w.Aurora2?.core?.read?.()||null;
const accountKind=h=>{const a=String(h?.account||h?.platform||'').toLowerCase();return a.includes('212')?'T212':a.includes('ig')?'IG':'OTHER'};
const activePositions=s=>arr(s?.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&num(h?.shares)>0);

let master=null;
let masterLoadedAt=0;
let masterPromise=null;
let rendering=false;

function marketRows(){
  const club=arr(w.AuroraClubCommand?.marketRows?.());
  if(club.length)return club.map(r=>({ticker:ticker(r.ticker||r.symbol),name:String(r.name||''),price:num(r.price),change:num(r.change??r.day_change),tradeTime:r.tradeTime||r.trade_time||''})).filter(r=>r.ticker&&r.price>0);
  return arr(w.AuroraNexusLiveForm?.rows?.()).map(r=>({ticker:ticker(r.ticker),name:String(r.name||''),price:num(r.price),change:num(r.change),tradeTime:r.tradeTime||''})).filter(r=>r.ticker&&r.price>0);
}
function uniqueSecurities(s){
  const map=new Map();
  activePositions(s).forEach(h=>{
    const tk=ticker(h?.ticker||h?.marketSymbol);if(!tk)return;
    if(!map.has(tk))map.set(tk,{ticker:tk,name:String(h?.name||tk),shares:0,positions:[],accounts:new Set()});
    const g=map.get(tk);g.shares+=num(h.shares);g.positions.push(h);g.accounts.add(accountKind(h));
  });
  return map;
}
function contribution(price,change,shares){
  if(!(price>0)||!Number.isFinite(change)||!(shares>0)||change<=-99.99)return 0;
  const previous=price/(1+change/100);
  return (price-previous)*shares;
}
function snapshot(){
  const s=state();if(!s)return null;
  const positions=activePositions(s),unique=uniqueSecurities(s),prices=marketRows(),priceMap=new Map(prices.map(r=>[r.ticker,r]));
  const rows=[...unique.values()].map(sec=>{
    const m=priceMap.get(sec.ticker);if(!m)return null;
    const move=contribution(m.price,m.change,sec.shares);
    return {...m,...sec,accounts:[...sec.accounts],move};
  }).filter(Boolean).sort((a,b)=>b.change-a.change||a.ticker.localeCompare(b.ticker));
  const totalMove=rows.reduce((x,r)=>x+r.move,0),up=rows.filter(r=>r.change>0).length,down=rows.filter(r=>r.change<0).length,flat=rows.filter(r=>Math.abs(r.change)<1e-9).length;
  return {s,positions,unique,priceMap,rows,totalMove,up,down,flat,coverage:rows.length,totalSecurities:unique.size};
}
function tone(el,n){if(!el)return;el.classList.remove('positive','negative','n2u-positive','n2u-negative');if(n>0)el.classList.add(el.id?.startsWith('n2u')?'n2u-positive':'positive');if(n<0)el.classList.add(el.id?.startsWith('n2u')?'n2u-negative':'negative')}
function setText(id,text,n){const el=document.getElementById(id);if(!el)return;el.textContent=text;if(Number.isFinite(n))tone(el,n)}

function patchHeroAndCommand(x){
  if(!x?.rows.length)return;
  setText('todayMove',signedMoney(x.totalMove),x.totalMove);
  setText('n2uToday',signedMoney(x.totalMove),x.totalMove);
  const strategy=String(x.s?.transfer?.settings?.strategy||x.s?.scouting?.strategy||'sustainable').toLowerCase()==='maximum'?'Maximum Income':'Sustainable Income';
  const copy=document.getElementById('n2uCommandCopy');
  if(copy)copy.textContent=`${x.positions.length} positions • ${x.totalSecurities} unique securities • ${strategy} • ${x.coverage}/${x.totalSecurities} securities have genuine daily market evidence.`;
}
function patchMomentum(x){
  if(!x?.rows.length)return;
  const pulse=document.getElementById('momentumPulse');
  const leader=x.rows[0],drag=x.rows[x.rows.length-1];
  if(pulse)pulse.innerHTML=`<div class="pulse-main"><small>Today's Portfolio Movement</small><strong class="${x.totalMove>0?'positive':x.totalMove<0?'negative':''}">${signedMoney(x.totalMove)}</strong><span>LivePrices contribution • ${x.coverage}/${x.totalSecurities} unique securities covered</span></div><div class="pulse-card"><small>Recent form</small><strong>${leader?ticker(leader.ticker)+' '+pct(leader.change):'Awaiting feed'}</strong></div><div class="pulse-card"><small>Breadth</small><strong>${x.up} up • ${x.down} down${x.flat?` • ${x.flat} flat`:''}</strong></div>`;
  const renderList=(id,rows,empty)=>{const host=document.getElementById(id);if(!host)return;host.innerHTML=rows.length?rows.slice(0,6).map(r=>`<div class="contrib-row"><span><b>${r.ticker}</b> ${pct(r.change)}</span><strong class="${r.move>0?'positive':'negative'}">${signedMoney(r.move)}</strong></div>`).join(''):`<div class="empty">${empty}</div>`};
  renderList('positiveContrib',x.rows.filter(r=>r.move>0.004).sort((a,b)=>b.move-a.move),'No positive live contribution right now.');
  renderList('negativeContrib',x.rows.filter(r=>r.move<-0.004).sort((a,b)=>a.move-b.move),'No negative live contribution right now.');
  const section=pulse?.closest('.section');const note=section?.querySelector('.section-head p');if(note)note.textContent='Contribution uses the same live price evidence as Daily Form and the manager briefing.';
  if(drag&&document.getElementById('n2uWatchPlayerMeta')&&/risk|form|watch/i.test(document.getElementById('n2uWatchPlayerMeta').textContent||'')){
    // Leave the actual manager watch verdict untouched; this module owns market display only.
  }
}
function positionMove(h,priceMap){const m=priceMap.get(ticker(h?.ticker||h?.marketSymbol));return m?contribution(m.price,m.change,num(h.shares)):0}
function patchBrokers(x){
  const host=document.getElementById('n2uBrokerGrid');if(!host||!x)return;
  const groups={overall:x.positions,ig:x.positions.filter(h=>accountKind(h)==='IG'),t212:x.positions.filter(h=>accountKind(h)==='T212')};
  host.querySelectorAll('.n2u-broker').forEach(card=>{
    const key=card.classList.contains('ig')?'ig':card.classList.contains('t212')?'t212':'overall',list=groups[key]||[];
    const move=list.reduce((sum,h)=>sum+positionMove(h,x.priceMap),0),unique=new Set(list.map(h=>ticker(h.ticker||h.marketSymbol)).filter(Boolean));
    const count=card.querySelector('.n2u-broker-head span');if(count)count.textContent=`${list.length} position${list.length===1?'':'s'} • ${unique.size} securit${unique.size===1?'y':'ies'}`;
    const today=[...card.querySelectorAll('.n2u-broker-meta span')].find(el=>/^Today\b/i.test(String(el.textContent||'').trim()));
    const b=today?.querySelector('b');if(b){b.textContent=signedMoney(move);b.classList.remove('n2u-positive','n2u-negative');if(move>0)b.classList.add('n2u-positive');if(move<0)b.classList.add('n2u-negative')}
  });
}
function patchSectors(){
  document.querySelectorAll('#sectors .sector p').forEach(p=>{
    const parts=String(p.textContent||'').split('·').map(x=>x.trim()).filter(Boolean),seen=new Set(),clean=[];
    parts.forEach(x=>{const k=ticker(x);if(!k||seen.has(k))return;seen.add(k);clean.push(x)});
    if(clean.length&&clean.join(' · ')!==p.textContent.trim())p.textContent=clean.join(' · ');
  });
}

function normalKey(k){return String(k||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
function rowObject(row){const out={};Object.entries(row||{}).forEach(([k,v])=>out[normalKey(k)]=v);return out}
function pick(row,names){for(const n of names){const v=row?.[normalKey(n)];if(v!==undefined&&v!==null&&String(v).trim()!=='')return v}return ''}
function parseDate(v){const s=String(v||'').trim();if(!s)return null;let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12);m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),12);const d=new Date(s);return Number.isNaN(d.getTime())?null:d}
async function loadMaster(force=false){
  if(master&&!force&&Date.now()-masterLoadedAt<25*60*1000)return master;
  if(masterPromise&&!force)return masterPromise;
  masterPromise=fetch(`AuroraMaster.json?_=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`AuroraMaster ${r.status}`);return r.json()}).then(j=>{master=j;masterLoadedAt=Date.now();return j}).catch(err=>{console.warn('Nexus authority master refresh failed:',err);return master}).finally(()=>{masterPromise=null});
  return masterPromise;
}
function intelligenceMap(){
  const map=new Map();arr(master?.AuroraIntelligence).forEach(rawRow=>{const r=rowObject(rawRow),tk=ticker(pick(r,['ticker','symbol','security_ticker'])),c=raw(pick(r,['confidence','confidence_score']));if(tk&&c!==null&&c>0&&c<=100)map.set(tk,{confidence:c,row:r})});return map;
}
function patchConfidence(x){
  if(!x)return;const intel=intelligenceMap(),rows=[...x.unique.values()].map(h=>({h,i:intel.get(h.ticker)})).filter(x=>x.i);
  const cards=[...document.querySelectorAll('#intelGrid .mini')],topCard=cards.find(c=>/top confidence/i.test(c.querySelector('small')?.textContent||'')),lowCard=cards.find(c=>/lowest confidence/i.test(c.querySelector('small')?.textContent||''));
  if(!rows.length){[topCard,lowCard].forEach(c=>{if(c)c.style.display='none'});const grid=document.getElementById('intelGrid');if(grid)grid.style.gridTemplateColumns='repeat(5,minmax(0,1fr))';setText('squadConfidence','Not scored');return}
  [topCard,lowCard].forEach(c=>{if(c)c.style.removeProperty('display')});const grid=document.getElementById('intelGrid');if(grid)grid.style.removeProperty('grid-template-columns');
  rows.sort((a,b)=>b.i.confidence-a.i.confidence);const top=rows[0],low=rows[rows.length-1],avg=rows.reduce((s,r)=>s+r.i.confidence,0)/rows.length;
  const fill=(card,item,label)=>{if(!card||!item)return;const strong=card.querySelector('strong'),span=card.querySelector('span');if(strong)strong.textContent=`${item.h.ticker} ${item.i.confidence.toFixed(0)}/100`;if(span)span.textContent=label};
  fill(topCard,top,'Current Aurora Intelligence confidence');fill(lowCard,low,'Current Aurora Intelligence confidence');setText('squadConfidence',`${avg.toFixed(0)}/100`);
}
function dividendRowsFromState(s){return arr(s?.income?.calendar).map(row=>rowObject(row))}
function dividendRows(){const fromState=dividendRowsFromState(state());return fromState.length?fromState:arr(master?.Dividends).map(rowObject)}
function nextDividend(){
  const today=new Date();today.setHours(0,0,0,0);const candidates=[];
  dividendRows().forEach(r=>{
    const d=parseDate(pick(r,['payment_date','pay_date','paymentdate','paydate','date']));if(!d||d<today)return;
    const status=String(pick(r,['status','payment_status'])).toUpperCase();if(['CANCELLED','ARCHIVED'].includes(status))return;
    const tk=ticker(pick(r,['ticker','symbol','security_ticker','name']));
    const amount=raw(pick(r,['actual_amount_gbp','expected_amount_gbp','amount_gbp','cash_amount_gbp','amount']));
    candidates.push({date:d,ticker:tk||'DIVIDEND',amount:amount&&amount>0?amount:null,status});
  });
  return candidates.sort((a,b)=>a.date-b.date)[0]||null;
}
function patchDividend(){
  const d=nextDividend();if(!d)return;const date=d.date.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}),title=d.amount?`${d.ticker} ${money(d.amount)}`:`${d.ticker} • ${date}`;
  const old=document.getElementById('nextDividend');if(old)old.textContent=title;
  document.querySelectorAll('.aurora-today-card').forEach(card=>{if(!/^next dividend$/i.test(card.querySelector('small')?.textContent||''))return;const strong=card.querySelector('strong'),span=card.querySelector('span');if(strong)strong.textContent=title;if(span)span.textContent=`Payment date ${date} • Income Centre`});
}
function patchAll(){
  if(rendering)return;const x=snapshot();if(!x)return;rendering=true;
  try{patchHeroAndCommand(x);patchMomentum(x);patchBrokers(x);patchSectors();patchConfidence(x);patchDividend()}finally{rendering=false}
}
async function hydrate(){await loadMaster();patchAll()}
function start(){
  [250,800,1800].forEach(d=>setTimeout(()=>{patchAll();hydrate()},d));
  w.addEventListener('aurora:market-live',()=>setTimeout(patchAll,40));
  w.addEventListener('aurora2:state',()=>setTimeout(patchAll,120));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){patchAll();hydrate()}});
  setInterval(()=>{if(!document.hidden)patchAll()},3000);
  setInterval(()=>{if(!document.hidden)hydrate()},25*60*1000);
}
w.AuroraLivePerformanceAuthority={snapshot,refresh:async()=>{await loadMaster(true);patchAll();return snapshot()},status:()=>({masterLoadedAt,coverage:snapshot()?.coverage||0,total:snapshot()?.totalSecurities||0})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
