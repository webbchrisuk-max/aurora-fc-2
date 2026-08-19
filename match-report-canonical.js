/* Aurora City FC — Match Report Canonical Controller v1.0
 * One render authority for the Match Report page.
 *
 * Performance source: AuroraMaster LivePrices / AuroraClubCommand live rows.
 * Holdings source: canonical Aurora2 squad.
 * Intelligence source: AuroraIntelligence confidence (never invents 0/100 safety).
 * Published MatchdayReport remains the narrative/verdict authority.
 */
(function(w){
'use strict';
if(w.AuroraMatchReportCanonical)return;
const PAGE=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(PAGE!=='match-report.html')return;

const MASTER_URL='AuroraMaster.json';
const $=id=>document.getElementById(id);
const arr=v=>Array.isArray(v)?v:[];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=v=>{if(v==null||v==='')return NaN;const n=Number(String(v).replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:NaN};
const safe=v=>Number.isFinite(v)?v:0;
const ticker=v=>String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\.GB$/i,'').replace(/\..*$/,'').toUpperCase().trim();
const esc=v=>w.Aurora2?.ui?.escape?.(String(v??''))||String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2}).format(safe(Number(v)));
const pct=v=>Number.isFinite(v)?`${v>=0?'+':''}${v.toFixed(2)}%`:'—';
let master=null,loading=null,rendering=false,lastRenderKey='';

function state(){try{return w.Aurora2?.core?.read?.()||null}catch(_){return null}}
function activePositions(s){return arr(s?.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&safe(num(h?.shares))>0)}
function income(h){const direct=num(h?.annualIncomeGbp??h?.annual_income_gbp??h?.annualIncome);if(Number.isFinite(direct)&&direct>=0)return direct;const sh=num(h?.shares),dps=num(h?.annualDpsGbp??h?.annual_dps_gbp??h?.annualDps);return Number.isFinite(sh)&&Number.isFinite(dps)?sh*dps:0}
function fallbackValue(h){const direct=num(h?.marketValueGbp??h?.market_value_gbp??h?.marketValue);if(Number.isFinite(direct)&&direct>=0)return direct;const sh=num(h?.shares),p=num(h?.livePriceGbp??h?.live_price_gbp??h?.price);return Number.isFinite(sh)&&Number.isFinite(p)?sh*p:0}
function accountLabel(h){const s=String(h?.account||'').toLowerCase();if(s.includes('212'))return'Trading 212';if(/\big\b/.test(s)||s.includes('ig isa'))return'IG ISA';return String(h?.account||'—')}
function reportDateValue(r){return r?.report_date||r?.reportDate||r?.created_at||r?.createdAt||r?.timestamp||r?.date||''}
function reportTime(r){const d=new Date(reportDateValue(r));return Number.isNaN(d.getTime())?0:d.getTime()}
function publishedReport(s){const rows=[],md=s?.matchday||s?.matchReport||{};if(md.latest)rows.push(md.latest);if(md.report)rows.push(md.report);rows.push(...arr(md.reports),...arr(s?.portfolio?.matchdayReports));return rows.filter(Boolean).sort((a,b)=>reportTime(b)-reportTime(a))[0]||null}
function reportField(r,...keys){for(const k of keys){if(r&&r[k]!==undefined&&r[k]!==null&&String(r[k]).trim()!=='')return r[k]}return undefined}
function setText(id,value,cls=''){const el=$(id);if(!el)return;el.textContent=value;el.classList.remove('positive','negative');if(cls)el.classList.add(cls)}

