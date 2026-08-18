/* Aurora City FC — Match Report published feed v1.1
 * Promotes the latest genuine 5PM Match Report into one canonical state slot and makes
 * its provenance/timestamp visible. Uses the existing AuroraData 2 Nexus dashboard
 * snapshot as the backend feed when available; never invents a published report.
 */
(function(w){
'use strict';
if(w.__AURORA_MATCH_REPORT_PUBLISHED_FEED__)return;
w.__AURORA_MATCH_REPORT_PUBLISHED_FEED__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
const isMatchReport=page==='match-report.html';
const isNexus=page==='auroracityfc_nexusv2.html';
if(!isMatchReport&&!isNexus)return;

const arr=v=>Array.isArray(v)?v:[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const now=()=>new Date().toISOString();
let running=null,lastBackendAt=0,lastResult=null,canonicalising=false;

function reportDateValue(r){return r?.report_date||r?.reportDate||r?.generated_at||r?.generatedAt||r?.created_at||r?.createdAt||r?.timestamp||r?.date||''}
function reportTime(r){const d=new Date(reportDateValue(r));return Number.isNaN(d.getTime())?0:d.getTime()}
function looksLikeReport(r){
  if(!r||typeof r!=='object')return false;
  return Boolean(
    reportDateValue(r)||
    r.portfolio_change_gbp!==undefined||r.portfolioChangeGbp!==undefined||
    r.portfolio_change_pct!==undefined||r.portfolioChangePct!==undefined||
    r.manager_report||r.managerReport||r.verdict||
    r.motm_name||r.motmName||r.worst_name||r.worstName
  );
}
function addCandidate(list,r){if(looksLikeReport(r))list.push(r)}
function collectReports(container){
  const out=[];
  if(!container||typeof container!=='object')return out;
  addCandidate(out,container.latest);addCandidate(out,container.report);
  arr(container.reports).forEach(r=>addCandidate(out,r));
  return out;
}
function reportsFromState(s){
  const rows=[];
  rows.push(...collectReports(s?.matchday),...collectReports(s?.matchdayReport),...collectReports(s?.matchReport));
  arr(s?.portfolio?.matchdayReports).forEach(r=>addCandidate(rows,r));
  addCandidate(rows,s?.notifications?.matchday?.latest);
  addCandidate(rows,s?.alerts?.matchday?.latest);
  return rows.sort((a,b)=>reportTime(b)-reportTime(a));
}
function reportsFromBackend(x){
  const rows=[];
  rows.push(...collectReports(x?.matchday),...collectReports(x?.matchdayReport),...collectReports(x?.matchReport));
  addCandidate(rows,x?.latestMatchReport);addCandidate(rows,x?.latestReport);
  if(looksLikeReport(x?.report))addCandidate(rows,x.report);
  return rows.sort((a,b)=>reportTime(b)-reportTime(a));
}
function reportIdentity(r){
  const stamp=reportDateValue(r)||'';
  return String(r?.id||r?.report_id||r?.reportId||`${stamp}|${r?.portfolio_change_gbp??r?.portfolioChangeGbp??''}|${r?.verdict||''}`);
}
function normaliseReport(r,source,backendAt){
  if(!r)return null;
  return {...r,
    source:r.source||source||'AURORA_STATE',
    backendSnapshotAt:r.backendSnapshotAt||backendAt||'',
    published:true
  };
}
function canonicalise(report,source,backendAt){
  if(!report||canonicalising||!w.Aurora2?.core?.update)return false;
  const incoming=normaliseReport(report,source,backendAt),id=reportIdentity(incoming);
  canonicalising=true;
  try{
    w.Aurora2.core.update(state=>{
      const current=state?.matchday?.latest;
      if(current&&reportIdentity(current)===id&&String(current?.source||'')===String(incoming.source||''))return state;
      const existing=arr(state?.portfolio?.matchdayReports);
      const history=[incoming,...existing.filter(r=>reportIdentity(r)!==id)].sort((a,b)=>reportTime(b)-reportTime(a)).slice(0,45);
      return {...state,
        matchday:{...state.matchday,latest:incoming,report:incoming,updatedAt:now(),source:incoming.source},
        portfolio:{...state.portfolio,matchdayReports:history}
      };
    });
    return true;
  }finally{canonicalising=false;}
}
function mergeDashboardMarket(snapshot){
  const market=snapshot?.market;if(!market||typeof market!=='object'||!w.Aurora2?.core?.update)return;
  w.Aurora2.core.update(state=>{
    const current=state?.market||{};
    const patch={...current};let changed=false;
    const fields=['portfolioTodayChangeGbp','portfolioTodayChangePct','regime','status','best','worst','advancers','decliners','flat','coverage'];
    fields.forEach(k=>{if(market[k]!==undefined&&market[k]!==null&&patch[k]!==market[k]){patch[k]=market[k];changed=true;}});
    if(snapshot?.at&&patch.backendSnapshotAt!==snapshot.at){patch.backendSnapshotAt=snapshot.at;changed=true;}
    return changed?{...state,market:patch}:state;
  });
}
function ensureStamp(){
  if(!isMatchReport)return null;
  let el=document.getElementById('publishedReportStamp');if(el)return el;
  const hero=document.querySelector('.hero-copy');if(!hero)return null;
  el=document.createElement('div');el.id='publishedReportStamp';el.setAttribute('role','status');
  el.innerHTML='<strong>Checking published 5PM report…</strong><span>AuroraData 2</span>';
  Object.assign(el.style,{display:'inline-flex',flexDirection:'column',gap:'3px',margin:'10px 0 0',padding:'9px 12px',border:'1px solid #28516c',borderRadius:'11px',background:'rgba(5,22,38,.72)',boxShadow:'0 8px 24px rgba(0,0,0,.22)',maxWidth:'100%'});
  const strong=el.querySelector('strong'),span=el.querySelector('span');
  Object.assign(strong.style,{fontSize:'10px',letterSpacing:'.08em',textTransform:'uppercase',color:'#dff8ff'});
  Object.assign(span.style,{fontSize:'9px',color:'#91a8be',letterSpacing:'.05em'});
  const full=hero.querySelector('.full-time');
  if(full?.nextSibling)hero.insertBefore(el,full.nextSibling);else hero.appendChild(el);
  return el;
}
function sameLocalDay(a,b){return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function renderStamp(){
  if(!isMatchReport)return;
  const el=ensureStamp();if(!el)return;
  const state=w.Aurora2?.core?.read?.()||{},report=reportsFromState(state)[0]||null;
  const strong=el.querySelector('strong'),sub=el.querySelector('span'),today=new Date();
  if(report){
    const raw=reportDateValue(report),d=raw?new Date(raw):null,valid=d&&!Number.isNaN(d.getTime());
    const day=valid?d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}):'Published';
    const time=valid?d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'';
    const todayLabel=valid&&sameLocalDay(d,today)?'Today':day;
    strong.textContent=`${todayLabel} report loaded${time?` • generated ${time}`:''}`;
    sub.textContent=`Published 5PM report • ${String(report.source||'Aurora state').replace(/_/g,' ')}`;
    el.style.borderColor='#2d8765';el.style.background='rgba(7,55,43,.72)';
    const reportState=document.getElementById('reportState');if(reportState)reportState.textContent='● PUBLISHED REPORT';
  }else{
    const beforeFive=today.getHours()<17;
    strong.textContent=beforeFive?"Today's 5PM report is not due yet":"No published 5PM report loaded";
    sub.textContent=beforeFive?'Live state is available now • published report expected after 17:00':'Showing live Aurora state reconstruction • published feed unavailable';
    el.style.borderColor=beforeFive?'#806d38':'#8b4050';el.style.background=beforeFive?'rgba(73,59,20,.48)':'rgba(74,19,32,.48)';
  }
}
async function waitForCore(timeout=12000){
  const started=Date.now();while(Date.now()-started<timeout){if(w.Aurora2?.core?.read&&w.Aurora2?.core?.update)return true;await wait(100);}return false;
}
async function pullBackend({force=false}={}){
  if(running)return running;
  if(!force&&Date.now()-lastBackendAt<120000){renderStamp();return lastResult;}
  running=(async()=>{
    if(!await waitForCore())return null;
    const stateReport=reportsFromState(w.Aurora2.core.read())[0]||null;
    if(stateReport)canonicalise(stateReport,stateReport.source||'AURORA_STATE','');

    const client=w.AuroraData2Client,cfg=client?.config?.()||{};
    if(!client?.post||!cfg.endpoint||!cfg.token){lastResult={status:'NOT_CONFIGURED',report:Boolean(stateReport)};renderStamp();return lastResult;}
    try{
      const snapshot=await client.post('nexusDashboardSnapshot',{});
      lastBackendAt=Date.now();
      mergeDashboardMarket(snapshot);
      const backendReport=reportsFromBackend(snapshot)[0]||null;
      if(backendReport)canonicalise(backendReport,'AURORADATA2_NEXUS_DASHBOARD',snapshot?.at||now());
      const fallback=backendReport||reportsFromState(w.Aurora2.core.read())[0]||null;
      lastResult={status:'CONNECTED',report:Boolean(fallback),backendAt:snapshot?.at||now(),source:backendReport?'AURORADATA2_NEXUS_DASHBOARD':fallback?.source||'STATE'};
      return lastResult;
    }catch(error){
      lastResult={status:'ERROR',report:Boolean(reportsFromState(w.Aurora2.core.read())[0]),error:String(error?.message||error)};
      return lastResult;
    }finally{renderStamp();}
  })();
  try{return await running;}finally{running=null;}
}
function bind(){
  renderStamp();
  setTimeout(()=>pullBackend({force:true}),450);
  w.addEventListener('aurora2:match-report-hydrated',()=>setTimeout(()=>pullBackend({force:true}),80));
  w.addEventListener('aurora2:nexus-hydrated',()=>setTimeout(()=>pullBackend({force:true}),80));
  w.addEventListener('aurora2:state',()=>{if(!canonicalising)renderStamp()});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>pullBackend(),180)});
}

w.AuroraMatchReportPublishedFeed={version:'1.1',refresh:()=>pullBackend({force:true}),status:()=>lastResult,latest:()=>reportsFromState(w.Aurora2?.core?.read?.()||{})[0]||null};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})(window);
