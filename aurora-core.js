(function(w){
  'use strict';
  const KEY='aurora2:state:v1';
  const VERSION=2;
  const now=()=>new Date().toISOString();

  const defaultState=()=>({
    schemaVersion:VERSION,
    updatedAt:now(),
    connection:{mode:'foundation',status:'NOT_CONNECTED'},
    portfolio:{
      teamValue:null,annualIncome:null,monthlyIncome:null,squadSize:null,
      bestDividendPlayer:null,topAuroraPlayer:null
    },
    income:{nextDividend:null},
    decision:{
      title:'Aurora 2.0 foundation ready',
      note:'No investment decision engine is connected yet.',
      ticker:null,confidence:null
    },
    finance:{
      plan:{
        paydayDate:'',openingCash:0,netPay:0,extraCash:0,
        billsDue:0,potsDue:0,otherPlanned:0,protectedCash:0,releaseAmount:0
      },
      pots:[],
      bills:[],
      payments:[],
      lastCalculatedAt:null,
      lastReleasedAt:null
    },
    mission:null,
    alerts:[]
  });

  function object(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
  function safeParse(v){try{return JSON.parse(v)}catch(_){return null}}
  function normalizePot(p){
    const r=object(p);
    return {
      id:String(r.id||''),
      name:String(r.name||'Untitled pot'),
      balance:Math.max(0,Number(r.balance)||0),
      target:Math.max(0,Number(r.target)||0),
      fundingPerPayday:Math.max(0,Number(r.fundingPerPayday)||0),
      priority:[1,2,3].includes(Number(r.priority))?Number(r.priority):2,
      goalMode:r.goalMode==='funded-progress'?'funded-progress':'balance',
      spent:Math.max(0,Number(r.spent)||0),
      archived:Boolean(r.archived),
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }
  function normalizeBill(b){
    const r=object(b);
    const allowed=['one-off','weekly','4-weeks','5-weeks','monthly','yearly'];
    return {
      id:String(r.id||''),
      name:String(r.name||'Untitled bill'),
      amount:Math.max(0,Number(r.amount)||0),
      due:String(r.due||''),
      frequency:allowed.includes(r.frequency)?r.frequency:'one-off',
      fundingSource:String(r.fundingSource||'Current Account'),
      category:String(r.category||'Other'),
      included:r.included!==false,
      paid:Boolean(r.paid),
      archived:Boolean(r.archived),
      actualPaid:Math.max(0,Number(r.actualPaid)||0),
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }
  function normalizePayment(p){
    const r=object(p);
    return {
      id:String(r.id||''),
      billId:String(r.billId||''),
      billName:String(r.billName||'Payment'),
      amount:Math.max(0,Number(r.amount)||0),
      fundingSource:String(r.fundingSource||'Current Account'),
      paidAt:r.paidAt||now(),
      dueAtPayment:String(r.dueAtPayment||''),
      reversed:Boolean(r.reversed),
      reversedAt:r.reversedAt||null,
      beforeBill:object(r.beforeBill),
      beforePot:r.beforePot?object(r.beforePot):null
    };
  }

  function normalize(raw){
    const d=defaultState(), r=object(raw), rf=object(r.finance);
    return {
      ...d,...r,
      schemaVersion:VERSION,
      connection:{...d.connection,...object(r.connection)},
      portfolio:{...d.portfolio,...object(r.portfolio)},
      income:{...d.income,...object(r.income)},
      decision:{...d.decision,...object(r.decision)},
      finance:{
        ...d.finance,...rf,
        plan:{...d.finance.plan,...object(rf.plan)},
        pots:Array.isArray(rf.pots)?rf.pots.map(normalizePot):[],
        bills:Array.isArray(rf.bills)?rf.bills.map(normalizeBill):[],
        payments:Array.isArray(rf.payments)?rf.payments.map(normalizePayment):[]
      },
      alerts:Array.isArray(r.alerts)?r.alerts:[]
    };
  }

  function read(){return normalize(safeParse(localStorage.getItem(KEY)))}
  function write(next){
    const state=normalize({...next,schemaVersion:VERSION,updatedAt:now()});
    localStorage.setItem(KEY,JSON.stringify(state));
    w.dispatchEvent(new CustomEvent('aurora2:state',{detail:state}));
    return state;
  }
  function update(updater){
    const current=read();
    const next=typeof updater==='function'?updater(current):{...current,...object(updater)};
    return write(next);
  }
  function money(v){
    return Number.isFinite(Number(v))
      ? new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v))
      : '—';
  }
  function text(id,value){const el=document.getElementById(id);if(el)el.textContent=value??'—'}
  function escape(s){
    return String(s??'').replace(/[&<>"']/g,m=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[m]));
  }
  function uid(prefix='A2'){
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  }
  function setActiveNav(){
    const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    document.querySelectorAll('.nav a').forEach(a=>{
      const href=(a.getAttribute('href')||'').toLowerCase();
      a.classList.toggle('active',href===path);
    });
  }
  function wireSoon(){
    document.addEventListener('click',e=>{
      const a=e.target.closest('[data-soon]');
      if(!a)return;
      e.preventDefault();
      alert((a.getAttribute('data-soon')||'Department')+' 2.0 is reserved and will be built after the audit.');
    });
  }

  w.Aurora2=w.Aurora2||{};
  w.Aurora2.core={KEY,VERSION,read,write,update,defaultState,normalize,uid};
  w.Aurora2.ui={money,text,escape};
  document.addEventListener('DOMContentLoaded',()=>{setActiveNav();wireSoon();});
})(window);
