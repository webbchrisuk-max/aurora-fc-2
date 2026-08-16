'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const Mission=require('../aurora-transfer-mission.js');

function loadEngine(){
  const window={AuroraTransferMission:Mission,Aurora2:{}};
  window.window=window;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','transfer-engine.js'),'utf8'),{window,Date,Math,Number,String,Array,Set,Map});
  return window.Aurora2.transferEngine;
}

test('Build / Review Route operation creates canonical legs for an eligible DRAFT mission',()=>{
  const engine=loadEngine();
  const mission=Mission.create({id:'PAYDAY-820',paydayDate:'2026-08-28',amount:820,strategy:'sustainable',createdAt:'2026-08-16T10:00:00Z'});
  const state={
    mission,
    scouting:{status:'SCOUTING_READY',strategy:'sustainable',approvedBatchId:'SHORTLIST-1',targets:[
      {id:'TARGET-GCP',ticker:'GCP.L',name:'GCP Infrastructure',preferredAccount:'IG ISA',status:'approved',yieldPct:6.1,sustainableScore:92,approvedForTransfer:true,approvalBatchId:'SHORTLIST-1'}
    ]},
    transfer:{settings:{brokerScope:'both',minAllocation:250,increment:25}},
    squad:{holdings:[]}
  };
  let sequence=0;
  const result=engine.buildMissionPlan(state,{missionContract:Mission,now:'2026-08-16T10:05:00Z',idFactory:prefix=>`${prefix}-${++sequence}`});

  assert.equal(result.ok,true);
  assert.equal(result.mission.approvedBudget,820);
  assert.equal(result.mission.status,Mission.STATUS.READY);
  assert.ok(result.route.allocations.length>0);
  assert.ok(result.mission.legIds.length>0);
  assert.deepEqual(Array.from(result.mission.legIds),Array.from(result.mission.allocationPlan.legIds));
  assert.ok(result.mission.brokerRoutes.includes('IG'));
  assert.ok(result.mission.amountAllocated>0);
  assert.equal(result.mission.amountRemaining,820-result.mission.amountAllocated);
});

test('Transfer ignores candidates outside the current approved Scout batch',()=>{
  const engine=loadEngine();
  const state={scouting:{approvedBatchId:'CURRENT',targets:[
    {ticker:'OLD',status:'pass',yieldPct:9,sustainableScore:99,approvedForTransfer:true,approvalBatchId:'OLD'},
    {ticker:'WATCH',status:'pass',yieldPct:8,sustainableScore:98,approvedForTransfer:false},
    {ticker:'OK',preferredAccount:'IG ISA',status:'pass',yieldPct:5,sustainableScore:80,approvedForTransfer:true,approvalBatchId:'CURRENT'}
  ]},transfer:{settings:{}},squad:{holdings:[]}};
  const route=engine.simulate(state,{budget:500,idFactory:p=>p});
  assert.deepEqual(Array.from(route.allocations,x=>x.ticker),['OK']);
});

