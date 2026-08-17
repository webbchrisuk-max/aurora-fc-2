/* Aurora City FC — Nexus V2 command-centre hydration v1.0
 * Pulls the freshest safe Aurora state when Nexus opens, then reasserts backend-owned truth.
 * Order matters:
 *   1) Cloud domains (Finance/Scouting/Transfer/Income/Mission/Portfolio/Decision/etc.)
 *   2) Canonical AuroraData holdings + market snapshot
 *   3) AuroraData Income dividend calendar
 * Missing evidence remains missing; this module never invents market moves, scores or dividends.
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_V2_COMMAND_HYDRATION__)return;
w.__AURORA_NEXUS_V2_COMMAND_HYDRATION__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

const arr=v=>Array.isArray(v)?v:[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const now=()=>new Date().toISOString();
const rawNumber=v=>{
  if(v===null||v===undefined)return null;
  if(typeof v==='string'&&!v.trim())return null;
  const n=Number(String(v).replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:null;
};
const ticker=v=>String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();
const accountCode=v=>{
  const s=String(v||'').toLowerCase();
  if(s.includes('212'))return 'T212';
  if(/\big\b/.test(s)||s.includes('ig isa'))return 'IG';
  const u=String(v||'').toUpperCase();
  return u==='IG'||u==='T212'?u:'CHECK';
};
const holdingKey=h=>`${accountCode(h?.account)}|${ticker(h?.ticker)}`;

let running=false;
let lastHydratedAt=0;

async function waitForCore(timeout=15000){
  const started=Date.now();
  while(Date.now()-started<timeout){
    if(w.Aurora2?.core?.read&&w.Aurora2?.core?.update)return true;
    await wait(100);
  }
  return false;
}

function firstNumber(obj,keys){
  for(const key of keys){const n=rawNumber(obj?.[key]);if(n!==null)return n;}
  return null;
}
function firstText(obj,keys){
  for(const key of keys){const s=String(obj?.[key]??'').trim();if(s)return s;}
  return '';
}

/* marketPriceSnapshot owns current holding truth. The canonical holdings bridge
   deliberately carries a compact schema, so enrich only evidence that the backend
   actually supplied instead of turning absent fields into zeroes. */
