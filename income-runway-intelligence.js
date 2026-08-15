(function(w){
'use strict';

/*
 * Aurora 2.0 — Income Runway Intelligence v1
 *
 * Ownership:
 *   Income owns this summary.
 *   Nexus may read state.income.runwaySummary but must not calculate a rival one.
 *
 * Truth policy:
 *   - Dated calendar events are either CONFIRMED or FORECAST.
 *   - No missing dividend is assigned a fake month/date.
 *   - Forward annual income not represented by a dated future event remains UNSCHEDULED.
 */
const A=()=>w.Aurora2;
const arr=v=>Array.isArray(v)?v:[];
const num=v=>{const n=Number(String(v??'').replace(/[£,%]/g,'').replace(/,/g,''));return Number.isFinite(n)?n:0};
const tk=v=>String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();
let publishing=false;

function parseDate(v){
  if(!v)return null;
  const raw=String(v).trim();
  let d;
  if(/^\d{4}-\d{2}-\d{2}/.test(raw))d=new Date(`${raw.slice(0,10)}T12:00:00`);
  else d=new Date(raw);
  return Number.isNaN(d.getTime())?null:d;
}
function dateISO(d){
  if(!(d instanceof Date)||Number.isNaN(d.getTime()))return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function monthKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function statusKind(v){
  const s=String(v||'FORECAST').toUpperCase();
  if(['CONFIRMED','ANNOUNCED'].includes(s))return 'CONFIRMED';
  return 'FORECAST';
}
function eventAmount(e){
  const actual=num(e?.actualAmountGbp),expected=num(e?.expectedAmountGbp);
  return actual>0?actual:Math.max(0,expected);
}
function stable(obj){
  const copy=JSON.parse(JSON.stringify(obj||{}));
  delete copy.updatedAt;
  return JSON.stringify(copy);
}

function summary(state=A()?.core?.read?.()||{}){
  const now=new Date();now.setHours(0,0,0,0);
  const horizonEnd=new Date(now.getTime());
  horizonEnd.setMonth(horizonEnd.getMonth()+12);

  // Income-owned published run-rate. Never recompute an alternative annual answer here.
  const priorAnnual=num(state.income?.runwaySummary?.annualIncomeGbp);
  const annualIncome=Math.max(0,num(state.portfolio?.annualIncome)||priorAnnual);

  const months=[];
  const first=new Date(now.getFullYear(),now.getMonth(),1,12,0,0,0);
  for(let i=0;i<12;i++){
    const d=new Date(first.getFullYear(),first.getMonth()+i,1,12,0,0,0);
    months.push({
      key:monthKey(d),
      year:d.getFullYear(),
      month:d.getMonth(),
      label:d.toLocaleDateString('en-GB',{month:'short'}),
      confirmedGbp:0,
      forecastGbp:0,
      totalGbp:0,
      confirmedCount:0,
      forecastCount:0
    });
  }
  const monthMap=new Map(months.map(x=>[x.key,x]));

  let confirmed=0,forecast=0,confirmedCount=0,forecastCount=0;
  let next90Confirmed=0,next90Forecast=0,receivedYtd=0;
  const nowYear=now.getFullYear();
  const in90=new Date(now.getTime()+90*86400000);
  let nextConfirmed=null,nextForecast=null;

  arr(state.income?.calendar).forEach(e=>{
    const status=String(e?.status||'FORECAST').toUpperCase();
    if(['CANCELLED','ARCHIVED'].includes(status))return;

    const amount=eventAmount(e);
    const pay=parseDate(e?.payDate);

    if(status==='PAID'){
      if(pay&&pay.getFullYear()===nowYear)receivedYtd+=amount;
      return;
    }

    // A future runway event must have a real recorded payment date.
    if(!pay||pay<now||pay>=horizonEnd)return;

    const kind=statusKind(status);
    const m=monthMap.get(monthKey(pay));
    if(!m)return;

    if(kind==='CONFIRMED'){
      confirmed+=amount;confirmedCount++;
      m.confirmedGbp+=amount;m.confirmedCount++;
      if(pay<=in90)next90Confirmed+=amount;
      if(!nextConfirmed||pay<nextConfirmed.__date)nextConfirmed={...e,__date:pay,amountGbp:amount};
    }else{
      forecast+=amount;forecastCount++;
      m.forecastGbp+=amount;m.forecastCount++;
      if(pay<=in90)next90Forecast+=amount;
      if(!nextForecast||pay<nextForecast.__date)nextForecast={...e,__date:pay,amountGbp:amount};
    }
    m.totalGbp+=amount;
  });

  const scheduled=confirmed+forecast;
  const unscheduled=Math.max(0,annualIncome-scheduled);
  const mappedPct=annualIncome>0?Math.min(100,scheduled/annualIncome*100):0;
  const confidence=mappedPct>=80?'HIGH':mappedPct>=40?'BUILDING':'LOW';

  const cleanEvent=e=>e?{
    ticker:tk(e.ticker),
    name:e.name||e.ticker||'',
    account:e.account||'',
    payDate:dateISO(e.__date),
    amountGbp:Number(num(e.amountGbp).toFixed(2)),
    status:statusKind(e.status)
  }:null;

  return {
    version:1,
    horizonMonths:12,
    horizonStart:dateISO(now),
    horizonEnd:dateISO(horizonEnd),
    annualIncomeGbp:Number(annualIncome.toFixed(2)),
    confirmedGbp:Number(confirmed.toFixed(2)),
    forecastGbp:Number(forecast.toFixed(2)),
    scheduledGbp:Number(scheduled.toFixed(2)),
    unscheduledAnnualGbp:Number(unscheduled.toFixed(2)),
    mappedPct:Number(mappedPct.toFixed(2)),
    confidence,
    confirmedCount,
    forecastCount,
    next90ConfirmedGbp:Number(next90Confirmed.toFixed(2)),
    next90ForecastGbp:Number(next90Forecast.toFixed(2)),
    receivedYtdGbp:Number(receivedYtd.toFixed(2)),
    nextConfirmed:cleanEvent(nextConfirmed),
    nextForecast:cleanEvent(nextForecast),
    months:months.map(m=>({
      ...m,
      confirmedGbp:Number(m.confirmedGbp.toFixed(2)),
      forecastGbp:Number(m.forecastGbp.toFixed(2)),
      totalGbp:Number(m.totalGbp.toFixed(2))
    }))
  };
}

function publish(){
  if(publishing||!A()?.core?.read||!A()?.core?.update)return;
  const state=A().core.read();
  const next=summary(state);
  const old=state.income?.runwaySummary||null;
  if(stable(old)===stable(next))return;

  publishing=true;
  try{
    A().core.update(s=>({
      ...s,
      income:{
        ...s.income,
        runwaySummary:{...next,updatedAt:new Date().toISOString()}
      }
    }));
  }finally{
    publishing=false;
  }
}

function start(){
  publish();
  setTimeout(publish,250);
  setTimeout(publish,1000);
  w.addEventListener('aurora2:state',()=>{if(!publishing)setTimeout(publish,0)});
  w.addEventListener('storage',e=>{if(e.key?.includes('aurora2'))setTimeout(publish,20)});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(publish,20)});
}

w.Aurora2=w.Aurora2||{};
w.Aurora2.incomeRunway={summary,publish};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

})(window);
