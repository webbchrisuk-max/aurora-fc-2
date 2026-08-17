/* Aurora City FC — Nexus hero title standard v1.0
 * Gives every Aurora 2 department hero the same title treatment as Nexus HQ:
 * solid first line + outlined second line, without changing department identity or hero content.
 */
(function(){
'use strict';
if(window.__AURORA_NEXUS_HERO_TITLES__)return;
window.__AURORA_NEXUS_HERO_TITLES__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
const pages={
  'finance.html':{selector:'.finance-command-hero h2',first:'Finance',second:'Command Centre'},
  'scouting.html':{selector:'.scouting-command-hero h2',first:'Scouting',second:'Centre'},
  'transfer.html':{selector:'.transfer-command-hero h2',first:'Transfer',second:'Centre'},
  'registration.html':{selector:'.registration-command-hero h2',first:'Registration',second:'Desk'},
  'squad.html':{selector:'.squad-command-hero h2',first:'Squad',second:'Hub'},
  'income.html':{selector:'.income-command-hero h2',first:'Income',second:'Centre'},
  'club-control.html':{selector:'.chairman-command-hero h2',first:"Chairman's",second:'Office'},
  'system-health.html':{selector:'.health-hero h2',first:'System',second:'Health'},
  'match-report.html':{selector:'.hero h1',first:'Match',second:'Report'}
};
const config=pages[page];
if(!config)return;

function installStyle(){
  if(document.getElementById('auroraNexusHeroTitleStyle'))return;
  const style=document.createElement('style');
  style.id='auroraNexusHeroTitleStyle';
  style.textContent=`
    .aurora-nexus-hero-title{
      margin:15px 0 17px!important;
      font-size:clamp(42px,6vw,82px)!important;
      line-height:.83!important;
      letter-spacing:-.065em!important;
      font-weight:950!important;
      text-transform:uppercase!important;
      color:#effaff!important;
      background:none!important;
      -webkit-text-fill-color:currentColor!important;
      text-shadow:none!important;
    }
    .aurora-nexus-hero-title>.aurora-nexus-hero-outline{
      display:block!important;
      color:transparent!important;
      background:none!important;
      -webkit-background-clip:border-box!important;
      background-clip:border-box!important;
      -webkit-text-fill-color:transparent!important;
      -webkit-text-stroke:1px #68dfff!important;
      text-shadow:0 0 28px rgba(37,221,255,.08)!important;
    }
    @media(max-width:700px){
      .aurora-nexus-hero-title{font-size:clamp(42px,11vw,58px)!important;line-height:.86!important;}
    }
  `;
  document.head.appendChild(style);
}

function apply(){
  installStyle();
  const title=document.querySelector(config.selector);
  if(!title)return false;
  title.classList.add('aurora-nexus-hero-title');
  title.innerHTML=`${config.first}<span class="aurora-nexus-hero-outline">${config.second}</span>`;
  return true;
}

function init(){
  if(!apply())setTimeout(apply,150);
  setTimeout(apply,500);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
