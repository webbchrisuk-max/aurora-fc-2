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

  function brokerPreference(state,target){
    const tk=ticker(target?.ticker||target);
    const securityId=String(target?.securityId||'');
    const raw=(securityId&&state?.transfer?.brokerPreferences?.[securityId])??state?.transfer?.brokerPreferences?.[tk];
    const value=raw&&typeof raw==='object'?raw.account:raw;
    const code=accountCode(value);
    return code==='IG'||code==='T212'?code:'CHECK';
  }
  function effectiveBroker(state,target){
    const remembered=brokerPreference(state,target);
    if(remembered!=='CHECK')return remembered;
    const preferred=accountCode(target?.preferredAccount);
    if(preferred!=='CHECK')return preferred;

    // Global Scouting may provide broker eligibility without choosing a
    // preferred broker. Resolve a single valid route; an ambiguous candidate
    // remains unassigned and is excluded without poisoning the whole basket.
    const eligibility=target?.brokerEligibility;
    const values=Array.isArray(eligibility)
      ?eligibility
      :eligibility&&typeof eligibility==='object'
        ?Object.entries(eligibility).filter(([,allowed])=>allowed===true).map(([broker])=>broker)
        :typeof eligibility==='string'?eligibility.split(/[,|/]/):[];
    const eligible=[...new Set(values.map(accountCode).filter(code=>code==='IG'||code==='T212'))];
    return eligible.length===1?eligible[0]:'CHECK';
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
  function brokerEligible(t,scope,state){
    const broker=effectiveBroker(state,t);
    if(broker==='CHECK')return false;
    return scope==='both'||broker===scope;
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

  function routeGuardMessage(state){
    const mission=state?.mission;
    const financeReady=!!mission&&num(mission.approvedBudget)>0&&
      !['CANCELLED','COMPLETE','COMPLETED','ARCHIVED'].includes(String(mission.status||'').toUpperCase());
    const scoutingReady=String(state?.scouting?.status||'').toUpperCase()==='SCOUTING_READY'&&
      arr(state?.scouting?.targets).some(t=>t.approvedForTransfer===true);
    if(financeReady&&scoutingReady)return 'Finance mission and Scouting-approved shortlist loaded. Build the route when ready.';
    if(financeReady)return 'Waiting for a Scouting-approved shortlist.';
    if(scoutingReady)return 'Waiting for a Finance mission.';
    return 'Waiting for a Finance mission and a Scouting-approved shortlist.';
  }

  /*
   * Dynamic candidate count:
   * - affordability comes from the user's meaningful-allocation floor
   * - a soft cap scales with budget rather than fixed £ thresholds
   * - the 4th/5th/etc candidate only joins when its opportunity score is
   *   close enough to the best available candidate
   */
  function desiredTargetCount(budget,candidates,maxTargets,requestedMin,inc){
    const available=arr(candidates).length;
    if(!(budget>0)||available<=0)return 0;

    const hardMax=Math.max(1,Math.floor(num(maxTargets)||8));
    const requestedFloor=Math.max(inc,num(requestedMin)||250);
    const affordable=Math.max(1,Math.min(
      available,
      hardMax,
      Math.max(1,Math.floor((budget+.001)/requestedFloor))
    ));

    if(affordable<=1)return affordable;

    const scale=Math.max(1,budget/requestedFloor);
    const softCap=Math.max(1,Math.min(
      affordable,
      Math.round(Math.sqrt(scale)*2)
    ));

    let minimum=1;
    if(budget>=requestedFloor*2)minimum=2;
    if(budget>=requestedFloor*3)minimum=3;
    minimum=Math.min(minimum,softCap);

    const top=Math.max(.0001,num(candidates[0]?._routeScore));
    let count=minimum;

    for(let i=minimum;i<softCap;i++){
      const ratio=Math.max(0,num(candidates[i]?._routeScore))/top;
      const threshold=i===3?.80:i===4?.74:.70;
      if(ratio+1e-9>=threshold)count++;
      else break;
    }

    return Math.max(1,Math.min(available,hardMax,count));
  }

  function effectiveMinimum(budget,count,inc,requested){
    if(!(budget>0)||count<=0)return inc;
    const requestedFloor=Math.max(inc,num(requested)||250);

    // Respect the user's meaningful minimum whenever the chosen basket can afford it.
    if(budget+1e-9>=requestedFloor*count)return requestedFloor;

    // Only scale down when the selected basket literally cannot afford the requested floor.
    const scaled=roundDown(Math.max(inc,(budget/count)*.75),inc)||inc;
    return Math.max(inc,Math.min(requestedFloor,scaled));
  }

  function returnPriority(t,strategy){
    const y=Math.max(0,num(t.yieldPct));
    const scout=clamp(targetScore(t,strategy),0,100)/100;
    if(!(y>0)||!(scout>0))return 0;
    const qualityMultiplier=strategy==='maximum'
      ?(.80+.20*scout)
      :(.55+.45*scout);
    return y*qualityMultiplier;
  }

  function positionCap(budget,count,strategy,status,inc){
    if(count<=1)return budget;
    let pct;
    if(count===2)pct=.65;
    else if(strategy==='maximum')pct=budget<1000?.50:budget<2500?.42:.38;
    else pct=budget<1000?.45:budget<2500?.36:.32;
    if(String(status||'').toLowerCase()==='caution')pct=Math.min(pct,count===2?.60:.35);
    return Math.max(inc,roundDown(budget*pct,inc));
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
    const inc=Math.max(1,num(settings.increment)||25);
    const exclude=ticker(opts.excludeTicker);
    const allowedIds=opts.targetIds?new Set(arr(opts.targetIds).map(String)):null;
    const rotation=opts.rotationContext||null;
    const baseRows=rotation?postSaleBase(state,rotation):null;

    let candidates=arr(state?.scouting?.targets)
      .filter(t=>String(t.status||'').toLowerCase()!=='block')
      .filter(t=>t.transferPermitted!==false)
      .filter(t=>!['INELIGIBLE','BLOCKED','NOT_ELIGIBLE'].includes(String(t.eligibilityStatus||'').toUpperCase()))
      .filter(t=>t.approvedForTransfer===true&&
        String(t.approvalBatchId||'')===String(state?.scouting?.approvedBatchId||''))
      .filter(t=>num(t.yieldPct)>0)
      .filter(t=>!exclude||ticker(t.ticker)!==exclude)
      .filter(t=>brokerEligible(t,brokerScope,state))
      .filter(t=>!allowedIds||allowedIds.has(String(t.securityId||t.id||ticker(t.ticker))));

    candidates=candidates.map(t=>{
      const scoutScore=Math.max(1,targetScore(t,strategy));
      const fitFactor=baseRows?concentrationFactor(baseRows,t,0):1;
      const incomeScore=Math.max(.0001,returnPriority(t,strategy));
      return {
        ...t,
        _routeScore:incomeScore*fitFactor,
        _incomeScore:incomeScore,
        _scoutScore:scoutScore,
        _fitFactor:fitFactor,
        _effectiveBroker:effectiveBroker(state,t)
      };
    }).sort((a,b)=>
      b._routeScore-a._routeScore||
      b._incomeScore-a._incomeScore||
      b._scoutScore-a._scoutScore||
      num(a.rank)-num(b.rank)
    );

    if(!(budget>0)||!candidates.length){
      const emptyMin=Math.max(inc,num(settings.minAllocation)||250);
      return {
        financeBudget:budget,strategy,brokerScope,minAllocation:emptyMin,increment:inc,
        requestedMinAllocation:Math.max(inc,num(settings.minAllocation)||250),
        allocationMode:'DYNAMIC_OPPORTUNITY_WEIGHTED',
        targetCount:0,
        allocations:[],allocated:0,income:0,remaining:budget,status:'SIMULATION',
        rotation:!!rotation,reason:budget>0?'NO_ELIGIBLE_TARGETS':'NO_BUDGET'
      };
    }

    const count=desiredTargetCount(
      budget,candidates,settings.maxTargets,settings.minAllocation,inc
    );
    candidates=candidates.slice(0,count);

    const min=effectiveMinimum(budget,count,inc,settings.minAllocation);
    const requestedMin=Math.max(inc,num(settings.minAllocation)||min);
    const scores=candidates.map(t=>Math.max(.0001,t._routeScore));
    const idFactory=typeof opts.idFactory==='function'
      ?opts.idFactory
      :(p=>`${p}-${Math.random().toString(36).slice(2,9)}`);

    const allocations=candidates.map((t,i)=>({
      id:idFactory('ALLOC'),
      targetId:t.id,
      securityId:t.securityId||'',
      exchange:t.exchange||'',
      ticker:ticker(t.ticker),
      name:t.name||ticker(t.ticker),
      account:t._effectiveBroker,
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

    allocations.forEach(a=>{
      const seed=Math.min(min,remaining);
      a.amount=seed;
      remaining-=seed;
    });

    let guard=0;
    while(remaining>=inc-.001&&guard<10000){
      guard++;
      const ranked=allocations.map((a,i)=>{
        const cap=positionCap(budget,count,strategy,a.scoutingStatus,inc);
        if(a.amount+inc>cap+.001)return {i,priority:-Infinity,cap};

        let concentration=1;
        if(baseRows){
          const simulated=baseRows.concat(
            allocations
              .filter(x=>num(x.amount)>0)
              .map(x=>({ticker:x.ticker,sector:x.sector,value:num(x.amount)}))
          );
          concentration=concentrationFactor(simulated,a,inc);
        }
        const average=Math.max(inc,budget/Math.max(1,count));
        const diminishing=1+(a.amount/average)*.65;
        return {i,priority:(scores[i]*concentration)/diminishing,cap};
      }).sort((a,b)=>b.priority-a.priority);

      if(!ranked.length||!Number.isFinite(ranked[0].priority)||ranked[0].priority<0)break;
      allocations[ranked[0].i].amount+=inc;
      remaining-=inc;
    }

    if(remaining>.005){
      const ranked=allocations.map((a,i)=>({
        i,
        score:scores[i],
        cap:positionCap(budget,count,strategy,a.scoutingStatus,inc)
      })).filter(x=>allocations[x.i].amount+remaining<=x.cap+.005)
        .sort((a,b)=>b.score-a.score);

      if(ranked.length){
        allocations[ranked[0].i].amount+=remaining;
        remaining=0;
      }
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
      requestedMinAllocation:requestedMin,
      increment:inc,
      allocationMode:'DYNAMIC_OPPORTUNITY_WEIGHTED',
      targetCount:count,
      allocations,
      status:'SIMULATION',
      locked:false,
      rotation:!!rotation
    };
    Object.assign(route,routeSummary(route));
    return route;
  }

  /*
   * This is the single route-building operation used by the Transfer UI. It
   * deliberately reads the budget from the canonical Finance mission rather
   * than accepting a second, caller-owned transfer budget.
   */
  function buildMissionPlan(state,opts={}){
    const mission=state?.mission;
    const contract=opts.missionContract||w.AuroraTransferMission;
    const approvedBudget=Math.max(0,num(mission?.approvedBudget));
    if(!mission||!approvedBudget)return {ok:false,reason:'NO_FINANCE_MISSION'};
    if(String(mission.status||'').toUpperCase()!=='DRAFT'&&String(mission.status||'').toUpperCase()!=='READY')return {ok:false,reason:'MISSION_NOT_PLANNABLE'};
    if(String(state?.scouting?.status||'').toUpperCase()!=='SCOUTING_READY')return {ok:false,reason:'SCOUTING_NOT_READY'};
    if(!contract?.plan)return {ok:false,reason:'MISSION_CONTRACT_UNAVAILABLE'};

    const stamp=opts.now||new Date().toISOString();
    const settings={brokerScope:'both',minAllocation:250,increment:25,...(state?.transfer?.settings||{})};
    const strategy=String(state?.scouting?.strategy||'').toLowerCase()==='maximum'?'maximum':'sustainable';
    const idFactory=typeof opts.idFactory==='function'?opts.idFactory:(p=>`${p}-${Math.random().toString(36).slice(2,9)}`);
    const simulation=simulate(state,{
      budget:approvedBudget,
      strategy,
      brokerScope:settings.brokerScope,
      minAllocation:settings.minAllocation,
      increment:settings.increment,
      maxTargets:8,
      idFactory
    });
    if(!simulation.allocations.length)return {ok:false,reason:simulation.reason||'NO_ELIGIBLE_TARGETS',simulation};

    const previous=state?.transfer?.route;
    const decorate=typeof opts.decorateAllocation==='function'?opts.decorateAllocation:a=>a;
    const route={
      ...simulation,
      allocations:simulation.allocations.map(decorate),
      id:previous?.missionId===mission.id?previous.id:idFactory('ROUTE'),
      missionId:mission.id,
      scoutingStrategy:strategy,
      scoutingStatusAtBuild:state.scouting.status,
      status:'DRAFT',
      locked:false,
      createdAt:previous?.missionId===mission.id?previous.createdAt:stamp,
      updatedAt:stamp
    };
    const planned=contract.plan(mission,route,stamp);
    return {ok:true,mission:planned.mission,route:planned.route};
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
      if(!(total>0)){
        return {total:0,largestTicker:'—',largestTickerPct:0,largestSector:'—',largestSectorPct:0};
      }
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
    buildMissionPlan,
    routeSummary,
    targetScore,
    concentrationSnapshot,
    desiredTargetCount,
    effectiveMinimum,
    brokerPreference,
    effectiveBroker,
    ticker,
    accountCode,
    routeGuardMessage
  };
})(window);
