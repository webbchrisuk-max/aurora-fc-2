(function(w){
  'use strict';
  const KEY='aurora2:state:v1';
  const VERSION=6;
  const now=()=>new Date().toISOString();

  const defaultState=()=>({
    schemaVersion:VERSION,
    updatedAt:now(),
    connection:{mode:'foundation',status:'NOT_CONNECTED'},
    portfolio:{
      teamValue:null,annualIncome:null,monthlyIncome:null,squadSize:null,
      bestDividendPlayer:null,topAuroraPlayer:null
    },
    income:{nextDividend:null},
    decision:{
      title:'Aurora 2.0 foundation ready',
      note:'No investment decision engine is connected yet.',
      ticker:null,confidence:null
    },
    finance:{
      plan:{
        paydayDate:'',openingCash:0,netPay:0,extraCash:0,
        billsDue:0,potsDue:0,otherPlanned:0,protectedCash:0,releaseAmount:0
      },
      pots:[],
      bills:[],
      payments:[],
      fundingPolicy:{
        goalPotBudget:0,
        strategy:'priority',
        source:'AURORA2',
        legacyImported:false,
        lastCalculatedAt:null,
        lastPlan:null
      },
      houseProject:{
        version:1,
        target:0,
        openingHistoricalSpend:0,
        rooms:['Games Room','Living Room','Hallway','Kitchen','Whole House'],
        entries:[],
        actions:[],
        migrated:false,
        migration:null,
        updatedAt:null
      },
      lastCalculatedAt:null,
      lastReleasedAt:null
    },
    scouting:{
      status:'NOT_BUILT',
      targets:[],
      importedFromLegacy:false,
      source:null,
      updatedAt:null
    },
    transfer:{
      version:1,
      settings:{
        strategy:'sustainable',
        brokerScope:'both',
        minAllocation:250,
        increment:25
      },
      route:null,
      registrationDrafts:[],
      offers:[],
      migration:null,
      updatedAt:null
    },
    squad:{
      version:1,
      holdings:[],
      migration:null,
      source:'AURORA2',
      updatedAt:null
    },
    mission:null,
    alerts:[]
  });

  function object(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
  function safeParse(v){try{return JSON.parse(v)}catch(_){return null}}
  function normalizePot(p){
    const r=object(p);
    return {
      id:String(r.id||''),
      name:String(r.name||'Untitled pot'),
      balance:Math.max(0,Number(r.balance)||0),
      target:Math.max(0,Number(r.target)||0),
      fundingPerPayday:Math.max(0,Number(r.fundingPerPayday)||0),
      fundingOverride:Math.max(0,Number(r.fundingOverride)||0),
      fundingReason:String(r.fundingReason||''),
      fundingRequired:Math.max(0,Number(r.fundingRequired)||0),
      priority:[1,2,3].includes(Number(r.priority))?Number(r.priority):2,
      goalMode:r.goalMode==='funded-progress'?'funded-progress':'balance',
      spent:Math.max(0,Number(r.spent)||0),
      deadline:String(r.deadline||r.completeBy||r.targetDate||''),
      note:String(r.note||''),
      archived:Boolean(r.archived),
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }
  function normalizeBill(b){
    const r=object(b);
    const allowed=['one-off','weekly','4-weeks','5-weeks','monthly','yearly'];
    return {
      id:String(r.id||''),
      name:String(r.name||'Untitled bill'),
      amount:Math.max(0,Number(r.amount)||0),
      due:String(r.due||''),
      frequency:allowed.includes(r.frequency)?r.frequency:'one-off',
      fundingSource:String(r.fundingSource||'Current Account'),
      category:String(r.category||'Other'),
      included:r.included!==false,
      paid:Boolean(r.paid),
      archived:Boolean(r.archived),
      actualPaid:Math.max(0,Number(r.actualPaid)||0),
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }
  function normalizePayment(p){
    const r=object(p);
    return {
      id:String(r.id||''),
      billId:String(r.billId||''),
      billName:String(r.billName||'Payment'),
      amount:Math.max(0,Number(r.amount)||0),
      fundingSource:String(r.fundingSource||'Current Account'),
      paidAt:r.paidAt||now(),
      dueAtPayment:String(r.dueAtPayment||''),
      reversed:Boolean(r.reversed),
      reversedAt:r.reversedAt||null,
      beforeBill:object(r.beforeBill),
      beforePot:r.beforePot?object(r.beforePot):null
    };
  }

  function normalizeHouseEntry(e){
    const r=object(e), allowed=['reserved','paid','historical'];
    const status=allowed.includes(r.status)?r.status:'reserved';
    const estimated=Math.max(0,Number(r.estimated??r.amount)||0);
    const actual=Math.max(0,Number(r.actual??((status==='paid'||status==='historical')?r.amount:0))||0);
    return {
      id:String(r.id||''),
      name:String(r.name||'House payment'),
      estimated,
      actual,
      due:String(r.due||''),
      room:String(r.room||'Whole House'),
      category:String(r.category||'House project'),
      status,
      deducted:Boolean(r.deducted),
      paidDate:String(r.paidDate||''),
      notes:String(r.notes||''),
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }
  function normalizeHouseAction(a){
    const r=object(a);
    return {
      id:String(r.id||''),
      type:String(r.type||'change'),
      entryId:String(r.entryId||''),
      label:String(r.label||'House change'),
      amount:Math.max(0,Number(r.amount)||0),
      at:r.at||now(),
      reversed:Boolean(r.reversed),
      reversedAt:r.reversedAt||null,
      beforeEntry:r.beforeEntry?object(r.beforeEntry):null,
      beforePot:r.beforePot?object(r.beforePot):null
    };
  }

  function normalizeScoutingTarget(t){
    const r=object(t);
    const allowedStatus=['pass','caution','block'];
    const account=String(r.preferredAccount||r.account||r.platform||r.broker||'CHECK');
    return {
      id:String(r.id||''),
      ticker:String(r.ticker||r.symbol||'').toUpperCase(),
      name:String(r.name||r.company||r.companyName||r.ticker||'Target'),
      preferredAccount:account,
      status:allowedStatus.includes(String(r.status||'').toLowerCase())?String(r.status).toLowerCase():'pass',
      reason:String(r.reason||r.note||''),
      rank:Math.max(0,Number(r.rank)||0),
      yieldPct:Math.max(0,Number(r.yieldPct)||0),
      sustainableScore:Math.max(0,Math.min(100,Number(r.sustainableScore)||0)),
      confidence:Math.max(0,Math.min(100,Number(r.confidence)||0)),
      dividendSafety:Math.max(0,Math.min(100,Number(r.dividendSafety)||0)),
      incomeScore:Math.max(0,Math.min(100,Number(r.incomeScore)||0)),
      valuationScore:Math.max(0,Math.min(100,Number(r.valuationScore)||0)),
      portfolioFit:Math.max(0,Math.min(100,Number(r.portfolioFit)||0)),
      dividendGrowth:Math.max(0,Math.min(100,Number(r.dividendGrowth)||0)),
      businessQuality:Math.max(0,Math.min(100,Number(r.businessQuality)||0)),
      source:String(r.source||'SCOUTING'),
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }
  function normalizeTransferAllocation(a){
    const r=object(a);
    return {
      id:String(r.id||''),
      targetId:String(r.targetId||''),
      ticker:String(r.ticker||'').toUpperCase(),
      name:String(r.name||r.ticker||'Target'),
      account:String(r.account||r.preferredAccount||'CHECK'),
      amount:Math.max(0,Number(r.amount)||0),
      yieldPct:Math.max(0,Number(r.yieldPct)||0),
      expectedAnnualIncome:Math.max(0,Number(r.expectedAnnualIncome)||0),
      score:Math.max(0,Number(r.score)||0),
      reason:String(r.reason||''),
      status:String(r.status||'PLANNED')
    };
  }
  function normalizeTransferRoute(route){
    if(!route||typeof route!=='object')return null;
    const r=object(route);
    return {
      id:String(r.id||''),
      missionId:String(r.missionId||''),
      financeBudget:Math.max(0,Number(r.financeBudget)||0),
      strategy:['sustainable','maximum'].includes(r.strategy)?r.strategy:'sustainable',
      brokerScope:['both','IG','T212'].includes(r.brokerScope)?r.brokerScope:'both',
      minAllocation:Math.max(25,Number(r.minAllocation)||250),
      increment:Math.max(1,Number(r.increment)||25),
      allocations:Array.isArray(r.allocations)?r.allocations.map(normalizeTransferAllocation):[],
      allocated:Math.max(0,Number(r.allocated)||0),
      remaining:Math.max(0,Number(r.remaining)||0),
      expectedAnnualIncome:Math.max(0,Number(r.expectedAnnualIncome)||0),
      status:String(r.status||'DRAFT'),
      locked:Boolean(r.locked),
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }
  function normalizeRegistrationDraft(d){
    const r=object(d);
    return {
      id:String(r.id||''),
      routeId:String(r.routeId||''),
      missionId:String(r.missionId||''),
      allocationId:String(r.allocationId||''),
      transactionId:String(r.transactionId||''),
      tradeDate:String(r.tradeDate||''),
      account:String(r.account||''),
      ticker:String(r.ticker||'').toUpperCase(),
      name:String(r.name||r.ticker||''),
      side:String(r.side||'BUY').toUpperCase(),
      shares:Math.max(0,Number(r.shares)||0),
      priceInput:Math.max(0,Number(r.priceInput)||0),
      priceUnit:['GBP','PENCE'].includes(r.priceUnit)?r.priceUnit:'GBP',
      currency:String(r.currency||'GBP').toUpperCase(),
      fxRateToGbp:Math.max(0,Number(r.fxRateToGbp)||0),
      grossCostNative:Math.max(0,Number(r.grossCostNative)||0),
      feesNative:Math.max(0,Number(r.feesNative)||0),
      totalCostNative:Math.max(0,Number(r.totalCostNative)||0),
      totalCostGbp:Math.max(0,Number(r.totalCostGbp)||0),
      plannedAmount:Math.max(0,Number(r.plannedAmount)||0),
      differenceGbp:Number(r.differenceGbp)||0,
      status:String(r.status||'READY_FOR_BACKEND'),
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }

  function normalizeHolding(h){
    const r=object(h);
    const allowedStatus=['ACTIVE','LOCKED','SOLD','ARCHIVED'];
    const shares=Math.max(0,Number(r.shares)||0);
    const bookCostGbp=Math.max(0,Number(r.bookCostGbp)||0);
    const avgCostGbp=shares>0
      ? Math.max(0,Number(r.avgCostGbp)||(bookCostGbp/shares)||0)
      : Math.max(0,Number(r.avgCostGbp)||0);
    const marketValueGbp=Math.max(0,Number(r.marketValueGbp)||0);
    const livePriceGbp=shares>0
      ? Math.max(0,Number(r.livePriceGbp)||(marketValueGbp/shares)||0)
      : Math.max(0,Number(r.livePriceGbp)||0);
    const annualIncomeGbp=Math.max(0,Number(r.annualIncomeGbp)||0);
    const annualDpsGbp=shares>0
      ? Math.max(0,Number(r.annualDpsGbp)||(annualIncomeGbp/shares)||0)
      : Math.max(0,Number(r.annualDpsGbp)||0);
    return {
      id:String(r.id||''),
      ticker:String(r.ticker||'').toUpperCase(),
      name:String(r.name||r.ticker||'Holding'),
      account:String(r.account||'ACCOUNT REVIEW'),
      shares,
      bookCostGbp,
      avgCostGbp,
      livePriceGbp,
      marketValueGbp:marketValueGbp||(shares*livePriceGbp),
      profitLossGbp:Number.isFinite(Number(r.profitLossGbp))
        ? Number(r.profitLossGbp)
        : ((marketValueGbp||(shares*livePriceGbp))-bookCostGbp),
      annualDpsGbp,
      annualIncomeGbp:annualIncomeGbp||(shares*annualDpsGbp),
      sector:String(r.sector||''),
      role:String(r.role||''),
      status:allowedStatus.includes(String(r.status||'').toUpperCase())
        ? String(r.status).toUpperCase()
        : (shares>0?'ACTIVE':'ARCHIVED'),
      locked:Boolean(r.locked),
      lockReason:String(r.lockReason||''),
      source:String(r.source||'AURORA2'),
      sourceKey:String(r.sourceKey||''),
      sourceUpdatedAt:r.sourceUpdatedAt||null,
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }

  function normalize(raw){
    const d=defaultState(), r=object(raw), rf=object(r.finance);
    return {
      ...d,...r,
      schemaVersion:VERSION,
      connection:{...d.connection,...object(r.connection)},
      portfolio:{...d.portfolio,...object(r.portfolio)},
      income:{...d.income,...object(r.income)},
      decision:{...d.decision,...object(r.decision)},
      scouting:{
        ...d.scouting,
        ...object(r.scouting),
        targets:Array.isArray(r.scouting?.targets)?r.scouting.targets.map(normalizeScoutingTarget):[]
      },
      transfer:{
        ...d.transfer,
        ...object(r.transfer),
        settings:{
          ...d.transfer.settings,
          ...object(r.transfer?.settings),
          strategy:['sustainable','maximum'].includes(r.transfer?.settings?.strategy)?r.transfer.settings.strategy:'sustainable',
          brokerScope:['both','IG','T212'].includes(r.transfer?.settings?.brokerScope)?r.transfer.settings.brokerScope:'both',
          minAllocation:Math.max(25,Number(r.transfer?.settings?.minAllocation)||250),
          increment:Math.max(1,Number(r.transfer?.settings?.increment)||25)
        },
        route:normalizeTransferRoute(r.transfer?.route),
        registrationDrafts:Array.isArray(r.transfer?.registrationDrafts)?r.transfer.registrationDrafts.map(normalizeRegistrationDraft):[],
        offers:Array.isArray(r.transfer?.offers)?r.transfer.offers:[]
      },
      squad:{
        ...d.squad,
        ...object(r.squad),
        version:1,
        holdings:Array.isArray(r.squad?.holdings)?r.squad.holdings.map(normalizeHolding):[]
      },
      finance:{
        ...d.finance,...rf,
        plan:{...d.finance.plan,...object(rf.plan)},
        pots:Array.isArray(rf.pots)?rf.pots.map(normalizePot):[],
        bills:Array.isArray(rf.bills)?rf.bills.map(normalizeBill):[],
        payments:Array.isArray(rf.payments)?rf.payments.map(normalizePayment):[],
        fundingPolicy:{
          ...d.finance.fundingPolicy,
          ...object(rf.fundingPolicy),
          goalPotBudget:Math.max(0,Number(rf.fundingPolicy?.goalPotBudget)||0),
          strategy:['priority','balanced','critical'].includes(rf.fundingPolicy?.strategy)?rf.fundingPolicy.strategy:'priority'
        },
        houseProject:{
          ...d.finance.houseProject,
          ...object(rf.houseProject),
          version:1,
          target:Math.max(0,Number(rf.houseProject?.target)||0),
          openingHistoricalSpend:Math.max(0,Number(rf.houseProject?.openingHistoricalSpend)||0),
          rooms:Array.isArray(rf.houseProject?.rooms)&&rf.houseProject.rooms.length
            ? [...new Set(rf.houseProject.rooms.map(x=>String(x).trim()).filter(Boolean))]
            : [...d.finance.houseProject.rooms],
          entries:Array.isArray(rf.houseProject?.entries)?rf.houseProject.entries.map(normalizeHouseEntry):[],
          actions:Array.isArray(rf.houseProject?.actions)?rf.houseProject.actions.map(normalizeHouseAction):[]
        }
      },
      alerts:Array.isArray(r.alerts)?r.alerts:[]
    };
  }

  function read(){return normalize(safeParse(localStorage.getItem(KEY)))}
  function write(next){
    const state=normalize({...next,schemaVersion:VERSION,updatedAt:now()});
    localStorage.setItem(KEY,JSON.stringify(state));
    w.dispatchEvent(new CustomEvent('aurora2:state',{detail:state}));
    return state;
  }
  function update(updater){
    const current=read();
    const next=typeof updater==='function'?updater(current):{...current,...object(updater)};
    return write(next);
  }
  function money(v){
    return Number.isFinite(Number(v))
      ? new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v))
      : '—';
  }
  function text(id,value){const el=document.getElementById(id);if(el)el.textContent=value??'—'}
  function escape(s){
    return String(s??'').replace(/[&<>"']/g,m=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[m]));
  }
  function uid(prefix='A2'){
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  }
  function setActiveNav(){
    const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    document.querySelectorAll('.nav a').forEach(a=>{
      const href=(a.getAttribute('href')||'').toLowerCase();
      a.classList.toggle('active',href===path);
    });
  }
  function activateBuiltDepartments(){
    document.querySelectorAll('[data-soon="Transfer"]').forEach(a=>{
      a.setAttribute('href','transfer.html');
      a.removeAttribute('data-soon');
    });
    document.querySelectorAll('[data-soon="Squad"]').forEach(a=>{
      a.setAttribute('href','squad.html');
      a.removeAttribute('data-soon');
    });
  }
  function wireSoon(){
    document.addEventListener('click',e=>{
      const a=e.target.closest('[data-soon]');
      if(!a)return;
      e.preventDefault();
      alert((a.getAttribute('data-soon')||'Department')+' 2.0 is reserved and will be built after the audit.');
    });
  }

  w.Aurora2=w.Aurora2||{};
  w.Aurora2.core={KEY,VERSION,read,write,update,defaultState,normalize,uid};
  w.Aurora2.ui={money,text,escape};
  document.addEventListener('DOMContentLoaded',()=>{activateBuiltDepartments();setActiveNav();wireSoon();});
})(window);
