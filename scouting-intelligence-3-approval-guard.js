/* Aurora City FC — Scouting Intelligence 3 Approval Guard v1.0
 * Makes canonical Intelligence 3 eligibility the only shortlist approval rule.
 * DATA PENDING/BLOCK can never be approved or counted as Transfer eligible.
 * Also removes legacy editor seed values so blank evidence stays genuinely blank.
 */
(function(w){
'use strict';
if(w.AuroraScoutingIntelligence3ApprovalGuard)return;
const PAGE=(String(location.pathname||'').split('/').pop()||'').toLowerCase();if(PAGE!=='scouting.html')return;
const arr=v=>Array.isArray(v)?v:[];
const now=()=>new Date().toISOString();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function A(){return w.Aurora2||{}}
function state(){try{return A().core?.read?.()||null}catch(_){return null}}
function eligible(t){return t?.eligibleForTransfer===true&&['pass','caution'].includes(String(t?.status||'').toLowerCase())}
function locked(s){return !!s?.transfer?.route?.locked||['LOCKED','PARTIALLY_REGISTERED','COMPLETE'].includes(String(s?.mission?.status||''))}
function toast(text){const el=document.getElementById('toast');if(!el)return;el.textContent=text;el.style.opacity='1';clearTimeout(w.__a2ScoutV3GuardToast);w.__a2ScoutV3GuardToast=setTimeout(()=>el.style.opacity='0',2600)}
function score(t,s){return String(s?.scouting?.strategy||'sustainable').toLowerCase()==='maximum'?Number(t?.maximumScore||0):Number(t?.sustainableScore||0)}
function canonicalRank(s){return w.AuroraScoutingIntelligence3?.rank?.(arr(s?.scouting?.targets),s)||arr(s?.scouting?.targets)}
function clearNewEditorDefaults(){
  const mode=document.getElementById('editorMode');if(mode&&String(mode.textContent||'').toUpperCase().includes('EDIT'))return;
  ['editConfidence','editSafety','editValuation','editGrowth','editQuality'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  const status=document.getElementById('editorStatus');if(status)status.textContent='Leave unsupported evidence blank. Intelligence 3 will hydrate genuine evidence or keep the candidate DATA PENDING.';
}
function sanitizeApprovals(){
  const s=state();if(!s?.scouting||!A().core?.update)return;
  const targets=arr(s.scouting.targets),invalid=targets.filter(t=>t?.approvedForTransfer&&!eligible(t));if(!invalid.length)return;
  A().core.update(current=>{const nextTargets=arr(current?.scouting?.targets).map(t=>eligible(t)?t:{...t,approvedForTransfer:false,approvedAt:null,approvalBatchId:null});const valid=nextTargets.filter(t=>t.approvedForTransfer&&eligible(t));return{...current,scouting:{...current.scouting,targets:nextTargets,status:valid.length?current.scouting.status:'SCOUTING_REVIEW',approvedBatchId:valid.length?current.scouting.approvedBatchId:null,updatedAt:now()}}});
}
async function refreshEngine(snapshot=false){try{await w.AuroraScoutingIntelligence3?.refresh?.(snapshot);await wait(140)}catch(_){} }
async function runCanonical(event){
  event?.preventDefault?.();event?.stopImmediatePropagation?.();
  const before=state();if(!before)return;if(locked(before)){toast('Unlock Transfer before changing Active Scouting.');return}
  await refreshEngine(true);const s=state()||before,ranked=canonicalRank(s);
  A().core.update(current=>{const route=current?.transfer?.route;return{...current,scouting:{...current.scouting,status:'SCOUTING_REVIEW',approvedBatchId:null,targets:ranked.map(t=>({...t,approvedForTransfer:false,approvedAt:null,approvalBatchId:null})),scoringEngine:'AURORA_SCOUTING_INTELLIGENCE_3',updatedAt:now()},transfer:{...current.transfer,route:route?.locked?route:null,updatedAt:route&&!route.locked?now():current.transfer?.updatedAt}}});
  toast('Intelligence 3 rescored Active Scouting. DATA PENDING remains outside Transfer.');
}
async function approveCanonical(event){
  event?.preventDefault?.();event?.stopImmediatePropagation?.();
  const before=state();if(!before)return;if(locked(before)){toast('Transfer is already locked. Unlock it before changing the shortlist.');return}
  await refreshEngine(false);const s=state()||before,ranked=canonicalRank(s),permitted=ranked.filter(eligible);
  if(!permitted.length){toast('No Intelligence 3 target currently clears Transfer eligibility.');return}
  const top=permitted[0],approvedAt=now(),batch=A().core?.uid?.('SHORTLIST')||`SHORTLIST-${Date.now()}`,history={id:A().core?.uid?.('SCOUT')||`SCOUT-${Date.now()}`,approvedAt,missionId:s?.mission?.id||null,count:permitted.length,blocked:ranked.filter(t=>String(t?.status||'').toLowerCase()==='block').length,pending:ranked.filter(t=>String(t?.status||'').toLowerCase()==='pending').length,topTicker:top.ticker,topScore:score(top,s),strategy:String(s?.scouting?.strategy||'sustainable'),source:'AURORA_SCOUTING_INTELLIGENCE_3'};
  const allowed=new Set(permitted.map(t=>String(t.id||t.ticker)));
  A().core.update(current=>({...current,scouting:{...current.scouting,status:'SCOUTING_READY',approvedBatchId:batch,targets:ranked.map(t=>{const ok=allowed.has(String(t.id||t.ticker))&&eligible(t);return{...t,approvedForTransfer:ok,approvedAt:ok?approvedAt:null,approvalBatchId:ok?batch:null}}),decisionHistory:[history,...arr(current?.scouting?.decisionHistory)].slice(0,20),scoringEngine:'AURORA_SCOUTING_INTELLIGENCE_3',updatedAt:now()},portfolio:{...current.portfolio,topAuroraPlayer:top.ticker},decision:{title:`Scouting recommends ${top.ticker}`,note:`${top.recommendation} • ${Math.round(score(top,s))}/100 under ${String(s?.scouting?.strategy||'sustainable')} • ${Number(top?.yieldPct||0).toFixed(2)}% yield.`,ticker:top.ticker,confidence:top.confidence},alerts:[{id:A().core?.uid?.('ALERT')||`ALERT-${Date.now()}`,title:'Intelligence 3 shortlist approved',note:`${permitted.length} Transfer-eligible target${permitted.length===1?'':'s'} • ${top.ticker} ranked #1. DATA PENDING excluded.`,when:'now'},...arr(current?.alerts).filter(a=>a?.title!=='Intelligence 3 shortlist approved'&&a?.title!=='Scouting shortlist approved')].slice(0,8)}));
  toast(`${permitted.length} Intelligence 3 target${permitted.length===1?'':'s'} approved for Transfer.`);
}
function capture(event){const btn=event.target?.closest?.('#runScouting,#approveShortlist');if(!btn)return;if(btn.id==='runScouting')runCanonical(event);else approveCanonical(event)}
function bind(){
  document.addEventListener('click',capture,true);sanitizeApprovals();clearNewEditorDefaults();
  document.getElementById('resetCandidate')?.addEventListener('click',()=>setTimeout(clearNewEditorDefaults,0));
  w.addEventListener('aurora2:state',()=>setTimeout(sanitizeApprovals,80));
  [300,900,1800].forEach(ms=>setTimeout(()=>{sanitizeApprovals();clearNewEditorDefaults()},ms));
}
w.AuroraScoutingIntelligence3ApprovalGuard={version:'1.0',sanitize:sanitizeApprovals,eligible};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})(window);
