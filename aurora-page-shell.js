(function(){
'use strict';

const SESSION_KEY='aurora2:session:authenticated';

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
  logout(){
    clearSession();
    closeNav();
    location.replace('index.html?logout=1');
  }
};

  /* Aurora 2 Stable Core — shared platform + managed sync */
  function auroraLoadShared(src,key){
    if(document.querySelector(`script[data-aurora-shared="${key}"]`))return;
    const script=document.createElement('script');
    script.src=src;
    script.dataset.auroraShared=key;
    document.head.appendChild(script);
  }
  auroraLoadShared('aurora-release.js?v=100-stable-core','release');
  auroraLoadShared('aurora-platform.js?v=100-stable-core','platform');
  auroraLoadShared('aurora-sync-manager.js?v=100-stable-core','sync-manager');

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
  ensureSystemHealthNavigation();
})();
