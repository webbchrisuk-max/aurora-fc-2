/* Aurora City FC — Nexus V2 Live Daily Form v2.0
 * Reads current AuroraData 2 LivePrices market evidence and renders a genuine
 * Daily Form league table for ACTIVE / LOCKED squad holdings.
 *
 * The table is descriptive only. It never changes holdings, Scouting scores,
 * Transfer authority or portfolio truth. If live evidence is unavailable,
 * Nexus falls back to an honest awaiting-feed state rather than fake +0.00%.
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_V2_FORM_TRUTH__)return;
w.__AURORA_NEXUS_V2_FORM_TRUTH__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

const SHEET_ID='1ZDdYmyDrvNuz3utKmgsToKL7NqsibzbWyIo0vg-TjcA';
const SHEET='LivePrices';
const REFRESH_MS=60*1000;
const arr=v=>Array.isArray(v)?v:[];
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const ticker=v=>String(v||'').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'').replace(/\..*$/,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money=v=>{
  const n=Number(v);if(!Number.isFinite(n))return '—';
  return `£${n.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:n<10?4:2})}`;
};
const pct=v=>{const n=Number(v);return Number.isFinite(n)?`${n>=0?'+':''}${n.toFixed(2)}%`:'—'};

let running=false;
let liveRows=[];
let lastSuccessAt=null;
let lastError=null;
let observer=null;
let rendering=false;

function state(){try{return w.Aurora2?.core?.read?.()||null}catch(_){return null}}
function activeHoldings(s){
  const seen=new Map();
  arr(s?.squad?.holdings)
    .filter(h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&Number(h?.shares)>0)
    .forEach(h=>{
      const tk=ticker(h?.ticker||h?.marketSymbol);if(!tk)return;
      if(!seen.has(tk))seen.set(tk,{ticker:tk,name:String(h?.name||tk),accounts:new Set()});
      if(h?.account)seen.get(tk).accounts.add(String(h.account));
    });
  return [...seen.values()];
}

function tableObjects(payload){
  const table=payload?.table||{};
  const cols=arr(table.cols).map((c,i)=>String(c?.label||c?.id||`c${i}`).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''));
  return arr(table.rows).map(r=>{
    const out={};
    arr(r?.c).forEach((cell,i)=>{
      if(!cols[i])return;
      out[cols[i]]=cell?.v==null?(cell?.f??''):cell.v;
    });
    return out;
  });
}

/* Google GViz supports a responseHandler callback. Script/JSONP is used so
   Nexus remains reliable on GitHub Pages and Safari/iPad without CORS issues. */
