/* Aurora City FC — Nexus V2 runtime recovery v1.0
 * Keeps the read-only Nexus HQ attached to canonical Aurora 2 state.
 * - recovers a meaningful last-good local backup if the active state is an accidental blank foundation
 * - forces the managed AuroraData 2 holdings sync when local credentials are available
 * - restores the Nexus notification bell to the visible top header instead of the document tail
 * - keeps the compact Nexus header inside the iPad/browser viewport
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_V2_RUNTIME_RECOVERY__)return;
w.__AURORA_NEXUS_V2_RUNTIME_RECOVERY__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

const DEFAULT_DATA2_ENDPOINT='https://script.google.com/macros/s/AKfycbwkmw_xADQXjMUeJQEcNdguGNjBoCgU7mPvGbP8BYcoPy09gqCbhM79tDeV9Iag0l4COg/exec';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const arr=v=>Array.isArray(v)?v:[];

function activeHoldings(s){
  return arr(s?.squad?.holdings).filter(h=>
    ['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&Number(h?.shares)>0
  );
}
function meaningfulState(s){
  if(!s||typeof s!=='object')return false;
  return activeHoldings(s).length>0 ||
    arr(s?.finance?.pots).length>0 ||
    arr(s?.finance?.bills).length>0 ||
    arr(s?.scouting?.targets).length>0 ||
    arr(s?.income?.calendar).length>0 ||
    Boolean(s?.transfer?.route) || Boolean(s?.mission);
}

function installHeaderStyle(){
  if(document.getElementById('nexusV2RuntimeHeaderStyle'))return;
  const style=document.createElement('style');
  style.id='nexusV2RuntimeHeaderStyle';
  style.textContent=`
    .n2-header{min-width:0!important;gap:10px!important;overflow:visible!important;padding-left:clamp(12px,2.2vw,30px)!important;padding-right:clamp(12px,2.2vw,30px)!important}
    .n2-header>.brand,.n2-header-left{flex:1 1 auto!important;min-width:0!important;overflow:hidden}
    .n2-header-left .brand{min-width:0!important;overflow:hidden}
    .n2-header .brand>div:last-child{min-width:0!important;overflow:hidden}
    .n2-header .brand strong,.n2-header .brand span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .n2-header .head-actions.n2-shell-context{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:7px!important;flex:0 0 auto!important;min-width:0!important;max-width:min(52vw,520px)!important;margin-left:auto!important}
    .n2-header .head-actions.n2-shell-context>.shell-control,.n2-header .head-actions.n2-shell-context>.menu{position:relative!important;inset:auto!important;flex:0 0 auto!important;margin:0!important}
    .n2-header #auroraNotificationBell{display:inline-flex!important;align-items:center!important;justify-content:center!important;visibility:visible!important;opacity:1!important}
    .n2-header #auroraLogoutButton{width:auto!important;min-width:68px!important;padding:0 10px!important}
    @media(max-width:900px){
      .n2-header .brand span{display:none!important}
      .n2-header .head-actions.n2-shell-context{max-width:62vw!important}
      .n2-header #auroraLogoutButton{min-width:58px!important;padding:0 8px!important;font-size:8px!important}
    }
    @media(max-width:620px){
      .n2-header #auroraLogoutButton{display:none!important}
      .n2-header .head-actions.n2-shell-context{max-width:58vw!important;gap:5px!important}
    }
  `;
  document.head.appendChild(style);
}

function ensureLogout(actions,live){
  if(document.getElementById('auroraLogoutButton')||!actions)return;
  const button=document.createElement('button');
  button.type='button';
  button.id='auroraLogoutButton';
  button.className='shell-control';
  button.title='Log out of Aurora';
  button.textContent='Logout';
  actions.insertBefore(button,live||null);
  button.addEventListener('click',()=>{
    if(w.AuroraShell?.logout)w.AuroraShell.logout();
    else{
      try{sessionStorage.removeItem('aurora2:session:authenticated')}catch(_){}
      location.replace('index.html?logout=1');
    }
  });
}

function fixHeader(){
  installHeaderStyle();
  const header=document.querySelector('.n2-header');
  const actions=header?.querySelector('.head-actions');
  if(!header||!actions)return false;

  actions.classList.add('aurora-shell-context','n2-shell-context');
  const live=actions.querySelector('.live,#connectionBadge');
  live?.classList.add('aurora-shell-live');

  const bell=document.getElementById('auroraNotificationBell');
  if(bell&&bell.parentElement!==actions)actions.insertBefore(bell,live||actions.firstChild||null);
  ensureLogout(actions,live);
  return true;
}

function recoverLastGoodBackup(){
  const core=w.Aurora2?.core;
  if(!core?.read||!core?.restoreBackup)return false;
  const current=core.read();
  if(meaningfulState(current))return false;

  let raw=null,backup=null;
  try{
    raw=localStorage.getItem(core.BACKUP_KEY||'aurora2:state:backup:lastgood');
    backup=raw?JSON.parse(raw):null;
  }catch(_){backup=null}
  if(!meaningfulState(backup))return false;

  try{
    const restored=core.restoreBackup();
    if(!meaningfulState(restored))return false;
    /* A backup can restore the portfolio while live backend connectivity is still
       being checked. Do not present an old CONNECTED stamp as a current probe. */
    core.update(s=>({
      ...s,
      connection:{...s.connection,mode:'recovered-local',status:'LOCAL_RECOVERY'}
    }));
    return true;
  }catch(err){
    console.warn('Nexus recovery could not restore the last good Aurora state:',err);
    return false;
  }
}