function mergeMarketEvidence(snapshot){
  const core=w.Aurora2?.core;if(!core?.read||!core?.update)return false;
  const incoming=arr(snapshot?.holdings);if(!incoming.length)return false;
  const byKey=new Map(incoming.map(row=>[holdingKey(row),row]));
  let changed=false;

  core.update(state=>{
    const holdings=arr(state?.squad?.holdings).map(h=>{
      if(!['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())||rawNumber(h?.shares)<=0)return h;
      const row=byKey.get(holdingKey(h));if(!row)return h;
      const next={...h};

      const dayGbp=firstNumber(row,['dailyChangeGbp','todayChangeGbp','dayChangeGbp','changeGbp','daily_change_gbp','today_change_gbp','day_change_gbp']);
      const dayPct=firstNumber(row,['dailyChangePct','todayChangePct','dayChangePct','changePct','daily_change_pct','today_change_pct','day_change_pct']);
      const prev=firstNumber(row,['previousCloseGbp','prevCloseGbp','previous_close_gbp','previousClose','prevClose']);
      const score=firstNumber(row,['confidence','auroraScore','score','qualityScore','dataQuality','data_quality']);
      const safety=firstNumber(row,['dividendSafety','dividend_safety','incomeSafety','safety']);
      const live=firstNumber(row,['livePriceGbp','live_price_gbp','price']);
      const shares=rawNumber(next.shares)||0;

      let resolvedPct=dayPct,resolvedGbp=dayGbp;
      if(resolvedPct===null&&prev!==null&&prev>0&&live!==null&&live>0)resolvedPct=(live-prev)/prev*100;
      if(resolvedGbp===null&&prev!==null&&prev>0&&live!==null&&live>0&&shares>0)resolvedGbp=(live-prev)*shares;

      const assign=(key,value,allowZero=true)=>{
        if(value===null||value===undefined)return;
        if(!allowZero&&Math.abs(Number(value))<1e-12)return;
        if(next[key]!==value){next[key]=value;changed=true;}
      };
      assign('dailyChangeGbp',resolvedGbp,true);
      assign('dailyChangePct',resolvedPct,true);
      assign('previousCloseGbp',prev,false);
      assign('confidence',score,false);
      assign('dividendSafety',safety,false);

      const evidenceAt=firstText(row,['marketUpdatedAt','priceUpdatedAt','sourceUpdatedAt','updatedAt']);
      if(evidenceAt&&next.marketEvidenceAt!==evidenceAt){next.marketEvidenceAt=evidenceAt;changed=true;}
      return next;
    });
    if(!changed)return state;
    return {...state,squad:{...state.squad,holdings,marketEvidenceAt:snapshot?.at||now()}};
  });
  return changed;
}

async function syncCloudDomains(){
  const cloud=w.AuroraCloudSync;if(!cloud)return {status:'UNAVAILABLE'};
  try{await cloud.ready;}catch(_){}
  const status=cloud.status?.()||{};
  if(!status.signedIn)return {status:'SIGNED_OUT'};
  if(!status.bootstrapped)return {status:'NOT_BOOTSTRAPPED'};
  if(status.online===false)return {status:'OFFLINE'};
  try{
    const result=await cloud.syncNow('nexus-command-hydration');
    return {status:result?.ok===false?'PARTIAL':'SYNCED',result};
  }catch(error){
    console.warn('Nexus command hydration: cloud sync failed:',error);
    return {status:'ERROR',error:String(error?.message||error)};
  }
}

async function syncCanonicalHoldings(){
  let snapshot=null;
  try{
    const manager=w.AuroraSyncManager;
    const started=Date.now();
    while(Date.now()-started<6000){
      const services=manager?.status?.()?.services||[];
      if(manager?.run&&services.includes('holdings')){
        snapshot=await manager.run('holdings',{force:true,reason:'nexus-command-hydration'});
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
    console.warn('Nexus command hydration: holdings sync failed:',error);
    return {status:'ERROR',error:String(error?.message||error)};
  }
}

function normaliseDividend(x){
  const id=String(x?.id||x?.dividendId||`BACKEND|${accountCode(x?.account)}|${ticker(x?.ticker)}|${x?.payDate||x?.paymentDate||''}|${x?.exDate||''}`);
  return {
    id,
    ticker:ticker(x?.ticker),
    name:x?.name||x?.ticker||'Dividend',
    account:accountCode(x?.account),
    exDate:x?.exDate||x?.ex_date||'',
    payDate:x?.payDate||x?.paymentDate||x?.payment_date||'',
    sharesEligible:rawNumber(x?.sharesEligible)??0,
    dividendPerShareGbp:rawNumber(x?.dividendPerShareGbp)??0,
    expectedAmountGbp:rawNumber(x?.expectedAmountGbp)??0,
    actualAmountGbp:rawNumber(x?.actualAmountGbp)??0,
    amountGbp:rawNumber(x?.amountGbp),
    forecastAmountGbp:rawNumber(x?.forecastAmountGbp),
    status:String(x?.status||'FORECAST').toUpperCase(),
    notes:x?.notes||'',
    source:x?.source||'AURORADATA2',
    backendId:x?.id||'',
    createdAt:x?.createdAt||now(),
    updatedAt:x?.updatedAt||now()
  };
}
function eventAmount(state,e){
  const status=String(e?.status||'').toUpperCase();
  const actual=rawNumber(e?.actualAmountGbp);if(status==='PAID'&&actual!==null&&actual>0)return actual;
  for(const key of ['amountGbp','expectedAmountGbp','forecastAmountGbp','amount']){
    const n=rawNumber(e?.[key]);if(n!==null&&n>0)return n;
  }
  const dps=rawNumber(e?.dividendPerShareGbp),eligible=rawNumber(e?.sharesEligible);
  if(dps!==null&&dps>0&&eligible!==null&&eligible>0)return dps*eligible;
  if(dps!==null&&dps>0){
    const h=arr(state?.squad?.holdings).find(row=>holdingKey(row)===holdingKey(e)&&['ACTIVE','LOCKED'].includes(String(row?.status||'').toUpperCase()));
    const shares=rawNumber(h?.shares);if(shares!==null&&shares>0)return shares*dps;
  }
  return null;
}
function deriveNextDividend(state,calendar){
  const today=new Date();today.setHours(0,0,0,0);
  const rows=arr(calendar).map(e=>{
    const text=String(e?.payDate||e?.paymentDate||'').trim();if(!text)return null;
    const date=new Date(`${text.slice(0,10)}T12:00:00`);if(Number.isNaN(date.getTime()))return null;
    return {e,date};
  }).filter(Boolean).filter(({e,date})=>date>=today&&!['PAID','CANCELLED','ARCHIVED'].includes(String(e?.status||'').toUpperCase())).sort((a,b)=>a.date-b.date);
  const hit=rows[0]?.e;if(!hit)return null;
  return {ticker:ticker(hit.ticker),name:hit.name,account:accountCode(hit.account),amount:eventAmount(state,hit),date:hit.payDate||hit.paymentDate,exDate:hit.exDate||'',status:hit.status};
}

async function syncIncomeCalendar(){
  const client=w.AuroraData2Client,cfg=client?.config?.()||{};
  if(!client?.post||!cfg.endpoint||!cfg.token)return {status:'NOT_CONFIGURED'};
  try{
    const result=await client.post('incomeSnapshot',{});
    const incoming=arr(result?.dividends).map(normaliseDividend);
    const core=w.Aurora2?.core;
    if(core?.update){
      core.update(state=>{
        const existing=arr(state?.income?.calendar),map=new Map(existing.map(e=>[String(e?.id||''),e]));
        incoming.forEach(e=>map.set(e.id,e));
        const calendar=[...map.values()];
        const nextDividend=deriveNextDividend(state,calendar);
        return {...state,income:{...state.income,calendar,nextDividend,source:'AURORADATA2_CANONICAL',backend:{...state.income?.backend,status:'CONNECTED',lastSyncAt:now(),lastError:null},updatedAt:now()}};
      });
    }
    return {status:'SYNCED',count:incoming.length};
  }catch(error){
    console.warn('Nexus command hydration: Income snapshot failed:',error);
    return {status:'ERROR',error:String(error?.message||error)};
  }
}

async function hydrate(reason='open'){
  if(running)return null;
  if(reason!=='open'&&Date.now()-lastHydratedAt<120000)return null;
  running=true;
  try{
    if(!await waitForCore())return null;
    document.documentElement.dataset.nexusHydration='running';

    /* Pull shared department state first. Backend-owned holdings are deliberately
       refreshed afterwards so a stale cloud squad can never beat AuroraData truth. */
    const cloud=await syncCloudDomains();
    const holdings=await syncCanonicalHoldings();
    const income=await syncIncomeCalendar();

    lastHydratedAt=Date.now();
    document.documentElement.dataset.nexusHydration='ready';
    w.dispatchEvent(new CustomEvent('aurora2:nexus-hydrated',{detail:{reason,cloud,holdings:holdings.status,income}}));
    return {cloud,holdings,income};
  }catch(error){
    document.documentElement.dataset.nexusHydration='error';
    console.warn('Nexus command hydration failed:',error);
    return null;
  }finally{running=false;}
}

function init(){
  setTimeout(()=>hydrate('open'),120);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')setTimeout(()=>hydrate('foreground'),180);
  });
  w.addEventListener('online',()=>setTimeout(()=>hydrate('online'),300));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})(window);
