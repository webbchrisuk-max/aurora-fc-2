/* Aurora 2 — Squad Opportunity Watch
 * Read-only scouting intelligence for:
 *  1) current holdings trading below recorded average cost; and
 *  2) SOLD / ARCHIVED holdings that may deserve re-entry review.
 *
 * Price weakness is a scouting signal only. Existing Aurora Scouting
 * assessment remains the authority for eligibility and Transfer approval.
 */
(function(w){
  'use strict';
  if(w.AuroraSquadOpportunityWatch)return;

  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const money=v=>`£${num(v).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:4})}`;
  const pct=v=>`${Math.abs(num(v)).toFixed(1)}%`;
  const tickerOf=v=>upper(v).replace(/\..*$/,'');

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
  function targetStatus(t){
    return String(t?.status||'').toLowerCase();
  }
  function targetMap(s){
    const map=new Map();
    const strategy=strategyOf(s);
    const statusWeight={pass:3,caution:2,block:1};
    arr(s?.scouting?.targets).forEach(t=>{
      const key=tickerOf(t?.ticker);
      if(!key)return;
      const prior=map.get(key);
      if(!prior){map.set(key,t);return}
      const a=statusWeight[targetStatus(t)]||0,b=statusWeight[targetStatus(prior)]||0;
      const scoreA=num(strategy==='maximum'?t.maximumScore:t.sustainableScore);
      const scoreB=num(strategy==='maximum'?prior.maximumScore:prior.sustainableScore);
      if(a>b||(a===b&&scoreA>scoreB))map.set(key,t);
    });
    return map;
  }

  function latestPrice(h,t){
    return Math.max(0,num(t?.livePriceGbp)||num(h?.livePriceGbp)||
      (num(h?.shares)>0&&num(h?.marketValueGbp)>0?num(h.marketValueGbp)/num(h.shares):0));
  }
  function averageCost(h){
    return Math.max(0,num(h?.avgCostGbp)||
      (num(h?.shares)>0&&num(h?.bookCostGbp)>0?num(h.bookCostGbp)/num(h.shares):0));
  }
  function discountToCost(h,t){
    const cost=averageCost(h),live=latestPrice(h,t);
    return cost>0&&live>0?((cost-live)/cost)*100:null;
  }
  function accountLabel(v){
    const x=upper(v);
    if(x.includes('IG'))return 'IG ISA';
    if(x.includes('212'))return 'Trading 212';
    return String(v||'Account');
  }

  function evidenceLabel(t,s){
    if(!t)return {label:'NEEDS SCOUT',tone:'needs',detail:'Not currently in Active Scouting. Open the Global Network for an evidence refresh.'};
    const status=targetStatus(t),score=Math.round(activeScore(t,s));
    if(status==='block')return {label:'BLOCKED',tone:'block',detail:`Scouting ${score}/100 • ${arr(t.eligibilityReasons)[0]||t.reason||'Current evidence blocks a purchase.'}`};
    if(status==='caution')return {label:'CAUTION',tone:'caution',detail:`Scouting ${score}/100 • ${arr(t.eligibilityReasons)[0]||t.reason||'Controlled review required.'}`};
    return {label:'PASS',tone:'pass',detail:`Scouting ${score}/100 • ${num(t.yieldPct).toFixed(2)}% yield • ${t.recommendation||'evidence passed'}`};
  }

  function currentVerdict(h,t,s){
    const tick=tickerOf(h.ticker);
    if(h.locked||upper(h.status)==='LOCKED'||tick==='TSCO'){
      return {label:'LOCKED / HOLD ONLY',tone:'locked',detail:'Aurora rules prevent this holding being treated as an active add opportunity.'};
    }
    if(!t)return {label:'NEEDS SCOUT',tone:'needs',detail:'Below recorded cost, but Aurora does not have a current Active Scouting assessment.'};
    const status=targetStatus(t),score=Math.round(activeScore(t,s));
    if(status==='block')return {label:'DO NOT AVERAGE DOWN',tone:'block',detail:'The lower price does not override the current Scouting block.'};
    if(status==='caution')return {label:'REVIEW DIP',tone:'caution',detail:'Price is below cost, but Scouting still requires controlled review before adding.'};
    if(score>=70)return {label:'ADD OPPORTUNITY',tone:'pass',detail:'Below recorded cost and the current Scouting evidence remains Transfer-eligible. Final allocation still belongs to Transfer.'};
    return {label:'HOLD / WATCH',tone:'watch',detail:'The holding passes evidence, but its current Scouting score does not make the dip a priority add signal.'};
  }

  function formerVerdict(h,t,s){
    if(!t)return {label:'NEEDS SCOUT',tone:'needs',detail:'Former holding detected, but it has no current Active Scouting assessment.'};
    const status=targetStatus(t),score=Math.round(activeScore(t,s));
    if(status==='block')return {label:'NO RE-ENTRY',tone:'block',detail:'Current Scouting evidence still blocks a return to the squad.'};
    if(status==='caution')return {label:'RE-ENTRY REVIEW',tone:'caution',detail:'Former holding is back on the radar, but the evidence is not yet a clean pass.'};
    if(score>=70)return {label:'RE-ENTRY OPPORTUNITY',tone:'pass',detail:'The former holding has re-earned a positive Scouting assessment. Transfer must still compare it with all other targets.'};
    return {label:'WATCH FOR RE-ENTRY',tone:'watch',detail:'The investment case is not blocked, but it is not currently strong enough to prioritise.'};
  }

  function currentRows(s,map){
    return arr(s?.squad?.holdings)
      .filter(h=>h&&['ACTIVE','LOCKED'].includes(upper(h.status))&&num(h.shares)>0)
      .map(h=>{
        const t=map.get(tickerOf(h.ticker))||null;
        const discount=discountToCost(h,t);
        return {h,t,discount,live:latestPrice(h,t),cost:averageCost(h),verdict:currentVerdict(h,t,s),evidence:evidenceLabel(t,s)};
      })
      .filter(x=>x.discount!=null&&x.discount>0)
      .sort((a,b)=>{
        const passA=a.verdict.tone==='pass'?1:0,passB=b.verdict.tone==='pass'?1:0;
        return passB-passA||b.discount-a.discount||activeScore(b.t,s)-activeScore(a.t,s);
      });
  }

  function formerRows(s,map){
    const holdings=arr(s?.squad?.holdings);
    const activeTickers=new Set(holdings
      .filter(h=>h&&['ACTIVE','LOCKED'].includes(upper(h.status))&&num(h.shares)>0)
      .map(h=>tickerOf(h.ticker)));
    const seen=new Set();
    return holdings
      .filter(h=>h&&['SOLD','ARCHIVED'].includes(upper(h.status)))
      .filter(h=>{
        const key=tickerOf(h.ticker);
        if(!key||activeTickers.has(key)||seen.has(key))return false;
        seen.add(key);return true;
      })
      .map(h=>{
        const t=map.get(tickerOf(h.ticker))||null;
        return {h,t,live:latestPrice(h,t),cost:averageCost(h),discount:discountToCost(h,t),verdict:formerVerdict(h,t,s),evidence:evidenceLabel(t,s)};
      })
      .sort((a,b)=>{
        const passA=a.verdict.tone==='pass'?1:0,passB=b.verdict.tone==='pass'?1:0;
        return passB-passA||activeScore(b.t,s)-activeScore(a.t,s)||num(b.discount)-num(a.discount);
      });
  }

  function injectStyles(){
    if($('auroraSquadOpportunityStyles'))return;
    const style=document.createElement('style');
    style.id='auroraSquadOpportunityStyles';
    style.textContent=`
      .squad-opportunity-watch{margin-top:18px;border:1px solid rgba(103,232,249,.2);border-radius:20px;background:radial-gradient(circle at 0 0,rgba(34,211,238,.10),transparent 30%),linear-gradient(145deg,rgba(5,21,39,.96),rgba(3,11,25,.98));box-shadow:0 18px 46px rgba(0,0,0,.24);overflow:hidden}
      .squad-opportunity-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:20px 22px;border-bottom:1px solid rgba(125,211,252,.13)}
      .squad-opportunity-head small,.squad-opportunity-lane-head small{display:block;color:#67e8f9;font-size:9px;font-weight:950;letter-spacing:.2em;text-transform:uppercase}
      .squad-opportunity-head h3{margin:5px 0 7px;font-size:27px;letter-spacing:-.035em}.squad-opportunity-head p{margin:0;max-width:800px;color:#91a8be;font-size:11px;line-height:1.55}
      .squad-opportunity-rule{flex:0 0 auto;padding:8px 11px;border:1px solid rgba(251,191,36,.26);border-radius:999px;color:#fde68a;background:rgba(120,74,8,.17);font-size:8px;font-weight:950;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}
      .squad-opportunity-kpis{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid rgba(125,211,252,.12)}
      .squad-opportunity-kpi{padding:14px 18px;border-right:1px solid rgba(125,211,252,.10)}.squad-opportunity-kpi:last-child{border-right:0}
      .squad-opportunity-kpi small{display:block;color:#71869a;font-size:8px;letter-spacing:.12em;text-transform:uppercase}.squad-opportunity-kpi strong{display:block;margin-top:5px;font-size:20px}
      .squad-opportunity-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:16px}.squad-opportunity-lane{min-width:0;border:1px solid rgba(125,211,252,.10);border-radius:16px;background:rgba(2,8,23,.38);overflow:hidden}
      .squad-opportunity-lane-head{padding:15px 16px;border-bottom:1px solid rgba(125,211,252,.09);background:linear-gradient(90deg,rgba(8,47,73,.28),transparent)}.squad-opportunity-lane-head h4{margin:5px 0 3px;font-size:18px}.squad-opportunity-lane-head p{margin:0;color:#8197ae;font-size:9px;line-height:1.45}
      .squad-opportunity-list{display:grid;gap:8px;padding:10px}.squad-opportunity-empty{padding:18px;border:1px dashed rgba(125,211,252,.16);border-radius:12px;color:#7f96aa;font-size:10px;line-height:1.5}
      .squad-opportunity-row{padding:13px;border:1px solid rgba(125,211,252,.09);border-radius:13px;background:linear-gradient(110deg,rgba(8,47,73,.20),rgba(8,17,34,.36))}
      .squad-opportunity-row-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.squad-opportunity-name strong{display:block;font-size:14px}.squad-opportunity-name span{display:block;margin-top:3px;color:#7f96aa;font-size:9px}.squad-opportunity-chip{display:inline-flex;padding:6px 8px;border-radius:999px;font-size:8px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.75)}
      .squad-opportunity-chip.pass{border-color:rgba(52,211,153,.35);color:#a7f3d0;background:rgba(6,78,59,.35)}.squad-opportunity-chip.caution{border-color:rgba(251,191,36,.34);color:#fde68a;background:rgba(120,74,8,.26)}.squad-opportunity-chip.block{border-color:rgba(251,113,133,.36);color:#fecdd3;background:rgba(127,29,29,.28)}.squad-opportunity-chip.needs{border-color:rgba(96,165,250,.35);color:#bfdbfe;background:rgba(30,64,175,.24)}.squad-opportunity-chip.locked{border-color:rgba(167,139,250,.35);color:#ddd6fe;background:rgba(76,29,149,.24)}.squad-opportunity-chip.watch{border-color:rgba(125,211,252,.28);color:#bae6fd;background:rgba(8,47,73,.28)}
      .squad-opportunity-price{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:11px}.squad-opportunity-price div{padding:8px;border:1px solid rgba(125,211,252,.08);border-radius:9px;background:rgba(2,8,23,.42)}.squad-opportunity-price small{display:block;color:#6f8599;font-size:7px;letter-spacing:.10em;text-transform:uppercase}.squad-opportunity-price b{display:block;margin-top:4px;font-size:11px}.squad-opportunity-price .discount b{color:#67e8f9}
      .squad-opportunity-detail{margin-top:9px;color:#8ea5b9;font-size:9px;line-height:1.5}.squad-opportunity-evidence{margin-top:6px;color:#b6ccdd;font-size:9px;line-height:1.45}
      .squad-opportunity-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.squad-opportunity-action{padding:7px 9px;border:1px solid rgba(125,211,252,.19);border-radius:8px;color:#c9eff8;background:rgba(8,47,73,.32);font-size:8px;font-weight:900;cursor:pointer}.squad-opportunity-action.primary{border-color:rgba(34,211,238,.45);color:#03131d;background:#3cecff}
      @media(max-width:900px){.squad-opportunity-grid{grid-template-columns:1fr}.squad-opportunity-kpis{grid-template-columns:1fr 1fr}.squad-opportunity-kpi:nth-child(2){border-right:0}.squad-opportunity-kpi:nth-child(-n+2){border-bottom:1px solid rgba(125,211,252,.10)}}
      @media(max-width:620px){.squad-opportunity-head{display:block}.squad-opportunity-rule{display:inline-flex;margin-top:12px}.squad-opportunity-price{grid-template-columns:1fr 1fr}.squad-opportunity-price div:last-child{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel(){
    if($('squadOpportunityWatch'))return $('squadOpportunityWatch');
    const anchor=document.querySelector('.scouting-scoreboard')||document.querySelector('.scouting-coverage')||document.querySelector('.scouting3-command');
    if(!anchor)return null;
    const section=document.createElement('section');
    section.id='squadOpportunityWatch';
    section.className='squad-opportunity-watch';
    section.innerHTML=`
      <div class="squad-opportunity-head">
        <div><small>SQUAD VALUE WATCH</small><h3>Existing & Former Squad Opportunities</h3><p>Aurora re-checks shares you already own when they trade below recorded average cost, and keeps exited holdings visible for possible re-entry. A cheaper price is a scouting signal — never automatic buy permission.</p></div>
        <span class="squad-opportunity-rule">PRICE SIGNAL ≠ BUY</span>
      </div>
      <div class="squad-opportunity-kpis">
        <div class="squad-opportunity-kpi"><small>Below Buy Price</small><strong id="squadOpportunityDipCount">0</strong></div>
        <div class="squad-opportunity-kpi"><small>Clean Add Signals</small><strong id="squadOpportunityAddCount">0</strong></div>
        <div class="squad-opportunity-kpi"><small>Former Squad</small><strong id="squadOpportunityFormerCount">0</strong></div>
        <div class="squad-opportunity-kpi"><small>Re-entry Signals</small><strong id="squadOpportunityReentryCount">0</strong></div>
      </div>
      <div class="squad-opportunity-grid">
        <article class="squad-opportunity-lane"><div class="squad-opportunity-lane-head"><small>CURRENT SQUAD</small><h4>Below Buy Price</h4><p>Current positions where the latest supported price is below Aurora's recorded average cost.</p></div><div id="squadOpportunityCurrent" class="squad-opportunity-list"></div></article>
        <article class="squad-opportunity-lane"><div class="squad-opportunity-lane-head"><small>FORMER SQUAD</small><h4>Re-entry Watch</h4><p>SOLD / ARCHIVED names stay on the radar and can earn their way back through current Scouting evidence.</p></div><div id="squadOpportunityFormer" class="squad-opportunity-list"></div></article>
      </div>`;
    anchor.insertAdjacentElement('afterend',section);

    const jump=document.querySelector('.scouting-jumpbar');
    if(jump&&!jump.querySelector('[data-scout-jump="squadOpportunityWatch"]')){
      const button=document.createElement('button');
      button.type='button';button.dataset.scoutJump='squadOpportunityWatch';button.textContent='Squad Opportunities';
      jump.insertBefore(button,jump.firstElementChild||null);
    }
    return section;
  }

  function priceCells(x,former=false){
    const third=former
      ? `<div class="discount"><small>vs former cost</small><b>${x.discount==null?'—':(x.discount>=0?`${pct(x.discount)} below`:`${pct(x.discount)} above`)}</b></div>`
      : `<div class="discount"><small>below buy price</small><b>${x.discount==null?'—':pct(x.discount)}</b></div>`;
    return `<div class="squad-opportunity-price"><div><small>${former?'former avg cost':'avg buy price'}</small><b>${x.cost>0?money(x.cost):'—'}</b></div><div><small>latest price</small><b>${x.live>0?money(x.live):'—'}</b></div>${third}</div>`;
  }

  function rowHtml(x,s,former=false){
    const h=x.h,t=x.t,v=x.verdict;
    const button=t
      ? '<button type="button" class="squad-opportunity-action primary" data-opportunity-open="evidence">Open Scouting Evidence</button>'
      : '<button type="button" class="squad-opportunity-action primary" data-opportunity-open="network">Open Global Network</button>';
    const score=t?Math.round(activeScore(t,s)):0;
    return `<article class="squad-opportunity-row" data-opportunity-ticker="${esc(tickerOf(h.ticker))}">
      <div class="squad-opportunity-row-head"><div class="squad-opportunity-name"><strong>${esc(tickerOf(h.ticker))} <span>${esc(h.name||'')}</span></strong><span>${esc(accountLabel(h.account))}${former?' • FORMER HOLDING':` • ${num(h.shares).toLocaleString('en-GB')} shares`}</span></div><span class="squad-opportunity-chip ${esc(v.tone)}">${esc(v.label)}</span></div>
      ${priceCells(x,former)}
      <div class="squad-opportunity-detail">${esc(v.detail)}</div>
      <div class="squad-opportunity-evidence">${t?`Current ${strategyOf(s)==='maximum'?'Maximum':'Sustainable'} Scouting: ${score}/100 • ${esc(t.recommendation||t.status||'REVIEW')}`:'Current Scouting: not assessed'}</div>
      <div class="squad-opportunity-actions">${button}<button type="button" class="squad-opportunity-action" data-opportunity-run="1">Run Scouting</button></div>
    </article>`;
  }

  function render(){
    injectStyles();
    const panel=ensurePanel();if(!panel)return;
    const s=state();if(!s)return;
    const map=targetMap(s),current=currentRows(s,map),former=formerRows(s,map);
    const addCount=current.filter(x=>x.verdict.label==='ADD OPPORTUNITY').length;
    const reentryCount=former.filter(x=>x.verdict.label==='RE-ENTRY OPPORTUNITY').length;
    if($('squadOpportunityDipCount'))$('squadOpportunityDipCount').textContent=String(current.length);
    if($('squadOpportunityAddCount'))$('squadOpportunityAddCount').textContent=String(addCount);
    if($('squadOpportunityFormerCount'))$('squadOpportunityFormerCount').textContent=String(former.length);
    if($('squadOpportunityReentryCount'))$('squadOpportunityReentryCount').textContent=String(reentryCount);

    const cur=$('squadOpportunityCurrent'),old=$('squadOpportunityFormer');
    if(cur)cur.innerHTML=current.length?current.map(x=>rowHtml(x,s,false)).join(''):'<div class="squad-opportunity-empty">No current holding with a supported live price is below its recorded average cost right now.</div>';
    if(old)old.innerHTML=former.length?former.map(x=>rowHtml(x,s,true)).join(''):'<div class="squad-opportunity-empty">No SOLD / ARCHIVED holdings are currently recorded as a separate former-squad watch.</div>';

    w.AuroraMotion?.pulse?.(panel,'aurora-status-change',500);
  }

  function jumpTo(id){
    const target=$(id);if(!target)return;
    const offset=(document.querySelector('.aurora-shell-header')?.offsetHeight||0)+(document.querySelector('.scouting-jumpbar')?.offsetHeight||0)+18;
    const top=target.getBoundingClientRect().top+w.scrollY-offset;
    w.scrollTo({top:Math.max(0,top),behavior:'smooth'});
  }
  function bind(){
    document.addEventListener('click',e=>{
      const open=e.target.closest('[data-opportunity-open]');
      if(open){
        e.preventDefault();
        jumpTo(open.dataset.opportunityOpen==='evidence'?'candidateLab':'globalNetworkSection');
        return;
      }
      const run=e.target.closest('[data-opportunity-run]');
      if(run){
        e.preventDefault();
        $('runScouting')?.click();
        setTimeout(render,120);setTimeout(render,800);
      }
    });
    w.addEventListener('aurora2:state',()=>setTimeout(render,40));
    w.addEventListener('storage',()=>setTimeout(render,60));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(render,70)});
    const run=$('runScouting');if(run)run.addEventListener('click',()=>{setTimeout(render,80);setTimeout(render,650)});
    render();setTimeout(render,500);setTimeout(render,1600);
  }

  w.AuroraSquadOpportunityWatch={render,currentRows,formerRows};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})(window);
