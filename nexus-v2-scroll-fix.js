/* Aurora City FC — Nexus V2 dedicated viewport scroller v2
 * The shared Aurora shell locks body scrolling. Nexus V2 is still a standalone
 * preview, so make .n2-shell the scroll container instead of fighting body.
 */
(function(){
  'use strict';
  const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
  if(page!=='auroracityfc_nexusv2.html')return;

  const style=document.createElement('style');
  style.id='auroraNexusV2ScrollFix';
  style.textContent=`
    html,body{
      width:100%!important;
      height:100%!important;
      min-height:100%!important;
      overflow:hidden!important;
    }
    body.shell-navigation-open{
      overflow:hidden!important;
    }
    .n2-shell{
      position:fixed!important;
      inset:0!important;
      width:100%!important;
      height:100dvh!important;
      min-height:0!important;
      overflow-x:hidden!important;
      overflow-y:auto!important;
      -webkit-overflow-scrolling:touch!important;
      overscroll-behavior-y:contain!important;
      touch-action:pan-y!important;
      z-index:1!important;
    }
    .n2-header{
      position:sticky!important;
      top:0!important;
      z-index:30!important;
    }
    main.page{
      height:auto!important;
      min-height:max-content!important;
      overflow:visible!important;
      padding-bottom:max(64px,env(safe-area-inset-bottom))!important;
    }
    #n2ReplacementLayer,
    .section,
    .n2u-panel{
      overflow:visible;
    }
    #auroraShellNavigationOverlay,
    #auroraShellNavigation{
      position:fixed!important;
      z-index:1000!important;
    }
  `;
  document.head.appendChild(style);

  const shell=document.querySelector('.n2-shell');
  if(shell){
    shell.style.setProperty('overflow-y','auto','important');
    shell.style.setProperty('-webkit-overflow-scrolling','touch','important');
    shell.style.setProperty('touch-action','pan-y','important');
    shell.scrollTop=0;
  }
})();
