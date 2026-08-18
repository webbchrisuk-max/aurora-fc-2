/* Aurora 2 — Automated Squad Opportunity Table
 * Current holdings below recorded average cost and qualifying former holdings
 * are automatically enrolled into Active Scouting. Scouting remains the
 * evidence/ranking authority; Transfer remains the purchase authority.
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
  const tickerOf=v=>upper(v).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\..*$/,'');
  const now=()=>new Date().toISOString();

  let syncing=false;

  function state(){
    try{return w.Aurora2?.core?.read?.()||null}catch(_){return null}
  }
  function strategyOf(s){
    return String(s?.scouting?.strategy||'sustainable').toLowerCase()==='maximum'?'maximum':'sustainable';
  }
  function activeScore(t,s){
    if(!t)return 0;
    return num(strategyOf(s)==='maximum'?t.maximumScore:t.sustainableScore);
  }
  function targetStatus(t){return String(t?.status||'').toLowerCase()}
  function locked(s){
    return !!s?.transfer?.route?.locked||['LOCKED','PARTIALLY_REGISTERED','COMPLETE'].includes(upper(s?.mission?.status));
  }
  function accountCode(v){
    const x=norm(v);
    if(/212/.test(x))return 'T212';
    if(/\big\b|ig isa/.test(x))return 'IG';
    return 'CHECK';
  }
  function accountLabel(v){
    const x=accountCode(v);
    return x==='IG'?'IG ISA':x==='T212'?'Trading 212':'Broker check';
  }

  function targetMap(s){
    const map=new Map();
    const strategy=strategyOf(s);
    const weight={pass:3,caution:2,block:1};
    arr(s?.scouting?.targets).forEach(t=>{
      const key=tickerOf(t?.ticker||t?.marketSymbol);
      if(!key)return;
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
    return Math.max(0,num(h?.avgCostGbp)||
      (num(h?.shares)>0&&num(h?.bookCostGbp)>0?num(h.bookCostGbp)/num(h.shares):0));
  }
  function rowNames(row){
    return [row?.name,row?.company,row?.companyName,row?.securityName].map(norm).filter(Boolean);
  }
  function networkMatch(h,s){
    const t=tickerOf(h?.ticker||h?.marketSymbol);
    const names=[h?.name,h?.company,h?.companyName].map(norm).filter(Boolean);
    return arr(s?.scouting?.universe).find(row=>{
      const rt=tickerOf(row?.ticker||row?.marketSymbol||row?.symbol);
      if(t&&rt&&(t===rt||rt.endsWith(t)||t.endsWith(rt)))return true;
      const rn=rowNames(row);
      return names.some(n=>rn.some(x=>x===n||x.includes(n)||n.includes(x)));
    })||null;
  }
  function networkProfile(row){
    try{return w.Aurora2?.scouting?.network?.autoProfile?.(row)||null}catch(_){return null}
  }
  function latestPrice(h,t,n){
    return Math.max(0,
      num(t?.livePriceGbp),num(n?.legacyPriceGbp),num(n?.livePriceGbp),
      num(h?.livePriceGbp),
      (num(h?.shares)>0&&num(h?.marketValueGbp)>0?num(h.marketValueGbp)/num(h.shares):0)
    );
  }
  function discount(cost,live){return cost>0&&live>0?((cost-live)/cost)*100:null}

  function candidateFrom(h,n,type){
    const profile=networkProfile(n)||{};
    const tick=tickerOf(h?.ticker||n?.ticker||n?.marketSymbol);
    const live=Math.max(0,num(n?.legacyPriceGbp)||num(n?.livePriceGbp)||num(h?.livePriceGbp));
    const yieldPct=Math.max(0,num(n?.legacyYieldPct)||num(h?.yieldPct)||num(h?.dividendYield)||num(h?.yield));
    const safety=Math.max(0,num(profile?.safety)||num(n?.legacyPayoutScore)||num(h?.dividendSafety));
    const valuation=Math.max(0,num(profile?.valuation)||num(n?.legacyValuationScore)||num(h?.valuationScore));
    const growth=Math.max(0,num(profile?.growth)||num(n?.legacyGrowthScore)||num(h?.dividendGrowth));
    const evidence=Math.max(0,num(profile?.evidence)||num(n?.evidenceCount));
    const enoughEvidence=!!profile?.eligible||(
      live>0&&yieldPct>0&&safety>=35&&evidence>=4
    );
    const confidence=Math.max(0,Math.min(100,
      num(h?.confidence)||num(h?.dataQuality)||
      (profile?.eligible?80:evidence>=5?70:evidence>=3?55:40)
    ));

    return {
      id:`AUTO-${type}-${tick}`,
      ticker:tick,
      name:String(h?.name||n?.name||tick),
      preferredAccount:accountCode(h?.account||h?.preferredAccount),
      sector:String(h?.sector||n?.sector||''),
      livePriceGbp:live,
      yieldPct,
      confidence,
      dataQuality:confidence,
      dividendSafety:safety||55,
      valuationScore:valuation||55,
      dividendGrowth:growth||50,
      businessQuality:Math.max(0,num(h?.businessQuality)||55),
      portfolioFit:0,
      incomeScore:0,
      dividendStatus:String(h?.dividendStatus||''),
      payoutRisk:String(n?.legacyPayoutRisk||h?.payoutRisk||''),
      source:'AURORA2_SQUAD_OPPORTUNITY_AUTO',
      opportunityType:type,
      opportunityAutoAdded:true,
      requiresRefresh:!enoughEvidence,
      networkSecurityId:n?.securityId||n?.id||null,
      createdAt:now(),updatedAt:now()
    };
  }

  function currentSignals(s,map){
    return arr(s?.squad?.holdings)
      .filter(h=>h&&['ACTIVE','LOCKED'].includes(upper(h.status))&&num(h.shares)>0)
      .map(h=>{
        const tick=tickerOf(h.ticker),t=map.get(tick)||null,n=networkMatch(h,s);
        const cost=averageCost(h),live=latestPrice(h,t,n),below=discount(cost,live);
        const excluded=!!h.locked||upper(h.status)==='LOCKED'||tick==='TSCO';
        return {kind:'CURRENT',h,t,n,cost,live,discount:below,excluded};
      })
      .filter(x=>x.discount!=null&&x.discount>0)
      .sort((a,b)=>b.discount-a.discount);
  }

  function formerSignals(s,map){
    const holdings=arr(s?.squad?.holdings);
    const active=new Set(holdings.filter(h=>h&&['ACTIVE','LOCKED'].includes(upper(h.status))&&num(h.shares)>0).map(h=>tickerOf(h.ticker)));
    const seen=new Set();
    return holdings
      .filter(h=>h&&['SOLD','ARCHIVED'].includes(upper(h.status)))
      .filter(h=>{const k=tickerOf(h.ticker);if(!k||active.has(k)||seen.has(k))return false;seen.add(k);return true})
      .map(h=>{
        const tick=tickerOf(h.ticker),t=map.get(tick)||null,n=networkMatch(h,s),profile=networkProfile(n);
        const cost=averageCost(h),live=latestPrice(h,t,n),below=discount(cost,live);
        const autoSource=String(t?.source||'')==='AURORA2_SQUAD_OPPORTUNITY_AUTO';
        const signal=(below!=null&&below>0)||!!profile?.eligible||autoSource;
        return {kind:'FORMER',h,t,n,cost,live,discount:below,profile,signal};
      })
      .filter(x=>x.signal)
      .sort((a,b)=>(Number(!!b.profile?.eligible)-Number(!!a.profile?.eligible))||num(b.discount)-num(a.discount));
  }

  function autoEnroll(){
    if(syncing)return 0;
    const s=state();
    if(!s||locked(s))return 0;
    const map=targetMap(s);
    const additions=[];

    currentSignals(s,map).forEach(x=>{
      const tick=tickerOf(x.h.ticker);
      if(x.excluded||map.has(tick))return;
      additions.push(candidateFrom(x.h,x.n,'BELOW_COST'));
      map.set(tick,additions[additions.length-1]);
    });

    formerSignals(s,map).forEach(x=>{
      const tick=tickerOf(x.h.ticker);
      if(map.has(tick))return;
      additions.push(candidateFrom(x.h,x.n,'REENTRY'));
      map.set(tick,additions[additions.length-1]);
    });

    if(!additions.length)return 0;
    syncing=true;
    try{
      w.Aurora2?.core?.update?.(current=>{
        const existing=arr(current?.scouting?.targets);
        const keys=new Set(existing.map(t=>tickerOf(t?.ticker||t?.marketSymbol)).filter(Boolean));
        const fresh=additions.filter(t=>!keys.has(tickerOf(t.ticker)));
        if(!fresh.length)return current;
        let combined=[...existing,...fresh].map(t=>({...t,approvedForTransfer:false,approvedAt:null,approvalBatchId:null}));
        if(w.Aurora2?.scouting?.rank)combined=w.Aurora2.scouting.rank(combined,current);
        return {
          ...current,
          scouting:{
            ...current.scouting,
            targets:combined,
            status:'SCOUTING_REVIEW',
            approvedBatchId:null,
            source:'AURORA2_SCOUTING',
            updatedAt:now()
          }
        };
      });
    }finally{
      syncing=false;
    }
    return additions.length;
  }

  function verdict(x,s){
    if(x.excluded)return {label:'EXCLUDED',tone:'locked'};
    const t=x.t;
    if(!t)return {label:'AUTO QUEUED',tone:'needs'};
    const status=targetStatus(t),score=Math.round(activeScore(t,s));
    if(x.kind==='CURRENT'){
      if(status==='block')return {label:'DO NOT AVERAGE DOWN',tone:'block'};
      if(status==='caution')return {label:'REVIEW DIP',tone:'caution'};
      if(score>=70)return {label:'ADD OPPORTUNITY',tone:'pass'};
      return {label:'HOLD / WATCH',tone:'watch'};
    }
    if(status==='block')return {label:'NO RE-ENTRY',tone:'block'};
    if(status==='caution')return {label:'RE-ENTRY REVIEW',tone:'caution'};
    if(score>=70)return {label:'RE-ENTRY OPPORTUNITY',tone:'pass'};
    return {label:'WATCH RE-ENTRY',tone:'watch'};
  }

  function scoutingLabel(x,s){
    if(x.excluded)return 'RULE EXCLUDED';
    const t=x.t;
    if(!t)return 'AUTO ADDING';
    const score=Math.round(activeScore(t,s));
    const status=upper(t.recommendation||t.status||'REVIEW');
    return `AUTO ADDED • ${score}/100 • ${status}`;
  }

  function injectStyles(){
    if($('auroraSquadOpportunityStyles'))return;
    const style=document.createElement('style');
    style.id='auroraSquadOpportunityStyles';
    style.textContent=`
      .squad-opportunity-watch{margin-top:16px;border:1px solid rgba(103,232,249,.18);border-radius:16px;background:linear-gradient(145deg,rgba(5,21,39,.96),rgba(3,11,25,.98));overflow:hidden}
      .squad-opportunity-head{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(125,211,252,.11)}
      .squad-opportunity-head small{display:block;color:#67e8f9;font-size:8px;font-weight:950;letter-spacing:.18em;text-transform:uppercase}
      .squad-opportunity-head h3{margin:3px 0 0;font-size:18px;letter-spacing:-.02em}.squad-opportunity-head p{margin:3px 0 0;color:#8298ad;font-size:9px;line-height:1.4}
      .squad-opportunity-auto{padding:6px 9px;border:1px solid rgba(52,211,153,.3);border-radius:999px;color:#a7f3d0;background:rgba(6,78,59,.25);font-size:8px;font-weight:950;letter-spacing:.09em;white-space:nowrap}
      .squad-opportunity-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
      .squad-opportunity-table{width:100%;border-collapse:collapse;min-width:790px;font-size:10px}
      .squad-opportunity-table th{padding:9px 10px;text-align:left;color:#6f879d;background:rgba(3,12,25,.75);font-size:7px;font-weight:950;letter-spacing:.12em;text-transform:uppercase;border-bottom:1px solid rgba(125,211,252,.11)}
      .squad-opportunity-table td{padding:9px 10px;border-bottom:1px solid rgba(125,211,252,.07);vertical-align:middle;color:#bfd0df}.squad-opportunity-table tbody tr:last-child td{border-bottom:0}
      .squad-opportunity-table tbody tr:hover{background:rgba(8,47,73,.18)}
      .squad-opportunity-share strong{display:block;color:#eef9ff;font-size:11px}.squad-opportunity-share span{display:block;color:#74899d;font-size:8px;margin-top:2px}
      .squad-opportunity-type{font-size:8px;font-weight:900;color:#8fb0c8}.squad-opportunity-below{color:#67e8f9;font-weight:900}.squad-opportunity-above{color:#94a3b8}
      .squad-opportunity-chip{display:inline-flex;padding:5px 7px;border-radius:999px;font-size:7px;font-weight:950;letter-spacing:.06em;white-space:nowrap;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72)}
      .squad-opportunity-chip.pass{border-color:rgba(52,211,153,.35);color:#a7f3d0;background:rgba(6,78,59,.32)}.squad-opportunity-chip.caution{border-color:rgba(251,191,36,.34);color:#fde68a;background:rgba(120,74,8,.25)}.squad-opportunity-chip.block{border-color:rgba(251,113,133,.35);color:#fecdd3;background:rgba(127,29,29,.27)}.squad-opportunity-chip.needs{border-color:rgba(96,165,250,.33);color:#bfdbfe;background:rgba(30,64,175,.22)}.squad-opportunity-chip.locked{border-color:rgba(167,139,250,.33);color:#ddd6fe;background:rgba(76,29,149,.22)}.squad-opportunity-chip.watch{border-color:rgba(125,211,252,.26);color:#bae6fd;background:rgba(8,47,73,.26)}
      .squad-opportunity-scouting{font-size:8px;font-weight:850;color:#9ed9e9;white-space:nowrap}.squad-opportunity-empty{padding:16px;color:#7f96aa;font-size:9px}
      @media(max-width:620px){.squad-opportunity-head{align-items:flex-start}.squad-opportunity-head p{max-width:270px}.squad-opportunity-auto{font-size:7px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel(){
    if($('squadOpportunityWatch'))return $('squadOpportunityWatch');
    const anchor=document.querySelector('.scouting-scoreboard')||document.querySelector('.scouting-coverage')||document.querySelector('.scouting3-command');
    if(!anchor)return null;
    const section=document.createElement('section');
    section.id='squadOpportunityWatch';section.className='squad-opportunity-watch';
    section.innerHTML=`
      <div class="squad-opportunity-head">
        <div><small>AUTOMATED SQUAD VALUE SCOUT</small><h3>Squad Opportunities</h3><p>Below-cost holdings and qualifying former holdings are automatically added to Active Scouting. Transfer still decides where money goes.</p></div>
        <span class="squad-opportunity-auto">AUTO SCOUTING ON</span>
      </div>
      <div class="squad-opportunity-table-wrap">
        <table class="squad-opportunity-table">
          <thead><tr><th>Type</th><th>Share</th><th>Average Price</th><th>Live Price</th><th>Below Price</th><th>Opportunity</th><th>Scouting</th></tr></thead>
          <tbody id="squadOpportunityRows"></tbody>
        </table>
      </div>`;
    anchor.insertAdjacentElement('afterend',section);

    const jump=document.querySelector('.scouting-jumpbar');
    if(jump&&!jump.querySelector('[data-scout-jump="squadOpportunityWatch"]')){
      const button=document.createElement('button');button.type='button';button.dataset.scoutJump='squadOpportunityWatch';button.textContent='Squad Opportunities';
      jump.insertBefore(button,jump.firstElementChild||null);
    }
    return section;
  }

  function rowHtml(x,s){
    const v=verdict(x,s),below=x.discount;
    const belowText=below==null?'—':below>=0?`${below.toFixed(1)}% below`:`${Math.abs(below).toFixed(1)}% above`;
    const belowClass=below!=null&&below>0?'squad-opportunity-below':'squad-opportunity-above';
    return `<tr data-opportunity-ticker="${esc(tickerOf(x.h.ticker))}">
      <td><span class="squad-opportunity-type">${x.kind==='CURRENT'?'CURRENT':'FORMER'}</span></td>
      <td class="squad-opportunity-share"><strong>${esc(tickerOf(x.h.ticker))}</strong><span>${esc(x.h.name||'')} • ${esc(accountLabel(x.h.account||x.h.preferredAccount))}</span></td>
      <td>${x.cost>0?money(x.cost):'—'}</td>
      <td>${x.live>0?money(x.live):'—'}</td>
      <td class="${belowClass}">${belowText}</td>
      <td><span class="squad-opportunity-chip ${esc(v.tone)}">${esc(v.label)}</span></td>
      <td><span class="squad-opportunity-scouting">${esc(scoutingLabel(x,s))}</span></td>
    </tr>`;
  }

  function render(){
    if(syncing)return;
    injectStyles();ensurePanel();
    const s=state();if(!s)return;
    const map=targetMap(s);
    const rows=[...currentSignals(s,map),...formerSignals(s,map)];
    const host=$('squadOpportunityRows');if(!host)return;
    host.innerHTML=rows.length?rows.map(x=>rowHtml(x,s)).join(''):`<tr><td colspan="7"><div class="squad-opportunity-empty">No below-cost or former-squad re-entry opportunities are currently detected.</div></td></tr>`;
  }

  function syncAndRender(){
    const added=autoEnroll();
    setTimeout(render,added?50:0);
    if(added)setTimeout(render,500);
  }

  function bind(){
    injectStyles();ensurePanel();
    syncAndRender();

    const run=$('runScouting');
    run?.addEventListener('click',()=>{
      autoEnroll();
      setTimeout(render,90);setTimeout(render,700);
    },{capture:true});

    w.addEventListener('aurora2:state',()=>setTimeout(()=>{if(!syncing){autoEnroll();render()}},60));
    w.addEventListener('storage',()=>setTimeout(syncAndRender,80));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(syncAndRender,90)});
    setTimeout(syncAndRender,500);setTimeout(syncAndRender,1600);
  }

  w.AuroraSquadOpportunityWatch={render,autoEnroll,currentSignals,formerSignals};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})(window);