function latestMap(rows,timeKeys=[]){const map=new Map();arr(rows).forEach(row=>{const tk=ticker(row?.ticker||row?.symbol);if(!tk)return;let stamp=0;for(const k of timeKeys){const t=Date.parse(row?.[k]||'');if(Number.isFinite(t)){stamp=t;break}}const prev=map.get(tk);if(!prev||stamp>=prev.__stamp)map.set(tk,{...row,__stamp:stamp})});return map}
function liveMaps(){
  const payload=master||{};
  const live=latestMap(payload.LivePrices,['tradeTime','trade_time','updated_at','timestamp']);
  const intelligence=latestMap(payload.AuroraIntelligence,['generated_at','updated_at','timestamp']);
  return{live,intelligence};
}
async function refreshMaster(force=false){
  if(loading)return loading;
  if(!force&&master)return master;
  loading=(async()=>{try{const res=await fetch(`${MASTER_URL}?v=${Date.now()}`,{cache:'no-store'});if(res.ok)master=await res.json()}catch(err){console.warn('[Match Report] AuroraMaster refresh failed',err)}finally{loading=null}return master})();
  return loading;
}
function clubLiveMap(){const rows=arr(w.AuroraClubCommand?.marketRows?.());return new Map(rows.map(r=>[ticker(r?.ticker||r?.symbol),r]).filter(x=>x[0]))}
function liveQuote(tk,maps,club){
  const a=maps.live.get(tk)||{},b=club.get(tk)||{};
  const price=[num(b.price),num(a.price),num(a.live_price),num(a.livePrice)].find(Number.isFinite);
  const change=[num(b.change),num(a.change),num(a.day_change_pct),num(a.daily_change_pct),num(a.change_pct)].find(Number.isFinite);
  const tradeTime=b.tradeTime||a.tradeTime||a.trade_time||a.updated_at||a.timestamp||'';
  return{price:Number.isFinite(price)?price:NaN,change:Number.isFinite(change)?change:NaN,tradeTime};
}
function confidenceFor(tk,maps,s){
  const intel=maps.intelligence.get(tk)||{};const n=num(intel.confidence_score);if(Number.isFinite(n)&&n>0)return clamp(n,0,100);
  const target=arr(s?.scouting?.targets).find(t=>ticker(t?.ticker)===tk);const c=num(target?.confidence);return Number.isFinite(c)&&c>0?clamp(c,0,100):NaN;
}
function safetyFor(tk,s){const target=arr(s?.scouting?.targets).find(t=>ticker(t?.ticker)===tk);const n=num(target?.dividendSafety);return Number.isFinite(n)&&n>0?clamp(n,0,100):NaN}
function enrichPositions(s){
  const maps=liveMaps(),club=clubLiveMap();
  return activePositions(s).map(h=>{
    const tk=ticker(h?.ticker),q=liveQuote(tk,maps,club),shares=safe(num(h?.shares));
    const livePrice=Number.isFinite(q.price)&&q.price>0?q.price:NaN;
    const changePct=Number.isFinite(q.change)&&q.change>-99.9?q.change:NaN;
    const previous=Number.isFinite(livePrice)&&Number.isFinite(changePct)?livePrice/(1+changePct/100):NaN;
    const dayGbp=Number.isFinite(previous)?(livePrice-previous)*shares:NaN;
    return{...h,ticker:tk,_livePrice:livePrice,_dayPct:changePct,_dayGbp:dayGbp,_marketValue:Number.isFinite(livePrice)?livePrice*shares:fallbackValue(h),_confidence:confidenceFor(tk,maps,s),_safety:safetyFor(tk,s),_tradeTime:q.tradeTime};
  });
}
function uniqueSecurities(positions){const map=new Map();positions.forEach(h=>{const tk=h.ticker;if(!tk)return;const r=map.get(tk)||{ticker:tk,name:h.name||tk,shares:0,marketValue:0,dayGbp:0,income:0,dayPct:h._dayPct,confidence:h._confidence,safety:h._safety,evidence:false};r.shares+=safe(num(h.shares));r.marketValue+=safe(h._marketValue);r.income+=income(h);if(Number.isFinite(h._dayGbp)){r.dayGbp+=h._dayGbp;r.evidence=true}if(!Number.isFinite(r.dayPct)&&Number.isFinite(h._dayPct))r.dayPct=h._dayPct;if(!Number.isFinite(r.confidence)&&Number.isFinite(h._confidence))r.confidence=h._confidence;if(!Number.isFinite(r.safety)&&Number.isFinite(h._safety))r.safety=h._safety;map.set(tk,r)});return[...map.values()]}
function metrics(s,positions,report){
  const securities=uniqueSecurities(positions),evidenced=securities.filter(x=>x.evidence&&Number.isFinite(x.dayPct));
  const computedValue=positions.reduce((a,h)=>a+safe(h._marketValue),0),computedGain=evidenced.length===securities.length?securities.reduce((a,h)=>a+h.dayGbp,0):NaN;
  const reportValue=num(reportField(report,'portfolio_value','portfolioValue'));
  const reportGain=num(reportField(report,'portfolio_change_gbp','portfolioChangeGbp'));
  const reportPct=num(reportField(report,'portfolio_change_pct','portfolioChangePct'));
  const value=Number.isFinite(computedValue)&&computedValue>0?computedValue:Number.isFinite(reportValue)?reportValue:safe(num(s?.portfolio?.teamValue));
  const gain=Number.isFinite(computedGain)?computedGain:Number.isFinite(reportGain)?reportGain:NaN;
  const changePct=Number.isFinite(gain)&&value-gain>0?gain/(value-gain)*100:Number.isFinite(reportPct)?reportPct:NaN;
  const annual=w.AuroraFinancialTruth?.getCurrentAnnualIncome?.(s)??positions.reduce((a,h)=>a+income(h),0);
  const up=evidenced.filter(x=>x.dayPct>0).length,down=evidenced.filter(x=>x.dayPct<0).length,flat=evidenced.length-up-down;
  return{securities,evidenced,value,gain,changePct,annual,monthly:annual/12,up,down,flat,coverage:evidenced.length,total:securities.length};
}
function rating(h,annual){if(!Number.isFinite(h._dayPct))return NaN;let r=6.5+clamp(h._dayPct,-4,4)*.55;if(Number.isFinite(h._confidence))r+=(h._confidence-65)/80;const share=annual>0?income(h)/annual:0;r+=Math.min(.35,share*.9);return clamp(r,4.5,9.6)}
function securityRating(h,annual){let r=6.5+clamp(h.dayPct,-4,4)*.55;if(Number.isFinite(h.confidence))r+=(h.confidence-65)/80;const share=annual>0?h.income/annual:0;r+=Math.min(.35,share*.9);return clamp(r,4.5,9.6)}

