const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function loadEngine(){
  const window={Aurora2:{}};window.window=window;
  vm.runInNewContext(fs.readFileSync('transfer-engine.js','utf8'),{window,console,Date,Math,Set,Map});
  return window.Aurora2.transferEngine;
}
function loadChairman(state,engine){
  const document={getElementById(){return null},querySelectorAll(){return []},addEventListener(){}};
  const window={document,location:{search:''},addEventListener(){},Aurora2:{
    transferEngine:engine,core:{read:()=>state,update(){throw new Error('unexpected mutation')}},
    ui:{escape:v=>String(v),money:v=>`£${Number(v).toFixed(2)}`}
  }};window.window=window;
  vm.runInNewContext(fs.readFileSync('club-control.js','utf8'),{window,document,location:window.location,console,Date,Math,Set,Map,URLSearchParams,setTimeout,clearTimeout});
  return window.Aurora2.clubControl;
}
function fixture(status='pass'){
  const candidate=(securityId,ticker,yieldPct,sustainableScore,maximumScore,brokerEligibility={IG:true})=>({securityId,exchange:'LSE',ticker,name:ticker,yieldPct,livePriceGbp:10,status,transferPermitted:true,brokerEligibility,sustainableScore,maximumScore,sector:ticker==='A'?'Infrastructure':'Utilities'});
  return {updatedAt:'2026-08-16T00:00:00Z',scouting:{replacementBasket:[{securityId:'LSE:A'},{securityId:'LSE:B'},{securityId:'LSE:BLOCK'}],targets:[
    candidate('LSE:A','A',7,100,10),candidate('LSE:B','B',9,10,100),candidate('LSE:BLOCK','BLOCK',8,90,90,{IG:false,T212:false})
  ]},transfer:{settings:{minAllocation:250,increment:25,maxPositionPct:20}},mission:{id:'REAL',status:'DRAFT'},finance:{cash:1234},squad:{holdings:[
    {id:'SALE',securityId:'LSE:OLD',ticker:'OLD',account:'IG',status:'ACTIVE',shares:1000,livePriceGbp:10,bookCostGbp:8000,annualDpsGbp:.4,sector:'Utilities'},
    {id:'CORE',securityId:'LSE:CORE',ticker:'CORE',account:'IG',status:'ACTIVE',shares:1000,livePriceGbp:20,bookCostGbp:18000,annualDpsGbp:.5,sector:'Utilities'}
  ]}};
}

test('Chairman v0.3 strategy simulations remain independent and comparison maths is derived from each route',()=>{
  const state=fixture(),engine=loadEngine(),chair=loadChairman(state,engine);
  const h=state.squad.holdings[0],scenario={cashReleased:10000,incomeSurrendered:400,fraction:1};
  const rows=chair.strategyComparison(state,h,scenario);
  const sustainable=rows.find(r=>r.name==='sustainable'),maximum=rows.find(r=>r.name==='maximum');
  assert.equal(sustainable.sim.strategy,'sustainable');assert.equal(maximum.sim.strategy,'maximum');
  assert.notEqual(sustainable.sim,maximum.sim);
  assert.notEqual(sustainable.sim.allocations.find(row=>row.securityId==='LSE:A').scoutingScore,maximum.sim.allocations.find(row=>row.securityId==='LSE:A').scoutingScore);
  for(const row of rows){
    assert.equal(row.netAnnual,row.replacementIncome-400);
    assert.equal(row.netMonthly,row.netAnnual/12);
    assert.equal(row.deployed+row.holdback,10000);
    assert.equal(row.holdings,row.sim.allocations.filter(a=>a.amount>0).length);
  }
});

test('custom selected, executable, allocated and blocked states distinguish executable zero allocations',()=>{
  const state=fixture(),engine=loadEngine(),chair=loadChairman(state,engine);
  const selected=engine.resolveReplacementBasket(state,state.scouting.replacementBasket.map(x=>x.securityId));
  const sim=engine.simulate(state,{budget:250,targetIds:state.scouting.replacementBasket.map(x=>x.securityId),allowActiveScouting:true,minAllocation:250,maxTargets:1});
  assert.deepEqual(JSON.parse(JSON.stringify(chair.basketStatus(selected,sim))),{selected:3,executable:2,allocated:1,blocked:1});
  const source=fs.readFileSync('club-control.js','utf8');
  assert.match(source,/SELECTED • EXECUTABLE • NOT ALLOCATED/);assert.doesNotMatch(source,/INCLUDED IN SIMULATION|purchased/i);
  assert.equal(sim.allocations.length,1,'a blocked candidate does not kill the valid allocation');
});

test('CAUTION caps verdict while PASS allows the existing strong economics verdict',()=>{
  const state=fixture(),engine=loadEngine(),chair=loadChairman(state,engine);
  const base={holding:state.squad.holdings[0],metrics:{profitPct:12,profit:2000,value:10000},mat:{micro:false},scenario:{cashReleased:10000,incomeSurrendered:400,fraction:1,profitRealised:2000},exEvent:null,concentration:null};
  const caution=chair.buildVerdict({...base,sim:{income:600,allocations:[{scoutingStatus:'caution'}]}});
  const pass=chair.buildVerdict({...base,sim:{income:600,allocations:[{scoutingStatus:'pass'}]}});
  assert.equal(caution.title,'REVIEW');assert.equal(pass.title,'STRONG ROTATION');
});

test('allocation percentages reconcile to deployed cash and concentration uses the canonical snapshot',()=>{
  const state=fixture(),engine=loadEngine();
  const context={holdingId:'SALE',ticker:'OLD',account:'IG',saleFraction:1};
  const sim=engine.simulate(state,{budget:10000,strategy:'sustainable',allowActiveScouting:true,rotationContext:context});
  const pct=sim.allocations.reduce((sum,row)=>sum+row.amount/10000*100,0);
  assert.ok(Math.abs(pct-(sim.allocated/10000*100))<1e-9);
  const snapshot=engine.concentrationSnapshot(state,context,sim.allocations);
  assert.equal(snapshot.after.total,snapshot.before.total+sim.allocated-10000);
  assert.match(fs.readFileSync('club-control.js','utf8'),/data\.concentration/);
});

test('Chairman comparisons and verdicts do not mutate portfolio, mission or Finance state',()=>{
  const state=fixture(),before=JSON.stringify(state),engine=loadEngine(),chair=loadChairman(state,engine);
  const h=state.squad.holdings[0],scenario={cashReleased:10000,incomeSurrendered:400,fraction:1};
  chair.strategyComparison(state,h,scenario);
  chair.buildVerdict({holding:h,metrics:{profitPct:7},mat:{micro:false},scenario:{...scenario,profitRealised:1},sim:{income:500,allocations:[{scoutingStatus:'pass'}]},exEvent:null,concentration:null});
  assert.equal(JSON.stringify(state),before);
  assert.equal(state.mission.id,'REAL');assert.equal(state.finance.cash,1234);
});
