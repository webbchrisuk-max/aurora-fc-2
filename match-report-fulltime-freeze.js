/* Aurora City FC — Match Report Full-Time Freeze Guard v1.0
 * Keeps the official 5PM/recovered aggregate result authoritative after the
 * market continues to move. Detailed holding rows may use newer supported
 * LivePrices, but they can never rewrite the frozen headline or breadth.
 */
(function(w){
'use strict';
if(w.AuroraMatchReportFullTimeFreeze)return;
const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='match-report.html')return;
const arr=v=>Array.isArray(v)?v:[];
const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:NaN};
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2}).format(Number(v)||0);
const pct=v=>Number.isFinite(v)?`${v>=0?'+':''}${v.toFixed(2)}%`:'—';
const $=id=>document.getElementById(id);
function reportDateValue(r){return r?.report_date||r?.reportDate||r?.created_at||r?.createdAt||r?.timestamp||r?.date||''}
function reportTime(r){const d=new Date(reportDateValue(r));return Number.isNaN(d.getTime())?0:d.getTime()}
function latestReport(){
  const s=w.Aurora2?.core?.read?.();if(!s)return null;
  const rows=[],md=s?.matchday||s?.matchReport||{};
  if(md.latest)rows.push(md.latest);if(md.report)rows.push(md.report);
  rows.push(...arr(md.reports),...arr(s?.portfolio?.matchdayReports));
  return rows.filter(Boolean).sort((a,b)=>reportTime(b)-reportTime(a))[0]||null;
}
function field(r,...keys){for(const k of keys){if(r&&r[k]!==undefined&&r[k]!==null&&String(r[k]).trim()!=='')return r[k]}return undefined}
function sameDay(r){const d=new Date(reportDateValue(r)),n=new Date();return !Number.isNaN(d.getTime())&&d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate()}
function set(id,text,cls=''){const el=$(id);if(!el)return;el.textContent=text;if(cls){el.classList.remove('positive','negative');el.classList.add(cls)}}
function ensureNote(){
  if(document.getElementById('matchReportSnapshotNote'))return;
  const section=$('ratingsBody')?.closest('.section');const head=section?.querySelector('.section-head');if(!head)return;
  const note=document.createElement('div');note.id='matchReportSnapshotNote';note.textContent='Full-time headline and breadth are frozen to the official 5PM report. Player rows use the latest supported holding evidence, so later price updates can differ slightly from the frozen £ total.';
  Object.assign(note.style,{margin:'0 2px 12px',padding:'9px 11px',border:'1px solid rgba(56,189,248,.16)',borderRadius:'10px',background:'rgba(7,47,78,.18)',color:'#8fb1c7',fontSize:'9px',lineHeight:'1.5'});
  head.insertAdjacentElement('afterend',note);
}
function apply(){
  const r=latestReport();if(!r||!sameDay(r)||new Date().getHours()<17)return;
  const gain=num(field(r,'portfolio_change_gbp','portfolioChangeGbp'));
  const change=num(field(r,'portfolio_change_pct','portfolioChangePct'));
  const value=num(field(r,'portfolio_value','portfolioValue'));
  const up=num(field(r,'holdings_up','holdingsUp'));
  const down=num(field(r,'holdings_down','holdingsDown'));
  const flat=num(field(r,'holdings_flat','holdingsFlat'));
  if(Number.isFinite(value))set('portfolioValue',money(value));
  if(Number.isFinite(gain))set('dayGain',`${gain>=0?'+':''}${money(gain)}`,gain>0?'positive':gain<0?'negative':'');
  if(Number.isFinite(change)){set('resultPct',pct(change));$('scoreOrb')?.classList.toggle('loss',change<0)}
  if(Number.isFinite(up)&&Number.isFinite(down)){
    set('breadth',`${Math.round(up)} ↑ • ${Math.round(down)} ↓`);
    set('upCount',String(Math.round(up)));set('downCount',String(Math.round(down)));
    if(Number.isFinite(flat))set('flatCount',String(Math.round(flat)));
    const annual=$('annualIncome')?.textContent||'—';
    if(Number.isFinite(gain)&&Number.isFinite(change))set('managerHeadline',`${pct(change)} • ${gain>=0?'+':''}${money(gain)} full-time • ${Math.round(up)} up / ${Math.round(down)} down • ${annual}/yr income.`);
  }
  ensureNote();
}
function bind(){apply();setTimeout(apply,250);setTimeout(apply,900);w.addEventListener('aurora2:state',()=>setTimeout(apply,70));w.addEventListener('aurora:market-live',()=>setTimeout(apply,90));w.addEventListener('aurora2:match-report-hydrated',()=>setTimeout(apply,90));}
w.AuroraMatchReportFullTimeFreeze={version:'1.0',apply};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})(window);
