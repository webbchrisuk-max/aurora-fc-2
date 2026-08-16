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
    scouting:{status:'SCOUTING_READY',strategy:'sustainable',targets:[
      {id:'TARGET-GCP',ticker:'GCP.L',name:'GCP Infrastructure',preferredAccount:'IG ISA',status:'approved',yieldPct:6.1,sustainableScore:92}
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
