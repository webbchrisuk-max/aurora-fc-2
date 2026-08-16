'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

function engine(){
  const window={Aurora2:{}};
  window.window=window;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','transfer-engine.js'),'utf8'),{window,Date,Math,Number,String,Array,Set,Map});
  return window.Aurora2.transferEngine;
}

function fixture(){
  const existing={securityId:'LSE:OWN',exchange:'LSE',ticker:'OWN',name:'Owned Energy',currency:'GBP',assetType:'EQUITY',status:'pass',sustainableScore:80,maximumScore:80};
  const fresh={securityId:'NYSE:NEW',exchange:'NYSE',ticker:'NEW',name:'Never Owned REIT',currency:'USD',assetType:'REIT',status:'pass',sustainableScore:99,maximumScore:99};
  return {existing,fresh,state:{
    scouting:{targets:[existing,fresh]},
    marketData:{quotes:[
      {securityId:'LSE:OWN',exchange:'LSE',ticker:'OWN',livePriceGbp:10,quoteUpdatedAt:'2026-08-16T10:00:00Z'},
      {securityId:'NYSE:NEW',exchange:'NYSE',ticker:'NEW',livePriceGbp:20,quoteUpdatedAt:'2026-08-16T10:00:00Z'}
    ],dividends:[
      {securityId:'LSE:OWN',exchange:'LSE',ticker:'OWN',dividendYieldPct:5},
      {securityId:'NYSE:NEW',exchange:'NYSE',ticker:'NEW',dividendYieldPct:7}
    ]},
    transfer:{settings:{minAllocation:250,increment:25},brokerEligibility:[
      {securityId:'LSE:OWN',exchange:'LSE',ticker:'OWN',brokerEligibility:{IG:true}},
      {securityId:'NYSE:NEW',exchange:'NYSE',ticker:'NEW',brokerEligibility:{T212:true}}
    ]},
    squad:{holdings:[{securityId:'LSE:OWN',exchange:'LSE',ticker:'OWN',account:'IG ISA',status:'ACTIVE',shares:12,livePriceGbp:999}]}
  }};
}

function chairmanControlFixture(){
  const gcp={securityId:'LSE:GCP',exchange:'LSE',ticker:'GCP',name:'GCP Infrastructure',country:'UK',currency:'GBP',assetType:'INVESTMENT_TRUST',
    preferredAccount:'IG ISA',status:'pass',transferPermitted:true,approvedForTransfer:true,approvalBatchId:'TRACE-1',
    sustainableScore:92,maximumScore:81,yieldPct:6.1,livePriceGbp:1.05};
  const bce={securityId:'TSX:BCE',exchange:'TSX',ticker:'BCE',name:'BCE Inc.',country:'Canada',currency:'CAD',assetType:'EQUITY',
    preferredAccount:'CHECK',status:'pass',transferPermitted:true,approvedForTransfer:true,approvalBatchId:'TRACE-1',
    sustainableScore:95,maximumScore:99};
  return {gcp,bce,state:{
    scouting:{approvedBatchId:'TRACE-1',targets:[gcp,bce],universe:[
      {securityId:'TSX:BCE',exchange:'TSX',ticker:'BCE',country:'Canada',currency:'CAD',assetType:'EQUITY',
        legacyPriceGbp:28,priceUnit:'CAD',legacyYieldPct:7.2,legacyAnnualDps:3.99,
        quoteUpdatedAt:'2026-08-16T10:00:00Z',brokerEligibility:{IG:false,T212:true}}
    ]},
    transfer:{settings:{minAllocation:250,increment:25}},
    squad:{holdings:[{securityId:'LSE:GCP',exchange:'LSE',ticker:'GCP',account:'IG ISA',status:'ACTIVE',shares:100,livePriceGbp:1.05}]}
  }};
}

test('an existing holding can be simulated from registry evidence',()=>{
  const e=engine(),{state,existing}=fixture();
  const candidate=e.resolveExecutableCandidate(existing,{state});
  assert.equal(candidate.simulationEligible,true);
  assert.equal(candidate.currentShares,12);
});