test('Global Scout mixed broker shortlist routes executable candidates without ticker-only identity',()=>{
  const engine=loadEngine();
  const mission=Mission.create({id:'PAYDAY-820',paydayDate:'2026-08-28',amount:820,strategy:'maximum',createdAt:'2026-08-16T10:00:00Z'});
  const approved=(securityId,exchange,ticker,preferredAccount,extra={})=>({
    id:`ACTIVE-${securityId}`,securityId,exchange,ticker,name:ticker,preferredAccount,
    status:'pass',yieldPct:6,maximumScore:90,approvedForTransfer:true,
    approvalBatchId:'GLOBAL-12',transferPermitted:true,eligibilityStatus:'ELIGIBLE',...extra
  });
  const state={mission,scouting:{status:'SCOUTING_READY',strategy:'maximum',approvedBatchId:'GLOBAL-12',targets:[
    approved('LSE:UKW','LSE','UKW','IG ISA'),
    approved('NASDAQ:ARCC','NASDAQ','ARCC','IG ISA'),
    approved('LSE:FSFL','LSE','FSFL','Trading 212 ISA'),
    approved('NYSE:ABC','NYSE','ABC','CHECK'),
    approved('LSE:ABC','LSE','ABC','CHECK',{brokerEligibility:{IG:true,T212:false}})
  ]},transfer:{settings:{brokerScope:'both',minAllocation:125,increment:25}},squad:{holdings:[]}};
  let sequence=0;
  const result=engine.buildMissionPlan(state,{missionContract:Mission,idFactory:p=>`${p}-${++sequence}`});
  assert.equal(result.ok,true);
  assert.equal(result.route.financeBudget,820);
  assert.ok(result.route.allocations.length>0);
  assert.ok(result.route.allocations.every(a=>['IG','T212'].includes(a.account)));
  assert.ok(result.route.allocations.some(a=>a.account==='IG'));
  assert.ok(result.route.allocations.some(a=>a.account==='T212'));
  assert.ok(!result.route.allocations.some(a=>a.securityId==='NYSE:ABC'));
  assert.ok(result.route.allocations.some(a=>a.securityId==='LSE:ABC'));
  assert.ok(result.route.allocations.every(a=>a.securityId&&a.exchange));
  assert.equal(engine.routeGuardMessage(state),'Finance mission and Scouting-approved shortlist loaded. Build the route when ready.');
  assert.doesNotMatch(engine.routeGuardMessage(state),/Waiting for a Finance mission/);
});

test('a genuine zero-executable approved shortlist fails safely',()=>{
  const engine=loadEngine();
  const mission=Mission.create({id:'PAYDAY-820',amount:820,createdAt:'2026-08-16T10:00:00Z'});
  const state={mission,scouting:{status:'SCOUTING_READY',approvedBatchId:'GLOBAL-X',targets:[
    {id:'ACTIVE-X',securityId:'NYSE:X',exchange:'NYSE',ticker:'X',preferredAccount:'CHECK',status:'pass',yieldPct:8,approvedForTransfer:true,approvalBatchId:'GLOBAL-X',transferPermitted:true},
    {id:'ACTIVE-Y',securityId:'LSE:Y',exchange:'LSE',ticker:'Y',preferredAccount:'IG ISA',status:'pass',yieldPct:8,approvedForTransfer:true,approvalBatchId:'GLOBAL-X',transferPermitted:false}
  ]},transfer:{settings:{brokerScope:'both',minAllocation:125,increment:25}},squad:{holdings:[]}};
  const result=engine.buildMissionPlan(state,{missionContract:Mission,idFactory:p=>p});
  assert.equal(result.ok,false);
  assert.equal(result.reason,'NO_ELIGIBLE_TARGETS');
  assert.deepEqual(Array.from(result.simulation.allocations),[]);
});

test('Chairman canonical replacement basket drives income and removes deselected securities',()=>{
  const engine=loadEngine();
  const candidate=(securityId,exchange,ticker,yieldPct)=>({
    id:`ACTIVE-${securityId}`,securityId,exchange,ticker,name:ticker,
    preferredAccount:'IG ISA',status:'pass',yieldPct,sustainableScore:90,
    transferPermitted:true,livePriceGbp:50
  });
  const state={scouting:{targets:[
    candidate('TSX:BCE','TSX','BCE',6.5),
    candidate('NYSE:VICI','NYSE','VICI',5.5),
    candidate('NYSE:UPS','NYSE','UPS',4.5)
  ]},transfer:{settings:{}},squad:{holdings:[]}};
  const selected=['TSX:BCE','NYSE:VICI','NYSE:UPS'];

  const basket=engine.resolveReplacementBasket(state,selected);
  assert.deepEqual(Array.from(basket,x=>x.securityId),selected);
  assert.ok(basket.every(x=>x.available));

  const simulation=engine.simulate(state,{
    budget:3000,targetIds:selected,allowActiveScouting:true,minAllocation:250,
    increment:25,maxTargets:3,idFactory:p=>p
  });
  assert.deepEqual(new Set(simulation.allocations.map(x=>x.securityId)),new Set(selected));
  assert.ok(simulation.income>0);
  assert.equal(simulation.income,simulation.allocations.reduce((sum,x)=>sum+x.expectedAnnualIncome,0));
  const surrenderedIncome=981.95;
  assert.equal(simulation.income-surrenderedIncome,simulation.income-981.95);

  const deselected=engine.resolveReplacementBasket(state,selected.filter(id=>id!=='NYSE:VICI'));
  assert.deepEqual(Array.from(deselected,x=>x.securityId),['TSX:BCE','NYSE:UPS']);
});

