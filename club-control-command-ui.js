/* =========================================================
   AURORA 2 — SCOUTING AUTHORITY → TRANSFER SIZING BRIDGE v1
   ---------------------------------------------------------
   Department ownership:
     Scouting decides WHO is eligible and ranked.
     Transfer decides HOW MUCH to allocate across that ranked pool.

   This wraps Aurora2.transferEngine.simulate() before page boot.
   It does not change Finance budgets, Registration or canonical holdings.
   ========================================================= */
(function(w){
'use strict';

function installScoutingAuthorityBridge(){
  const A=w.Aurora2;
  const engine=A?.transferEngine;
  if(!engine?.simulate || engine.__scoutingAuthorityV1)return false;

  const baseSimulate=engine.simulate.bind(engine);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{
    const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  };
  const ticker=v=>String(v||'')
    .replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'')
    .toUpperCase().trim();

  function strategyOf(state,opts){
    const raw=String(
      opts?.strategy ??
      state?.scouting?.strategy ??
      state?.transfer?.settings?.strategy ??
      'sustainable'
    ).toLowerCase();
    return raw==='maximum'?'maximum':'sustainable';
  }
  function activeRank(t,strategy){
    const rank=num(strategy==='maximum'?t?.maximumRank:t?.rank);
    return rank>0?rank:999999;
  }
  function activeScore(t,strategy){
    const score=num(strategy==='maximum'?t?.maximumScore:t?.sustainableScore);
    if(score>0)return score;
    return Math.max(0,num(engine.targetScore?.(t,strategy)));
  }
  function effectiveBroker(state,t){
    try{return String(engine.effectiveBroker?.(state,t)||'CHECK').toUpperCase()}
    catch(_){return 'CHECK'}
  }
  function authorityStatus(state){
    const status=String(state?.scouting?.status||'').toUpperCase();
    const mission=String(state?.mission?.status||'').toUpperCase();
    return status==='SCOUTING_READY'||mission==='SCOUTING_READY'
      ?'APPROVED_SHORTLIST'
      :'RANKED_ACTIVE_SCOUTING';
  }

  function rankedEligible(state,opts,strategy){
    const exclude=ticker(opts?.excludeTicker);
    const scope=String(
      opts?.brokerScope ??
      state?.transfer?.settings?.brokerScope ??
      'both'
    ).toUpperCase();

    return arr(state?.scouting?.targets)
      .filter(t=>String(t?.status||'').toLowerCase()!=='block')
      .filter(t=>num(t?.yieldPct)>0)
      .filter(t=>!exclude||ticker(t?.ticker)!==exclude)
      .filter(t=>{
        if(scope==='BOTH')return true;
        return effectiveBroker(state,t)===scope;
      })
      .map(t=>({
        target:t,
        id:String(t?.id||ticker(t?.ticker)),
        rank:activeRank(t,strategy),
        score:activeScore(t,strategy),
        ticker:ticker(t?.ticker)
      }))
      .sort((a,b)=>
        a.rank-b.rank ||
        b.score-a.score ||
        a.ticker.localeCompare(b.ticker)
      );
  }

  function decorate(result,authorityRows,state,strategy,mode){
    if(!result||typeof result!=='object')return result;
    const byId=new Map();
    const byTicker=new Map();
    authorityRows.forEach(x=>{
      byId.set(x.id,x);
      byTicker.set(x.ticker,x);
    });

    const allocations=arr(result.allocations).map(a=>{
      const row=byId.get(String(a?.targetId||''))||byTicker.get(ticker(a?.ticker));
      return {
        ...a,
        scoutingRank:row?.rank<999999?row.rank:0,
        scoutingAuthorityScore:row?.score||num(a?.scoutingScore),
        scoutingAuthority:mode
      };
    }).sort((a,b)=>
      (num(a.scoutingRank)||999999)-(num(b.scoutingRank)||999999) ||
      num(b.amount)-num(a.amount)
    );

    return {
      ...result,
      allocations,
      scoutingAuthority:mode,
      scoutingAuthorityStrategy:strategy,
      authorityPoolTickers:authorityRows.map(x=>x.ticker),
      authorityPoolCount:authorityRows.length,
      allocationMode:'SCOUTING_AUTHORITY_THEN_TRANSFER_SIZING'
    };
  }

  engine.simulate=function(state,opts={}){
    const strategy=strategyOf(state,opts);

    // Explicit Custom Basket remains an intentional user override.
    if(Array.isArray(opts?.targetIds)){
      const custom=baseSimulate(state,opts);
      const selected=rankedEligible(state,opts,strategy)
        .filter(x=>opts.targetIds.map(String).includes(x.id));
      return decorate(custom,selected,state,strategy,'CUSTOM_BASKET');
    }

    const ranked=rankedEligible(state,opts,strategy);
    const budget=Math.max(0,num(opts?.budget));
    if(!(budget>0)||!ranked.length){
      return decorate(
        baseSimulate(state,opts),
        ranked,
        state,
        strategy,
        authorityStatus(state)
      );
    }

    const inc=Math.max(
      1,
      num(opts?.increment ?? state?.transfer?.settings?.increment ?? 25) || 25
    );
    const requestedMin=Math.max(
      inc,
      num(opts?.minAllocation ?? state?.transfer?.settings?.minAllocation ?? 250) || 250
    );
    const maxTargets=Math.max(
      1,
      Math.floor(num(opts?.maxTargets ?? state?.transfer?.settings?.maxTargets ?? 8) || 8)
    );

    /*
     * Candidate COUNT is now assessed in Scouting-rank order.
     * _routeScore deliberately uses the active Scouting score here.
     * Yield/concentration are not allowed to choose a lower-ranked company
     * before the authorised recruitment pool is established.
     */
    const countInput=ranked.map(x=>({
      ...x.target,
      _routeScore:Math.max(.0001,x.score)
    }));
    const desired=typeof engine.desiredTargetCount==='function'
      ?engine.desiredTargetCount(budget,countInput,maxTargets,requestedMin,inc)
      :Math.min(maxTargets,ranked.length);

    const count=Math.max(1,Math.min(ranked.length,maxTargets,desired||1));
    const authorityRows=ranked.slice(0,count);
    const targetIds=authorityRows.map(x=>x.id);

    /*
     * Transfer's existing engine now receives only the authorised top-ranked
     * Scouting pool. Its existing yield, concentration, caps, increments and
     * holdback logic still decide allocation sizes inside that pool.
     */
    const result=baseSimulate(state,{...opts,targetIds});
    return decorate(
      result,
      authorityRows,
      state,
      strategy,
      authorityStatus(state)
    );
  };

  engine.__scoutingAuthorityV1=true;
  engine.scoutingAuthorityVersion='1.0';
  return true;
}

if(!installScoutingAuthorityBridge()){
  // Defensive retry if script order ever changes in a future shell.
  [0,50,150,400].forEach(ms=>setTimeout(installScoutingAuthorityBridge,ms));
}

})(window);


