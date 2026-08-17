/* Aurora City FC — Nexus V2 notification header dock v1.0
 * Pins the shared notification bell into the visible Nexus top bar.
 * This is a presentation/placement guard only; notification data remains owned
 * by aurora-notifications.js and canonical Aurora state.
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_V2_NOTIFICATION_DOCK__)return;
w.__AURORA_NEXUS_V2_NOTIFICATION_DOCK__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

function installStyle(){
  if(document.getElementById('nexusV2NotificationDockStyle'))return;
  const style=document.createElement('style');
  style.id='nexusV2NotificationDockStyle';
  style.textContent=`
    .n2-header{
      display:grid!important;
      grid-template-columns:minmax(0,1fr) auto!important;
      align-items:center!important;
      gap:10px!important;
      overflow:visible!important;
      z-index:320!important;
    }
    .n2-header-left{grid-column:1!important;min-width:0!important;overflow:hidden!important;}
    .n2-header>.head-actions,.n2-header .n2-shell-context{
      grid-column:2!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;
      gap:7px!important;min-width:0!important;max-width:100%!important;overflow:visible!important;position:relative!important;
      z-index:330!important;margin:0!important;
    }
    .n2-notification-slot{
      order:0!important;width:44px!important;min-width:44px!important;height:44px!important;flex:0 0 44px!important;
      display:flex!important;align-items:center!important;justify-content:center!important;position:relative!important;overflow:visible!important;z-index:340!important;
    }
    .n2-notification-slot #auroraNotificationBell{
      position:relative!important;inset:auto!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;
      margin:0!important;width:44px!important;min-width:44px!important;max-width:44px!important;height:44px!important;min-height:44px!important;
      padding:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;visibility:visible!important;
      opacity:1!important;transform:none!important;clip:auto!important;overflow:visible!important;pointer-events:auto!important;z-index:341!important;
    }
    .n2-header #auroraSystemHealthButton{order:1!important;flex:0 0 44px!important;width:44px!important;min-width:44px!important;height:44px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;padding:0!important;}
    .n2-header #auroraLogoutButton{order:2!important;flex:0 0 auto!important;}
    .n2-header #connectionBadge{order:3!important;flex:0 1 auto!important;white-space:nowrap!important;}
    @media(max-width:1050px){.n2-header #connectionBadge{max-width:120px!important;overflow:hidden!important;text-overflow:ellipsis!important}.n2-header #auroraLogoutButton{min-width:58px!important;padding-inline:8px!important}}
    @media(max-width:760px){.n2-header #connectionBadge{display:none!important}.n2-header #auroraLogoutButton{display:none!important}.n2-header>.head-actions,.n2-header .n2-shell-context{gap:5px!important}}
  `;
  document.head.appendChild(style);
}

function ensureHeaderLeft(header){
  let left=header?.querySelector('.n2-header-left');
  const brand=header?.querySelector('.brand');
  const menu=header?.querySelector('#auroraShellMenuButton');
  if(!left&&header&&brand&&menu){left=document.createElement('div');left.className='n2-header-left';header.insertBefore(left,brand);left.append(menu,brand)}
  return left;
}

function dockBell(){
  installStyle();
  const header=document.querySelector('.n2-header');
  const actions=header?.querySelector('.head-actions');
  if(!header||!actions)return false;
  ensureHeaderLeft(header);
  actions.classList.add('aurora-shell-context','n2-shell-context');
  const live=actions.querySelector('#connectionBadge,.live');
  if(live)live.classList.add('aurora-shell-live');
  let slot=actions.querySelector('.n2-notification-slot');
  if(!slot){slot=document.createElement('span');slot.className='n2-notification-slot';slot.setAttribute('aria-label','Notification Centre');actions.insertBefore(slot,actions.firstChild||null)}
  const bell=document.getElementById('auroraNotificationBell');
  if(bell&&bell.parentElement!==slot)slot.appendChild(bell);
  if(bell){bell.removeAttribute('hidden');bell.style.setProperty('display','inline-flex','important');bell.style.setProperty('visibility','visible','important');bell.style.setProperty('opacity','1','important');return true}
  return false;
}

function start(){
  dockBell();
  let attempts=0;
  const timer=setInterval(()=>{attempts++;const done=dockBell();if(done&&attempts>8)clearInterval(timer);if(attempts>80)clearInterval(timer)},125);
  const observer=new MutationObserver(()=>dockBell());
  observer.observe(document.body,{subtree:true,childList:true});
  setTimeout(()=>observer.disconnect(),20000);
  window.addEventListener('resize',dockBell,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(dockBell,50)});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})(window);