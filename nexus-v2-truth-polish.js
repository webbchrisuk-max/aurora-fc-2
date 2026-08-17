/* Aurora City FC — Nexus V2 truth polish v1.0
 * Two presentation guards for the live Nexus command view:
 * 1) Dividend fixture amounts use the same non-zero expected/confirmed value logic as the runway tiles.
 * 2) A whole-squad 0.00% Daily Form feed stays labelled as awaiting genuine market movement.
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_V2_TRUTH_POLISH__)return;
w.__AURORA_NEXUS_V2_TRUTH_POLISH__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

const arr=v=>Array.isArray(v)?v:[];
const raw=v=>{
  if(v===null||v===undefined)return null;
  if(typeof v==='string'&&!v.trim())return null;
  const n=Number(String(v).replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:null;
};
const money=v=>w.Aurora2?.ui?.money?.(v)||new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)||0);

function state(){return w.Aurora2?.core?.read?.()||null;}

/* ---------- Dividend runway modal truth ---------- */
function rowDate(row){
  for(const field of ['paymentDate','payDate','payment_date','date','exDate','ex_date']){
    const text=String(row?.[field]||'').trim();if(!text)continue;
    const d=new Date(text);if(!Number.isNaN(d.getTime()))return d;
  }
  return null;
}
function rowAmount(row){
  const status=String(row?.status||row?.paymentStatus||'').trim().toUpperCase();
  const fields=status==='PAID'
    ? ['actualAmountGbp','amountGbp','amount','expectedAmountGbp','forecastAmountGbp']
    : ['amountGbp','amount','expectedAmountGbp','forecastAmountGbp','actualAmountGbp'];
  let zero=null;
  for(const field of fields){
    const n=raw(row?.[field]);if(n===null)continue;
    if(Math.abs(n)>1e-12)return {value:n,field};
    if(!zero)zero={value:n,field};
  }
  return zero||{value:null,field:''};
}
function fixturesFor(key){
  return arr(state()?.income?.calendar).map(row=>{
    const d=rowDate(row);if(!d)return null;
    const rowKey=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if(rowKey!==key)return null;
    return {row,date:d,amount:rowAmount(row),ticker:String(row?.ticker||row?.symbol||row?.name||'Dividend').trim().toUpperCase()};
  }).filter(Boolean).sort((a,b)=>a.date-b.date||a.ticker.localeCompare(b.ticker));
}
function patchRunwayDialog(key){
  if(!key)return;
  const rows=fixturesFor(key),cards=[...document.querySelectorAll('#n2DividendRunwayList .n2-runway-fixture')];
  cards.forEach((card,index)=>{
    const item=rows[index],strong=card.querySelector('.n2-runway-money strong');
    if(!strong||!item)return;
    strong.textContent=item.amount.value===null?'—':money(item.amount.value);
  });
  const total=rows.reduce((sum,item)=>sum+(item.amount.value??0),0);
  const totalEl=document.getElementById('n2DividendRunwayTotal');
  if(totalEl)totalEl.textContent=rows.some(item=>item.amount.value!==null)?money(total):'Amount not mapped';
}
function patchOpenRunway(){
  const tile=document.querySelector('#n2uRunway .n2-runway-selected');
  const key=tile?.dataset?.runwayMonth;
  if(key)patchRunwayDialog(key);
}

/* ---------- Daily Form truth ---------- */
function activeHoldings(s){return arr(s?.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&Number(h?.shares)>0);}
function dailyValue(h){
  for(const field of ['dailyChangePct','todayChangePct','dayChangePct','dailyChangeGbp','todayChangeGbp','dayChangeGbp']){
    const n=raw(h?.[field]);if(n!==null)return n;
  }
  return null;
}
function allZeroPlaceholder(rows){
  if(!rows.length)return true;
  const values=rows.map(dailyValue).filter(v=>v!==null);
  return !values.length||values.every(v=>Math.abs(v)<1e-12);
}
let formPatching=false;
function patchFormTruth(){
  if(formPatching)return;
  const s=state();if(!s)return;
  const rows=activeHoldings(s);if(!allZeroPlaceholder(rows))return;
  formPatching=true;
  const form=document.getElementById('n2uFormTable');
  if(form&&!/Awaiting today'?s market movement/i.test(form.textContent||'')){
    form.innerHTML='<div class="n2u-compact-note" style="padding:18px"><b>Awaiting today\'s market movement.</b><br>Aurora currently has zero placeholders for the whole squad, so Nexus will not present them as genuine +0.00% form.</div>';
  }
  const match=document.getElementById('n2uResult');if(match){match.textContent='AWAITING MARKET';match.classList.remove('good','bad');match.classList.add('draw');}
  const status=document.getElementById('n2uMatchStatus');if(status)status.textContent='AWAITING FEED';
  const summary=document.getElementById('n2uMatchSummary');if(summary)summary.textContent='Today\'s portfolio result will appear when Aurora receives genuine market movement rather than all-zero placeholders.';
  ['n2uAdvancers','n2uDecliners','n2uMotm','n2uDrag'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='—';});
  const today=document.getElementById('n2uToday');if(today)today.textContent='Awaiting feed';
  const leader=document.getElementById('n2uFormLeader');if(leader)leader.textContent='Awaiting feed';
  const leaderMeta=document.getElementById('n2uFormLeaderMeta');if(leaderMeta)leaderMeta.textContent='No genuine daily movement yet';
  setTimeout(()=>{formPatching=false},0);
}

function bind(){
  document.addEventListener('click',e=>{
    if(e.target.closest('#n2uRunway .n2u-month'))setTimeout(patchOpenRunway,0);
  });
  w.addEventListener('aurora2:state',()=>setTimeout(()=>{patchFormTruth();patchOpenRunway()},60));

  let attempts=0,formObserver=null,dialogObserver=null;
  const timer=setInterval(()=>{
    attempts++;
    patchFormTruth();
    const form=document.getElementById('n2uFormTable');
    if(form&&!formObserver){
      formObserver=new MutationObserver(()=>setTimeout(patchFormTruth,0));
      formObserver.observe(form,{childList:true,subtree:true,characterData:true});
    }
    const list=document.getElementById('n2DividendRunwayList');
    if(list&&!dialogObserver){
      dialogObserver=new MutationObserver(()=>setTimeout(patchOpenRunway,0));
      dialogObserver.observe(list,{childList:true,subtree:true});
    }
    if(attempts>80)clearInterval(timer);
  },125);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
else bind();
})(window);
