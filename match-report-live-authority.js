/* Aurora City FC — Match Report Live Performance Authority v1.0
 *
 * One daily-performance source for the entire Match Report.
 * Uses the same AuroraClubCommand / LivePrices rows as the recovered 5PM hero,
 * writes supported day movement into the canonical in-browser holding view, and
 * enriches genuine confidence from AuroraMaster AuroraIntelligence.
 *
 * It never creates buy/sell authority and never invents dividend-safety scores.
 */
(function(w){
'use strict';
if(w.AuroraMatchReportLiveAuthority)return;
const PAGE=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(PAGE!=='match-report.html')return;

const VERSION='2026.08.19.1';
const MASTER_URL='AuroraMaster.json';
const arr=v=>Array.isArray(v)?v:[];
const raw=v=>{if(v==null||String(v).trim()==='')return null;const n=Number(String(v).replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
const ticker=v=>String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();
const active=h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&(raw(h?.shares)||0)>0;
const now=()=>new Date().toISOString();
let running=null,lastMaster=null,lastMasterAt=0,lastRows=[];

function parseDate(v){
  if(!v)return 0;const s=String(v).trim();
  const uk=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(uk)return new Date(Number(uk[3]),Number(uk[2])-1,Number(uk[1]),Number(uk[4]||12),Number(uk[5]||0),Number(uk[6]||0)).getTime();
  const t=Date.parse(s);return Number.isFinite(t)?t:0;
}
function latestIntelligence(payload){
  const map=new Map();arr(payload?.AuroraIntelligence).forEach(row=>{
    const tk=ticker(row?.ticker);if(!tk)return;
    const stamp=parseDate(row?.generated_at||row?.updated_at||row?.timestamp);
    const prev=map.get(tk);if(!prev||stamp>=prev.__stamp)map.set(tk,{...row,__stamp:stamp});
  });return map;
}
async function master(){
  if(lastMaster&&Date.now()-lastMasterAt<5*60*1000)return lastMaster;
  try{
    const res=await fetch(`${MASTER_URL}?v=${Date.now()}`,{cache:'no-store'});
    if(!res.ok)throw new Error(`AuroraMaster ${res.status}`);
    lastMaster=await res.json();lastMasterAt=Date.now();return lastMaster;
  }catch(error){console.warn('Match Report live authority: AuroraMaster unavailable',error);return lastMaster||{};}
}
async function waitForServices(timeout=12000){
  const started=Date.now();
  while(Date.now()-started<timeout){
    if(w.Aurora2?.core?.read&&w.Aurora2?.core?.update&&w.AuroraClubCommand?.marketRows)return true;
    await new Promise(r=>setTimeout(r,100));
  }
  return false;
}
function marketMap(rows){
  const map=new Map();arr(rows).forEach(r=>{const tk=ticker(r?.ticker||r?.symbol);if(tk)map.set(tk,r)});return map;
}
function supportedChange(row){
  const price=raw(row?.price??row?.live_price??row?.livePrice),change=raw(row?.change??row?.day_change_pct??row?.daily_change_pct);
  if(!(price>0)||change==null||change<=-99.9)return null;
  return {price,change};
}
function apply(rows,intelMap){
  const core=w.Aurora2?.core;if(!core?.update)return;
  const live=marketMap(rows);
  core.update(state=>{
    let changed=false;
    const holdings=arr(state?.squad?.holdings).map(h=>{
      if(!active(h))return h;
      const tk=ticker(h?.ticker),quote=supportedChange(live.get(tk)),intel=intelMap.get(tk)||null;
      const next={...h},shares=raw(h?.shares)||0;
      if(quote){
        const previous=quote.price/(1+quote.change/100),day=(quote.price-previous)*shares,value=quote.price*shares;
        const patch={livePriceGbp:quote.price,previousCloseGbp:previous,dailyChangePct:quote.change,dayChangePct:quote.change,todayChangePct:quote.change,dailyChangeGbp:day,dayChangeGbp:day,todayChangeGbp:day,marketValueGbp:value,marketEvidenceAt:now()};
        Object.entries(patch).forEach(([k,v])=>{if(next[k]!==v){next[k]=v;changed=true}});
      }
      const conf=raw(intel?.confidence_score);
      if(conf!=null&&conf>0){
        if(next.confidence!==conf){next.confidence=conf;changed=true}
        if(next.dataQuality!==conf){next.dataQuality=conf;changed=true}
        next.matchReportConfidenceSource='Aurora Intelligence';
      }
      return next;
    });
    if(!changed)return state;
    const evidenced=holdings.filter(h=>active(h)&&raw(h?.dailyChangePct)!=null);
    const up=evidenced.filter(h=>(raw(h.dailyChangePct)||0)>0).length,down=evidenced.filter(h=>(raw(h.dailyChangePct)||0)<0).length,flat=evidenced.length-up-down;
    const dayGbp=evidenced.reduce((sum,h)=>sum+(raw(h.dailyChangeGbp)||0),0),value=holdings.filter(active).reduce((sum,h)=>sum+(raw(h.marketValueGbp)||0),0),before=value-dayGbp,dayPct=before>0?dayGbp/before*100:0;
    return {...state,squad:{...state.squad,holdings,marketEvidenceAt:now(),updatedAt:now()},market:{...(state.market||{}),portfolioTodayChangeGbp:dayGbp,portfolioTodayChangePct:dayPct,advancers:up,decliners:down,flat,coverage:evidenced.length,matchReportAuthority:VERSION,updatedAt:now()}};
  });
}
function polishMissingSafety(){
  const core=w.Aurora2?.core;if(!core?.read)return;
  const state=core.read(),byTicker=new Map(arr(state?.squad?.holdings).filter(active).map(h=>[ticker(h.ticker),h]));
  const table=document.getElementById('ratingsBody');
  if(table){
    table.querySelectorAll('tr').forEach(tr=>{
      const tk=ticker(tr.querySelector('.holding-name strong')?.textContent);if(!tk)return;
      const h=byTicker.get(tk),safety=raw(h?.dividendSafety);
      const cells=tr.querySelectorAll('td');
      if(cells.length>=8&&!(safety>0)){
        cells[7].textContent='—';
        cells[7].title='No genuine standalone dividend-safety score is currently available.';
      }
    });
  }
  const defName=ticker(document.getElementById('defName')?.textContent),def=byTicker.get(defName),defSafety=raw(def?.dividendSafety),defConfidence=raw(def?.confidence);
  if(def&&!(defSafety>0)){
    const note=document.getElementById('defNote');
    if(note)note.textContent=defConfidence>0?`Aurora Intelligence confidence ${Math.round(defConfidence)}/100 • standalone dividend-safety score not available.`:'Standalone dividend-safety evidence is not currently available.';
  }
}
async function refresh(reason='open'){
  if(running)return running;
  running=(async()=>{
    if(!await waitForServices())return null;
    try{await w.AuroraClubCommand?.refreshMarket?.()}catch(error){console.warn('Match Report live authority: LivePrices refresh failed',error)}
    const rows=arr(w.AuroraClubCommand?.marketRows?.());lastRows=rows;
    const payload=await master(),intelMap=latestIntelligence(payload);
    if(rows.length)apply(rows,intelMap);
    requestAnimationFrame(()=>requestAnimationFrame(polishMissingSafety));
    w.dispatchEvent(new CustomEvent('aurora:match-report-live-authority',{detail:{version:VERSION,reason,rows:rows.length,at:now()}}));
    return {rows:rows.length,at:now()};
  })();
  try{return await running}finally{running=null}
}
function bind(){
  setTimeout(()=>refresh('open'),180);
  document.addEventListener('click',e=>{if(e.target.closest('#refreshReport'))setTimeout(()=>refresh('manual'),40)},true);
  w.addEventListener('aurora2:match-report-hydrated',()=>setTimeout(()=>refresh('hydrated'),60));
  w.addEventListener('aurora2:state',()=>requestAnimationFrame(()=>requestAnimationFrame(polishMissingSafety)));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(()=>refresh('foreground'),150)});
}
w.AuroraMatchReportLiveAuthority={version:VERSION,refresh,rows:()=>lastRows.slice(),polish:polishMissingSafety};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})(window);
