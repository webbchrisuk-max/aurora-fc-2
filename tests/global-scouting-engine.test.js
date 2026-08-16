'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../aurora-scouting-engine.js');

const NOW=Date.parse('2026-08-16T12:00:00Z');
const fresh={price:'2026-08-16T11:00:00Z',fundamentals:'2026-08-01T00:00:00Z',dividends:'2026-08-01T00:00:00Z'};
const security=(ticker,exchange='LSE',extra={})=>({ticker,exchange,name:ticker,country:exchange==='LSE'?'UK':'US',currency:exchange==='LSE'?'GBP':'USD',brokerEligibility:true,...extra});
const evidence=(extra={})=>({price:10,dividendYield:5,dividendSafety:75,businessQuality:70,dividendCoverage:72,dividendGrowth:55,confidence:90,timestamps:fresh,...extra});

test('FTSE 100 and FTSE 250 coexist and overlapping membership is deduplicated',()=>{
  const rows=engine.createRegistry([security('AAA','LSE',{memberships:['FTSE 100']}),security('BBB','LSE',{memberships:['FTSE 250']}),security('AAA','LSE',{memberships:['FTSE 250']})]);
  assert.equal(rows.length,2);
  assert.deepEqual(rows.find(x=>x.ticker==='AAA').memberships,['FTSE 100','FTSE 250']);
});

test('identical tickers on different exchanges do not collide and native currency survives',()=>{
  const rows=engine.createRegistry([security('ABC','LSE'),security('ABC','NASDAQ')]);
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(x=>x.securityId),['LSE:ABC','NASDAQ:ABC']);
  assert.equal(rows[1].currency,'USD');
  assert.deepEqual(engine.convertToGbp(100,'USD',{'USD/GBP':.75}),{nativeAmount:100,nativeCurrency:'USD',fxRate:.75,gbpAmount:75});
  assert.equal(engine.convertToGbp(100,'USD',{}).gbpAmount,null);
});

test('strategy ranking differs when income and sustainability evidence justify it',()=>{
  const securities=[security('HIGH'),security('SAFE')];
  const data={'LSE:HIGH':evidence({dividendYield:9,dividendSafety:42,businessQuality:40,dividendCoverage:40,dividendGrowth:20}),'LSE:SAFE':evidence({dividendYield:4.5,dividendSafety:95,businessQuality:92,dividendCoverage:95,dividendGrowth:90})};
  const max=engine.runPipeline({securities,dataById:data,strategy:'maximum',at:NOW});
  const sustainable=engine.runPipeline({securities,dataById:data,strategy:'sustainable',at:NOW});
  assert.equal(max.deep[0].security.ticker,'HIGH');
  assert.equal(sustainable.deep[0].security.ticker,'SAFE');
});

test('portfolio concentration lowers candidate fit and score',()=>{
  const sec=engine.normalizeSecurity(security('OWNED','LSE',{sector:'Utilities'}));
  const holdings=[{ticker:'OWNED',exchange:'LSE',sector:'Utilities',status:'ACTIVE',marketValueGbp:900},{ticker:'OTHER',exchange:'LSE',sector:'Technology',status:'ACTIVE',marketValueGbp:100}];
  const exposed=engine.portfolioExposure(sec,holdings),newExposure=engine.portfolioExposure(engine.normalizeSecurity(security('NEW','LSE',{sector:'Health'})),holdings);
  assert.equal(exposed.portfolioPct,90);
  assert.ok(engine.score(evidence(),exposed,'sustainable')<engine.score(evidence(),newExposure,'sustainable'));
});

test('stale or missing data remains explicit and cannot become approved',()=>{
  const securities=[security('STALE'),security('MISSING')];
  const result=engine.runPipeline({securities,dataById:{'LSE:STALE':evidence({timestamps:{...fresh,price:'2026-08-10T00:00:00Z'}}),'LSE:MISSING':{}},at:NOW});
  assert.equal(result.fast.filter(x=>x.passed).length,0);
  assert.ok(result.fast[0].reasons.includes('PRICE_NOT_EXECUTION_SAFE'));
  assert.ok(result.fast[1].freshness.missingFields.includes('price'));
  assert.equal(result.approved.length,0);
});
