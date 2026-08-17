/* Aurora City FC — Nexus V2 document scroll fix
 * The shared Aurora shell intentionally locks body scrolling for app-shell pages.
 * Nexus V2 is currently a standalone development document, so it needs normal
 * document scrolling until it is promoted into the main app shell.
 */
(function(){
  'use strict';
  const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
  if(page!=='auroracityfc_nexusv2.html')return;

  const style=document.createElement('style');
  style.id='auroraNexusV2ScrollFix';
  style.textContent=`
    html{
      height:auto!important;
      min-height:100%!important;
      overflow-x:hidden!important;
      overflow-y:auto!important;
    }
    body{
      height:auto!important;
      min-height:100vh!important;
      overflow-x:hidden!important;
      overflow-y:auto!important;
      -webkit-overflow-scrolling:touch!important;
      overscroll-behavior-y:auto!important;
    }
    body.shell-navigation-open{
      overflow:hidden!important;
    }
    .n2-shell{
      min-height:100vh!important;
      height:auto!important;
      overflow:visible!important;
    }
    main.page{
      height:auto!important;
      min-height:0!important;
      overflow:visible!important;
    }
  `;
  document.head.appendChild(style);

  // Inline properties make the fix resilient to late-loading shared shell CSS.
  document.documentElement.style.setProperty('height','auto','important');
  document.documentElement.style.setProperty('overflow-y','auto','important');
  document.body.style.setProperty('height','auto','important');
  document.body.style.setProperty('min-height','100vh','important');
  document.body.style.setProperty('overflow-y','auto','important');
})();
