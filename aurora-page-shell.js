
(function(){
'use strict';
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
  const d=new Date();
  const clock=document.getElementById('shellClock');
  const date=document.getElementById('shellDate');
  if(clock)clock.textContent=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  if(date)date.textContent=d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'}).toUpperCase();
}
menuButton?.addEventListener('click',event=>{
  event.preventDefault();event.stopPropagation();
  document.body.classList.contains('shell-navigation-open')?closeNav():openNav();
});
navClose?.addEventListener('click',event=>{event.preventDefault();closeNav()});
navOverlay?.addEventListener('click',event=>{event.preventDefault();closeNav()});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeNav()});
updateClock();
setInterval(updateClock,15000);
window.AuroraShell={openNavigation:openNav,closeNavigation:closeNav};
})();