test('canonical replacement basket deduplicates IDs and returns to an empty state',()=>{
  const engine=loadEngine();
  const state={scouting:{targets:[{securityId:'NYSE:UPS',exchange:'NYSE',ticker:'UPS',yieldPct:4,livePriceGbp:50,preferredAccount:'IG ISA'}]}};
  assert.deepEqual(Array.from(engine.resolveReplacementBasket(state,[])),[]);
  const basket=engine.resolveReplacementBasket(state,['NYSE:UPS','NYSE:UPS']);
  assert.equal(basket.length,1);
  assert.equal(basket[0].securityId,'NYSE:UPS');
});

test('Chairman uses shared canonical market evidence and labels stale or missing quotes',()=>{
  const engine=loadEngine();
  const target=(securityId,exchange,ticker)=>({
    securityId,exchange,ticker,name:ticker,yieldPct:6,preferredAccount:'IG ISA',
    status:'pass',transferPermitted:true,sustainableScore:90
  });
  const state={scouting:{targets:[
    target('LSE:UKW','LSE','UKW'),target('NASDAQ:ARCC','NASDAQ','ARCC'),target('LSE:FSFL','LSE','FSFL')
  ]},marketData:{quotes:[
    {securityId:'LON:UKW',ticker:'UKW.L',price:145,priceUnit:'PENCE',currency:'GBP',quoteUpdatedAt:'2026-08-16T10:00:00Z'},
    {securityId:'NASDAQ:ARCC',ticker:'ARCC',price:20,currency:'USD',fxRateToGbp:.75,account:'IG ISA',quoteUpdatedAt:'2026-08-16T09:00:00Z'},
    {securityId:'LSE:FSFL',ticker:'FSFL',livePriceGbp:.88,quoteUpdatedAt:'2026-08-12T09:00:00Z'}
  ]},transfer:{settings:{}},squad:{holdings:[]}};

  const ukw=engine.resolveMarketPrice(state,state.scouting.targets[0],{nowMs:Date.parse('2026-08-16T12:00:00Z')});
  assert.equal(ukw.priceGbp,1.45);
  assert.equal(ukw.timestamp,'2026-08-16T10:00:00Z');
  assert.equal(ukw.status,'CURRENT');
  const stale=engine.resolveMarketPrice(state,state.scouting.targets[2],{nowMs:Date.parse('2026-08-16T12:00:00Z')});
  assert.equal(stale.status,'STALE');
  assert.equal(stale.label,'STALE PRICE — REVIEW BEFORE EXECUTION');
  const missing=engine.resolveMarketPrice({scouting:{targets:[target('NYSE:NONE','NYSE','NONE')]}},target('NYSE:NONE','NYSE','NONE'));
  assert.equal(missing.label,'NO SUPPORTED PRICE DATA');

  const selected=['LSE:UKW','NASDAQ:ARCC','LSE:FSFL'];
  assert.ok(engine.resolveReplacementBasket(state,selected).every(row=>row.available));
  const simulation=engine.simulate(state,{budget:3000,targetIds:selected,allowActiveScouting:true,minAllocation:250,increment:25,maxTargets:3,idFactory:p=>p});
  assert.deepEqual(new Set(simulation.allocations.map(row=>row.securityId)),new Set(selected));
  assert.ok(simulation.income>0);
  assert.ok(simulation.allocations.find(row=>row.securityId==='LSE:FSFL').priceEvidence.stale);
});

