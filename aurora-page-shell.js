(function(){
'use strict';

const SESSION_KEY='aurora2:session:authenticated';
const MASTER_NEXUS='AuroraCityFC_NexusV2.html';
const CREST_URL='https://webbchrisuk-max.github.io/aurora-city-fc/assets/aurora-city-fc/icons/icon-512.png';

function sessionActive(){
  try{return sessionStorage.getItem(SESSION_KEY)==='1'}
  catch(_){return false}
}

function clearSession(){
  try{sessionStorage.removeItem(SESSION_KEY)}catch(_){}
}

function currentAuroraPage(){
  const file=String(location.pathname||'').split('/').pop()||'index.html';
  return `${file}${location.search||''}${location.hash||''}`;
}

/* Direct/deep-linked department pages must go through Manager Access first. */
if(!sessionActive()){
  const current=currentAuroraPage();
  location.replace(`index.html?return=${encodeURIComponent(current)}`);
  return;
}

const auroraPageFile=(String(location.pathname||'').split('/').pop()||'').toLowerCase();

function ensureCanonicalShellHeader(){
  const isNexus=auroraPageFile==='auroracityfc_nexusv2.html';
  const isMatch=auroraPageFile==='match-report.html';
  if(!isNexus&&!isMatch)return;

  document.body.classList.add('aurora-entered');

  if(!document.getElementById('auroraCanonicalShellBridge')){
    const style=document.createElement('style');
    style.id='auroraCanonicalShellBridge';
    style.textContent=`
      body.aurora-entered .n2-shell,
      body.aurora-entered .match-shell{
        min-height:100svh;
        padding-top:calc(var(--shell-header-height) + var(--safe-top));
      }
      body.aurora-entered .n2-header,
      body.aurora-entered .match-header{
        display:none!important;
      }
      .aurora-shell-context .aurora-report-refresh{
        width:auto;
        min-width:72px;
        padding:0 12px;
        color:#a5f3fc;
        font-size:9px;
        font-weight:900;
        letter-spacing:.08em;
        text-transform:uppercase;
      }
      @media(max-width:720px){
        .aurora-shell-context .aurora-report-refresh{
          min-width:40px;
          width:40px;
          padding:0;
          font-size:0;
        }
        .aurora-shell-context .aurora-report-refresh:after{
          content:'↻';
          font-size:17px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  let header=document.querySelector('.aurora-shell-header');
  if(!header){
    header=document.createElement('header');
    header.className='aurora-shell-header';
    header.dataset.auroraCanonicalShell='true';

    const department=isNexus?'NEXUS HEADQUARTERS':'MATCH REPORT';
    const liveId=isNexus?'connectionBadge':'reportState';
    const liveText=isNexus?'Club system live':'Live state';
    const refresh=isMatch
      ? '<button class="shell-control aurora-report-refresh" id="refreshReport" type="button" title="Refresh Match Report">Refresh</button>'
      : '';

    header.innerHTML=`
      <div class="aurora-shell-header-inner">
        <div class="aurora-shell-brand">
          <button id="auroraShellMenuButton" type="button" aria-label="Open club navigation" aria-expanded="false">☰</button>
          <div class="aurora-shell-crest">
            <img src="${CREST_URL}" alt="Aurora City FC">
          </div>
          <div class="aurora-shell-copy">
            <h1>Aurora City FC</h1>
            <p id="currentDepartment">${department}</p>
          </div>
        </div>
        <div class="aurora-shell-context">
          <div class="aurora-shell-datetime">
            <span class="shell-clock" id="shellClock">--:--</span>
            <span class="shell-date" id="shellDate">---</span>
          </div>
          <a class="shell-control shell-home" href="${MASTER_NEXUS}" title="Nexus Headquarters">⌂</a>
          ${refresh}
          <span class="aurora-shell-live" id="${liveId}">${liveText}</span>
        </div>
      </div>`;

    const legacy=document.querySelector(isNexus?'.n2-header':'.match-header');
    const shell=document.querySelector(isNexus?'.n2-shell':'.match-shell');
    if(legacy)legacy.replaceWith(header);
    else if(shell)shell.prepend(header);
    else document.body.prepend(header);
  }
}

function ensureNavigationBrandCrest(){
  const head=document.querySelector('#auroraShellNavigation .aurora-shell-nav-head');
  if(!head)return;

  if(!head.querySelector('.aurora-shell-nav-crest')){
    const crest=document.createElement('div');
    crest.className='aurora-shell-nav-crest';
    crest.innerHTML=`<img src="${CREST_URL}" alt="">`;
    head.insertBefore(crest,head.firstElementChild||null);
  }

  const brand=head.querySelector('.aurora-shell-nav-brand');
  if(brand){
    const strong=brand.querySelector('strong');
    const span=brand.querySelector('span');
    if(strong)strong.textContent='Aurora City FC';
    if(span)span.textContent='Club Navigation 2.0';
  }
}

ensureCanonicalShellHeader();
ensureNavigationBrandCrest();

const menuButton=document.getElementById('auroraShellMenuButton');
const navClose=document.getElementById('auroraShellNavigationClose');
const navOverlay=document.getElementById('auroraShellNavigationOverlay');

function openNav(){
  document.body.classList.add('shell-navigation-open');
  menuButton?.setAttribute('aria-expanded','true');
}
function closeNav(){
  document.body.classList.remove('shell-navigation-open');
  menuButton?.setAttribute('aria-expanded','false');
}
function updateClock(){
  const d=new Date(),clock=document.getElementById('shellClock'),date=document.getElementById('shellDate');
  if(clock)clock.textContent=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  if(date)date.textContent=d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'}).toUpperCase();
}

function ensureLogoutButton(){
  let button=document.getElementById('auroraLogoutButton');
  if(button)return button;

  const context=document.querySelector('.aurora-shell-context');
  if(!context)return null;

  button=document.createElement('button');
  button.type='button';
  button.id='auroraLogoutButton';
  button.className='shell-control';
  button.title='Log out of Aurora';
  button.textContent='Logout';
  Object.assign(button.style,{
    width:'auto',
    minWidth:'72px',
    padding:'0 12px',
    fontSize:'9px',
    fontWeight:'900',
    letterSpacing:'.08em',
    textTransform:'uppercase'
  });

  const live=context.querySelector('.aurora-shell-live');
  context.insertBefore(button,live||null);

  button.addEventListener('click',()=>{
    clearSession();
    closeNav();
    location.replace('index.html?logout=1');
  });

  return button;
}

menuButton?.addEventListener('click',e=>{
  e.preventDefault();
  e.stopPropagation();
  document.body.classList.contains('shell-navigation-open')?closeNav():openNav();
});
navClose?.addEventListener('click',e=>{e.preventDefault();closeNav()});
navOverlay?.addEventListener('click',e=>{e.preventDefault();closeNav()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNav()});

ensureLogoutButton();
updateClock();
setInterval(updateClock,15000);

window.AuroraShell={
  openNavigation:openNav,
  closeNavigation:closeNav,
  home(){location.href=MASTER_NEXUS},
  masterNexus:MASTER_NEXUS,
  logout(){
    clearSession();
    closeNav();
    location.replace('index.html?logout=1');
  }
};
window.AuroraMasterNexus=MASTER_NEXUS;

/* Aurora 2 Stable Core — shared platform + managed sync */
function auroraLoadShared(src,key){
  if(document.querySelector(`script[data-aurora-shared="${key}"]`))return;
  const script=document.createElement('script');
  script.src=src;
  script.async=false;
  script.dataset.auroraShared=key;
  document.head.appendChild(script);
}

auroraLoadShared('aurora-release.js?v=100-stable-core','release');
auroraLoadShared('aurora-platform.js?v=100-stable-core','platform');
auroraLoadShared('aurora-sync-manager.js?v=101-nexus-recovery','sync-manager');
auroraLoadShared('aurora-cloud-sync.js?v=100-cross-device','cloud-sync');

if(auroraPageFile==='auroracityfc_nexusv2.html'){
  auroraLoadShared('nexus-v2-runtime-recovery.js?v=20260817-recovery-1','nexus-v2-runtime-recovery');
  auroraLoadShared('nexus-v2-command-hydration.js?v=20260818-hydration-1','nexus-v2-command-hydration');
  auroraLoadShared('match-report-published-feed.js?v=20260818-published-feed-2','match-report-published-feed');
}

if(auroraPageFile==='match-report.html'){
  auroraLoadShared('match-report-page-fix.js?v=20260818-fullpage-2','match-report-page-fix');
  auroraLoadShared('match-report-hydration.js?v=20260818-hydration-1','match-report-hydration');
  auroraLoadShared('match-report-published-feed.js?v=20260818-published-feed-2','match-report-published-feed');
}

auroraLoadShared('aurora-notifications.js?v=111-nexus-header','notifications');

if(auroraPageFile==='auroracityfc_nexusv2.html'){
  auroraLoadShared('nexus-v2-notification-dock.js?v=20260817-bell-2','nexus-v2-notification-dock');
}

auroraLoadShared('aurora-nexus-hero-titles.js?v=20260817-nexus-title-2','nexus-hero-titles');

if(auroraPageFile==='transfer.html'||auroraPageFile==='scouting.html'){
  auroraLoadShared('aurora-transfer-strategy.js?v=20260817-transfer-owner-1','transfer-strategy-owner');
}
if(auroraPageFile==='auroracityfc_nexusv2.html'){
  auroraLoadShared('nexus-v2-hero-art.js?v=20260817-nexus-hero-3','nexus-v2-hero-art');
  auroraLoadShared('nexus-v2-scroll-fix.js?v=20260817-scroll-2','nexus-v2-scroll-fix');
  auroraLoadShared('nexus-v2-upgrade.js?v=20260817-replacement-1','nexus-v2-replacement');
  auroraLoadShared('nexus-v2-polish.js?v=20260817-polish-2','nexus-v2-polish');
  auroraLoadShared('nexus-v2-data-quality.js?v=20260817-quality-2','nexus-v2-data-quality');
  auroraLoadShared('nexus-v2-pitch-centre-fix.js?v=20260817-centre-2','nexus-v2-pitch-centre-fix');
  auroraLoadShared('nexus-v2-manager-polish.js?v=20260817-manager-1','nexus-v2-manager-polish');
  auroraLoadShared('nexus-v2-form-truth.js?v=20260817-form-truth-1','nexus-v2-form-truth');
  auroraLoadShared('nexus-v2-dividend-runway.js?v=20260817-runway-1','nexus-v2-dividend-runway');
  auroraLoadShared('nexus-v2-truth-polish.js?v=20260817-truth-polish-3','nexus-v2-truth-polish');
}

function ensureNexusMasterNavigation(){
  const nav=document.querySelector('.aurora-shell-nav-scroll');
  if(nav){
    let rows=[...nav.querySelectorAll('a.aurora-shell-department-row')].filter(row=>{
      const label=`${row.dataset?.name||''} ${row.textContent||''}`.toLowerCase();
      const href=String(row.getAttribute('href')||'').toLowerCase();
      return label.includes('nexus')||label.includes('headquarters')||href==='index.html'||href.endsWith('/index.html');
    });

    if(!rows.length){
      const row=document.createElement('a');
      row.className='aurora-shell-department-row';
      row.innerHTML='<div class="aurora-shell-nav-icon">🏟</div><div class="aurora-shell-nav-copy"><strong>Nexus Headquarters</strong><span>Master club command centre</span></div><div class="aurora-shell-nav-arrow">›</div>';
      const firstSection=nav.querySelector('.aurora-shell-nav-section');
      if(firstSection?.nextSibling)nav.insertBefore(row,firstSection.nextSibling);
      else nav.prepend(row);
      rows=[row];
    }

    rows.forEach((row,index)=>{
      if(index>0&&rows.length>1&&String(row.textContent||'').toLowerCase().includes('nexus')){
        row.remove();
        return;
      }
      row.href=MASTER_NEXUS;
      row.dataset.name='Nexus Headquarters';
      const strong=row.querySelector('.aurora-shell-nav-copy strong');
      const span=row.querySelector('.aurora-shell-nav-copy span');
      if(strong)strong.textContent='Nexus Headquarters';
      if(span)span.textContent='Master club command centre';
      row.classList.toggle('is-current',auroraPageFile==='auroracityfc_nexusv2.html');
    });
  }

  document.querySelectorAll('a').forEach(link=>{
    const label=`${link.dataset?.name||''} ${link.textContent||''}`.toLowerCase();
    const href=String(link.getAttribute('href')||'').toLowerCase();
    if((label.includes('nexus')||label.includes('headquarters'))&&(href==='index.html'||href.endsWith('/index.html'))){
      link.setAttribute('href',MASTER_NEXUS);
    }
  });
}

function ensureMatchReportNavigation(){
  const scroll=document.querySelector('.aurora-shell-nav-scroll');
  if(scroll&&!scroll.querySelector('a[href="match-report.html"]')){
    const row=document.createElement('a');
    row.className='aurora-shell-department-row';
    if(auroraPageFile==='match-report.html')row.classList.add('is-current');
    row.href='match-report.html';
    row.dataset.name='Match Report';
    row.innerHTML='<div class="aurora-shell-nav-icon">⚽</div><div class="aurora-shell-nav-copy"><strong>Match Report</strong><span>5pm portfolio full-time report</span></div><div class="aurora-shell-nav-arrow">›</div>';

    const systemSection=[...scroll.querySelectorAll('.aurora-shell-nav-section')].find(x=>String(x.textContent||'').trim().toLowerCase()==='system');
    if(systemSection)scroll.insertBefore(row,systemSection);
    else scroll.append(row);
  }

  if(auroraPageFile==='auroracityfc_nexusv2.html'){
    const launch=document.querySelector('.departments');
    if(launch&&!launch.querySelector('a[href="match-report.html"]')){
      const card=document.createElement('a');
      card.className='dept';
      card.href='match-report.html';
      card.innerHTML='<i>⚽</i><strong>Match Report</strong><span>5pm full-time portfolio review</span>';
      launch.appendChild(card);
    }
  }
}

function ensureSystemHealthNavigation(){
  const scroll=document.querySelector('.aurora-shell-nav-scroll');
  if(scroll&&!scroll.querySelector('a[href="system-health.html"]')){
    const section=document.createElement('div');
    section.className='aurora-shell-nav-section';
    section.textContent='System';
    const row=document.createElement('a');
    row.className='aurora-shell-department-row';
    row.href='system-health.html';
    row.dataset.name='System Health';
    row.innerHTML='<div class="aurora-shell-nav-icon">🛡</div><div class="aurora-shell-nav-copy"><strong>System Health</strong><span>Integrity, sync and recovery</span></div><div class="aurora-shell-nav-arrow">›</div>';
    scroll.append(section,row);
  }

  const context=document.querySelector('.aurora-shell-context');
  if(context&&!document.getElementById('auroraSystemHealthButton')){
    const link=document.createElement('a');
    link.id='auroraSystemHealthButton';
    link.className='shell-control';
    link.href='system-health.html';
    link.title='Aurora System Health';
    link.textContent='🛡';
    const live=context.querySelector('.aurora-shell-live');
    context.insertBefore(link,live||null);
  }
}

ensureNexusMasterNavigation();
ensureMatchReportNavigation();
ensureSystemHealthNavigation();
ensureNavigationBrandCrest();
})();