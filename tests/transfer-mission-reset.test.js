const test=require('node:test');
const assert=require('node:assert/strict');
const Mission=require('../aurora-transfer-mission.js');

test('active mission reset zeros the workspace without touching investment history',()=>{
  const state={
    mission:Mission.create({id:'PAYDAY-820',amount:820}),
    transfer:{
      route:{id:'ROUTE-820',missionId:'PAYDAY-820',financeBudget:820,allocations:[{amount:820}]},
      registrationDrafts:[
        {id:'DRAFT',missionId:'PAYDAY-820',status:'DRAFT'},
        {id:'FILL',missionId:'PAYDAY-820',status:'CONFIRMED'},
        {id:'OTHER',missionId:'OLDER',status:'DRAFT'}
      ],
      executionChecks:{cash:true},
      completedMissions:[{id:'COMPLETED-1'}]
    },
    registration:{receipts:[{id:'RECEIPT-1',missionId:'PAYDAY-820'}]},
    squad:{holdings:[{ticker:'GCP',shares:10}]},
    income:{history:[{ticker:'GCP',amount:12}]},
    purchaseLog:[{ticker:'GCP',cost:500}]
  };

  const reset=Mission.resetActiveTransferMission(state,'2026-08-16T12:00:00Z');
  assert.equal(reset.mission,null);
  assert.equal(reset.transfer.route,null);
  assert.deepEqual(reset.transfer.executionChecks,{});
  assert.deepEqual(reset.transfer.registrationDrafts.map(x=>x.id),['FILL','OTHER']);
  assert.deepEqual(reset.transfer.completedMissions,state.transfer.completedMissions);
  assert.deepEqual(reset.registration,state.registration);
  assert.deepEqual(reset.squad,state.squad);
  assert.deepEqual(reset.income,state.income);
  assert.deepEqual(reset.purchaseLog,state.purchaseLog);
});

test('a new Finance release is authoritative after reset',()=>{
  const old={mission:Mission.create({id:'PAYDAY-820',amount:820}),transfer:{route:{missionId:'PAYDAY-820'},registrationDrafts:[]}};
  const reset=Mission.resetActiveTransferMission(old);
  const next=Mission.create({id:'PAYDAY-3000',amount:3000});
  const reloaded={...reset,mission:next};
  assert.equal(reloaded.mission.approvedBudget,3000);
  assert.equal(reloaded.mission.availableCash,3000);
  assert.equal(reloaded.transfer.route,null);
});