test('selected security without income evidence is explicit and is not simulated as zero income',()=>{
  const engine=loadEngine();
  const state={scouting:{targets:[{
    id:'ACTIVE-NYSE:MISSING',securityId:'NYSE:MISSING',exchange:'NYSE',ticker:'MISSING',
    preferredAccount:'IG ISA',status:'pass',sustainableScore:90
  }]},transfer:{settings:{}},squad:{holdings:[]}};
  const basket=engine.resolveReplacementBasket(state,['NYSE:MISSING']);
  assert.equal(basket[0].available,false);
  assert.equal(basket[0].incompleteReason,'MISSING_INCOME_EVIDENCE');
  const simulation=engine.simulate(state,{budget:1000,targetIds:['NYSE:MISSING'],allowActiveScouting:true});
  assert.deepEqual(Array.from(simulation.allocations),[]);
  assert.equal(simulation.reason,'NO_ELIGIBLE_TARGETS');
});

test('£2,757.10 Chairman rotation uses three canonical replacements and preserves broker remainder',()=>{
  const engine=loadEngine();
  const state={scouting:{replacementBasket:[
    {securityId:'TSX:BCE',exchange:'TSX',ticker:'BCE'},
    {securityId:'NYSE:VICI',exchange:'NYSE',ticker:'VICI'},
    {securityId:'NYSE:UPS',exchange:'NYSE',ticker:'UPS'}
  ],targets:[
    {securityId:'TSX:BCE',exchange:'TSX',ticker:'BCE',name:'BCE',preferredAccount:'IG ISA',status:'pass',yieldPct:6.5,livePriceGbp:28,sustainableScore:92},
    {securityId:'NYSE:VICI',exchange:'NYSE',ticker:'VICI',name:'VICI',preferredAccount:'IG ISA',status:'pass',yieldPct:5.5,livePriceGbp:24,sustainableScore:90},
    {securityId:'NYSE:UPS',exchange:'NYSE',ticker:'UPS',name:'UPS',preferredAccount:'IG ISA',status:'pass',yieldPct:4.5,livePriceGbp:72,sustainableScore:88}
  ]},transfer:{settings:{minAllocation:250,increment:25}},squad:{holdings:[]}};
  const selected=state.scouting.replacementBasket.map(x=>x.securityId);
  const simulation=engine.simulate(state,{budget:2757.10,targetIds:selected,allowActiveScouting:true,maxTargets:3,idFactory:p=>p});
  assert.deepEqual(new Set(simulation.allocations.map(x=>x.securityId)),new Set(selected));
  assert.ok(simulation.income>0);
  assert.equal(simulation.allocated+simulation.remaining,2757.10);
  assert.equal(Number((simulation.income-245.49).toFixed(6)),Number((simulation.allocations.reduce((sum,x)=>sum+x.expectedAnnualIncome,0)-245.49).toFixed(6)));
});

test('intentionally empty canonical Chairman basket retains the zero-income state',()=>{
  const engine=loadEngine();
  const state={scouting:{replacementBasket:[],targets:[{securityId:'NYSE:UPS',exchange:'NYSE',ticker:'UPS',preferredAccount:'IG ISA',yieldPct:4}]},transfer:{settings:{}},squad:{holdings:[]}};
  const simulation=engine.simulate(state,{budget:2757.10,targetIds:[],allowActiveScouting:true});
  assert.deepEqual(Array.from(simulation.allocations),[]);
  assert.equal(simulation.income,0);
  assert.equal(simulation.remaining,2757.10);
});
