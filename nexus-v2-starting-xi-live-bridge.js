/* Aurora City FC — Nexus V2 Starting XI Live Bridge v1.0
 * Keeps the tactical pitch aligned with the same evidence authorities used
 * elsewhere in Nexus.
 * - FORM XI: Aurora LivePrices daily movement
 * - RISK XI: AuroraIntelligence confidence_score
 * - Leader cards and player drawer use the same evidence
 * Read-only: this module never writes portfolio, scouting or transfer state.
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_STARTING_XI_LIVE_BRIDGE__)return;
w.__AURORA_NEXUS_STARTING_XI_LIVE_BRIDGE__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

const arr=v=>Array.isArray(v)?v:[];
const raw=v=>{if(v===null||v===undefined||(typeof v==='string'&&!v.trim()))return null;const n=Number(String(v).replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
const num=v=>raw(v)??0;
const esc=v=>w.Aurora2?.ui?.escape?.(v)||String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ticker=v=>String(v||'').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'').replace(/\..*$/,'');
const money=v=>w.Aurora2?.ui?.money?.(v)||new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(num(v));
const pct=v=>{const n=raw(v);return n===null?'Feed pending':`${n>=0?'+':''}${n.toFixed(2)}%`};
const state=()=>w.Aurora2?.core?.read?.()||null;
const positions=[
  {left:50,top:88},
  {left:18,top:72},{left:39,top:69},{left:61,top:69},{left:82,top:72},
  {left:28,top:48},{left:50,top:43},{left:72,top:48},
  {left:18,top:22},{left:50,top:15},{left:82,top:22}
];

let master=null;
let masterAt=0;
let masterPromise=null;
let confidenceCache=new Map();
let rendering=false;

function activeGroups(){
  const s=state(),map=new Map();
  arr(s?.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&num(h?.shares)>0).forEach(h=>{
    const tk=ticker(h?.ticker||h?.marketSymbol||h?.name);if(!tk)return;
    if(!map.has(tk))map.set(tk,{ticker:tk,name:String(h?.name||tk),shares:0,value:0,income:0,sector:String(h?.sector||''),role:String(h?.role||'')});
    const g=map.get(tk),shares=num(h.shares),value=num(h?.marketValueGbp)||(shares*num(h?.livePriceGbp))||num(h?.bookCostGbp),income=num(h?.annualIncomeGbp)||(shares*num(h?.annualDpsGbp));
    g.shares+=shares;g.value+=value;g.income+=income;if(!g.sector&&h?.sector)g.sector=String(h.sector);if(!g.role&&h?.role)g.role=String(h.role);
  });
  return [...map.values()];
}

function liveMap(){
  const map=new Map(),snap=w.AuroraLivePerformanceAuthority?.snapshot?.();
  arr(snap?.rows).forEach(r=>{const tk=ticker(r?.ticker);if(tk)map.set(tk,{price:raw(r?.price),change:raw(r?.change),move:raw(r?.move),tradeTime:r?.tradeTime||''})});
  if(map.size)return map;
  arr(w.AuroraNexusLiveForm?.rows?.()).forEach(r=>{const tk=ticker(r?.ticker);if(tk)map.set(tk,{price:raw(r?.price),change:raw(r?.change),move:null,tradeTime:r?.tradeTime||''})});
  return map;
}

function norm(k){return String(k||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
function obj(row){const out={};Object.entries(row||{}).forEach(([k,v])=>out[norm(k)]=v);return out}
function pick(row,names){for(const name of names){const v=row?.[norm(name)];if(v!==undefined&&v!==null&&String(v).trim()!=='')return v}return ''}
function rebuildConfidence(){
  const buckets=new Map();
  arr(master?.AuroraIntelligence).forEach(rawRow=>{
    const r=obj(rawRow),tk=ticker(pick(r,['ticker','symbol','security_ticker'])),score=raw(pick(r,['confidence_score','confidence']));
    if(!tk||score===null||score<=0||score>100)return;
    const stamp=Date.parse(String(pick(r,['generated_at','updated_at','timestamp'])||''))||0;
    if(!buckets.has(tk))buckets.set(tk,{stamp,scores:[score]});
    else {const b=buckets.get(tk);if(stamp>b.stamp){b.stamp=stamp;b.scores=[score]}else if(stamp===b.stamp)b.scores.push(score)}
  });
  confidenceCache=new Map([...buckets.entries()].map(([tk,b])=>[tk,b.scores.reduce((a,x)=>a+x,0)/b.scores.length]));
}
async function loadMaster(force=false){
  if(master&&!force&&Date.now()-masterAt<20*60*1000)return master;
  if(masterPromise&&!force)return masterPromise;
  masterPromise=fetch(`AuroraMaster.json?_=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`AuroraMaster ${r.status}`);return r.json()}).then(j=>{master=j;masterAt=Date.now();rebuildConfidence();return j}).catch(err=>{console.warn('Starting XI confidence refresh failed:',err);return master}).finally(()=>{masterPromise=null});
  return masterPromise;
}

function enriched(){
  const live=liveMap();
  return activeGroups().map(g=>{
    const m=live.get(g.ticker)||{};
    return {...g,dayChangePct:raw(m.change),livePrice:raw(m.price),dayMove:raw(m.move),confidence:confidenceCache.has(g.ticker)?confidenceCache.get(g.ticker):null};
  });
}
function currentLens(){return document.querySelector('.lens.active')?.dataset?.lens||'value'}
function rank(rows,lens){
  if(lens==='form')return [...rows].sort((a,b)=>{
    const ae=a.dayChangePct!==null,be=b.dayChangePct!==null;if(ae!==be)return be-ae;if(ae&&be&&b.dayChangePct!==a.dayChangePct)return b.dayChangePct-a.dayChangePct;return b.value-a.value;
  });
  if(lens==='risk')return [...rows].sort((a,b)=>{
    const ae=a.confidence!==null,be=b.confidence!==null;if(ae!==be)return be-ae;if(ae&&be&&a.confidence!==b.confidence)return a.confidence-b.confidence;return b.value-a.value;
  });
  return rows;
}
function captainBadge(i){if(i===0)return '<span class="n2-player-role-badge">C</span>';if(i===1)return '<span class="n2-player-role-badge vc">VC</span>';return ''}
function renderPitch(){
  const lens=currentLens();if(!['form','risk'].includes(lens))return;
  const host=document.getElementById('players'),note=document.getElementById('pitchNote');if(!host)return;
  const rows=rank(enriched(),lens),selected=rows.slice(0,11),covered=rows.filter(r=>r.dayChangePct!==null).length,scored=rows.filter(r=>r.confidence!==null).length;
  const html=selected.map((r,i)=>{
    const p=positions[i]||positions[positions.length-1],label=lens==='form'?pct(r.dayChangePct):(r.confidence!==null?`${r.confidence.toFixed(0)}/100`:'Not scored'),good=lens==='form'&&r.dayChangePct!==null&&r.dayChangePct>0,review=(lens==='form'&&r.dayChangePct!==null&&r.dayChangePct<0)||(lens==='risk'&&r.confidence!==null&&r.confidence<60);
    return `<button type="button" class="n2-player-node ${review?'review':good?'good':''}${i===0?' n2-captain':i===1?' n2-vice':''}" style="left:${p.left}%;top:${p.top}%" data-n2-player="${esc(r.ticker)}" title="${esc(r.name)} • ${esc(r.sector||'Squad holding')}">${captainBadge(i)}<span class="n2-player-number">${i+1}</span><b>${esc(r.ticker)}</b><span>${esc(label)}</span></button>`;
  }).join('');
  if(host.innerHTML!==html)host.innerHTML=html;
  if(note){
    const evidence=lens==='form'?`${covered}/${rows.length} have genuine daily market evidence`:`${scored}/${rows.length} have genuine Aurora Intelligence confidence scores`;
    note.innerHTML=`${selected.length} of ${rows.length} active securities shown • ${lens.charAt(0).toUpperCase()+lens.slice(1)} lens • ${evidence}. <span class="n2-tactical-hint">Tap any player for full company analysis</span>`;
  }
}

function leaderCard(label){return [...document.querySelectorAll('#leaderList .leader')].find(c=>String(c.querySelector('small')?.textContent||'').trim().toLowerCase()===label.toLowerCase())}
function fillLeader(card,row,note){if(!card||!row)return;const b=card.querySelector('.leader-top b'),strong=card.querySelector('.leader-top strong'),p=card.querySelector('p');if(b)b.textContent=row.ticker;if(strong)strong.textContent=`${row.confidence.toFixed(0)}/100`;if(p)p.textContent=`${row.name} • ${note}`}
function renderConfidenceLeaders(){
  const scored=enriched().filter(r=>r.confidence!==null);if(!scored.length)return;
  const top=[...scored].sort((a,b)=>b.confidence-a.confidence)[0],low=[...scored].sort((a,b)=>a.confidence-b.confidence)[0];
  fillLeader(leaderCard('Confidence Leader'),top,'Current Aurora Intelligence confidence');
  fillLeader(leaderCard('Needs Attention'),low,'Lowest current Aurora Intelligence confidence — manager review');
  document.querySelectorAll('#intelGrid .mini').forEach(card=>{
    const label=String(card.querySelector('small')?.textContent||'').trim().toLowerCase(),strong=card.querySelector('strong'),span=card.querySelector('span');
    if(label==='top confidence'){if(strong)strong.textContent=`${top.ticker} ${top.confidence.toFixed(0)}/100`;if(span)span.textContent='Current Aurora Intelligence confidence'}
    if(label==='lowest confidence'){if(strong)strong.textContent=`${low.ticker} ${low.confidence.toFixed(0)}/100`;if(span)span.textContent='Current Aurora Intelligence confidence'}
  });
}
function patchDrawer(){
  const drawer=document.getElementById('n2PlayerDrawer');if(!drawer?.classList.contains('open'))return;
  const title=document.getElementById('n2DrawerTitle'),tk=ticker(String(title?.textContent||'').split('—')[0]);if(!tk)return;
  const row=enriched().find(r=>r.ticker===tk);if(!row)return;
  document.querySelectorAll('#n2DrawerContent .n2-drawer-metric').forEach(card=>{
    const label=String(card.querySelector('small')?.textContent||'').trim().toLowerCase(),strong=card.querySelector('strong');if(!strong)return;
    if(label==='today')strong.textContent=row.dayChangePct===null?'Market feed pending':pct(row.dayChangePct);
    if(label==='live price'&&row.livePrice!==null)strong.textContent=money(row.livePrice);
  });
  const rating=document.querySelector('#n2DrawerContent .n2-drawer-rating'),score=rating?.querySelector('span');
  if(rating&&score&&row.confidence!==null){rating.style.setProperty('--rating-progress',`${Math.max(0,Math.min(100,row.confidence))*3.6}deg`);score.textContent=`${row.confidence.toFixed(0)}/100`}
}
function render(){
  if(rendering)return;rendering=true;
  try{renderPitch();renderConfidenceLeaders();patchDrawer()}finally{rendering=false}
}
function schedule(){[35,160,520].forEach(d=>setTimeout(render,d))}
async function hydrate(){await loadMaster();schedule()}
function start(){
  schedule();hydrate();
  document.addEventListener('click',e=>{if(e.target.closest('[data-lens]')||e.target.closest('[data-n2-player]'))schedule()});
  w.addEventListener('aurora2:state',schedule);
  w.addEventListener('aurora:market-live',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){schedule();hydrate()}});
  setInterval(()=>{if(!document.hidden)render()},2500);
  setInterval(()=>{if(!document.hidden)hydrate()},20*60*1000);
}
w.AuroraNexusStartingXI={render,refresh:async()=>{await loadMaster(true);render()},confidence:t=>confidenceCache.get(ticker(t))??null};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);