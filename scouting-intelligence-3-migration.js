/* Aurora City FC — Scouting Intelligence 3 migration v3
 *
 * 1) Removes only the unmistakable retired neutral-placeholder factor pattern.
 * 2) Preserves confidence/dataQuality; Intelligence 3 caps them by real evidence
 *    coverage rather than guessing whether an old confidence value was manual.
 * 3) Gives Scouting a first-class DATA PENDING state without weakening Aurora
 *    Core or Transfer. Core persists pending safely as BLOCK +
 *    transferPermitted=false; Scouting inflates it back to DATA PENDING only
 *    on the Scouting page.
 */
(function(w){
'use strict';
if(w.AuroraScoutingIntelligence3Migration)return;
const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='scouting.html')return;
const ENGINE='AURORA_SCOUTING_INTELLIGENCE_3';
const VERSION='2026.08.19.3';
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const arr=v=>Array.isArray(v)?v:[];
let running=false;

function needsCleanup(t){
  if(!t||t.scoringEngine===ENGINE)return false;
  const hits=[num(t.dividendSafety)===55,num(t.valuationScore)===55,num(t.dividendGrowth)===50,num(t.businessQuality)===55].filter(Boolean).length;
  const provisional=String(t.source||'')==='AURORA2_SQUAD_OPPORTUNITY_AUTO'&&t.requiresRefresh===true;
  return hits>=3||provisional;
}
function clean(t){
  if(!needsCleanup(t))return t;
  const next={...t};
  if(num(next.dividendSafety)===55)next.dividendSafety=null;
  if(num(next.valuationScore)===55)next.valuationScore=null;
  if(num(next.dividendGrowth)===50)next.dividendGrowth=null;
  if(num(next.businessQuality)===55)next.businessQuality=null;
  next.sustainableScore=0;next.maximumScore=0;next.approvedForTransfer=false;
  next.intelligence3EvidenceMigration=VERSION;
  return next;
}

function cloneState(s){
  return s&&typeof s==='object'?{...s,scouting:{...(s.scouting||{}),targets:arr(s.scouting?.targets).map(t=>({...t}))}}:s;
}
function inflate(input){
  const s=cloneState(input);if(!s?.scouting)return s;
  s.scouting.targets=s.scouting.targets.map(t=>{
    const pending=String(t.eligibilityStatus||'').toUpperCase()==='DATA_PENDING'&&String(t.status||'').toLowerCase()==='block';
    if(!pending)return t;
    return {...t,status:'pending',recommendation:'DATA PENDING',transferPermitted:false,approvedForTransfer:false};
  });
  return s;
}
function deflate(input){
  const s=cloneState(input);if(!s?.scouting)return s;
  s.scouting.targets=s.scouting.targets.map(t=>{
    const status=String(t.status||'').toLowerCase();
    if(status==='pending'){
      return {...t,status:'block',recommendation:'WATCH',eligibilityStatus:'DATA_PENDING',transferPermitted:false,approvedForTransfer:false,approvedAt:null,approvalBatchId:null};
    }
    if(String(t.eligibilityStatus||'').toUpperCase()==='DATA_PENDING'){
      return {...t,eligibilityStatus:'',transferPermitted:status==='pass'||status==='caution'};
    }
    return t;
  });
  return s;
}

function installCoreCompatibility(){
  const core=w.Aurora2?.core;if(!core?.read||core.__intelligence3PendingCompat)return false;
  const originalRead=core.read.bind(core),originalWrite=core.write.bind(core),originalUpdate=core.update.bind(core);
  core.read=()=>inflate(originalRead());
  core.write=next=>inflate(originalWrite(deflate(next)));
  core.update=updater=>inflate(originalUpdate(current=>{
    const visible=inflate(current);
    const next=typeof updater==='function'?updater(visible):{...visible,...(updater||{})};
    return deflate(next);
  }));
  core.__intelligence3PendingCompat=true;
  return true;
}

function run(){
  if(running)return;const core=w.Aurora2?.core;if(!core?.read||!core?.update)return setTimeout(run,100);
  installCoreCompatibility();
  const s=core.read();if(s?.scouting?.intelligence3Migration===VERSION)return;
  running=true;
  try{
    core.update(current=>{
      const scouting=current?.scouting;if(!scouting)return current;
      return {...current,scouting:{...scouting,targets:arr(scouting.targets).map(clean),intelligence3Migration:VERSION}};
    });
  }finally{running=false}
}

w.AuroraScoutingIntelligence3Migration={version:VERSION,run,inflate,deflate};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run,{once:true}):run();
})(window);
