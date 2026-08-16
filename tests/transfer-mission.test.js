'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const W=require('../aurora-transfer-mission.js');

const mission=()=>W.create({id:'PAYDAY-2026-09-11',paydayDate:'2026-09-11',amount:800,strategy:'sustainable',createdAt:'2026-09-01T00:00:00Z'});
const route=()=>({id:'ROUTE-1',missionId:'PAYDAY-2026-09-11',strategy:'sustainable',allocations:[{legId:'GCP-IG',ticker:'GCP',account:'IG',amount:450},{legId:'PHP-T212',ticker:'PHP',account:'Trading 212',amount:350}]});

test('Finance amount stays authoritative through plan and lock',()=>{const p=W.plan(mission(),route());assert.equal(p.mission.approvedBudget,800);assert.equal(p.mission.amountRemaining,0);const l=W.lock(p.mission,p.route);assert.equal(l.mission.status,W.STATUS.LOCKED);assert.throws(()=>W.plan(l.mission,route()),/cannot be silently replanned/)});
test('registration validates the locked stable leg and blocks duplicates',()=>{const p=W.plan(mission(),route()),l=W.lock(p.mission,p.route);const state={mission:l.mission,transfer:{route:l.route,registrationDrafts:[]},registration:{receipts:[]}};assert.equal(W.validateRegistration(state,{missionId:l.mission.id,legId:'GCP-IG',ticker:'GCP',account:'IG',shares:10,price:44}).ok,true);state.registration.receipts.push({missionId:l.mission.id,legId:'GCP-IG'});assert.match(W.validateRegistration(state,{missionId:l.mission.id,legId:'GCP-IG',ticker:'GCP',account:'IG',shares:10,price:44}).errors.join(' '),/already registered/)});
test('partial and complete reconciliation preserve actual leftover cash',()=>{const p=W.plan(mission(),route()),l=W.lock(p.mission,p.route);let x=W.reconcile(l.mission,l.route,[{routeId:'ROUTE-1',missionId:'PAYDAY-2026-09-11',allocationId:'GCP-IG',status:'CONFIRMED',transactionId:'TX-1',totalCostGbp:447.2}]);assert.equal(x.mission.status,W.STATUS.PARTIAL);assert.equal(x.mission.amountRemaining,352.8);x=W.reconcile(x.mission,x.route,[{routeId:'ROUTE-1',missionId:'PAYDAY-2026-09-11',allocationId:'GCP-IG',status:'CONFIRMED',transactionId:'TX-1',totalCostGbp:447.2},{routeId:'ROUTE-1',missionId:'PAYDAY-2026-09-11',allocationId:'PHP-T212',status:'CONFIRMED',transactionId:'TX-2',totalCostGbp:346.22}]);assert.equal(x.mission.status,W.STATUS.COMPLETE);assert.equal(x.mission.actualInvested,793.42);assert.equal(x.mission.amountRemaining,6.58)});

test('reconciliation only counts confirmed legs linked to the current mission once',()=>{
  const p=W.plan(mission(),route()),l=W.lock(p.mission,p.route);
  const drafts=[
    {routeId:'ROUTE-1',missionId:l.mission.id,legId:'GCP-IG',status:'CONFIRMED',transactionId:'TX-1',totalCostGbp:447.2},
    {routeId:'ROUTE-1',missionId:l.mission.id,legId:'GCP-IG',status:'CONFIRMED',transactionId:'TX-DUPLICATE',totalCostGbp:447.2},
    {routeId:'ROUTE-1',missionId:'STALE-MISSION',legId:'PHP-T212',status:'CONFIRMED',transactionId:'TX-STALE',totalCostGbp:346.22},
    {routeId:'ROUTE-1',missionId:l.mission.id,legId:'UNKNOWN-LEG',status:'CONFIRMED',transactionId:'TX-UNKNOWN',totalCostGbp:100}
  ];
  const x=W.reconcile(l.mission,l.route,drafts);
  assert.deepEqual(x.mission.registrationStatus,{registered:1,total:2});
  assert.equal(x.mission.status,W.STATUS.PARTIAL);
  assert.equal(x.mission.actualInvested,447.2);
  assert.equal(x.mission.amountRemaining,352.8);
});

test('cancelled and error missions cannot be registered',()=>{
  const p=W.plan(mission(),route()),l=W.lock(p.mission,p.route);
  for(const status of [W.STATUS.CANCELLED,W.STATUS.ERROR]){
    const state={mission:{...l.mission,status},transfer:{route:l.route,registrationDrafts:[]},registration:{receipts:[]}};
    assert.match(W.validateRegistration(state,{missionId:l.mission.id,legId:'GCP-IG',ticker:'GCP',account:'IG',shares:10,price:44}).errors.join(' '),/not locked/);
  }
});

function stateAt(status){
  const p=W.plan(mission(),route());
  if(status===W.STATUS.DRAFT)return {mission:mission(),transfer:{route:p.route,registrationDrafts:[]},registration:{receipts:[]}};
  if(status===W.STATUS.READY)return {mission:p.mission,transfer:{route:p.route,registrationDrafts:[]},registration:{receipts:[]}};
  const l=W.lock(p.mission,p.route);
  return {mission:l.mission,transfer:{route:l.route,registrationDrafts:[]},registration:{receipts:[]}};
}

