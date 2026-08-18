/* Aurora 2 shared motion controller. Observes rendered state; never writes canonical data. */
(function(){
  'use strict';
  if(window.AuroraMotion)return;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const statusWords=/\b(DRAFT|READY|LOCKED|PARTIALLY_REGISTERED|COMPLETE|CAUTION|PASS|PENDING|SENDING|WRITING|CONFIRMED|REGISTERED|FAILED|ERROR|CONNECTED|ONLINE|OFFLINE)\b/i;
  const valueIds=new Set(['heroValue','heroAnnual','heroMonthly','missionBudget','missionAllocated','missionRemaining','kRemaining','kCandidates','kPass','income3Gap','income3Percent','houseRemainingKpi','overallStatus']);
  const previous=new WeakMap();
  const timers=new WeakMap();
  let armed=false;

  function pulse(el,name='aurora-value-change',duration=700){
    if(!el||reduce.matches)return;
    el.classList.remove(name);void el.offsetWidth;el.classList.add(name);
    clearTimeout(timers.get(el));timers.set(el,setTimeout(()=>el.classList.remove(name),duration));
  }
  function remember(root=document){
    root.querySelectorAll('strong,[class*="status"],[id*="Status"],[id*="status"]').forEach(el=>previous.set(el,el.textContent.trim()));
  }
  function inspect(el){
    if(!(el instanceof HTMLElement))return;
    const text=el.textContent.trim(),old=previous.get(el);
    if(old===undefined){previous.set(el,text);return}
    if(text===old)return;
    previous.set(el,text);
    if(!armed)return;
    if(valueIds.has(el.id)||/£|%|\b\d+[.,]?\d*\b/.test(text))pulse(el);
    if(statusWords.test(text)||/status|chip|badge/i.test(`${el.id} ${el.className}`)){
      pulse(el,'aurora-status-change');
      if(/LOCKED/.test(text))pulse(el,'aurora-route-locked');
      if(/CONFIRMED|REGISTERED|COMPLETE|PASS/.test(text))pulse(el,'aurora-confirmed');
      if(/FAILED|ERROR/.test(text))pulse(el,'aurora-failed');
    }
  }
  function animateRows(root){
    if(reduce.matches)return;
    root.querySelectorAll?.('tbody tr,.execution-check,.an-card,.scouting12-watch-row').forEach((row,index)=>{
      if(row.dataset.auroraMotionRow)return;
      row.dataset.auroraMotionRow='1';row.style.setProperty('--aurora-delay',`${Math.min(index,8)*35}ms`);pulse(row,'aurora-row-enter',700);
    });
  }
  const observer=new MutationObserver(records=>records.forEach(record=>{
    if(record.type==='characterData'){inspect(record.target.parentElement);return}
    record.addedNodes.forEach(node=>{if(node.nodeType===1){remember(node);animateRows(node)}else inspect(record.target)});
    inspect(record.target.closest?.('strong,[class*="status"],[id*="Status"],[id*="status"]'));
  }));

  function scoutingHooks(){
    const button=document.getElementById('runScouting');if(!button)return;
    button.addEventListener('click',()=>{
      document.body.classList.add('aurora-is-scanning');button.setAttribute('aria-label','Scanning market');
      queueMicrotask(()=>{document.body.classList.remove('aurora-is-scanning');button.removeAttribute('aria-label');pulse(document.getElementById('scoutingStatus'),'aurora-confirmed')});
    },{capture:true});
  }
  function loadScoutingSquadOpportunities(){
    const file=String(location.pathname||'').split('/').pop().toLowerCase();
    if(file!=='scouting.html'||document.querySelector('script[data-aurora-squad-opportunities]'))return;
    const script=document.createElement('script');
    script.src='scouting-squad-opportunities.js?v=20260818-squad-value-table-2';
    script.async=false;
    script.dataset.auroraSquadOpportunities='1';
    document.head.appendChild(script);
  }
  function loadBackgroundSignalScouting(){
    const file=String(location.pathname||'').split('/').pop().toLowerCase();
    if(file!=='scouting.html'||document.querySelector('script[data-aurora-background-signals]'))return;
    const script=document.createElement('script');
    script.src='scouting-signal-background.js?v=20260818-silent-signals-1';
    script.async=false;
    script.dataset.auroraBackgroundSignals='1';
    document.head.appendChild(script);
  }
  function init(){
    remember();animateRows(document);scoutingHooks();loadScoutingSquadOpportunities();loadBackgroundSignalScouting();
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    requestAnimationFrame(()=>requestAnimationFrame(()=>{armed=true;document.documentElement.classList.add('aurora-motion-ready')}));
  }
  window.AuroraMotion={pulse,reducedMotion:()=>reduce.matches};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
