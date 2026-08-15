
(function(){
'use strict';
function jump(id){
  const target=document.getElementById(id);
  if(!target)return;
  const offset=(document.querySelector('.aurora-shell-header')?.offsetHeight||0)+(document.querySelector('.scouting-jumpbar')?.offsetHeight||0)+18;
  const top=target.getBoundingClientRect().top+window.scrollY-offset;
  window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
}
document.addEventListener('click',event=>{
  const btn=event.target.closest('[data-scout-jump]');
  if(!btn)return;
  event.preventDefault();
  jump(btn.dataset.scoutJump);
});
document.addEventListener('DOMContentLoaded',()=>{
  const label=document.getElementById('currentDepartment');
  if(label)label.textContent='SCOUTING CENTRE • RECRUITMENT INTELLIGENCE';
  document.title='Aurora City FC — Scouting Centre';
});
})();


/* =========================================================
   SCOUTING UI v1 — RECRUITMENT COMMAND
   Mirrors existing Scouting outputs; does not score candidates itself.
   ========================================================= */
(function(){
'use strict';

const $=id=>document.getElementById(id);
const num=v=>{
  const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:0;
};
const upper=v=>String(v||'').trim().toUpperCase();

function jumpTo(id){
  const target=$(id);
  if(!target)return;
  const offset=(document.querySelector('.aurora-shell-header')?.offsetHeight||0)+(document.querySelector('.scouting-jumpbar')?.offsetHeight||0)+18;
  const top=target.getBoundingClientRect().top+window.scrollY-offset;
  window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
}
function setFlow(id,tone,label,metaId,meta){
  const card=$(id);if(!card)return;
  card.classList.remove('good','active','info');
  if(tone)card.classList.add(tone);
  const badge=card.querySelector(':scope > b');
  if(badge)badge.textContent=label;
  const metaEl=$(metaId);
  if(metaEl)metaEl.textContent=meta;
}
function isShortlistApproved(){
  const s=upper($('scoutingStatus')?.textContent);
  return s.includes('APPROVED')||s.includes('LOCKED')||s.includes('TRANSFER');
}
function renderCommand(){
  const candidates=Math.round(num($('kCandidates')?.textContent));
  const pass=Math.round(num($('kPass')?.textContent));
  const caution=Math.round(num($('kCaution')?.textContent));
  const blocked=Math.round(num($('kBlock')?.textContent));
  const approved=isShortlistApproved();

  setFlow('scouting3Network','info','LIVE','scouting3NetworkMeta',
    'Global Network remains the broad monitoring layer; candidates enter Active Scouting only after promotion.');

  if(candidates>0){
    setFlow('scouting3Active','good','READY','scouting3ActiveMeta',
      `${candidates} active candidate${candidates===1?'':'s'} • ${pass} pass • ${caution} caution • ${blocked} blocked.`);
  }else{
    setFlow('scouting3Active','active','EMPTY','scouting3ActiveMeta',
      'No stored Active Scouting candidates are ready for ranking.');
  }

  if(approved){
    setFlow('scouting3Shortlist','good','APPROVED','scouting3ShortlistMeta',
      `${pass+caution} eligible target${pass+caution===1?'':'s'} handed to Transfer under the approved lens.`);
    setFlow('scouting3Transfer','good','READY','scouting3TransferMeta',
      'Transfer can now build its route from this approved Scouting authority.');
  }else if(pass+caution>0){
    setFlow('scouting3Shortlist','active','REVIEW','scouting3ShortlistMeta',
      `${pass+caution} eligible target${pass+caution===1?'':'s'} waiting for Director of Football approval.`);
    setFlow('scouting3Transfer','','WAITING','scouting3TransferMeta',
      'Transfer waits until the current shortlist is approved.');
  }else{
    setFlow('scouting3Shortlist','','WAITING','scouting3ShortlistMeta',
      'Run Scouting and resolve evidence before approving a shortlist.');
    setFlow('scouting3Transfer','','WAITING','scouting3TransferMeta',
      'No Transfer-ready shortlist is available.');
  }

  const status=$('scouting3Status');
  if(status)status.className='scouting3-status';

  const priority=$('scouting3Priority');
  const next=$('scouting3NextAction');
  const meta=$('scouting3NextMeta');
  const btn=$('scouting3NextButton');

  if(candidates===0){
    if(status){status.textContent='NETWORK SEARCH';status.classList.add('info')}
    if(priority)priority.textContent='Active Scouting is empty. The recruitment network is the next place to work.';
    if(next)next.textContent='Review the Global Scouting Network';
    if(meta)meta.textContent='Promote evidence-backed prospects into Active Scouting before ranking.';
    if(btn){btn.textContent='Open Global Network';btn.dataset.action='network'}
  }else if(pass+caution===0){
    if(status)status.textContent='EVIDENCE REVIEW';
    if(priority)priority.textContent='Candidates exist, but none currently pass the eligibility gates.';
    if(next)next.textContent='Review candidate evidence and blocked reasons';
    if(meta)meta.textContent='Use the shortlist and Evidence Room to resolve missing or weak evidence.';
    if(btn){btn.textContent='Open Evidence Room';btn.dataset.action='evidence'}
  }else if(!approved){
    if(status){status.textContent='SHORTLIST READY';status.classList.add('good')}
    if(priority)priority.textContent='The ranked shortlist has eligible targets and is waiting for approval.';
    if(next)next.textContent='Review and approve the current shortlist';
    if(meta)meta.textContent='Approval freezes the current Scouting result as Transfer authority.';
    if(btn){btn.textContent='Open Ranked Shortlist';btn.dataset.action='shortlist'}
  }else{
    if(status){status.textContent='TRANSFER READY';status.classList.add('good')}
    if(priority)priority.textContent='The shortlist is approved and Transfer can deploy the Finance mission across it.';
    if(next)next.textContent='Build the deployment route in Transfer';
    if(meta)meta.textContent='Scouting should only be changed if new evidence warrants a fresh shortlist.';
    if(btn){btn.textContent='Open Transfer';btn.dataset.action='transfer'}
  }
}
function bind(){
  $('scouting3NextButton')?.addEventListener('click',()=>{
    const a=$('scouting3NextButton')?.dataset.action;
    if(a==='network')jumpTo('globalNetworkSection');
    else if(a==='evidence')jumpTo('candidateLab');
    else if(a==='shortlist')jumpTo('shortlistSection');
    else if(a==='transfer')location.href='transfer.html';
  });

  const ids=[
    'kCandidates','kPass','kCaution','kBlock',
    'scoutingStatus','shortlistMeta','healthFull','healthReview'
  ];
  const observer=new MutationObserver(()=>renderCommand());
  ids.forEach(id=>{
    const el=$(id);
    if(el)observer.observe(el,{childList:true,subtree:true,attributes:true,characterData:true});
  });

  window.addEventListener('storage',()=>setTimeout(renderCommand,50));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(renderCommand,70)});
  setTimeout(renderCommand,80);
  setTimeout(renderCommand,700);
  setTimeout(renderCommand,1800);
}
document.addEventListener('DOMContentLoaded',bind);
})();


