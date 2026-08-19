/* Aurora City FC — Nexus visual compatibility shim v1.2
 *
 * Hero title styling lives in aurora-typography.css and is applied during
 * first paint. Nexus V2 also uses a tactical .players layer, while the shared
 * Aurora shell uses the same generic class for decorative/login animation.
 * Keep this file cosmetic only: it restores the Nexus tactical layer to full
 * visibility without rendering or changing any portfolio data.
 */
(function(){
'use strict';
if(window.__AURORA_NEXUS_HERO_TITLES__)return;
window.__AURORA_NEXUS_HERO_TITLES__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

function installNexusPitchIsolation(){
  if(document.getElementById('auroraNexusPitchIsolationV12'))return;
  const style=document.createElement('style');
  style.id='auroraNexusPitchIsolationV12';
  style.textContent=`
    .pitch-panel .players{
      position:absolute!important;
      inset:0!important;
      z-index:3!important;
      display:block!important;
      visibility:visible!important;
      opacity:1!important;
      transform:none!important;
      filter:none!important;
      mix-blend-mode:normal!important;
      pointer-events:none!important;
      animation:none!important;
      transition:none!important;
    }
    .pitch-panel .players .n2-player-node{
      visibility:visible!important;
      opacity:1!important;
      filter:none!important;
      pointer-events:auto!important;
    }
  `;
  document.head.appendChild(style);
}

installNexusPitchIsolation();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installNexusPitchIsolation,{once:true});
})();
