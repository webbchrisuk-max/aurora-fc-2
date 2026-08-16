'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

function loadBrowserModule(file){
  const document={
    addEventListener(){},
    getElementById(){return null},
    querySelectorAll(){return []}
  };
  const window={document,addEventListener(){},Aurora2:{
    core:{read(){return {}}},
    ui:{escape:value=>String(value),money:value=>`£${Number(value).toFixed(2)}`}
  }};
  window.window=window;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{
    window,document,Date,Math,Number,String,Array,Set,Map,setTimeout(){},clearTimeout(){}
  });
  return window.Aurora2;
}

test('Portfolio Preview adds proposed Transfer income to canonical current income',()=>{
  const transfer=loadBrowserModule('transfer.js').transferEngine;
  const state={
    portfolio:{annualIncome:5273.22},
    squad:{holdings:[
      {ticker:'BASE',account:'IG',status:'ACTIVE',shares:1,marketValueGbp:62500}
    ]},
    transfer:{route:{
      baselineAnnualIncome:0,
      financeBudget:820,
      allocations:[
        {ticker:'A',account:'IG',amount:325,expectedAnnualIncome:33.45},
        {ticker:'B',account:'Trading 212',amount:495,expectedAnnualIncome:50}
      ]
    }}
  };

  const preview=transfer.portfolioPreview(state);

  assert.equal(preview.currentAnnualIncome,5273.22);
  assert.equal(preview.totals.income,83.45);
  assert.equal(preview.projectedAnnualIncome,5356.67);
  assert.equal(Number((preview.currentAnnualIncome/12).toFixed(2)),439.44);
  assert.equal(Number((preview.projectedAnnualIncome/12).toFixed(2)),446.39);
  assert.equal(Number(preview.projectedIncomeYield.toFixed(2)),8.46);
});

test('Income Centre suppresses estimated Transfer income for a completed mission',()=>{
  const income=loadBrowserModule('income.js').income;
  const completed={
    mission:{status:'COMPLETE'},
    transfer:{route:{status:'LOCKED',expectedAnnualIncome:83.45}}
  };
  assert.equal(income.activeTransferIncome(completed),0);
  assert.equal(income.activeTransferIncome({
    mission:{status:'LOCKED'},
    transfer:{route:{status:'LOCKED',expectedAnnualIncome:83.45}}
  }),83.45);
});
