(function(w){
  'use strict';

  const A=()=>w.Aurora2;
  const D=()=>w.AuroraData2Client;
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{
    const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  };
  const now=()=>new Date().toISOString();

  let running=false;
  let timer=null;
  const attempted=new Map();

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

  function missingMetadata(h){
    if(!(num(h?.shares)>0))return false;
    if(!['ACTIVE','LOCKED'].includes(String(h?.status||'ACTIVE').toUpperCase()))return false;
    return (
      !(num(h.livePriceGbp)>0) ||
      !(num(h.marketValueGbp)>0) ||
      !(num(h.annualDpsGbp)>0) ||
      !(num(h.annualIncomeGbp)>0) ||
      !String(h.sector||'').trim()
    );
  }

  function findTarget(state,h){
    const tk=ticker(h.ticker);
    return arr(state.scouting?.targets).find(t=>ticker(t.ticker)===tk)||null;
  }

  function findAllocation(state,h){
    const tk=ticker(h.ticker), ac=accountCode(h.account);
    return arr(state.transfer?.route?.allocations).find(a=>
      ticker(a.ticker)===tk && accountCode(a.account)===ac
    )||null;
  }

  function metadataFor(state,h){
    const t=findTarget(state,h);
    const a=findAllocation(state,h);

    const livePriceGbp=Math.max(0,
      num(t?.livePriceGbp) ||
      num(t?.livePrice) ||
      num(a?.livePriceGbp)
    );

    const yieldPct=Math.max(0,
      num(t?.yieldPct) ||
      num(a?.yieldPct)
    );

    let annualDpsGbp=Math.max(0,
      num(t?.annualDpsGbp) ||
      num(t?.annualDps) ||
      num(a?.annualDpsGbp)
    );

    // Scouting already treats yield as forward dividend yield. If explicit
    // annual DPS is absent, use the same Scouting evidence to derive it.
    if(!(annualDpsGbp>0) && livePriceGbp>0 && yieldPct>0){
      annualDpsGbp=livePriceGbp*(yieldPct/100);
    }

    return {
      livePriceGbp,
      yieldPct,
      annualDpsGbp,
      sector:String(t?.sector||a?.sector||'').trim(),
      role:String(t?.role||a?.role||'').trim(),
      sourceUrl:String(
        t?.sourceUrl ||
        t?.issuerUrl ||
        t?.investorUrl ||
        ''
      ).trim(),
      source:'AURORA2_SCOUTING_TRANSFER'
    };
  }

  function hasUsefulMetadata(m){
    return (
      num(m.livePriceGbp)>0 ||
      num(m.annualDpsGbp)>0 ||
      num(m.yieldPct)>0 ||
      String(m.sector||'').trim() ||
      String(m.role||'').trim()
    );
  }

  function signature(h,m){
    return JSON.stringify([
      accountCode(h.account),ticker(h.ticker),
      num(m.livePriceGbp).toFixed(6),
      num(m.annualDpsGbp).toFixed(6),
      num(m.yieldPct).toFixed(4),
      String(m.sector||''),
      String(m.role||'')
    ]);
  }

  function updateLocalHolding(backendHolding){
    const h=backendHolding||{};
    const ac=accountCode(h.account), tk=ticker(h.ticker);
    if(!['IG','T212'].includes(ac)||!tk)return;

    A().core.update(s=>({
      ...s,
      squad:{
        ...s.squad,
        holdings:arr(s.squad?.holdings).map(old=>{
          if(accountCode(old.account)!==ac||ticker(old.ticker)!==tk)return old;
          return {
            ...old,
            id:h.holdingId||h.id||old.id,
            name:h.name||old.name,
            shares:num(h.shares),
            bookCostGbp:num(h.bookCostGbp),
            avgCostGbp:num(h.avgCostGbp),
            livePriceGbp:num(h.livePriceGbp),
            marketValueGbp:num(h.marketValueGbp),
            profitLossGbp:Number(h.profitLossGbp)||0,
            annualDpsGbp:num(h.annualDpsGbp),
            annualIncomeGbp:num(h.annualIncomeGbp),
            sector:h.sector||old.sector||'',
            role:h.role||old.role||'',
            status:h.status||old.status||'ACTIVE',
            locked:!!h.locked,
            lockReason:h.lockReason||old.lockReason||'',
            source:h.source||old.source||'AURORADATA2',
            sourceUpdatedAt:h.sourceUpdatedAt||now(),
            updatedAt:h.updatedAt||now()
          };
        }),
        updatedAt:now()
      }
    }));
  }

  function showSuccess(tk){
    const note=document.getElementById('connectionNote');
    if(note){
      note.className='registration-notice good';
      note.textContent=`${tk} holding metadata synchronised with AuroraData 2.`;
    }
    const toast=document.getElementById('toast');
    if(toast){
      toast.textContent=`${tk} holding metadata repaired.`;
      toast.style.opacity='1';
      clearTimeout(w.__a2HoldingEnrichToast);
      w.__a2HoldingEnrichToast=setTimeout(()=>toast.style.opacity='0',2200);
    }
  }

  async function scan(){
    if(running)return;
    if(!A()?.core?.read||!A()?.core?.update||!D()?.post||!D()?.config)return;

    const cfg=D().config();
    if(!cfg.endpoint||!cfg.token)return;

    const state=A().core.read();
    const rows=arr(state.squad?.holdings).filter(missingMetadata);
    if(!rows.length)return;

    running=true;
    try{
      for(const h of rows){
        const m=metadataFor(state,h);
        // UKW also has a backend official-source fallback in Code.gs v0.5.2,
        // so allow it through even if the browser has lost its Scouting target.
        if(!hasUsefulMetadata(m) && ticker(h.ticker)!=='UKW')continue;

        const sig=signature(h,m);
        const last=attempted.get(sig)||0;
        if(Date.now()-last<60000)continue;
        attempted.set(sig,Date.now());

        try{
          const res=await D().post('enrichHolding',{
            account:accountCode(h.account),
            ticker:ticker(h.ticker),
            metadata:m
          });
          if(res?.ok&&res?.holding){
            updateLocalHolding(res.holding);
            if(res.changed)showSuccess(ticker(h.ticker));
          }
        }catch(err){
          console.warn('Aurora holding enrichment failed',ticker(h.ticker),err);
        }
      }
    }finally{
      running=false;
    }
  }

  function schedule(){
    clearTimeout(timer);
    timer=setTimeout(scan,350);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',schedule,{once:true});
  }else{
    schedule();
  }
  w.addEventListener('aurora2:state',schedule);
})(window);
