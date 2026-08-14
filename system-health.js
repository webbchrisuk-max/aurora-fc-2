(function(w){
'use strict';
const $=id=>document.getElementById(id);const arr=v=>Array.isArray(v)?v:[];
const set=(id,v)=>{const e=$(id);if(e)e.textContent=v??'—'};
const since=v=>{if(!v)return 'Never';const ms=Date.now()-new Date(v).getTime();if(!Number.isFinite(ms))return String(v);const m=Math.max(0,Math.round(ms/60000));return m<1?'Just now':m<60?`${m}m ago`:`${Math.round(m/60)}h ago`};
function toast(msg){const e=$('toast');if(!e)return;e.textContent=msg;e.style.opacity='1';clearTimeout(w.__healthToast);w.__healthToast=setTimeout(()=>e.style.opacity='0',2600)}
function badge(id,text,tone=''){const e=$(id);if(!e)return;e.textContent=text;e.className=`health-badge ${tone}`.trim()}
function row(tone,title,note,meta=''){return `<div class="health-row ${tone}"><i>${tone==='block'?'!':tone==='warn'?'•':'✓'}</i><div><strong>${title}</strong><span>${note}</span></div><b>${meta}</b></div>`}
async function backendCheck(){try{const r=await w.AuroraData2Client.health();return {ok:true,result:r}}catch(err){return {ok:false,error:String(err?.message||err)}}}
async function run(){
  const core=w.Aurora2?.core,platform=w.AuroraPlatform,release=w.AuroraRelease||{};
  const diag=core?.diagnostics?.()||null,integrity=core?.validate?.(core.read())||{ok:false,errors:[{message:'Core validation unavailable'}],warnings:[]};
  const sync=w.AuroraSyncManager?.status?.()||null,state=core?.read?.();
  const back=await backendCheck();
  const canonical=state?.squad?.canonicalSync||{};

  set('releaseName',release.release||'Stable Core v1');set('releaseBuild',release.build?`Build ${release.build}`:'Build —');set('schemaVersion',`v${core?.VERSION||state?.schemaVersion||'—'}`);
  set('backendStatus',back.ok?'CONNECTED':'CHECK');set('backendMeta',back.ok?'AuroraData 2 responded':back.error||'Connection failed');
  set('holdingsStatus',canonical.status||sync?.detail?.holdings?.status||'CHECK');set('holdingsMeta',canonical.lastSyncAt?`Synced ${since(canonical.lastSyncAt)}`:'No canonical sync stamp');
  set('backupStatus',diag?.backupAvailable?'READY':'NONE');set('backupMeta',diag?.backupAt?`${since(diag.backupAt)} • ${diag.backupReason||'backup'}`:'Create first backup');

  const list=[];
  if(diag?.primaryReadable!==false)list.push(row('good','Primary Aurora state is readable',`${diag?.primaryBytes||0} characters stored.`,'CORE'));
  else list.push(row('block','Primary Aurora state is unreadable','Stable Core will attempt the last-good backup.','CORE'));
  arr(integrity.errors).forEach(x=>list.push(row('block',x.code||'Integrity error',x.message||'State validation error','ERROR')));
  arr(integrity.warnings).forEach(x=>list.push(row('warn',x.code||'Integrity warning',x.message||'Review recommended','WARN')));
  if(integrity.ok&&!integrity.errors.length&&!integrity.warnings.length)list.push(row('good','Core integrity checks passed','No structural state problems were detected.','PASS'));
  $('integrityList').innerHTML=list.join('');
  badge('integrityBadge',integrity.ok?(integrity.warnings.length?'PASS + WARNINGS':'PASSED'):'FAILED',integrity.ok?(integrity.warnings.length?'warn':'good'):'block');

  const syncRows=[];
  if(sync){
    Object.entries(sync.detail||{}).filter(([k])=>k!=='updatedAt').forEach(([name,x])=>syncRows.push(row(x.status==='ERROR'?'block':x.status==='CONNECTED'?'good':'warn',name.replaceAll('-',' ').toUpperCase(),x.lastError||`Last success ${since(x.lastSuccessAt)}`,x.status||'—')));
  }else syncRows.push(row('warn','Sync Manager is loading','Refresh this check in a moment.','WAIT'));
  $('syncList').innerHTML=syncRows.join('');
  const anySyncError=syncRows.some?false:false;
  badge('syncBadge',sync?'MANAGED':'WAITING',sync?'good':'warn');

  const criticalOk=integrity.ok&&back.ok&&diag?.primaryReadable!==false;
  set('overallStatus',criticalOk?'HEALTHY':'ATTENTION');
  set('overallNote',criticalOk?'Core, backend and recovery protections are operating.':'One or more platform checks need review below.');
  $('overallStatus').style.color=criticalOk?'#c9f9dc':'#fde68a';
  badge('recoveryBadge',diag?.backupAvailable?'PROTECTED':'BACKUP NEEDED',diag?.backupAvailable?'good':'warn');
  set('lastChecked',new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));

  const support={release,core:diag,integrity,sync,state:{connection:state?.connection,squadSync:canonical,incomeBackend:state?.income?.backend,registrationBackend:state?.registration?.backend,mission:state?.mission?{id:state.mission.id,status:state.mission.status,approvedBudget:state.mission.approvedBudget}:null,route:state?.transfer?.route?{id:state.transfer.route.id,status:state.transfer.route.status,allocated:state.transfer.route.allocated,remaining:state.transfer.route.remaining}:null}};
  $('supportSnapshot').textContent=JSON.stringify(support,null,2);
}
$('runCheck')?.addEventListener('click',()=>run());
$('syncNow')?.addEventListener('click',async()=>{toast('Running managed sync…');await w.AuroraSyncManager?.runAll?.('system-health');await run();toast('Sync check complete.')});
$('backupNow')?.addEventListener('click',()=>{const ok=w.Aurora2?.core?.backup?.('manual-system-health');toast(ok?'Last-good backup created.':'Backup could not be created.');run()});
$('restoreBackup')?.addEventListener('click',()=>{if(!confirm('Restore the last-good Aurora state backup? This replaces the current browser working state.'))return;try{w.Aurora2.core.restoreBackup();toast('Backup restored. Reloading Aurora…');setTimeout(()=>location.reload(),600)}catch(err){toast(String(err?.message||err))}});
async function start(){if(!w.Aurora2?.core?.read){setTimeout(start,200);return}await run();setInterval(()=>{if(document.visibilityState==='visible')run()},60000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);