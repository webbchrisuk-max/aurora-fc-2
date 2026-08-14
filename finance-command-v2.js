(function(w){
'use strict';

/*
 * Aurora 2 — Finance Command Centre v2
 * -------------------------------------
 * This file is a read-only presentation/operational adapter around the existing
 * Finance engines. It does not replace finance.js, finance-funding.js or
 * finance-house.js and does not create an alternative money calculation.
 */

const A=()=>w.Aurora2;
const arr=v=>Array.isArray(v)?v:[];
const num=v=>{
  const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:0;
};
const esc=v=>{
  const helper=A()?.ui?.escape;
  if(typeof helper==='function')return helper(String(v??''));
  return String(v??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
};
const money=v=>{
  const helper=A()?.ui?.money;
  if(typeof helper==='function')return helper(Number(v)||0);
  return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)||0);
};
const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

function parseDate(v){
  if(!v)return null;
  const d=new Date(`${String(v).slice(0,10)}T12:00:00`);
  return Number.isNaN(d.getTime())?null:d;
}
function dateISO(d){
  if(!(d instanceof Date)||Number.isNaN(d.getTime()))return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDays(d,n){
  const x=new Date(d.getTime());
  x.setDate(x.getDate()+n);
  return x;
}
function addMonthsClamped(d,months){
  const x=new Date(d.getTime()),day=x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth()+months);
  const last=new Date(x.getFullYear(),x.getMonth()+1,0).getDate();
  x.setDate(Math.min(day,last));
  return x;
}
function today(){
  const d=new Date();
  d.setHours(12,0,0,0);
  return d;
}
function dayDiff(a,b){
  if(!a||!b)return null;
  return Math.round((b.getTime()-a.getTime())/86400000);
}
function humanDate(v){
  const d=v instanceof Date?v:parseDate(v);
  if(!d)return 'Not set';
  return d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
}
function isHoldingPotName(v){return norm(v)==='holding pot'}
function isCurrentAccount(v){return norm(v)==='current account'}
function potFunded(p){
  const balance=Math.max(0,num(p?.balance));
  return p?.goalMode==='funded-progress'
    ? balance+Math.max(0,num(p?.spent))
    : balance;
}
function potGap(p,targetOverride=null){
  const target=targetOverride==null?Math.max(0,num(p?.target)):Math.max(0,num(targetOverride));
  return Math.max(0,target-potFunded(p));
}
function state(){
  return A()?.core?.read?A().core.read():null;
}
function activePots(s){
  return arr(s?.finance?.pots).filter(p=>!p.archived);
}
function holdingPot(s){
  return activePots(s).find(p=>isHoldingPotName(p.name))||null;
}
function housePot(s){
  return activePots(s).find(p=>/house/.test(norm(p.name))||String(p.id||'').toLowerCase().includes('house'))||null;
}
function activeBills(s){
  return arr(s?.finance?.bills).filter(b=>!b.archived&&!b.paid&&b.included!==false);
}
function currentPlanFromDom(s){
  const base={...(s?.finance?.plan||{})};
  const numericIds=['openingCash','expectedWages','wagesReceived','extraCash','otherPlanned','protectedCash','releaseAmount'];
  numericIds.forEach(id=>{
    const el=document.getElementById(id);
    if(el&&document.activeElement===el){
      const n=Number(el.value);
      if(Number.isFinite(n))base[id]=Math.max(0,n);
    }else if(el&&el.value!==''&&el.dataset.financeV2UseDom==='1'){
      const n=Number(el.value);
      if(Number.isFinite(n))base[id]=Math.max(0,n);
    }
  });
  const pd=document.getElementById('paydayDate');
  if(pd&&pd.value&&(document.activeElement===pd||pd.dataset.financeV2UseDom==='1'))base.paydayDate=pd.value;
  return base;
}
function preview(s,plan){
  const control=A()?.financePaydayControl;
  if(typeof control?.paydayFundingPreview==='function'){
    try{return control.paydayFundingPreview(s,plan)}
    catch(err){console.warn('Finance v2 preview failed',err)}
  }
  return {
    c:{
      totalCash:num(plan.openingCash)+num(plan.wagesReceived||plan.netPay)+num(plan.extraCash),
      commitments:num(plan.billsDue)+num(plan.potsDue)+num(plan.annualBillFunding)+num(plan.holdingPotTopUp)+num(plan.otherPlanned),
      safeSurplus:0,
      plan,
      auto:{}
    },
    rows:[],
    goalPotsTotal:0,
    holdingContribution:num(plan.annualBillFunding)+num(plan.holdingPotTopUp),
    total:0
  };
}

function nextUpcomingPayday(plan){
  let d=parseDate(plan?.paydayDate);
  const t=today();
  if(!d)return null;
  let guard=0;
  while(d.getTime()<t.getTime()&&guard++<30)d=addDays(d,28);
  return d;
}
function nextFrequencyDate(d,frequency){
  if(!(d instanceof Date))return null;
  if(frequency==='weekly')return addDays(d,7);
  if(frequency==='4-weeks')return addDays(d,28);
  if(frequency==='5-weeks')return addDays(d,35);
  if(frequency==='monthly')return addMonthsClamped(d,1);
  if(frequency==='yearly')return addMonthsClamped(d,12);
  return null;
}
function occurrenceDateLabel(o){
  if(o.overdue)return `OVERDUE • ${humanDate(o.date)}`;
  return humanDate(o.date);
}

/*
 * Pre-payday runway:
 * This is deliberately separate from the existing 13-payday funding engine.
 * It only describes known, dated money expected to leave between today and
 * the next upcoming payday, mirroring the useful "before payday" view from
 * Aurora 1. No undated bill is silently assigned a fake date.
 */
function prePaydayRunway(s,plan){
  const t=today();
  const payday=nextUpcomingPayday(plan);
  const occurrences=[];
  const attention=[];

  const bills=activeBills(s);
  bills.forEach(b=>{
    const amount=Math.max(0,num(b.amount));
    if(!(amount>0))return;

    const due=parseDate(b.due);
    const frequency=String(b.frequency||'one-off');

    if(!due){
      attention.push({
        tone:'warn',
        title:`${b.name} needs a date`,
        note:`${frequency==='one-off'||frequency==='yearly'?'Finance cannot safely place this commitment before payday without a due date.':'Recurring bill has no starting due date, so it is excluded from the before-payday cash runway.'}`
      });
      return;
    }

    if(frequency==='one-off'){
      if(!payday||due.getTime()<=payday.getTime()){
        if(due.getTime()<=payday?.getTime()||due.getTime()<t.getTime()){
          occurrences.push({
            id:`${b.id}:${dateISO(due)}`,
            billId:b.id,
            name:b.name,
            amount,
            date:dateISO(due),
            fundingSource:b.fundingSource||'Current Account',
            category:b.category||'Other',
            overdue:due.getTime()<t.getTime(),
            sourceType:'BILL'
          });
        }
      }
      return;
    }

    let cursor=new Date(due.getTime()),guard=0;
    if(cursor.getTime()<t.getTime()){
      occurrences.push({
        id:`${b.id}:${dateISO(cursor)}:overdue`,
        billId:b.id,
        name:b.name,
        amount,
        date:dateISO(cursor),
        fundingSource:b.fundingSource||'Current Account',
        category:b.category||'Other',
        overdue:true,
        sourceType:'BILL'
      });

      let next=nextFrequencyDate(cursor,frequency);
      while(next&&next.getTime()<t.getTime()&&guard++<160){
        const newer=nextFrequencyDate(next,frequency);
        if(!newer||newer.getTime()===next.getTime())break;
        next=newer;
      }
      cursor=next;
    }

    guard=0;
    while(cursor&&payday&&cursor.getTime()<=payday.getTime()&&guard++<160){
      if(cursor.getTime()>=t.getTime()){
        occurrences.push({
          id:`${b.id}:${dateISO(cursor)}`,
          billId:b.id,
          name:b.name,
          amount,
          date:dateISO(cursor),
          fundingSource:b.fundingSource||'Current Account',
          category:b.category||'Other',
          overdue:false,
          sourceType:'BILL'
        });
      }
      const next=nextFrequencyDate(cursor,frequency);
      if(!next||next.getTime()===cursor.getTime())break;
      cursor=next;
    }
  });

  // House Ledger is intentionally not duplicated into normal Bills, but a
  // reserved House payment with a real date is still a real pre-payday cash move.
  const hpj=s?.finance?.houseProject||{};
  const hPot=housePot(s);
  arr(hpj.entries).filter(e=>e.status==='reserved').forEach(e=>{
    const due=parseDate(e.due);
    const amount=Math.max(0,num(e.estimated));
    if(!due||!(amount>0)||!payday)return;
    if(due.getTime()<=payday.getTime()){
      occurrences.push({
        id:`HOUSE:${e.id}`,
        billId:e.id,
        name:e.name,
        amount,
        date:dateISO(due),
        fundingSource:hPot?.name||'House Fund',
        category:e.room||'House Project',
        overdue:due.getTime()<t.getTime(),
        sourceType:'HOUSE'
      });
    }
  });

  occurrences.sort((a,b)=>{
    if(a.overdue!==b.overdue)return a.overdue?-1:1;
    return String(a.date||'9999').localeCompare(String(b.date||'9999'))||a.name.localeCompare(b.name);
  });

  const potMap=new Map(activePots(s).map(p=>[norm(p.name),p]));
  const sourceRows=new Map();

  function startingBalance(source){
    if(isCurrentAccount(source))return Math.max(0,num(plan.openingCash));
    const p=potMap.get(norm(source));
    return p?Math.max(0,num(p.balance)):0;
  }

  occurrences.forEach(o=>{
    const key=norm(o.fundingSource)||'current account';
    let row=sourceRows.get(key);
    if(!row){
      row={
        key,
        name:o.fundingSource||'Current Account',
        start:startingBalance(o.fundingSource),
        total:0,
        remaining:startingBalance(o.fundingSource),
        occurrences:[],
        missing:!isCurrentAccount(o.fundingSource)&&!potMap.has(key)
      };
      sourceRows.set(key,row);
    }
    const before=row.remaining;
    row.total+=o.amount;
    row.remaining-=o.amount;
    row.occurrences.push({...o,covered:before+0.005>=o.amount,balanceBefore:before,balanceAfter:row.remaining});
  });

  const sources=[...sourceRows.values()];
  const totalOut=Number(occurrences.reduce((sum,o)=>sum+o.amount,0).toFixed(2));
  const overdue=occurrences.filter(o=>o.overdue);

  sources.forEach(x=>{
    if(x.missing){
      attention.push({
        tone:'block',
        title:`${x.name} pot is missing`,
        note:`${money(x.total)} of known commitments are assigned to this funding source.`
      });
    }else if(x.remaining<-.005){
      attention.push({
        tone:'block',
        title:`${x.name} is short by ${money(Math.abs(x.remaining))}`,
        note:`Known commitments before payday total ${money(x.total)} against ${money(x.start)} currently available.`
      });
    }
  });

  if(overdue.length){
    attention.push({
      tone:'block',
      title:`${overdue.length} overdue commitment${overdue.length===1?'':'s'}`,
      note:`${overdue.slice(0,3).map(x=>x.name).join(', ')}${overdue.length>3?'…':''}`
    });
  }

  const current= sources.find(x=>isCurrentAccount(x.name)) || {
    name:'Current Account',start:Math.max(0,num(plan.openingCash)),total:0,remaining:Math.max(0,num(plan.openingCash)),occurrences:[]
  };
  const holding=sources.find(x=>isHoldingPotName(x.name)) || {
    name:'Holding Pot',start:Math.max(0,num(holdingPot(s)?.balance)),total:0,remaining:Math.max(0,num(holdingPot(s)?.balance)),occurrences:[]
  };

  const allCovered=sources.every(x=>!x.missing&&x.remaining>=-.005);
  if(!attention.length&&allCovered){
    attention.push({
      tone:'good',
      title:'All known pre-payday commitments are covered',
      note:payday?`Known dated outgoings are protected through ${humanDate(payday)}.`:'Choose the payday date to build the runway.'
    });
  }

  return {
    payday,
    occurrences,
    sources,
    totalOut,
    current,
    holding,
    attention,
    allCovered
  };
}

function routeLabel(s){
  const r=s?.transfer?.route;
  if(r&&arr(r.allocations).length){
    const accounts=[...new Set(arr(r.allocations).map(a=>{
      const x=norm(a.account);
      if(x.includes('212'))return 'T212';
      if(/\big\b/.test(x)||x.includes('ig isa'))return 'IG';
      return '';
    }).filter(Boolean))];
    if(accounts.length===2)return 'IG + T212';
    if(accounts.length===1)return accounts[0];
  }
  if(r?.brokerScope==='IG')return 'IG';
  if(r?.brokerScope==='T212')return 'T212';
  if(r?.brokerScope==='both')return 'IG + T212';
  if(s?.mission)return 'Awaiting Transfer';
  return 'No active route';
}
function activeMissionAmount(s,plan){
  const m=s?.mission;
  if(m&&['FINANCE_APPROVED','SCOUTING_READY','TRANSFER_READY','REGISTERED'].includes(String(m.status||''))){
    return Math.max(0,num(m.approvedBudget));
  }
  return Math.max(0,num(plan.releaseAmount));
}

function coverageTone(ok){return ok?'good':'block'}
function attentionHtml(rows){
  if(!rows.length)return '<div class="fv2-attention good"><i>✓</i><div><strong>No finance actions required</strong><span>Known commitments are covered.</span></div></div>';
  return rows.slice(0,6).map(x=>`
    <div class="fv2-attention ${x.tone||'warn'}">
      <i>${x.tone==='good'?'✓':x.tone==='block'?'!':'•'}</i>
      <div><strong>${esc(x.title)}</strong><span>${esc(x.note)}</span></div>
    </div>
  `).join('');
}

function buildOverview(){
  if(document.getElementById('financeV2LiveBoard'))return;
  const hero=document.querySelector('.finance-command-hero');
  if(!hero)return;

  const section=document.createElement('section');
  section.id='financeV2LiveBoard';
  section.className='fv2-live-board';
  section.innerHTML=`
    <div class="fv2-command-strip">
      <article class="fv2-command-card release">
        <small>Payday Allocation</small>
        <strong id="fv2Allocation">£0.00</strong>
        <span id="fv2AllocationMeta">Not released</span>
      </article>
      <article class="fv2-command-card holding">
        <small>Holding Pot</small>
        <strong id="fv2HoldingBalance">£0.00</strong>
        <span id="fv2HoldingMeta">Protected balance now</span>
      </article>
      <article class="fv2-command-card surplus">
        <small>Safe Surplus</small>
        <strong id="fv2SafeSurplus">£0.00</strong>
        <span>After all payday protection</span>
      </article>
      <article class="fv2-command-card buffer">
        <small>Keep Buffered</small>
        <strong id="fv2KeepBuffered">£0.00</strong>
        <span>Personal protected cash</span>
      </article>
      <article class="fv2-command-card route">
        <small>Broker Route</small>
        <strong id="fv2BrokerRoute">—</strong>
        <span id="fv2BrokerMeta">Transfer handoff</span>
      </article>
    </div>

    <div class="fv2-overview-grid">
      <article class="fv2-money-position">
        <div class="fv2-panel-head">
          <div><small>LIVE MONEY POSITION</small><h3>Holding Pot protection</h3></div>
          <span id="fv2CoverageBadge" class="fv2-badge">CHECKING</span>
        </div>
        <div class="fv2-balance-hero">
          <div>
            <span>Holding Pot Balance</span>
            <strong id="fv2HoldingHero">£0.00</strong>
            <small id="fv2HoldingHeroMeta">Current protected balance</small>
          </div>
          <div class="fv2-ring" id="fv2CoverageRing"><b id="fv2CoveragePct">0%</b><span>covered</span></div>
        </div>
        <div class="fv2-money-grid">
          <div><small>Going out before payday</small><strong id="fv2BeforeOut">£0.00</strong><span id="fv2BeforeCount">0 known payments</span></div>
          <div><small>Holding Pot outgoing</small><strong id="fv2HoldingOut">£0.00</strong><span>Known before payday</span></div>
          <div><small>Projected Holding Pot</small><strong id="fv2HoldingProjected">£0.00</strong><span>After known pre-payday payments</span></div>
          <div><small>Current Account outgoing</small><strong id="fv2CurrentOut">£0.00</strong><span>Before payday</span></div>
          <div><small>Projected Current Account</small><strong id="fv2CurrentProjected">£0.00</strong><span>Opening cash less known payments</span></div>
          <div><small>Finance protection status</small><strong id="fv2CoveredStatus">—</strong><span id="fv2CoveredMeta">Checking sources</span></div>
        </div>
        <div id="fv2CashflowList" class="fv2-cashflow"></div>
      </article>

      <div class="fv2-side-stack">
        <article class="fv2-side-card">
          <small>Next Payday</small>
          <strong id="fv2NextPayday">—</strong>
          <span id="fv2NextPaydayMeta">Upcoming pay cycle</span>
        </article>
        <article class="fv2-side-card highlight">
          <small>Holding Pot Transfer Needed</small>
          <strong id="fv2HoldingMove">£0.00</strong>
          <span id="fv2HoldingMoveMeta">Normal funding + safety top-up</span>
        </article>
        <article class="fv2-attention-card">
          <div class="fv2-panel-head compact">
            <div><small>FINANCE GUARDIAN</small><h3>What needs attention</h3></div>
            <span id="fv2AttentionCount" class="fv2-badge">0</span>
          </div>
          <div id="fv2AttentionList"></div>
        </article>
      </div>
    </div>
  `;
  hero.insertAdjacentElement('afterend',section);
}

function buildPaydaySummary(){
  if(document.getElementById('financeV2PaydaySummary'))return;
  const panel=document.getElementById('paydayPanel');
  if(!panel)return;

  const strip=document.createElement('section');
  strip.id='financeV2PaydaySummary';
  strip.className='fv2-payday-summary';
  strip.innerHTML=`
    <div class="fv2-panel-head">
      <div><small>PAYDAY ALLOCATION</small><h3>Protect → Fund → Invest</h3></div>
      <span id="fv2PaydayStatus" class="fv2-badge">LIVE PLAN</span>
    </div>
    <div class="fv2-payday-flow">
      <div><small>Total cash</small><strong id="fv2PayTotalCash">£0.00</strong><span>Opening + wages + extra</span></div>
      <i>→</i>
      <div><small>Commitments</small><strong id="fv2PayCommitments">£0.00</strong><span>Bills + pots + Holding Pot</span></div>
      <i>→</i>
      <div><small>Protected cash</small><strong id="fv2PayProtected">£0.00</strong><span>Keep buffered</span></div>
      <i>→</i>
      <div class="safe"><small>Safe surplus</small><strong id="fv2PaySafe">£0.00</strong><span>Maximum releasable</span></div>
      <i>→</i>
      <div class="release"><small>Planned release</small><strong id="fv2PayRelease">£0.00</strong><span id="fv2PayReleaseMeta">Awaiting amount</span></div>
    </div>
    <div class="fv2-payday-mini">
      <div><span>Next payday</span><strong id="fv2PayDate">—</strong></div>
      <div><span>Holding Pot move</span><strong id="fv2PayHoldingMove">£0.00</strong></div>
      <div><span>Goal pot funding</span><strong id="fv2PayGoalPots">£0.00</strong></div>
      <div><span>Current Account bills</span><strong id="fv2PayBills">£0.00</strong></div>
      <div><span>Coverage</span><strong id="fv2PayCoverage">—</strong></div>
    </div>
  `;
  panel.insertAdjacentElement('afterbegin',strip);

  const layout=panel.querySelector('.finance-command-grid.two');
  layout?.classList.add('fv2-payday-layout');
}

function buildPotsIntro(){
  if(document.getElementById('financeV2PotsCommand'))return;
  const panel=document.getElementById('potsPanel');
  if(!panel)return;
  const intro=document.createElement('section');
  intro.id='financeV2PotsCommand';
  intro.className='fv2-section-command';
  intro.innerHTML=`
    <div class="fv2-panel-head">
      <div><small>PROTECTED SAVINGS</small><h3>Pots Command</h3><p>Balances first, required payday funding second, deadlines and priority visible without opening each editor.</p></div>
      <span id="fv2PotHealthBadge" class="fv2-badge">CHECKING</span>
    </div>
    <div class="fv2-mini-strip">
      <div><small>Holding Pot now</small><strong id="fv2PotsHolding">£0.00</strong></div>
      <div><small>Holding move next payday</small><strong id="fv2PotsHoldingMove">£0.00</strong></div>
      <div><small>Goal pot funding</small><strong id="fv2PotsGoalFunding">£0.00</strong></div>
      <div><small>Pots needing funding</small><strong id="fv2PotsNeedCount">0</strong></div>
      <div><small>Total pot cash</small><strong id="fv2PotsCash">£0.00</strong></div>
    </div>
  `;
  panel.insertAdjacentElement('afterbegin',intro);

  const grids=panel.querySelectorAll('.finance-command-grid.two');
  grids.forEach(g=>g.classList.add('fv2-editor-layout'));
}

function buildHouseCommand(){
  if(document.getElementById('financeV2HouseCommand'))return;
  const panel=document.getElementById('housePanel');
  if(!panel)return;

  const command=document.createElement('section');
  command.id='financeV2HouseCommand';
  command.className='fv2-section-command house';
  command.innerHTML=`
    <div class="fv2-panel-head">
      <div><small>HOUSE PROJECT LEDGER</small><h3>Renovation Money Position</h3><p>See real House Fund cash, reserved work and the next payment before editing individual records.</p></div>
      <span id="fv2HouseBadge" class="fv2-badge">CHECKING</span>
    </div>
    <div class="fv2-mini-strip six">
      <div><small>House Fund</small><strong id="fv2HouseCash">£0.00</strong></div>
      <div><small>Reserved</small><strong id="fv2HouseReserved">£0.00</strong></div>
      <div><small>Available</small><strong id="fv2HouseAvailable">£0.00</strong></div>
      <div><small>Actual spent</small><strong id="fv2HouseSpent">£0.00</strong></div>
      <div><small>Next payment</small><strong id="fv2HouseNext">—</strong></div>
      <div><small>Still to fund</small><strong id="fv2HouseRemaining">£0.00</strong></div>
    </div>
  `;
  panel.insertAdjacentElement('afterbegin',command);

  panel.querySelectorAll('.finance-command-grid.two').forEach(g=>g.classList.add('fv2-editor-layout'));
}

function setText(id,value){
  const el=document.getElementById(id);
  if(el)el.textContent=value;
}
function setBadge(id,label,tone){
  const el=document.getElementById(id);
  if(!el)return;
  el.textContent=label;
  el.className=`fv2-badge ${tone||''}`.trim();
}

function renderOverview(s,plan,p,runway){
  const c=p.c||{},auto=c.auto||{},hp=holdingPot(s);
  const hpBalance=Math.max(0,num(hp?.balance));
  const dynamic=Math.max(0,num(auto.holdingDynamicTarget));
  const coveragePct=dynamic>0?Math.min(100,hpBalance/dynamic*100):(hpBalance>0?100:0);

  setText('fv2Allocation',money(activeMissionAmount(s,plan)));
  setText('fv2AllocationMeta',s.mission?String(s.mission.status||'MISSION').replaceAll('_',' '):num(plan.releaseAmount)>0?'Planned release':'Not released');
  setText('fv2HoldingBalance',money(hpBalance));
  setText('fv2HoldingMeta',dynamic>0?`Dynamic target ${money(dynamic)}`:'Protected balance now');
  setText('fv2SafeSurplus',money(c.safeSurplus));
  setText('fv2KeepBuffered',money(plan.protectedCash));
  setText('fv2BrokerRoute',routeLabel(s));
  setText('fv2BrokerMeta',s.transfer?.route?.locked?'Locked Transfer route':'Transfer handoff');

  setText('fv2HoldingHero',money(hpBalance));
  setText('fv2HoldingHeroMeta',dynamic>0
    ?`${hpBalance>=dynamic?money(hpBalance-dynamic)+' above':money(dynamic-hpBalance)+' below'} dynamic target`
    :'No dynamic target currently required');
  setText('fv2CoveragePct',`${Math.round(coveragePct)}%`);
  const ring=document.getElementById('fv2CoverageRing');
  if(ring)ring.style.setProperty('--coverage',`${Math.max(0,Math.min(100,coveragePct))}%`);

  const attentionBlocks=runway.attention.filter(x=>x.tone==='block').length;
  setBadge('fv2CoverageBadge',runway.allCovered?'PRE-PAYDAY COVERED':attentionBlocks?'ACTION REQUIRED':'CHECK',''+(runway.allCovered?'good':attentionBlocks?'block':'warn'));

  setText('fv2BeforeOut',money(runway.totalOut));
  setText('fv2BeforeCount',`${runway.occurrences.length} known payment${runway.occurrences.length===1?'':'s'}`);
  setText('fv2HoldingOut',money(runway.holding.total));
  setText('fv2HoldingProjected',money(runway.holding.remaining));
  setText('fv2CurrentOut',money(runway.current.total));
  setText('fv2CurrentProjected',money(runway.current.remaining));
  setText('fv2CoveredStatus',runway.allCovered?'COVERED':'CHECK');
  setText('fv2CoveredMeta',runway.allCovered?'Every known funding source is sufficient':'One or more funding sources need attention');

  const flow=document.getElementById('fv2CashflowList');
  if(flow){
    if(!runway.occurrences.length){
      flow.innerHTML='<div class="fv2-empty">No dated commitments are currently scheduled before the next payday.</div>';
    }else{
      flow.innerHTML=runway.occurrences.slice(0,10).map(o=>`
        <div class="fv2-cashflow-row ${o.overdue?'overdue':''}">
          <div><strong>${esc(o.name)}</strong><span>${esc(occurrenceDateLabel(o))} • ${esc(o.fundingSource)}${o.sourceType==='HOUSE'?' • House Ledger':''}</span></div>
          <b>− ${money(o.amount)}</b>
        </div>
      `).join('');
    }
  }

  setText('fv2NextPayday',runway.payday?humanDate(runway.payday):'—');
  setText('fv2NextPaydayMeta',runway.payday
    ?`${Math.max(0,dayDiff(today(),runway.payday))} day${dayDiff(today(),runway.payday)===1?'':'s'} away`
    :'Set the payday date in Payday Control');
  setText('fv2HoldingMove',money(p.holdingContribution));
  setText('fv2HoldingMoveMeta',num(auto.holdingTopUp)>0
    ?`${money(auto.annualHoldingContribution)} normal + ${money(auto.holdingTopUp)} safety`
    :`${money(auto.annualHoldingContribution)} normal funding • no extra safety top-up`);

  setText('fv2AttentionCount',String(runway.attention.filter(x=>x.tone!=='good').length));
  const att=document.getElementById('fv2AttentionList');
  if(att)att.innerHTML=attentionHtml(runway.attention);
}

function renderPaydaySummary(s,plan,p,runway){
  const c=p.c||{},auto=c.auto||{};
  setText('fv2PayTotalCash',money(c.totalCash));
  setText('fv2PayCommitments',money(c.commitments));
  setText('fv2PayProtected',money(plan.protectedCash));
  setText('fv2PaySafe',money(c.safeSurplus));
  setText('fv2PayRelease',money(plan.releaseAmount));
  setText('fv2PayReleaseMeta',num(plan.releaseAmount)>num(c.safeSurplus)+.005?'Above safe surplus':'Within Finance limit');
  setText('fv2PayDate',runway.payday?humanDate(runway.payday):'—');
  setText('fv2PayHoldingMove',money(p.holdingContribution));
  setText('fv2PayGoalPots',money(p.goalPotsTotal));
  setText('fv2PayBills',money(auto.billsDue));
  setText('fv2PayCoverage',runway.allCovered?'COVERED':'CHECK');
  setBadge('fv2PaydayStatus',
    num(plan.releaseAmount)>num(c.safeSurplus)+.005?'BLOCKED':runway.allCovered?'FINANCE READY':'CHECK PLAN',
    num(plan.releaseAmount)>num(c.safeSurplus)+.005?'block':runway.allCovered?'good':'warn'
  );
}

function potStatus(p,hp,pv){
  if(p.archived)return {label:'ARCHIVED',tone:'muted'};
  if(isHoldingPotName(p.name)){
    const dynamic=num(pv?.c?.auto?.holdingDynamicTarget);
    const after=num(pv?.c?.auto?.holdingAfterFunding);
    if(dynamic<=0)return {label:'PROTECTED',tone:'good'};
    return after+0.005>=dynamic?{label:'FUNDED NEXT PAYDAY',tone:'good'}:{label:'TOP-UP NEEDED',tone:'block'};
  }
  const gap=potGap(p);
  if(gap<=.005)return {label:'FUNDED',tone:'good'};
  const deadline=parseDate(p.deadline);
  if(deadline&&deadline.getTime()<today().getTime())return {label:'DEADLINE PASSED',tone:'block'};
  if(deadline&&dayDiff(today(),deadline)<=35)return {label:'DUE SOON',tone:'warn'};
  return {label:'FUNDING',tone:'info'};
}

function renderPots(s,pv){
  const host=document.getElementById('potList');
  if(!host)return;
  const pots=[...arr(s.finance?.pots)];
  const hp=holdingPot(s);
  const auto=pv?.c?.auto||{};

  const sorted=pots.sort((a,b)=>{
    if(isHoldingPotName(a.name)!==isHoldingPotName(b.name))return isHoldingPotName(a.name)?-1:1;
    if(!!a.archived!==!!b.archived)return a.archived?1:-1;
    const pa=num(a.priority)||2,pb=num(b.priority)||2;
    if(pa!==pb)return pa-pb;
    const da=parseDate(a.deadline)?.getTime()||Infinity,db=parseDate(b.deadline)?.getTime()||Infinity;
    return da-db||String(a.name).localeCompare(String(b.name));
  });

  if(!sorted.length){
    host.innerHTML='<div class="fv2-empty">No Finance pots yet.</div>';
    return;
  }

  host.innerHTML=`<div class="fv2-pot-grid">${sorted.map(p=>{
    const holding=isHoldingPotName(p.name);
    const target=holding?Math.max(num(auto.holdingDynamicTarget),num(p.target)):Math.max(0,num(p.target));
    const funded=potFunded(p);
    const balance=Math.max(0,num(p.balance));
    const gap=Math.max(0,target-funded);
    const next=holding?Math.max(0,num(pv.holdingContribution)):Math.min(gap,Math.max(0,num(p.fundingPerPayday)));
    const pct=target>0?Math.min(100,funded/target*100):(funded>0?100:0);
    const st=potStatus(p,hp,pv);
    const deadline=p.deadline?humanDate(p.deadline):'No deadline';
    const goal=p.goalMode==='funded-progress'
      ?`${money(balance)} cash + ${money(p.spent)} spent`
      :`${money(balance)} live balance`;

    return `
      <article class="fv2-pot-card ${holding?'holding':''} ${p.archived?'is-archived':''}">
        <div class="fv2-pot-head">
          <div>
            <small>${holding?'HOLDING POT • DYNAMIC PROTECTION':`P${num(p.priority)||2} • ${p.goalMode==='funded-progress'?'FUNDED PROGRESS':'BALANCE TARGET'}`}</small>
            <h4>${esc(p.name)}</h4>
          </div>
          <span class="fv2-status ${st.tone}">${esc(st.label)}</span>
        </div>
        <div class="fv2-pot-balance"><strong>${money(balance)}</strong><span>${esc(goal)}</span></div>
        <div class="fv2-pot-progress"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div class="fv2-pot-metrics">
          <div><small>${holding?'Dynamic target':'Target'}</small><strong>${money(target)}</strong></div>
          <div><small>Gap</small><strong>${money(gap)}</strong></div>
          <div><small>Next payday</small><strong>${money(next)}</strong></div>
          <div><small>Deadline</small><strong>${esc(deadline)}</strong></div>
        </div>
        <div class="fv2-pot-note">${esc(holding
          ?`13-pay contribution ${money(auto.annualHoldingContribution)}${num(auto.holdingTopUp)>0?` + ${money(auto.holdingTopUp)} safety top-up`:''}`
          :(p.fundingReason||'Finance funding engine controls the payday pace.'))}</div>
        <div class="fv2-card-actions">
          <button class="btn secondary" data-pot-edit="${esc(p.id)}">Edit</button>
          <button class="btn secondary" data-pot-archive="${esc(p.id)}">${p.archived?'Restore':'Archive'}</button>
        </div>
      </article>
    `;
  }).join('')}</div>`;
}

function billStatus(b,payday){
  if(b.archived)return {label:'ARCHIVED',tone:'muted'};
  if(b.paid)return {label:'PAID',tone:'good'};
  if(b.included===false)return {label:'EXCLUDED',tone:'muted'};
  const d=parseDate(b.due),t=today();
  if(!d)return {label:'DATE NEEDED',tone:'warn'};
  if(d.getTime()<t.getTime())return {label:'OVERDUE',tone:'block'};
  if(payday&&d.getTime()<=payday.getTime())return {label:'BEFORE PAYDAY',tone:'warn'};
  const days=dayDiff(t,d);
  if(days<=7)return {label:'NEXT 7 DAYS',tone:'warn'};
  return {label:'PLANNED',tone:'info'};
}
function frequencyLabel(v){
  return ({
    'one-off':'One-off',
    weekly:'Weekly',
    '4-weeks':'Every 4 weeks',
    '5-weeks':'Every 5 weeks',
    monthly:'Monthly',
    yearly:'Yearly'
  })[v]||String(v||'');
}
function fundingBalance(s,source,plan){
  if(isCurrentAccount(source))return Math.max(0,num(plan.openingCash));
  const p=activePots(s).find(x=>norm(x.name)===norm(source));
  return p?Math.max(0,num(p.balance)):null;
}

function renderBills(s,plan,runway){
  const host=document.getElementById('billList');
  if(!host)return;
  const rows=[...arr(s.finance?.bills)];
  const payday=runway.payday;

  rows.sort((a,b)=>{
    if(!!a.archived!==!!b.archived)return a.archived?1:-1;
    const sa=billStatus(a,payday),sb=billStatus(b,payday);
    const rank={block:0,warn:1,info:2,good:3,muted:4};
    if(rank[sa.tone]!==rank[sb.tone])return rank[sa.tone]-rank[sb.tone];
    const da=parseDate(a.due)?.getTime()||Infinity,db=parseDate(b.due)?.getTime()||Infinity;
    return da-db||String(a.name).localeCompare(String(b.name));
  });

  if(!rows.length){
    host.innerHTML='<div class="fv2-empty">No Finance bills yet.</div>';
    return;
  }

  const active=rows.filter(b=>!b.archived);
  const urgent=active.filter(b=>['block','warn'].includes(billStatus(b,payday).tone));
  const later=active.filter(b=>!['block','warn'].includes(billStatus(b,payday).tone));
  const archived=rows.filter(b=>b.archived);

  function section(label,list){
    if(!list.length)return '';
    return `
      <div class="fv2-list-section">
        <div class="fv2-list-section-head"><strong>${esc(label)}</strong><span>${list.length}</span></div>
        <div class="fv2-bill-stack">
          ${list.map(b=>{
            const st=billStatus(b,payday);
            const bal=fundingBalance(s,b.fundingSource,plan);
            const amount=Math.max(0,num(b.amount));
            const sourceCovered=bal==null?false:bal+0.005>=amount;
            const actualId=`actual-${b.id}`;
            const canComplete=!b.archived&&!b.paid&&b.included!==false;
            return `
              <article class="fv2-bill-card ${b.archived?'is-archived':''}">
                <div class="fv2-bill-main">
                  <div class="fv2-bill-title">
                    <div><small>${esc(b.category||'Other')} • ${esc(frequencyLabel(b.frequency))}</small><h4>${esc(b.name)}</h4></div>
                    <span class="fv2-status ${st.tone}">${esc(st.label)}</span>
                  </div>
                  <div class="fv2-bill-money">
                    <strong>${money(amount)}</strong>
                    <span>${b.due?`Due ${esc(humanDate(b.due))}`:'Due date not set'}</span>
                  </div>
                  <div class="fv2-bill-source ${sourceCovered?'covered':'check'}">
                    <div><small>Funding source</small><strong>${esc(b.fundingSource||'Current Account')}</strong></div>
                    <div><small>Available now</small><strong>${bal==null?'POT MISSING':money(bal)}</strong></div>
                    <span>${sourceCovered?'This individual bill is covered by the current source balance.':'Check funding source / balance.'}</span>
                  </div>
                </div>
                <div class="fv2-bill-actions">
                  ${canComplete?`
                    <div class="fv2-actual"><label>Actual</label><input id="${esc(actualId)}" type="number" min="0" step="0.01" value="${amount.toFixed(2)}"></div>
                    <button class="btn primary" data-bill-complete="${esc(b.id)}">Complete</button>
                  `:''}
                  <button class="btn secondary" data-bill-edit="${esc(b.id)}">Edit</button>
                  <button class="btn secondary" data-bill-archive="${esc(b.id)}">${b.archived?'Restore':'Archive'}</button>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  host.innerHTML=section('Needs attention / before payday',urgent)+section('Later commitments',later)+section('Archived',archived);
}

function renderPotCommand(s,pv){
  const pots=activePots(s),hp=holdingPot(s);
  const auto=pv?.c?.auto||{};
  const goal=pots.filter(p=>!isHoldingPotName(p.name));
  const needing=goal.filter(p=>Math.min(potGap(p),Math.max(0,num(p.fundingPerPayday)))>.005);
  const cash=pots.reduce((sum,p)=>sum+Math.max(0,num(p.balance)),0);

  setText('fv2PotsHolding',money(hp?.balance));
  setText('fv2PotsHoldingMove',money(pv.holdingContribution));
  setText('fv2PotsGoalFunding',money(pv.goalPotsTotal));
  setText('fv2PotsNeedCount',String(needing.length));
  setText('fv2PotsCash',money(cash));

  const block=!hp&&activeBills(s).some(b=>isHoldingPotName(b.fundingSource));
  const gap=goal.reduce((sum,p)=>sum+potGap(p),0);
  setBadge('fv2PotHealthBadge',block?'HOLDING POT MISSING':gap<=.005?'ALL FUNDED':`${needing.length} FUNDING NEXT`,block?'block':gap<=.005?'good':'warn');
}

function houseMetrics(s){
  const hpj=s?.finance?.houseProject||{};
  const p=housePot(s);
  const cash=Math.max(0,num(p?.balance));
  const target=Math.max(0,num(hpj.target||p?.target));
  const entries=arr(hpj.entries);
  const reserved=entries.filter(e=>e.status==='reserved').reduce((sum,e)=>sum+Math.max(0,num(e.estimated)),0);
  const entrySpend=entries.filter(e=>e.status==='paid'||e.status==='historical').reduce((sum,e)=>sum+Math.max(0,num(e.actual)),0);
  const spent=Math.max(0,num(hpj.openingHistoricalSpend))+entrySpend;
  const funded=cash+spent;
  const remaining=Math.max(0,target-funded);
  const available=Math.max(0,cash-reserved);
  const upcoming=entries.filter(e=>e.status==='reserved'&&parseDate(e.due))
    .sort((a,b)=>parseDate(a.due)-parseDate(b.due))[0]||null;
  return {hpj,p,cash,target,reserved,spent,funded,remaining,available,entries,upcoming};
}
function renderHouseCommand(s){
  const m=houseMetrics(s);
  setText('fv2HouseCash',money(m.cash));
  setText('fv2HouseReserved',money(m.reserved));
  setText('fv2HouseAvailable',money(m.available));
  setText('fv2HouseSpent',money(m.spent));
  setText('fv2HouseNext',m.upcoming?`${humanDate(m.upcoming.due)} • ${money(m.upcoming.estimated)}`:'None dated');
  setText('fv2HouseRemaining',money(m.remaining));
  setBadge('fv2HouseBadge',
    m.reserved>m.cash+.005?'RESERVATIONS EXCEED CASH':m.remaining<=.005?'PROJECT FUNDED':'HOUSE FUND LIVE',
    m.reserved>m.cash+.005?'block':m.remaining<=.005?'good':'warn'
  );
}
function renderHouseLedger(s){
  const host=document.getElementById('houseLedgerList');
  if(!host)return;
  const m=houseMetrics(s);
  const reserved=m.entries.filter(e=>e.status==='reserved')
    .sort((a,b)=>(parseDate(a.due)?.getTime()||Infinity)-(parseDate(b.due)?.getTime()||Infinity)||String(a.name).localeCompare(String(b.name)));
  const completed=m.entries.filter(e=>e.status==='paid'||e.status==='historical')
    .sort((a,b)=>String(b.paidDate||b.due||'').localeCompare(String(a.paidDate||a.due||'')));

  setText('houseLedgerMeta',`${m.entries.length} record${m.entries.length===1?'':'s'}`);

  function entryCard(e){
    const reservedStatus=e.status==='reserved';
    const due=parseDate(e.due);
    const overdue=reservedStatus&&due&&due.getTime()<today().getTime();
    const tone=e.status==='paid'||e.status==='historical'?'good':overdue?'block':'warn';
    const status=e.status==='reserved'?(overdue?'OVERDUE':'RESERVED'):e.status==='paid'?'PAID':'HISTORICAL';
    return `
      <article class="fv2-house-entry">
        <div class="fv2-house-main">
          <div class="fv2-house-title">
            <div><small>${esc(e.room||'Whole House')} • ${esc(e.category||'House project')}</small><h4>${esc(e.name)}</h4></div>
            <span class="fv2-status ${tone}">${status}</span>
          </div>
          <div class="fv2-house-money">
            <div><small>Estimated</small><strong>${money(e.estimated)}</strong></div>
            <div><small>Actual</small><strong>${money(e.actual)}</strong></div>
            <div><small>${reservedStatus?'Due':'Paid / record date'}</small><strong>${esc(e.due?humanDate(e.due):'Not set')}</strong></div>
          </div>
          ${e.notes?`<div class="fv2-pot-note">${esc(e.notes)}</div>`:''}
        </div>
        <div class="fv2-house-actions">
          ${reservedStatus?`
            <div class="fv2-actual"><label>Actual</label><input type="number" min="0" step="0.01" value="${Math.max(0,num(e.actual)).toFixed(2)}" data-house-actual="${esc(e.id)}"></div>
            <button class="btn primary" data-house-pay="${esc(e.id)}">Mark Paid</button>
          `:''}
          <button class="btn secondary" data-house-edit="${esc(e.id)}">Edit</button>
          ${e.status==='paid'&&e.deducted?`<button class="btn secondary" data-house-undo="${esc(e.id)}">Undo</button>`:''}
          <button class="btn secondary" data-house-delete="${esc(e.id)}">Delete</button>
        </div>
      </article>
    `;
  }

  host.innerHTML=`
    <div class="fv2-list-section">
      <div class="fv2-list-section-head"><strong>Upcoming / reserved work</strong><span>${reserved.length}</span></div>
      <div class="fv2-house-stack">${reserved.length?reserved.map(entryCard).join(''):'<div class="fv2-empty">No reserved house work.</div>'}</div>
    </div>
    <div class="fv2-list-section">
      <div class="fv2-list-section-head"><strong>Paid / historical</strong><span>${completed.length}</span></div>
      <div class="fv2-house-stack">${completed.length?completed.map(entryCard).join(''):'<div class="fv2-empty">No completed house records.</div>'}</div>
    </div>
  `;
}

function renderAll(){
  const s=state();
  if(!s)return;

  buildOverview();
  buildPaydaySummary();
  buildPotsIntro();
  buildHouseCommand();

  const plan=currentPlanFromDom(s);
  const pv=preview(s,plan);
  const runway=prePaydayRunway(s,plan);

  renderOverview(s,plan,pv,runway);
  renderPaydaySummary(s,plan,pv,runway);
  renderPotCommand(s,pv);
  renderPots(s,pv);
  renderBills(s,plan,runway);
  renderHouseCommand(s);
  renderHouseLedger(s);
}

let renderTimer=null;
function scheduleRender(delay=0){
  clearTimeout(renderTimer);
  renderTimer=setTimeout(renderAll,delay);
}

function markPlanInputs(){
  ['paydayDate','openingCash','expectedWages','wagesReceived','extraCash','otherPlanned','protectedCash','releaseAmount']
    .forEach(id=>{
      const el=document.getElementById(id);
      if(!el)return;
      el.dataset.financeV2UseDom='1';
      el.addEventListener('input',()=>scheduleRender(40));
      el.addEventListener('change',()=>scheduleRender(40));
    });
}

function start(){
  if(!A()?.core?.read){
    setTimeout(start,200);
    return;
  }
  markPlanInputs();
  scheduleRender(0);
  setTimeout(renderAll,200);
  w.addEventListener('aurora2:state',()=>scheduleRender(0));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')scheduleRender(40);
  });
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',start,{once:true});
}else{
  start();
}

})(window);
