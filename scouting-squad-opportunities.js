/* Aurora 2 — Automated Squad Opportunity Table v3
 * Current holdings below recorded average cost and former holdings are
 * automatically monitored by Scouting. Provisional rows never receive fake
 * safety/confidence values and can never become a false BLOCK simply because
 * evidence is still loading.
 *
 * Opportunity detection is automatic. Scouting remains the evidence/ranking
 * authority; Transfer remains the purchase authority.
 */
(function(w){
  'use strict';
  if(w.AuroraSquadOpportunityWatch)return;

  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const norm=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const money=v=>`£${num(v).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:4})}`;
  const pct=v=>`${Math.abs(num(v)).toFixed(1)}%`;
  const tickerOf=v=>upper(v).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\..*$/,'');
  const now=()=>new Date().toISOString();
  const SOURCE='AURORA2_SQUAD_OPPORTUNITY_AUTO';

  let syncing=false;
  let holdingsRefreshRunning=false;

  function state(){try{return w.Aurora2?.core?.read?.()||null}catch(_){return null}}
  function strategyOf(s){return String(s?.scouting?.strategy||'sustainable').toLowerCase()==='maximum'?'maximum':'sustainable'}
  function activeScore(t,s){return t?num(strategyOf(s)==='maximum'?t.maximumScore:t.sustainableScore):0}
  function targetStatus(t){return String(t?.status||'').toLowerCase()}
  function locked(s){return !!s?.transfer?.route?.locked||['LOCKED','PARTIALLY_REGISTERED','COMPLETE'].includes(upper(s?.mission?.status))}
  function accountCode(v){const x=norm(v);if(/212/.test(x))return 'T212';if(/\big\b|ig isa/.test(x))return 'IG';return 'CHECK'}
  function accountLabel(v){const x=accountCode(v);return x==='IG'?'IG ISA':x==='T212'?'Trading 212':'Broker check'}

  function isOpportunityTarget(t){return String(t?.source||'')===SOURCE}
  function isBadProvisional(t){
    if(!isOpportunityTarget(t))return false;
    return t.opportunityEvidenceComplete!==true||t.requiresRefresh===true||
      !(num(t.yieldPct)>0)||!(num(t.livePriceGbp)>0)||
      !(num(t.dividendSafety)>0)||!(num(t.confidence)>0);
  }
  function usableTarget(t){return !!t&&!isBadProvisional(t)}

  function targetMap(s){
    const map=new Map();
    const strategy=strategyOf(s),weight={pass:3,caution:2,block:1};
    arr(s?.scouting?.targets).forEach(t=>{
      if(!usableTarget(t))return;
      const key=tickerOf(t?.ticker||t?.marketSymbol);if(!key)return;
      const prior=map.get(key);
      if(!prior){map.set(key,t);return}
      const a=weight[targetStatus(t)]||0,b=weight[targetStatus(prior)]||0;
      const sa=num(strategy==='maximum'?t.maximumScore:t.sustainableScore);
      const sb=num(strategy==='maximum'?prior.maximumScore:prior.sustainableScore);
      if(a>b||(a===b&&sa>sb))map.set(key,t);
    });
    return map;
  }

  function averageCost(h){
    return Math.max(0,num(h?.avgCostGbp)||(num(h?.shares)>0&&num(h?.bookCostGbp)>0?num(h.bookCostGbp)/num(h.shares):0));
  }
  function holdingLive(h){
    return Math.max(0,num(h?.livePriceGbp)||(num(h?.shares)>0&&num(h?.marketValueGbp)>0?num(h.marketValueGbp)/num(h.shares):0));
  }
  function holdingYield(h,live=holdingLive(h)){
    const explicit=Math.max(0,num(h?.yieldPct)||num(h?.dividendYield)||num(h?.yield));
    if(explicit>0)return explicit<=1?explicit*100:explicit;
    const dps=Math.max(0,num(h?.annualDpsGbp));
    if(dps>0&&live>0)return dps/live*100;
    const income=Math.max(0,num(h?.annualIncomeGbp));
    const value=Math.max(0,num(h?.marketValueGbp));
    if(income>0&&value>0)return income/value*100;
    return 0;
  }
  function rowNames(row){return [row?.name,row?.company,row?.companyName,row?.securityName].map(norm).filter(Boolean)}
  function matchesHolding(h,row){
    const ht=tickerOf(h?.ticker||h?.marketSymbol),rt=tickerOf(row?.ticker||row?.marketSymbol||row?.symbol);
    if(ht&&rt&&(ht===rt||rt.endsWith(ht)||ht.endsWith(rt)))return true;
    const hn=[h?.name,h?.company,h?.companyName].map(norm).filter(Boolean),rn=rowNames(row);
    return hn.some(n=>rn.some(x=>x===n||x.includes(n)||n.includes(x)));
  }
  function networkMatch(h,s){return arr(s?.scouting?.universe).find(row=>matchesHolding(h,row))||null}

  /* Some Aurora runtimes hydrate intelligence into state. Use it when present,
     but never infer a metric merely because another score exists. */
  function intelligenceRows(s){
    const out=[];
    const add=v=>{if(Array.isArray(v))v.forEach(x=>{if(x&&typeof x==='object')out.push(x)})};
    add(s?.intelligence?.rows);add(s?.intelligence?.holdings);add(s?.auroraIntelligence);
    add(s?.analysis?.intelligence);add(s?.nexus?.intelligence);add(s?.manager?.intelligence);
    return out;
  }
  function intelligenceMatch(h,s){return intelligenceRows(s).find(row=>matchesHolding(h,row))||null}

  function networkProfile(n){
    if(!n)return null;
    try{return w.Aurora2?.scouting?.network?.autoProfile?.(n)||null}catch(_){return null}
  }
  function evidenceFor(h,s,t,n,i){
    const profile=networkProfile(n)||{};
    const live=Math.max(0,
      num(t?.livePriceGbp),num(i?.live_price),num(i?.livePriceGbp),
      num(n?.legacyPriceGbp),holdingLive(h));
    let yieldPct=Math.max(0,
      num(t?.yieldPct),num(i?.yield_pct),num(i?.yieldPct),
      num(n?.legacyYieldPct),holdingYield(h,live));
    if(yieldPct>0&&yieldPct<=1)yieldPct*=100;

    const safety=Math.max(0,
      num(t?.dividendSafety),num(i?.dividend_safety),num(i?.dividendSafety),
      num(profile?.safety),num(n?.legacyPayoutScore));
    const valuation=Math.max(0,
      num(t?.valuationScore),num(i?.valuation_score),num(i?.valuationScore),
      num(profile?.valuation),num(n?.legacyValuationScore));
    const growth=Math.max(0,
      num(t?.dividendGrowth),num(i?.dividend_growth),num(i?.dividendGrowth),
      num(profile?.growth),num(n?.legacyGrowthScore));
    const quality=Math.max(0,num(t?.businessQuality),num(i?.business_quality),num(i?.businessQuality));
    const confidence=Math.max(0,
      num(t?.confidence),num(t?.dataQuality),num(i?.confidence_score),num(i?.confidenceScore),num(i?.data_quality_score));
    const incomeScore=Math.max(0,num(t?.incomeScore),num(i?.income_score),num(i?.incomeScore));
    const decisionScore=Math.max(0,num(i?.decision_score),num(i?.decisionScore));
    const decision=String(i?.buy_permission||i?.decision_action||i?.action||'').trim();

    const coreComplete=live>0&&yieldPct>0&&safety>0&&confidence>=50;
    return {live,yieldPct,safety,valuation,growth,quality,confidence,incomeScore,decisionScore,decision,coreComplete};
  }

  function discount(h,live){const cost=averageCost(h);return cost>0&&live>0?((cost-live)/cost)*100:null}

  function currentHoldings(s){return arr(s?.squad?.holdings).filter(h=>h&&['ACTIVE','LOCKED'].includes(upper(h.status))&&num(h.shares)>0)}
  function formerHoldings(s){
    const holdings=arr(s?.squad?.holdings),active=new Set(currentHoldings(s).map(h=>tickerOf(h.ticker))),seen=new Set();
    return holdings.filter(h=>h&&['SOLD','ARCHIVED'].includes(upper(h.status))).filter(h=>{
      const k=tickerOf(h.ticker);if(!k||active.has(k)||seen.has(k))return false;seen.add(k);return true;
    });
  }

  function opportunityRows(s){
    const map=targetMap(s);
    const current=currentHoldings(s).map(h=>{
      const t=map.get(tickerOf(h.ticker))||null,n=networkMatch(h,s),i=intelligenceMatch(h,s);
      const e=evidenceFor(h,s,t,n,i),d=discount(h,e.live);
      return {type:'CURRENT',h,t,n,i,e,cost:averageCost(h),discount:d};
    }).filter(x=>x.discount!=null&&x.discount>0);

    const former=formerHoldings(s).map(h=>{
      const t=map.get(tickerOf(h.ticker))||null,n=networkMatch(h,s),i=intelligenceMatch(h,s);
      const e=evidenceFor(h,s,t,n,i),d=discount(h,e.live);
      return {type:'FORMER',h,t,n,i,e,cost:averageCost(h),discount:d};
    });

    const statusRank=x=>x.t?(targetStatus(x.t)==='pass'?4:targetStatus(x.t)==='caution'?3:1):(x.e.decision?2:0);
    return [...current,...former].sort((a,b)=>statusRank(b)-statusRank(a)||num(b.discount)-num(a.discount)||tickerOf(a.h.ticker).localeCompare(tickerOf(b.h.ticker)));
  }

  function actualVerdict(x,s){
    const tk=tickerOf(x.h.ticker),status=targetStatus(x.t),score=Math.round(activeScore(x.t,s));
    if(x.type==='CURRENT'&&(x.h.locked||upper(x.h.status)==='LOCKED'||tk==='TSCO'))return {label:'HOLD ONLY',tone:'locked',scout:'LOCKED'};
    if(x.t){
      if(status==='block')return {label:x.type==='FORMER'?'NO RE-ENTRY':'DO NOT ADD',tone:'block',scout:'BLOCK'};
      if(status==='caution')return {label:x.type==='FORMER'?'RE-ENTRY REVIEW':'REVIEW DIP',tone:'caution',scout:`CAUTION ${score||''}`.trim()};
      if(score>=70)return {label:x.type==='FORMER'?'RE-ENTRY OPPORTUNITY':'ADD OPPORTUNITY',tone:'pass',scout:`${x.t.recommendation||'PASS'} ${score}`.trim()};
      return {label:'WATCH',tone:'watch',scout:`PASS ${score||''}`.trim()};
    }
    if(x.e.decision){
      const d=upper(x.e.decision);
      const caution=/CAUTION|MONITOR|SMALL|SELECTIVE|WATCH/.test(d);
      const block=/BLOCK|DO NOT|NO BUY|AVOID/.test(d);
      return {
        label:block?(x.type==='FORMER'?'NO RE-ENTRY':'DO NOT ADD'):caution?(x.type==='FORMER'?'RE-ENTRY REVIEW':'REVIEW DIP'):'AUTO SCOUTING',
        tone:block?'block':caution?'caution':'pending',
        scout:x.e.decision
      };
    }
    return {label:x.type==='FORMER'?'AUTO RE-SCOUT':'AUTO SCOUTING',tone:'pending',scout:'DATA PENDING'};
  }

  function buildCandidate(x){
    const {h,n,e,type}=x;
    if(!e.coreComplete)return null;
    const marketSymbol=String(n?.marketSymbol||n?.ticker||h?.ticker||'').trim();
    const tick=tickerOf(marketSymbol||h?.ticker);if(!tick)return null;
    return {
      id:`OPPORTUNITY-${type}-${tick}-${accountCode(h.account)}`,
      ticker:tick,name:String(h.name||n?.name||tick),preferredAccount:accountCode(h.account),
      sector:String(h.sector||n?.sector||''),livePriceGbp:e.live,yieldPct:e.yieldPct,
      confidence:e.confidence,dividendSafety:e.safety,
      incomeScore:e.incomeScore||0,valuationScore:e.valuation||0,portfolioFit:0,
      dividendGrowth:e.growth||0,businessQuality:e.quality||0,
      dividendStatus:'',payoutRisk:String(n?.legacyPayoutRisk||''),
      requiresRefresh:false,opportunityEvidenceComplete:true,
      opportunityType:type,opportunityTicker:tick,opportunityDetectedAt:now(),
      source:SOURCE,createdAt:now(),updatedAt:now()
    };
  }

  function cleanAndEnroll(){
    if(syncing)return false;
    const s=state();if(!s||locked(s)||!w.Aurora2?.core?.update)return false;
    const rows=opportunityRows(s);
    const existing=arr(s.scouting?.targets);
    const badIds=new Set(existing.filter(isBadProvisional).map(t=>String(t.id||'')));
    const existingTicker=new Set(existing.filter(t=>!badIds.has(String(t.id||''))).map(t=>tickerOf(t.ticker)).filter(Boolean));
    const add=[];
    rows.forEach(x=>{
      const tk=tickerOf(x.h.ticker);
      if(!tk||existingTicker.has(tk))return;
      const c=buildCandidate(x);if(c){add.push(c);existingTicker.add(tk)}
    });
    if(!badIds.size&&!add.length)return false;

    syncing=true;
    try{
      w.Aurora2.core.update(cur=>{
        const kept=arr(cur.scouting?.targets).filter(t=>!badIds.has(String(t.id||'')));
        const next=[...kept,...add];
        const ranked=w.Aurora2?.scouting?.rank?w.Aurora2.scouting.rank(next,cur):next;
        return {...cur,scouting:{...cur.scouting,targets:ranked,status:'SCOUTING_REVIEW',approvedBatchId:null,updatedAt:now()}};
      });
      return true;
    }finally{setTimeout(()=>{syncing=false},0)}
  }

  async function refreshHoldings(){
    if(holdingsRefreshRunning||!w.AuroraHoldingsSync?.sync)return null;
    holdingsRefreshRunning=true;
    try{return await w.AuroraHoldingsSync.sync()}catch(_){return null}finally{holdingsRefreshRunning=false}
  }

  function injectStyles(){
    if($('auroraSquadOpportunityStyles'))return;
    const style=document.createElement('style');style.id='auroraSquadOpportunityStyles';
    style.textContent=`
      .squad-opportunity-watch{margin-top:16px;border:1px solid rgba(103,232,249,.18);border-radius:16px;background:rgba(3,11,25,.92);overflow:hidden}
      .squad-opportunity-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border-bottom:1px solid rgba(125,211,252,.11)}
      .squad-opportunity-head small{display:block;color:#67e8f9;font-size:8px;font-weight:950;letter-spacing:.18em;text-transform:uppercase}.squad-opportunity-head h3{margin:3px 0 0;font-size:18px}.squad-opportunity-head p{margin:3px 0 0;color:#8197ae;font-size:9px}
      .squad-opportunity-summary{color:#8ea5b9;font-size:9px;white-space:nowrap}.squad-opportunity-summary b{color:#e5f6ff}
      .squad-opportunity-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}.squad-opportunity-table{width:100%;min-width:860px;border-collapse:collapse}
      .squad-opportunity-table th{padding:9px 11px;border-bottom:1px solid rgba(125,211,252,.11);color:#71869a;background:rgba(8,47,73,.16);font-size:7px;letter-spacing:.11em;text-align:left;text-transform:uppercase;white-space:nowrap}
      .squad-opportunity-table td{padding:10px 11px;border-bottom:1px solid rgba(125,211,252,.07);color:#b8cadd;font-size:9px;vertical-align:middle;white-space:nowrap}.squad-opportunity-table tr:last-child td{border-bottom:0}.squad-opportunity-table td strong{color:#f2fbff;font-size:10px}.squad-opportunity-table .sub{display:block;margin-top:2px;color:#6f8599;font-size:7px}
      .squad-opportunity-table .below{color:#67e8f9;font-weight:900}.squad-opportunity-table .yield{color:#a7f3d0;font-weight:850}
      .squad-opportunity-chip{display:inline-flex;padding:5px 7px;border:1px solid rgba(148,163,184,.18);border-radius:999px;background:rgba(15,23,42,.72);color:#cbd5e1;font-size:7px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}
      .squad-opportunity-chip.pass{border-color:rgba(52,211,153,.34);color:#a7f3d0;background:rgba(6,78,59,.25)}.squad-opportunity-chip.caution{border-color:rgba(251,191,36,.34);color:#fde68a;background:rgba(120,74,8,.22)}.squad-opportunity-chip.block{border-color:rgba(251,113,133,.34);color:#fecdd3;background:rgba(127,29,29,.22)}.squad-opportunity-chip.pending{border-color:rgba(96,165,250,.34);color:#bfdbfe;background:rgba(30,64,175,.20)}.squad-opportunity-chip.locked{border-color:rgba(167,139,250,.34);color:#ddd6fe;background:rgba(76,29,149,.20)}.squad-opportunity-chip.watch{border-color:rgba(125,211,252,.25);color:#bae6fd}
      .squad-opportunity-empty{padding:16px;color:#7f96aa;font-size:9px}.squad-opportunity-note{padding:8px 12px;border-top:1px solid rgba(125,211,252,.08);color:#71869a;font-size:8px;line-height:1.45}
      @media(max-width:620px){.squad-opportunity-head{display:block}.squad-opportunity-summary{margin-top:7px}}
    `;document.head.appendChild(style);
  }

  function ensurePanel(){
    if($('squadOpportunityWatch'))return $('squadOpportunityWatch');
    const anchor=document.querySelector('.scouting-scoreboard')||document.querySelector('.scouting-coverage')||document.querySelector('.scouting3-command');if(!anchor)return null;
    const section=document.createElement('section');section.id='squadOpportunityWatch';section.className='squad-opportunity-watch';
    section.innerHTML=`<div class="squad-opportunity-head"><div><small>SQUAD VALUE WATCH</small><h3>Squad Opportunities</h3><p>Automatically re-scouting current positions below cost and former holdings.</p></div><div id="squadOpportunitySummary" class="squad-opportunity-summary">Checking…</div></div><div class="squad-opportunity-scroll"><table class="squad-opportunity-table"><thead><tr><th>Type</th><th>Share</th><th>Avg Price</th><th>Live Price</th><th>Below Price</th><th>Yield</th><th>Opportunity</th><th>Scouting</th></tr></thead><tbody id="squadOpportunityBody"></tbody></table></div><div class="squad-opportunity-note">Blue DATA PENDING means Aurora has detected the opportunity and is scouting it automatically, but does not yet have enough genuine evidence for a Pass / Caution / Block verdict. No placeholder safety or confidence scores are used.</div>`;
    anchor.insertAdjacentElement('afterend',section);
    const jump=document.querySelector('.scouting-jumpbar');
    if(jump&&!jump.querySelector('[data-scout-jump="squadOpportunityWatch"]')){const b=document.createElement('button');b.type='button';b.dataset.scoutJump='squadOpportunityWatch';b.textContent='Squad Opportunities';jump.insertBefore(b,jump.firstElementChild||null)}
    return section;
  }

  function rowHtml(x,s){
    const v=actualVerdict(x,s),tick=tickerOf(x.h.ticker),below=x.discount==null?'—':(x.discount>=0?pct(x.discount):`${pct(x.discount)} above`);
    return `<tr><td><span class="squad-opportunity-chip ${x.type==='FORMER'?'watch':'pending'}">${x.type==='FORMER'?'FORMER':'CURRENT'}</span></td><td><strong>${esc(tick)}</strong><span class="sub">${esc(x.h.name||'')} • ${esc(accountLabel(x.h.account))}</span></td><td>${x.cost>0?money(x.cost):'—'}</td><td>${x.e.live>0?money(x.e.live):'—'}</td><td class="below">${below}</td><td class="yield">${x.e.yieldPct>0?`${x.e.yieldPct.toFixed(2)}%`:'—'}</td><td><span class="squad-opportunity-chip ${esc(v.tone)}">${esc(v.label)}</span></td><td><span class="squad-opportunity-chip ${esc(v.tone)}">${esc(v.scout)}</span>${!x.t&&x.e.confidence>0?`<span class="sub">Confidence ${Math.round(x.e.confidence)}</span>`:''}</td></tr>`;
  }

  function render(){
    injectStyles();const panel=ensurePanel();if(!panel)return;
    const s=state();if(!s)return;
    if(!syncing)cleanAndEnroll();
    const fresh=state()||s,rows=opportunityRows(fresh),body=$('squadOpportunityBody');
    if(body)body.innerHTML=rows.length?rows.map(x=>rowHtml(x,fresh)).join(''):'<tr><td colspan="8"><div class="squad-opportunity-empty">No current holding is below its recorded average cost and no former holding is waiting for re-entry review.</div></td></tr>';
    const pending=rows.filter(x=>!x.t&&!x.e.decision).length;
    const adds=rows.filter(x=>actualVerdict(x,fresh).tone==='pass').length;
    if($('squadOpportunitySummary'))$('squadOpportunitySummary').innerHTML=`<b>${rows.length}</b> watched • <b>${adds}</b> positive • <b>${pending}</b> data pending`;
  }

  function bind(){
    w.addEventListener('aurora2:state',()=>setTimeout(render,50));
    w.addEventListener('storage',()=>setTimeout(render,70));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshHoldings().finally(()=>setTimeout(render,80))}});
    const run=$('runScouting');if(run)run.addEventListener('click',()=>{refreshHoldings().finally(()=>{setTimeout(()=>{cleanAndEnroll();render()},80)})},{capture:true});
    render();
    setTimeout(()=>refreshHoldings().finally(()=>{cleanAndEnroll();render()}),650);
    setTimeout(render,1800);
  }

  w.AuroraSquadOpportunityWatch={render,rows:opportunityRows,refresh:()=>refreshHoldings().finally(()=>{cleanAndEnroll();render()})};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})(window);