function ensureKnownEndpoint(){
  const client=w.AuroraData2Client;
  if(!client?.config||!client?.saveConfig)return null;
  const cfg=client.config()||{};
  if(!cfg.endpoint&&cfg.token){
    return client.saveConfig(DEFAULT_DATA2_ENDPOINT,cfg.token);
  }
  return cfg;
}

async function forceCanonicalSync(){
  const started=Date.now();
  let attemptedDirect=false;

  while(Date.now()-started<14000){
    fixHeader();
    recoverLastGoodBackup();

    const client=w.AuroraData2Client;
    const cfg=ensureKnownEndpoint();
    if(!client?.post||!cfg?.endpoint||!cfg?.token){
      await wait(350);
      continue;
    }

    const manager=w.AuroraSyncManager;
    const services=manager?.status?.()?.services||[];
    if(manager?.run&&services.includes('holdings')){
      await manager.run('holdings',{force:true,reason:'nexus-open'});
      const state=w.Aurora2?.core?.read?.();
      if(activeHoldings(state).length)return true;
    }

    if(w.AuroraHoldingsSync?.sync){
      await w.AuroraHoldingsSync.sync();
      const state=w.Aurora2?.core?.read?.();
      if(activeHoldings(state).length)return true;
    }

    /* Last-resort direct snapshot uses the same canonical holdings adapter. */
    if(!attemptedDirect&&w.AuroraHoldingsSync?.applySnapshot&&client?.get){
      attemptedDirect=true;
      try{
        const snapshot=await client.get('marketPriceSnapshot',{});
        w.AuroraHoldingsSync.applySnapshot(snapshot);
        const state=w.Aurora2?.core?.read?.();
        if(activeHoldings(state).length)return true;
      }catch(err){
        console.warn('Nexus direct canonical snapshot fallback failed:',err);
      }
    }
    await wait(450);
  }
  return false;
}

function watchHeader(){
  fixHeader();
  const observer=new MutationObserver(()=>fixHeader());
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(()=>observer.disconnect(),12000);
}

function init(){
  watchHeader();
  recoverLastGoodBackup();
  forceCanonicalSync().catch(err=>console.warn('Nexus canonical recovery failed:',err));
  w.addEventListener('aurora2:cloud-applied',()=>setTimeout(()=>forceCanonicalSync(),120));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')setTimeout(()=>forceCanonicalSync(),120);
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})(window);
