(function(){
'use strict';
{
  'use strict';
  const crestUrl='https://webbchrisuk-max.github.io/aurora-city-fc/assets/aurora-city-fc/icons/icon-512.png';
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
  const replayEntry=document.getElementById('replayEntry');
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


  function createParticles(){
    particles.innerHTML='';
    const count=innerWidth<700?18:34;
    const frag=document.createDocumentFragment();
    for(let i=0;i<count;i++){
      const p=document.createElement('span');p.className='particle';p.style.left=`${Math.random()*100}%`;
      p.style.setProperty('--duration',`${7+Math.random()*9}s`);p.style.setProperty('--delay',`${-Math.random()*14}s`);p.style.setProperty('--drift',`${-45+Math.random()*90}px`);frag.appendChild(p);
    }
    particles.appendChild(frag);
  }
  function updateBoot(value){
    const bounded=Math.min(100,Math.max(0,Math.round(value)));bootProgress.style.width=`${bounded}%`;bootPercent.textContent=`${String(bounded).padStart(2,'0')}%`;
    const active=[...stages].reverse().find(s=>bounded>=s.at)||stages[0];bootMessage.textContent=active.message;bootCode.textContent=active.code;
  }
  function finishBoot(){updateBoot(100);setTimeout(()=>{bootScreen.classList.add('is-hidden');accessScreen.classList.add('is-active');},320)}
  function runBoot(){
    clearInterval(bootTimer);progress=0;updateBoot(0);bootScreen.classList.remove('is-hidden');accessScreen.classList.remove('is-active');
    bootTimer=setInterval(()=>{const d=100-progress;const inc=d>28?4+Math.random()*6:d>8?2+Math.random()*3:1+Math.random()*2;progress=Math.min(100,progress+inc);updateBoot(progress);if(progress>=100){clearInterval(bootTimer);finishBoot()}},92);
  }
  function enterClub(){
    if(entering)return;entering=true;transitionScreen.classList.add('is-active');setTimeout(()=>transitionScreen.classList.add('open'),240);
    setTimeout(()=>{gameShell.classList.add('is-active');entryApp.classList.add('is-gone');document.body.classList.remove('shell-navigation-open');entering=false;},1180);
  }
  function openNav(){document.body.classList.add('shell-navigation-open');menuButton.setAttribute('aria-expanded','true')}
  function closeNav(){document.body.classList.remove('shell-navigation-open');menuButton.setAttribute('aria-expanded','false')}
  function resetEntry(){
    closeNav();transitionScreen.classList.remove('open','is-active');entryApp.classList.remove('is-gone');gameShell.classList.remove('is-active');entering=false;createParticles();runBoot();
  }
  function updateClock(){
    const d=new Date();document.getElementById('shellClock').textContent=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});document.getElementById('shellDate').textContent=d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'}).toUpperCase();
  }

  enterButton.addEventListener('click',enterClub);menuButton.addEventListener('click',()=>document.body.classList.contains('shell-navigation-open')?closeNav():openNav());navClose.addEventListener('click',closeNav);navOverlay.addEventListener('click',closeNav);replayEntry.addEventListener('click',resetEntry);
  document.querySelectorAll('.aurora-shell-department-row').forEach(row=>row.addEventListener('click',()=>{
    document.querySelectorAll('.aurora-shell-department-row').forEach(x=>x.classList.remove('is-current'));row.classList.add('is-current');currentDepartment.textContent=row.dataset.name||'Aurora 2.0';closeNav();
  }));
  document.addEventListener('keydown',e=>{if(e.key==='Enter'&&accessScreen.classList.contains('is-active'))enterClub();if(e.key==='Escape')closeNav()});
  document.getElementById('shellSearch').addEventListener('click',()=>alert('Search is reserved for the production shell. This preview is for shell feel and behaviour only.'));
  createParticles();runBoot();updateClock();setInterval(updateClock,15000);
}
})();
