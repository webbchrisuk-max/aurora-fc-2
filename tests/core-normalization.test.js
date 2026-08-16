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
  return {core:window.Aurora2.core,financialTruth:window.AuroraFinancialTruth};
}

test('reload normalization preserves canonical mission, leg, and transaction linkage',()=>{
  const raw={schemaVersion:11,mission:{id:'MISSION-1',mission_id:'MISSION-1',status:'PARTIALLY_REGISTERED',legIds:['LEG-1']},transfer:{
    route:{id:'ROUTE-1',missionId:'MISSION-1',allocations:[{id:'LEG-1',legId:'LEG-1',leg_id:'LEG-1',transactionId:'TX-1',ticker:'GCP',account:'IG',amount:100}]},
    registrationDrafts:[{id:'DRAFT-1',routeId:'ROUTE-1',missionId:'MISSION-1',allocationId:'LEG-1',legId:'LEG-1',transactionId:'TX-1',status:'CONFIRMED'}]
  },registration:{receipts:[{id:'RECEIPT-1',routeId:'ROUTE-1',missionId:'MISSION-1',allocationId:'LEG-1',legId:'LEG-1',transactionId:'TX-1'}]}};
  const state=loadCore(raw).core.read();
  assert.equal(state.mission.id,'MISSION-1');
  assert.deepEqual(Array.from(state.mission.legIds),['LEG-1']);
  assert.equal(state.transfer.route.allocations[0].legId,'LEG-1');
  assert.equal(state.transfer.route.allocations[0].leg_id,'LEG-1');
  assert.equal(state.transfer.route.allocations[0].transactionId,'TX-1');
  assert.equal(state.transfer.registrationDrafts[0].transactionId,'TX-1');
  assert.equal(state.registration.receipts[0].legId,'LEG-1');
});

test('reload normalization preserves Global Scout identity and Transfer approval evidence',()=>{
  const state=loadCore({scouting:{status:'SCOUTING_READY',approvedBatchId:'GLOBAL-1',targets:[{
    id:'ACTIVE-LSE:UKW',securityId:'LSE:UKW',exchange:'LSE',ticker:'UKW',
    approvedForTransfer:true,approvalBatchId:'GLOBAL-1',approvedAt:'2026-08-16T10:00:00Z',
    transferPermitted:true,eligibilityStatus:'ELIGIBLE',brokerEligibility:{IG:true,T212:false}
  }]}}).core.read();
  const target=state.scouting.targets[0];
  assert.equal(target.securityId,'LSE:UKW');
  assert.equal(target.exchange,'LSE');
  assert.equal(target.ticker,'UKW');
  assert.equal(target.approvedForTransfer,true);
  assert.equal(target.approvalBatchId,'GLOBAL-1');
  assert.equal(target.transferPermitted,true);
  assert.equal(target.eligibilityStatus,'ELIGIBLE');
  assert.deepEqual(JSON.parse(JSON.stringify(target.brokerEligibility)),{IG:true,T212:false});
});

test('reload normalization preserves and deduplicates the canonical Chairman replacement basket',()=>{
  const state=loadCore({scouting:{targets:[
    {securityId:'TSX:BCE',exchange:'TSX',ticker:'BCE'},
    {securityId:'NYSE:VICI',exchange:'NYSE',ticker:'VICI'},
    {securityId:'NYSE:UPS',exchange:'NYSE',ticker:'UPS'}
  ],replacementBasket:['TSX:BCE',{securityId:'NYSE:VICI',exchange:'NYSE',ticker:'VICI'},'NYSE:UPS','TSX:BCE']}}).core.read();
  assert.deepEqual(
    JSON.parse(JSON.stringify(state.scouting.replacementBasket)),
    [
      {securityId:'TSX:BCE',exchange:'TSX',ticker:'BCE'},
      {securityId:'NYSE:VICI',exchange:'NYSE',ticker:'VICI'},
      {securityId:'NYSE:UPS',exchange:'NYSE',ticker:'UPS'}
    ]
  );
});

test('financial truth derives current income from active shares and DPS, not cached totals',()=>{
  const {financialTruth}=loadCore({squad:{holdings:[
    {ticker:'TRIG',account:'IG',status:'ACTIVE',shares:4244.47124543,annualDpsGbp:.0755,annualIncomeGbp:300},
    {ticker:'FALLBACK',account:'T212',status:'LOCKED',shares:10,annualDpsGbp:0,annualIncomeGbp:12.34},
    {ticker:'SOLD',account:'IG',status:'SOLD',shares:10,annualDpsGbp:5,annualIncomeGbp:50},
    {ticker:'ZERO',account:'IG',status:'ACTIVE',shares:0,annualDpsGbp:5,annualIncomeGbp:50}
  ]}});
  const state=financialTruth.getCurrentAnnualIncome();
  assert.equal(Number(state.toFixed(2)),332.8);
});

test('financial truth keeps route uplift projected and never changes current Holdings income',()=>{
  const {financialTruth}=loadCore({squad:{holdings:[
    {ticker:'BASE',account:'IG',status:'ACTIVE',shares:1000,annualDpsGbp:5.18485,annualIncomeGbp:5273.22}
  ]},transfer:{completedStartingIncome:5273.22,completedActualIncome:5356.67}});
  const route={baselineAnnualIncome:5273.22,allocations:[{expectedAnnualIncome:83.45}]};
  assert.equal(financialTruth.getCurrentAnnualIncome(),5184.85);
  assert.equal(financialTruth.getProjectedAnnualIncome(route),5268.3);
});
