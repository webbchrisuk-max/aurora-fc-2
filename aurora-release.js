(function(w){
'use strict';
w.AuroraRelease=Object.freeze({
  product:'Aurora 2.0',
  release:'Club Command v1',
  build:'2026.08.19.2',
  schemaVersion:11,
  syncManagerVersion:1,
  platformVersion:1,
  releasedAt:'2026-08-19T15:58:00+01:00',
  channel:'stable-candidate'
});

/* Shared header housekeeping.
 * Club Command owns the honest market freshness pill (#auroraDataFreshness).
 * Older department HTMLs still carry their own .aurora-shell-live badge.
 * Once the real freshness indicator exists, suppress the duplicate legacy
 * badge everywhere so each Aurora page has one live-status control only.
 */
function enforceSingleLiveStatus(){
  document.querySelectorAll('.aurora-shell-context').forEach(context=>{
    const freshness=context.querySelector('#auroraDataFreshness');
    const legacy=[...context.querySelectorAll('.aurora-shell-live')];
    if(freshness){
      legacy.forEach(el=>{
        el.hidden=true;
        el.setAttribute('aria-hidden','true');
        el.style.setProperty('display','none','important');
      });
      freshness.hidden=false;
      freshness.removeAttribute('aria-hidden');
    }else{
      legacy.forEach(el=>{
        if(el.dataset.auroraSingleLiveHidden==='1'){
          el.hidden=false;
          el.removeAttribute('aria-hidden');
          el.style.removeProperty('display');
          delete el.dataset.auroraSingleLiveHidden;
        }
      });
    }
  });
}

function installSingleLiveGuard(){
  enforceSingleLiveStatus();
  const target=document.body||document.documentElement;
  if(!target)return;
  const observer=new MutationObserver(()=>enforceSingleLiveStatus());
  observer.observe(target,{childList:true,subtree:true});
  [50,180,500,1200,2500].forEach(ms=>setTimeout(enforceSingleLiveStatus,ms));
  w.addEventListener('aurora2:state',enforceSingleLiveStatus);
  w.AuroraSingleLiveStatus={refresh:enforceSingleLiveStatus};
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installSingleLiveGuard,{once:true});
else installSingleLiveGuard();
})(window);
