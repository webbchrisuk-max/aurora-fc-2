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
