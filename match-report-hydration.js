/* Aurora City FC — Match Report full-data hydration v1.0
 * Makes Match Report self-sufficient: it refreshes shared club state, canonical holdings/
 * market evidence and the Income dividend calendar when the page opens or Refresh is used.
 * Missing evidence stays missing; nothing is synthesised.
 */
(function(w){
'use strict';
if(w.__AURORA_MATCH_REPORT_HYDRATION__)return;
w.__AURORA_MATCH_REPORT_HYDRATION__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='match-report.html')return;

const arr=v=>Array.isArray(v)?v:[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const now=()=>new Date().toISOString();
const raw=v=>{
  if(v===null||v===undefined)return null;
  if(typeof v==='string'&&!v.trim())return null;
  const n=Number(String(v).replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:null;
};
const ticker=v=>String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();
const account=v=>{
  const s=String(v||'').toLowerCase();
  if(s.includes('212'))return 'T212';
  if(/\big\b/.test(s)||s.includes('ig isa'))return 'IG';
  const u=String(v||'').toUpperCase();
  return u==='IG'||u==='T212'?u:'CHECK';
};
const key=h=>`${account(h?.account)}|${ticker(h?.ticker)}`;

let running=null;
let lastHydratedAt=0;
let lastResult=null;

async function waitForCore(timeout=15000){
  const started=Date.now();
  while(Date.now()-started<timeout){
    if(w.Aurora2?.core?.read&&w.Aurora2?.core?.update)return true;
    await wait(100);
  }
  return false;
}
function firstNumber(obj,keys){
  for(const k of keys){const n=raw(obj?.[k]);if(n!==null)return n;}
  return null;
}
function firstText(obj,keys){
  for(const k of keys){const x=String(obj?.[k]??'').trim();if(x)return x;}
  return '';
}
function setBusy(on){
  document.documentElement.dataset.matchReportHydration=on?'running':'ready';
  const state=document.getElementById('reportState');
  if(on&&state)state.textContent='● REFRESHING DATA';
}

async function syncCloud(){
  const cloud=w.AuroraCloudSync;
  if(!cloud)return {status:'UNAVAILABLE'};
  try{await cloud.ready;}catch(_){}
  const status=cloud.status?.()||{};
  if(!status.signedIn)return {status:'SIGNED_OUT'};
  if(!status.bootstrapped)return {status:'NOT_BOOTSTRAPPED'};
  if(status.online===false)return {status:'OFFLINE'};
  try{
    const result=await cloud.syncNow('match-report-hydration');
    return {status:result?.ok===false?'PARTIAL':'SYNCED',result};
  }catch(error){
    console.warn('Match Report hydration: cloud sync failed:',error);
    return {status:'ERROR',error:String(error?.message||error)};
  }
}

function mergeMarketEvidence(snapshot){
  const core=w.Aurora2?.core;if(!core?.update)return false;
  const incoming=arr(snapshot?.holdings);if(!incoming.length)return false;
  const map=new Map(incoming.map(row=>[key(row),row]));
  let changed=false;

  core.update(state=>{
    const holdings=arr(state?.squad?.holdings).map(h=>{
      if(!['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())||(raw(h?.shares)||0)<=0)return h;
      const row=map.get(key(h));if(!row)return h;
      const next={...h};
      const live=firstNumber(row,['livePriceGbp','live_price_gbp','price']);
      const prev=firstNumber(row,['previousCloseGbp','prevCloseGbp','previous_close_gbp','previousClose','prevClose']);
      let dayGbp=firstNumber(row,['dailyChangeGbp','todayChangeGbp','dayChangeGbp','changeGbp','daily_change_gbp','today_change_gbp']);
      let dayPct=firstNumber(row,['dailyChangePct','todayChangePct','dayChangePct','changePct','daily_change_pct','today_change_pct']);
      const shares=raw(next.shares)||0;
      if(dayPct===null&&live!==null&&prev!==null&&prev>0)dayPct=(live-prev)/prev*100;
      if(dayGbp===null&&live!==null&&prev!==null&&prev>0&&shares>0)dayGbp=(live-prev)*shares;
      const confidence=firstNumber(row,['confidence','dataQuality','data_quality','buyStrength','buy_strength']);
      const safety=firstNumber(row,['dividendSafety','dividend_safety','incomeSafety','safety']);
      const assign=(field,value)=>{if(value===null||value===undefined)return;if(next[field]!==value){next[field]=value;changed=true;}};
      assign('dailyChangeGbp',dayGbp);
      assign('dailyChangePct',dayPct);
      if(prev!==null&&prev>0)assign('previousCloseGbp',prev);
      if(confidence!==null)assign('confidence',confidence);
      if(safety!==null)assign('dividendSafety',safety);
      const evidenceAt=firstText(row,['marketUpdatedAt','priceUpdatedAt','sourceUpdatedAt','updatedAt']);
      if(evidenceAt)assign('marketEvidenceAt',evidenceAt);
      return next;
    });
    if(!changed)return state;
    return {...state,squad:{...state.squad,holdings,marketEvidenceAt:snapshot?.at||now(),updatedAt:now()}};
  });
  return changed;
}

async function syncHoldingsAndMarket(){
  try{
    let snapshot=null;
    const manager=w.AuroraSyncManager;
    const started=Date.now();
    while(Date.now()-started<7000){
      const services=manager?.status?.()?.services||[];
      if(manager?.run&&services.includes('holdings')){
        snapshot=await manager.run('holdings',{force:true,reason:'match-report-hydration'});
        break;
      }
      if(w.AuroraHoldingsSync?.sync){snapshot=await w.AuroraHoldingsSync.sync();break;}
      await wait(150);
    }
    if(!snapshot){
      const client=w.AuroraData2Client,cfg=client?.config?.()||{};
      if(client?.post&&cfg.endpoint&&cfg.token){
        snapshot=await client.post('marketPriceSnapshot',{});
        w.AuroraHoldingsSync?.applySnapshot?.(snapshot);
      }
    }
    if(snapshot)mergeMarketEvidence(snapshot);
    return {status:snapshot?'SYNCED':'NO_SNAPSHOT',snapshot};
  }catch(error){
    console.warn('Match Report hydration: holdings/market sync failed:',error);
    return {status:'ERROR',error:String(error?.message||error)};
  }
}

function normaliseDividend(x){
  return {
    id:String(x?.id||x?.dividendId||`BACKEND|${account(x?.account)}|${ticker(x?.ticker)}|${x?.payDate||x?.paymentDate||''}|${x?.exDate||''}`),
    ticker:ticker(x?.ticker),name:x?.name||x?.ticker||'Dividend',account:account(x?.account),
    exDate:x?.exDate||x?.ex_date||'',payDate:x?.payDate||x?.paymentDate||x?.payment_date||'',
    sharesEligible:raw(x?.sharesEligible)??0,dividendPerShareGbp:raw(x?.dividendPerShareGbp)??0,
    expectedAmountGbp:raw(x?.expectedAmountGbp)??0,actualAmountGbp:raw(x?.actualAmountGbp)??0,
    amountGbp:raw(x?.amountGbp),forecastAmountGbp:raw(x?.forecastAmountGbp),
    status:String(x?.status||'FORECAST').toUpperCase(),notes:x?.notes||'',source:x?.source||'AURORADATA2',
    backendId:x?.id||'',createdAt:x?.createdAt||now(),updatedAt:x?.updatedAt||now()
  };
}
function eventAmount(state,e){
  const status=String(e?.status||'').toUpperCase();
  const actual=raw(e?.actualAmountGbp);if(status==='PAID'&&actual!==null&&actual>0)return actual;
  for(const field of ['amountGbp','expectedAmountGbp','forecastAmountGbp','amount']){
    const n=raw(e?.[field]);if(n!==null&&n>0)return n;
  }
  const dps=raw(e?.dividendPerShareGbp),eligible=raw(e?.sharesEligible);
  if(dps!==null&&dps>0&&eligible!==null&&eligible>0)return dps*eligible;
  if(dps!==null&&dps>0){
    const h=arr(state?.squad?.holdings).find(row=>key(row)===key(e)&&['ACTIVE','LOCKED'].includes(String(row?.status||'').toUpperCase()));
    const shares=raw(h?.shares);if(shares!==null&&shares>0)return shares*dps;
  }
  return null;
}
function deriveNextDividend(state,calendar){
  const today=new Date();today.setHours(0,0,0,0);
  const rows=arr(calendar).map(e=>{
    const text=String(e?.payDate||e?.paymentDate||'').trim();if(!text)return null;
    const d=new Date(`${text.slice(0,10)}T12:00:00`);if(Number.isNaN(d.getTime()))return null;
    return {e,d};
  }).filter(Boolean).filter(({e,d})=>d>=today&&!['PAID','CANCELLED','ARCHIVED'].includes(String(e?.status||'').toUpperCase())).sort((a,b)=>a.d-b.d);
  const e=rows[0]?.e;if(!e)return null;
  return {ticker:ticker(e.ticker),name:e.name,account:account(e.account),amount:eventAmount(state,e),date:e.payDate||e.paymentDate,exDate:e.exDate||'',status:e.status};
}

async function syncIncome(){
  const client=w.AuroraData2Client,cfg=client?.config?.()||{};
  if(!client?.post||!cfg.endpoint||!cfg.token)return {status:'NOT_CONFIGURED'};
  try{
    const result=await client.post('incomeSnapshot',{});
    const incoming=arr(result?.dividends).map(normaliseDividend);
    w.Aurora2?.core?.update?.(state=>{
      const existing=arr(state?.income?.calendar),map=new Map(existing.map(e=>[String(e?.id||''),e]));
      incoming.forEach(e=>map.set(e.id,e));
      const calendar=[...map.values()];
      return {...state,income:{...state.income,calendar,nextDividend:deriveNextDividend(state,calendar),source:'AURORADATA2_CANONICAL',backend:{...state.income?.backend,status:'CONNECTED',lastSyncAt:now(),lastError:null},updatedAt:now()}};
    });
    return {status:'SYNCED',count:incoming.length};
  }catch(error){
    console.warn('Match Report hydration: Income sync failed:',error);
    return {status:'ERROR',error:String(error?.message||error)};
  }
}

async function hydrate(reason='open',{force=false}={}){
  if(running)return running;
  if(!force&&reason!=='open'&&Date.now()-lastHydratedAt<120000)return lastResult;
  running=(async()=>{
    if(!await waitForCore())return null;
    setBusy(true);
    try{
      const cloud=await syncCloud();
      const holdings=await syncHoldingsAndMarket();
      const income=await syncIncome();
      lastHydratedAt=Date.now();
      lastResult={cloud,holdings:holdings.status,income,at:now()};
      w.dispatchEvent(new CustomEvent('aurora2:match-report-hydrated',{detail:{reason,...lastResult}}));
      return lastResult;
    }finally{setBusy(false);}
  })();
  try{return await running;}finally{running=null;}
}

function bind(){
  setTimeout(()=>hydrate('open',{force:true}),120);
  document.addEventListener('click',e=>{
    if(e.target.closest('#refreshReport'))setTimeout(()=>hydrate('manual',{force:true}),0);
  },true);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')setTimeout(()=>hydrate('foreground'),180);
  });
  w.addEventListener('online',()=>setTimeout(()=>hydrate('online'),300));
}

w.AuroraMatchReportHydration={version:'1.0',hydrate,status:()=>({running:Boolean(running),lastHydratedAt,lastResult})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})(window);
