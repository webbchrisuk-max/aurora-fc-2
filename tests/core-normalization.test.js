'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

function loadCore(rawState){
  const values=new Map([['aurora2:state:v1',JSON.stringify(rawState)]]);
  const localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  const document={addEventListener(){},getElementById(){return null},querySelectorAll(){return []}};
  const window={localStorage,document,location:{pathname:'/transfer.html'},addEventListener(){},dispatchEvent(){}};
  window.window=window;
  const context=vm.createContext({...window,window,globalThis:window,localStorage,document,console,Intl,Date,Math,JSON,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','aurora-core.js'),'utf8'),context);
  return window.Aurora2.core;
}

test('reload normalization preserves canonical mission, leg, and transaction linkage',()=>{
  const raw={schemaVersion:11,mission:{id:'MISSION-1',mission_id:'MISSION-1',status:'PARTIALLY_REGISTERED',legIds:['LEG-1']},transfer:{
    route:{id:'ROUTE-1',missionId:'MISSION-1',allocations:[{id:'LEG-1',legId:'LEG-1',leg_id:'LEG-1',transactionId:'TX-1',ticker:'GCP',account:'IG',amount:100}]},
    registrationDrafts:[{id:'DRAFT-1',routeId:'ROUTE-1',missionId:'MISSION-1',allocationId:'LEG-1',legId:'LEG-1',transactionId:'TX-1',status:'CONFIRMED'}]
  },registration:{receipts:[{id:'RECEIPT-1',routeId:'ROUTE-1',missionId:'MISSION-1',allocationId:'LEG-1',legId:'LEG-1',transactionId:'TX-1'}]}};
  const state=loadCore(raw).read();
  assert.equal(state.mission.id,'MISSION-1');
  assert.deepEqual(Array.from(state.mission.legIds),['LEG-1']);
  assert.equal(state.transfer.route.allocations[0].legId,'LEG-1');
  assert.equal(state.transfer.route.allocations[0].leg_id,'LEG-1');
  assert.equal(state.transfer.route.allocations[0].transactionId,'TX-1');
  assert.equal(state.transfer.registrationDrafts[0].transactionId,'TX-1');
  assert.equal(state.registration.receipts[0].legId,'LEG-1');
});
