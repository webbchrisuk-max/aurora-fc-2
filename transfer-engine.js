(function(w){
  'use strict';

  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,num(v)));

  function ticker(v){
    return String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();
  }
  function accountCode(v){
    const s=String(v||'').toLowerCase();
    if(s.includes('212'))return 'T212';
    if(/\big\b/.test(s)||s.includes('ig isa'))return 'IG';
    const u=String(v||'').toUpperCase();
    return u==='IG'||u==='T212'?u:'CHECK';
  }
  function targetScore(t,strategy){
    let base;
    if(strategy==='maximum'){
      base=num(t.maximumScore)>0?num(t.maximumScore):Math.min(100,Math.max(0,num(t.yieldPct))*10);
    }else{
      base=num(t.sustainableScore)>0?num(t.sustainableScore):Math.max(1,num(t.confidence)||(100-Math.max(1,num(t.rank))*5));
    }
    if(String(t.status||'').toLowerCase()==='caution')base*=.82;
    if(String(t.status||'').toLowerCase()==='block')return 0;
    return Math.max(0,base);
  }
  function brokerEligible(t,scope){
    if(scope==='both')return true;
    return accountCode(t.preferredAccount)===scope;
  }
  function roundDown(v,inc){
    return Math.floor((Math.max(0,v)+1e-9)/inc)*inc;
  }
  function activeHoldings(state){
    return arr(state?.squad?.holdings).filter(h=>
      ['ACTIVE','LOCKED'].includes(String(h.status||'').toUpperCase())&&num(h.shares)>0
    );
  }
  function holdingValue(h){
    const shares=Math.max(0,num(h.shares));
    const px=Math.max(0,num(h.livePriceGbp));
    return shares>0&&px>0?shares*px:Math.max(0,num(h.marketValueGbp));
  }

  function postSaleBase(state,rotation){
    const saleFraction=clamp(rotation?.saleFraction||0,0,1);
    const sourceId=String(rotation?.holdingId||'');
    const sourceTicker=ticker(rotation?.ticker);
    const sourceAccount=accountCode(rotation?.account);
    return activeHoldings(state).map(h=>{
      const id=String(h.id||'');
      const matches=sourceId
        ? id===sourceId
        : ticker(h.ticker)===sourceTicker&&accountCode(h.account)===sourceAccount;
      const value=holdingValue(h)*(matches?(1-saleFraction):1);
      return {
        ticker:ticker(h.ticker),
        sector:String(h.sector||'').trim(),
        value:Math.max(0,value)
      };
    }).filter(x=>x.value>0);
  }

  function concentrationFactor(baseRows,candidate,extraAmount=0){
    const total=baseRows.reduce((s,x)=>s+x.value,0)+Math.max(0,extraAmount);
    if(!(total>0))return 1;
    const tk=ticker(candidate.ticker);
    const sector=String(candidate.sector||'').trim().toLowerCase();
    const tickerValue=baseRows.filter(x=>x.ticker===tk).reduce((s,x)=>s+x.value,0)+Math.max(0,extraAmount);
    const sectorValue=sector
      ?baseRows.filter(x=>String(x.sector||'').trim().toLowerCase()===sector).reduce((s,x)=>s+x.value,0)+Math.max(0,extraAmount)
      :0;
    const tw=tickerValue/total*100;
    const sw=sector?sectorValue/total*100:0;

    // Deployment shaping only. Scouting still owns the investment score itself.
    let factor=1;
    if(tw>8)factor*=1/(1+(tw-8)/9);
    if(sector&&sw>25)factor*=1/(1+(sw-25)/18);
    return clamp(factor,.35,1.08);
  }

  function routeSummary(route){
    const allocations=arr(route?.allocations);
    const allocated=allocations.reduce((s,a)=>s+num(a.amount),0);
    const income=allocations.reduce((s,a)=>s+num(a.expectedAnnualIncome),0);
    const budget=Math.max(0,num(route?.financeBudget));
    return {allocated,income,remaining:Math.max(0,budget-allocated)};
  }

  function simulate(state,opts={}){
    const settings={
      strategy:'sustainable',
      brokerScope:'both',
      minAllocation:250,
      increment:25,
      maxTargets:8,
      ...(state?.transfer?.settings||{}),
      ...opts
    };
    const budget=Math.max(0,num(opts.budget));
    const strategy=settings.strategy==='maximum'?'maximum':'sustainable';
    const brokerScope=settings.brokerScope||'both';
    const min=Math.max(25,num(settings.minAllocation)||250);
    const inc=Math.max(1,num(settings.increment)||25);
    const exclude=ticker(opts.excludeTicker);
    const allowedIds=opts.targetIds?new Set(arr(opts.targetIds).map(String)):null;
    const rotation=opts.rotationContext||null;
    const baseRows=rotation?postSaleBase(state,rotation):null;

    let candidates=arr(state?.scouting?.targets)
      .filter(t=>String(t.status||'').toLowerCase()!=='block')
      .filter(t=>num(t.yieldPct)>0)
      .filter(t=>!exclude||ticker(t.ticker)!==exclude)
      .filter(t=>brokerEligible(t,brokerScope))
      .filter(t=>!allowedIds||allowedIds.has(String(t.id||ticker(t.ticker))));

    candidates=candidates.map(t=>{
      const scoutScore=Math.max(1,targetScore(t,strategy));
      const fitFactor=baseRows?concentrationFactor(baseRows,t,0):1;
      return {...t,_routeScore:scoutScore*fitFactor,_scoutScore:scoutScore,_fitFactor:fitFactor};
    }).sort((a,b)=>
      b._routeScore-a._routeScore||
      b._scoutScore-a._scoutScore||
      num(a.rank)-num(b.rank)
    );

    if(!(budget>0)||!candidates.length){
      return {
        financeBudget:budget,strategy,brokerScope,minAllocation:min,increment:inc,
        allocations:[],allocated:0,income:0,remaining:budget,status:'SIMULATION',
        rotation:!!rotation,reason:budget>0?'NO_ELIGIBLE_TARGETS':'NO_BUDGET'
      };
    }

    let count=Math.min(
      Math.max(1,Math.floor(num(settings.maxTargets)||8)),
      candidates.length,
      Math.max(1,Math.floor(budget/min))
    );
    if(budget<min)count=1;
    candidates=candidates.slice(0,count);

    const scores=candidates.map(t=>Math.max(1,t._routeScore));
    const idFactory=typeof opts.idFactory==='function'?opts.idFactory:(p=>`${p}-${Math.random().toString(36).slice(2,9)}`);
    const allocations=candidates.map((t,i)=>({
      id:idFactory('ALLOC'),
      targetId:t.id,
      ticker:ticker(t.ticker),
      name:t.name||ticker(t.ticker),
      account:accountCode(t.preferredAccount),
      sector:String(t.sector||'').trim(),
      amount:0,
      yieldPct:Math.max(0,num(t.yieldPct)),
      expectedAnnualIncome:0,
      score:scores[i],
      scoutingScore:t._scoutScore,
      concentrationFactor:t._fitFactor,
      reason:t.reason||'Scouting-approved target',
      scoutingStatus:String(t.status||'caution').toLowerCase(),
      status:'SIMULATED'
    }));

    let remaining=budget;

    if(budget>=min*count){
      allocations.forEach(a=>{
        const seed=roundDown(min,inc);
        a.amount=seed;
        remaining-=seed;
      });
    }

    const weightSum=scores.reduce((s,x)=>s+x,0)||1;
    const extraRaw=allocations.map((a,i)=>remaining*(scores[i]/weightSum));
    allocations.forEach((a,i)=>{
      const add=roundDown(extraRaw[i],inc);
      a.amount+=add;
      remaining-=add;
    });

    let guard=0;
    while(remaining>=inc-.001&&guard<5000){
      guard++;
      const ranked=allocations.map((a,i)=>{
        let concentration=1;
        if(baseRows){
          const simulated=baseRows.concat(
            allocations
              .filter(x=>num(x.amount)>0)
              .map(x=>({ticker:x.ticker,sector:x.sector,value:num(x.amount)}))
          );
          concentration=concentrationFactor(simulated,a,inc);
        }
        return {i,priority:(scores[i]*concentration)/Math.max(inc,a.amount)};
      }).sort((a,b)=>b.priority-a.priority);
      allocations[ranked[0].i].amount+=inc;
      remaining-=inc;
    }

    if(budget<min){
      allocations[0].amount=roundDown(budget,inc)||budget;
      remaining=Math.max(0,budget-allocations[0].amount);
    }

    allocations.forEach(a=>{
      a.amount=Number(Math.max(0,a.amount).toFixed(2));
      a.expectedAnnualIncome=Number((a.amount*(a.yieldPct/100)).toFixed(6));
    });

    const route={
      financeBudget:budget,
      strategy,
      brokerScope,
      minAllocation:min,
      increment:inc,
      allocations,
      status:'SIMULATION',
      locked:false,
      rotation:!!rotation
    };
    Object.assign(route,routeSummary(route));
    return route;
  }

  function concentrationSnapshot(state,rotation,allocations=[]){
    const beforeRows=activeHoldings(state).map(h=>({
      ticker:ticker(h.ticker),
      sector:String(h.sector||'').trim(),
      value:holdingValue(h)
    })).filter(x=>x.value>0);
    const afterRows=(rotation?postSaleBase(state,rotation):beforeRows.map(x=>({...x}))).concat(
      arr(allocations).filter(a=>num(a.amount)>0).map(a=>({
        ticker:ticker(a.ticker),
        sector:String(a.sector||'').trim(),
        value:num(a.amount)
      }))
    );

    function summarise(rows){
      const total=rows.reduce((s,x)=>s+x.value,0);
      if(!(total>0))return {total:0,largestTicker:'—',largestTickerPct:0,largestSector:'—',largestSectorPct:0};

      const tickers=new Map(),sectors=new Map();
      rows.forEach(x=>{
        tickers.set(x.ticker,(tickers.get(x.ticker)||0)+x.value);
        const sec=String(x.sector||'').trim();
        if(sec)sectors.set(sec,(sectors.get(sec)||0)+x.value);
      });
      const topTicker=[...tickers.entries()].sort((a,b)=>b[1]-a[1])[0]||['—',0];
      const topSector=[...sectors.entries()].sort((a,b)=>b[1]-a[1])[0]||['—',0];
      return {
        total,
        largestTicker:topTicker[0],
        largestTickerPct:topTicker[1]/total*100,
        largestSector:topSector[0],
        largestSectorPct:topSector[1]/total*100
      };
    }

    return {before:summarise(beforeRows),after:summarise(afterRows)};
  }

  w.Aurora2=w.Aurora2||{};
  w.Aurora2.transferEngine={
    ...(w.Aurora2.transferEngine||{}),
    simulate,
    routeSummary,
    targetScore,
    concentrationSnapshot,
    ticker,
    accountCode
  };
})(window);