function fetchLivePrices(){
  return new Promise((resolve,reject)=>{
    const callback=`auroraNexusForm${Date.now()}${Math.random().toString(36).slice(2)}`;
    const script=document.createElement('script');
    let settled=false;
    const finish=(err,payload)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      try{delete w[callback]}catch(_){w[callback]=undefined}
      try{script.remove()}catch(_){}
      if(err)reject(err);else resolve(tableObjects(payload));
    };
    const timer=setTimeout(()=>finish(new Error('Live market feed timed out.')),16000);
    w[callback]=payload=>finish(null,payload||{});
    const params=new URLSearchParams({
      tqx:`out:json;responseHandler:${callback}`,
      sheet:SHEET,
      headers:'1',
      tq:'select A,B,C,D,E',
      _t:String(Date.now())
    });
    script.src=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${params.toString()}`;
    script.async=true;
    script.referrerPolicy='no-referrer';
    script.onerror=()=>finish(new Error('Live market feed could not be opened.'));
    document.head.appendChild(script);
  });
}

function joinedRows(s,prices){
  const active=activeHoldings(s);
  const priceMap=new Map();
  arr(prices).forEach(r=>{
    const tk=ticker(r?.symbol||r?.ticker);if(!tk)return;
    const price=num(r?.price),change=num(r?.day_change);
    /* Column label is "Day Change %", therefore normalized key is day_change. */
    if(price===null||price<=0||change===null)return;
    priceMap.set(tk,{
      ticker:tk,
      name:String(r?.name||tk),
      price,
      change,
      tradeTime:r?.trade_time||''
    });
  });
  return active.map(h=>{
    const p=priceMap.get(h.ticker);if(!p)return null;
    return {...p,name:h.name||p.name,accounts:[...h.accounts]};
  }).filter(Boolean).sort((a,b)=>b.change-a.change||a.ticker.localeCompare(b.ticker));
}

function leagueRow(row,index){
  const tone=row.change>0?'n2u-positive':row.change<0?'n2u-negative':'';
  const accountMeta=row.accounts.length>1?row.accounts.join(' + '):(row.accounts[0]||'Current squad');
  return `<div class="n2u-league-row" data-live-form="${esc(row.ticker)}">
    <span class="n2u-pos">${String(index+1).padStart(2,'0')}</span>
    <span class="n2u-player"><b>${esc(row.ticker)}</b><span>${esc(row.name)} • ${esc(accountMeta)}</span></span>
    <span class="n2u-league-score ${tone}">${esc(pct(row.change))}</span>
    <span class="n2u-league-rating">${esc(money(row.price))}</span>
  </div>`;
}

function setText(id,text){const el=document.getElementById(id);if(el)el.textContent=text}
function updateHeading(){
  const host=document.getElementById('n2uFormTable');
  const league=host?.closest('.n2u-league');
  const head=league?.querySelector('.n2u-league-head');
  if(!head)return;
  const title=head.querySelector('strong');if(title)title.textContent='Live Daily Form Table';
  const meta=head.querySelector('span');if(meta)meta.textContent='Today % • Live price';
}
function updateHealth(ok){
  document.querySelectorAll('#healthStrip .health').forEach(card=>{
    if(String(card.querySelector('small')?.textContent||'').trim().toLowerCase()!=='market data')return;
    const strong=card.querySelector('strong');if(!strong)return;
    strong.textContent=ok?'LIVE FORM':'AWAITING FEED';
    strong.classList.toggle('check',!ok);
  });
}

function renderLive(){
  const host=document.getElementById('n2uFormTable');if(!host||!liveRows.length)return false;
  rendering=true;
  updateHeading();
  host.innerHTML=liveRows.slice(0,10).map(leagueRow).join('');
  const leader=liveRows[0],drag=liveRows[liveRows.length-1];
  setText('n2uFormLeader',leader.ticker);
  setText('n2uFormLeaderMeta',`${pct(leader.change)} today • ${money(leader.price)} live`);
  const today=document.getElementById('n2uToday');
  if(today&&/awaiting feed/i.test(today.textContent||''))today.textContent='Live market';
  const pitchNote=document.getElementById('pitchNote');
  if(pitchNote&&/daily form awaiting genuine market movement/i.test(pitchNote.textContent||'')){
    pitchNote.innerHTML=`Daily squad form is live from AuroraData 2 market evidence. <span class="n2-tactical-hint">Tap any player for full company analysis</span>`;
  }
  updateHealth(true);
  host.dataset.liveFormAt=lastSuccessAt||new Date().toISOString();
  host.dataset.liveFormLeader=leader.ticker;
  host.dataset.liveFormDrag=drag?.ticker||'';
  rendering=false;
  return true;
}

function renderAwaiting(){
  if(liveRows.length)return renderLive();
  const host=document.getElementById('n2uFormTable');if(!host)return false;
  rendering=true;
  updateHeading();
  host.innerHTML='<div class="n2u-compact-note" style="padding:18px"><b>Awaiting live market movement.</b><br>Nexus will only publish the Daily Form table when Aurora has genuine holding-level market evidence.</div>';
  setText('n2uFormLeader','Awaiting feed');
  setText('n2uFormLeaderMeta','No genuine live daily movement available');
  updateHealth(false);
  rendering=false;
  return false;
}

async function refresh(){
  if(running)return liveRows;
  const s=state();if(!s)return liveRows;
  running=true;lastError=null;
  try{
    const prices=await fetchLivePrices();
    const next=joinedRows(state()||s,prices);
    if(next.length){
      liveRows=next;
      lastSuccessAt=new Date().toISOString();
      renderLive();
    }else if(!liveRows.length){
      renderAwaiting();
    }
    return liveRows;
  }catch(err){
    lastError=String(err?.message||err);
    console.warn('Aurora Nexus live form refresh failed:',err);
    if(liveRows.length)renderLive();else renderAwaiting();
    return liveRows;
  }finally{running=false}
}

function observeTable(){
  const host=document.getElementById('n2uFormTable');if(!host||observer)return;
  observer=new MutationObserver(()=>{
    if(rendering||!liveRows.length)return;
    if(!host.querySelector('[data-live-form]'))requestAnimationFrame(renderLive);
  });
  observer.observe(host,{childList:true,subtree:true});
}

function init(){
  [150,500,1200].forEach(delay=>setTimeout(()=>{observeTable();refresh()},delay));
  w.addEventListener('aurora2:state',()=>setTimeout(()=>{observeTable();if(liveRows.length)renderLive();else refresh()},50));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  setInterval(()=>{if(!document.hidden)refresh()},REFRESH_MS);
}

w.AuroraNexusLiveForm={
  refresh,
  rows:()=>liveRows.slice(),
  status:()=>({running,lastSuccessAt,lastError,count:liveRows.length})
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
