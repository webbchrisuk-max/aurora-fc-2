/* Aurora City FC — Scouting Intelligence 3 migration
 * Removes only the unmistakable neutral placeholder pattern created by the
 * retired scorer, so Intelligence 3 cannot mistake synthetic 55/50 values for
 * evidence. Runs once and never changes genuine explicit evidence.
 */
(function(w){
'use strict';
if(w.AuroraScoutingIntelligence3Migration)return;
const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='scouting.html')return;
const ENGINE='AURORA_SCOUTING_INTELLIGENCE_3';
const VERSION='2026.08.19.1';
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
  if(!next.confidenceSource&&!next.evidenceSources?.confidence){next.confidence=null;next.dataQuality=null}
  next.sustainableScore=0;next.maximumScore=0;
  next.approvedForTransfer=false;
  next.intelligence3EvidenceMigration=VERSION;
  return next;
}
function run(){
  if(running)return;const core=w.Aurora2?.core;if(!core?.read||!core?.update)return setTimeout(run,100);
  const s=core.read();if(s?.scouting?.intelligence3Migration===VERSION)return;
  running=true;
  try{
    core.update(current=>{
      const scouting=current?.scouting;if(!scouting)return current;
      return {...current,scouting:{...scouting,targets:arr(scouting.targets).map(clean),intelligence3Migration:VERSION}};
    });
  }finally{running=false}
}
w.AuroraScoutingIntelligence3Migration={version:VERSION,run};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run,{once:true}):run();
})(window);
