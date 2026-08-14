
(function(){
'use strict';

const normName=v=>String(v??'')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g,' ')
  .trim();

function findFundingPot(state,source){
  const key=normName(source);
  if(!key || key==='current account')return null;
  return (state.finance?.pots||[]).find(p=>
    !p.archived && normName(p.name)===key
  )||null;
}

function canonicaliseBillFundingSource(billId){
  const A=window.Aurora2;
  if(!A?.core?.read||!A?.core?.update)return;

  const state=A.core.read();
  const bill=(state.finance?.bills||[]).find(b=>b.id===billId);
  if(!bill || normName(bill.fundingSource)==='current account')return;

  const pot=findFundingPot(state,bill.fundingSource);
  if(!pot || pot.name===bill.fundingSource)return;

  A.core.update(s=>({
    ...s,
    finance:{
      ...s.finance,
      bills:(s.finance?.bills||[]).map(b=>
        b.id===billId
          ? {...b,fundingSource:pot.name,updatedAt:new Date().toISOString()}
          : b
      )
    }
  }));
}

function verifyCompletedPayment(billId,startedAt){
  const A=window.Aurora2;
  if(!A?.core?.read||!A?.core?.update)return;

  const state=A.core.read();
  const payments=(state.finance?.payments||[])
    .filter(p=>p.billId===billId && !p.reversed)
    .sort((a,b)=>new Date(b.paidAt||0)-new Date(a.paidAt||0));

  const payment=payments[0];
  if(!payment)return;

  const paidAt=new Date(payment.paidAt||0).getTime();
  if(!Number.isFinite(paidAt) || paidAt<startedAt-1000)return;

  // finance.js already completed the normal deduction if beforePot exists.
  if(payment.beforePot)return;

  const source=payment.fundingSource;
  if(normName(source)==='current account')return;

  const pot=findFundingPot(state,source);
  if(!pot)return;

  const actual=Math.max(0,Number(payment.amount)||0);
  if(actual<=0)return;

  const currentBalance=Math.max(0,Number(pot.balance)||0);
  if(actual>currentBalance+0.005)return;

  // Safety fallback for old/imported funding-source labels:
  // make the missing pot deduction and preserve beforePot so Undo restores it.
  A.core.update(s=>{
    const pots=[...(s.finance?.pots||[])];
    const payments=[...(s.finance?.payments||[])];

    const pidx=pots.findIndex(p=>p.id===pot.id);
    const payidx=payments.findIndex(p=>p.id===payment.id);
    if(pidx<0||payidx<0||payments[payidx].beforePot)return s;

    const beforePot={...pots[pidx]};
    const nextSpent=beforePot.goalMode==='funded-progress'
      ? (Number(beforePot.spent)||0)+actual
      : (Number(beforePot.spent)||0);

    pots[pidx]={
      ...beforePot,
      balance:Math.max(0,(Number(beforePot.balance)||0)-actual),
      spent:nextSpent,
      updatedAt:new Date().toISOString()
    };

    payments[payidx]={
      ...payments[payidx],
      fundingSource:beforePot.name,
      beforePot,
      potRepairApplied:true
    };

    return {
      ...s,
      finance:{...s.finance,pots,payments}
    };
  });
}

// Capture phase runs before finance.js's normal bill-completion handler.
// The existing Finance engine still owns completion, recurrence and history.
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-bill-complete]');
  if(!button)return;

  const billId=button.dataset.billComplete;
  if(!billId)return;

  const startedAt=Date.now();
  canonicaliseBillFundingSource(billId);

  // After Finance has processed the click, verify the named pot was reached.
  setTimeout(()=>verifyCompletedPayment(billId,startedAt),0);
},true);

function activateFinanceTab(id){
  const button=document.querySelector(`[data-tab="${id}"]`);
  if(button){button.click();return}
  document.querySelectorAll('.tab-panel').forEach(
    p=>p.classList.toggle('active',p.id===id)
  );
  document.querySelectorAll('.finance-tabs .tab').forEach(
    b=>b.classList.toggle('active',b.dataset.tab===id)
  );
}

document.addEventListener('click',event=>{
  const target=event.target.closest('[data-finance-tab]');
  if(!target)return;
  event.preventDefault();
  activateFinanceTab(target.dataset.financeTab);
  requestAnimationFrame(()=>window.scrollTo({
    top:Math.max(0,document.querySelector('.finance-tabs')?.offsetTop||0),
    behavior:'smooth'
  }));
});

document.addEventListener('DOMContentLoaded',()=>{
  const label=document.getElementById('currentDepartment');
  if(label)label.textContent='FINANCE COMMAND';
});
})();
