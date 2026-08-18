/* Aurora 2 — Former Holding Re-entry Refresh v2
 * Keeps SOLD / ARCHIVED holdings under live evidence review without restoring
 * them to the active portfolio. AuroraData 2 MarketPrices + Watchlist remain
 * the evidence source; Transfer remains the purchase authority.
 */
(function(w){
  'use strict';
  if(w.AuroraFormerReentryRefresh)return;

  const SHEET_ID='1ZDdYmyDrvNuz3utKmgsToKL7NqsibzbWyIo0vg-TjcA';
  const REFRESH_MS=15*60*1000;
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const ticker=v=>upper(v).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\..*$/,'');
  const now=()=>new Date().toISOString();

  let running=false;
  let lastRunAt=null;
  let lastSuccessAt=null;
  let lastError=null;
  let tableObserver=null;

  function state(){try{return w.Aurora2?.core?.read?.()||null}catch(_){return null}}
  function formerHoldings(s){
    const current=new Set(arr(s?.squad?.holdings)
      .filter(h=>['ACTIVE','LOCKED'].includes(upper(h?.status))&&num(h?.shares)>0)
      .map(h=>ticker(h?.ticker)).filter(Boolean));
    const seen=new Set();
    return arr(s?.squad?.holdings).filter(h=>['SOLD','ARCHIVED'].includes(upper(h?.status))).filter(h=>{
      const tk=ticker(h?.ticker);if(!tk||current.has(tk)||seen.has(tk))return false;seen.add(tk);return true;
    });
  }

  function tableObjects(payload){
    const table=payload?.table||{};
    const cols=arr(table.cols).map((c,i)=>String(c?.label||c?.id||`c${i}`).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''));
    return arr(table.rows).map(r=>{
      const out={};
      arr(r?.c).forEach((cell,i)=>{
        if(!cols[i])return;
        out[cols[i]]=cell?.v==null?(cell?.f??''):cell.v;
      });
      return out;
    });
  }

  /* GViz supports a responseHandler callback. Using script/JSONP here avoids
     cross-origin fetch failures when Scouting runs from GitHub Pages/Safari. */
  function fetchSheet(sheet){
    return new Promise((resolve,reject)=>{
      const callback=`auroraFormerGviz${Date.now()}${Math.random().toString(36).slice(2)}`;
      const script=document.createElement('script');
      let settled=false;
      const finish=(err,payload)=>{
        if(settled)return;settled=true;clearTimeout(timer);
        try{delete w[callback]}catch(_){w[callback]=undefined}
        try{script.remove()}catch(_){}
        if(err)reject(err);else resolve(tableObjects(payload));
      };
      const timer=setTimeout(()=>finish(new Error(`${sheet} evidence timed out.`)),18000);
      w[callback]=payload=>finish(null,payload||{});
      const params=new URLSearchParams({
        tqx:`out:json;responseHandler:${callback}`,
        sheet,headers:'1',tq:'select *',_t:String(Date.now())
      });
      script.src=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${params.toString()}`;
      script.async=true;
      script.referrerPolicy='no-referrer';
      script.onerror=()=>finish(new Error(`${sheet} evidence could not be opened.`));
      document.head.appendChild(script);
    });
  }

  function mapByTicker(rows){
    const map=new Map();
    arr(rows).forEach(row=>{
      const tk=ticker(row?.ticker||row?.symbol||row?.google_symbol);if(tk)map.set(tk,row);
    });
    return map;
  }
  function yieldPct(watch,live){
    const explicit=Math.max(0,num(watch?.yield_pct)||num(watch?.dividend_yield));
    if(explicit>0)return explicit<=1?explicit*100:explicit;
    const dps=Math.max(0,num(watch?.annual_dps));
    return live>0&&dps>0?(dps/live)*100:0;
  }
  function normaliseVerdict(v){
    const d=upper(v);
    if(/NO RE-ENTRY|DO NOT RE-ENTER|DO NOT SIGN|WAIT \/ REVIEW/.test(d))return 'NO RE-ENTRY';
    if(/CAUTION|KEEP WATCH|MONITOR/.test(d))return 'CAUTION';
    if(/RE-ENTRY|SIGN IF|STRONG SIGN/.test(d))return 'RE-ENTRY';
    return '';
  }

  function buildEvidence(s,watchRows,priceRows){
    const wm=mapByTicker(watchRows),pm=mapByTicker(priceRows);
    return formerHoldings(s).map(h=>{
      const tk=ticker(h.ticker),watch=wm.get(tk)||{},price=pm.get(tk)||{};
      const live=Math.max(0,num(price.price_gbp),num(watch.live_price),num(h.livePriceGbp));
      const dps=Math.max(0,num(watch.annual_dps),num(h.annualDpsGbp));
      const y=yieldPct(watch,live)||(live>0&&dps>0?dps/live*100:0);
      const verdict=normaliseVerdict(watch.trial_verdict||watch.status||'');
      return {
        ticker:tk,
        name:String(watch.name||h.name||tk),
        account:String(h.account||''),
        live_price:Number(live.toFixed(6)),
        livePriceGbp:Number(live.toFixed(6)),
        annual_dps:Number(dps.toFixed(6)),
        annualDpsGbp:Number(dps.toFixed(6)),
        yield_pct:Number(y.toFixed(4)),
        yieldPct:Number(y.toFixed(4)),
        valuation_score:Math.max(0,num(watch.valuation_score)),
        valuationScore:Math.max(0,num(watch.valuation_score)),
        yield_score:Math.max(0,num(watch.yield_score)),
        reentry_score:Math.max(0,num(watch.promotion_impact_score)),
        trial_status:String(watch.trial_status||''),
        reentry_verdict:verdict,
        decision_action:verdict,
        buy_permission:verdict,
        manager_note:String(watch.manager_note||watch.notes||''),
        valuation_status:String(watch.valuation_status||''),
        source:'AURORADATA2_FORMER_REENTRY',
        sourceUpdatedAt:now(),
        evidenceComplete:live>0&&!!verdict
      };
    });
  }

  function evidenceSignature(rows){
    return JSON.stringify(arr(rows).map(x=>[
      ticker(x.ticker),num(x.livePriceGbp).toFixed(6),num(x.annualDpsGbp).toFixed(6),
      num(x.yieldPct).toFixed(4),x.reentry_verdict,num(x.valuationScore),num(x.reentry_score)
    ]));
  }

  function applyEvidence(rows){
    const A=w.Aurora2;if(!A?.core?.read||!A?.core?.update)return false;
    const current=A.core.read();
    const old=arr(current.scouting?.formerReentryEvidence);
    const changed=evidenceSignature(old)!==evidenceSignature(rows);
    if(!changed)return false;
    const byTicker=new Map(rows.map(x=>[ticker(x.ticker),x]));
    A.core.update(s=>({
      ...s,
      scouting:{...s.scouting,formerReentryEvidence:rows,formerReentryLastRefreshAt:now(),updatedAt:now()},
      squad:{...s.squad,holdings:arr(s.squad?.holdings).map(h=>{
        if(!['SOLD','ARCHIVED'].includes(upper(h?.status)))return h;
        const e=byTicker.get(ticker(h.ticker));if(!e)return h;
        return {...h,
          livePriceGbp:num(e.livePriceGbp)>0?num(e.livePriceGbp):num(h.livePriceGbp),
          annualDpsGbp:num(e.annualDpsGbp)>0?num(e.annualDpsGbp):num(h.annualDpsGbp),
          sourceUpdatedAt:e.sourceUpdatedAt,
          updatedAt:now()
        };
      }),updatedAt:now()}
    }));
    return true;
  }

  function verdictTone(v){
    const d=normaliseVerdict(v);
    if(d==='RE-ENTRY')return {tone:'pass',label:'RE-ENTRY OPPORTUNITY',scout:'RE-ENTRY'};
    if(d==='CAUTION')return {tone:'caution',label:'RE-ENTRY REVIEW',scout:'CAUTION'};
    if(d==='NO RE-ENTRY')return {tone:'block',label:'NO RE-ENTRY',scout:'NO RE-ENTRY'};
    return null;
  }
  function money(v){return `£${num(v).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:4})}`}

  function patchOpportunityTable(){
    const body=document.getElementById('squadOpportunityBody');if(!body)return;
    const s=state();if(!s)return;
    const evidence=new Map(arr(s.scouting?.formerReentryEvidence).map(x=>[ticker(x.ticker),x]));
    [...body.querySelectorAll('tr')].forEach(tr=>{
      const cells=tr.children;if(cells.length<8)return;
      if(!/FORMER/i.test(cells[0].textContent||''))return;
      const tk=ticker(cells[1].querySelector('strong')?.textContent||'');
      const e=evidence.get(tk);if(!e)return;
      if(num(e.livePriceGbp)>0)cells[3].textContent=money(e.livePriceGbp);
      cells[5].textContent=num(e.yieldPct)>0?`${num(e.yieldPct).toFixed(2)}%`:'—';
      const v=verdictTone(e.reentry_verdict);if(!v)return;
      cells[6].innerHTML=`<span class="squad-opportunity-chip ${v.tone}">${v.label}</span>`;
      cells[7].innerHTML=`<span class="squad-opportunity-chip ${v.tone}">${v.scout}</span><span class="sub">AuroraData 2 re-entry evidence</span>`;
    });
    const note=document.querySelector('#squadOpportunityWatch .squad-opportunity-note');
    if(note)note.textContent='Former holdings are automatically refreshed from AuroraData 2 MarketPrices and the silent re-entry Watchlist. Green / amber / red re-entry verdicts use current sheet evidence; DATA PENDING is kept only when fresh evidence is genuinely incomplete. Transfer never buys automatically.';
  }

  function observeTable(){
    const body=document.getElementById('squadOpportunityBody');
    if(!body||tableObserver)return;
    tableObserver=new MutationObserver(()=>requestAnimationFrame(patchOpportunityTable));
    tableObserver.observe(body,{childList:true,subtree:true});
    patchOpportunityTable();
  }

  async function refresh(){
    if(running)return null;
    const s=state();if(!s)return null;
    running=true;lastRunAt=now();lastError=null;
    try{
      // If the authenticated shared client is already present, ask the canonical
      // market engine to run too. The public evidence sheets remain the fallback.
      try{await w.AuroraData2Client?.post?.('marketPriceSnapshot',{})}catch(_){}
      const [watchRows,priceRows]=await Promise.all([fetchSheet('Watchlist'),fetchSheet('MarketPrices')]);
      const evidence=buildEvidence(state()||s,watchRows,priceRows);
      applyEvidence(evidence);
      lastSuccessAt=now();
      setTimeout(()=>{observeTable();patchOpportunityTable()},60);
      return evidence;
    }catch(err){
      lastError=String(err?.message||err);
      console.warn('Aurora former re-entry refresh failed:',err);
      return null;
    }finally{running=false}
  }

  function bind(){
    [450,1200].forEach(delay=>setTimeout(()=>{observeTable();refresh()},delay));
    document.getElementById('runScouting')?.addEventListener('click',()=>setTimeout(refresh,80),{capture:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
    w.addEventListener('aurora2:state',()=>setTimeout(()=>{observeTable();patchOpportunityTable()},40));
    setInterval(()=>{if(!document.hidden)refresh()},REFRESH_MS);
  }

  w.AuroraFormerReentryRefresh={
    refresh,
    patch:patchOpportunityTable,
    status:()=>({running,lastRunAt,lastSuccessAt,lastError})
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})(window);
