(function(w){
  'use strict';
  const KEY='aurora2:state:v1';
  const VERSION=1;
  const now=()=>new Date().toISOString();
  const defaultState=()=>({
    schemaVersion:VERSION,
    updatedAt:now(),
    connection:{mode:'foundation',status:'NOT_CONNECTED'},
    portfolio:{teamValue:null,annualIncome:null,monthlyIncome:null,squadSize:null,bestDividendPlayer:null,topAuroraPlayer:null},
    income:{nextDividend:null},
    decision:{title:'Aurora 2.0 foundation ready',note:'No investment decision engine is connected yet.',ticker:null,confidence:null},
    finance:{
      plan:{paydayDate:'',openingCash:0,netPay:0,extraCash:0,billsDue:0,potsDue:0,otherPlanned:0,protectedCash:0,releaseAmount:0},
      lastCalculatedAt:null,
      lastReleasedAt:null
    },
    mission:null,
    alerts:[]
  });
  function object(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
  function safeParse(v){try{return JSON.parse(v)}catch(_){return null}}
  function normalize(raw){
    const d=defaultState(), r=object(raw);
    return {
      ...d,...r,
      connection:{...d.connection,...object(r.connection)},
      portfolio:{...d.portfolio,...object(r.portfolio)},
      income:{...d.income,...object(r.income)},
      decision:{...d.decision,...object(r.decision)},
      finance:{...d.finance,...object(r.finance),plan:{...d.finance.plan,...object(r.finance?.plan)}},
      alerts:Array.isArray(r.alerts)?r.alerts:[]
    };
  }
  function read(){return normalize(safeParse(localStorage.getItem(KEY)))}
  function write(next){const state=normalize({...next,schemaVersion:VERSION,updatedAt:now()});localStorage.setItem(KEY,JSON.stringify(state));w.dispatchEvent(new CustomEvent('aurora2:state',{detail:state}));return state}
  function update(updater){const current=read();const next=typeof updater==='function'?updater(current):{...current,...object(updater)};return write(next)}
  function money(v){return Number.isFinite(Number(v))?new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)):'—'}
  function text(id,value){const el=document.getElementById(id);if(el)el.textContent=value??'—'}
  function escape(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
  function uid(prefix='A2'){return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`}
  function setActiveNav(){
    const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    document.querySelectorAll('.nav a').forEach(a=>{const href=(a.getAttribute('href')||'').toLowerCase();a.classList.toggle('active',href===path)});
  }
  function wireSoon(){document.addEventListener('click',e=>{const a=e.target.closest('[data-soon]');if(!a)return;e.preventDefault();alert((a.getAttribute('data-soon')||'Department')+' 2.0 is reserved and will be built after the audit.');});}
  w.Aurora2=w.Aurora2||{};
  w.Aurora2.core={KEY,VERSION,read,write,update,defaultState,normalize,uid};
  w.Aurora2.ui={money,text,escape};
  document.addEventListener('DOMContentLoaded',()=>{setActiveNav();wireSoon();});
})(window);
