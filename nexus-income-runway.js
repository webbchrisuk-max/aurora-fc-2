(function(w){
'use strict';

/*
 * Nexus HQ 4.5 — read-only Income runway summary.
 * It reads the summary owned by Income Runway Intelligence.
 * No Nexus dividend forecast maths lives here.
 */
const A=()=>w.Aurora2;
const $=id=>document.getElementById(id);
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(num(v));
const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};

function summary(){
  try{
    const s=A()?.core?.read?.()||{};
    return s.income?.runwaySummary||A()?.incomeRunway?.summary?.(s)||null;
  }catch(_){return null}
}

function render(){
  const r=summary();
  const status=$('hq45RunwayStatus');
  if(!r){
    set('hq45Confirmed90','—');
    set('hq45Forecast90','—');
    set('hq45Mapped','—');
    set('hq45Unscheduled','—');
    set('hq45RunwayNote','Open Income Centre to initialise the Income-owned dividend runway.');
    if(status)status.textContent='RUNWAY PENDING';
    return;
  }

  set('hq45Confirmed90',money(r.next90ConfirmedGbp));
  set('hq45ConfirmedMeta',`${r.confirmedCount||0} confirmed event${r.confirmedCount===1?'':'s'} in the 12-month runway`);
  set('hq45Forecast90',money(r.next90ForecastGbp));
  set('hq45ForecastMeta',`${r.forecastCount||0} forecast event${r.forecastCount===1?'':'s'} in the 12-month runway`);
  set('hq45Mapped',`${num(r.mappedPct).toFixed(1)}%`);
  set('hq45MappedMeta',`${r.confidence||'LOW'} calendar confidence • ${money(r.scheduledGbp)} dated`);
  set('hq45Unscheduled',money(r.unscheduledAnnualGbp));

  const bar=$('hq45RunwayBar');
  if(bar)bar.style.width=`${Math.max(0,Math.min(100,num(r.mappedPct)))}%`;

  if(status){
    status.textContent=`${r.confidence||'LOW'} • ${num(r.mappedPct).toFixed(0)}% MAPPED`;
  }
  set(
    'hq45RunwayNote',
    num(r.unscheduledAnnualGbp)>0
      ?`${money(r.unscheduledAnnualGbp)} of the canonical forward annual income is still waiting for reliable future payment dates. Nexus will not assign it to fake months.`
      :'The full canonical forward annual income is currently represented by dated confirmed/forecast events.'
  );
}

function start(){
  render();
  window.addEventListener('aurora2:state',()=>setTimeout(render,0));
  window.addEventListener('storage',()=>setTimeout(render,30));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(render,30)});
  [100,500,1300].forEach(ms=>setTimeout(render,ms));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

})(window);
