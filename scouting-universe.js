(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.Aurora2=root.Aurora2||{};root.Aurora2.scoutingUniverse=api}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  // Membership sources are intentionally independent of market-data sources. A
  // constituent with no quote or fundamentals still belongs to the universe.
  const MEMBERSHIP_SOURCES=Object.freeze([
    {id:'FTSE_100',label:'FTSE 100',page:'FTSE_100_Index',region:'UK',exchange:'LSE',currency:'GBP'},
    {id:'FTSE_250',label:'FTSE 250',page:'FTSE_250_Index',region:'UK',exchange:'LSE',currency:'GBP'},
    {id:'SP_500',label:'S&P 500',page:'List_of_S%26P_500_companies',region:'US',exchange:'US',currency:'USD'}
  ]);
  const clean=v=>String(v||'').trim().toUpperCase().replace(/\s+/g,'');
  function canonicalTicker(ticker,exchange){
    let t=clean(ticker).replace(/^LON:/,'').replace(/^NYSE:|^NASDAQ:|^AMEX:/,'');
    if(clean(exchange)==='LSE')t=t.replace(/\.L$/,'');
    // US class shares are variously written BRK.B and BRK-B. Keep one identity.
    if(clean(exchange)==='US')t=t.replace(/\./g,'-');
    return t;
  }
  function securityId(exchange,ticker){return `${clean(exchange)||'UNKNOWN'}:${canonicalTicker(ticker,exchange)}`}
  function normalize(row={}){
    const exchange=clean(row.exchange)||(row.region==='UK'?'LSE':row.region==='US'?'US':'UNKNOWN');
    const ticker=canonicalTicker(row.ticker||row.marketSymbol,exchange);
    if(!ticker)return null;
    return {...row,ticker,marketSymbol:row.marketSymbol||ticker,exchange,
      id:securityId(exchange,ticker),securityId:securityId(exchange,ticker),
      memberships:[...new Set(row.memberships||[])],dataStatus:row.dataStatus||'MISSING'};
  }
  function merge(rows=[]){
    const byId=new Map();
    rows.forEach(raw=>{
      const row=normalize(raw);if(!row)return;
      const prior=byId.get(row.securityId);
      if(!prior){byId.set(row.securityId,row);return}
      const evidence=(Number(row.evidenceCount)||0)>(Number(prior.evidenceCount)||0)?row:prior;
      byId.set(row.securityId,{...prior,...evidence,
        memberships:[...new Set([...prior.memberships,...row.memberships])],
        sources:[...new Set([...(prior.sources||[]),...(row.sources||[])])]});
    });
    return [...byId.values()];
  }
  function coverage(rows=[]){
    const has=(r,m)=>(r.memberships||[]).includes(m);
    const uk=rows.filter(r=>r.region==='UK'),us=rows.filter(r=>r.region==='US');
    return {total:rows.length,UK:uk.length,US:us.length,WORLD:rows.length-uk.length-us.length,
      ftse100:rows.filter(r=>has(r,'FTSE 100')).length,
      ftse250:rows.filter(r=>has(r,'FTSE 250')).length,
      ukIncome:uk.filter(r=>!has(r,'FTSE 100')&&!has(r,'FTSE 250')).length,
      missingData:rows.filter(r=>r.dataStatus==='MISSING').length};
  }
  return {MEMBERSHIP_SOURCES,canonicalTicker,securityId,normalize,merge,coverage};
});
