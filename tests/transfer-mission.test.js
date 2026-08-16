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
