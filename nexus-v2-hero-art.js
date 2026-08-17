/* Aurora City FC — Nexus V2 hero artwork bridge v1.2
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
    /* The stadium is now deliberately the visual lead. The overlays are only
       strong enough to hold white copy, rather than burying the artwork. */
    .n2-shell .hero{
      background-image:
        linear-gradient(90deg,rgba(2,8,23,.48) 0%,rgba(4,17,31,.34) 34%,rgba(4,22,40,.15) 60%,rgba(3,13,25,.22) 100%),
        url("${IMAGE}")!important;
      background-size:cover!important;
      background-repeat:no-repeat!important;
      background-position:58% center!important;
      box-shadow:0 22px 70px rgba(0,0,0,.44),0 0 64px rgba(0,183,255,.16)!important;
    }

    .n2-shell .hero:before{
      background:
        linear-gradient(90deg,rgba(7,17,27,.22) 0 38%,rgba(7,17,27,.07) 68%,transparent 100%),
        repeating-linear-gradient(90deg,transparent 0 89px,rgba(111,233,255,.02) 90px),
        repeating-linear-gradient(0deg,transparent 0 59px,rgba(111,233,255,.018) 60px)!important;
    }

    .n2-shell .hero-copy,
    .n2-shell .manager-order{
      text-shadow:0 2px 8px rgba(0,0,0,.78),0 0 22px rgba(0,0,0,.42);
    }

    .n2-shell .hero-copy h1{
      text-shadow:0 3px 18px rgba(0,0,0,.72),0 0 32px rgba(0,0,0,.35)!important;
    }

    /* Glass rather than a dark card: the right-hand stadium stays visible. */
    .n2-shell .manager-order{
      background:linear-gradient(140deg,rgba(7,19,38,.16),rgba(4,16,27,.25))!important;
      backdrop-filter:blur(.45px)!important;
      -webkit-backdrop-filter:blur(.45px)!important;
      border-left-color:rgba(111,233,255,.17)!important;
      box-shadow:inset 18px 0 38px rgba(1,8,18,.07)!important;
    }

    @media(max-width:1100px){
      .n2-shell .hero{background-position:64% center!important;}
      .n2-shell .manager-order{
        background:linear-gradient(140deg,rgba(7,19,38,.20),rgba(4,16,27,.29))!important;
        border-top-color:rgba(111,233,255,.16)!important;
      }
    }
    @media(max-width:680px){
      .n2-shell .hero{background-position:70% center!important;}
    }
  `;
  document.head.appendChild(style);
}

install();
})();
