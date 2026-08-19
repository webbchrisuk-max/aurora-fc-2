/* Aurora City FC — Scouting Intelligence 3 Global Network bridge
 * Makes the broad Global Scouting pipeline use the same canonical assessment
 * engine as Active Scouting. Discovery/filtering remains broad; final scores,
 * ranking and approval status come from Intelligence 3 only.
 */
(function(w){
'use strict';
if(w.AuroraScoutingIntelligence3GlobalBridge)return;
const VERSION='2026.08.19.1';
const arr=v=>Array.isArray(v)?v:[];
const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));

function state(){try{return w.Aurora2?.core?.read?.()||null}catch(_){return null}}
function targetFromRow(row){
  const security=row?.security||{},data=row?.data||{},exposure=row?.exposure||{};
  const fit=clamp(92-(Number(exposure.portfolioPct)||0)*3-(Number(exposure.sectorPct)||0)*.7,20,95);
  return {
    securityId:security.securityId||'',exchange:security.exchange||'',ticker:security.ticker||'',name:security.name||security.ticker||'',
    country:security.country||'',currency:security.currency||'',sector:security.sector||'',assetType:security.assetType||'',
    brokerEligibility:security.brokerEligibility,
    livePriceGbp:num(data.price)||0,yieldPct:num(data.dividendYield)||0,
    dividendSafety:num(data.dividendSafety)||0,incomeScore:num(data.incomeScore)||0,
    valuationScore:num(data.valuationScore)||0,portfolioFit:fit,
    dividendGrowth:num(data.dividendGrowth)||0,businessQuality:num(data.businessQuality)||0,
    confidence:num(data.confidence)||0,dividendStatus:data.dividendStatus||'',payoutRisk:data.payoutRisk||'',
    source:'AURORA_GLOBAL_NETWORK_INTELLIGENCE_3'
  };
}
function requiredMissing(row){
  const security=row?.security||{},data=row?.data||{};
  const missing=[];
  if(!(num(data.price)>0))missing.push('price');
  if(!(num(data.dividendYield)>0))missing.push('dividendYield');
  if(!(num(data.dividendSafety)>0))missing.push('dividendSafety');
  if(security.brokerEligibility==null)missing.push('brokerEligibility');
  return missing;
}
function install(){
  const api=w.Aurora2?.globalScouting,engine=w.AuroraScoutingIntelligence3;
  if(!api||!engine)return setTimeout(install,120);
  if(api.__intelligence3Bridge)return;
  const original={score:api.score,deepScout:api.deepScout,runPipeline:api.runPipeline};

  function canonicalScore(data,exposure,strategy='sustainable'){
    const assessed=engine.assess(targetFromRow({security:{ticker:data?.ticker||'GLOBAL',brokerEligibility:true},data,exposure}),state());
    return strategy==='maximum'?Number(assessed.maximumScore)||0:Number(assessed.sustainableScore)||0;
  }
  function deepScout(fastRows,options={}){
    const strategy=options.strategy==='maximum'?'maximum':'sustainable',limit=Math.max(1,Number(options.limit)||40),s=state();
    return arr(fastRows).filter(r=>r?.passed).map(r=>{
      const missing=requiredMissing(r),assessed=engine.assess(targetFromRow(r),s),canonicalPending=assessed.status==='pending'||missing.length>0;
      const approved=!canonicalPending&&assessed.status!=='block'&&r.security?.brokerEligibility!==false;
      return {...r,data:{...(r.data||{}),confidence:assessed.confidence},missing,
        sustainableScore:assessed.sustainableScore,maximumScore:assessed.maximumScore,
        auroraScore:strategy==='maximum'?assessed.maximumScore:assessed.sustainableScore,
        status:approved?'APPROVED_TARGET':'WATCHLIST',
        intelligence3Status:canonicalPending?'DATA_PENDING':String(assessed.status||'').toUpperCase(),
        intelligence3Recommendation:assessed.recommendation,
        intelligence3Reason:assessed.reason,
        scoringEngine:'AURORA_SCOUTING_INTELLIGENCE_3',
        discovery:r.exposure?.existingHolding?'CURRENT_SQUAD':(r.data?.previouslyKnown?'WATCHLIST':'NEW_DISCOVERY')};
    }).sort((a,b)=>Number(b.auroraScore||0)-Number(a.auroraScore||0)).slice(0,limit).map((r,i)=>({...r,rank:i+1}));
  }
  function runPipeline({securities=[],dataById={},holdings=[],strategy='sustainable',deepLimit=40,at}={}){
    const universe=api.createRegistry(securities),fast=api.fastScout(universe,dataById,holdings,{at}),deep=deepScout(fast,{strategy,limit:deepLimit});
    return {universe,fast,deep,watchlist:deep.filter(x=>x.status==='WATCHLIST'),approved:deep.filter(x=>x.status==='APPROVED_TARGET'),scannedAt:new Date(at||Date.now()).toISOString(),strategy,scoringEngine:'AURORA_SCOUTING_INTELLIGENCE_3'};
  }

  api.score=canonicalScore;api.deepScout=deepScout;api.runPipeline=runPipeline;api.__intelligence3Bridge=true;
  w.AuroraScoutingIntelligence3GlobalBridge={version:VERSION,original,score:canonicalScore,deepScout,runPipeline};
}
install();
})(window);
