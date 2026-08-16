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
