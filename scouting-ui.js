
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
  let approvalCount=Math.round(num($('kCaution')?.textContent));
  let approvedCount=0;
  try{
    const rows=window.Aurora2?.core?.read?.()?.scouting?.targets||[];
    approvalCount=(window.Aurora2?.scoutingUniverse?.approvalCandidates(rows)||
      rows.filter(x=>x.status!=='block'&&!x.approvedForTransfer)).length;
    approvedCount=(window.Aurora2?.scoutingUniverse?.approvedCandidates(rows)||
      rows.filter(x=>x.approvedForTransfer)).length;
  }catch(_){ /* The DOM mirror remains the startup fallback. */ }
  const blocked=Math.round(num($('kBlock')?.textContent));
  const approved=isShortlistApproved();

  setFlow('scouting3Network','info','LIVE','scouting3NetworkMeta',
    'Global Network remains the broad monitoring layer; candidates enter Active Scouting only after promotion.');

  if(candidates>0){
    setFlow('scouting3Active','good','READY','scouting3ActiveMeta',
      `${candidates} in the scouting universe • ${pass} deep-scouted • ${approvalCount} Transfer-permitted • ${blocked} need review.`);
  }else{
    setFlow('scouting3Active','active','EMPTY','scouting3ActiveMeta',
      'No stored Active Scouting candidates are ready for ranking.');
  }

  if(approved){
    setFlow('scouting3Shortlist','good','APPROVED','scouting3ShortlistMeta',
      `${approvedCount} eligible target${approvedCount===1?'':'s'} handed to Transfer under the approved lens.`);
    setFlow('scouting3Transfer','good','READY','scouting3TransferMeta',
      'Transfer can now build its route from this approved Scouting authority.');
  }else if(approvalCount>0){
    setFlow('scouting3Shortlist','active','REVIEW','scouting3ShortlistMeta',
      `${approvalCount} eligible target${approvalCount===1?'':'s'} waiting for Director of Football approval.`);
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
  }else if(approvalCount===0){
    if(status)status.textContent='EVIDENCE REVIEW';
    if(priority)priority.textContent='Candidates exist, but none currently pass the eligibility gates.';
    if(next)next.textContent='Review candidate evidence and blocked reasons';
    if(meta)meta.textContent='Use the shortlist and Evidence Room to resolve missing or weak evidence.';
    if(btn){btn.textContent='Open Evidence Room';btn.dataset.action='evidence'}
  }else if(!approved){
    if(status){status.textContent=`${approvalCount} APPROVAL CANDIDATES • 0 APPROVED`;status.classList.add('good')}
    if(priority)priority.textContent='Ranked approval candidates are waiting for a Director of Football decision.';
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



/* =========================================================
   SCOUTING UI v1.3 — MULTI-SOURCE SIGNAL WATCH
   External source signal only; never automatic Active Scouting.
   ========================================================= */
(function(){
'use strict';

const OLD_KEY='aurora2:scouting:notable-investor-watch:v1';
const KEY='aurora2:scouting:signal-watch:v2';
const $=id=>document.getElementById(id);
const A=()=>window.Aurora2;

const BUFFETT=[{"ticker":"AAPL","name":"Apple"},{"ticker":"AXP","name":"American Express"},{"ticker":"KO","name":"Coca-Cola"},{"ticker":"BAC","name":"Bank of America"},{"ticker":"CVX","name":"Chevron"},{"ticker":"OXY","name":"Occidental"},{"ticker":"GOOGL","name":"Alphabet A"},{"ticker":"CB","name":"Chubb"},{"ticker":"ALLY","name":"Ally Financial Inc"},{"ticker":"GOOG","name":"Alphabet C"},{"ticker":"LLYVK","name":"Liberty Live C"},{"ticker":"LEN","name":"Lennar"},{"ticker":"NUE","name":"Nucor"},{"ticker":"LLYVA","name":"Liberty Live A"},{"ticker":"LPX","name":"Louisiana-Pacific"},{"ticker":"STZ","name":"Constellation Brands A"},{"ticker":"NVR","name":"NVR"},{"ticker":"M","name":"Macy's Inc"},{"ticker":"MCO","name":"Moody's"},{"ticker":"KHC","name":"Kraft Heinz"},{"ticker":"DVA","name":"DaVita"},{"ticker":"KR","name":"Kroger"},{"ticker":"SIRI","name":"Sirius XM"},{"ticker":"DAL","name":"Delta Air Lines"},{"ticker":"VRSN","name":"VeriSign"},{"ticker":"COF","name":"Capital One Financial"},{"ticker":"NYT","name":"New York Times"}].map((x,i)=>({
  ...x,
  sources:[{name:'Warren Buffett / Berkshire',date:'2026-08-14',note:'Visible in user-supplied Buffett list screenshots'}],
  seedId:`buffett-${i+1}`
}));

const CHAMPIONS=[{"ticker":"","name":"Exxon Mobil"},{"ticker":"","name":"Caterpillar"},{"ticker":"","name":"J&J"},{"ticker":"","name":"Lowe’s"},{"ticker":"","name":"Expeditors Washington"},{"ticker":"","name":"Brown&Brown"},{"ticker":"","name":"CH Robinson"},{"ticker":"","name":"Ecolab"},{"ticker":"","name":"Roper Technologies"},{"ticker":"","name":"Cincinnati Financial"},{"ticker":"","name":"Lincoln Electrics"},{"ticker":"","name":"Abbott Labs"},{"ticker":"","name":"Target"},{"ticker":"","name":"T Rowe"},{"ticker":"","name":"Nordson"},{"ticker":"","name":"Albemarle"},{"ticker":"","name":"McDonald’s"},{"ticker":"","name":"Franklin Resources"},{"ticker":"","name":"PPG Industries"},{"ticker":"","name":"Genuine Parts"},{"ticker":"","name":"Enterprise Products Partners LP"},{"ticker":"","name":"WW Grainger"},{"ticker":"NUE","name":"Nucor"},{"ticker":"","name":"Aflac"},{"ticker":"","name":"Becton Dickinson"},{"ticker":"","name":"Church&Dwight"},{"ticker":"CB","name":"Chubb"},{"ticker":"","name":"Emerson"},{"ticker":"","name":"Illinois Tool Works"},{"ticker":"","name":"Atmos Energy"}].map((x,i)=>({
  ...x,
  sources:[{name:'Dividend Champions',date:'2026-08-14',note:'Visible in user-supplied Dividend Champions screenshots'}],
  seedId:`champion-${i+1}`
}));

let statusFilter='all';
let sourceFilter='all';

function esc(v){
  return String(v??'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
}
function norm(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function nameNorm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}

const NAME_ALIASES={
  'j j':['johnson johnson'],
  'lowe s':['lowes'],
  'brown brown':['brown and brown'],
  'ch robinson':['c h robinson','ch robinson worldwide'],
  't rowe':['t rowe price'],
  'church dwight':['church and dwight'],
  'ww grainger':['w w grainger'],
  'mcdonald s':['mcdonalds'],
  'lincoln electrics':['lincoln electric']
};

function sourcesOf(row){
  if(Array.isArray(row?.sources))return row.sources.filter(Boolean);
  if(row?.source)return [{name:String(row.source),date:row.sourceDate||'',note:row.note||''}];
  return [];
}
function keyOf(row){
  const t=norm(row?.ticker);
  if(t)return 'T:'+t;
  return 'N:'+nameNorm(row?.name);
}
function compatible(a,b){
  const at=norm(a?.ticker), bt=norm(b?.ticker);
  if(at&&bt&&at===bt)return true;
  const an=nameNorm(a?.name), bn=nameNorm(b?.name);
  if(an&&bn&&(an===bn||an.includes(bn)||bn.includes(an)))return true;
  return false;
}
function mergeRows(rows){
  const out=[];
  rows.forEach(raw=>{
    const row={...raw,sources:sourcesOf(raw)};
    let hit=out.find(x=>compatible(x,row));
    if(!hit){
      hit={
        id:raw.id||raw.seedId||`watch-${Date.now()}-${out.length}`,
        ticker:raw.ticker||'',
        name:raw.name||'',
        sources:[]
      };
      out.push(hit);
    }
    if(!hit.ticker&&row.ticker)hit.ticker=row.ticker;
    if(!hit.name&&row.name)hit.name=row.name;
    row.sources.forEach(src=>{
      if(!hit.sources.some(x=>String(x.name)===String(src.name))){
        hit.sources.push(src);
      }
    });
  });
  return out;
}
function fullSeed(){return mergeRows([...BUFFETT,...CHAMPIONS])}

function load(){
  try{
    const current=JSON.parse(localStorage.getItem(KEY)||'null');
    if(Array.isArray(current))return mergeRows(current);
  }catch(_){
  }

  // Migrate the user's existing v1.2 list rather than resetting it.
  let old=null;
  try{old=JSON.parse(localStorage.getItem(OLD_KEY)||'null')}catch(_){old=null}
  const initial=Array.isArray(old)
    ? mergeRows([...old,...CHAMPIONS])
    : fullSeed();
  save(initial);
  return initial;
}
function save(rows){localStorage.setItem(KEY,JSON.stringify(mergeRows(rows)))}
function state(){try{return A()?.core?.read?.()||{}}catch(_){return {}}}
function universe(s){return Array.isArray(s?.scouting?.universe)?s.scouting.universe:[]}
function targets(s){return Array.isArray(s?.scouting?.targets)?s.scouting.targets:[]}

function tickerOf(row){
  return norm(row?.ticker||row?.symbol||row?.marketSymbol||row?.code||'');
}
function companyNames(row){
  const base=nameNorm(row?.name||row?.company||row?.companyName||row?.security||'');
  const aliases=NAME_ALIASES[base]||[];
  return [base,...aliases].filter(Boolean);
}
function itemNames(item){
  const base=nameNorm(item?.name);
  return [base,...(NAME_ALIASES[base]||[])].filter(Boolean);
}
function matchRow(item,rows){
  const t=norm(item.ticker);
  const names=itemNames(item);
  return rows.find(r=>{
    const rt=tickerOf(r);
    if(t&&rt&&(rt===t||rt.endsWith(t)||t.endsWith(rt)))return true;
    const rowNames=companyNames(r);
    return names.some(n=>rowNames.some(rn=>rn===n||rn.includes(n)||n.includes(rn)));
  })||null;
}
function classify(item,s){
  const active=matchRow(item,targets(s));
  if(active)return {status:'active',match:active};
  const network=matchRow(item,universe(s));
  if(network)return {status:'network',match:network};
  return {status:'missing',match:null};
}
function statusLabel(status){
  return status==='active'?'ACTIVE SCOUTING':status==='network'?'GLOBAL NETWORK':'NEEDS MATCH';
}
function sourceNames(item){return sourcesOf(item).map(s=>String(s.name||'')).filter(Boolean)}
function sourceClass(name){
  return /buffett|berkshire/i.test(name)?'buffett':/champion/i.test(name)?'champion':'';
}

function render(){
  const rows=load();
  const s=state();
  const evaluated=rows.map(item=>({item,...classify(item,s)}));
  const filtered=evaluated.filter(x=>
    (statusFilter==='all'||x.status===statusFilter) &&
    (sourceFilter==='all'||sourceNames(x.item).includes(sourceFilter))
  );

  if($('scouting12WatchCount'))$('scouting12WatchCount').textContent=rows.length;
  if($('scouting13SourceCount')){
    const allSources=new Set(rows.flatMap(sourceNames));
    $('scouting13SourceCount').textContent=allSources.size;
  }
  if($('scouting12NetworkCount'))$('scouting12NetworkCount').textContent=evaluated.filter(x=>x.status==='network').length;
  if($('scouting12ActiveCount'))$('scouting12ActiveCount').textContent=evaluated.filter(x=>x.status==='active').length;
  if($('scouting12MissingCount'))$('scouting12MissingCount').textContent=evaluated.filter(x=>x.status==='missing').length;

  const host=$('scouting12WatchList');
  if(!host)return;
  if(!filtered.length){
    host.innerHTML='<div class="scouting11-empty">No watchlist companies match the selected source/status filters.</div>';
    return;
  }

  host.innerHTML=filtered.map(x=>{
    const m=x.match||{};
    const srcs=sourceNames(x.item);
    const overlap=srcs.length>1;
    const detail=x.status==='active'
      ? `${m.recommendation||m.status||'Active'} • ${Number(m.yieldPct||0).toFixed(2)}% yield • assessed by Scouting`
      : x.status==='network'
        ? 'Matched in the Global Network. Review its evidence before any promotion to Active Scouting.'
        : 'No current Global Network / Active Scouting match. Keep it watched until Aurora has enough evidence.';
    const action=x.status==='active'?'Open Active Scouting':x.status==='network'?'Find in Global Network':'Keep on Watch';
    return `<article class="scouting12-watch-row ${x.status} ${overlap?'scouting13-overlap':''}">
      <div class="scouting12-watch-copy">
        <strong>${x.item.ticker?`<b>${esc(x.item.ticker)}</b> — `:''}${esc(x.item.name||'Unnamed company')}</strong>
        <span>${esc(detail)}</span>
        <div class="scouting13-source-tags">
          ${srcs.map(src=>`<span class="scouting13-source-tag ${sourceClass(src)}">${esc(src)}</span>`).join('')}
          ${overlap?'<span class="scouting13-overlap-badge">MULTI-SOURCE SIGNAL</span>':''}
        </div>
        <div class="scouting12-watch-tags">
          <span class="scouting12-watch-tag ${x.status}">${statusLabel(x.status)}</span>
        </div>
      </div>
      <div class="scouting12-watch-side">
        <button type="button" data-watch-open="${esc(x.item.id)}">${action}</button>
        <button type="button" class="remove" data-watch-remove="${esc(x.item.id)}">Remove</button>
      </div>
    </article>`;
  }).join('');
}

function flashMatch(containerSelector,item){
  const root=document.querySelector(containerSelector);
  if(!root)return false;
  const needles=[norm(item.ticker),...itemNames(item)].filter(Boolean).map(x=>String(x).toLowerCase());
  const nodes=[...root.querySelectorAll('tr,article,.target-card,.network-row,.network-card')];
  const match=nodes.find(el=>{
    const text=(el.textContent||'').toLowerCase();
    return needles.some(n=>text.includes(n));
  });
  if(!match)return false;
  match.classList.add('scouting12-highlight');
  match.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>match.classList.remove('scouting12-highlight'),3200);
  return true;
}
function openItem(id){
  const item=load().find(x=>String(x.id)===String(id));
  if(!item)return;
  const c=classify(item,state());
  if(c.status==='active'){
    $('shortlistSection')?.scrollIntoView({behavior:'smooth',block:'start'});
    setTimeout(()=>flashMatch('#shortlistSection',item),500);
  }else if(c.status==='network'){
    $('globalNetworkSection')?.scrollIntoView({behavior:'smooth',block:'start'});
    setTimeout(()=>flashMatch('#globalNetworkSection',item),650);
  }
}

function add(){
  const source=String($('scouting12SourceInput')?.value||'Manual Watch').trim()||'Manual Watch';
  const ticker=String($('scouting12TickerInput')?.value||'').trim().toUpperCase();
  const name=String($('scouting12NameInput')?.value||'').trim();
  if(!ticker&&!name)return;

  const rows=load();
  let hit=rows.find(x=>compatible(x,{ticker,name}));
  const src={name:source,date:new Date().toISOString().slice(0,10),note:'Manually added scouting signal'};
  if(hit){
    hit.sources=sourcesOf(hit);
    if(!hit.sources.some(x=>x.name===source))hit.sources.push(src);
    if(!hit.ticker&&ticker)hit.ticker=ticker;
    if(!hit.name&&name)hit.name=name;
  }else{
    rows.unshift({
      id:`watch-${Date.now()}`,
      ticker,name,
      sources:[src]
    });
  }
  save(rows);
  if($('scouting12TickerInput'))$('scouting12TickerInput').value='';
  if($('scouting12NameInput'))$('scouting12NameInput').value='';
  render();
}
function remove(id){save(load().filter(x=>String(x.id)!==String(id)));render()}
function restore(){
  save(fullSeed());
  sourceFilter='all';statusFilter='all';
  document.querySelectorAll('.scouting13-source').forEach(b=>b.classList.toggle('active',b.dataset.watchSource==='all'));
  document.querySelectorAll('.scouting12-filter').forEach(b=>b.classList.toggle('active',b.dataset.watchFilter==='all'));
  render();
}
function clear(){save([]);render()}

function bind(){
  $('scouting12Add')?.addEventListener('click',add);
  $('scouting12TickerInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')add()});
  $('scouting12NameInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')add()});
  $('scouting12RestoreSeed')?.addEventListener('click',restore);
  $('scouting12Clear')?.addEventListener('click',clear);

  document.addEventListener('click',event=>{
    const sf=event.target.closest('[data-watch-source]');
    if(sf){
      sourceFilter=sf.dataset.watchSource||'all';
      document.querySelectorAll('.scouting13-source').forEach(b=>b.classList.toggle('active',b===sf));
      render();return;
    }
    const f=event.target.closest('[data-watch-filter]');
    if(f){
      statusFilter=f.dataset.watchFilter||'all';
      document.querySelectorAll('.scouting12-filter').forEach(b=>b.classList.toggle('active',b===f));
      render();return;
    }
    const open=event.target.closest('[data-watch-open]');
    if(open){openItem(open.dataset.watchOpen);return}
    const rem=event.target.closest('[data-watch-remove]');
    if(rem){remove(rem.dataset.watchRemove);return}
  });

  const observer=new MutationObserver(()=>render());
  ['targetList','networkTotal','globalNetworkSection','kCandidates','scoutingStatus'].forEach(id=>{
    const el=$(id);if(el)observer.observe(el,{childList:true,subtree:true,attributes:true});
  });
  window.addEventListener('storage',e=>{
    if(e.key===KEY||e.key===OLD_KEY||e.key?.includes('aurora2'))setTimeout(render,70);
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(render,80)});

  render();setTimeout(render,700);setTimeout(render,1800);
}
document.addEventListener('DOMContentLoaded',bind);
})();
