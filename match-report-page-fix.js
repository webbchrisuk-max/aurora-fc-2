/* Aurora City FC — Match Report full-page scroll/layout guard v1.0
 * The shared shell intentionally locks body scrolling for manager access/PWA shells.
 * Match Report is a document-length report, so it must own normal vertical scrolling.
 */
(function(w){
'use strict';
if(w.__AURORA_MATCH_REPORT_PAGE_FIX__)return;
w.__AURORA_MATCH_REPORT_PAGE_FIX__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='match-report.html')return;

function installStyle(){
  if(document.getElementById('auroraMatchReportPageFixStyle'))return;
  const style=document.createElement('style');
  style.id='auroraMatchReportPageFixStyle';
  style.textContent=`
    html{
      width:100%!important;
      height:auto!important;
      min-height:100%!important;
      overflow-x:hidden!important;
      overflow-y:auto!important;
      -webkit-overflow-scrolling:touch!important;
    }
    body{
      width:100%!important;
      height:auto!important;
      min-height:100vh!important;
      min-height:100svh!important;
      overflow-x:hidden!important;
      overflow-y:auto!important;
      position:relative!important;
      overscroll-behavior-y:auto!important;
      -webkit-overflow-scrolling:touch!important;
    }
    body.shell-navigation-open{overflow:hidden!important;}
    .match-shell{
      width:100%!important;
      min-height:100vh!important;
      min-height:100svh!important;
      height:auto!important;
      overflow:visible!important;
    }
    .match-shell>.page,
    main.page{
      width:min(1540px,100%)!important;
      max-width:100%!important;
      min-height:0!important;
      height:auto!important;
      overflow:visible!important;
    }
    .match-header{max-width:100vw!important;}
    .table-panel{max-width:100%!important;min-width:0!important;}
    .table-scroll{
      width:100%!important;
      max-width:100%!important;
      overflow-x:auto!important;
      overflow-y:visible!important;
      -webkit-overflow-scrolling:touch!important;
    }
    .form-row{
      max-width:100%!important;
      overflow-x:auto!important;
      overflow-y:hidden!important;
      -webkit-overflow-scrolling:touch!important;
    }
    #auroraShellNavigation{position:fixed!important;max-height:100svh!important;overflow:hidden!important;}
    #auroraShellNavigation .aurora-shell-nav-scroll{overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;}
  `;
  document.head.appendChild(style);
}

function unlock(){
  installStyle();
  if(!document.body.classList.contains('shell-navigation-open')){
    document.documentElement.style.setProperty('overflow-y','auto','important');
    document.body.style.setProperty('overflow-y','auto','important');
  }
  document.documentElement.style.setProperty('height','auto','important');
  document.body.style.setProperty('height','auto','important');
  const shell=document.querySelector('.match-shell');
  if(shell){
    shell.style.setProperty('height','auto','important');
    shell.style.setProperty('overflow','visible','important');
  }
}

function init(){
  unlock();
  requestAnimationFrame(unlock);
  setTimeout(unlock,150);
  setTimeout(unlock,800);
  w.addEventListener('resize',unlock,{passive:true});
  w.addEventListener('orientationchange',()=>setTimeout(unlock,180),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(unlock,50)});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})(window);