test('a never-owned security can produce a complete £1,000 hypothetical route',()=>{
  const e=engine(),{state,fresh}=fixture();
  const route=e.simulate(state,{budget:1000,targetIds:[fresh.securityId],allowActiveScouting:true,maxTargets:1,idFactory:x=>x});
  assert.equal(route.allocations.length,1);
  assert.equal(route.allocations[0].currentShares,0);
  assert.equal(route.allocations[0].expectedShares,50);
  assert.equal(route.allocations[0].expectedAnnualIncome,70);
});

test('new-security broker eligibility is independent of holding records',()=>{
  const e=engine(),{state,fresh}=fixture();
  assert.equal(e.resolveBrokerRoute(state,fresh).account,'T212');
  state.squad.holdings=[];
  assert.equal(e.resolveBrokerRoute(state,fresh).account,'T212');
});

test('shared broker routing prefers IG, falls back to T212, and blocks only unverified support',()=>{
  const e=engine();
  const target=(ticker,brokerEligibility)=>({securityId:`LSE:${ticker}`,exchange:'LSE',ticker,preferredAccount:'CHECK',brokerEligibility});
  const state={scouting:{targets:[]},transfer:{},squad:{holdings:[]}};
  const both=target('BOTH',{T212:true,IG:true});
  assert.equal(e.resolveBrokerRoute(state,both).account,'IG');
  assert.equal(e.brokerRouteLabel(state,both),'IG ISA → T212 fallback');
  assert.equal(e.resolveBrokerRoute(state,target('T212',{IG:false,T212:true})).account,'T212');
  assert.equal(e.resolveBrokerRoute(state,target('IG',{IG:true,T212:false})).account,'IG');
  assert.equal(e.resolveBrokerRoute(state,target('NONE',{IG:false,T212:false})).supported,false);
});

test('new-security price lookup is independent of holding records',()=>{
  const e=engine(),{state,fresh}=fixture();
  assert.equal(e.resolveMarketPrice(state,fresh).priceGbp,20);
  assert.notEqual(e.resolveMarketPrice(state,state.scouting.targets[0]).priceGbp,999);
});

test('Sustainable Rotation may select a new holding',()=>{
  const e=engine(),{state}=fixture();
  const route=e.simulate(state,{budget:250,strategy:'sustainable',allowActiveScouting:true,maxTargets:1,idFactory:x=>x});
  assert.equal(route.allocations[0].securityId,'NYSE:NEW');
});

test('Maximum Income may select a new holding',()=>{
  const e=engine(),{state}=fixture();
  const route=e.simulate(state,{budget:250,strategy:'maximum',allowActiveScouting:true,maxTargets:1,idFactory:x=>x});
  assert.equal(route.allocations[0].securityId,'NYSE:NEW');
});

test('a mixed basket of existing and new holdings uses one route engine',()=>{
  const e=engine(),{state}=fixture();
  const route=e.simulate(state,{budget:1000,targetIds:['LSE:OWN','NYSE:NEW'],allowActiveScouting:true,maxTargets:2,idFactory:x=>x});
  assert.deepEqual(new Set(route.allocations.map(x=>x.securityId)),new Set(['LSE:OWN','NYSE:NEW']));
  assert.deepEqual(new Set(route.allocations.map(x=>x.currentShares)),new Set([0,12]));
});

test('a missing holding resolves to zero exposure, not missing security evidence',()=>{
  const e=engine(),{state,fresh}=fixture();
  const candidate=e.resolveExecutableCandidate(fresh,{state});
  assert.deepEqual(JSON.parse(JSON.stringify(candidate.existingExposure)),{currentShares:0,currentValueGbp:0,accounts:[],holdingCount:0});
  assert.deepEqual(JSON.parse(JSON.stringify(candidate.diagnostics)),{security:true,broker:true,price:true,dividend:true,simulation:true});
});

