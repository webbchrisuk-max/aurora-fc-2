/* Aurora City FC — Nexus V2 notification/status dock v1.3
 * Compact Nexus header + loader for the shared live performance authority.
 * Notification data remains owned by aurora-notifications.js.
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_V2_NOTIFICATION_DOCK__)return;
w.__AURORA_NEXUS_V2_NOTIFICATION_DOCK__=true;
const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

function loadAuthority(){
  if(document.querySelector('script[data-nexus-live-authority]'))return;
  const s=document.createElement('script');s.src='nexus-v2-live-performance-authority.js?v=20260819-live-authority-1';s.async=false;s.dataset.nexusLiveAuthority='1';document.head.appendChild(s);
}
function installStyle(){
  if(document.getElementById('nexusV2NotificationDockStyle'))return;
  const style=document.createElement('style');style.id='nexusV2NotificationDockStyle';style.textContent=`
  .aurora-shell-header .shell-home,.aurora-shell-header #auroraSystemHealthButton,.aurora-shell-header #auroraDataFreshness,.n2-header .shell-home,.n2-header #auroraSystemHealthButton,.n2-header #auroraDataFreshness{display:none!important}
  .aurora-shell-header .aurora-shell-context,.n2-header>.head-actions,.n2-header .n2-shell-context{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:8px!important;min-width:0!important;overflow:visible!important;position:relative!important}
  .aurora-shell-header .aurora-shell-datetime,.n2-header .aurora-shell-datetime{order:0!important;flex:0 0 auto!important}
  .aurora-shell-header #auroraClubSearchButton,.n2-header #auroraClubSearchButton{order:1!important;width:42px!important;min-width:42px!important;height:42px!important;padding:0!important;margin:0!important;flex:0 0 42px!important}
  .n2-notification-slot{order:2!important;width:42px!important;min-width:42px!important;height:42px!important;flex:0 0 42px!important;display:flex!important;align-items:center!important;justify-content:center!important;position:relative!important;overflow:visible!important;z-index:340!important;border:0!important;background:transparent!important;box-shadow:none!important;padding:0!important;margin:0!important}
  .n2-notification-slot #auroraNotificationBell{position:relative!important;inset:auto!important;margin:0!important;width:42px!important;min-width:42px!important;max-width:42px!important;height:42px!important;min-height:42px!important;padding:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;visibility:visible!important;opacity:1!important;transform:none!important;overflow:visible!important;pointer-events:auto!important;z-index:341!important}
  .n2-notification-slot #auroraNotificationBadge{top:-5px!important;right:-5px!important;min-width:18px!important;height:18px!important;padding:0 5px!important;font-size:9px!important;line-height:18px!important;border:2px solid #061222!important;box-shadow:0 0 12px rgba(255,80,110,.62)!important}
  .aurora-shell-header #connectionBadge,.n2-header #connectionBadge{order:3!important;min-width:116px!important;height:42px!important;min-height:42px!important;padding:0 12px!important;margin:0!important;flex:0 0 auto!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;white-space:nowrap!important;border-radius:10px!important;font-size:8px!important;font-weight:950!important;letter-spacing:.09em!important;text-transform:uppercase!important;cursor:pointer!important}
  .aurora-shell-header #connectionBadge:before,.n2-header #connectionBadge:before{content:none!important;display:none!important}
  .aurora-shell-header #connectionBadge.is-feed-stale,.n2-header #connectionBadge.is-feed-stale{color:#ffd27c!important;border-color:#6d5422!important;background:#221807!important}
  .aurora-shell-header #connectionBadge.is-feed-offline,.n2-header #connectionBadge.is-feed-offline{color:#ff8795!important;border-color:#69303a!important;background:#210b10!important}
  .aurora-shell-header #auroraLogoutButton,.n2-header #auroraLogoutButton{order:4!important;flex:0 0 auto!important;min-width:76px!important;height:42px!important;margin:0!important;padding:0 12px!important}
  @media(max-width:1050px){.aurora-shell-header .aurora-shell-context,.n2-header>.head-actions,.n2-header .n2-shell-context{gap:6px!important}.aurora-shell-header #connectionBadge,.n2-header #connectionBadge{min-width:94px!important;padding-inline:9px!important}.aurora-shell-header #auroraLogoutButton,.n2-header #auroraLogoutButton{min-width:64px!important;padding-inline:9px!important}}
  @media(max-width:760px){.aurora-shell-header #connectionBadge,.n2-header #connectionBadge,.aurora-shell-header #auroraLogoutButton,.n2-header #auroraLogoutButton{display:none!important}}
  `;document.head.appendChild(style);
}
function context(){const h=document.querySelector('.aurora-shell-header')||document.querySelector('.n2-header');if(!h)return null;const a=h.querySelector('.aurora-shell-context')||h.querySelector('.head-actions');if(a)a.classList.add('aurora-shell-context','n2-shell-context');return a}
function dockBell(){
  installStyle();const a=context();if(!a)return false;a.querySelector('#auroraSystemHealthButton')?.remove();a.querySelector('#auroraDataFreshness')?.remove();const home=a.querySelector('.shell-home');if(home)home.hidden=true;
  let slot=a.querySelector('.n2-notification-slot');if(!slot){slot=document.createElement('span');slot.className='n2-notification-slot';slot.setAttribute('aria-label','Notification Centre');const live=a.querySelector('#connectionBadge,.aurora-shell-live,.live');a.insertBefore(slot,live||null)}
  const bell=document.getElementById('auroraNotificationBell');if(bell&&bell.parentElement!==slot)slot.appendChild(bell);if(bell){bell.removeAttribute('hidden');bell.style.setProperty('display','inline-flex','important')}
  const search=a.querySelector('#auroraClubSearchButton'),live=a.querySelector('#connectionBadge,.aurora-shell-live,.live'),logout=a.querySelector('#auroraLogoutButton');if(search)a.appendChild(search);a.appendChild(slot);if(live)a.appendChild(live);if(logout)a.appendChild(logout);
  if(live&&!live.dataset.nexusHealthBound){live.dataset.nexusHealthBound='1';live.title='Aurora live status — tap for System Health';live.setAttribute('role','link');live.setAttribute('tabindex','0');live.addEventListener('click',()=>location.assign('system-health.html'));live.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();location.assign('system-health.html')}})}
  return Boolean(bell);
}
function liveStatus(){
  const live=document.querySelector('.aurora-shell-header #connectionBadge,.n2-header #connectionBadge');if(!live)return;const s=w.AuroraClubCommand?.status?.(),last=s?.marketLastSuccess?new Date(s.marketLastSuccess):null,mins=last&&Number.isFinite(last.getTime())?Math.max(0,Math.floor((Date.now()-last.getTime())/60000)):null,offline=!navigator.onLine||Boolean(s?.marketLastError&&!last);live.classList.remove('is-feed-stale','is-feed-offline');if(offline){live.textContent='● OFFLINE';live.classList.add('is-feed-offline')}else if(last&&mins<=2)live.textContent=`● LIVE • ${last.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;else if(last){live.textContent=`● STALE • ${mins}M`;live.classList.add('is-feed-stale')}else live.textContent='● SYSTEMS LIVE';
}
function tidy(){dockBell();liveStatus()}
function start(){loadAuthority();tidy();let n=0;const timer=setInterval(()=>{n++;tidy();if(n>80)clearInterval(timer)},125);const observer=new MutationObserver(()=>requestAnimationFrame(tidy));observer.observe(document.body,{subtree:true,childList:true});setTimeout(()=>observer.disconnect(),22000);setInterval(liveStatus,15000);window.addEventListener('online',tidy);window.addEventListener('offline',tidy);w.addEventListener('aurora2:state',()=>setTimeout(tidy,0));w.addEventListener('aurora:market-live',()=>setTimeout(tidy,0));document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadAuthority();setTimeout(tidy,50)}})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
