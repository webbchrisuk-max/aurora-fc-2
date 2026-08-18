/* Aurora 2 — Scouting Clean Recruitment Board v1
 * Presentation-only upgrade for the Recruitment War Room.
 * Uses canonical Scouting scores/statuses and never changes eligibility,
 * rankings, approvals or Transfer authority.
 */
(function(w){
  'use strict';
  if(w.AuroraScoutingCleanBoard)return;

  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const upper=v=>String(v||'').trim().toUpperCase();
  let rendering=false;
  let observer=null;

  function state(){try{return w.Aurora2?.core?.read?.()||null}catch(_){return null}}
  function strategyOf(s){return String(s?.scouting?.strategy||'sustainable').toLowerCase()==='maximum'?'maximum':'sustainable'}
  function scoreOf(t,s){return num(strategyOf(s)==='maximum'?t?.maximumScore:t?.sustainableScore)}
  function rankOf(t,s){return num(strategyOf(s)==='maximum'?t?.maximumRank:t?.rank)||9999}
  function eligibleTargets(s){
    return arr(s?.scouting?.targets).filter(Boolean)
      .filter(t=>String(t.status||'').toLowerCase()!=='block')
      .sort((a,b)=>rankOf(a,s)-rankOf(b,s)||scoreOf(b,s)-scoreOf(a,s));
  }
  function tone(status){const x=String(status||'').toLowerCase();return x==='pass'?'pass':x==='caution'?'caution':'watch'}
  function account(v){const x=upper(v);return x==='IG'?'IG ISA':x==='T212'?'Trading 212':x||'CHECK'}
  function metric(v){const n=Math.max(0,Math.min(100,num(v)));return n?Math.round(n):'—'}

  function injectStyles(){
    if($('auroraScoutingCleanBoardStyles'))return;
    const style=document.createElement('style');
    style.id='auroraScoutingCleanBoardStyles';
    style.textContent=`
      .scouting11-war-grid{grid-template-columns:minmax(0,1fr)!important}
      .scouting11-compare-board{display:none!important}
      .scouting11-prospect-board{width:100%}
      .scouting-clean-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:10px;border:1px solid rgba(125,211,252,.10);border-radius:12px}
      .scouting-clean-table{width:100%;min-width:900px;border-collapse:collapse;background:rgba(3,11,25,.34)}
      .scouting-clean-table th{padding:10px 11px;background:rgba(8,47,73,.20);border-bottom:1px solid rgba(125,211,252,.12);color:#7890a6;font-size:7px;font-weight:950;letter-spacing:.11em;text-align:left;text-transform:uppercase;white-space:nowrap}
      .scouting-clean-table td{padding:11px;border-bottom:1px solid rgba(125,211,252,.07);color:#c3d2df;font-size:9px;vertical-align:middle;white-space:nowrap}
      .scouting-clean-table tr:last-child td{border-bottom:0}.scouting-clean-table tbody tr:first-child{background:rgba(8,145,178,.07)}
      .scouting-clean-rank{display:inline-flex;align-items:center;justify-content:center;min-width:27px;height:27px;border-radius:8px;background:rgba(15,23,42,.88);border:1px solid rgba(125,211,252,.14);color:#7dd3fc;font-size:9px;font-weight:950}
      .scouting-clean-share strong{display:block;color:#f2fbff;font-size:11px}.scouting-clean-share span{display:block;margin-top:2px;color:#71869a;font-size:7px;max-width:220px;overflow:hidden;text-overflow:ellipsis}
      .scouting-clean-score{color:#67e8f9!important;font-size:12px!important;font-weight:950}.scouting-clean-yield{color:#a7f3d0!important;font-weight:900}
      .scouting-clean-metric{font-weight:900;color:#dbeafe}.scouting-clean-chip{display:inline-flex;padding:5px 7px;border-radius:999px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.74);color:#cbd5e1;font-size:7px;font-weight:950;letter-spacing:.05em;text-transform:uppercase}
      .scouting-clean-chip.pass{border-color:rgba(52,211,153,.34);background:rgba(6,78,59,.22);color:#a7f3d0}.scouting-clean-chip.caution{border-color:rgba(251,191,36,.34);background:rgba(120,74,8,.20);color:#fde68a}.scouting-clean-chip.watch{border-color:rgba(96,165,250,.28);color:#bfdbfe}
      .scouting-manager-lens{padding:15px;border:1px solid rgba(125,211,252,.11);border-radius:14px;background:rgba(4,13,28,.58)}
      .scouting-manager-lens-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:11px}.scouting-manager-lens-head small{display:block;color:#67e8f9;font-size:8px;font-weight:950;letter-spacing:.15em}.scouting-manager-lens-head h4{margin:3px 0 0;font-size:15px}.scouting-manager-lens-head p{margin:0;color:#758ba0;font-size:8px}
      .scouting-manager-lens-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.scouting-manager-lens-card{padding:11px;border:1px solid rgba(125,211,252,.08);border-radius:11px;background:rgba(15,23,42,.46)}
      .scouting-manager-lens-card small{display:block;color:#7f96aa;font-size:7px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.scouting-manager-lens-card strong{display:block;margin-top:5px;color:#f1f8ff;font-size:14px}.scouting-manager-lens-card span{display:block;margin-top:3px;color:#91a7ba;font-size:8px}.scouting-manager-lens-card b{color:#67e8f9}
      @media(max-width:780px){.scouting-manager-lens-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.scouting-manager-lens-head{display:block}.scouting-manager-lens-head p{margin-top:5px}}
    `;
    document.head.appendChild(style);
  }

  function verdict(t){return String(t?.recommendation||t?.status||'WATCH').toUpperCase()}
  function prospectRow(t,s,i){
    const rank=Math.round(rankOf(t,s));
    return `<tr>
      <td><span class="scouting-clean-rank">#${rank<9999?rank:i+1}</span></td>
      <td class="scouting-clean-share"><strong>${esc(t.ticker||'—')}</strong><span>${esc(t.name||'')}</span></td>
      <td class="scouting-clean-score">${Math.round(scoreOf(t,s))}</td>
      <td class="scouting-clean-yield">${num(t.yieldPct).toFixed(2)}%</td>
      <td class="scouting-clean-metric">${metric(t.dividendSafety)}</td>
      <td class="scouting-clean-metric">${metric(t.valuationScore)}</td>
      <td class="scouting-clean-metric">${metric(t.portfolioFit)}</td>
      <td>${esc(account(t.preferredAccount))}</td>
      <td><span class="scouting-clean-chip ${tone(t.status)}">${esc(verdict(t))}</span></td>
    </tr>`;
  }

  function renderProspectBoard(){
    const host=$('scouting11TopProspects'),s=state();
    if(!host||!s)return;
    const rows=eligibleTargets(s).slice(0,4);
    const currentIsClean=!!host.querySelector('.scouting-clean-table');
    const signature=rows.map(t=>[
      t.id||t.ticker,rankOf(t,s),scoreOf(t,s),num(t.yieldPct),num(t.dividendSafety),num(t.valuationScore),num(t.portfolioFit),t.status,t.recommendation,t.preferredAccount
    ].join(':')).join('|');
    if(currentIsClean&&host.dataset.cleanBoardSignature===signature)return;

    rendering=true;
    host.dataset.cleanBoardSignature=signature;
    const count=$('scouting11ProspectCount');if(count)count.textContent=`Top ${rows.length} ranked`;
    const title=host.closest('.scouting11-prospect-board')?.querySelector('.scouting11-subhead h4');if(title)title.textContent='Top Prospects';
    const copy=host.closest('.scouting11-prospect-board')?.querySelector('.scouting11-subhead p');if(copy)copy.textContent='One ranked recruitment board using Aurora’s existing Scouting scores, evidence and Transfer eligibility.';

    host.innerHTML=rows.length
      ? `<div class="scouting-clean-scroll"><table class="scouting-clean-table"><thead><tr><th>Rank</th><th>Share</th><th>Aurora Score</th><th>Yield</th><th>Safety</th><th>Value</th><th>Portfolio Fit</th><th>Broker</th><th>Verdict</th></tr></thead><tbody>${rows.map((t,i)=>prospectRow(t,s,i)).join('')}</tbody></table></div>`
      : '<div class="scouting11-empty">No Transfer-eligible Active Scouting prospects yet.</div>';
    rendering=false;
  }

  function bestBy(rows,key){return rows.slice().sort((a,b)=>num(b?.[key])-num(a?.[key]))[0]||null}
  function lensCard(label,t,metricLabel,value){
    return `<div class="scouting-manager-lens-card"><small>${esc(label)}</small><strong>${esc(t?.ticker||'—')}</strong><span>${t?`${esc(metricLabel)} <b>${esc(value)}</b>`:'Waiting for eligible Scouting evidence'}</span></div>`;
  }
  function ensureLens(){
    if($('scoutingManagerLensBoard'))return $('scoutingManagerLensBoard');
    const prospects=document.querySelector('.scouting11-prospect-board');if(!prospects)return null;
    const article=document.createElement('article');
    article.id='scoutingManagerLensBoard';
    article.className='scouting-manager-lens';
    prospects.insertAdjacentElement('afterend',article);
    return article;
  }
  function renderLens(){
    const host=ensureLens(),s=state();if(!host||!s)return;
    const rows=eligibleTargets(s);
    const income=rows.slice().sort((a,b)=>num(b.yieldPct)-num(a.yieldPct))[0]||null;
    const safety=bestBy(rows,'dividendSafety');
    const value=bestBy(rows,'valuationScore');
    const fit=bestBy(rows,'portfolioFit');
    host.innerHTML=`
      <div class="scouting-manager-lens-head"><div><small>MANAGER'S SCOUTING LENS</small><h4>Where the shortlist is strongest</h4></div><p>Quick read only — no new scoring is created here.</p></div>
      <div class="scouting-manager-lens-grid">
        ${lensCard('Best Income',income,'Yield',income?`${num(income.yieldPct).toFixed(2)}%`:'—')}
        ${lensCard('Safest Dividend',safety,'Safety',safety?`${metric(safety.dividendSafety)}/100`:'—')}
        ${lensCard('Best Value',value,'Value',value?`${metric(value.valuationScore)}/100`:'—')}
        ${lensCard('Best Portfolio Fit',fit,'Fit',fit?`${metric(fit.portfolioFit)}/100`:'—')}
      </div>`;
  }

  function removeComparison(){
    const compare=document.querySelector('.scouting11-compare-board');
    if(compare){compare.hidden=true;compare.setAttribute('aria-hidden','true')}
    document.querySelectorAll('[data-scout-compare]').forEach(btn=>btn.remove());
  }

  function render(){
    injectStyles();removeComparison();renderProspectBoard();renderLens();
  }
  function observe(){
    const host=$('scouting11TopProspects');if(!host||observer)return;
    observer=new MutationObserver(()=>{if(!rendering)requestAnimationFrame(render)});
    observer.observe(host,{childList:true,subtree:true});
  }
  function bind(){
    [80,450,1000,1800].forEach(delay=>setTimeout(()=>{render();observe()},delay));
    w.addEventListener('aurora2:state',()=>setTimeout(render,50));
    w.addEventListener('storage',()=>setTimeout(render,50));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(render,70)});
    $('runScouting')?.addEventListener('click',()=>setTimeout(render,120),{capture:true});
  }

  w.AuroraScoutingCleanBoard={render};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})(window);
