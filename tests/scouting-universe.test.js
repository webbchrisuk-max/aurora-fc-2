'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const universe=require('../scouting-universe.js');

test('canonical security identity deduplicates overlapping index membership',()=>{
  const rows=universe.merge([
    {ticker:'III.L',exchange:'LSE',region:'UK',name:'3i',memberships:['FTSE 100']},
    {ticker:'III',exchange:'LSE',region:'UK',name:'3i Group',memberships:['FTSE 250']}
  ]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].securityId,'LSE:III');
  assert.deepEqual(rows[0].memberships,['FTSE 100','FTSE 250']);
});

test('same ticker on different markets remains separate',()=>{
  const rows=universe.merge([
    {ticker:'ABC',exchange:'LSE',region:'UK'},
    {ticker:'ABC',exchange:'US',region:'US'}
  ]);
  assert.deepEqual(rows.map(x=>x.securityId),['LSE:ABC','US:ABC']);
});

test('coverage separates index membership, additional income and missing data',()=>{
  const rows=universe.merge([
    {ticker:'A',exchange:'LSE',region:'UK',memberships:['FTSE 100'],dataStatus:'MISSING'},
    {ticker:'B',exchange:'LSE',region:'UK',memberships:['FTSE 250'],dataStatus:'AVAILABLE'},
    {ticker:'C',exchange:'LSE',region:'UK',memberships:[],dataStatus:'AVAILABLE'},
    {ticker:'D',exchange:'US',region:'US',memberships:['S&P 500'],dataStatus:'MISSING'},
    {ticker:'E',exchange:'TSX',region:'WORLD',memberships:[],dataStatus:'AVAILABLE'}
  ]);
  assert.deepEqual(universe.coverage(rows),{total:5,UK:3,US:1,EUROPE:0,CANADA:0,AUSTRALIA:0,OTHER:1,
    WORLD:1,ftse100:1,ftse250:1,ukIncome:1,missingData:2});
});

test('supported membership sources cover every reported market bucket',()=>{
  assert.deepEqual(universe.MEMBERSHIP_SOURCES.map(x=>x.id),[
    'FTSE_100','FTSE_250','SP_500','STOXX_600','TSX_COMPOSITE','ASX_200','NIKKEI_225'
  ]);
});

test('approval candidates use canonical identity and do not add strategy scores',()=>{
  const rows=[
    {id:'sustainable-copy',securityId:'LSE:III',status:'pass',sustainableScore:80},
    {id:'maximum-copy',securityId:'LSE:III',status:'caution',maximumScore:91},
    {id:'different-venue',exchange:'US',ticker:'III',status:'pass'},
    {id:'blocked',securityId:'LSE:NG',status:'block'},
    {id:'approved',securityId:'LSE:SHEL',status:'pass',approvedForTransfer:true}
  ];
  assert.deepEqual(universe.approvalCandidates(rows).map(x=>x.id),['sustainable-copy','different-venue']);
});
