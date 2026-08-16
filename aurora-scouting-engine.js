(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.Aurora2=root.Aurora2||{};root.Aurora2.globalScouting=api}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const SUPPORTED_MARKETS=Object.freeze({
    UK:{exchanges:['LSE'],universes:['FTSE 100','FTSE 250','UK INCOME']},
    US:{exchanges:['NYSE','NASDAQ','AMEX'],universes:['S&P 500','NASDAQ','US INCOME']},
    EUROPE:{exchanges:[],universes:[]},CANADA:{exchanges:[],universes:[]},
    AUSTRALIA:{exchanges:[],universes:[]}
  });
  const REQUIRED_DEEP=['price','dividendYield','dividendSafety','brokerEligibility'];
  const STALE={price:36*60*60*1000,fundamentals:120*24*60*60*1000,dividends:45*24*60*60*1000};
  const DATA_FIELDS=Object.freeze([
    'price','currency','marketCap','dividendYield','forwardDividend','dividendFrequency',
    'dividendGrowth','dividendHistory','dividendCoverage','payoutRatio','earnings','freeCashFlow',
    'debt','balanceSheet','sector','country','exDividendDate','paymentDate','timestamps'
  ]);
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  const code=v=>String(v||'').trim().toUpperCase();
  const identity=(exchange,ticker)=>`${code(exchange)||'UNKNOWN'}:${code(ticker)}`;

  function normalizeSecurity(raw={}){
    const exchange=code(raw.exchange),ticker=code(raw.ticker);
    if(!ticker)throw new Error('Security ticker is required');
    const memberships=[...(raw.memberships||raw.universes||[])].map(String);
    return {
      securityId:String(raw.securityId||identity(exchange,ticker)),ticker,exchange,
      name:String(raw.name||raw.company||ticker),country:String(raw.country||''),
      currency:code(raw.currency),assetType:String(raw.assetType||'equity'),
      memberships:[...new Set(memberships)],sector:String(raw.sector||''),industry:String(raw.industry||''),
      brokerEligibility:raw.brokerEligibility??null,market:String(raw.market||''),
      membershipUpdatedAt:raw.membershipUpdatedAt||null
    };
  }
  function createRegistry(rows=[]){
    const map=new Map();
    rows.forEach(raw=>{
      const item=normalizeSecurity(raw),key=item.securityId;
      const prior=map.get(key);
      map.set(key,prior?{...prior,...item,memberships:[...new Set([...prior.memberships,...item.memberships])]}:item);
    });
    return [...map.values()];
  }
  function portfolioExposure(security,holdings=[]){
    const active=holdings.filter(h=>!['SOLD','ARCHIVED'].includes(code(h.status)));
    const value=h=>Math.max(0,Number(h.marketValueGbp)||Number(h.shares)*Number(h.livePriceGbp)||0);
    const total=active.reduce((s,h)=>s+value(h),0),same=h=>identity(h.exchange, h.ticker)===security.securityId;
    const currentValue=active.filter(same).reduce((s,h)=>s+value(h),0);
    const sectorValue=security.sector?active.filter(h=>code(h.sector)===code(security.sector)).reduce((s,h)=>s+value(h),0):0;
    const countryValue=security.country?active.filter(h=>code(h.country)===code(security.country)).reduce((s,h)=>s+value(h),0):0;
    return {existingHolding:currentValue>0,currentValueGbp:currentValue,portfolioPct:total?currentValue/total*100:0,
      sectorPct:total?sectorValue/total*100:0,countryPct:total?countryValue/total*100:0};
  }
  function freshness(data={},at=Date.now()){
    const staleFields=[],missingFields=[];
    for(const key of ['price','fundamentals','dividends']){
      const stamp=Date.parse(data.timestamps?.[key]||'');
      if(!Number.isFinite(stamp))missingFields.push(key);
      else if(at-stamp>STALE[key])staleFields.push(key);
    }
    return {staleFields,missingFields,confidencePenalty:staleFields.length*18+missingFields.length*12,
      executionSafe:!staleFields.includes('price')&&!missingFields.includes('price')};
  }
  function convertToGbp(amount,currency,fxRates={}){
    const native=num(amount),ccy=code(currency);
    if(native==null||!ccy)return {nativeAmount:native,nativeCurrency:ccy,fxRate:null,gbpAmount:null};
    if(ccy==='GBP')return {nativeAmount:native,nativeCurrency:ccy,fxRate:1,gbpAmount:native};
    const rate=num(fxRates[`${ccy}/GBP`]??fxRates[ccy]);
    return {nativeAmount:native,nativeCurrency:ccy,fxRate:rate,gbpAmount:rate==null?null:native*rate};
  }
  function score(data,exposure,strategy='sustainable'){
    const y=clamp((num(data.dividendYield)||0)*10),safety=clamp(data.dividendSafety),quality=clamp(data.businessQuality),
      coverage=clamp(data.dividendCoverage),growth=clamp(data.dividendGrowth),fit=clamp(92-exposure.portfolioPct*3-exposure.sectorPct*.7,20,95),
      confidence=clamp(data.confidence??80);
    const sustainable=.16*y+.25*safety+.16*quality+.16*coverage+.12*growth+.15*fit;
    const maximum=.55*y+.18*safety+.07*quality+.07*coverage+.03*growth+.10*fit;
    const penalty=(100-confidence)*.18;
    return Math.round(clamp((strategy==='maximum'?maximum:sustainable)-penalty));
  }
  function fastScout(registry,dataById={},holdings=[],options={}){
    return registry.map(security=>{
      const data=dataById[security.securityId]||{},exposure=portfolioExposure(security,holdings),fresh=freshness(data,options.at);
      const reasons=[];
      if(security.brokerEligibility===false)reasons.push('BROKER_INELIGIBLE');
      if(!(num(data.dividendYield)>0))reasons.push('DIVIDEND_YIELD_MISSING');
      if(data.dividendStatus&&/suspend|cancel|omit/i.test(data.dividendStatus))reasons.push('DIVIDEND_UNAVAILABLE');
      if(!fresh.executionSafe)reasons.push('PRICE_NOT_EXECUTION_SAFE');
      return {security,data,exposure,freshness:fresh,passed:reasons.length===0,reasons};
    });
  }
  function deepScout(fastRows,options={}){
    const limit=Math.max(1,Number(options.limit)||40),strategy=options.strategy==='maximum'?'maximum':'sustainable';
    const candidates=fastRows.filter(r=>r.passed).map(r=>{
      const missing=REQUIRED_DEEP.filter(k=>k==='brokerEligibility'?r.security[k]==null:r.data[k]==null);
      const confidence=clamp((r.data.confidence??85)-r.freshness.confidencePenalty-missing.length*12);
      const data={...r.data,confidence};
      const sustainableScore=score(data,r.exposure,'sustainable'),maximumScore=score(data,r.exposure,'maximum');
      const approved=missing.length===0&&confidence>=50&&clamp(data.dividendSafety)>=35;
      return {...r,data,missing,sustainableScore,maximumScore,auroraScore:strategy==='maximum'?maximumScore:sustainableScore,
        status:approved?'APPROVED_TARGET':'WATCHLIST',discovery:r.exposure.existingHolding?'CURRENT_SQUAD':(r.data.previouslyKnown?'WATCHLIST':'NEW_DISCOVERY')};
    }).sort((a,b)=>b.auroraScore-a.auroraScore);
    return candidates.slice(0,limit).map((r,i)=>({...r,rank:i+1}));
  }
  function runPipeline({securities=[],dataById={},holdings=[],strategy='sustainable',deepLimit=40,at}={}){
    const universe=createRegistry(securities),fast=fastScout(universe,dataById,holdings,{at});
    const deep=deepScout(fast,{strategy,limit:deepLimit});
    return {universe,fast,deep,watchlist:deep.filter(x=>x.status==='WATCHLIST'),
      approved:deep.filter(x=>x.status==='APPROVED_TARGET'),scannedAt:new Date(at||Date.now()).toISOString(),strategy};
  }
  return {SUPPORTED_MARKETS,DATA_FIELDS,STALE,identity,normalizeSecurity,createRegistry,portfolioExposure,freshness,convertToGbp,score,fastScout,deepScout,runPipeline};
});
