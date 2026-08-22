const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function loadLadder(){
  const document={
    readyState:'loading',
    addEventListener(){},querySelector(){return null},getElementById(){return null},
    createElement(){return {dataset:{},style:{}}},head:{appendChild(){}}
  };
  const state={scouting:{replacementBasket:[]},transfer:{settings:{minAllocation:250,increment:25}}};
  const engine={
    simulate(_state,options){
      return {allocations:[{amount:options.budget,scoutingStatus:'pass'}],allocated:options.budget,income:options.budget*.08,remaining:0};
    },
    concentrationSnapshot(){return {before:{largestTickerPct:20},after:{largestTickerPct:20}}}
  };
  const window={document,setTimeout:fn=>fn(),addEventListener(){},Aurora2:{
    core:{read:()=>state},transferEngine:engine,
    ui:{money:v=>`£${Number(v).toFixed(2)}`,escape:v=>String(v)},
    clubControl:{buildVerdict:({metrics})=>({code:metrics.profitPct>=10?'strong':'review',title:metrics.profitPct>=10?'STRONG ROTATION':'REVIEW',reason:'fixture'})}
  }};
  window.window=window;
  vm.runInNewContext(fs.readFileSync('chairman-offer-ladder.js','utf8'),{window,console,Date,Math,Set,Map});
  return {ladder:window.Aurora2.chairmanOfferLadder,state};
}

const near=(a,b)=>Math.abs(a-b)<1e-9;
const metrics={shares:100,avg:8,book:800,price:9,value:900,income:40,profit:100,profitPct:12.5};

test('Chairman v0.4 offer lines are derived from canonical average cost and live price',()=>{
  const {ladder}=loadLadder();
  const rows=ladder.offerPoints(metrics);
  assert.equal(rows.length,3);
  assert.ok(near(rows[0].price,8.48));
  assert.ok(near(rows[1].price,9));
  assert.ok(near(rows[2].price,8.8));
  assert.equal(rows.map(row=>row.id).join(','),'review,live,strong');
});

test('offer-price scenario respects selected sale fraction and proportional income surrender',()=>{
  const {ladder}=loadLadder();
  const scenario=ladder.offerScenario(metrics,.5,8.8);
  assert.equal(scenario.sharesSold,50);
  assert.equal(scenario.sharesRemaining,50);
  assert.ok(near(scenario.cashReleased,440));
  assert.ok(near(scenario.bookReleased,400));
  assert.ok(near(scenario.profitRealised,40));
  assert.ok(near(scenario.incomeSurrendered,20));
});

test('each offer line reruns Transfer against that exact cash value without mutating state',()=>{
  const {ladder,state}=loadLadder();
  const before=JSON.stringify(state);
  const data={holding:{id:'H',ticker:'OLD',account:'IG',status:'ACTIVE'},metrics,mat:{micro:false},scenario:{fraction:.5},exEvent:null};
  const rows=ladder.buildOfferLadder(state,data,'sustainable');
  assert.equal(rows.length,3);
  assert.ok(near(rows[0].scenario.cashReleased,424));
  assert.ok(near(rows[0].replacementIncome,33.92));
  assert.ok(near(rows[0].coverage,169.6));
  assert.equal(rows[2].verdict.title,'STRONG ROTATION');
  assert.equal(JSON.stringify(state),before);
});

test('live offer zone preserves locked and micro guardrails before profit thresholds',()=>{
  const {ladder}=loadLadder();
  const base={holding:{status:'ACTIVE'},metrics:{profitPct:12},mat:{micro:false}};
  assert.equal(ladder.liveZone(base).label,'STRONG REVIEW');
  assert.equal(ladder.liveZone({...base,metrics:{profitPct:7}}).label,'REVIEW OPEN');
  assert.equal(ladder.liveZone({...base,mat:{micro:true}}).label,'MICRO');
  assert.equal(ladder.liveZone({...base,holding:{status:'LOCKED'}}).label,'LOCKED');
});
