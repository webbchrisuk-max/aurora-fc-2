(function(){
'use strict';
{
  'use strict';

  const SESSION_KEY='aurora2:session:authenticated';
  const entryApp=document.getElementById('entryApp');
  const gameShell=document.getElementById('gameShell');
  const bootScreen=document.getElementById('bootScreen');
  const accessScreen=document.getElementById('accessScreen');
  const transitionScreen=document.getElementById('transitionScreen');
  const bootProgress=document.getElementById('bootProgress');
  const bootPercent=document.getElementById('bootPercent');
  const bootMessage=document.getElementById('bootMessage');
  const bootCode=document.getElementById('bootCode');
  const enterButton=document.getElementById('enterButton');
  const particles=document.getElementById('particles');
  const menuButton=document.getElementById('auroraShellMenuButton');
  const navClose=document.getElementById('auroraShellNavigationClose');
  const navOverlay=document.getElementById('auroraShellNavigationOverlay');
  const logoutButton=document.getElementById('logoutButton');
  const currentDepartment=document.getElementById('currentDepartment');

  const stages=[
    {at:0,message:'Authenticating manager profile...',code:'AUTH // MANAGER'},
    {at:19,message:'Connecting to AuroraData 2...',code:'DATA // AURORA 2'},
    {at:42,message:'Synchronising squad intelligence...',code:'SQUAD // READY'},
    {at:64,message:'Opening transfer network...',code:'TRANSFER // ONLINE'},
    {at:83,message:'Preparing Nexus HQ 2.0...',code:'HQ // READY'},
    {at:100,message:'Manager access granted.',code:'ACCESS // GRANTED'}
  ];

  let progress=0,entering=false,bootTimer=null;

  function sessionActive(){
    try{return sessionStorage.getItem(SESSION_KEY)==='1'}
    catch(_){return false}
  }

  function setSession(active){
    try{
      if(active)sessionStorage.setItem(SESSION_KEY,'1');
      else sessionStorage.removeItem(SESSION_KEY);
    }catch(_){}
  }

  function safeReturnPath(){
    let value='';
    try{value=new URLSearchParams(location.search).get('return')||''}catch(_){}
    if(!value)return '';
    // Internal Aurora HTML only — never follow an external URL from this parameter.
    if(!/^[A-Za-z0-9._-]+\.html(?:[?#].*)?$/.test(value))return '';
    if(/^index\.html(?:[?#].*)?$/i.test(value))return '';
    return value;
  }

  function createParticles(){
    if(!particles)return;
    particles.innerHTML='';
    const count=innerWidth<700?18:34;
    const frag=document.createDocumentFragment();
    for(let i=0;i<count;i++){
      const p=document.createElement('span');
      p.className='particle';
      p.style.left=`${Math.random()*100}%`;
      p.style.setProperty('--duration',`${7+Math.random()*9}s`);
      p.style.setProperty('--delay',`${-Math.random()*14}s`);
      p.style.setProperty('--drift',`${-45+Math.random()*90}px`);
      frag.appendChild(p);
    }
    particles.appendChild(frag);
  }

  function updateBoot(value){
    const bounded=Math.min(100,Math.max(0,Math.round(value)));
    if(bootProgress)bootProgress.style.width=`${bounded}%`;
    if(bootPercent)bootPercent.textContent=`${String(bounded).padStart(2,'0')}%`;
    const active=[...stages].reverse().find(s=>bounded>=s.at)||stages[0];
    if(bootMessage)bootMessage.textContent=active.message;
    if(bootCode)bootCode.textContent=active.code;
  }

  function finishBoot(){
    updateBoot(100);
    setTimeout(()=>{
      bootScreen?.classList.add('is-hidden');
      accessScreen?.classList.add('is-active');
    },320);
  }

  function runBoot(){
    clearInterval(bootTimer);
    progress=0;
    updateBoot(0);
    bootScreen?.classList.remove('is-hidden');
    accessScreen?.classList.remove('is-active');
    bootTimer=setInterval(()=>{
      const d=100-progress;
      const inc=d>28?4+Math.random()*6:d>8?2+Math.random()*3:1+Math.random()*2;
      progress=Math.min(100,progress+inc);
      updateBoot(progress);
      if(progress>=100){
        clearInterval(bootTimer);
        finishBoot();
      }
    },92);
  }

  function openNav(){
    document.body.classList.add('shell-navigation-open');
    menuButton?.setAttribute('aria-expanded','true');
  }

  function closeNav(){
    document.body.classList.remove('shell-navigation-open');
    menuButton?.setAttribute('aria-expanded','false');
  }

  function showClubImmediately(){
    clearInterval(bootTimer);
    document.documentElement.classList.add('aurora-session-active');
    entryApp?.classList.add('is-gone');
    gameShell?.classList.add('is-active');
    transitionScreen?.classList.remove('open','is-active');
    document.body.classList.add('aurora-entered');
    document.body.classList.remove('shell-navigation-open');
  }

  function enterClub(){
    if(entering)return;
    entering=true;
    setSession(true);

    transitionScreen?.classList.add('is-active');
    setTimeout(()=>transitionScreen?.classList.add('open'),240);

    setTimeout(()=>{
      const returnPath=safeReturnPath();
      if(returnPath){
        location.replace(returnPath);
        return;
      }

      showClubImmediately();
      try{
        if(location.search)history.replaceState(null,'',location.pathname+location.hash);
      }catch(_){}
      window.scrollTo(0,0);
      entering=false;
    },1180);
  }

  function logout(){
    setSession(false);
    closeNav();
    // A logout starts a fresh Aurora session, so the boot/login sequence is valid again.
    location.replace('index.html?logout=1');
  }

  function updateClock(){
    const d=new Date();
    const clock=document.getElementById('shellClock');
    const date=document.getElementById('shellDate');
    if(clock)clock.textContent=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    if(date)date.textContent=d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'}).toUpperCase();
  }

  if(enterButton)enterButton.addEventListener('click',enterClub);
  if(logoutButton)logoutButton.addEventListener('click',logout);

  menuButton?.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    document.body.classList.contains('shell-navigation-open')?closeNav():openNav();
  });

  navClose?.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    closeNav();
  });

  navOverlay?.addEventListener('click',event=>{
    event.preventDefault();
    closeNav();
  });

  document.addEventListener('click',event=>{
    const row=event.target.closest('.aurora-shell-department-row');
    if(!row)return;
    document.querySelectorAll('.aurora-shell-department-row').forEach(x=>x.classList.remove('is-current'));
    row.classList.add('is-current');
    if(currentDepartment)currentDepartment.textContent=row.dataset.name||'Aurora 2.0';
    closeNav();
  });

  document.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&accessScreen?.classList.contains('is-active'))enterClub();
    if(event.key==='Escape')closeNav();
  });

  const searchButton=document.getElementById('shellSearch');
  if(searchButton){
    searchButton.addEventListener('click',()=>alert('Global Aurora search will be enabled after the shared shell rollout.'));
  }

  window.AuroraShell={
    openNavigation:openNav,
    closeNavigation:closeNav,
    logout
  };

  updateClock();
  setInterval(updateClock,15000);

  if(sessionActive()){
    showClubImmediately();
  }else{
    document.documentElement.classList.remove('aurora-session-active');
    createParticles();
    runBoot();
  }

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
  auroraLoadShared('aurora-cloud-sync.js?v=100-cross-device','cloud-sync');
  auroraLoadShared('aurora-notifications.js?v=110-premium-centre','notifications');

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
}
})();
