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

