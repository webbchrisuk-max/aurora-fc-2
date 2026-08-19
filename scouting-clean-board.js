/* Aurora 2 — Scouting Clean Recruitment Board v1.2
 * Presentation-only recruitment board for Scouting Intelligence 3.
 * Canonical scores/statuses remain owned by Intelligence 3; this file only
 * presents them consistently and never turns missing evidence into zero.
 */
(function(w){
'use strict';
if(w.AuroraScoutingCleanBoard)return;

const $=id=>document.getElementById(id);
const arr=v=>Array.isArray(v)?v:[];
const n=v=>{if(v==null||v==='')return null;const x=Number(String(v).replace(/[^0-9.-]/g,''));return Number.isFinite(x)?x:null};
const n0=v=>n(v)??0;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const upper=v=>String(v||'').trim().toUpperCase();
let rendering=false,observer=null;

function state(){try{return w.Aurora2?.core?.read?.()||null}catch(_){return null}}
function strategyOf(s){return String(s?.scouting?.strategy||'sustainable').toLowerCase()==='maximum'?'maximum':'sustainable'}
function scoreOf(t,s){return n(strategyOf(s)==='maximum'?t?.maximumScore:t?.sustainableScore)}
function rankOf(t,s){const x=n(strategyOf(s)==='maximum'?t?.maximumRank:t?.rank);return x&&x>0?x:9999}
function statusOf(t){return String(t?.status||'').toLowerCase()}
function isTransferEligible(t){return t?.eligibleForTransfer===true&&['pass','caution'].includes(statusOf(t))}
function eligibleTargets(s){return arr(s?.scouting?.targets).filter(Boolean).filter(isTransferEligible).sort((a,b)=>rankOf(a,s)-rankOf(b,s)||n0(scoreOf(b,s))-n0(scoreOf(a,s)))}
function pendingTargets(s){return arr(s?.scouting?.targets).filter(t=>statusOf(t)==='pending'||upper(t?.recommendation)==='DATA PENDING')}
function tone(status){const x=String(status||'').toLowerCase();return x==='pass'?'pass':x==='caution'?'caution':x==='pending'?'pending':'watch'}
function account(v){const x=upper(v);return x==='IG'?'IG ISA':x==='T212'?'Trading 212':x||'CHECK'}
function metric(v){const x=n(v);return x!=null&&x>0?Math.round(Math.max(0,Math.min(100,x))):'—'}
function verdict(t){return String(t?.recommendation||t?.status||'WATCH').toUpperCase()}

function injectStyles(){
  if($('auroraScoutingCleanBoardStyles'))return;
  const style=document.createElement('style');style.id='auroraScoutingCleanBoardStyles';style.textContent=`
    .scouting11-war-grid{grid-template-columns:minmax(0,1fr)!important}
    .scouting11-compare-board{display:none!important}
    .scouting11-prospect-board{width:100%}
    #scouting11TopProspects.scouting11-prospect-grid{display:block!important;grid-template-columns:none!important}
    .scouting-clean-scroll{display:block!important;width:100%!important;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:10px;border:1px solid rgba(125,211,252,.10);border-radius:12px}
    .scouting-clean-table{width:100%;min-width:900px;border-collapse:collapse;background:rgba(3,11,25,.34)}
    .scouting-clean-table th{padding:10px 11px;background:rgba(8,47,73,.20);border-bottom:1px solid rgba(125,211,252,.12);color:#7890a6;font-size:7px;font-weight:950;letter-spacing:.11em;text-align:left;text-transform:uppercase;white-space:nowrap}
    .scouting-clean-table td{padding:11px;border-bottom:1px solid rgba(125,211,252,.07);color:#c3d2df;font-size:9px;vertical-align:middle;white-space:nowrap;opacity:1!important;visibility:visible!important}
    .scouting-clean-table tr{opacity:1!important;visibility:visible!important}.scouting-clean-table tr:last-child td{border-bottom:0}.scouting-clean-table tbody tr:first-child{background:rgba(8,145,178,.07)}
    .scouting-clean-rank{display:inline-flex;align-items:center;justify-content:center;min-width:27px;height:27px;border-radius:8px;background:rgba(15,23,42,.88);border:1px solid rgba(125,211,252,.14);color:#7dd3fc;font-size:9px;font-weight:950}
    .scouting-clean-share strong{display:block;color:#f2fbff;font-size:11px}.scouting-clean-share span{display:block;margin-top:2px;color:#71869a;font-size:7px;max-width:220px;overflow:hidden;text-overflow:ellipsis}
    .scouting-clean-score{color:#67e8f9!important;font-size:12px!important;font-weight:950}.scouting-clean-yield{color:#a7f3d0!important;font-weight:900}.scouting-clean-metric{font-weight:900;color:#dbeafe}
    .scouting-clean-chip{display:inline-flex;padding:5px 7px;border-radius:999px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.74);color:#cbd5e1;font-size:7px;font-weight:950;letter-spacing:.05em;text-transform:uppercase}
    .scouting-clean-chip.pass{border-color:rgba(52,211,153,.34);background:rgba(6,78,59,.22);color:#a7f3d0}.scouting-clean-chip.caution{border-color:rgba(251,191,36,.34);background:rgba(120,74,8,.20);color:#fde68a}.scouting-clean-chip.pending{border-color:rgba(56,189,248,.32);background:rgba(7,89,133,.18);color:#bae6fd}
    .scouting-clean-pending{display:block!important;width:100%!important;margin-top:10px;padding:9px 11px;border:1px solid rgba(56,189,248,.14);border-radius:10px;background:rgba(7,47,78,.18);color:#8fb1c7;font-size:8px;line-height:1.45}.scouting-clean-pending strong{color:#7dd3fc}
    .scouting-manager-lens{padding:15px;border:1px solid rgba(125,211,252,.11);border-radius:14px;background:rgba(4,13,28,.58)}
    .scouting-manager-lens-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:11px}.scouting-manager-lens-head small{display:block;color:#67e8f9;font-size:8px;font-weight:950;letter-spacing:.15em}.scouting-manager-lens-head h4{margin:3px 0 0;font-size:15px}.scouting-manager-lens-head p{margin:0;color:#758ba0;font-size:8px}
    .scouting-manager-lens-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.scouting-manager-lens-card{padding:11px;border:1px solid rgba(125,211,252,.08);border-radius:11px;background:rgba(15,23,42,.46)}
    .scouting-manager-lens-card small{display:block;color:#7f96aa;font-size:7px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.scouting-manager-lens-card strong{display:block;margin-top:5px;color:#f1f8ff;font-size:14px}.scouting-manager-lens-card span{display:block;margin-top:3px;color:#91a7ba;font-size:8px}.scouting-manager-lens-card b{color:#67e8f9}
    @media(max-width:780px){.scouting-manager-lens-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.scouting-manager-lens-head{display:block}.scouting-manager-lens-head p{margin-top:5px}}
  `;document.head.appendChild(style);
}

function prospectRow(t,s,i){const rank=Math.round(rankOf(t,s)),score=scoreOf(t,s);return `<tr><td><span class="scouting-clean-rank">#${rank<9999?rank:i+1}</span></td><td class="scouting-clean-share"><strong>${esc(t.ticker||'—')}</strong><span>${esc(t.name||'')}</span></td><td class="scouting-clean-score">${score!=null?Math.round(score):'—'}</td><td class="scouting-clean-yield">${n(t.yieldPct)!=null&&n(t.yieldPct)>0?n(t.yieldPct).toFixed(2)+'%':'—'}</td><td class="scouting-clean-metric">${metric(t.dividendSafety)}</td><td class="scouting-clean-metric">${metric(t.valuationScore)}</td><td class="scouting-clean-metric">${metric(t.portfolioFit)}</td><td>${esc(account(t.preferredAccount))}</td><td><span class="scouting-clean-chip ${tone(t.status)}">${esc(verdict(t))}</span></td></tr>`}

function renderSummary(s,eligible){
  const ready=$('scouting11Ready');if(ready)ready.textContent=String(eligible.length);
  const readyCard=ready?.closest('article');const readyLabel=readyCard?.querySelector('small');if(readyLabel)readyLabel.textContent='Transfer Eligible';
  const readyMeta=readyCard?.querySelector('span');if(readyMeta)readyMeta.textContent='Canonical PASS + controlled CAUTION';
  const leader=eligible[0]||null;if($('scouting11Leader'))$('scouting11Leader').textContent=leader?.ticker||'—';
  if($('scouting11LeaderMeta'))$('scouting11LeaderMeta').textContent=leader?`${Math.round(n0(scoreOf(leader,s)))}/100 • ${n0(leader.yieldPct).toFixed(2)}% yield • ${verdict(leader)}`:'Waiting for Transfer-eligible evidence';
}
function renderProspectBoard(){
  const host=$('scouting11TopProspects'),s=state();if(!host||!s)return;
  const eligible=eligibleTargets(s),rows=eligible.slice(0,12),pending=pendingTargets(s);
  const signature=[...rows.map(t=>[t.id||t.ticker,rankOf(t,s),scoreOf(t,s),t.yieldPct,t.dividendSafety,t.valuationScore,t.portfolioFit,t.status,t.recommendation,t.preferredAccount,t.eligibleForTransfer].join(':')),`pending:${pending.length}`].join('|');
  renderSummary(s,eligible);
  if(host.querySelector('.scouting-clean-table')&&host.dataset.cleanBoardSignature===signature)return;
  rendering=true;host.dataset.cleanBoardSignature=signature;
  const count=$('scouting11ProspectCount');if(count)count.textContent=`${eligible.length} Transfer eligible`;
  const title=host.closest('.scouting11-prospect-board')?.querySelector('.scouting11-subhead h4');if(title)title.textContent='Top Prospects';
  const copy=host.closest('.scouting11-prospect-board')?.querySelector('.scouting11-subhead p');if(copy)copy.textContent='One ranked recruitment board using Scouting Intelligence 3 evidence and strict Transfer eligibility.';
  const table=rows.length?`<div class="scouting-clean-scroll"><table class="scouting-clean-table"><thead><tr><th>Rank</th><th>Share</th><th>Aurora Score</th><th>Yield</th><th>Safety</th><th>Value</th><th>Portfolio Fit</th><th>Broker</th><th>Verdict</th></tr></thead><tbody>${rows.map((t,i)=>prospectRow(t,s,i)).join('')}</tbody></table></div>`:'<div class="scouting11-empty">No Transfer-eligible Active Scouting prospects yet.</div>';
  const pendingNote=pending.length?`<div class="scouting-clean-pending"><strong>${pending.length} DATA PENDING</strong> ${pending.length===1?'candidate is':'candidates are'} visible in Active Scouting but excluded from Transfer eligibility until genuine missing evidence is resolved.</div>`:'';
  host.innerHTML=table+pendingNote;rendering=false;
}
function bestBy(rows,key){return rows.filter(t=>n(t?.[key])!=null&&n(t?.[key])>0).slice().sort((a,b)=>n0(b?.[key])-n0(a?.[key]))[0]||null}
function lensCard(label,t,metricLabel,value){return `<div class="scouting-manager-lens-card"><small>${esc(label)}</small><strong>${esc(t?.ticker||'—')}</strong><span>${t?`${esc(metricLabel)} <b>${esc(value)}</b>`:'Waiting for eligible Scouting evidence'}</span></div>`}
function ensureLens(){if($('scoutingManagerLensBoard'))return $('scoutingManagerLensBoard');const prospects=document.querySelector('.scouting11-prospect-board');if(!prospects)return null;const article=document.createElement('article');article.id='scoutingManagerLensBoard';article.className='scouting-manager-lens';prospects.insertAdjacentElement('afterend',article);return article}
function renderLens(){const host=ensureLens(),s=state();if(!host||!s)return;const rows=eligibleTargets(s),income=rows.filter(t=>n(t.yieldPct)>0).sort((a,b)=>n0(b.yieldPct)-n0(a.yieldPct))[0]||null,safety=bestBy(rows,'dividendSafety'),value=bestBy(rows,'valuationScore'),fit=bestBy(rows,'portfolioFit');host.innerHTML=`<div class="scouting-manager-lens-head"><div><small>MANAGER'S SCOUTING LENS</small><h4>Where the eligible shortlist is strongest</h4></div><p>Quick read only — DATA PENDING candidates are excluded.</p></div><div class="scouting-manager-lens-grid">${lensCard('Best Income',income,'Yield',income?`${n0(income.yieldPct).toFixed(2)}%`:'—')}${lensCard('Safest Dividend',safety,'Safety',safety?`${metric(safety.dividendSafety)}/100`:'—')}${lensCard('Best Value',value,'Value',value?`${metric(value.valuationScore)}/100`:'—')}${lensCard('Best Portfolio Fit',fit,'Fit',fit?`${metric(fit.portfolioFit)}/100`:'—')}</div>`}
function polishPendingLeagueRows(){
  const root=$('targetList');if(!root)return;
  root.querySelectorAll('table').forEach(table=>{const heads=[...table.querySelectorAll('thead th')].map(x=>upper(x.textContent));const safetyIndex=heads.findIndex(x=>x==='SAFETY');const statusIndex=heads.findIndex(x=>x==='STATUS');if(safetyIndex<0||statusIndex<0)return;table.querySelectorAll('tbody tr.football-data-row').forEach(row=>{const cells=[...row.children];const status=upper(cells[statusIndex]?.textContent);if(!status.includes('DATA PENDING'))return;const safety=cells[safetyIndex];if(safety&&(/^0(?:\.0+)?(?:\/100)?$/.test(String(safety.textContent||'').trim())||!String(safety.textContent||'').trim())){safety.textContent='—';safety.title='Dividend-safety evidence pending';}})});
}
function removeComparison(){const compare=document.querySelector('.scouting11-compare-board');if(compare){compare.hidden=true;compare.setAttribute('aria-hidden','true')}document.querySelectorAll('[data-scout-compare]').forEach(btn=>btn.remove())}
function render(){injectStyles();removeComparison();renderProspectBoard();renderLens();polishPendingLeagueRows()}
function observe(){const host=$('scouting11TopProspects');if(!host||observer)return;observer=new MutationObserver(()=>{if(!rendering)requestAnimationFrame(render)});observer.observe(host,{childList:true,subtree:true})}
function bind(){[80,350,800,1500,2600].forEach(delay=>setTimeout(()=>{render();observe()},delay));w.addEventListener('aurora2:state',()=>setTimeout(render,60));w.addEventListener('storage',()=>setTimeout(render,60));document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(render,80)});$('runScouting')?.addEventListener('click',()=>setTimeout(render,260),{capture:true})}

w.AuroraScoutingCleanBoard={version:'1.2',render,eligibleTargets:()=>eligibleTargets(state()||{})};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})(window);
