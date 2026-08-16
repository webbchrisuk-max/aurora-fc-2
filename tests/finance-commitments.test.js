'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
function load(raw){
  const values=new Map([['aurora2:state:v1',JSON.stringify(raw)]]);
  const elements=new Map();
  const localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  const document={addEventListener(){},querySelectorAll(){return []},querySelector(){return null},getElementById(id){return elements.get(id)||null}};
  const window={document,localStorage,location:{pathname:'/finance.html'},addEventListener(){},dispatchEvent(){}};window.window=window;
  class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail}}
  const context=vm.createContext({window,globalThis:window,document,localStorage,console,Intl,Date,Math,JSON,CustomEvent,setTimeout,clearTimeout,alert(){},confirm(){return true}});
  vm.runInContext(fs.readFileSync(path.join(root,'aurora-core.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'finance.js'),'utf8'),context);
  return {window,elements,state:()=>window.Aurora2.core.read()};
}
function bill(type,due='',extra={}){return {id:'B1',name:'Haircut',amount:25,due,commitmentType:type,frequency:type==='recurring_yearly'?'yearly':type==='one_off'?'one-off':'monthly',included:true,fundingSource:'Current Account',...extra}}

test('canonical migration preserves history and converts undated monthly bills to rolling monthly',()=>{
  const app=load({finance:{bills:[{id:'B1',name:'Haircut',amount:25,frequency:'monthly',due:''}],payments:[{id:'P0',billId:'B1',billName:'Haircut',amount:20,paidAt:'2025-01-01T12:00:00Z'}]}});
  assert.equal(app.state().finance.bills[0].commitmentType,'rolling_monthly');
  assert.equal(app.state().finance.bills[0].due,'');
  assert.equal(app.state().finance.payments.length,1);
});

test('fixed monthly and yearly commitments advance by the correct calendar interval',()=>{
  const app=load({finance:{bills:[bill('fixed_monthly','2026-01-31')],payments:[]}});
  app.window.Aurora2.financeCommitmentControl.completeBill('B1');
  assert.equal(app.state().finance.bills[0].due,'2026-02-28');
  const yearly=load({finance:{bills:[bill('recurring_yearly','2024-02-29')],payments:[]}});
  yearly.window.Aurora2.financeCommitmentControl.completeBill('B1');
  assert.equal(yearly.state().finance.bills[0].due,'2025-02-28');
});

test('rolling monthly payment records one occurrence, advances one month, and never becomes overdue',()=>{
  const month=new Date().toISOString().slice(0,7);
  const app=load({finance:{bills:[bill('rolling_monthly','',{occurrenceMonth:month})],payments:[]}});
  app.window.Aurora2.financeCommitmentControl.completeBill('B1');
  const state=app.state(), next=state.finance.bills[0];
  assert.equal(state.finance.payments.length,1);
  assert.equal(state.finance.payments[0].occurrenceKey,month);
  assert.equal(next.due,'');
  assert.equal(app.window.Aurora2.financeCommitmentControl.billStatus(next).label,'Next month');
  // Reload/cloud normalization does not manufacture a second bill or payment.
  const reload=load(state).state();
  assert.equal(reload.finance.bills.length,1);
  assert.equal(reload.finance.payments.length,1);
});

test('one-off payment moves to history without regenerating',()=>{
  const app=load({finance:{bills:[bill('one_off','2026-08-16')],payments:[]}});
  app.window.Aurora2.financeCommitmentControl.completeBill('B1');
  assert.equal(app.state().finance.bills[0].paid,true);
  assert.equal(app.state().finance.payments.length,1);
});

test('Next 5 markup exposes immediate Mark as Paid and Edit actions',()=>{
  const source=fs.readFileSync(path.join(root,'finance-ui.js'),'utf8');
  assert.match(source,/data-bill-complete=.*Mark as Paid/);
  assert.match(source,/data-bill-edit=/);
  assert.match(source,/Due this month/);
});