test('DRAFT reset preserves mission and Finance cash while removing allocations',()=>{
  const before=stateAt(W.STATUS.DRAFT),x=W.rollback(before,'RESET_MISSION','test','2026-09-02T00:00:00Z');
  assert.equal(x.mission.id,before.mission.id);assert.equal(x.mission.approvedBudget,800);assert.equal(x.mission.availableCash,800);
  assert.equal(x.mission.amountAllocated,0);assert.equal(x.mission.amountRemaining,800);assert.equal(x.mission.status,W.STATUS.DRAFT);assert.equal(x.transfer.route,null);
});

test('READY returns to DRAFT without changing approved funding',()=>{
  const before=stateAt(W.STATUS.READY),x=W.rollback(before,'RETURN_TO_DRAFT');
  assert.equal(x.mission.status,W.STATUS.DRAFT);assert.equal(x.mission.approvedBudget,800);assert.equal(x.transfer.route,null);
});

test('LOCKED unlocks to READY only before a registration exists',()=>{
  const before=stateAt(W.STATUS.LOCKED),x=W.rollback(before,'UNLOCK_ROUTE');
  assert.equal(x.mission.status,W.STATUS.READY);assert.equal(x.transfer.route.locked,false);assert.deepEqual(x.mission.legIds,['GCP-IG','PHP-T212']);
  before.registration.receipts.push({missionId:before.mission.id,legId:'GCP-IG',transactionId:'TX-1'});
  assert.equal(W.rollbackAction(before).disabled,true);assert.throws(()=>W.rollback(before,'UNLOCK_ROUTE'),/purchases recorded/);
});

test('partial rollback preserves completed legs and restores only unused cash',()=>{
  const before=stateAt(W.STATUS.LOCKED),draft={routeId:'ROUTE-1',missionId:before.mission.id,legId:'GCP-IG',allocationId:'GCP-IG',status:'CONFIRMED',transactionId:'TX-1',totalCostGbp:447.2};
  const reconciled=W.reconcile(before.mission,before.transfer.route,[draft]);
  const partial={...before,mission:reconciled.mission,transfer:{route:reconciled.route,registrationDrafts:[draft]}};
  const x=W.rollback(partial,'CANCEL_REMAINING_LEGS');
  assert.equal(x.transfer.route.allocations[0].status,'REGISTERED');assert.equal(x.transfer.route.allocations[0].transactionId,'TX-1');
  assert.equal(x.transfer.route.allocations[1].status,'CANCELLED');assert.equal(x.mission.actualInvested,447.2);assert.equal(x.mission.amountRemaining,352.8);
  assert.deepEqual(x.transfer.registrationDrafts,[draft]);
});

test('COMPLETE cannot use ordinary rollback',()=>{
  const before=stateAt(W.STATUS.LOCKED),drafts=route().allocations.map((a,i)=>({routeId:'ROUTE-1',missionId:before.mission.id,legId:a.legId,status:'CONFIRMED',transactionId:`TX-${i}`,totalCostGbp:a.amount}));
  const complete=W.reconcile(before.mission,before.transfer.route,drafts),state={...before,mission:complete.mission,transfer:{route:complete.route,registrationDrafts:drafts}};
  assert.equal(W.rollbackAction(state).action,null);assert.match(W.rollbackAction(state).label,/REAL TRANSACTIONS/);assert.throws(()=>W.rollback(state,'RETURN_TO_DRAFT'),/REAL TRANSACTIONS/);
});

test('restore from ERROR or CANCELLED reuses stable IDs without duplicating records',()=>{
  for(const terminal of [W.STATUS.ERROR,W.STATUS.CANCELLED]){
    const before=stateAt(W.STATUS.LOCKED),broken={...before,mission:{...before.mission,status:terminal,lastValidStatus:W.STATUS.LOCKED}};
    const x=W.rollback(broken,'RESTORE_MISSION');
    assert.equal(x.mission.id,before.mission.id);assert.deepEqual(x.transfer.route.allocations.map(a=>a.id),['GCP-IG','PHP-T212']);
    assert.equal(new Set(x.transfer.route.allocations.map(a=>a.id)).size,2);assert.deepEqual(x.transfer.registrationDrafts,[]);
  }
});

test('rolled back state survives serialization and records an audit history entry',()=>{
  const x=W.rollback(stateAt(W.STATUS.READY),'RETURN_TO_DRAFT','operator rebuild','2026-09-03T12:00:00Z');
  const reloaded=JSON.parse(JSON.stringify(x));
  assert.equal(reloaded.mission.status,W.STATUS.DRAFT);assert.equal(reloaded.transfer.route,null);
  assert.deepEqual(reloaded.mission.history.at(-1),{timestamp:'2026-09-03T12:00:00Z',previousStatus:W.STATUS.READY,newStatus:W.STATUS.DRAFT,affectedLegIds:['GCP-IG','PHP-T212'],action:'RETURN_TO_DRAFT',reason:'operator rebuild'});
});
