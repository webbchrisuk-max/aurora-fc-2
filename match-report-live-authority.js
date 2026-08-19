/* Aurora City FC — Match Report Live Performance Authority v1.1
 *
 * One daily-performance source for the entire Match Report.
 * Uses AuroraClubCommand / LivePrices for market movement and AuroraMaster
 * AuroraIntelligence for genuine confidence evidence.
 *
 * Matchday breadth is security-level (17 unique securities); the Player Ratings
 * table remains position-level (18 broker positions when a ticker is held in
 * more than one account). No dividend-safety score is invented.
 */
(function(w){
'use strict';
if(w.AuroraMatchReportLiveAuthority)return;
const PAGE=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(PAGE!=='match-report.html')return;

const VERSION='2026.08.19.2';
const MASTER_URL='AuroraMaster.json';
const arr=v=>Array.isArray(v)?v:[];
const raw=v=>{if(v==null||String(v).trim()==='')return null;const n=Number(String(v).replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
const ticker=v=>String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();
const active=h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&(raw(h?.shares)||0)>0;
const now=()=>new Date().toISOString();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2}).format(Number(v)||0);
const pct=v=>`${Number(v)>=0?'+':''}${(Number(v)||0).toFixed(2)}%`;
let running=null,lastMaster=null,lastMasterAt=0,lastRows=[],lastIntelMap=new Map();

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
function marketMap(rows){const map=new Map();arr(rows).forEach(r=>{const tk=ticker(r?.ticker||r?.symbol);if(tk)map.set(tk,r)});return map}
function supportedChange(row){
  const price=raw(row?.price??row?.live_price??row?.livePrice),change=raw(row?.change??row?.day_change_pct??row?.daily_change_pct);
  if(!(price>0)||change==null||change<=-99.9)return null;
  const previous=price/(1+change/100);
  return {price,change,previous};
}
function accountCode(v){const s=String(v||'').toLowerCase();if(s.includes('212'))return'T212';if(/\big\b/.test(s)||s.includes('ig isa'))return'IG';return String(v||'').toUpperCase()}
function safetyForTicker(state,tk){
  const target=arr(state?.scouting?.targets).find(t=>ticker(t?.ticker)===tk&&(raw(t?.dividendSafety)||0)>0);
  const score=raw(target?.dividendSafety);
  const source=String(target?.evidenceSources?.dividendSafety||'');
  return score>0&&source!=='missing'?score:null;
}
function confidenceForTicker(tk){const n=raw(lastIntelMap.get(tk)?.confidence_score);return n>0?n:null}
function livePosition(holding,quoteMap){
  const tk=ticker(holding?.ticker),quote=supportedChange(quoteMap.get(tk));if(!quote)return null;
  const shares=raw(holding?.shares)||0,day=(quote.price-quote.previous)*shares;
  return {ticker:tk,name:holding?.name||tk,account:accountCode(holding?.account),shares,price:quote.price,previous:quote.previous,change:quote.change,day,value:quote.price*shares};
}
function uniqueSecurities(state,quoteMap){
  const grouped=new Map();
  arr(state?.squad?.holdings).filter(active).forEach(h=>{
    const pos=livePosition(h,quoteMap);if(!pos)return;
    const row=grouped.get(pos.ticker)||{ticker:pos.ticker,name:pos.name,shares:0,day:0,value:0,change:pos.change};
    row.shares+=pos.shares;row.day+=pos.day;row.value+=pos.value;row.change=pos.change;grouped.set(pos.ticker,row);
  });
  return [...grouped.values()];
}
function applyCanonical(rows){
  const core=w.Aurora2?.core;if(!core?.update)return;
  const quotes=marketMap(rows);
  core.update(state=>{
    let changed=false;
    const holdings=arr(state?.squad?.holdings).map(h=>{
      if(!active(h))return h;
      const pos=livePosition(h,quotes);if(!pos)return h;
      const next={...h};
      if(raw(next.livePriceGbp)!==pos.price){next.livePriceGbp=pos.price;changed=true}
      if(raw(next.marketValueGbp)!==pos.value){next.marketValueGbp=pos.value;changed=true}
      if(raw(next.dayChangePct)!==pos.change){next.dayChangePct=pos.change;changed=true}
      return next;
    });
    const snapshot={...state,squad:{...state.squad,holdings}};
    const unique=uniqueSecurities(snapshot,quotes),up=unique.filter(x=>x.change>0).length,down=unique.filter(x=>x.change<0).length,flat=unique.length-up-down;
    const dayGbp=unique.reduce((sum,x)=>sum+x.day,0),value=unique.reduce((sum,x)=>sum+x.value,0),before=value-dayGbp,dayPct=before>0?dayGbp/before*100:0;
    const market={...(state.market||{}),portfolioTodayChangeGbp:dayGbp,portfolioTodayChangePct:dayPct,advancers:up,decliners:down,flat,coverage:unique.length,uniqueSecurityCount:unique.length,matchReportAuthority:VERSION,updatedAt:now()};
    if(!changed&&state?.market?.matchReportAuthority===VERSION&&raw(state?.market?.portfolioTodayChangeGbp)===dayGbp)return state;
    return {...state,squad:{...state.squad,holdings,marketEvidenceAt:now(),updatedAt:now()},market};
  });
}
function setText(id,text){const el=document.getElementById(id);if(el)el.textContent=text}
function scoreRating(change,confidence,safety){
  let r=6.5+clamp(Number(change)||0,-4,4)*.55;
  if(confidence!=null)r+=(confidence-65)/100;
  if(safety!=null)r+=(safety-65)/120;
  return clamp(r,4.5,9.8);
}
function renderContributors(unique){
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const row=(x,positive)=>`<div class="contrib-row"><strong>${esc(x.ticker)} — ${esc(x.name)}</strong><span class="${positive?'positive':'negative'}">${x.day>=0?'+':''}${money(x.day)}</span></div>`;
  const pos=unique.filter(x=>x.day>0).sort((a,b)=>b.day-a.day).slice(0,5),neg=unique.filter(x=>x.day<0).sort((a,b)=>a.day-b.day).slice(0,5);
  const p=document.getElementById('positiveContrib'),n=document.getElementById('negativeContrib');
  if(p)p.innerHTML=pos.length?pos.map(x=>row(x,true)).join(''):'<div class="empty">No supported positive security contribution.</div>';
  if(n)n.innerHTML=neg.length?neg.map(x=>row(x,false)).join(''):'<div class="empty">No supported negative security contribution.</div>';
}
function polishPlayerTable(state,quoteMap){
  const holdings=arr(state?.squad?.holdings).filter(active);
  const table=document.getElementById('ratingsBody');if(!table)return;
  table.querySelectorAll('tr').forEach(tr=>{
    const tk=ticker(tr.querySelector('.holding-name strong')?.textContent);if(!tk)return;
    const chip=tr.querySelector('.account-chip')?.textContent||'',account=accountCode(chip);
    const h=holdings.find(x=>ticker(x?.ticker)===tk&&accountCode(x?.account)===account)||holdings.find(x=>ticker(x?.ticker)===tk);
    if(!h)return;const pos=livePosition(h,quoteMap);if(!pos)return;
    const cells=tr.querySelectorAll('td');if(cells.length<9)return;
    const confidence=confidenceForTicker(tk),safety=safetyForTicker(state,tk),rating=scoreRating(pos.change,confidence,safety);
    cells[3].textContent=money(pos.value);
    cells[4].textContent=`${pos.day>=0?'+':''}${money(pos.day)}`;cells[4].classList.toggle('positive',pos.day>0);cells[4].classList.toggle('negative',pos.day<0);
    cells[5].textContent=pct(pos.change);cells[5].classList.toggle('positive',pos.change>0);cells[5].classList.toggle('negative',pos.change<0);
    cells[7].textContent=safety!=null?`${Math.round(safety)}/100`:'—';cells[7].title=safety!=null?'Genuine Scouting dividend-safety evidence.':'No genuine standalone dividend-safety score is currently available.';
    const ratingEl=cells[8].querySelector('.player-rating');if(ratingEl)ratingEl.textContent=rating.toFixed(1);
    const bar=cells[8].querySelector('.rating-bar i');if(bar)bar.style.width=`${rating*10}%`;
    cells[8].title=`Live form ${pct(pos.change)}${confidence!=null?` • Intelligence confidence ${Math.round(confidence)}/100`:''}${safety!=null?` • dividend safety ${Math.round(safety)}/100`:''}`;
  });
}
function currentReport(state){return state?.matchday?.latest||state?.matchday?.report||arr(state?.portfolio?.matchdayReports)[0]||null}
function polishReport(){
  const core=w.Aurora2?.core;if(!core?.read||!lastRows.length)return;
  const state=core.read(),quotes=marketMap(lastRows),unique=uniqueSecurities(state,quotes);if(!unique.length)return;
  const up=unique.filter(x=>x.change>0).length,down=unique.filter(x=>x.change<0).length,flat=unique.length-up-down,day=unique.reduce((a,x)=>a+x.day,0),value=unique.reduce((a,x)=>a+x.value,0),before=value-day,changePct=before>0?day/before*100:0;
  setText('breadth',`${up} ↑ • ${down} ↓`);setText('upCount',String(up));setText('downCount',String(down));setText('flatCount',String(flat));setText('coverageCount',`${unique.length}/${unique.length}`);
  const coverage=document.getElementById('coverageCount')?.nextElementSibling;if(coverage)coverage.textContent='Unique securities with daily evidence';
  const annual=w.AuroraFinancialTruth?.getCurrentAnnualIncome?.(state)||0;
  setText('managerHeadline',`${pct(changePct)} • ${money(day)} session • ${up} up / ${down} down • ${money(annual)}/yr income.`);
  renderContributors(unique);polishPlayerTable(state,quotes);

  const confidences=[...new Set(unique.map(x=>x.ticker))].map(confidenceForTicker).filter(x=>x!=null);
  setText('confidenceReadout',confidences.length?`${Math.round(confidences.reduce((a,b)=>a+b,0)/confidences.length)}/100`:'Awaiting genuine Intelligence scores');

  const ranked=[...unique].sort((a,b)=>b.day-a.day),motm=ranked[0],worst=ranked[ranked.length-1];
  if(motm){setText('motmName',motm.ticker);setText('motmNote',`${motm.day>=0?'+':''}${money(motm.day)} supported contribution today • ${pct(motm.change)}.`);const c=confidenceForTicker(motm.ticker),s=safetyForTicker(state,motm.ticker);setText('motmRating',scoreRating(motm.change,c,s).toFixed(1))}
  if(worst){setText('worstName',worst.ticker);setText('worstNote',`${worst.day>=0?'+':''}${money(worst.day)} supported contribution today • ${pct(worst.change)}.`);const c=confidenceForTicker(worst.ticker),s=safetyForTicker(state,worst.ticker);setText('worstRating',scoreRating(worst.change,c,s).toFixed(1))}

  const defensive=[...unique].filter(x=>x.change>=0).sort((a,b)=>{
    const as=safetyForTicker(state,a.ticker)??confidenceForTicker(a.ticker)??0,bs=safetyForTicker(state,b.ticker)??confidenceForTicker(b.ticker)??0;return bs-as;
  })[0]||motm;
  if(defensive){
    const s=safetyForTicker(state,defensive.ticker),c=confidenceForTicker(defensive.ticker);setText('defName',defensive.ticker);
    setText('defNote',s!=null?`Genuine dividend-safety evidence ${Math.round(s)}/100.`:c!=null?`Aurora Intelligence confidence ${Math.round(c)}/100 • standalone dividend-safety score not available.`:'Standalone dividend-safety evidence is not currently available.');
    setText('defRating',scoreRating(defensive.change,c,s).toFixed(1));
  }

  /* A recovered report already carries the canonical 17-security breadth. Keep
     its narrative untouched; this polish only aligns the numeric panels. */
  const report=currentReport(state);if(report){const ru=raw(report?.holdings_up),rd=raw(report?.holdings_down),rf=raw(report?.holdings_flat);if(ru!=null&&rd!=null){setText('breadth',`${Math.round(ru)} ↑ • ${Math.round(rd)} ↓`);setText('upCount',String(Math.round(ru)));setText('downCount',String(Math.round(rd)));if(rf!=null)setText('flatCount',String(Math.round(rf)))}}
}
async function refresh(reason='open'){
  if(running)return running;
  running=(async()=>{
    if(!await waitForServices())return null;
    try{await w.AuroraClubCommand?.refreshMarket?.()}catch(error){console.warn('Match Report live authority: LivePrices refresh failed',error)}
    const rows=arr(w.AuroraClubCommand?.marketRows?.());lastRows=rows;
    const payload=await master();lastIntelMap=latestIntelligence(payload);
    if(rows.length)applyCanonical(rows);
    requestAnimationFrame(()=>requestAnimationFrame(polishReport));
    setTimeout(polishReport,180);setTimeout(polishReport,600);
    w.dispatchEvent(new CustomEvent('aurora:match-report-live-authority',{detail:{version:VERSION,reason,rows:rows.length,at:now()}}));
    return {rows:rows.length,at:now()};
  })();
  try{return await running}finally{running=null}
}
function bind(){
  setTimeout(()=>refresh('open'),180);
  document.addEventListener('click',e=>{if(e.target.closest('#refreshReport'))setTimeout(()=>refresh('manual'),40)},true);
  w.addEventListener('aurora2:match-report-hydrated',()=>setTimeout(()=>refresh('hydrated'),60));
  w.addEventListener('aurora2:state',()=>requestAnimationFrame(()=>requestAnimationFrame(polishReport)));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(()=>refresh('foreground'),150)});
}
w.AuroraMatchReportLiveAuthority={version:VERSION,refresh,rows:()=>lastRows.slice(),polish:polishReport};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})(window);
