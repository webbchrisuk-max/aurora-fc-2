(function(w){
'use strict';
w.AuroraRelease=Object.freeze({
  product:'Aurora 2.0',
  release:'Scouting Intelligence 3',
  build:'2026.08.19.3',
  schemaVersion:11,
  syncManagerVersion:1,
  platformVersion:1,
  releasedAt:'2026-08-19T16:58:00+01:00',
  channel:'stable-candidate'
});

/* Scouting Intelligence 3 is the canonical final scoring authority. Load the
 * one-time evidence migration first, then the engine. This also gives Scouting
 * a second loader path if an older cached aurora-motion.js is still present.
 */
function ensureScoutingIntelligence3(){
  const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
  if(page!=='scouting.html')return;
  if(!w.AuroraScoutingIntelligence3Migration&&!document.querySelector('script[data-aurora-scouting-intelligence3-migration]')){
    const migration=document.createElement('script');
    migration.src='scouting-intelligence-3-migration.js?v=20260819-intelligence-3-migration-2';
    migration.async=false;
    migration.dataset.auroraScoutingIntelligence3Migration='1';
    document.head.appendChild(migration);
  }
  if(!w.AuroraScoutingIntelligence3&&!document.querySelector('script[data-aurora-scouting-intelligence3]')){
    const script=document.createElement('script');
    script.src='scouting-intelligence-3.js?v=20260819-intelligence-3-2';
    script.async=false;
    script.dataset.auroraScoutingIntelligence3='1';
    document.head.appendChild(script);
  }
}
ensureScoutingIntelligence3();

/* Shared header housekeeping.
 * Club Command owns the honest market freshness pill (#auroraDataFreshness).
 * Older department HTMLs still carry their own .aurora-shell-live badge.
 * Show exactly one status: prefer freshness whenever it is visible; otherwise
 * keep the compact legacy LIVE badge for narrow layouts.
 */
function enforceSingleLiveStatus(){
  document.querySelectorAll('.aurora-shell-context').forEach(context=>{
    const freshness=context.querySelector('#auroraDataFreshness');
    const legacy=[...context.querySelectorAll('.aurora-shell-live')];
    let freshnessVisible=false;
    if(freshness){
      freshnessVisible=getComputedStyle(freshness).display!=='none';
      freshness.hidden=false;
      freshness.removeAttribute('aria-hidden');
    }
    legacy.forEach(el=>{
      if(freshness&&freshnessVisible){
        el.dataset.auroraSingleLiveHidden='1';
        el.hidden=true;
        el.setAttribute('aria-hidden','true');
        el.style.setProperty('display','none','important');
      }else if(el.dataset.auroraSingleLiveHidden==='1'){
        el.hidden=false;
        el.removeAttribute('aria-hidden');
        el.style.removeProperty('display');
        delete el.dataset.auroraSingleLiveHidden;
      }
    });
  });
}

function installSingleLiveGuard(){
  enforceSingleLiveStatus();
  const target=document.body||document.documentElement;
  if(!target)return;
  const observer=new MutationObserver(()=>enforceSingleLiveStatus());
  observer.observe(target,{childList:true,subtree:true});
  [50,180,500,1200,2500].forEach(ms=>setTimeout(enforceSingleLiveStatus,ms));
  w.addEventListener('resize',enforceSingleLiveStatus,{passive:true});
  w.addEventListener('aurora2:state',enforceSingleLiveStatus);
  w.AuroraSingleLiveStatus={refresh:enforceSingleLiveStatus};
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installSingleLiveGuard,{once:true});
else installSingleLiveGuard();
})(window);