function renderAwards(m,report){
  const byMove=[...m.evidenced].sort((a,b)=>b.dayGbp-a.dayGbp),motm=byMove[0]||null,worst=byMove[byMove.length-1]||null,incomeStar=[...m.securities].sort((a,b)=>b.income-a.income)[0]||null;
  const defenders=m.securities.filter(x=>!Number.isFinite(x.dayPct)||x.dayPct>=0).sort((a,b)=>(Number.isFinite(b.safety)?b.safety:Number.isFinite(b.confidence)?b.confidence:-1)-(Number.isFinite(a.safety)?a.safety:Number.isFinite(a.confidence)?a.confidence:-1));const def=defenders[0]||null;
  const award=(prefix,h,note,forced)=>{const name=$(prefix+'Name'),noteEl=$(prefix+'Note'),rate=$(prefix+'Rating');if(name)name.textContent=h?.ticker||'Awaiting evidence';if(noteEl)noteEl.textContent=note;const r=Number.isFinite(forced)?forced:h?securityRating(h,m.annual):NaN;if(rate)rate.textContent=Number.isFinite(r)?r.toFixed(1):'—'};
  award('motm',motm,motm?`${motm.dayGbp>=0?'+':''}${money(motm.dayGbp)} live contribution • ${pct(motm.dayPct)}.`:'No positive contribution evidence.');
  award('worst',worst,worst?`${worst.dayGbp>=0?'+':''}${money(worst.dayGbp)} live contribution • ${pct(worst.dayPct)}.`:'No negative contribution evidence.');
  award('income',incomeStar,incomeStar?`${money(incomeStar.income)} a year in canonical dividend income.`:'No income evidence.',incomeStar?clamp(6.8+incomeStar.income/Math.max(1,m.annual)*3,6.8,9.6):NaN);
  const defNote=def?(Number.isFinite(def.safety)?`Dividend safety ${Math.round(def.safety)}/100.`:Number.isFinite(def.confidence)?`Aurora Intelligence confidence ${Math.round(def.confidence)}/100.`:'No genuine safety/confidence score is available.'):'Awaiting defensive evidence.';award('def',def,defNote);
  [['motm','motm'],['def','def'],['income','income'],['worst','worst']].forEach(([prefix,key])=>{const name=reportField(report,`${key}_ticker`,`${key}_name`,`${key}Name`);if(name&&$(prefix+'Name'))$(prefix+'Name').textContent=String(name)});
}
function renderContributors(m){const row=(x,pos)=>`<div class="contrib-row"><strong>${esc(x.ticker)} — ${esc(x.name||x.ticker)}</strong><span class="${pos?'positive':'negative'}">${x.dayGbp>=0?'+':''}${money(x.dayGbp)}</span></div>`;const pos=[...m.evidenced].filter(x=>x.dayGbp>0).sort((a,b)=>b.dayGbp-a.dayGbp).slice(0,5),neg=[...m.evidenced].filter(x=>x.dayGbp<0).sort((a,b)=>a.dayGbp-b.dayGbp).slice(0,5);$('positiveContrib').innerHTML=pos.map(x=>row(x,true)).join('')||'<div class="empty">No supported positive holding contribution.</div>';$('negativeContrib').innerHTML=neg.map(x=>row(x,false)).join('')||'<div class="empty">No supported negative holding contribution.</div>'}
function renderRatings(positions,m){
  const rows=[...positions].sort((a,b)=>{const ar=rating(a,m.annual),br=rating(b,m.annual);return safe(br)-safe(ar)||safe(b._marketValue)-safe(a._marketValue)});
  $('ratingsBody').innerHTML=rows.map((h,i)=>{const r=rating(h,m.annual),d=h._dayGbp,p=h._dayPct,confidence=h._confidence;return `<tr><td><b>#${i+1}</b></td><td class="holding-name"><strong>${esc(h.ticker)}</strong><span>${esc(h.name||h.ticker)}</span></td><td><span class="account-chip">${esc(accountLabel(h))}</span></td><td>${money(h._marketValue)}</td><td class="move ${Number.isFinite(d)?d>0?'positive':d<0?'negative':'':''}">${Number.isFinite(d)?`${d>=0?'+':''}${money(d)}`:'—'}</td><td class="${Number.isFinite(p)?p>0?'positive':p<0?'negative':''}">${pct(p)}</td><td>${money(income(h))}/yr</td><td>${Number.isFinite(confidence)?Math.round(confidence)+'/100':'—'}</td><td><span class="player-rating">${Number.isFinite(r)?r.toFixed(1):'—'}</span><div class="rating-bar"><i style="width:${Number.isFinite(r)?r*10:0}%"></i></div></td></tr>`}).join('');
}
function nextDividend(s){const direct=s?.income?.nextDividend;if(direct)return direct;const cutoff=Date.now()-86400000;return arr(s?.income?.calendar).filter(x=>{const d=new Date(x?.payDate||x?.pay_date||x?.exDate||x?.ex_date||'');return !Number.isNaN(d.getTime())&&d.getTime()>=cutoff&&!['PAID','CANCELLED','ARCHIVED'].includes(String(x?.status||'').toUpperCase())}).sort((a,b)=>new Date(a.payDate||a.pay_date||a.exDate||a.ex_date)-new Date(b.payDate||b.pay_date||b.exDate||b.ex_date))[0]||null}
function dividendDescription(d){if(!d)return'No upcoming dividend event is currently loaded.';const date=d.payDate||d.pay_date||d.exDate||d.ex_date||d.date,amount=num(d.amount??d.expectedAmountGbp??d.expected_amount_gbp);return`${ticker(d.ticker)||'Dividend'}${date?` • ${new Date(date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`:''}${Number.isFinite(amount)?` • ${money(amount)}`:''}`}
function renderWatch(s,m,report){const worst=[...m.evidenced].sort((a,b)=>a.dayGbp-b.dayGbp)[0],next=nextDividend(s),macro=reportField(report,'macro_watch','macroWatch')||s?.notifications?.marketState?.note||`Market regime: ${String(reportField(report,'market_regime','regime')||s?.market?.regime||'Monitoring')}.`,route=s?.transfer?.route,routeText=route?`${String(route.strategy||'sustainable').toLowerCase()==='maximum'?'Maximum Income':'Sustainable Income'} • ${arr(route.allocations).filter(a=>safe(num(a.amount))>0).length} proposed buys.`:'No live Transfer route requiring review.';$('watchItems').innerHTML=[['👀','One to watch',reportField(report,'one_to_watch','oneToWatch')||(worst?`${worst.ticker} is today's weakest live contributor at ${money(worst.dayGbp)}.`:'No weakest holding can be named without daily evidence.')],['📅','Dividend calendar',reportField(report,'calendar_watch','calendarWatch')||dividendDescription(next)],['🌍','Macro / market',String(macro)],['🔄','Transfer desk',routeText]].map(([icon,title,text])=>`<div class="watch"><i>${icon}</i><div><strong>${esc(title)}</strong><span>${esc(text)}</span></div></div>`).join('')}
function renderForm(s){const rows=[...arr(s?.portfolio?.history),...arr(s?.market?.history)].map((row,index)=>{const change=num(row?.changeGbp??row?.todayChangeGbp??row?.dayChangeGbp??row?.change),p=num(row?.changePct??row?.dayChangePct??row?.pct),date=new Date(row?.date||row?.timestamp||row?.createdAt||0);return{change,p,date,index}}).filter(x=>Number.isFinite(x.change)||Number.isFinite(x.p)).sort((a,b)=>(b.date?.getTime()||b.index)-(a.date?.getTime()||a.index)).slice(0,7).reverse();$('formRow').innerHTML=rows.length?rows.map(x=>{const score=Number.isFinite(x.change)?x.change:x.p,result=score>0?'W':score<0?'L':'D',label=!Number.isNaN(x.date.getTime())?x.date.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}):'Session',value=Number.isFinite(x.change)?`${x.change>=0?'+':''}${money(x.change)}`:pct(x.p);return`<div class="form-chip ${result==='W'?'win':result==='L'?'loss':'draw'}"><b>${esc(label)} <em>${result}</em></b><span>${esc(value)}</span></div>`}).join(''):'<div class="empty">Recent portfolio session history is still building.</div>'}