test('GCP and never-owned BCE pass the same Chairman executable path in one trace run',()=>{
  const e=engine(),{state,gcp,bce}=chairmanControlFixture();
  const traces=[e.chairmanTrace(state,gcp,{nowMs:Date.parse('2026-08-16T12:00:00Z')}),e.chairmanTrace(state,bce,{nowMs:Date.parse('2026-08-16T12:00:00Z')})];
  assert.deepEqual(Array.from(traces,t=>t.scouting.securityId),['LSE:GCP','TSX:BCE']);
  assert.equal(traces[0].portfolio.existingHolding,true);
  assert.equal(traces[1].portfolio.existingHolding,false);
  assert.equal(traces[1].portfolio.sharesOwned,0);
  assert.equal(traces[1].market.currentPriceGbp,28);
  assert.equal(traces[1].market.dividendYield,7.2);
  assert.equal(traces[1].broker.final,'T212');
  assert.ok(traces.every(t=>t.executable.executable));
});

test('never-owned canonical universe evidence reaches both Chairman strategies and sizing',()=>{
  const e=engine(),{state}=chairmanControlFixture();
  for(const strategy of ['sustainable','maximum']){
    const trace=e.chairmanStrategyTrace(state,{budget:1000,strategy,maxTargets:2,idFactory:x=>x,nowMs:Date.parse('2026-08-16T12:00:00Z')});
    assert.deepEqual({candidates:trace.candidateCount,ranked:trace.rankedCount,executable:trace.executableCount,routeInput:trace.routeInputCount},
      {candidates:2,ranked:2,executable:2,routeInput:2});
    assert.equal(trace.routeOutputCount,2);
    assert.ok(trace.route.allocations.some(row=>row.securityId==='TSX:BCE'&&row.currentShares===0&&row.expectedShares>0));
  }
});

test('live diagnostic exposes raw universe evidence, provenance and strategy funnels',()=>{
  const e=engine(),{state,bce}=chairmanControlFixture();
  const diagnostic=e.chairmanLiveDiagnostic(state,bce,{nowMs:Date.parse('2026-08-16T12:00:00Z')});
  assert.equal(diagnostic.engineBuild,e.BUILD);
  assert.equal(diagnostic.canonicalKey,'TSX:BCE');
  assert.equal(diagnostic.universeMatchCount,1);
  assert.equal(diagnostic.scoutingUniverseMatch.brokerEligibility.T212,true);
  assert.deepEqual(Array.from(diagnostic.evidenceRows,row=>row.source),['SCOUTING_TARGET','SCOUTING_UNIVERSE']);
  assert.deepEqual(JSON.parse(JSON.stringify(diagnostic.resolvedBroker)),{value:'T212',source:'EXPLICIT_SECURITY_ELIGIBILITY'});
  assert.equal(diagnostic.resolvedPrice.source,'SCOUTING_UNIVERSE');
  assert.equal(diagnostic.resolvedIncome.value,7.2);
  assert.equal(diagnostic.executable,true);

  for(const strategy of ['sustainable','maximum']){
    const funnel=e.chairmanStrategyFunnel(state,{budget:1000,strategy,maxTargets:2,nowMs:Date.parse('2026-08-16T12:00:00Z')});
    assert.deepEqual(JSON.parse(JSON.stringify(funnel)),{
      approvedCandidates:2,ranked:2,universeMatched:1,brokerResolved:2,priceResolved:2,executable:2,
      allocations:2,allocationTickers:['BCE','GCP'],reason:null
    });
  }
});

test('a specifically blocked candidate does not kill an executable new security',()=>{
  const e=engine(),{state}=chairmanControlFixture();
  state.scouting.targets.push({securityId:'NYSE:BLOCKED',exchange:'NYSE',ticker:'BLOCKED',status:'pass',yieldPct:5,livePriceGbp:10,brokerEligibility:{IG:false,T212:false}});
  const route=e.simulate(state,{budget:1000,allowActiveScouting:true,maxTargets:3,idFactory:x=>x});
  assert.ok(route.allocations.some(row=>row.securityId==='TSX:BCE'));
  assert.deepEqual(Array.from(route.evaluatedCandidates.find(row=>row.securityId==='NYSE:BLOCKED').blockingReasons),['MISSING_BROKER_ROUTE']);
});
