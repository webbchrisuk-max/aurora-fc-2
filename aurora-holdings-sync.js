(function(w){
  'use strict';

  const ENDPOINT_KEY='aurora2:data2:endpoint';
  const TOKEN_KEY='aurora2:data2:token';
  const SYNC_MS=15*60*1000;

  let running=false;
  let bootAttempts=0;

  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{
    const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  };
  const now=()=>new Date().toISOString();

  function ticker(v){
    return String(v||'')
      .replace(/^LON:/i,'')
      .replace(/\.L$/i,'')
      .replace(/\..*$/,'')
      .toUpperCase()
      .trim();
  }

  function accountCode(v){
    const s=String(v||'').toLowerCase();
    if(s.includes('212'))return 'T212';
    if(/\big\b/.test(s)||s.includes('ig isa'))return 'IG';
    const u=String(v||'').toUpperCase();
    return u==='IG'||u==='T212'?u:'CHECK';
  }

  function holdingKey(h){
    return `${accountCode(h?.account)}|${ticker(h?.ticker)}`;
  }

  function incomeExempt(h){
    if(!h)return false;
    const tk=ticker(h.ticker),acct=accountCode(h.account);
    const reason=String(`${h.lockReason||''} ${h.role||''} ${h.source||''}`).toLowerCase();
    return tk==='TSCO'&&(acct==='CHECK'||/saye|save as you earn|2029|legacy/.test(reason));
  }

  function canonicalHolding(raw,old){
    const shares=Math.max(0,num(raw.shares));
    const book=Math.max(0,num(raw.bookCostGbp));
    const avg=shares>0
      ? (num(raw.avgCostGbp)>0?num(raw.avgCostGbp):book/shares)
      : 0;

    return {
      ...(old||{}),
      id:String(raw.holdingId||raw.id||old?.id||`A2-HOLD-${ticker(raw.ticker)}-${accountCode(raw.account)}`),
      ticker:ticker(raw.ticker),
      name:String(raw.name||old?.name||raw.ticker||'Holding'),
      account:accountCode(raw.account),
      shares,
      bookCostGbp:book,
      avgCostGbp:avg,
      livePriceGbp:Math.max(0,num(raw.livePriceGbp)),
      marketValueGbp:Math.max(0,num(raw.marketValueGbp)),
      profitLossGbp:Number(raw.profitLossGbp)||0,
      annualDpsGbp:Math.max(0,num(raw.annualDpsGbp)),
      annualIncomeGbp:Math.max(0,num(raw.annualIncomeGbp)),
      sector:String(raw.sector||old?.sector||''),
      role:String(raw.role||old?.role||''),
      status:String(raw.status||'ACTIVE').toUpperCase(),
      locked:Boolean(raw.locked),
      lockReason:String(raw.lockReason||old?.lockReason||''),
      source:String(raw.source||'AURORADATA2'),
      sourceKey:String(old?.sourceKey||holdingKey(raw)),
      sourceUpdatedAt:raw.sourceUpdatedAt||raw.updatedAt||old?.sourceUpdatedAt||null,
      createdAt:old?.createdAt||now(),
      updatedAt:raw.updatedAt||raw.sourceUpdatedAt||now()
    };
  }

  function portfolioFrom(holdings,state){
    const active=arr(holdings).filter(h=>
      ['ACTIVE','LOCKED'].includes(String(h.status||'').toUpperCase()) &&
      num(h.shares)>0
    );

    let teamValue=0,annualIncome=0;
    const byTicker=new Map();

    active.forEach(h=>{
      const value=num(h.marketValueGbp)>0
        ? num(h.marketValueGbp)
        : num(h.shares)*num(h.livePriceGbp);
      const income=incomeExempt(h)
        ? 0
        : (num(h.annualDpsGbp)>0
            ? num(h.shares)*num(h.annualDpsGbp)
            : Math.max(0,num(h.annualIncomeGbp)));

      teamValue+=value;
      annualIncome+=income;

      if(!incomeExempt(h)){
        const tk=ticker(h.ticker);
        const x=byTicker.get(tk)||{ticker:tk,annualIncome:0};
        x.annualIncome+=income;
        byTicker.set(tk,x);
      }
    });

    const best=[...byTicker.values()]
      .sort((a,b)=>b.annualIncome-a.annualIncome)[0]||null;

    return {
      teamValue:Number(teamValue.toFixed(2)),
      annualIncome:Number(annualIncome.toFixed(2)),
      monthlyIncome:Number((annualIncome/12).toFixed(2)),
      squadSize:new Set(active.map(h=>ticker(h.ticker)).filter(Boolean)).size,
      bestDividendPlayer:best
        ? {ticker:best.ticker,annualIncome:Number(best.annualIncome.toFixed(2))}
        : null,
      topAuroraPlayer:state?.portfolio?.topAuroraPlayer||null
    };
  }

  async function post(action,payload={}){
    if(w.AuroraData2Client?.post){
      return w.AuroraData2Client.post(action,payload);
    }

    const endpoint=String(localStorage.getItem(ENDPOINT_KEY)||'').trim();
    const token=String(localStorage.getItem(TOKEN_KEY)||'').trim();
    if(!endpoint||!token)throw new Error('AuroraData 2 connection is not configured in this browser.');

    const response=await fetch(endpoint,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action,token,...payload}),
      redirect:'follow',
      cache:'no-store'
    });

    const text=await response.text();
    let data;
    try{data=JSON.parse(text)}
    catch(_){throw new Error('AuroraData 2 returned a non-JSON response.')}

    if(!response.ok||data?.ok===false){
      throw new Error(data?.message||data?.error||`Backend HTTP ${response.status}`);
    }
    return data;
  }

  function signatures(holdings,portfolio){
    const rows=arr(holdings).map(h=>[
      h.id,h.account,h.ticker,h.name,
      num(h.shares),num(h.bookCostGbp),num(h.avgCostGbp),
      num(h.livePriceGbp),num(h.marketValueGbp),Number(h.profitLossGbp)||0,
      num(h.annualDpsGbp),num(h.annualIncomeGbp),
      h.sector,h.role,h.status,Boolean(h.locked),h.lockReason,
      h.source,h.sourceUpdatedAt,h.updatedAt
    ]);
    return JSON.stringify([rows,portfolio]);
  }

  function applySnapshot(snapshot){
    const A=w.Aurora2;
    if(!A?.core?.read||!A?.core?.update)return false;

    const incoming=arr(snapshot?.holdings);
    if(!incoming.length)return false;

    const state=A.core.read();
    const existing=arr(state.squad?.holdings);
    const existingMap=new Map(existing.map(h=>[holdingKey(h),h]));

    // AuroraData 2 owns every ACTIVE/LOCKED holding.
    const canonicalActive=incoming
      .filter(h=>num(h.shares)>0)
      .map(raw=>canonicalHolding(raw,existingMap.get(holdingKey(raw))));

    // Keep local historical SOLD/ARCHIVED records only; active truth comes from backend.
    const inactiveHistory=existing.filter(h=>
      ['SOLD','ARCHIVED'].includes(String(h.status||'').toUpperCase())
    );

    const holdings=[...canonicalActive,...inactiveHistory];
    const portfolio=portfolioFrom(holdings,state);
    const stamp=snapshot.at||now();

    const oldSignature=signatures(existing,{
      teamValue:num(state.portfolio?.teamValue),
      annualIncome:num(state.portfolio?.annualIncome),
      monthlyIncome:num(state.portfolio?.monthlyIncome),
      squadSize:num(state.portfolio?.squadSize),
      bestDividendPlayer:state.portfolio?.bestDividendPlayer||null,
      topAuroraPlayer:state.portfolio?.topAuroraPlayer||null
    });
    const newSignature=signatures(holdings,portfolio);

    const syncMeta={
      status:'CONNECTED',
      source:'AURORADATA2_HOLDINGS',
      spreadsheetId:'1kEyuEuHxSt69o8Wy198n9gLBXbx-sGCrxwcHJo9r6Ig',
      lastSyncAt:stamp,
      engineLastRun:snapshot.engine?.lastRunAt||snapshot.engine?.at||null,
      activePositions:canonicalActive.length,
      updatedAt:stamp
    };

    if(oldSignature===newSignature){
      const currentStamp=state.squad?.canonicalSync?.lastSyncAt;
      if(currentStamp!==stamp){
        A.core.update(s=>({
          ...s,
          connection:{
            ...s.connection,
            mode:'AuroraData2',
            status:'CONNECTED',
            spreadsheetId:'1kEyuEuHxSt69o8Wy198n9gLBXbx-sGCrxwcHJo9r6Ig'
          },
          squad:{
            ...s.squad,
            canonicalSync:syncMeta
          }
        }));
      }
      return false;
    }

    A.core.update(s=>({
      ...s,
      connection:{
        ...s.connection,
        mode:'AuroraData2',
        status:'CONNECTED',
        spreadsheetId:'1kEyuEuHxSt69o8Wy198n9gLBXbx-sGCrxwcHJo9r6Ig'
      },
      squad:{
        ...s.squad,
        holdings,
        source:'AURORADATA2_CANONICAL',
        canonicalSync:syncMeta,
        updatedAt:stamp
      },
      portfolio:{
        ...s.portfolio,
        ...portfolio
      }
    }));

    return true;
  }

  async function sync(){
    if(running)return null;

    const A=w.Aurora2;
    if(!A?.core?.read){
      if(bootAttempts<12){
        bootAttempts++;
        setTimeout(sync,500);
      }
      return null;
    }
    bootAttempts=0;

    const endpoint=String(localStorage.getItem(ENDPOINT_KEY)||'').trim();
    const token=String(localStorage.getItem(TOKEN_KEY)||'').trim();

    if(!endpoint||!token){
      console.warn('Aurora canonical holdings sync: AuroraData 2 is not configured in this browser.');
      return null;
    }

    running=true;
    try{
      const snapshot=await post('marketPriceSnapshot',{});
      applySnapshot(snapshot);
      return snapshot;
    }catch(err){
      console.warn('Aurora canonical holdings sync failed:',err);
      return null;
    }finally{
      running=false;
    }
  }

  function start(){
    setTimeout(sync,700);

    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible')setTimeout(sync,150);
    });

    setInterval(()=>{
      if(document.visibilityState==='visible')sync();
    },SYNC_MS);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }

  w.AuroraHoldingsSync={sync,applySnapshot};
})(window);