function render(){
  if(rendering)return;const s=state();if(!s)return;rendering=true;try{
    const positions=enrichPositions(s),report=publishedReport(s),m=metrics(s,positions,report),resultClass=Number.isFinite(m.gain)?m.gain>0?'positive':m.gain<0?'negative':'':'';
    const signature=[positions.map(h=>`${h.ticker}:${h._dayPct}:${h._marketValue}`).join('|'),report?.report_id||report?.id||reportDateValue(report),m.gain,m.up,m.down].join('~');if(signature===lastRenderKey)return;lastRenderKey=signature;
    setText('portfolioValue',money(m.value));setText('dayGain',Number.isFinite(m.gain)?`${m.gain>=0?'+':''}${money(m.gain)}`:'Awaiting feed',resultClass);setText('annualIncome',money(m.annual));setText('monthlyIncome',money(m.monthly));setText('breadth',m.coverage?`${m.up} ↑ • ${m.down} ↓`:'Awaiting feed');setText('marketRegime',String(reportField(report,'market_regime','regime')||s?.market?.regime||'Monitoring'));setText('resultPct',pct(m.changePct));$('scoreOrb')?.classList.toggle('loss',Number.isFinite(m.changePct)&&m.changePct<0);setText('matchStatus',new Date().getHours()>=17?'FULL TIME':'MATCHDAY LIVE');setText('upCount',m.coverage?String(m.up):'—');setText('downCount',m.coverage?String(m.down):'—');setText('flatCount',m.coverage?String(m.flat):'—');setText('coverageCount',`${m.coverage}/${m.total}`);
    const summary=reportField(report,'summary','result_summary','resultSummary')||(m.coverage?`Full time: Aurora finished ${pct(m.changePct)} with ${m.up} securities up, ${m.down} down and ${m.flat} flat.`:'Daily performance evidence is still loading.');setText('reportSummary',String(summary));
    const verdict=reportField(report,'verdict')||s?.decision?.title||'Hold team shape',note=reportField(report,'manager_report','managerReport')||s?.decision?.note||'No urgent manager instruction is currently published.';setText('decisionTitle',String(verdict).replace(/[?_]+/g,' ').trim().toUpperCase());setText('decisionNote',String(note));setText('managerHeadline',m.coverage?`${pct(m.changePct)} • ${m.gain>=0?'+':''}${money(m.gain)} session • ${m.up} up / ${m.down} down • ${money(m.annual)}/yr income.`:'Daily market evidence is still loading.');setText('regimeReadout',String(reportField(report,'market_regime','regime')||s?.market?.regime||'Monitoring'));setText('buyMode',String(reportField(report,'buy_mode','buyMode')||s?.market?.buyMode||s?.scouting?.buyMode||'Selective accumulation'));
    const conf=m.securities.map(x=>x.confidence).filter(Number.isFinite);setText('confidenceReadout',conf.length?`${Math.round(conf.reduce((a,b)=>a+b,0)/conf.length)}/100`:'Awaiting scores');
    renderAwards(m,report);renderContributors(m);renderRatings(positions,m);renderWatch(s,m,report);renderForm(s);
    const ths=[...document.querySelectorAll('.match-table th')];if(ths[7])ths[7].textContent='Confidence';
  }finally{rendering=false}
}
async function refresh(){const b=$('refreshReport');if(b){b.disabled=true;b.textContent='Refreshing…'}try{await w.AuroraMatchReportPublishedFeed?.refresh?.().catch?.(()=>null);try{await w.AuroraClubCommand?.refreshMarket?.()}catch(_){}await refreshMaster(true);render()}finally{if(b){b.disabled=false;b.textContent='Refresh'}}}
function schedule(){setTimeout(render,40)}
function bind(){refreshMaster(true).finally(render);w.addEventListener('aurora2:state',schedule);w.addEventListener('aurora:market-live',()=>refreshMaster(false).finally(render));w.addEventListener('aurora2:match-report-hydrated',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshMaster(true).finally(render)});$('refreshReport')?.addEventListener('click',refresh);setInterval(()=>refreshMaster(true).finally(render),60000)}

w.AuroraMatchReportCanonical={version:'1.0',render,refresh};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})(window);
