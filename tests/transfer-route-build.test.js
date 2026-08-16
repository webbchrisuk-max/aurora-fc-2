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

function loadTransferPageEngine(){
  const document={addEventListener:()=>{},getElementById:()=>null};
  const window={AuroraTransferMission:Mission,Aurora2:{},document};
  window.window=window;
  const context={window,document,Date,Math,Number,String,Array,Set,Map,setTimeout:()=>{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','transfer-engine.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','transfer-ui.js'),'utf8'),context);
  return window.Aurora2.transferEngine;
}

test('Build / Review Route operation creates canonical legs for an eligible DRAFT mission',()=>{
  const engine=loadEngine();
  const mission=Mission.create({id:'PAYDAY-820',paydayDate:'2026-08-28',amount:820,strategy:'sustainable',createdAt:'2026-08-16T10:00:00Z'});
  const state={
    mission,
    scouting:{status:'SCOUTING_READY',strategy:'sustainable',approvedBatchId:'SHORTLIST-1',targets:[
      {id:'TARGET-GCP',ticker:'GCP.L',name:'GCP Infrastructure',preferredAccount:'IG ISA',status:'approved',yieldPct:6.1,livePriceGbp:1,sustainableScore:92,approvedForTransfer:true,approvalBatchId:'SHORTLIST-1'}
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
    {ticker:'OLD',status:'pass',yieldPct:9,livePriceGbp:1,sustainableScore:99,approvedForTransfer:true,approvalBatchId:'OLD'},
    {ticker:'WATCH',status:'pass',yieldPct:8,livePriceGbp:1,sustainableScore:98,approvedForTransfer:false},
    {ticker:'OK',preferredAccount:'IG ISA',status:'pass',yieldPct:5,livePriceGbp:1,sustainableScore:80,approvedForTransfer:true,approvalBatchId:'CURRENT'}
  ]},transfer:{settings:{}},squad:{holdings:[]}};
  const route=engine.simulate(state,{budget:500,idFactory:p=>p});
  assert.deepEqual(Array.from(route.allocations,x=>x.ticker),['OK']);
});

test('Global Scout mixed broker shortlist routes executable candidates without ticker-only identity',()=>{
  const engine=loadEngine();
  const mission=Mission.create({id:'PAYDAY-820',paydayDate:'2026-08-28',amount:820,strategy:'maximum',createdAt:'2026-08-16T10:00:00Z'});
  const approved=(securityId,exchange,ticker,preferredAccount,extra={})=>({
    id:`ACTIVE-${securityId}`,securityId,exchange,ticker,name:ticker,preferredAccount,
    status:'pass',yieldPct:6,livePriceGbp:1,maximumScore:90,approvedForTransfer:true,
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

test('Chairman custom baskets share Transfer broker evidence and keep executable mixed routes',()=>{
  const engine=loadEngine();
  const candidate=(securityId,exchange,ticker,brokerEligibility,extra={})=>({
    securityId,exchange,ticker,name:ticker,brokerEligibility,preferredAccount:'CHECK',
    status:'pass',yieldPct:6,livePriceGbp:10,sustainableScore:90,transferPermitted:true,...extra
  });
  const state={scouting:{targets:[
    candidate('LSE:GCP','LSE','GCP',{IG:true,T212:false}),
    candidate('LSE:BATS','LSE','BATS',{IG:false,T212:true}),
    candidate('LSE:BT.A','LSE','BT.A',{IG:true,T212:true}),
    candidate('LSE:NOPE','LSE','NOPE',{IG:false,T212:false})
  ]},transfer:{
    settings:{minAllocation:100,increment:25},
    brokerPreferences:{'LSE:BT.A':{account:'Trading 212 ISA'}}
  },squad:{holdings:[]}};
  const selected=state.scouting.targets.map(x=>x.securityId);

  assert.equal(engine.resolveBrokerRoute(state,state.scouting.targets[0]).account,'IG');
  assert.equal(engine.resolveBrokerRoute(state,state.scouting.targets[1]).account,'T212');
  assert.equal(engine.resolveBrokerRoute(state,state.scouting.targets[2]).account,'T212');
  const basket=engine.resolveReplacementBasket(state,selected);
  assert.equal(basket.find(x=>x.securityId==='LSE:NOPE').incompleteReason,'MISSING_BROKER_ROUTE');

  const simulation=engine.simulate(state,{
    budget:1200,targetIds:selected,allowActiveScouting:true,minAllocation:100,increment:25,maxTargets:4
  });
  assert.deepEqual(new Set(simulation.allocations.map(x=>x.securityId)),new Set(['LSE:GCP','LSE:BATS','LSE:BT.A']));
  assert.deepEqual(new Set(simulation.allocations.map(x=>x.account)),new Set(['IG','T212']));
  assert.ok(simulation.remaining>=0);
  assert.equal(simulation.allocated+simulation.remaining,1200);
});

test('Chairman automatic lenses and five-selection basket share partial executable pool',()=>{
  const engine=loadEngine();
  const candidate=(securityId,ticker,brokerEligibility,sustainableScore,maximumScore,yieldPct=6)=>({
    securityId,exchange:securityId.split(':')[0],ticker,name:ticker,brokerEligibility,
    preferredAccount:'CHECK',status:'pass',yieldPct,livePriceGbp:10,
    sustainableScore,maximumScore,transferPermitted:true,eligibilityStatus:'ELIGIBLE'
  });
  const state={scouting:{replacementBasket:[
    {securityId:'TSX:BCE'},{securityId:'LSE:GCP'},{securityId:'LSE:UKW'},
    {securityId:'LSE:BT'},{securityId:'LSE:FSFL'}
  ],targets:[
    candidate('TSX:BCE','BCE',{IG:false,T212:false},99,99,7),
    candidate('LSE:GCP','GCP',{IG:true,T212:false},96,70,6.5),
    candidate('LSE:UKW','UKW',{IG:true,T212:false},88,82,6),
    candidate('LSE:BT','BT',{IG:false,T212:false},98,98,8),
    candidate('LSE:FSFL','FSFL',{IG:false,T212:true},75,97,7)
  ]},transfer:{settings:{minAllocation:250,increment:25}},squad:{holdings:[]}};
  const selected=state.scouting.replacementBasket.map(row=>row.securityId);
  const basket=engine.resolveReplacementBasket(state,selected);
  assert.equal(basket.length,5);
  assert.equal(basket.filter(row=>row.available).length,3);
  assert.deepEqual(new Set(basket.filter(row=>!row.available).map(row=>row.incompleteReason)),new Set(['MISSING_BROKER_ROUTE']));

  const custom=engine.simulate(state,{budget:18258.58,targetIds:selected,allowActiveScouting:true,maxTargets:8,idFactory:p=>p});
  assert.deepEqual(new Set(custom.allocations.map(row=>row.securityId)),new Set(['LSE:GCP','LSE:UKW','LSE:FSFL']));
  assert.equal(custom.allocated+custom.remaining,custom.financeBudget);

  const sustainable=engine.simulate(state,{budget:18258.58,strategy:'sustainable',allowActiveScouting:true,maxTargets:8,idFactory:p=>p});
  const maximum=engine.simulate(state,{budget:18258.58,strategy:'maximum',allowActiveScouting:true,maxTargets:8,idFactory:p=>p});
  assert.ok(sustainable.allocations.length>0);
  assert.ok(maximum.allocations.length>0);
  assert.equal(sustainable.allocations[0].securityId,'LSE:GCP');
  assert.equal(maximum.allocations[0].securityId,'LSE:FSFL');
  assert.notDeepEqual(Array.from(sustainable.allocations,row=>row.securityId),Array.from(maximum.allocations,row=>row.securityId));
  assert.equal(sustainable.allocated+sustainable.remaining,18258.58);
  assert.equal(maximum.allocated+maximum.remaining,18258.58);

  const zero={...state,scouting:{targets:state.scouting.targets.filter(row=>!row.brokerEligibility.IG&&!row.brokerEligibility.T212)}};
  const review=engine.simulate(zero,{budget:18258.58,strategy:'sustainable',allowActiveScouting:true});
  assert.equal(review.reason,'NO_ELIGIBLE_TARGETS');
  assert.deepEqual(Array.from(review.allocations),[]);
  assert.equal(review.remaining,18258.58);
});

test('live Global Scout shortlist falls through blocked leaders for every Chairman lens',()=>{
  const engine=loadEngine();
  const executable=new Set(['LSE:GCP','LSE:UKW','LSE:FSFL']);
  const identities=[
    ['TSX:BCE','BCE'],['NYSE:VICI','VICI'],['NYSE:UPS','UPS'],['LSE:IMB','IMB'],
    ['LSE:GCP','GCP'],['LSE:BATS','BATS'],['LSE:TRIG','TRIG'],['LSE:UKW','UKW'],
    ['LSE:BT.A','BT.A'],['LSE:WTB','WTB'],['NASDAQ:ARCC','ARCC'],['LSE:FSFL','FSFL']
  ];
  const targets=identities.map(([securityId,ticker],index)=>({
    securityId,exchange:securityId.split(':')[0],ticker,name:ticker,currency:securityId.startsWith('LSE:')?'GBP':'USD',
    brokerEligibility:executable.has(securityId)?{IG:securityId!=='LSE:FSFL',T212:securityId==='LSE:FSFL'}:{IG:false,T212:false},
    status:'pass',transferPermitted:true,eligibilityStatus:'ELIGIBLE',yieldPct:5+index/10,livePriceGbp:10,
    sustainableScore:100-index,maximumScore:index<4?100-index:90-index
  }));
  const state={scouting:{targets},transfer:{settings:{minAllocation:250,increment:25}},squad:{holdings:[]}};
  const selected=targets.slice(0,5).concat(targets.slice(-2)).map(row=>row.securityId);

  for(const strategy of ['sustainable','maximum']){
    const route=engine.simulate(state,{budget:3000,strategy,allowActiveScouting:true,maxTargets:8,idFactory:p=>p});
    assert.ok(route.allocations.length>0,`${strategy} should fall through blocked leaders`);
    assert.ok(route.allocations.every(row=>executable.has(row.securityId)));
    assert.equal(route.allocated+route.remaining,3000);
  }
  const custom=engine.simulate(state,{budget:3000,targetIds:selected,allowActiveScouting:true,maxTargets:8,idFactory:p=>p});
  assert.deepEqual(new Set(custom.allocations.map(row=>row.securityId)),new Set(['LSE:GCP','LSE:FSFL']));
  assert.equal(custom.evaluatedCandidates.filter(row=>selected.includes(row.securityId)&&!row.simulationEligible).length,5);

  const transferResolution=engine.resolveExecutableCandidate(targets[4],{state,purpose:'TRANSFER'});
  const chairmanResolution=engine.resolveExecutableCandidate(targets[4],{state,purpose:'CHAIRMAN'});
  assert.deepEqual(JSON.parse(JSON.stringify(transferResolution)),JSON.parse(JSON.stringify(chairmanResolution)));
  const diagnostics=engine.executableDiagnostics(state);
  assert.equal(diagnostics.find(row=>row.securityId==='TSX:BCE').blockingReasons[0],'MISSING_BROKER_ROUTE');
  assert.equal(diagnostics.find(row=>row.securityId==='LSE:GCP').simulation,true);
});

test('Deal Sheet recruits executable candidates in canonical Scouting league order',()=>{
  const engine=loadEngine();
  const target=(rank,ticker,score)=>({securityId:`LSE:${ticker}`,exchange:'LSE',ticker,
    status:'pass',rank,maximumRank:rank,sustainableScore:score,maximumScore:score,
    yieldPct:5+rank,livePriceGbp:10,brokerEligibility:{IG:true},transferPermitted:true});
  const state={scouting:{targets:[target(5,'LOW2',70),target(2,'TOP2',96),target(1,'TOP1',99),
    target(4,'LOW1',80),target(3,'TOP3',94)]},transfer:{settings:{minAllocation:250,increment:25}},squad:{holdings:[]}};

  for(const strategy of ['sustainable','maximum']){
    const route=engine.simulate(state,{budget:1500,strategy,allowActiveScouting:true,maxTargets:5,idFactory:p=>p});
    assert.deepEqual(Array.from(route.allocations.slice(0,3),row=>row.ticker),['TOP1','TOP2','TOP3']);
    assert.ok(route.allocations.slice(0,3).every(row=>row.amount>0));
    assert.deepEqual(Array.from(route.candidateDecisions.slice(0,3),row=>row.reason),['ALLOCATED','ALLOCATED','ALLOCATED']);
  }
});

test('Transfer page bridge passes canonical security IDs rather than Scouting row IDs',()=>{
  const engine=loadTransferPageEngine();
  const targets=[1,2,3].map(rank=>({id:`DATABASE-ROW-${rank}`,securityId:`LSE:T${rank}`,exchange:'LSE',ticker:`T${rank}`,
    status:'pass',rank,sustainableScore:100-rank,yieldPct:6,livePriceGbp:10,brokerEligibility:{IG:true}}));
  const state={scouting:{targets},transfer:{settings:{minAllocation:100,increment:25}},squad:{holdings:[]}};
  const route=engine.simulate(state,{budget:600,strategy:'sustainable',allowActiveScouting:true,idFactory:p=>p});
  assert.deepEqual(Array.from(route.allocations,row=>row.securityId),['LSE:T1','LSE:T2','LSE:T3']);
  assert.equal(route.allocationMode,'SCOUTING_AUTHORITY_THEN_TRANSFER_SIZING');
});

test('blocked league leader is explained and rank two becomes first allocation priority',()=>{
  const engine=loadEngine();
  const targets=[
    {securityId:'LSE:ONE',exchange:'LSE',ticker:'ONE',status:'block',rank:1,sustainableScore:99,yieldPct:9,livePriceGbp:10,brokerEligibility:{IG:true}},
    {securityId:'LSE:TWO',exchange:'LSE',ticker:'TWO',status:'pass',rank:2,sustainableScore:96,yieldPct:6,livePriceGbp:10,brokerEligibility:{IG:true}},
    {securityId:'LSE:THREE',exchange:'LSE',ticker:'THREE',status:'pass',rank:3,sustainableScore:90,yieldPct:8,livePriceGbp:10,brokerEligibility:{IG:true}}
  ];
  const state={scouting:{targets},transfer:{settings:{minAllocation:250,increment:25}},squad:{holdings:[]}};
  const route=engine.simulate(state,{budget:500,strategy:'sustainable',allowActiveScouting:true,idFactory:p=>p});
  assert.equal(route.allocations[0].ticker,'TWO');
  assert.equal(route.candidateDecisions[0].ticker,'ONE');
  assert.equal(route.candidateDecisions[0].executable,false);
  assert.equal(route.candidateDecisions[0].reason,'SKIPPED — BLOCK status');
  assert.equal(route.candidateDecisions[1].reason,'ALLOCATED');
});

test('ticker-only legacy evidence migrates only for an unambiguous canonical market identity',()=>{
  const engine=loadEngine();
  const ukw={securityId:'LSE:UKW',exchange:'LSE',ticker:'UKW',yieldPct:6,preferredAccount:'CHECK'};
  const state={scouting:{targets:[ukw],legacyPriceRecords:[{ticker:'UKW',livePriceGbp:1.42}]},transfer:{brokerPreferences:{UKW:{account:'IG ISA'}}},squad:{holdings:[]}};
  assert.equal(engine.resolveExecutableCandidate(ukw,{state}).simulationEligible,true);

  const collision={...state,scouting:{...state.scouting,targets:[ukw,{securityId:'NYSE:UKW',exchange:'NYSE',ticker:'UKW',yieldPct:6}]}};
  assert.equal(engine.resolveMarketPrice(collision,ukw).supported,false);
  assert.equal(engine.resolveBrokerRoute(collision,ukw).supported,false);
});

test('Chairman broker resolver never treats a holding account as broker eligibility',()=>{
  const engine=loadEngine();
  const target={securityId:'LSE:GCP',exchange:'LSE',ticker:'GCP',preferredAccount:'CHECK',status:'pass',yieldPct:6,livePriceGbp:10,transferPermitted:true};
  const state={scouting:{targets:[target]},transfer:{settings:{}},squad:{holdings:[
    {securityId:'LSE:GCP',exchange:'LSE',ticker:'GCP',account:'IG ISA',status:'ACTIVE',shares:1,livePriceGbp:10}
  ]}};
  assert.equal(engine.resolveBrokerRoute(state,target).account,'CHECK');
  assert.equal(engine.resolveExistingExposure(state,target).currentShares,1);
  state.transfer.brokerEligibility=[{securityId:'LSE:GCP',brokerEligibility:{IG:true}}];
  assert.equal(engine.resolveBrokerRoute(state,target).account,'IG');
  assert.equal(engine.simulate(state,{budget:500,targetIds:['LSE:GCP'],allowActiveScouting:true}).allocations[0].account,'IG');

  const unsupported={...state,scouting:{targets:[{...target,securityId:'LSE:NOPE',ticker:'NOPE',brokerEligibility:{IG:false,T212:false}}]},squad:{holdings:[]}};
  const safe=engine.simulate(unsupported,{budget:500,targetIds:['LSE:NOPE'],allowActiveScouting:true});
  assert.deepEqual(Array.from(safe.allocations),[]);
  assert.equal(safe.reason,'NO_ELIGIBLE_TARGETS');
  assert.equal(safe.remaining,500);
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

test('live aliases reconcile UKW price, BATS broker evidence, and never-owned BCE evidence',()=>{
  const engine=loadEngine();
  const target=(securityId,exchange,ticker)=>({securityId,exchange,ticker,status:'pass',yieldPct:6,transferPermitted:true});
  const ukw=target('LSE:UKW','LSE','UKW');
  const bats=target('LSE:BATS','LSE','BATS');
  const bce=target('TSX:BCE','TSX','BCE');
  const state={scouting:{targets:[ukw,bats,bce],universe:[
    {securityId:'XLON:UKW',symbol:'UKW.L',price:146,priceUnit:'PENCE',currency:'GBP',brokerEligibility:{IG:true}},
    {securityId:'LON:BATS',symbol:'BATS.L',livePriceGbp:28.4,T212:true},
    {securityId:'XTSE:BCE',symbol:'BCE',livePriceGbp:27,brokerEligibility:{T212:true}}
  ]},transfer:{settings:{}},squad:{holdings:[]}};

  assert.equal(engine.resolveMarketPrice(state,ukw).priceGbp,1.46);
  assert.equal(engine.resolveBrokerRoute(state,bats).account,'T212');
  assert.equal(engine.resolveExecutableCandidate(bce,{state}).simulationEligible,true);
  const basket=engine.resolveReplacementBasket(state,['LSE:UKW','LSE:BATS','TSX:BCE']);
  assert.equal(basket.filter(row=>row.available).length,3);
});

test('Chairman rotation enforces portfolio position cap and keeps legitimate holdback',()=>{
  const engine=loadEngine();
  const gcp={securityId:'LSE:GCP',exchange:'LSE',ticker:'GCP',status:'pass',yieldPct:6.5,livePriceGbp:1,brokerEligibility:{IG:true},sustainableScore:95};
  const state={scouting:{targets:[gcp]},transfer:{settings:{minAllocation:250,increment:25}},squad:{holdings:[
    {id:'SALE',securityId:'LSE:OLD',exchange:'LSE',ticker:'OLD',account:'IG',status:'ACTIVE',shares:18258.58,livePriceGbp:1},
    {securityId:'LSE:CORE',exchange:'LSE',ticker:'CORE',account:'IG',status:'ACTIVE',shares:41741.42,livePriceGbp:1}
  ]}};
  const route=engine.simulate(state,{budget:18258.58,allowActiveScouting:true,rotationContext:{holdingId:'SALE',ticker:'OLD',account:'IG',saleFraction:1},idFactory:p=>p});
  const snapshot=engine.concentrationSnapshot(state,{holdingId:'SALE',ticker:'OLD',account:'IG',saleFraction:1},route.allocations);
  assert.ok(route.remaining>0);
  assert.ok(route.allocations[0].amount<=12000);
  const gcpPct=route.allocations[0].amount/snapshot.after.total*100;
  assert.ok(gcpPct<=20.01);
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