/* =========================================================
   SCOUTING UI v1.1 — RECRUITMENT WAR ROOM
   No scoring/gating logic is duplicated here.
   ========================================================= */
(function(){
'use strict';

const A=()=>window.Aurora2;
const $=id=>document.getElementById(id);
const arr=v=>Array.isArray(v)?v:[];
const num=v=>{
  const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:0;
};
const esc=v=>String(v??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
const upper=v=>String(v||'').trim().toUpperCase();

let compareA='';
let compareB='';

function state(){
  try{return A()?.core?.read?.()||null}catch(_){return null}
}
function strategyOf(s){
  return String(s?.scouting?.strategy||'sustainable').toLowerCase()==='maximum'
    ?'maximum':'sustainable';
}
function activeScore(t,strategy){
  return num(strategy==='maximum'?t.maximumScore:t.sustainableScore);
}
function activeRank(t,strategy){
  return num(strategy==='maximum'?t.maximumRank:t.rank)||9999;
}
function assessedTargets(s){
  const strategy=strategyOf(s);
  return arr(s?.scouting?.targets)
    .filter(Boolean)
    .slice()
    .sort((a,b)=>{
      const ar=activeRank(a,strategy), br=activeRank(b,strategy);
      return ar-br || activeScore(b,strategy)-activeScore(a,strategy);
    });
}
function eligibleTargets(s){
  return assessedTargets(s).filter(t=>String(t.status||'').toLowerCase()!=='block');
}
function accountLabel(v){
  const x=upper(v);
  return x==='IG'?'IG ISA':x==='T212'?'Trading 212':'Broker check';
}
function tone(status){
  const s=String(status||'').toLowerCase();
  return s==='pass'?'pass':s==='caution'?'caution':'block';
}
function metricBar(label,value){
  const v=Math.max(0,Math.min(100,num(value)));
  return `<div class="scouting11-mini-rating">
    <span>${esc(label)}</span>
    <div class="scouting11-mini-bar"><i style="width:${v}%"></i></div>
    <b>${Math.round(v)}</b>
  </div>`;
}
function setText(id,text){
  const el=$(id); if(el)el.textContent=text;
}

function strongestConcern(targets){
  const blocked=targets.filter(t=>String(t.status||'').toLowerCase()==='block');
  if(blocked.length){
    const t=blocked[0];
    return {
      title:`${t.ticker||'Candidate'} blocked`,
      meta:arr(t.eligibilityReasons)[0]||t.reason||'Scouting gate is blocking Transfer.'
    };
  }
  const caution=targets.filter(t=>String(t.status||'').toLowerCase()==='caution');
  if(caution.length){
    const t=caution[0];
    return {
      title:`${t.ticker||'Candidate'} caution`,
      meta:arr(t.eligibilityReasons)[0]||t.reason||'Controlled sizing / evidence review required.'
    };
  }
  return {title:'CLEAR',meta:'No active blocked or caution candidate leads the current board.'};
}

function renderSummary(s,targets,eligible){
  const strategy=strategyOf(s);
  const leader=eligible[0]||targets[0]||null;
  const concern=strongestConcern(targets);

  setText('scouting11Lens',strategy==='maximum'?'Maximum Income':'Sustainable Income');
  setText('scouting11Ready',String(eligible.length));
  setText('scouting11Leader',leader?.ticker||'—');
  setText(
    'scouting11LeaderMeta',
    leader
      ? `${Math.round(activeScore(leader,strategy))}/100 • ${num(leader.yieldPct).toFixed(2)}% yield • ${leader.recommendation||leader.status||'review'}`
      : 'Waiting for Active Scouting'
  );
  setText('scouting11Concern',concern.title);
  setText('scouting11ConcernMeta',concern.meta);

  const status=$('scouting11WarStatus');
  if(status){
    status.className='scouting11-war-status';
    if(!targets.length){
      status.textContent='NETWORK SEARCH';
      status.classList.add('warn');
    }else if(eligible.length){
      status.textContent='RECRUITMENT LIVE';
      status.classList.add('good');
    }else{
      status.textContent='EVIDENCE REVIEW';
      status.classList.add('warn');
    }
  }
}

function renderProspects(s,eligible){
  const host=$('scouting11TopProspects');
  if(!host)return;
  const strategy=strategyOf(s);
  const top=eligible.slice(0,4);
  setText('scouting11ProspectCount',`${top.length} prospect${top.length===1?'':'s'}`);

  if(!top.length){
    host.innerHTML='<div class="scouting11-empty">No Transfer-eligible Active Scouting prospects yet.</div>';
    return;
  }

  host.innerHTML=top.map((t,i)=>{
    const score=Math.round(activeScore(t,strategy));
    const rank=Math.round(activeRank(t,strategy));
    return `<article class="scouting11-prospect">
      <div class="scouting11-prospect-head">
        <div>
          <span class="scouting11-prospect-rank">#${rank} ${i===0?'• RECRUITMENT LEADER':''}</span>
          <h5>${esc(t.ticker||'—')} <span>${esc(t.name||'')}</span></h5>
        </div>
        <div class="scouting11-prospect-score"><strong>${score}</strong><span>ACTIVE SCORE</span></div>
      </div>
      <div class="scouting11-prospect-meta">
        <span class="scouting11-tag ${tone(t.status)}">${esc(t.recommendation||t.status||'REVIEW')}</span>
        <span class="scouting11-tag">${num(t.yieldPct).toFixed(2)}% yield</span>
        <span class="scouting11-tag">${esc(accountLabel(t.preferredAccount))}</span>
        ${t.sector?`<span class="scouting11-tag">${esc(t.sector)}</span>`:''}
      </div>
      <div class="scouting11-mini-ratings">
        ${metricBar('Safety',t.dividendSafety)}
        ${metricBar('Value',t.valuationScore)}
        ${metricBar('Portfolio fit',t.portfolioFit)}
        ${metricBar('Confidence',t.confidence)}
      </div>
      <div class="scouting11-prospect-actions">
        <button type="button" class="scouting11-compare-btn" data-scout-compare="${esc(t.id||t.ticker)}">Compare Candidate</button>
      </div>
    </article>`;
  }).join('');
}

function alertRow(toneClass,title,meta){
  return `<div class="scouting11-alert ${toneClass}">
    <strong>${esc(title)}</strong>
    <span>${esc(meta)}</span>
  </div>`;
}
function renderAlerts(targets,eligible){
  const host=$('scouting11Alerts');
  if(!host)return;
  const rows=[];

  const blocked=targets.filter(t=>String(t.status||'').toLowerCase()==='block');
  const caution=targets.filter(t=>String(t.status||'').toLowerCase()==='caution');
  const brokerCheck=targets.filter(t=>upper(t.preferredAccount)==='CHECK');
  const refresh=targets.filter(t=>t.requiresRefresh);

  if(eligible[0]){
    const t=eligible[0];
    rows.push(alertRow(
      'good',
      `Recruitment leader: ${t.ticker}`,
      `${t.recommendation||'Eligible'} • ${num(t.yieldPct).toFixed(2)}% yield • ${Math.round(num(t.confidence))} confidence.`
    ));
  }
  if(caution.length){
    const t=caution[0];
    rows.push(alertRow(
      'warn',
      `${caution.length} controlled-caution candidate${caution.length===1?'':'s'}`,
      `${t.ticker}: ${arr(t.eligibilityReasons)[0]||t.reason||'Scouting caution requires review.'}`
    ));
  }
  if(blocked.length){
    const t=blocked[0];
    rows.push(alertRow(
      'bad',
      `${blocked.length} blocked candidate${blocked.length===1?'':'s'}`,
      `${t.ticker}: ${arr(t.eligibilityReasons)[0]||t.reason||'Eligibility gate prevents Transfer.'}`
    ));
  }
  if(brokerCheck.length){
    rows.push(alertRow(
      'info',
      `${brokerCheck.length} broker check${brokerCheck.length===1?'':'s'} outstanding`,
      'Preferred platform still needs confirmation before a clean Transfer route.'
    ));
  }
  if(refresh.length){
    rows.push(alertRow(
      'info',
      `${refresh.length} Global Network promotion${refresh.length===1?'':'s'} need evidence review`,
      'Promoted network candidates stay blocked until Aurora 2 evidence has been reviewed.'
    ));
  }
  if(!rows.length){
    rows.push(alertRow(
      'good',
      'Recruitment board clear',
      'No blocked, caution, broker-check or evidence-refresh warnings are active.'
    ));
  }

  setText('scouting11AlertCount',`${rows.length} alert${rows.length===1?'':'s'}`);
  host.innerHTML=rows.slice(0,5).join('');
}

function candidateKey(t){return String(t.id||t.ticker||'');}
function populateCompare(s,targets){
  const a=$('scouting11CompareA'), b=$('scouting11CompareB');
  if(!a||!b)return;

  const currentKeys=new Set(targets.map(candidateKey));
  if(!currentKeys.has(compareA))compareA=candidateKey(targets[0]||{});
  if(!currentKeys.has(compareB) || compareB===compareA)compareB=candidateKey(targets[1]||targets[0]||{});

  const options=targets.map(t=>`<option value="${esc(candidateKey(t))}">${esc(t.ticker||'—')} — ${esc(t.name||'')}</option>`).join('');
  if(a.innerHTML!==options)a.innerHTML=options;
  if(b.innerHTML!==options)b.innerHTML=options;

  a.value=compareA;
  b.value=compareB;
  renderCompare(s,targets);
}
function findTarget(targets,key){
  return targets.find(t=>candidateKey(t)===key)||null;
}
function compareCell(value,max=100,winner=false,display=null){
  const v=Math.max(0,num(value));
  const pct=Math.max(0,Math.min(100,max>0?v/max*100:0));
  const shown=display!=null?display:(Number.isInteger(v)?String(v):v.toFixed(1));
  return `<div class="scouting11-compare-cell ${winner?'winner':''}">
    <div class="scouting11-compare-bar"><i style="width:${pct}%"></i></div>
    <b>${esc(shown)}</b>
  </div>`;
}
function renderCompare(s,targets){
  const host=$('scouting11CompareResult');
  if(!host)return;
  const x=findTarget(targets,compareA);
  const y=findTarget(targets,compareB);
  if(!x||!y){
    host.innerHTML='<div class="scouting11-empty">Choose two assessed candidates to compare.</div>';
    return;
  }
  const strategy=strategyOf(s);
  const metrics=[
    ['Active score',activeScore(x,strategy),activeScore(y,strategy),100],
    ['Dividend yield',num(x.yieldPct),num(y.yieldPct),15],
    ['Safety',num(x.dividendSafety),num(y.dividendSafety),100],
    ['Income score',num(x.incomeScore),num(y.incomeScore),100],
    ['Valuation',num(x.valuationScore),num(y.valuationScore),100],
    ['Portfolio fit',num(x.portfolioFit),num(y.portfolioFit),100],
    ['Growth',num(x.dividendGrowth),num(y.dividendGrowth),100],
    ['Quality',num(x.businessQuality),num(y.businessQuality),100],
    ['Confidence',num(x.confidence),num(y.confidence),100]
  ];

  host.innerHTML=`
    <div class="scouting11-compare-head">
      <span>SCOUTING METRIC</span>
      <strong>${esc(x.ticker)} • ${esc(x.recommendation||x.status||'REVIEW')}</strong>
      <strong>${esc(y.ticker)} • ${esc(y.recommendation||y.status||'REVIEW')}</strong>
    </div>
    ${metrics.map(([label,xv,yv,max])=>{
      const isYield=label==='Dividend yield';
      const xd=isYield?`${xv.toFixed(2)}%`:Math.round(xv);
      const yd=isYield?`${yv.toFixed(2)}%`:Math.round(yv);
      return `<div class="scouting11-compare-row">
        <strong>${esc(label)}</strong>
        ${compareCell(xv,max,xv>yv,xd)}
        ${compareCell(yv,max,yv>xv,yd)}
      </div>`;
    }).join('')}
  `;
}

function render(){
  const s=state();
  if(!s)return;
  const targets=assessedTargets(s);
  const eligible=eligibleTargets(s);
  renderSummary(s,targets,eligible);
  renderProspects(s,eligible);
  renderAlerts(targets,eligible);
  populateCompare(s,targets);
}

function openEvidence(scroll=false){
  const lab=$('candidateLab');
  const btn=$('scouting11EvidenceToggle');
  if(!lab)return;
  lab.classList.remove('scouting11-evidence-collapsed');
  if(btn){
    btn.textContent='Close Evidence Room';
    btn.setAttribute('aria-expanded','true');
  }
  if(scroll)setTimeout(()=>lab.scrollIntoView({behavior:'smooth',block:'start'}),40);
}
function closeEvidence(){
  const lab=$('candidateLab');
  const btn=$('scouting11EvidenceToggle');
  if(!lab)return;
  lab.classList.add('scouting11-evidence-collapsed');
  if(btn){
    btn.textContent='Open Evidence Room';
    btn.setAttribute('aria-expanded','false');
  }
}
function bind(){
  $('scouting11OpenShortlist')?.addEventListener('click',()=>$('shortlistSection')?.scrollIntoView({behavior:'smooth',block:'start'}));
  $('scouting11EvidenceToggle')?.addEventListener('click',()=>{
    const lab=$('candidateLab');
    if(lab?.classList.contains('scouting11-evidence-collapsed'))openEvidence(true);
    else closeEvidence();
  });

  // Ensure any existing Scouting navigation to Candidate Lab opens it first.
  document.addEventListener('click',event=>{
    const jump=event.target.closest('[data-scout-jump="candidateLab"]');
    if(jump)openEvidence(false);

    const compare=event.target.closest('[data-scout-compare]');
    if(compare){
      const key=String(compare.dataset.scoutCompare||'');
      if(!key)return;
      if(compareA!==key)compareA=key;
      else compareB=key;
      render();
      $('scouting11CompareResult')?.scrollIntoView({behavior:'smooth',block:'center'});
    }
  },true);

  $('scouting11CompareA')?.addEventListener('change',e=>{
    compareA=e.target.value;
    if(compareA===compareB){
      const s=state(), list=assessedTargets(s);
      compareB=candidateKey(list.find(t=>candidateKey(t)!==compareA)||list[0]||{});
    }
    render();
  });
  $('scouting11CompareB')?.addEventListener('change',e=>{
    compareB=e.target.value;
    if(compareA===compareB){
      const s=state(), list=assessedTargets(s);
      compareA=candidateKey(list.find(t=>candidateKey(t)!==compareB)||list[0]||{});
    }
    render();
  });

  const watch=['targetList','scoutingStatus','shortlistMeta','kCandidates','kPass','kCaution','kBlock','lensNote'];
  const observer=new MutationObserver(()=>render());
  watch.forEach(id=>{
    const el=$(id);
    if(el)observer.observe(el,{childList:true,subtree:true,attributes:true,characterData:true});
  });

  window.addEventListener('storage',()=>setTimeout(render,60));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(render,80)});

  setTimeout(render,90);
  setTimeout(render,700);
  setTimeout(render,1800);
}
document.addEventListener('DOMContentLoaded',bind);
})();
