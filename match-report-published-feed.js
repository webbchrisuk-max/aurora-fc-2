/* Aurora City FC — Match Report published feed v1.2
 * Reads the canonical MatchdayReport sheet directly, then the Nexus backend snapshot.
 * After 5PM, if today's persisted report is genuinely missing but complete live market
 * evidence exists, Aurora builds an honest in-session recovery report instead of showing
 * fake zero movement. Recovery never creates buy/sell authority.
 */
(function(w){
'use strict';
if(w.__AURORA_MATCH_REPORT_PUBLISHED_FEED__)return;
w.__AURORA_MATCH_REPORT_PUBLISHED_FEED__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
const isMatchReport=page==='match-report.html';
const isNexus=page==='auroracityfc_nexusv2.html';
if(!isMatchReport&&!isNexus)return;

const SHEET_ID='1ZDdYmyDrvNuz3utKmgsToKL7NqsibzbWyIo0vg-TjcA';
const REPORT_SHEET='MatchdayReport';
const arr=v=>Array.isArray(v)?v:[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const now=()=>new Date().toISOString();
const n=v=>{const x=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(x)?x:null};
const ticker=v=>String(v||'').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'').replace(/\..*$/,'');
let running=null,lastBackendAt=0,lastResult=null,canonicalising=false;

function localDateKey(d=new Date()){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function reportDateValue(r){return r?.report_date||r?.reportDate||r?.generated_at||r?.generatedAt||r?.created_at||r?.createdAt||r?.timestamp||r?.date||''}
function reportDate(r){
  const raw=reportDateValue(r);if(!raw)return null;
  if(raw instanceof Date&&!Number.isNaN(raw.getTime()))return raw;
  const text=String(raw).trim();
  const iso=/^\d{4}-\d{2}-\d{2}$/.test(text)?`${text}T12:00:00`:text;
  const d=new Date(iso);return Number.isNaN(d.getTime())?null:d;
}
function reportTime(r){return reportDate(r)?.getTime()||0}
function sameLocalDay(a,b){return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function isTodayReport(r){const d=reportDate(r);return !!d&&sameLocalDay(d,new Date())}
function looksLikeReport(r){
  if(!r||typeof r!=='object')return false;
  return Boolean(reportDateValue(r)||r.portfolio_change_gbp!==undefined||r.portfolioChangeGbp!==undefined||r.portfolio_change_pct!==undefined||r.portfolioChangePct!==undefined||r.manager_report||r.managerReport||r.verdict);
}
function addCandidate(list,r){if(looksLikeReport(r))list.push(r)}
function collectReports(container){const out=[];if(!container||typeof container!=='object')return out;addCandidate(out,container.latest);addCandidate(out,container.report);arr(container.reports).forEach(r=>addCandidate(out,r));return out}
function reportsFromState(s){
  const rows=[];rows.push(...collectReports(s?.matchday),...collectReports(s?.matchdayReport),...collectReports(s?.matchReport));arr(s?.portfolio?.matchdayReports).forEach(r=>addCandidate(rows,r));addCandidate(rows,s?.notifications?.matchday?.latest);addCandidate(rows,s?.alerts?.matchday?.latest);return rows.sort((a,b)=>reportTime(b)-reportTime(a));
}
function reportsFromBackend(x){const rows=[];rows.push(...collectReports(x?.matchday),...collectReports(x?.matchdayReport),...collectReports(x?.matchReport));addCandidate(rows,x?.latestMatchReport);addCandidate(rows,x?.latestReport);addCandidate(rows,x?.report);return rows.sort((a,b)=>reportTime(b)-reportTime(a))}
function reportIdentity(r){const stamp=reportDateValue(r)||'';return String(r?.id||r?.report_id||r?.reportId||`${stamp}|${r?.portfolio_change_gbp??r?.portfolioChangeGbp??''}|${r?.verdict||''}`)}
function normaliseReport(r,source,backendAt){
  if(!r)return null;return {...r,source:r.source||source||'AURORA_STATE',backendSnapshotAt:r.backendSnapshotAt||backendAt||'',published:r.published===false?false:true};
}
function canonicalise(report,source,backendAt){
  if(!report||canonicalising||!w.Aurora2?.core?.update)return false;
  const incoming=normaliseReport(report,source,backendAt),id=reportIdentity(incoming);canonicalising=true;
  try{
    w.Aurora2.core.update(state=>{
      const current=state?.matchday?.latest;if(current&&reportIdentity(current)===id&&String(current?.source||'')===String(incoming.source||''))return state;
      const existing=arr(state?.portfolio?.matchdayReports),history=[incoming,...existing.filter(r=>reportIdentity(r)!==id)].sort((a,b)=>reportTime(b)-reportTime(a)).slice(0,45);
      return {...state,matchday:{...state.matchday,latest:incoming,report:incoming,updatedAt:now(),source:incoming.source},portfolio:{...state.portfolio,matchdayReports:history}};
    });
    return true;
  }finally{canonicalising=false}
}

function tableObjects(payload){
  const table=payload?.table||{},cols=arr(table.cols).map((c,i)=>String(c?.label||c?.id||`c${i}`).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''));
  return arr(table.rows).map(r=>{const out={};arr(r?.c).forEach((cell,i)=>{if(!cols[i])return;out[cols[i]]=cell?.f??cell?.v??''});return out});
}
function fetchSheet(sheet){
  return new Promise((resolve,reject)=>{
    const cb=`auroraMatchSheet${Date.now()}${Math.random().toString(36).slice(2)}`,script=document.createElement('script');let done=false;
    const finish=(err,payload)=>{if(done)return;done=true;clearTimeout(timer);try{delete w[cb]}catch(_){w[cb]=undefined}try{script.remove()}catch(_){}err?reject(err):resolve(tableObjects(payload))};
    const timer=setTimeout(()=>finish(new Error(`${sheet} timed out`)),16000);w[cb]=payload=>finish(null,payload||{});
    const params=new URLSearchParams({tqx:`out:json;responseHandler:${cb}`,sheet,headers:'1',tq:'select *',_t:String(Date.now())});
    script.src=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${params.toString()}`;script.async=true;script.referrerPolicy='no-referrer';script.onerror=()=>finish(new Error(`${sheet} unavailable`));document.head.appendChild(script);
  });
}
async function directSheetReport(){
  try{return (await fetchSheet(REPORT_SHEET)).filter(looksLikeReport).sort((a,b)=>reportTime(b)-reportTime(a))[0]||null}catch(error){console.warn('Match Report direct sheet read failed:',error);return null}
}

function mergeDashboardMarket(snapshot){
  const market=snapshot?.market;if(!market||typeof market!=='object'||!w.Aurora2?.core?.update)return;
  w.Aurora2.core.update(state=>{const current=state?.market||{},patch={...current};let changed=false;['portfolioTodayChangeGbp','portfolioTodayChangePct','regime','status','best','worst','advancers','decliners','flat','coverage'].forEach(k=>{if(market[k]!==undefined&&market[k]!==null&&patch[k]!==market[k]){patch[k]=market[k];changed=true}});if(snapshot?.at&&patch.backendSnapshotAt!==snapshot.at){patch.backendSnapshotAt=snapshot.at;changed=true}return changed?{...state,market:patch}:state});
}

function activeUnique(state){
  const map=new Map();arr(state?.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&(n(h?.shares)||0)>0).forEach(h=>{const tk=ticker(h?.ticker);if(!tk)return;const row=map.get(tk)||{ticker:tk,name:h?.name||tk,shares:0,income:0};row.shares+=n(h?.shares)||0;row.income+=n(h?.annualIncomeGbp)||(n(h?.shares)||0)*(n(h?.annualDpsGbp)||0);map.set(tk,row)});return [...map.values()];
}
async function liveRows(){
  try{await w.AuroraClubCommand?.refreshMarket?.()}catch(_){}
  return arr(w.AuroraClubCommand?.marketRows?.());
}
async function buildRecoveryReport(){
  if(new Date().getHours()<17)return null;
  const state=w.Aurora2?.core?.read?.();if(!state)return null;
  const active=activeUnique(state),live=await liveRows();if(!active.length||!live.length)return null;
  const liveMap=new Map(live.map(r=>[ticker(r.ticker||r.symbol),r])),rows=[];
  active.forEach(h=>{const r=liveMap.get(h.ticker),price=n(r?.price),change=n(r?.change);if(price===null||price<=0||change===null||change<=-99.9)return;const prev=price/(1+change/100),day=(price-prev)*h.shares;rows.push({...h,price,change,day,value:price*h.shares})});
  if(rows.length!==active.length)return null;
  const portfolioValue=rows.reduce((x,r)=>x+r.value,0),dayGbp=rows.reduce((x,r)=>x+r.day,0),previous=portfolioValue-dayGbp,dayPct=previous?dayGbp/previous*100:0;
  const up=rows.filter(r=>r.change>0).length,down=rows.filter(r=>r.change<0).length,flat=rows.length-up-down;
  const motm=[...rows].sort((a,b)=>b.day-a.day)[0],tough=[...rows].sort((a,b)=>a.day-b.day)[0],incomeStar=[...rows].sort((a,b)=>b.income-a.income)[0];
  const annual=w.AuroraFinancialTruth?.getCurrentAnnualIncome?.(state)??rows.reduce((x,r)=>x+r.income,0),regime=String(state?.market?.regime||state?.notifications?.marketState?.regime||'Monitoring'),buyMode=String(state?.market?.buyMode||state?.scouting?.buyMode||'Selective accumulation');
  const result=dayPct>0.05?'Win':dayPct<-0.05?'Narrow defeat':'Draw';
  return {
    report_date:localDateKey(),status:'LIVE_RECOVERY',portfolio_change_pct:dayPct,portfolio_change_gbp:dayGbp,portfolio_value:portfolioValue,annual_income:annual,market_result:result,
    summary:`Aurora finished ${Math.abs(dayPct).toFixed(2)}% ${dayPct>=0?'higher':'lower'} in a ${up}-up, ${down}-down, ${flat}-flat session; ${motm?.ticker||'the leader'} led the gains while ${tough?.ticker||'the main drag'} was the largest sterling drag.`,
    manager_report:`The active income squad finished with ${up} holdings up, ${down} down and ${flat} flat. ${motm?.ticker||'The leading holding'} produced the strongest positive sterling contribution while ${tough?.ticker||'the main drag'} was the largest negative contributor. ${regime} remains the current market regime. This recovered Match Report is descriptive only and does not create a new buy or sell decision.`,
    verdict:`HOLD • ${buyMode.toUpperCase()}`,motm_ticker:motm?.ticker||'',motm_rating:'',defensive_hero_ticker:'',defensive_hero_rating:'',income_star_ticker:incomeStar?.ticker||'',income_star_rating:'',toughest_match_ticker:tough?.ticker||'',toughest_match_rating:'',holdings_up:up,holdings_down:down,holdings_flat:flat,market_regime:regime,buy_mode:buyMode,source:'AURORA_LIVE_FULL_TIME_RECOVERY',created_at:now(),report_id:`MATCHDAY-${localDateKey()}-RECOVERY`,published:false,recovered:true
  };
}

function ensureStamp(){
  if(!isMatchReport)return null;let el=document.getElementById('publishedReportStamp');if(el)return el;const hero=document.querySelector('.hero-copy');if(!hero)return null;
  el=document.createElement('div');el.id='publishedReportStamp';el.setAttribute('role','status');el.innerHTML='<strong>Checking published 5PM report…</strong><span>AuroraData 2</span>';
  Object.assign(el.style,{display:'inline-flex',flexDirection:'column',gap:'3px',margin:'10px 0 0',padding:'9px 12px',border:'1px solid #28516c',borderRadius:'11px',background:'rgba(5,22,38,.72)',boxShadow:'0 8px 24px rgba(0,0,0,.22)',maxWidth:'100%'});const strong=el.querySelector('strong'),span=el.querySelector('span');Object.assign(strong.style,{fontSize:'10px',letterSpacing:'.08em',textTransform:'uppercase',color:'#dff8ff'});Object.assign(span.style,{fontSize:'9px',color:'#91a8be',letterSpacing:'.05em'});const full=hero.querySelector('.full-time');if(full?.nextSibling)hero.insertBefore(el,full.nextSibling);else hero.appendChild(el);return el;
}
function renderStamp(){
  if(!isMatchReport)return;const el=ensureStamp();if(!el)return;const report=reportsFromState(w.Aurora2?.core?.read?.()||{})[0]||null,strong=el.querySelector('strong'),sub=el.querySelector('span'),today=new Date(),d=reportDate(report),todayReport=report&&d&&sameLocalDay(d,today);
  if(todayReport&&report?.recovered){strong.textContent='Today full-time report recovered from live market data';sub.textContent='5PM writer missing • genuine live evidence used • no invented movement';el.style.borderColor='#9a7728';el.style.background='rgba(82,57,11,.62)';const rs=document.getElementById('reportState');if(rs)rs.textContent='● RECOVERED LIVE REPORT';return}
  if(todayReport){const time=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});strong.textContent=`Today report loaded${time?` • ${time}`:''}`;sub.textContent=`Published 5PM report • ${String(report.source||'AuroraData 2').replace(/_/g,' ')}`;el.style.borderColor='#2d8765';el.style.background='rgba(7,55,43,.72)';const rs=document.getElementById('reportState');if(rs)rs.textContent='● PUBLISHED REPORT';return}
  if(report){const label=d?d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}):'older';strong.textContent=`No published report for today • latest is ${label}`;sub.textContent='Aurora will attempt a live full-time recovery after 17:00';el.style.borderColor='#8b5f2a';el.style.background='rgba(74,45,10,.55)';return}
  const beforeFive=today.getHours()<17;strong.textContent=beforeFive?"Today's 5PM report is not due yet":"No published 5PM report loaded";sub.textContent=beforeFive?'Published report expected after 17:00':'Aurora is attempting live full-time recovery';el.style.borderColor=beforeFive?'#806d38':'#8b4050';el.style.background=beforeFive?'rgba(73,59,20,.48)':'rgba(74,19,32,.48)';
}
async function waitForCore(timeout=12000){const started=Date.now();while(Date.now()-started<timeout){if(w.Aurora2?.core?.read&&w.Aurora2?.core?.update)return true;await wait(100)}return false}

async function pullBackend({force=false}={}){
  if(running)return running;if(!force&&Date.now()-lastBackendAt<120000){renderStamp();return lastResult}
  running=(async()=>{
    if(!await waitForCore())return null;
    const stateReport=reportsFromState(w.Aurora2.core.read())[0]||null,direct=await directSheetReport();let snapshot=null,backendReport=null,backendError='';
    const client=w.AuroraData2Client,cfg=client?.config?.()||{};
    if(client?.post&&cfg.endpoint&&cfg.token){try{snapshot=await client.post('nexusDashboardSnapshot',{});lastBackendAt=Date.now();mergeDashboardMarket(snapshot);backendReport=reportsFromBackend(snapshot)[0]||null}catch(error){backendError=String(error?.message||error)}}
    const candidates=[direct,backendReport,stateReport].filter(Boolean).sort((a,b)=>reportTime(b)-reportTime(a));let chosen=candidates[0]||null;
    if(chosen)canonicalise(chosen,chosen===direct?'AURORADATA2_MATCHDAY_SHEET':chosen===backendReport?'AURORADATA2_NEXUS_DASHBOARD':chosen.source||'AURORA_STATE',snapshot?.at||now());
    chosen=reportsFromState(w.Aurora2.core.read())[0]||chosen;
    if((!chosen||!isTodayReport(chosen))&&new Date().getHours()>=17){const recovered=await buildRecoveryReport();if(recovered){canonicalise(recovered,recovered.source,now());chosen=recovered}}
    lastResult={status:chosen?'CONNECTED':'NO_REPORT',report:Boolean(chosen),today:Boolean(chosen&&isTodayReport(chosen)),recovered:Boolean(chosen?.recovered),backendAt:snapshot?.at||'',source:chosen?.source||'',error:backendError};renderStamp();return lastResult;
  })();
  try{return await running}finally{running=null}
}
function bind(){
  renderStamp();setTimeout(()=>pullBackend({force:true}),450);
  w.addEventListener('aurora2:match-report-hydrated',()=>setTimeout(()=>pullBackend({force:true}),80));w.addEventListener('aurora2:nexus-hydrated',()=>setTimeout(()=>pullBackend({force:true}),80));w.addEventListener('aurora:market-live',()=>setTimeout(()=>pullBackend({force:true}),80));w.addEventListener('aurora2:state',()=>{if(!canonicalising)renderStamp()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>pullBackend(),180)});
}

w.AuroraMatchReportPublishedFeed={version:'1.2',refresh:()=>pullBackend({force:true}),status:()=>lastResult,latest:()=>reportsFromState(w.Aurora2?.core?.read?.()||{})[0]||null};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})(window);
