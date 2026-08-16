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
  assert.deepEqual(universe.coverage(rows),{total:5,UK:3,US:1,WORLD:1,ftse100:1,ftse250:1,ukIncome:1,missingData:2});
});
