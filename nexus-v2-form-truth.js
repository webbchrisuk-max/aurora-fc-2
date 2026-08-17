/* Aurora City FC — Nexus V2 Daily Form truth guard v1.0
 * A full squad of exact 0.00% moves is treated as a placeholder feed, not genuine form.
 * Real non-zero daily movement immediately restores the normal Daily Form table.
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_V2_FORM_TRUTH__)return;
w.__AURORA_NEXUS_V2_FORM_TRUTH__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;
const arr=v=>Array.isArray(v)?v:[];
const raw=v=>{
  if(v===null||v===undefined)return null;
  if(typeof v==='string'&&!v.trim())return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
};
const active=s=>arr(s?.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&Number(h?.shares)>0);
const ticker=h=>String(h?.ticker||h?.name||'UNKNOWN').trim().toUpperCase();
function dailyValue(h){
  for(const k of ['dailyChangePct','todayChangePct','dayChangePct','dailyChangeGbp','todayChangeGbp','dayChangeGbp']){
    const n=raw(h?.[k]);if(n!==null)return n;
  }
  return null;
}
function unique(rows){return [...new Set(rows.map(ticker))];}
function allZeroPlaceholder(rows){
  if(!rows.length)return true;
  const vals=rows.map(dailyValue).filter(v=>v!==null);
  if(!vals.length)return true;
  return vals.every(v=>Math.abs(v)<1e-12);
}
function patch(){
  const s=w.Aurora2?.core?.read?.();if(!s)return;
  const rows=active(s),tickers=unique(rows),placeholder=allZeroPlaceholder(rows);
  if(!placeholder)return;

  const form=document.getElementById('n2uFormTable');
  if(form)form.innerHTML='<div class="n2u-compact-note" style="padding:18px"><b>Awaiting today\'s market movement.</b><br>Aurora currently has zero placeholders for the whole squad, so Nexus will not present them as genuine +0.00% form.</div>';

  const match=document.getElementById('n2uResult');
  if(match){match.textContent='AWAITING MARKET';match.classList.remove('good','bad');match.classList.add('draw');}
  const status=document.getElementById('n2uMatchStatus');if(status)status.textContent='AWAITING FEED';
  const summary=document.getElementById('n2uMatchSummary');if(summary)summary.textContent='Today\'s portfolio result will appear when Aurora receives a genuine market movement rather than all-zero placeholders.';
  ['n2uAdvancers','n2uDecliners','n2uMotm','n2uDrag'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='—';});

  const today=document.getElementById('n2uToday');if(today)today.textContent='Awaiting feed';
  const leader=document.getElementById('n2uFormLeader');if(leader)leader.textContent='Awaiting feed';
  const leaderMeta=document.getElementById('n2uFormLeaderMeta');if(leaderMeta)leaderMeta.textContent='No genuine daily movement yet';

  const pitchNote=document.getElementById('pitchNote');
  if(pitchNote&&/daily market evidence/i.test(pitchNote.textContent||'')){
    pitchNote.innerHTML=`11 of ${tickers.length} active securities shown • Daily form awaiting genuine market movement. <span class="n2-tactical-hint">Tap any player for full company analysis</span>`;
  }

  document.querySelectorAll('#healthStrip .health').forEach(card=>{
    if(String(card.querySelector('small')?.textContent||'').trim().toLowerCase()!=='market data')return;
    const strong=card.querySelector('strong');if(strong){strong.textContent='AWAITING FEED';strong.classList.add('check');}
  });
}
function init(){
  patch();
  w.addEventListener('aurora2:state',()=>setTimeout(patch,40));
  setTimeout(patch,350);setTimeout(patch,1200);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
