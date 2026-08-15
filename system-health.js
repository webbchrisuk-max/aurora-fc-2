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

  const support={release,core:diag,integrity,sync,cloud:w.AuroraCloudSync?.status?.()||null,state:{connection:state?.connection,squadSync:canonical,incomeBackend:state?.income?.backend,registrationBackend:state?.registration?.backend,mission:state?.mission?{id:state.mission.id,status:state.mission.status,approvedBudget:state.mission.approvedBudget}:null,route:state?.transfer?.route?{id:state.transfer.route.id,status:state.transfer.route.status,allocated:state.transfer.route.allocated,remaining:state.transfer.route.remaining}:null}};
  $('supportSnapshot').textContent=JSON.stringify(support,null,2);
}
$('runCheck')?.addEventListener('click',()=>run());
$('syncNow')?.addEventListener('click',async()=>{toast('Running managed sync…');await w.AuroraSyncManager?.runAll?.('system-health');await run();toast('Sync check complete.')});
$('backupNow')?.addEventListener('click',()=>{const ok=w.Aurora2?.core?.backup?.('manual-system-health');toast(ok?'Last-good backup created.':'Backup could not be created.');run()});
$('restoreBackup')?.addEventListener('click',()=>{if(!confirm('Restore the last-good Aurora state backup? This replaces the current browser working state.'))return;try{w.Aurora2.core.restoreBackup();toast('Backup restored. Reloading Aurora…');setTimeout(()=>location.reload(),600)}catch(err){toast(String(err?.message||err))}});
async function start(){if(!w.Aurora2?.core?.read){setTimeout(start,200);return}await run();setInterval(()=>{if(document.visibilityState==='visible')run()},60000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);

/* =========================================================
   SYSTEM HEALTH v1.1 — AURORA CLOUD CONTROL ROOM
   ========================================================= */
(function(w){
'use strict';

const $=id=>document.getElementById(id);
const set=(id,v)=>{const el=$(id);if(el)el.textContent=v??'—'};
const since=v=>{
  if(!v)return 'Never';
  const t=new Date(v).getTime();
  if(!Number.isFinite(t))return String(v);
  const mins=Math.max(0,Math.round((Date.now()-t)/60000));
  if(mins<1)return 'Just now';
  if(mins<60)return `${mins}m ago`;
  const hrs=Math.round(mins/60);
  if(hrs<48)return `${hrs}h ago`;
  return new Date(v).toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
};
function toast(msg){
  const el=$('toast');if(!el)return;
  el.textContent=msg;el.style.opacity='1';
  clearTimeout(w.__cloudHealthToast);
  w.__cloudHealthToast=setTimeout(()=>el.style.opacity='0',3200);
}
function badge(text,tone=''){
  const el=$('cloudBadge');if(!el)return;
  el.textContent=text;
  el.className=`health-badge ${tone}`.trim();
}
function setBusy(on){
  const bar=$('cloudSyncTrack');
  if(!bar)return;
  bar.classList.toggle('busy',Boolean(on));
  if(!on)bar.style.width='100%';
}
function phaseView(s){
  if(!s?.signedIn)return {
    badge:'SIGN IN',tone:'warn',title:'Aurora Cloud is signed out',
    meta:'Sign in with the same Aurora Cloud account you used with the old Aurora.'
  };
  if(s.phase==='ERROR')return {badge:'ERROR',tone:'block',title:'Aurora Cloud needs attention',meta:s.lastError||'Cloud request failed.'};
  if(s.phase==='OFFLINE'||!s.online)return {badge:'OFFLINE',tone:'warn',title:'Device is offline',meta:'Local Aurora remains available. Cloud sync will resume when the connection returns.'};
  if(s.working||['SYNCING','DOWNLOADING','UPLOADING_MASTER','SIGNING_IN'].includes(s.phase))
    return {badge:'SYNCING',tone:'',title:'Aurora Cloud is working',meta:s.action==='upload-master'?'Replacing the Aurora 2 cloud master…':s.action==='download-cloud'?'Downloading the cloud master safely…':'Checking cross-device changes…'};
  if(!s.bootstrapped&&s.cloudExists===true)return {
    badge:'DOWNLOAD FIRST',tone:'warn',title:'Cloud master found — this device is not joined yet',
    meta:'Download the cloud copy first. Aurora will not upload this device automatically.'
  };
  if(!s.bootstrapped&&s.cloudExists===false)return {
    badge:'CREATE MASTER',tone:'warn',title:'No Aurora 2 cloud master exists yet',
    meta:'On the device with the correct Aurora 2 state, choose Upload This Device as Master.'
  };
  if(s.phase==='CLOUD_MISSING')return {
    badge:'CLOUD MISSING',tone:'block',title:'The joined device cannot find its cloud master',
    meta:'Do not continue automatic sync until you deliberately recreate or download the intended master.'
  };
  if((s.conflicts||[]).length||s.phase==='CONFLICT')return {
    badge:'CONFLICT',tone:'block',title:'Cross-device conflict protected',
    meta:'Aurora stopped before overwriting departments changed independently on two devices.'
  };
  return {
    badge:'CLOUD READY',tone:'good',title:'Aurora 2 is cross-device',
    meta:'Local changes upload automatically; newer cloud changes download when this device syncs or returns to the foreground.'
  };
}
function render(s){
  s=s||w.AuroraCloudSync?.status?.();
  if(!s)return;

  const v=phaseView(s);
  badge(v.badge,v.tone);
  set('cloudStatusTitle',v.title);
  set('cloudStatusMeta',v.meta);
  set('cloudKpiStatus',s.signedIn?(s.bootstrapped?((s.conflicts||[]).length?'CONFLICT':'CLOUD'):'SETUP'):'SIGNED OUT');
  set('cloudKpiMeta',s.signedIn?(s.bootstrapped?`${s.autoSync?'Auto sync':'Manual'} • ${since(s.lastSyncAt)}`:'Choose upload/download'):'Cross-device state');
  setBusy(Boolean(s.working));

  set('cloudDeviceDisplay',s.deviceName||'Aurora Device');
  set('cloudDeviceId',s.deviceId?`ID ${String(s.deviceId).slice(0,8)}…`:'—');
  set('cloudAccount',s.user?.email||'Not signed in');
  set('cloudCloudMeta',s.signedIn?(s.bootstrapped?'Firebase authenticated • device joined':'Firebase authenticated • bootstrap required'):'Separate from Manager Access');
  set('cloudLastWriter',s.cloudDeviceName||'—');
  set('cloudLastWriterMeta',s.cloudSavedAt?`${since(s.cloudSavedAt)} • revision ${s.cloudRevision||0}`:'No Aurora 2 cloud save inspected');

  set('cloudRevision',s.cloudExists?`#${s.cloudRevision||0}`:'—');
  set('cloudLastSync',since(s.lastSyncAt));
  set('cloudLastUpload',since(s.lastUploadAt));
  set('cloudLastDownload',since(s.lastDownloadAt));

  const signIn=$('cloudSignInBox'),signed=$('cloudSignedInBox');
  if(signIn)signIn.hidden=Boolean(s.signedIn);
  if(signed)signed.hidden=!s.signedIn;

  const nameInput=$('cloudDeviceNameInput');
  if(nameInput&&document.activeElement!==nameInput)nameInput.value=s.deviceName||'';

  const bootstrap=$('cloudBootstrapBox');
  const bTitle=$('cloudBootstrapTitle');
  const bMeta=$('cloudBootstrapMeta');
  if(bootstrap){
    bootstrap.classList.toggle('ready',Boolean(s.bootstrapped));
    if(s.bootstrapped){
      if(bTitle)bTitle.textContent='This device is joined to Aurora Cloud';
      if(bMeta)bMeta.textContent=`Automatic cross-device sync is ${s.autoSync?'enabled':'paused'}.`;
    }else if(s.cloudExists){
      if(bTitle)bTitle.textContent='Cloud master already exists';
      if(bMeta)bMeta.textContent='Recommended: Download Cloud to This Device. Upload Master would deliberately replace the existing Aurora 2 cloud copy.';
    }else{
      if(bTitle)bTitle.textContent='No Aurora 2 cloud master yet';
      if(bMeta)bMeta.textContent='Use the device that currently has your correct Aurora 2 setup and upload it as the first master.';
    }
  }

  const upload=$('cloudUploadMaster');
  if(upload){
    upload.textContent=s.cloudExists?'Replace Cloud with This Device':'Upload This Device as Master';
    upload.disabled=!s.signedIn||s.working||!s.online;
  }
  const download=$('cloudDownload');
  if(download)download.disabled=!s.signedIn||s.working||!s.online||s.cloudExists!==true;
  const sync=$('cloudSyncNow');
  if(sync)sync.disabled=!s.signedIn||!s.bootstrapped||s.working||!s.online;
  const auto=$('cloudAutoSync');
  if(auto){
    auto.textContent=`Auto Sync: ${s.autoSync?'ON':'OFF'}`;
    auto.disabled=!s.signedIn||!s.bootstrapped;
  }

  const conflict=$('cloudConflictBox');
  const conflicts=s.conflicts||[];
  if(conflict)conflict.hidden=!conflicts.length;
  if(conflicts.length){
    set('cloudConflictMeta',`Protected departments: ${conflicts.map(x=>String(x).replace(/([A-Z])/g,' $1')).join(', ')}. Choose which whole copy should win for the conflict.`);
  }
}
async function waitForCloud(){
  let tries=0;
  while(!w.AuroraCloudSync&&tries<80){
    await new Promise(r=>setTimeout(r,100));
    tries++;
  }
  if(!w.AuroraCloudSync){
    badge('NOT LOADED','block');
    set('cloudStatusTitle','Aurora Cloud engine did not load');
    set('cloudStatusMeta','Check aurora-cloud-sync.js is present in the GitHub root.');
    return null;
  }
  try{await w.AuroraCloudSync.ready}catch(_){}
  return w.AuroraCloudSync;
}
async function runAction(label,fn){
  try{
    toast(label);
    await fn();
    render(w.AuroraCloudSync.status());
  }catch(err){
    toast(String(err?.message||err));
    render(w.AuroraCloudSync?.status?.());
  }
}
async function bind(){
  const cloud=await waitForCloud();
  if(!cloud)return;

  cloud.subscribe(render);
  render(cloud.status());

  $('cloudSignIn')?.addEventListener('click',()=>runAction(
    'Signing in to Aurora Cloud…',
    async()=>{
      const email=$('cloudEmail')?.value||'';
      const password=$('cloudPassword')?.value||'';
      if(!email||!password)throw new Error('Enter the Aurora Cloud email and password.');
      await cloud.signIn(email,password);
      if($('cloudPassword'))$('cloudPassword').value='';
      toast('Aurora Cloud signed in.');
    }
  ));
  $('cloudPassword')?.addEventListener('keydown',e=>{
    if(e.key==='Enter')$('cloudSignIn')?.click();
  });
  $('cloudSignOut')?.addEventListener('click',()=>{
    cloud.signOut();
    toast('Aurora Cloud signed out on this device.');
  });
  $('cloudSaveDevice')?.addEventListener('click',()=>{
    cloud.setDeviceName($('cloudDeviceNameInput')?.value||'');
    toast('Cloud device name saved.');
  });
  $('cloudUploadMaster')?.addEventListener('click',()=>runAction(
    'Preparing cloud master upload…',
    async()=>{
      const s=cloud.status();
      const warning=s.cloudExists
        ?'Replace the existing Aurora 2 cloud master with THIS device? Aurora will save the previous cloud bundle as a cloud backup first.'
        :'Create the first Aurora 2 cloud master from THIS device? Use this only on the device holding the correct Aurora 2 state.';
      if(!confirm(warning))return;
      await cloud.uploadMaster();
      toast('This device is now the Aurora 2 cloud master.');
    }
  ));
  $('cloudDownload')?.addEventListener('click',()=>runAction(
    'Downloading Aurora Cloud…',
    async()=>{
      if(!confirm('Download the Aurora 2 cloud master to THIS device? Stable Core will create a local backup before applying it.'))return;
      await cloud.downloadCloud();
      toast('Cloud state downloaded. Aurora is now joined across devices.');
    }
  ));
  $('cloudSyncNow')?.addEventListener('click',()=>runAction(
    'Checking cross-device changes…',
    async()=>{
      await cloud.syncNow('system-health');
      toast('Aurora Cloud sync check complete.');
    }
  ));
  $('cloudAutoSync')?.addEventListener('click',()=>{
    const s=cloud.status();
    cloud.setAutoSync(!s.autoSync);
    toast(`Automatic cloud sync ${!s.autoSync?'enabled':'paused'}.`);
  });
  $('cloudUseCloud')?.addEventListener('click',()=>runAction(
    'Resolving conflict from cloud…',
    async()=>{
      if(!confirm('Use the CLOUD copy for the protected conflict? This device will be backed up before the cloud state is applied.'))return;
      await cloud.useCloudCopy();
      toast('Conflict resolved using the cloud copy.');
    }
  ));
  $('cloudUseDevice')?.addEventListener('click',()=>runAction(
    'Resolving conflict from this device…',
    async()=>{
      if(!confirm('Replace the Aurora 2 cloud master with THIS DEVICE? The previous cloud copy will be backed up first.'))return;
      await cloud.replaceCloudWithThisDevice();
      toast('Conflict resolved using this device.');
    }
  ));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
else bind();

})(window);
