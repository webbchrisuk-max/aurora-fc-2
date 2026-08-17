/* Aurora City FC — Nexus V2 hero artwork bridge v1.1
 * Wires the GitHub-hosted Nexus stadium PNG into the Nexus V2 hero.
 * Presentation only; no portfolio/data logic is changed.
 */
(function(){
'use strict';
if(window.__AURORA_NEXUS_V2_HERO_ART__)return;
window.__AURORA_NEXUS_V2_HERO_ART__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

const IMAGE='assets/heroes/nexus-hq-stadium.PNG?v=20260817-nexus-v2-1';

function install(){
  if(document.getElementById('nexusV2HeroArtStyle'))return;

  const preload=document.createElement('link');
  preload.rel='preload';
  preload.as='image';
  preload.href=IMAGE;
  document.head.appendChild(preload);

  const style=document.createElement('style');
  style.id='nexusV2HeroArtStyle';
  style.textContent=`
    .n2-shell .hero{
      background-image:
        linear-gradient(90deg,rgba(2,8,23,.96) 0%,rgba(4,17,31,.90) 34%,rgba(4,22,40,.66) 58%,rgba(3,13,25,.76) 100%),
        url("${IMAGE}")!important;
      background-size:cover!important;
      background-repeat:no-repeat!important;
      background-position:62% center!important;
      box-shadow:0 22px 70px rgba(0,0,0,.58),0 0 58px rgba(0,183,255,.13)!important;
    }

    .n2-shell .hero:before{
      background:
        linear-gradient(90deg,rgba(7,17,27,.64) 0 44%,rgba(7,17,27,.18) 70%,rgba(7,17,27,.05) 100%),
        repeating-linear-gradient(90deg,transparent 0 89px,rgba(111,233,255,.035) 90px),
        repeating-linear-gradient(0deg,transparent 0 59px,rgba(111,233,255,.03) 60px)!important;
    }

    /* Keep the manager instruction readable while allowing much more of the
       stadium artwork to remain visible through the right-hand hero panel. */
    .n2-shell .manager-order{
      background:linear-gradient(140deg,rgba(7,19,38,.38),rgba(4,16,27,.54))!important;
      backdrop-filter:blur(1.5px)!important;
      -webkit-backdrop-filter:blur(1.5px)!important;
      border-left-color:rgba(62,136,168,.22)!important;
    }

    @media(max-width:1100px){
      .n2-shell .hero{background-position:68% center!important;}
      .n2-shell .manager-order{background:linear-gradient(140deg,rgba(7,19,38,.42),rgba(4,16,27,.58))!important;}
    }
    @media(max-width:680px){
      .n2-shell .hero{background-position:74% center!important;}
    }
  `;
  document.head.appendChild(style);
}

install();
})();