(function(){
'use strict';

function jump(id){
  const target=document.getElementById(id);
  if(!target)return;
  const offset=(document.querySelector('.aurora-shell-header')?.offsetHeight||0)+(document.querySelector('.chairman-jumpbar')?.offsetHeight||0)+18;
  const top=target.getBoundingClientRect().top+window.scrollY-offset;
  window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
}

document.addEventListener('click',event=>{
  const btn=event.target.closest('[data-chair-jump]');
  if(!btn)return;
  event.preventDefault();
  jump(btn.dataset.chairJump);
});

document.addEventListener('DOMContentLoaded',()=>{
  const label=document.getElementById('currentDepartment');
  if(label)label.textContent="CHAIRMAN'S OFFICE • CLUB CONTROL";
  document.title="Aurora City FC — Chairman's Office";
});
})();


/* =========================================================
   CHAIRMAN'S OFFICE UI v1.1 — REVIEW BOARD & OFFER CARDS
   Presentation only. club-control.js remains the decision engine.
   ========================================================= */
(function(){
'use strict';

const $=id=>document.getElementById(id);
const moneyValue=text=>{
  const n=Number(String(text||'').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:0;
};
const esc=v=>String(v??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");

const CSS=`
/* Chairman Market Board v1.1 */
#marketBoardSection{
  border-color:rgba(225,181,85,.18)!important;
  background:
    radial-gradient(circle at 0% 0%,rgba(225,181,85,.055),transparent 30%),
    radial-gradient(circle at 100% 0%,rgba(141,105,49,.035),transparent 30%),
    linear-gradient(145deg,rgba(20,15,7,.75),rgba(5,8,13,.985))!important;
}
#marketBoardSection .market-wrap{
  display:none!important;
}
.chairman-board-agenda{
  display:grid;
  grid-template-columns:minmax(0,1.35fr) minmax(340px,.65fr);
  gap:11px;
  margin-top:15px;
}
.chairman-agenda-brief,
.chairman-mandate{
  min-width:0;
  padding:16px;
  border:1px solid rgba(225,181,85,.085);
  border-radius:14px;
  background:rgba(225,181,85,.014);
}
.chairman-agenda-brief small,
.chairman-mandate small,
.chairman-board-kpis small,
.chairman-offer-card small{
  display:block;
  color:#9a855c;
  font-size:8px;
  font-weight:1000;
  letter-spacing:.10em;
}
.chairman-agenda-brief strong{
  display:block;
  margin-top:6px;
  color:#f6e5bd;
  font-size:20px;
  letter-spacing:-.025em;
}
.chairman-agenda-brief span{
  display:block;
  margin-top:5px;
  color:#8f826b;
  font-size:9px;
  line-height:1.5;
}
.chairman-agenda-brief strong.clear{color:#baffd0}
.chairman-mandate-row{
  display:flex;
  gap:6px;
  flex-wrap:wrap;
  margin-top:9px;
}
.chairman-mandate-chip{
  min-height:29px;
  display:inline-flex;
  align-items:center;
  padding:0 8px;
  border:1px solid rgba(255,255,255,.055);
  border-radius:999px;
  background:rgba(255,255,255,.01);
  color:#8f8779;
  font-size:7px;
  font-weight:950;
  white-space:nowrap;
}
.chairman-mandate-chip.gold{
  color:#f1d893;
  border-color:rgba(225,181,85,.12);
  background:rgba(225,181,85,.025);
}

.chairman-board-kpis{
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:8px;
  margin-top:10px;
}
.chairman-board-kpis>article{
  position:relative;
  overflow:hidden;
  min-height:100px;
  padding:13px;
  border:1px solid rgba(255,255,255,.045);
  border-radius:12px;
  background:rgba(255,255,255,.008);
}
.chairman-board-kpis>article:before{
  content:"";
  position:absolute;
  left:0;top:0;bottom:0;
  width:3px;
  background:#d7b66a;
}
.chairman-board-kpis>article.strong:before{background:#73dfa1}
.chairman-board-kpis>article.value:before{background:#d7b66a}
.chairman-board-kpis>article.profit:before{background:#73dfa1}
.chairman-board-kpis>article.income:before{background:#a98bff}
.chairman-board-kpis>article.excluded:before{background:#66717b}
.chairman-board-kpis strong{
  display:block;
  margin-top:7px;
  color:#f2e6ca;
  font-size:23px;
  letter-spacing:-.035em;
}
.chairman-board-kpis span{
  display:block;
  margin-top:4px;
  color:#7f7768;
  font-size:8px;
  line-height:1.4;
}

.chairman-offers-head{
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:flex-end;
  margin-top:18px;
}
.chairman-offers-head small{
  display:block;
  color:#a28a5a;
  font-size:8px;
  font-weight:1000;
  letter-spacing:.12em;
}
.chairman-offers-head h4{
  margin:4px 0 0;
  color:#f4e9d0;
  font-size:19px;
}
.chairman-offers-head p{
  margin:5px 0 0;
  color:#827968;
  font-size:9px;
  line-height:1.5;
}
.chairman-offers-head>span{
  color:#95876d;
  font-size:8px;
  white-space:nowrap;
}

.chairman-review-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:10px;
  margin-top:11px;
}
.chairman-offer-card{
  position:relative;
  overflow:hidden;
  min-width:0;
  padding:16px;
  border:1px solid rgba(225,181,85,.095);
  border-radius:16px;
  background:
    radial-gradient(circle at 100% 0%,rgba(225,181,85,.045),transparent 32%),
    rgba(255,255,255,.008);
  transition:.16s ease;
}
.chairman-offer-card:before{
  content:"";
  position:absolute;
  left:0;top:0;bottom:0;
  width:4px;
  background:#d7b66a;
}
.chairman-offer-card.strong{
  border-color:rgba(115,223,161,.13);
  background:
    radial-gradient(circle at 100% 0%,rgba(115,223,161,.05),transparent 32%),
    rgba(255,255,255,.008);
}
.chairman-offer-card.strong:before{background:#73dfa1}
.chairman-offer-card.selected{
  box-shadow:0 0 0 1px rgba(225,181,85,.18),0 15px 30px rgba(0,0,0,.18);
}
.chairman-offer-card:hover{
  transform:translateY(-1px);
  border-color:rgba(225,181,85,.18);
}
.chairman-offer-top{
  display:flex;
  justify-content:space-between;
  gap:10px;
  align-items:flex-start;
}
.chairman-offer-title strong{
  display:block;
  margin-top:5px;
  color:#f4ead6;
  font-size:19px;
  letter-spacing:-.025em;
}
.chairman-offer-title span{
  display:block;
  margin-top:4px;
  color:#887f70;
  font-size:9px;
}
.chairman-review-pill{
  min-height:29px;
  display:inline-flex;
  align-items:center;
  padding:0 8px;
  border:1px solid rgba(225,181,85,.15);
  border-radius:999px;
  background:rgba(225,181,85,.035);
  color:#f2d993;
  font-size:7px;
  font-weight:1000;
  white-space:nowrap;
}
.chairman-offer-card.strong .chairman-review-pill{
  color:#baffd0;
  border-color:rgba(115,223,161,.17);
  background:rgba(115,223,161,.035);
}
.chairman-offer-gain{
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:end;
  margin-top:13px;
  padding:12px;
  border:1px solid rgba(255,255,255,.04);
  border-radius:11px;
  background:rgba(255,255,255,.007);
}
.chairman-offer-gain small{color:#807565}
.chairman-offer-gain strong{
  display:block;
  margin-top:4px;
  color:#f1d893;
  font-size:28px;
  letter-spacing:-.045em;
}
.chairman-offer-card.strong .chairman-offer-gain strong{color:#9cf0bb}
.chairman-offer-gain>span{
  color:#8a8172;
  font-size:9px;
  text-align:right;
}
.chairman-offer-metrics{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:7px;
  margin-top:8px;
}
.chairman-offer-metrics>div{
  min-width:0;
  min-height:69px;
  padding:9px;
  border:1px solid rgba(255,255,255,.04);
  border-radius:9px;
  background:rgba(255,255,255,.006);
}
.chairman-offer-metrics small{font-size:6px;color:#746c60}
.chairman-offer-metrics strong{
  display:block;
  margin-top:5px;
  color:#dcd4c3;
  font-size:10px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.chairman-offer-note{
  margin-top:9px;
  padding:10px;
  border-left:2px solid rgba(225,181,85,.22);
  background:rgba(225,181,85,.018);
  color:#817866;
  font-size:8px;
  line-height:1.55;
}
.chairman-offer-card.strong .chairman-offer-note{
  border-left-color:rgba(115,223,161,.28);
}
.chairman-offer-actions{
  display:flex;
  justify-content:space-between;
  gap:9px;
  align-items:center;
  margin-top:11px;
}
.chairman-offer-actions span{
  color:#746c60;
  font-size:7px;
}
.chairman-open-review{
  min-height:38px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:0 11px;
  border:1px solid rgba(225,181,85,.17);
  border-radius:9px;
  background:linear-gradient(90deg,rgba(225,181,85,.10),rgba(225,181,85,.035));
  color:#f4dfaa;
  font:inherit;
  font-size:8px;
  font-weight:1000;
  cursor:pointer;
}
.chairman-offer-card.strong .chairman-open-review{
  border-color:rgba(115,223,161,.17);
  background:linear-gradient(90deg,rgba(115,223,161,.08),rgba(225,181,85,.035));
  color:#c8f5d8;
}

.chairman-board-empty{
  grid-column:1/-1;
  min-height:180px;
  display:grid;
  place-items:center;
  padding:24px;
  border:1px dashed rgba(115,223,161,.13);
  border-radius:15px;
  background:rgba(115,223,161,.012);
  text-align:center;
}
.chairman-board-empty strong{
  display:block;
  color:#baffd0;
  font-size:18px;
}
.chairman-board-empty span{
  display:block;
  max-width:620px;
  margin-top:7px;
  color:#758178;
  font-size:9px;
  line-height:1.55;
}
.chairman-board-excluded{
  margin-top:10px;
  padding:10px 12px;
  border:1px solid rgba(255,255,255,.035);
  border-radius:10px;
  background:rgba(255,255,255,.006);
  color:#6f6c66;
  font-size:8px;
  line-height:1.5;
}

/* A little more boardroom polish outside the market board */
#rotationCase{
  border-color:rgba(225,181,85,.12)!important;
}
#rotationCase .sale-btn.active{
  border-color:rgba(225,181,85,.24)!important;
  box-shadow:0 0 0 1px rgba(225,181,85,.08);
}
#guardrailsSection{
  background:
    radial-gradient(circle at 100% 0%,rgba(225,181,85,.035),transparent 32%),
    linear-gradient(145deg,rgba(15,12,7,.45),rgba(4,8,13,.98))!important;
}
#guardrailsSection .calc-row strong{
  color:#d8c69d;
}
.chairman-jumpbar button:first-child{
  color:#f0d38d!important;
  border-color:rgba(225,181,85,.14)!important;
}

@media(max-width:1120px){
  .chairman-board-agenda{grid-template-columns:1fr}
  .chairman-board-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(max-width:900px){
  .chairman-review-grid{grid-template-columns:1fr}
}
@media(max-width:700px){
  .chairman-board-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .chairman-offer-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
}
`;

function ensureStyles(){
  if($('chairmanBoardV11Styles'))return;
  const style=document.createElement('style');
  style.id='chairmanBoardV11Styles';
  style.textContent=CSS;
  document.head.appendChild(style);
}

function cleanText(v){
  return String(v||'').replace(/\s+/g,' ').trim();
}
function triggerCode(row){
  const trigger=row.querySelector('td:nth-child(9) .trigger');
  if(!trigger)return 'unknown';
  if(trigger.classList.contains('strong'))return 'strong';
  if(trigger.classList.contains('review'))return 'review';
  if(trigger.classList.contains('micro'))return 'micro';
  if(trigger.classList.contains('locked'))return 'locked';
  if(trigger.classList.contains('keep'))return 'keep';
  return 'other';
}
function rowData(row,index){
  const cells=[...row.querySelectorAll('td')];
  if(cells.length<10)return null;
  const player=cells[0];
  const trigger=cells[8]?.querySelector('.trigger');
  return {
    row,
    index,
    ticker:cleanText(player?.querySelector('strong')?.textContent)||'—',
    name:cleanText(player?.querySelector('span')?.textContent)||'',
    account:cleanText(cells[1]?.textContent),
    value:cleanText(cells[2]?.textContent),
    book:cleanText(cells[3]?.textContent),
    profit:cleanText(cells[4]?.textContent),
    income:cleanText(cells[5]?.textContent).replace(/\s*\/\s*yr/i,'/yr'),
    gain:cleanText(cells[6]?.textContent),
    materiality:cleanText(cells[7]?.textContent),
    trigger:cleanText(trigger?.textContent),
    code:triggerCode(row),
    selected:row.classList.contains('selected'),
    reviewButton:cells[9]?.querySelector('[data-review]')
  };
}

function parseRows(){
  const body=$('marketRows');
  if(!body)return [];
  return [...body.querySelectorAll(':scope > tr')]
    .map(rowData)
    .filter(Boolean);
}

function ensureBoard(){
  const section=$('marketBoardSection');
  if(!section)return null;

  let shell=$('chairmanReviewBoardV11');
  if(shell)return shell;

  const head=section.querySelector('.chairman-panel-head');
  const wrap=section.querySelector('.market-wrap');
  if(!head||!wrap)return null;

  // Rewrite only presentation copy. The underlying Chairman engine remains unchanged.
  const kicker=head.querySelector('.chairman-panel-kicker');
  const title=head.querySelector('h3');
  const copy=head.querySelector('.chairman-copy');
  const note=head.querySelector('.chairman-panel-note');
  if(kicker)kicker.textContent='Boardroom Agenda';
  if(title)title.textContent="Chairman's Market Board — Reviews Only";
  if(copy)copy.textContent='Only materially meaningful +6% and +10% Chairman review cases appear here. Keep-zone, locked and micro positions stay off the agenda.';
  if(note)note.textContent='REVIEW QUEUE';

  shell=document.createElement('div');
  shell.id='chairmanReviewBoardV11';
  shell.innerHTML=`
    <div class="chairman-board-agenda">
      <div class="chairman-agenda-brief">
        <small>BOARDROOM AGENDA</small>
        <strong id="chairmanAgendaTitle">Checking review cases…</strong>
        <span id="chairmanAgendaMeta">Chairman is reading the live Squad review classifications.</span>
      </div>
      <div class="chairman-mandate">
        <small>CHAIRMAN'S MANDATE</small>
        <div class="chairman-mandate-row">
          <span class="chairman-mandate-chip gold">SCENARIO ONLY</span>
          <span class="chairman-mandate-chip">NO AUTO-SELL</span>
          <span class="chairman-mandate-chip">INCOME CHECK</span>
          <span class="chairman-mandate-chip">TRANSFER SIMULATION</span>
          <span class="chairman-mandate-chip">SCOUTING REPLACEMENT</span>
        </div>
      </div>
    </div>

    <div class="chairman-board-kpis">
      <article><small>Open Reviews</small><strong id="chairmanOpenReviews">0</strong><span>material cases on agenda</span></article>
      <article class="strong"><small>Strong Reviews</small><strong id="chairmanStrongReviews">0</strong><span>+10% trigger cases</span></article>
      <article class="value"><small>Review Value</small><strong id="chairmanReviewValue">£0.00</strong><span>market value under review</span></article>
      <article class="profit"><small>Capital Profit</small><strong id="chairmanReviewProfit">£0.00</strong><span>current P/L across reviews</span></article>
      <article class="income"><small>Income at Stake</small><strong id="chairmanReviewIncome">£0.00</strong><span>annual income attached</span></article>
    </div>

    <div class="chairman-offers-head">
      <div>
        <small>CHAIRMAN'S REVIEW OFFERS</small>
        <h4>Open Board Cases</h4>
        <p>Each card is a review opportunity, not a sell instruction. Open a card to load the existing Rotation Case below.</p>
      </div>
      <span id="chairmanOffersCount">0 OPEN</span>
    </div>

    <div class="chairman-review-grid" id="chairmanReviewGrid"></div>
    <div class="chairman-board-excluded" id="chairmanExcludedNote">Waiting for the live Market Board.</div>
  `;
  wrap.before(shell);
  return shell;
}

function formatMoney(value){
  return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(value||0);
}
function rationale(d){
  if(d.code==='strong'){
    return `Capital gain has cleared the +10% stronger-review trigger and the Chairman materiality gate. Open the case to test income surrender, dividend timing and Transfer replacement economics.`;
  }
  return `Capital gain has cleared the +6% review trigger and is materially meaningful. Open the case before making any decision so Income, Scouting and Transfer can be tested together.`;
}

function openOriginalReview(data){
  if(!data?.reviewButton)return;
  data.reviewButton.click();
  setTimeout(()=>jump('rotationCase'),70);
}

let rendering=false;
function renderBoard(){
  if(rendering)return;
  const shell=ensureBoard();
  if(!shell)return;

  const all=parseRows();
  // Use the codes already emitted by club-control.js. Do not recreate its decision rules here.
  const reviews=all.filter(d=>d.code==='strong'||d.code==='review');
  const excluded={
    keep:all.filter(d=>d.code==='keep').length,
    micro:all.filter(d=>d.code==='micro').length,
    locked:all.filter(d=>d.code==='locked').length,
    other:all.filter(d=>!['strong','review','keep','micro','locked'].includes(d.code)).length
  };

  const reviewValue=reviews.reduce((s,d)=>s+moneyValue(d.value),0);
  const reviewProfit=reviews.reduce((s,d)=>s+moneyValue(d.profit),0);
  const reviewIncome=reviews.reduce((s,d)=>s+moneyValue(d.income),0);
  const strong=reviews.filter(d=>d.code==='strong').length;

  const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
  set('chairmanOpenReviews',String(reviews.length));
  set('chairmanStrongReviews',String(strong));
  set('chairmanReviewValue',formatMoney(reviewValue));
  set('chairmanReviewProfit',`${reviewProfit>=0?'+':''}${formatMoney(reviewProfit)}`);
  set('chairmanReviewIncome',`${formatMoney(reviewIncome)}/yr`);
  set('chairmanOffersCount',`${reviews.length} OPEN`);

  const agenda=$('chairmanAgendaTitle');
  const agendaMeta=$('chairmanAgendaMeta');
  if(agenda){
    agenda.classList.toggle('clear',reviews.length===0);
    agenda.textContent=reviews.length
      ?`${reviews.length} Chairman review case${reviews.length===1?'':'s'} open`
      :'No market cases require Chairman review';
  }
  if(agendaMeta){
    agendaMeta.textContent=reviews.length
      ?`Next board case: ${reviews[0].ticker} • ${reviews[0].trigger} • ${reviews[0].gain} capital gain`
      :'The live Squad currently has no materially meaningful +6%/+10% review trigger.';
  }

  const grid=$('chairmanReviewGrid');
  if(grid){
    rendering=true;
    try{
      if(!reviews.length){
        grid.innerHTML=`
          <div class="chairman-board-empty">
            <div>
              <strong>✓ Board agenda clear</strong>
              <span>No materially meaningful +6% or +10% rotation review is currently open. Keep-zone, micro and locked holdings remain outside the Market Board until the Chairman engine promotes them.</span>
            </div>
          </div>`;
      }else{
        grid.innerHTML=reviews.map((d,i)=>`
          <article class="chairman-offer-card ${d.code==='strong'?'strong':''} ${d.selected?'selected':''}" data-chair-offer="${i}">
            <div class="chairman-offer-top">
              <div class="chairman-offer-title">
                <small>BOARD REVIEW ${String(i+1).padStart(2,'0')}</small>
                <strong>${esc(d.ticker)} — ${esc(d.name)}</strong>
                <span>${esc(d.account)} • ${esc(d.materiality)}</span>
              </div>
              <span class="chairman-review-pill">${esc(d.trigger)}</span>
            </div>

            <div class="chairman-offer-gain">
              <div>
                <small>CAPITAL GAIN</small>
                <strong>${esc(d.gain)}</strong>
              </div>
              <span>${esc(d.profit)} current capital P/L</span>
            </div>

            <div class="chairman-offer-metrics">
              <div><small>Market Value</small><strong>${esc(d.value)}</strong></div>
              <div><small>Book Cost</small><strong>${esc(d.book)}</strong></div>
              <div><small>Capital P/L</small><strong>${esc(d.profit)}</strong></div>
              <div><small>Annual Income</small><strong>${esc(d.income)}</strong></div>
            </div>

            <div class="chairman-offer-note">${esc(rationale(d))}</div>

            <div class="chairman-offer-actions">
              <span>Scenario only • no automatic selling</span>
              <button type="button" class="chairman-open-review" data-chair-open-review="${i}">Open Board Review →</button>
            </div>
          </article>`).join('');
      }
    }finally{
      rendering=false;
    }
  }

  const excludedTotal=excluded.keep+excluded.micro+excluded.locked+excluded.other;
  set(
    'chairmanExcludedNote',
    `${excludedTotal} Squad position${excludedTotal===1?' is':'s are'} intentionally off the agenda • ${excluded.keep} keep-zone • ${excluded.micro} micro • ${excluded.locked} locked${excluded.other?` • ${excluded.other} other`:''}. Full holdings remain in Squad Hub.`
  );

  // Keep current source rows available to button handlers, keyed by board index.
  shell.__chairmanReviewRows=reviews;
}

function bindBoard(){
  ensureStyles();
  const shell=ensureBoard();
  if(!shell)return;

  document.addEventListener('click',event=>{
    const btn=event.target.closest('[data-chair-open-review]');
    if(!btn)return;
    const index=Number(btn.dataset.chairOpenReview);
    const rows=$('chairmanReviewBoardV11')?.__chairmanReviewRows||[];
    openOriginalReview(rows[index]);
  });

  const source=$('marketRows');
  if(source){
    const observer=new MutationObserver(()=>requestAnimationFrame(renderBoard));
    observer.observe(source,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }

  window.addEventListener('aurora2:state',()=>setTimeout(renderBoard,0));
  window.addEventListener('storage',()=>setTimeout(renderBoard,30));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(renderBoard,30)});

  [0,80,280,800,1600].forEach(ms=>setTimeout(renderBoard,ms));
}

document.addEventListener('DOMContentLoaded',()=>{
  document.documentElement.dataset.chairmanUi='v1.1-review-board';
  bindBoard();
});
})();

/* Chairman v1.2 — show Scouting authority inside Transfer Simulation rows. */
(function(){
'use strict';
let painting=false;
function annotate(){
  if(painting)return;
  const A=window.Aurora2;
  const host=document.getElementById('basketList');
  if(!host||!A?.clubControl?.caseData)return;

  let data;
  try{data=A.clubControl.caseData()}catch(_){return}
  const allocations=Array.isArray(data?.sim?.allocations)?data.sim.allocations:[];
  const rows=[...host.querySelectorAll('.basket-row')];
  if(!rows.length||!allocations.length)return;

  painting=true;
  try{
    rows.forEach((row,i)=>{
      const a=allocations[i];
      if(!a)return;
      const nums=row.querySelectorAll('.basket-num');
      const scoreCell=nums[4];
      const small=scoreCell?.querySelector('small');
      if(small){
        const rank=Number(a.scoutingRank)||0;
        const label=rank?`Scouting #${rank} • score`:'Scouting score';
        if(small.textContent!==label)small.textContent=label;
      }
    });

    const meta=document.getElementById('basketMeta');
    if(meta&&data?.sim?.scoutingAuthority){
      const mode=data.sim.scoutingAuthority==='APPROVED_SHORTLIST'
        ?'approved Scouting shortlist'
        :data.sim.scoutingAuthority==='CUSTOM_BASKET'
          ?'custom basket'
          :'ranked Active Scouting';
      const base=`${allocations.length} Transfer-sized replacement${allocations.length===1?'':'s'} • `+
        `${window.Aurora2.ui.money(Number(data.sim.allocated)||0)} invested • `+
        `${window.Aurora2.ui.money(Number(data.sim.remaining)||0)} holdback • scenario only`;
      const next=`${base} • authority: ${mode}`;
      if(meta.textContent!==next)meta.textContent=next;
    }
  }finally{
    painting=false;
  }
}
document.addEventListener('DOMContentLoaded',()=>{
  const host=document.getElementById('basketList');
  if(host){
    const obs=new MutationObserver(()=>setTimeout(annotate,0));
    obs.observe(host,{childList:true,subtree:true});
  }
  [100,500,1200].forEach(ms=>setTimeout(annotate,ms));
});
window.addEventListener('aurora2:state',()=>setTimeout(annotate,20));
})();
