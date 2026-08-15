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


function incomeHistory(){
  try{
    const s=A()?.core?.read?.()||{};
    return (Array.isArray(s.income?.history)?s.income.history:[])
      .map(x=>({
        at:new Date(x?.at||0),
        annual:num(x?.annualIncome),
        monthly:num(x?.monthlyIncome)||num(x?.annualIncome)/12,
        reason:String(x?.reason||'Forward income changed')
      }))
      .filter(x=>Number.isFinite(x.at.getTime())&&x.annual>=0)
      .sort((a,b)=>a.at-b.at);
  }catch(_){return []}
}
function signedMoney(v){
  const n=num(v);
  return `${n>0?'+':n<0?'−':''}${money(Math.abs(n))}`;
}
function daySpan(a,b){
  if(!a||!b)return 0;
  return Math.max(0,(b-a)/86400000);
}
function renderMomentum(){
  const rows=incomeHistory();
  const status=$('hq451MomentumStatus');
  const latest=rows[rows.length-1]||null;
  const previous=rows.length>1?rows[rows.length-2]:null;
  const baseline=rows[0]||null;

  if(!latest){
    set('hq451LatestChange','—');
    set('hq451BaselineGrowth','—');
    set('hq451HighRunRate','—');
    set('hq451HistoryPoints','0');
    set('hq451HistoryWindow','No Income snapshots yet');
    set('hq451TrendTitle','Income history is building');
    set('hq451TrendRange','—');
    set('hq451ChartStart','Baseline —');
    set('hq451ChartCurrent','Current —');
    set('hq451ChangeCount','0 changes');
    const list=$('hq451ChangeList');
    if(list)list.innerHTML='<div class="hq451-change-empty">Income Centre will populate this automatically as the forward run-rate changes.</div>';
    const svg=$('hq451IncomeChart');if(svg)svg.innerHTML='';
    const empty=$('hq451ChartEmpty');if(empty)empty.hidden=false;
    if(status)status.textContent='BUILDING HISTORY';
    return;
  }

  const latestDelta=previous?latest.annual-previous.annual:0;
  const baselineGrowth=baseline?latest.annual-baseline.annual:0;
  const high=Math.max(...rows.map(x=>x.annual));
  const days=baseline?daySpan(baseline.at,latest.at):0;

  set('hq451LatestChange',previous?signedMoney(latestDelta):'BASELINE');
  set('hq451LatestChangeMeta',previous?`${signedMoney(latestDelta/12)} / month • ${latest.reason}`:'First Income snapshot');
  set('hq451BaselineGrowth',rows.length>1?signedMoney(baselineGrowth):'—');
  set('hq451BaselineGrowthMeta',rows.length>1?`${signedMoney(baselineGrowth/12)} / month since tracking began`:'Needs another Income snapshot');
  set('hq451HighRunRate',money(high));
  set('hq451HighRunRateMeta',`${money(high/12)} / month`);
  set('hq451HistoryPoints',String(rows.length));
  set('hq451HistoryWindow',days>=1?`${days.toFixed(0)} days of Income history`:'History started today');
  set('hq451TrendTitle',`${money(latest.annual)} current annual run rate`);
  set('hq451TrendRange',rows.length>1?`${money(baseline.annual)} → ${money(latest.annual)}`:'Baseline only');
  set('hq451ChartStart',`Baseline ${money(baseline.annual)}`);
  set('hq451ChartCurrent',`Current ${money(latest.annual)}`);

  const latestEl=$('hq451LatestChange');
  if(latestEl){
    latestEl.classList.remove('positive','negative');
    if(latestDelta>0)latestEl.classList.add('positive');
    if(latestDelta<0)latestEl.classList.add('negative');
  }
  const growthEl=$('hq451BaselineGrowth');
  if(growthEl){
    growthEl.classList.remove('positive','negative');
    if(baselineGrowth>0)growthEl.classList.add('positive');
    if(baselineGrowth<0)growthEl.classList.add('negative');
  }

  if(status){
    status.textContent=rows.length>=2
      ?(latestDelta>0?'INCOME RISING':latestDelta<0?'INCOME DOWN':'INCOME STEADY')
      :'BASELINE SET';
  }

  // Real Income-history trend line.
  const svg=$('hq451IncomeChart'),empty=$('hq451ChartEmpty');
  if(svg){
    if(rows.length<2){
      svg.innerHTML='';
      if(empty)empty.hidden=false;
    }else{
      if(empty)empty.hidden=true;
      const W=800,H=220,padX=24,padY=22;
      const vals=rows.map(x=>x.annual);
      let min=Math.min(...vals),max=Math.max(...vals);
      if(max-min<1){min-=1;max+=1}
      const pts=rows.map((r,i)=>{
        const x=padX+(i/(rows.length-1))*(W-padX*2);
        const y=padY+(1-(r.annual-min)/(max-min))*(H-padY*2);
        return {x,y};
      });
      const line=pts.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      const area=`M ${pts[0].x.toFixed(1)} ${(H-padY).toFixed(1)} `+
        pts.map(p=>`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')+
        ` L ${pts[pts.length-1].x.toFixed(1)} ${(H-padY).toFixed(1)} Z`;
      const last=pts[pts.length-1];
      svg.innerHTML=`<path class="hq451-income-area" d="${area}"></path>
        <path class="hq451-income-line" d="${line}"></path>
        <circle class="hq451-income-dot" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="5"></circle>`;
    }
  }

  const changes=[];
  for(let i=1;i<rows.length;i++){
    const diff=rows[i].annual-rows[i-1].annual;
    if(Math.abs(diff)<0.005)continue;
    changes.push({...rows[i],diff});
  }
  changes.reverse();

  set('hq451ChangeCount',`${changes.length} change${changes.length===1?'':'s'}`);
  const host=$('hq451ChangeList');
  if(host){
    if(!changes.length){
      host.innerHTML='<div class="hq451-change-empty">No run-rate changes have been recorded beyond the current baseline yet.</div>';
    }else{
      host.innerHTML=changes.slice(0,5).map(x=>`
        <div class="hq451-change-row">
          <div>
            <strong>${x.reason.replace(/[&<>"]/g,'')}</strong>
            <span>${x.at.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} • ${money(x.annual)}/yr</span>
          </div>
          <b class="${x.diff>=0?'positive':'negative'}">${signedMoney(x.diff)}<small>${signedMoney(x.diff/12)}/m</small></b>
        </div>`).join('');
    }
  }
}

function start(){
  render();
  renderMomentum();
  window.addEventListener('aurora2:state',()=>{setTimeout(render,0);setTimeout(renderMomentum,0)});
  window.addEventListener('storage',()=>{setTimeout(render,30);setTimeout(renderMomentum,30)});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){setTimeout(render,30);setTimeout(renderMomentum,30)}});
  [100,500,1300].forEach(ms=>setTimeout(()=>{render();renderMomentum()},ms));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

})(window);
