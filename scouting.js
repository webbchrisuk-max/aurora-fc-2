(function(w){
  'use strict';

  const A=()=>w.Aurora2;
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,num(v)));
  const esc=v=>A().ui.escape(v);
  const money=v=>A().ui.money(Number(v)||0);
  const now=()=>new Date().toISOString();
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  const LEGACY_DECISION_KEY='aurora_trading_brain_decision_v1';
  const LEGACY_PLAN_KEY='aurora_transfer_plan_v2';

  /*
   * Aurora 2 Global Scouting Network
   * ---------------------------------
   * The broad universe is monitoring evidence only.
   * Only state.scouting.targets is eligible to become an approved Transfer shortlist.
   * This preserves the Aurora 2 department boundary:
   * Global Network -> Active Scouting -> Approved Shortlist -> Transfer.
   */
  const NETWORK_URLS=[
    'https://webbchrisuk-max.github.io/aurora-city-fc/AuroraMaster.json',
    'https://raw.githubusercontent.com/webbchrisuk-max/aurora-city-fc/main/AuroraMaster.json'
  ];
  const NETWORK_SYNC_MS=6*60*60*1000;
  const NETWORK_RENDER_LIMIT=120;
  const AUTO_BENCH_TOTAL=12;
  const AUTO_BENCH_MIN_STRENGTH=60;
  const AUTO_BENCH_MAX_YIELD=12;

  const SUSTAINABLE_WEIGHTS={
    dividendSafety:25,incomeScore:20,valuationScore:20,
    portfolioFit:15,dividendGrowth:10,businessQuality:10
  };
  const MAXIMUM_WEIGHTS={
    incomeScore:45,dividendSafety:20,valuationScore:10,
    portfolioFit:10,dividendGrowth:5,businessQuality:10
  };

  function toast(msg){
    const el=$('toast');if(!el)return;
    el.textContent=msg;el.style.opacity='1';
    clearTimeout(w.__a2ScoutToast);
    w.__a2ScoutToast=setTimeout(()=>el.style.opacity='0',2300);
  }
  function set(id,v){const el=$(id);if(el)el.textContent=v}
  function setValue(id,v){const el=$(id);if(el)el.value=v??''}
  function readJson(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}}
  function accountCode(v){
    const s=norm(v);
    if(/212/.test(s))return 'T212';
    if(/\big\b|ig isa/.test(s))return 'IG';
    return 'CHECK';
  }
  function accountLabel(v){
    const c=accountCode(v);
    return c==='IG'?'IG ISA':c==='T212'?'Trading 212 ISA':'Platform check';
  }
  function field(o,keys){
    for(const k of keys){if(o&&o[k]!=null&&o[k]!=='')return o[k]}
    return null;
  }
  function yieldPctFrom(v){
    const raw=String(v??'').trim();
    let y=num(raw);
    if(y>0&&y<=1&&!raw.includes('%'))y*=100;
    return Math.max(0,y);
  }
  function deriveNetworkYield(row){
    const explicit=yieldPctFrom(field(row,[
      'yield_pct','dividend_yield','yieldPct','yield','forward_yield','forwardYield'
    ]));
    if(explicit>0)return {yieldPct:explicit,source:'reported'};

    // Same-currency annual DPS ÷ current price. Currency cancels, so no FX is needed.
    const annualDps=Math.max(0,num(field(row,[
      'annual_dps','annualDps','annual_dividend_per_share','annualDividendPerShare',
      'forward_dps','forwardDps'
    ])));
    const livePrice=Math.max(0,num(field(row,[
      'live_price','livePrice','price','current_price','currentPrice','live_price_native'
    ])));
    if(annualDps>0&&livePrice>0){
      const derived=(annualDps/livePrice)*100;
      if(Number.isFinite(derived)&&derived>0&&derived<100){
        return {yieldPct:derived,source:'DPS ÷ price',annualDps,livePrice};
      }
    }

    // Aurora 1 sometimes stores expected annual income from a £500 test investment.
    const income500=Math.max(0,num(field(row,[
      'income_from_500','incomeFrom500','annual_income_from_500'
    ])));
    if(income500>0){
      const derived=(income500/500)*100;
      if(Number.isFinite(derived)&&derived>0&&derived<100){
        return {yieldPct:derived,source:'£500 income',income500};
      }
    }

    return {yieldPct:0,source:'missing'};
  }
  function cleanMarketSymbol(v){
    return String(v||'').trim().toUpperCase().replace(/\s+/g,'');
  }
  function displayTicker(v){
    return cleanMarketSymbol(v).replace(/^LON:/,'').replace(/\.L$/,'');
  }
  function activeTicker(v){
    const s=displayTicker(v);
    // Aurora core v9 stores a base ticker. Keep the full exchange symbol separately
    // in scouting.activeMeta so foreign symbols are never lost.
    if(/^[A-Z0-9-]+\.[A-Z]{1,4}$/.test(s))return s.split('.')[0];
    return s;
  }

  function scoutingLocked(state=A().core.read()){
    return !!state.transfer?.route?.locked ||
      ['LOCKED','PARTIALLY_REGISTERED','COMPLETE'].includes(String(state.mission?.status||''));
  }

  function incomeScoreFromYield(y){
    y=Math.max(0,num(y));
    if(y<=0)return 0;
    if(y<=2)return clamp(35+y*12.5);
    if(y<=6)return clamp(60+(y-2)*8);
    if(y<=8)return clamp(92+(y-6)*4);
    if(y<=10)return clamp(100-(y-8)*5);
    return clamp(90-(y-10)*10,35,90);
  }

  function autoPortfolioFit(target,state){
    const holdings=arr(state.squad?.holdings).filter(h=>
      h&&h.status!=='SOLD'&&h.status!=='ARCHIVED'&&num(h.shares)>0
    );
    const total=holdings.reduce((s,h)=>
      s+Math.max(0,num(h.marketValueGbp)||num(h.shares)*num(h.livePriceGbp)),0
    );
    if(total<=0)return 70;

    const ticker=String(target.ticker||'').toUpperCase();
    const sector=norm(target.sector);
    const tickerValue=holdings
      .filter(h=>String(h.ticker||'').toUpperCase()===ticker)
      .reduce((s,h)=>s+Math.max(0,num(h.marketValueGbp)||num(h.shares)*num(h.livePriceGbp)),0);
    const sectorValue=sector
      ? holdings.filter(h=>norm(h.sector)===sector)
        .reduce((s,h)=>s+Math.max(0,num(h.marketValueGbp)||num(h.shares)*num(h.livePriceGbp)),0)
      : 0;

    const tickerWeight=tickerValue/total*100;
    const sectorWeight=sectorValue/total*100;
    let score=88;
    if(tickerWeight>0)score-=Math.min(48,tickerWeight*2.6);
    if(sector&&sectorWeight>25)score-=Math.min(25,(sectorWeight-25)*1.15);
    if(tickerWeight<2)score+=4;
    return Math.round(clamp(score,25,95));
  }

  function confidenceFor(t){
    const explicit=clamp(t.confidence||t.dataQuality);
    if(explicit>0)return explicit;
    const fields=['dividendSafety','valuationScore','dividendGrowth','businessQuality']
      .filter(k=>num(t[k])>0).length;
    const extra=(num(t.yieldPct)>0?1:0)+(num(t.livePriceGbp)>0?1:0);
    return Math.round(clamp(((fields+extra)/6)*100,35,100));
  }

  function scoreWithWeights(parts,weights,dataQuality){
    const raw=Object.entries(weights)
      .reduce((s,[k,wgt])=>s+clamp(parts[k])*(wgt/100),0);
    return Math.round(clamp(raw*(.72+clamp(dataQuality)*.0028)));
  }

  function recommendation(status,score){
    if(status==='block')return 'BLOCK';
    if(status==='caution')return 'CAUTION';
    if(score>=80)return 'STRONG BUY';
    if(score>=70)return 'BUY';
    return 'WATCH';
  }

  function assessTarget(raw,state=A().core.read()){
    const t={...raw};
    const legacy=/AURORA1/i.test(String(t.source||''));
    const yieldPct=yieldPctFrom(t.yieldPct);
    const livePriceGbp=Math.max(0,num(t.livePriceGbp));
    const confidence=confidenceFor(t);
    const dividendSafety=num(t.dividendSafety)>0?clamp(t.dividendSafety):55;
    const incomeScore=num(t.incomeScore)>0?clamp(t.incomeScore):incomeScoreFromYield(yieldPct);
    const valuationScore=num(t.valuationScore)>0?clamp(t.valuationScore):55;
    const portfolioFit=num(t.portfolioFit)>0?clamp(t.portfolioFit):autoPortfolioFit(t,state);
    const dividendGrowth=num(t.dividendGrowth)>0?clamp(t.dividendGrowth):50;
    const businessQuality=num(t.businessQuality)>0?clamp(t.businessQuality):55;

    const parts={dividendSafety,incomeScore,valuationScore,portfolioFit,dividendGrowth,businessQuality};
    const sustainableScore=scoreWithWeights(parts,SUSTAINABLE_WEIGHTS,confidence);
    const maximumScore=scoreWithWeights(parts,MAXIMUM_WEIGHTS,confidence);

    const reasons=[];
    let status='pass';
    const ticker=String(t.ticker||'').replace(/\..*$/,'').toUpperCase();

    if(t.requiresRefresh){
      status='block';
      reasons.push('Global-network promotion needs Aurora 2 evidence review before it can reach Transfer.');
    }
    if(ticker==='TSCO'){
      status='block';
      reasons.push('TSCO is a locked legacy / 2029 holding and is excluded from active buys.');
    }
    if(!(yieldPct>0)){
      status='block';
      reasons.push('Recurring dividend yield is missing.');
    }
    if(!(livePriceGbp>0)){
      if(legacy&&status!=='block'){
        status='caution';
        reasons.push('Live price is not present in the migrated Aurora 1 evidence; refresh before execution.');
      }else if(!legacy){
        status='block';
        reasons.push('Live price is missing.');
      }
    }
    const dividendStatus=String(t.dividendStatus||'').toLowerCase();
    const payoutRisk=String(t.payoutRisk||'').toLowerCase();
    if(/suspend|cancel|omit/.test(dividendStatus)){
      status='block';reasons.push('Dividend is suspended or cancelled.');
    }
    if(payoutRisk.includes('very high')){
      status='block';reasons.push('Payout risk is very high.');
    }
    if(dividendSafety<35){
      status='block';reasons.push('Dividend-safety score is below the purchase gate.');
    }
    if(confidence<50){
      status='block';reasons.push('Data confidence is below the purchase gate.');
    }
    if(status!=='block'&&
       (dividendSafety<60||confidence<75||yieldPct>10||accountCode(t.preferredAccount)==='CHECK')){
      status='caution';
      if(dividendSafety<60)reasons.push('Dividend safety is below the clean-pass threshold.');
      if(confidence<75)reasons.push('Data confidence needs review.');
      if(yieldPct>10)reasons.push('Yield is above 10% and requires controlled sizing.');
      if(accountCode(t.preferredAccount)==='CHECK')reasons.push('Preferred broker still needs confirmation.');
    }
    if(!reasons.length)reasons.push('Clears the sustainable-income eligibility gates.');

    const activeScore=(state.scouting?.strategy||'sustainable')==='maximum'
      ?maximumScore:sustainableScore;
    const rec=recommendation(status,activeScore);
    const reason=`${rec} • Sustainable ${sustainableScore}/100 • Maximum ${maximumScore}/100 • `+
      `${yieldPct>0?yieldPct.toFixed(2)+'% yield • ':''}${reasons.join(' ')}`;

    return {
      ...t,
      ticker,
      name:String(t.name||ticker||'Target'),
      preferredAccount:accountCode(t.preferredAccount),
      sector:String(t.sector||''),
      yieldPct:Number(yieldPct.toFixed(4)),
      livePriceGbp:Number(livePriceGbp.toFixed(6)),
      confidence,
      dataQuality:confidence,
      dividendSafety,
      incomeScore,
      valuationScore,
      portfolioFit,
      dividendGrowth,
      businessQuality,
      sustainableScore,
      maximumScore,
      status,
      recommendation:rec,
      eligibilityReasons:reasons,
      reason,
      source:String(t.source||'AURORA2_SCOUTING'),
      lastAssessedAt:now(),
      updatedAt:now()
    };
  }

  function rankTargets(targets,state=A().core.read()){
    const assessed=arr(targets).map(t=>assessTarget(t,state));
    const sustainable=[...assessed].sort((a,b)=>{
      if(a.status==='block'&&b.status!=='block')return 1;
      if(b.status==='block'&&a.status!=='block')return -1;
      return b.sustainableScore-a.sustainableScore||
        b.confidence-a.confidence||b.yieldPct-a.yieldPct;
    });
    sustainable.forEach((t,i)=>t.rank=i+1);
    const maxOrder=[...assessed].sort((a,b)=>{
      if(a.status==='block'&&b.status!=='block')return 1;
      if(b.status==='block'&&a.status!=='block')return -1;
      return b.maximumScore-a.maximumScore||
        b.yieldPct-a.yieldPct||b.confidence-a.confidence;
    });
    const maxRank=new Map(maxOrder.map((t,i)=>[t.id||t.ticker,i+1]));
    sustainable.forEach(t=>t.maximumRank=maxRank.get(t.id||t.ticker)||0);
    return sustainable;
  }

  function invalidateApproval(mutator){
    const state=A().core.read();
    if(scoutingLocked(state)){
      toast('Unlock the Transfer route before changing Active Scouting.');
      return false;
    }
    A().core.update(s=>{
      const next=mutator(s);
      const m=next.mission;
      const route=next.transfer?.route;
      return {
        ...next,
        scouting:{...next.scouting,status:'SCOUTING_REVIEW',updatedAt:now()},
        mission:m,
        transfer:{
          ...next.transfer,
          route:route?.locked?route:null,
          updatedAt:route&&!route.locked?now():next.transfer?.updatedAt
        }
      };
    });
    return true;
  }

  function runScouting(){
    if(!invalidateApproval(s=>{
      const ranked=rankTargets(s.scouting?.targets||[],s);
      return {
        ...s,
        scouting:{...s.scouting,targets:ranked,source:'AURORA2_SCOUTING',updatedAt:now()}
      };
    }))return;
    toast('Active Scouting scores recalculated. Approve the shortlist when ready.');
  }

  function approveShortlist(){
    const state=A().core.read();
    if(scoutingLocked(state)){
      toast('Transfer is already locked. Unlock it before changing the approved shortlist.');
      return;
    }
    const ranked=rankTargets(state.scouting?.targets||[],state);
    const eligible=ranked.filter(t=>t.status!=='block');
    if(!eligible.length){
      toast('No permitted target clears the Scouting gates.');
      return;
    }
    const top=eligible[0];
    const history={
      id:A().core.uid('SCOUT'),
      approvedAt:now(),
      missionId:state.mission?.id||null,
      count:eligible.length,
      blocked:ranked.filter(t=>t.status==='block').length,
      topTicker:top.ticker,
      topScore:top.sustainableScore,
      source:'AURORA2_SCOUTING'
    };
    A().core.update(s=>({
      ...s,
      scouting:{
        ...s.scouting,status:'SCOUTING_READY',targets:ranked,
        source:'AURORA2_SCOUTING',
        importedFromLegacy:s.scouting?.importedFromLegacy||false,
        decisionHistory:[history,...arr(s.scouting?.decisionHistory)].slice(0,20),
        updatedAt:now()
      },
      mission:s.mission,
      portfolio:{...s.portfolio,topAuroraPlayer:top.ticker},
      decision:{
        title:`Scouting recommends ${top.ticker}`,
        note:`${top.recommendation} • Sustainable ${top.sustainableScore}/100 • `+
          `Maximum ${top.maximumScore}/100 • ${top.yieldPct.toFixed(2)}% yield.`,
        ticker:top.ticker,confidence:top.confidence
      },
      alerts:[
        {
          id:A().core.uid('ALERT'),
          title:'Scouting shortlist approved',
          note:`${eligible.length} permitted target${eligible.length===1?'':'s'} • `+
            `${top.ticker} ranked #1.`,
          when:'now'
        },
        ...arr(s.alerts).filter(a=>a?.title!=='Scouting shortlist approved')
      ].slice(0,8)
    }));
    toast(`${eligible.length} Scouting target${eligible.length===1?'':'s'} approved for Transfer.`);
  }

  function editorNumber(id){
    const el=$(id);
    if(!el||String(el.value).trim()==='')return 0;
    return clamp(el.value);
  }

  function saveCandidate(){
    const state=A().core.read();
    if(scoutingLocked(state)){
      toast('Unlock Transfer before editing Active Scouting.');
      return;
    }
    const ticker=String($('editTicker')?.value||'')
      .replace(/\..*$/,'').toUpperCase().trim();
    if(!ticker){
      toast('Enter a ticker.');
      return;
    }
    const id=$('editId')?.value||A().core.uid('TARGET');
    const existing=arr(state.scouting?.targets).find(t=>t.id===id);

    const candidateEvidence={
      confidence:editorNumber('editConfidence'),
      dividendSafety:editorNumber('editSafety'),
      valuationScore:editorNumber('editValuation'),
      dividendGrowth:editorNumber('editGrowth'),
      businessQuality:editorNumber('editQuality'),
      livePriceGbp:Math.max(0,num($('editLivePrice')?.value)),
      yieldPct:Math.max(0,num($('editYield')?.value))
    };
    const evidenceReady=
      candidateEvidence.confidence>=50&&candidateEvidence.dividendSafety>0&&
      candidateEvidence.valuationScore>0&&candidateEvidence.dividendGrowth>0&&
      candidateEvidence.businessQuality>0&&candidateEvidence.livePriceGbp>0&&
      candidateEvidence.yieldPct>0;

    const target={
      ...existing,
      id,ticker,
      name:String($('editName')?.value||ticker).trim(),
      preferredAccount:accountCode($('editAccount')?.value),
      sector:String($('editSector')?.value||'').trim(),
      ...candidateEvidence,
      incomeScore:editorNumber('editIncome'),
      portfolioFit:editorNumber('editFit'),
      dividendStatus:String($('editDividendStatus')?.value||'').trim(),
      payoutRisk:String($('editPayoutRisk')?.value||'').trim(),
      requiresRefresh:existing?.requiresRefresh?!evidenceReady:false,
      autoManaged:false,
      autoPriority:0,
      source:isAutoManagedTarget(existing,state)?'AURORA2_MANUAL_OVERRIDE':existing?.source||'AURORA2_MANUAL',
      createdAt:existing?.createdAt||now(),
      updatedAt:now()
    };

    const assessed=assessTarget(target,state);
    if(!invalidateApproval(s=>{
      const rows=arr(s.scouting?.targets);
      const next=rows.some(t=>t.id===id)
        ?rows.map(t=>t.id===id?assessed:t)
        :[...rows,assessed];
      const autoBench={...obj(s.scouting?.autoBench)};
      autoBench.autoIds=arr(autoBench.autoIds).map(String).filter(x=>x!==String(id));
      return {
        ...s,
        scouting:{
          ...s.scouting,targets:rankTargets(next,s),
          autoBench,
          source:'AURORA2_SCOUTING',updatedAt:now()
        }
      };
    }))return;
    resetEditor();
    toast(`${ticker} saved and scored.`);
  }

  function editCandidate(id){
    const state=A().core.read();
    const t=arr(state.scouting?.targets).find(x=>x.id===id);
    if(!t)return;
    setValue('editId',t.id);setValue('editTicker',t.ticker);setValue('editName',t.name);
    setValue('editAccount',accountCode(t.preferredAccount));setValue('editSector',t.sector);
    setValue('editLivePrice',t.livePriceGbp||'');setValue('editYield',t.yieldPct||'');
    setValue('editConfidence',t.confidence||'');setValue('editSafety',t.dividendSafety||'');
    setValue('editIncome',t.incomeScore||'');setValue('editValuation',t.valuationScore||'');
    setValue('editFit',t.portfolioFit||'');setValue('editGrowth',t.dividendGrowth||'');
    setValue('editQuality',t.businessQuality||'');setValue('editDividendStatus',t.dividendStatus||'');
    setValue('editPayoutRisk',t.payoutRisk||'');set('editorMode',`EDIT ${t.ticker}`);
    const meta=obj(state.scouting?.activeMeta)[t.id]||{};
    const status=$('editorStatus');
    if(status){
      status.textContent=t.requiresRefresh
        ?`${t.ticker} was promoted from the Global Network${meta.marketSymbol?' • '+meta.marketSymbol:''}. `+
          `Review the Aurora 2 evidence fields before it can reach Transfer.`
        :'Missing evidence is not silently invented. It lowers confidence or blocks a new candidate where appropriate.';
    }
    $('editTicker')?.focus();
  }

  function deleteCandidate(id){
    const t=arr(A().core.read().scouting?.targets).find(x=>x.id===id);
    if(!t)return;
    if(!confirm(`Remove ${t.ticker} from Active Scouting?`))return;
    if(!invalidateApproval(s=>{
      const meta={...obj(s.scouting?.activeMeta)};
      delete meta[id];
      const autoBench={...obj(s.scouting?.autoBench)};
      autoBench.autoIds=arr(autoBench.autoIds).map(String).filter(x=>x!==String(id));
      return {
        ...s,
        scouting:{
          ...s.scouting,
          targets:arr(s.scouting?.targets).filter(x=>x.id!==id),
          activeMeta:meta,autoBench,updatedAt:now()
        }
      };
    }))return;
    resetEditor();
    toast(`${t.ticker} removed from Active Scouting.`);
  }

  function resetEditor(){
    ['editId','editTicker','editName','editSector','editLivePrice','editYield',
     'editIncome','editFit','editDividendStatus','editPayoutRisk']
      .forEach(id=>setValue(id,''));
    setValue('editAccount','CHECK');setValue('editConfidence','75');
    setValue('editSafety','60');setValue('editValuation','55');
    setValue('editGrowth','50');setValue('editQuality','55');
    set('editorMode','NEW CANDIDATE');
    const status=$('editorStatus');
    if(status)status.textContent=
      'Missing evidence is not silently invented. It lowers confidence or blocks a new candidate where appropriate.';
  }

  function collectPlanTargets(plan){
    for(const key of ['targets','purchases','allocations','items','deals']){
      const rows=arr(plan?.[key]);
      if(rows.length)return rows.map(x=>x.row||x.target||x).filter(Boolean);
    }
    return [];
  }

  function scanLegacy(){
    const decision=readJson(LEGACY_DECISION_KEY),plan=readJson(LEGACY_PLAN_KEY);
    let rows=arr(decision?.targets),source=LEGACY_DECISION_KEY,stale=!!decision?.isStale;
    if(!rows.length){
      rows=collectPlanTargets(plan);source=LEGACY_PLAN_KEY;stale=false;
    }
    const targets=[],seen=new Set();
    rows.forEach(raw=>{
      const ticker=String(field(raw,['ticker','symbol','code','Ticker'])||'')
        .replace(/\..*$/,'').toUpperCase().trim();
      if(!ticker||seen.has(ticker))return;
      seen.add(ticker);
      const sustainable=obj(raw.sustainable);
      targets.push({
        id:`A1-SCOUT-${ticker}`,ticker,
        name:String(field(raw,['name','company','companyName','securityName'])||ticker),
        preferredAccount:accountCode(field(raw,['preferredAccount','account','platform','broker'])||'CHECK'),
        sector:String(field(raw,['sector','industry'])||''),
        livePriceGbp:Math.max(0,num(field(raw,['livePriceGbp','live','livePrice','price','currentPrice']))),
        yieldPct:yieldPctFrom(field(raw,['yieldPct','dividendYield','yield','incomeRate','forwardYield','dividend_yield'])),
        confidence:clamp(field(raw,['confidence','dataConfidence','dataScore'])||
          field(raw,['dataQualityScore'])||sustainable.dataQuality||75),
        dividendSafety:clamp(field(raw,['dividendSafety','dividendSafetyScore','dividend_safety'])||
          sustainable.dividendSafety||0),
        incomeScore:clamp(field(raw,['incomeScore'])||sustainable.income||0),
        valuationScore:clamp(field(raw,['valuationScore','valuation'])||sustainable.valuation||0),
        portfolioFit:clamp(field(raw,['portfolioFit','diversificationScore'])||
          sustainable.portfolioFit||0),
        dividendGrowth:clamp(field(raw,['dividendGrowth','dividendGrowthScore'])||
          sustainable.dividendGrowth||0),
        businessQuality:clamp(field(raw,['businessQuality','qualityScore'])||
          sustainable.businessQuality||0),
        dividendStatus:String(field(raw,['dividend_status','distribution_status','dividend_action'])||''),
        payoutRisk:String(field(raw,['payout_risk','risk'])||''),
        source:'AURORA1_SCOUTING',
        sourceUpdatedAt:decision?.updatedAt||plan?.updatedAt||null,
        createdAt:now(),updatedAt:now()
      });
    });
    return {targets,source,stale};
  }

  function importLegacy(){
    const state=A().core.read();
    if(scoutingLocked(state)){
      toast('Unlock Transfer before importing Active Scouting evidence.');
      return;
    }
    const scan=scanLegacy();
    if(!scan.targets.length){
      toast('No Aurora 1 shortlist found in this browser.');
      return;
    }
    if(!invalidateApproval(s=>{
      const byTicker=new Map(arr(s.scouting?.targets)
        .map(t=>[String(t.ticker).toUpperCase(),t]));
      scan.targets.forEach(t=>{if(!byTicker.has(t.ticker))byTicker.set(t.ticker,t)});
      const ranked=rankTargets([...byTicker.values()],s);
      return {
        ...s,
        scouting:{
          ...s.scouting,targets:ranked,importedFromLegacy:true,
          source:'AURORA2_SCOUTING',updatedAt:now()
        }
      };
    }))return;
    toast(`${scan.targets.length} Aurora 1 candidate${scan.targets.length===1?'':'s'} imported for review.`);
  }

  /* ========================= GLOBAL NETWORK ========================= */

  function regionFor(row,symbol){
    const text=norm([
      field(row,['country','market','exchange','region','benchmark']),
      symbol
    ].filter(Boolean).join(' '));

    if(/\b(uk|united kingdom|lse|london|ftse)\b/.test(text)||
       /^LON:/.test(symbol)||/\.L$/.test(symbol))return 'UK';

    if(/\b(usa|united states|us|nasdaq|nyse|amex)\b/.test(text))return 'US';

    return 'WORLD';
  }

  function evidenceCount(row){
    const keys=[
      ['buy_strength','buyStrength'],
      ['promotion_impact_score','impact','promotionImpactScore'],
      ['dividend_yield','yield_pct','yieldPct'],
      ['annual_dps','annualDps','forward_dps','forwardDps'],
      ['income_from_500','incomeFrom500'],
      ['live_price_gbp','livePriceGbp','live_price','livePrice'],
      ['valuation_score','valuationScore'],
      ['payout_score','dividend_safety','dividendSafety'],
      ['growth_score','dividend_growth_5y','dividendGrowth'],
      ['payout_risk','payoutRisk'],
      ['sector'],['country','market'],['currency']
    ];
    return keys.reduce((n,group)=>n+(field(row,group)!=null?1:0),0);
  }

  function likelyScoutingRow(row,path){
    if(!row||typeof row!=='object'||Array.isArray(row))return false;
    if(/holding|transaction|dividend|bill|pot|finance|route|mission|house|account|payment/i.test(path))return false;

    let symbol=cleanMarketSymbol(field(row,['ticker','symbol','code','Ticker']));
    let name=String(field(row,['company_name','name','company','companyName','security_name'])||'').trim();
    if(symbol.replace(/[^A-Z]/gi,'').toUpperCase()==='RETURNEDWATCHLIST'){
      // Aurora 1 exported some returned-watchlist rows shifted one column:
      // company_name contains the real ticker; scout_status contains the company name.
      symbol=cleanMarketSymbol(field(row,['company_name','symbol','code']));
      name=String(field(row,['scout_status','name','company'])||symbol).trim();
    }
    if(!symbol||!name)return false;

    const scoutingPath=/scout|watch|trial|candidate|global|intelligence/i.test(path);
    const scoutingFields=[
      'buy_strength','scout_status','scout_rating','promotion_impact_score',
      'trial_status','trial_rank','trial_verdict','watchlist_status',
      'yield_score','payout_score','growth_score','role_score'
    ].some(k=>row[k]!=null&&row[k]!=='');
    return scoutingPath||scoutingFields;
  }

  function normalizeNetworkRow(row,path,sourceGeneratedAt){
    let rawSymbol=cleanMarketSymbol(field(row,['ticker','symbol','code','Ticker']));
    let name=String(field(row,['company_name','name','company','companyName','security_name'])||
      displayTicker(rawSymbol)).trim();
    if(rawSymbol.replace(/[^A-Z]/gi,'').toUpperCase()==='RETURNEDWATCHLIST'){
      rawSymbol=cleanMarketSymbol(field(row,['company_name','symbol','code']));
      name=String(field(row,['scout_status','name','company'])||displayTicker(rawSymbol)).trim();
    }
    if(!rawSymbol||!name)return null;

    const region=regionFor(row,rawSymbol);
    const currency=String(field(row,['currency','currency_code'])||
      (region==='UK'?'GBP':region==='US'?'USD':'')).toUpperCase();
    const liveGbpRaw=field(row,['live_price_gbp','livePriceGbp']);
    const liveNative=field(row,['live_price','livePrice','price','live_price_native']);
    const livePriceGbp=Math.max(0,num(liveGbpRaw!=null?liveGbpRaw:(currency==='GBP'?liveNative:0)));
    const yieldEvidence=deriveNetworkYield(row);
    const y=yieldEvidence.yieldPct;
    const annualDps=Math.max(0,num(field(row,[
      'annual_dps','annualDps','annual_dividend_per_share','annualDividendPerShare',
      'forward_dps','forwardDps'
    ])));
    const incomeFrom500=Math.max(0,num(field(row,[
      'income_from_500','incomeFrom500','annual_income_from_500'
    ])));
    const strength=Math.max(0,num(field(row,['buy_strength','buyStrength'])));
    const impact=Math.max(0,num(field(row,['promotion_impact_score','promotionImpactScore','impact'])));
    const val=Math.max(0,num(field(row,['valuation_score','valuationScore'])));
    const payoutScore=Math.max(0,num(field(row,['payout_score','dividend_safety','dividendSafety'])));
    const growthScore=Math.max(0,num(field(row,['growth_score','dividendGrowthScore'])));
    const checked=String(field(row,['date_checked','last_updated','updated_at','updatedAt'])||sourceGeneratedAt||'');
    const symbolKey=displayTicker(rawSymbol).replace(/\.(L|LON)$/i,'').toUpperCase();
    const id=`NET-${region}-${symbolKey.replace(/[^A-Z0-9]+/g,'-')}`;

    return {
      id,
      marketSymbol:rawSymbol,
      ticker:displayTicker(rawSymbol),
      name,
      region,
      country:String(field(row,['country','market'])||'').trim(),
      exchange:String(field(row,['exchange','market'])||'').trim(),
      currency,
      sector:String(field(row,['sector','industry'])||'').trim(),
      role:String(field(row,['role','squad_role','chemistry_role'])||'').trim(),
      sourceStatus:String(field(row,['scout_status','watchlist_status','trial_status','status'])||'MONITOR'),
      legacyStrength:strength,
      legacyImpact:impact,
      legacyYieldPct:Number(y.toFixed(4)),
      legacyYieldSource:yieldEvidence.source,
      legacyAnnualDps:Number(annualDps.toFixed(8)),
      legacyIncomeFrom500:Number(incomeFrom500.toFixed(6)),
      legacyPriceNative:Number(Math.max(0,num(liveNative)).toFixed(8)),
      legacyPriceGbp:Number(livePriceGbp.toFixed(6)),
      legacyValuation:String(field(row,['valuation_status','valuation'])||'').trim(),
      legacyValuationScore:val,
      legacyPayoutScore:payoutScore,
      legacyGrowthScore:growthScore,
      legacyPayoutRisk:String(field(row,['payout_risk','payoutRisk','chemistry_risk'])||'').trim(),
      legacyVerdict:String(field(row,['trial_verdict','manager_note','notes'])||'').trim(),
      legacyCheckedAt:checked,
      evidenceCount:evidenceCount(row),
      sourcePath:path,
      source:'AURORA1_GLOBAL_NETWORK',
      sourceUpdatedAt:sourceGeneratedAt||null,
      updatedAt:now()
    };
  }

  function collectNetworkRows(master){
    const found=[];
    const sourceGeneratedAt=String(master?.meta?.generated_at||master?.meta?.updated_at||'');
    const seenObjects=new Set();

    function walk(value,path,depth){
      if(depth>5||value==null)return;
      if(Array.isArray(value)){
        value.forEach((item,i)=>{
          if(likelyScoutingRow(item,path)){
            const n=normalizeNetworkRow(item,path,sourceGeneratedAt);
            if(n)found.push(n);
          }else if(item&&typeof item==='object'){
            walk(item,`${path}[${i}]`,depth+1);
          }
        });
        return;
      }
      if(typeof value!=='object')return;
      if(seenObjects.has(value))return;
      seenObjects.add(value);
      Object.entries(value).forEach(([k,v])=>{
        if(k==='meta')return;
        walk(v,path?`${path}.${k}`:k,depth+1);
      });
    }
    walk(master,'',0);

    const best=new Map();
    found.forEach(r=>{
      const key=`${r.region}|${displayTicker(r.marketSymbol).toUpperCase()}`;
      const prior=best.get(key);
      if(!prior){
        best.set(key,r);
        return;
      }

      const rWins=
        r.evidenceCount>prior.evidenceCount||
        (r.evidenceCount===prior.evidenceCount&&r.legacyStrength>prior.legacyStrength);
      const base=rWins?{...r}:{...prior};
      const other=rWins?prior:r;

      const fill=(k)=>{
        const v=base[k],ov=other[k];
        const missing=v==null||v===''||(typeof v==='number'&&!(v>0));
        if(missing&&ov!=null&&ov!==''&&(typeof ov!=='number'||ov>0))base[k]=ov;
      };
      [
        'legacyYieldPct','legacyYieldSource','legacyAnnualDps','legacyIncomeFrom500',
        'legacyPriceNative','legacyPriceGbp','legacyValuation','legacyValuationScore',
        'legacyPayoutScore','legacyGrowthScore','legacyPayoutRisk','sector','role',
        'country','exchange','currency','legacyVerdict','legacyCheckedAt'
      ].forEach(fill);

      // Re-derive after merging if the strongest row was missing yield.
      if(!(base.legacyYieldPct>0)){
        if(base.legacyAnnualDps>0&&base.legacyPriceNative>0){
          const y=(base.legacyAnnualDps/base.legacyPriceNative)*100;
          if(Number.isFinite(y)&&y>0&&y<100){
            base.legacyYieldPct=Number(y.toFixed(4));
            base.legacyYieldSource='DPS ÷ price';
          }
        }else if(base.legacyIncomeFrom500>0){
          const y=(base.legacyIncomeFrom500/500)*100;
          if(Number.isFinite(y)&&y>0&&y<100){
            base.legacyYieldPct=Number(y.toFixed(4));
            base.legacyYieldSource='£500 income';
          }
        }
      }

      base.evidenceCount=Math.max(prior.evidenceCount,r.evidenceCount);
      best.set(key,base);
    });

    return [...best.values()].sort((a,b)=>
      b.legacyStrength-a.legacyStrength||
      b.legacyImpact-a.legacyImpact||
      b.evidenceCount-a.evidenceCount||
      b.legacyYieldPct-a.legacyYieldPct||
      a.ticker.localeCompare(b.ticker)
    );
  }

  function networkCounts(rows){
    return {
      total:rows.length,
      UK:rows.filter(r=>r.region==='UK').length,
      US:rows.filter(r=>r.region==='US').length,
      WORLD:rows.filter(r=>r.region==='WORLD').length
    };
  }

  async function fetchNetworkMaster(){
    let lastError=null;
    for(const url of NETWORK_URLS){
      try{
        const res=await fetch(`${url}${url.includes('?')?'&':'?'}v=${Date.now()}`,{
          cache:'no-store'
        });
        if(!res.ok)throw new Error(`HTTP ${res.status}`);
        const data=await res.json();
        return {data,url};
      }catch(err){
        lastError=err;
      }
    }
    throw lastError||new Error('Global scouting source unavailable.');
  }

  function autoBenchEnabled(state=A().core.read()){
    return state.scouting?.autoBench?.enabled!==false;
  }

  function isAutoManagedTarget(t,state=A().core.read()){
    if(!t)return false;
    if(t.autoManaged===true)return true;
    const source=String(t.source||'').toUpperCase();
    if(source==='AURORA1_GLOBAL_AUTO_BENCH')return true;
    const ids=new Set(arr(state.scouting?.autoBench?.autoIds).map(String));
    return ids.has(String(t.id||''));
  }

  function autoPromotionProfile(n){
    const y=Math.max(0,num(n.legacyYieldPct));
    const strength=Math.max(0,num(n.legacyStrength));
    const impact=Math.max(0,num(n.legacyImpact));
    const safety=Math.max(0,num(n.legacyPayoutScore));
    const valuation=Math.max(0,num(n.legacyValuationScore));
    const growth=Math.max(0,num(n.legacyGrowthScore));
    const evidence=Math.max(0,num(n.evidenceCount));
    const status=norm(n.sourceStatus);
    const risk=norm(n.legacyPayoutRisk);
    const tk=activeTicker(n.marketSymbol);

    const blockers=[];
    if(tk==='TSCO')blockers.push('locked legacy ticker');
    if(!(y>0))blockers.push('no dividend yield');
    if(y>AUTO_BENCH_MAX_YIELD)blockers.push('yield above auto-promotion ceiling');
    if(strength<AUTO_BENCH_MIN_STRENGTH)blockers.push('legacy scout strength below 60');
    if(evidence<3)blockers.push('thin evidence');
    if(/suspend|cancel|omit|avoid|sell/.test(status))blockers.push('negative source status');
    if(/very high|extreme/.test(risk))blockers.push('payout risk too high');

    const fundamentalSignals=[safety>0,valuation>0,growth>0,n.legacyPriceGbp>0||n.legacyPriceNative>0]
      .filter(Boolean).length;
    if(fundamentalSignals<1)blockers.push('no supporting fundamental/price evidence');

    const incomeFit=incomeScoreFromYield(y);
    const evidenceScore=clamp(evidence*12.5,0,100);
    const priority=
      strength*.38+
      impact*.20+
      incomeFit*.12+
      (safety||55)*.10+
      (valuation||55)*.08+
      (growth||50)*.05+
      evidenceScore*.07;

    return {
      eligible:blockers.length===0,
      blockers,
      priority:Number(priority.toFixed(3)),
      strength,impact,yieldPct:y,safety,valuation,growth,evidence
    };
  }

  function autoCandidateFromNetwork(n){
    const p=autoPromotionProfile(n);
    const safety=p.safety>0?clamp(p.safety):55;
    const valuation=p.valuation>0?clamp(p.valuation):55;
    const growth=p.growth>0?clamp(p.growth):50;
    const explicitFields=[
      n.legacyPriceGbp>0,n.legacyYieldPct>0,p.safety>0,p.valuation>0,p.growth>0,
      p.evidence>=5
    ].filter(Boolean).length;
    const confidence=Math.round(clamp((explicitFields/6)*100,50,90));

    return {
      id:`AUTO-${n.id}`,
      ticker:activeTicker(n.marketSymbol),
      name:n.name,
      preferredAccount:'CHECK',
      sector:n.sector,
      livePriceGbp:n.legacyPriceGbp,
      yieldPct:n.legacyYieldPct,
      confidence,
      dividendSafety:safety,
      incomeScore:0,
      valuationScore:valuation,
      portfolioFit:0,
      dividendGrowth:growth,
      businessQuality:55,
      dividendStatus:'',
      payoutRisk:n.legacyPayoutRisk,
      requiresRefresh:false,
      autoManaged:true,
      autoPriority:p.priority,
      autoRegion:n.region,
      source:'AURORA1_GLOBAL_AUTO_BENCH',
      sourceUpdatedAt:n.sourceUpdatedAt||n.legacyCheckedAt||null,
      createdAt:now(),
      updatedAt:now()
    };
  }

  function selectAutoBench(state){
    const universe=arr(state.scouting?.universe);
    const manual=arr(state.scouting?.targets).filter(t=>!isAutoManagedTarget(t,state));
    const slots=Math.max(0,AUTO_BENCH_TOTAL-manual.length);

    const manualTickers=new Set(manual.map(t=>String(t.ticker||'').toUpperCase()));
    const qualified=universe
      .map(n=>({n,p:autoPromotionProfile(n)}))
      .filter(x=>x.p.eligible)
      .filter(x=>!manualTickers.has(activeTicker(x.n.marketSymbol).toUpperCase()))
      .sort((a,b)=>b.p.priority-a.p.priority||b.p.strength-a.p.strength||b.p.yieldPct-a.p.yieldPct);

    if(!slots)return {selected:[],qualified:qualified.length,slots,manual:manual.length};

    const picked=[],used=new Set();
    const take=(region,count)=>{
      for(const x of qualified){
        if(picked.length>=slots||count<=0)break;
        if(used.has(x.n.id)||x.n.region!==region)continue;
        picked.push(x);used.add(x.n.id);count--;
      }
    };

    if(slots>=6){
      take('US',Math.min(2,slots));
      take('WORLD',Math.min(1,Math.max(0,slots-picked.length)));
    }
    for(const x of qualified){
      if(picked.length>=slots)break;
      if(used.has(x.n.id))continue;
      picked.push(x);used.add(x.n.id);
    }

    return {
      selected:picked.map(x=>autoCandidateFromNetwork(x.n)),
      qualified:qualified.length,
      slots,
      manual:manual.length
    };
  }

  function autoBenchSignature(rows){
    return arr(rows).map(t=>[
      t.id,t.ticker,t.yieldPct,t.livePriceGbp,t.dividendSafety,t.valuationScore,
      t.dividendGrowth,t.confidence,t.source,t.sourceUpdatedAt
    ].join('|')).sort().join('||');
  }

  function rebalanceAutoBench({silent=false}={}){
    const state=A().core.read();
    if(!autoBenchEnabled(state)){
      if(!silent)toast('Auto Bench is paused.');
      return {changed:false,paused:true};
    }
    if(scoutingLocked(state)){
      if(!silent)toast('Auto Bench is frozen while Transfer is locked.');
      return {changed:false,locked:true};
    }
    const universe=arr(state.scouting?.universe);
    if(!universe.length){
      if(!silent)toast('Sync the Global Network before refreshing Auto Bench.');
      return {changed:false,empty:true};
    }

    const plan=selectAutoBench(state);
    const manual=arr(state.scouting?.targets).filter(t=>!isAutoManagedTarget(t,state));
    const currentAuto=arr(state.scouting?.targets).filter(t=>isAutoManagedTarget(t,state));
    const nextAuto=plan.selected.map(t=>assessTarget(t,state));
    const changed=autoBenchSignature(currentAuto)!==autoBenchSignature(nextAuto);

    if(!changed){
      A().core.update(s=>({
        ...s,
        scouting:{
          ...s.scouting,
          autoBench:{
            ...obj(s.scouting?.autoBench),
            enabled:true,
            targetSize:AUTO_BENCH_TOTAL,
            qualified:plan.qualified,
            autoCount:nextAuto.length,
            manualCount:manual.length,
            autoIds:nextAuto.map(t=>String(t.id||'')),
            lastRunAt:now(),
            lastChangeAt:s.scouting?.autoBench?.lastChangeAt||null,
            status:'CURRENT'
          }
        }
      }));
      if(!silent)toast(`Auto Bench already current • ${nextAuto.length} automatic + ${manual.length} manual.`);
      return {changed:false,plan};
    }

    if(!invalidateApproval(s=>{
      const liveManual=arr(s.scouting?.targets).filter(t=>!isAutoManagedTarget(t,s));
      const meta={...obj(s.scouting?.activeMeta)};
      Object.keys(meta).forEach(k=>{
        if(String(k).startsWith('AUTO-NET-'))delete meta[k];
      });
      nextAuto.forEach(t=>{
        const n=universe.find(x=>`AUTO-${x.id}`===t.id);
        if(!n)return;
        meta[t.id]={
          networkId:n.id,
          marketSymbol:n.marketSymbol,
          region:n.region,
          country:n.country,
          exchange:n.exchange,
          currency:n.currency,
          source:'AURORA1_GLOBAL_AUTO_BENCH',
          autoManaged:true,
          promotedAt:now()
        };
      });
      return {
        ...s,
        scouting:{
          ...s.scouting,
          targets:rankTargets([...liveManual,...nextAuto],s),
          activeMeta:meta,
          autoBench:{
            ...obj(s.scouting?.autoBench),
            enabled:true,
            targetSize:AUTO_BENCH_TOTAL,
            qualified:plan.qualified,
            autoCount:nextAuto.length,
            manualCount:liveManual.length,
            autoIds:nextAuto.map(t=>String(t.id||'')),
            lastRunAt:now(),
            lastChangeAt:now(),
            status:'UPDATED'
          },
          source:'AURORA2_SCOUTING_AUTO_BENCH',
          updatedAt:now()
        }
      };
    }))return {changed:false,blocked:true};

    if(!silent)toast(`Auto Bench updated • ${nextAuto.length} best available scouts promoted automatically.`);
    return {changed:true,plan};
  }

  function setAutoBenchEnabled(enabled){
    const state=A().core.read();
    if(scoutingLocked(state)){
      toast('Unlock Transfer before changing Auto Bench.');
      return;
    }
    A().core.update(s=>({
      ...s,
      scouting:{
        ...s.scouting,
        autoBench:{
          ...obj(s.scouting?.autoBench),
          enabled:!!enabled,
          targetSize:AUTO_BENCH_TOTAL,
          status:enabled?'READY':'PAUSED',
          updatedAt:now()
        }
      }
    }));
    if(enabled){
      rebalanceAutoBench({silent:false});
    }else{
      toast('Auto Bench paused. Current Active Scouting stays in place.');
    }
  }

  async function syncGlobalNetwork(force=true){
    const btn=$('syncGlobalNetwork');
    if(btn){btn.disabled=true;btn.textContent='Syncing…'}
    try{
      const {data,url}=await fetchNetworkMaster();
      const universe=collectNetworkRows(data);
      if(!universe.length)throw new Error('No valid scouting rows found in Aurora 1 network.');
      const counts=networkCounts(universe);
      A().core.update(s=>({
        ...s,
        scouting:{
          ...s.scouting,
          universe,
          networkMeta:{
            status:'CONNECTED',
            sourceUrl:url,
            sourceGeneratedAt:String(data?.meta?.generated_at||''),
            lastSyncAt:now(),
            lastError:'',
            counts
          },
          updatedAt:now()
        }
      }));
      const autoResult=rebalanceAutoBench({silent:true});
      toast(`Global Network synced • ${universe.length} stocks • Auto Bench ${autoResult.locked?'frozen':autoBenchEnabled()?'checked':'paused'}.`);
      return universe;
    }catch(err){
      A().core.update(s=>({
        ...s,
        scouting:{
          ...s.scouting,
          networkMeta:{
            ...obj(s.scouting?.networkMeta),
            status:'ERROR',
            lastAttemptAt:now(),
            lastError:String(err.message||err)
          }
        }
      }));
      toast(`Global Network sync failed: ${String(err.message||err)}`);
      return [];
    }finally{
      if(btn){btn.disabled=false;btn.textContent='Sync Global Network'}
    }
  }

  function networkEvidenceToCandidate(n){
    const safety=n.legacyPayoutScore>0?clamp(n.legacyPayoutScore):0;
    const valuation=n.legacyValuationScore>0?clamp(n.legacyValuationScore):0;
    const growth=n.legacyGrowthScore>0?clamp(n.legacyGrowthScore):0;

    // Promotion is deliberately review-gated. We carry only explicit evidence.
    // Business quality is not inferred from old buy-strength/role scores.
    const explicitFields=[
      n.legacyPriceGbp>0,n.legacyYieldPct>0,safety>0,valuation>0,growth>0
    ].filter(Boolean).length;
    const confidence=Math.round(clamp((explicitFields/6)*100,35,85));

    return {
      id:`ACTIVE-${n.id}`,
      ticker:activeTicker(n.marketSymbol),
      name:n.name,
      preferredAccount:'CHECK',
      sector:n.sector,
      livePriceGbp:n.legacyPriceGbp,
      yieldPct:n.legacyYieldPct,
      confidence,
      dividendSafety:safety,
      incomeScore:0,
      valuationScore:valuation,
      portfolioFit:0,
      dividendGrowth:growth,
      businessQuality:0,
      dividendStatus:'',
      payoutRisk:n.legacyPayoutRisk,
      requiresRefresh:true,
      source:'AURORA1_GLOBAL_NETWORK',
      sourceUpdatedAt:n.sourceUpdatedAt||n.legacyCheckedAt||null,
      createdAt:now(),updatedAt:now()
    };
  }

  function promoteNetworkCandidate(id){
    const state=A().core.read();
    if(scoutingLocked(state)){
      toast('Transfer is locked. Global Network stays monitor-only until the route is unlocked.');
      return;
    }
    const n=arr(state.scouting?.universe).find(x=>x.id===id);
    if(!n)return;
    const base=activeTicker(n.marketSymbol);
    const already=arr(state.scouting?.targets).find(t=>
      String(t.ticker||'').toUpperCase()===base.toUpperCase()
    );
    if(already){
      toast(`${base} is already in Active Scouting.`);
      editCandidate(already.id);
      return;
    }
    const candidate=networkEvidenceToCandidate(n);
    const assessed=assessTarget(candidate,state);

    if(!invalidateApproval(s=>{
      const meta={...obj(s.scouting?.activeMeta)};
      meta[candidate.id]={
        networkId:n.id,
        marketSymbol:n.marketSymbol,
        region:n.region,
        country:n.country,
        exchange:n.exchange,
        currency:n.currency,
        source:'AURORA1_GLOBAL_NETWORK',
        promotedAt:now()
      };
      return {
        ...s,
        scouting:{
          ...s.scouting,
          targets:rankTargets([...arr(s.scouting?.targets),assessed],s),
          activeMeta:meta,
          updatedAt:now()
        }
      };
    }))return;

    toast(`${n.ticker} promoted to Active Scouting • evidence review required.`);
    setTimeout(()=>editCandidate(candidate.id),50);
  }

  function maybeAutoSyncNetwork(){
    const state=A().core.read();
    const rows=arr(state.scouting?.universe);
    const last=Date.parse(state.scouting?.networkMeta?.lastSyncAt||'');
    const stale=!Number.isFinite(last)||(Date.now()-last)>NETWORK_SYNC_MS;
    if(!rows.length||stale)syncGlobalNetwork(false);
  }

  function injectNetworkUI(){
    if($('globalNetworkSection'))return;

    const style=document.createElement('style');
    style.id='auroraGlobalScoutStyles';
    style.textContent=`
      .network-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0}
      .network-kpi{padding:12px;border-radius:14px;border:1px solid rgba(74,222,128,.10);background:rgba(255,255,255,.018)}
      .network-kpi small{display:block;color:var(--muted);font-size:7px;text-transform:uppercase;font-weight:900}
      .network-kpi strong{display:block;margin-top:5px;font-size:18px}
      .network-pipeline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:10px 0}
      .network-node{position:relative;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.018);font-size:8px;color:var(--muted)}
      .network-node strong{display:block;color:#d7f8e3;font-size:9px;margin-bottom:3px}
      .network-node:not(:last-child):after{content:'›';position:absolute;right:-7px;top:50%;transform:translateY(-50%);color:#4ade80;font-size:18px;z-index:2}
      .network-toolbar{display:grid;grid-template-columns:minmax(190px,1.2fr) 140px minmax(160px,.8fr) auto;gap:8px;margin:10px 0}
      .network-toolbar .field{margin:0}
      .network-table-wrap{overflow:auto;border:1px solid rgba(255,255,255,.06);border-radius:15px}
      .network-table{width:100%;min-width:920px;border-collapse:collapse}
      .network-table th,.network-table td{padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.05);text-align:left;font-size:8px}
      .network-table th{position:sticky;top:0;background:#08120e;color:var(--muted);font-size:7px;text-transform:uppercase;z-index:2}
      .network-table tr:last-child td{border-bottom:0}
      .network-table tr:hover td{background:rgba(74,222,128,.025)}
      .region-pill{display:inline-flex;padding:4px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.09);font-size:7px;font-weight:900}
      .region-pill.uk{color:#9df0ba}.region-pill.us{color:#a7efff}.region-pill.world{color:#f7d77d}
      .network-name strong{display:block;font-size:9px}.network-name span{display:block;color:var(--muted);font-size:7px;margin-top:2px}
      .network-source-note{font-size:7px;color:var(--muted)}
      .network-active{color:#9df0ba;font-weight:900}
      .auto-bench-bar{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;margin:10px 0;padding:12px;border-radius:14px;border:1px solid rgba(74,222,128,.16);background:rgba(74,222,128,.028)}
      .auto-bench-copy strong{display:block;font-size:10px;color:#c9f7d8}.auto-bench-copy span{display:block;color:var(--muted);font-size:8px;line-height:1.45;margin-top:3px}
      .auto-tag{display:inline-flex;padding:4px 6px;border-radius:999px;border:1px solid rgba(74,222,128,.2);color:#9df0ba;font-size:7px;font-weight:1000}
      @media(max-width:900px){.network-toolbar{grid-template-columns:1fr 1fr}.network-toolbar #networkSearch{grid-column:1/-1}.network-kpis{grid-template-columns:1fr 1fr}.network-pipeline{grid-template-columns:1fr 1fr}.network-node:not(:last-child):after{display:none}.auto-bench-bar{grid-template-columns:1fr 1fr}.auto-bench-copy{grid-column:1/-1}}
      @media(max-width:600px){.network-toolbar{grid-template-columns:1fr}.network-toolbar #networkSearch{grid-column:auto}}
    `;
    document.head.appendChild(style);

    const section=document.createElement('section');
    section.id='globalNetworkSection';
    section.className='section card card-pad';
    section.innerHTML=`
      <div class="section-head">
        <div>
          <h2>Global Scouting Network</h2>
          <p class="muted">Broad monitor pool from Aurora 1 • UK + US + selected world markets • only promoted players enter Aurora 2 scoring</p>
        </div>
        <span class="scout-badge" id="networkBadge">CONNECTING</span>
      </div>

      <div class="network-kpis">
        <div class="network-kpi"><small>Network</small><strong id="networkTotal">0</strong></div>
        <div class="network-kpi"><small>🇬🇧 UK</small><strong id="networkUK">0</strong></div>
        <div class="network-kpi"><small>🇺🇸 US</small><strong id="networkUS">0</strong></div>
        <div class="network-kpi"><small>🌍 World</small><strong id="networkWorld">0</strong></div>
      </div>

      <div class="network-pipeline">
        <div class="network-node"><strong>1 • Global Network</strong>UK + US + World candidates.</div>
        <div class="network-node"><strong>2 • Auto Bench</strong>Best evidence-qualified names rotate in automatically.</div>
        <div class="network-node"><strong>3 • Active Scouting</strong>Aurora 2 scores manual + automatic scouts.</div>
        <div class="network-node"><strong>4 • Transfer</strong>Only an approved shortlist can be deployed.</div>
      </div>

      <div class="auto-bench-bar">
        <div class="auto-bench-copy"><strong id="autoBenchTitle">AUTO BENCH ON</strong><span id="autoBenchMeta">Building the best available Active Scouting bench…</span></div>
        <button class="btn secondary" id="refreshAutoBench" type="button">Refresh Auto Bench</button>
        <button class="btn secondary" id="toggleAutoBench" type="button">Pause Auto Bench</button>
      </div>

      <div class="network-toolbar">
        <div class="field" id="networkSearch"><input id="networkSearchInput" placeholder="Search ticker, company, country or sector"></div>
        <div class="field"><select id="networkRegion"><option value="ALL">All regions</option><option value="UK">🇬🇧 UK</option><option value="US">🇺🇸 US</option><option value="WORLD">🌍 World</option></select></div>
        <div class="field"><select id="networkSector"><option value="ALL">All sectors</option></select></div>
        <button class="btn secondary" id="syncGlobalNetwork" type="button">Sync Global Network</button>
      </div>

      <div id="networkNote" class="notice">
        Auto Bench promotes only evidence-qualified names. A locked Transfer route is never changed.
      </div>

      <div class="section-head" style="margin-top:14px">
        <div><h2 style="font-size:16px">Scouting Pool</h2><p class="muted">Sorted by legacy scout strength / impact as a monitoring priority — not an Aurora 2 buy recommendation.</p></div>
        <span class="muted" id="networkShown">0 shown</span>
      </div>
      <div class="network-table-wrap"><table class="network-table">
        <thead><tr>
          <th>#</th><th>Player</th><th>Region</th><th>Sector</th><th>Yield</th><th>Legacy strength</th><th>Value / risk</th><th>Status</th><th></th>
        </tr></thead>
        <tbody id="networkRows"><tr><td colspan="9">Connecting to the old Aurora scouting network…</td></tr></tbody>
      </table></div>
    `;

    const ranked=[...document.querySelectorAll('section')]
      .find(s=>/Ranked Shortlist/i.test(s.querySelector('h2')?.textContent||''));
    if(ranked)ranked.parentNode.insertBefore(section,ranked);
    else document.querySelector('.content')?.appendChild(section);

    $('syncGlobalNetwork')?.addEventListener('click',()=>syncGlobalNetwork(true));
    $('refreshAutoBench')?.addEventListener('click',()=>rebalanceAutoBench({silent:false}));
    $('toggleAutoBench')?.addEventListener('click',()=>setAutoBenchEnabled(!autoBenchEnabled()));
    $('networkSearchInput')?.addEventListener('input',()=>renderNetwork(A().core.read()));
    $('networkRegion')?.addEventListener('change',()=>renderNetwork(A().core.read()));
    $('networkSector')?.addEventListener('change',()=>renderNetwork(A().core.read()));
  }

  function renderNetwork(state){
    injectNetworkUI();
    const rows=arr(state.scouting?.universe);
    const meta=obj(state.scouting?.networkMeta);
    const counts=networkCounts(rows);
    set('networkTotal',counts.total);set('networkUK',counts.UK);
    set('networkUS',counts.US);set('networkWorld',counts.WORLD);

    const auto=obj(state.scouting?.autoBench);
    const autoOn=autoBenchEnabled(state);
    const autoRows=arr(state.scouting?.targets).filter(t=>isAutoManagedTarget(t,state));
    const manualRows=arr(state.scouting?.targets).filter(t=>!isAutoManagedTarget(t,state));
    set('autoBenchTitle',autoOn?(scoutingLocked(state)?'AUTO BENCH FROZEN':'AUTO BENCH ON'):'AUTO BENCH PAUSED');
    set('autoBenchMeta',autoOn
      ?`${autoRows.length} automatic + ${manualRows.length} manual = ${autoRows.length+manualRows.length} Active Scouts • ${auto.qualified??'—'} global names currently clear the auto-promotion gate • target ${AUTO_BENCH_TOTAL}.`
      :`${autoRows.length} automatic scouts remain in Active Scouting, but automatic rotation is paused.`
    );
    const toggle=$('toggleAutoBench');
    if(toggle){
      toggle.textContent=autoOn?'Pause Auto Bench':'Resume Auto Bench';
      toggle.disabled=scoutingLocked(state);
    }
    const refresh=$('refreshAutoBench');
    if(refresh)refresh.disabled=!autoOn||scoutingLocked(state)||!rows.length;

    const badge=$('networkBadge');
    if(badge){
      badge.textContent=meta.status==='ERROR'?'SOURCE ERROR':rows.length?'NETWORK LIVE':'CONNECTING';
    }

    const sectorEl=$('networkSector');
    if(sectorEl){
      const current=sectorEl.value||'ALL';
      const sectors=[...new Set(rows.map(r=>r.sector).filter(Boolean))].sort();
      sectorEl.innerHTML='<option value="ALL">All sectors</option>'+
        sectors.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
      if(current==='ALL'||sectors.includes(current))sectorEl.value=current;
    }

    const q=norm($('networkSearchInput')?.value||'');
    const region=$('networkRegion')?.value||'ALL';
    const sector=$('networkSector')?.value||'ALL';
    const activeIds=new Set(arr(state.scouting?.targets).map(t=>String(t.id||'')));
    const activeTickers=new Set(arr(state.scouting?.targets)
      .map(t=>String(t.ticker||'').toUpperCase()));
    const autoTickers=new Set(arr(state.scouting?.targets).filter(t=>isAutoManagedTarget(t,state))
      .map(t=>String(t.ticker||'').toUpperCase()));

    const filtered=rows.filter(r=>{
      if(region!=='ALL'&&r.region!==region)return false;
      if(sector!=='ALL'&&r.sector!==sector)return false;
      if(q){
        const hay=norm(`${r.ticker} ${r.marketSymbol} ${r.name} ${r.country} ${r.exchange} ${r.sector} ${r.role}`);
        if(!hay.includes(q))return false;
      }
      return true;
    }).slice(0,NETWORK_RENDER_LIMIT);

    set('networkShown',`${filtered.length} shown${rows.length>filtered.length?' of '+rows.length:''}`);
    const sourceDate=meta.sourceGeneratedAt?
      new Date(meta.sourceGeneratedAt).toLocaleString('en-GB'):'unknown source time';
    set('networkNote',
      meta.status==='ERROR'
        ?`Last sync failed: ${meta.lastError||'source unavailable'}. Existing network remains cached.`
        :rows.length
          ?`${rows.length} global scouting candidates • source ${sourceDate} • syncing this network does not alter Active Scouting or Transfer.`
          :'Connecting to the Aurora 1 scouting network…'
    );

    const host=$('networkRows');
    if(!host)return;
    if(!filtered.length){
      host.innerHTML='<tr><td colspan="9">No network candidates match the current filters.</td></tr>';
      return;
    }

    host.innerHTML=filtered.map((r,i)=>{
      const active=activeIds.has(`ACTIVE-${r.id}`)||
        activeTickers.has(activeTicker(r.marketSymbol).toUpperCase());
      const auto=autoTickers.has(activeTicker(r.marketSymbol).toUpperCase());
      const profile=autoPromotionProfile(r);
      const valueRisk=[r.legacyValuation,r.legacyPayoutRisk].filter(Boolean).join(' • ')||'—';
      return `<tr>
        <td>${i+1}</td>
        <td class="network-name"><strong>${esc(r.ticker)}</strong><span>${esc(r.name)}${r.marketSymbol&&r.marketSymbol!==r.ticker?' • '+esc(r.marketSymbol):''}</span></td>
        <td><span class="region-pill ${r.region.toLowerCase()}">${r.region==='UK'?'🇬🇧 UK':r.region==='US'?'🇺🇸 US':'🌍 World'}</span><div class="network-source-note">${esc(r.country||r.exchange||r.currency||'')}</div></td>
        <td>${esc(r.sector||'—')}</td>
        <td>${r.legacyYieldPct>0
          ?`${r.legacyYieldPct.toFixed(2)}%${r.legacyYieldSource&&r.legacyYieldSource!=='reported'
            ?`<div class="network-source-note">${esc(r.legacyYieldSource)}</div>`:''}`
          :'—<div class="network-source-note">needs data</div>'}</td>
        <td>${r.legacyStrength>0?Math.round(r.legacyStrength):'—'}${r.legacyImpact>0?` <span class="network-source-note">• impact ${Math.round(r.legacyImpact)}</span>`:''}</td>
        <td>${esc(valueRisk)}</td>
        <td>${esc(r.sourceStatus||'MONITOR')}${profile.eligible?'<div class="network-source-note">AUTO READY</div>':''}</td>
        <td>${auto
          ?'<span class="auto-tag">AUTO</span>'
          :active
            ?'<span class="network-active">MANUAL</span>'
            :`<button class="btn secondary" type="button" data-promote-network="${esc(r.id)}">Promote</button>`}
        </td>
      </tr>`;
    }).join('');
  }

  function changeLens(value){
    if(!['sustainable','maximum'].includes(value))return;
    A().core.update(s=>({
      ...s,scouting:{...s.scouting,strategy:value,updatedAt:now()}
    }));
  }

  function ensureEvaluated(){
    const state=A().core.read(),targets=arr(state.scouting?.targets);
    if(!targets.length)return;
    const needs=targets.some(t=>
      !num(t.sustainableScore)||!num(t.maximumScore)||!t.recommendation
    );
    if(!needs)return;
    const ranked=rankTargets(targets,state);
    A().core.update(s=>({
      ...s,scouting:{...s.scouting,targets:ranked,updatedAt:now()}
    }));
  }

  function renderMission(state){
    const m=state.mission,b=Math.max(0,num(m?.approvedBudget));
    set('missionBudget',money(b));set('missionStatus',m?.status||'NO ACTIVE MISSION');
    set('missionMeta',m
      ?`${m.id}${m.paydayDate?' • payday '+m.paydayDate:''}`
      :'Scouting can prepare targets without a mission. Transfer cannot deploy them until Finance releases money.'
    );
    const locked=scoutingLocked(state),el=$('scoutingLock');
    if(el){
      el.textContent=locked
        ?'Transfer route is locked — Active Scouting changes are frozen.'
        :'Active Scouting editor available.';
      el.className=locked?'lock red':'lock';
    }
  }

  function renderWeights(strategy){
    const weights=strategy==='maximum'?MAXIMUM_WEIGHTS:SUSTAINABLE_WEIGHTS;
    set('weightsTitle',strategy==='maximum'?'Maximum Income Weights':'Sustainable Income Weights');
    const labels={
      dividendSafety:'Dividend safety',incomeScore:'Income',
      valuationScore:'Valuation',portfolioFit:'Portfolio fit',
      dividendGrowth:'Dividend growth',businessQuality:'Business quality'
    };
    const host=$('weights');
    if(host)host.innerHTML=Object.entries(weights)
      .map(([k,v])=>`<div class="weight"><small>${esc(labels[k])}</small><strong>${v}%</strong></div>`)
      .join('');
  }

  function setScoutKpi(id,label,value,meta){
    const strong=$(id);if(!strong)return;
    strong.textContent=value;
    const card=strong.closest('.scout-kpi');
    if(!card)return;
    const small=card.querySelector('small');
    const span=card.querySelector('span');
    if(small)small.textContent=label;
    if(span)span.textContent=meta;
  }

  function renderTargets(state){
    const strategy=state.scouting?.strategy||'sustainable';
    const scoreKey=strategy==='maximum'?'maximumScore':'sustainableScore';
    const rankKey=strategy==='maximum'?'maximumRank':'rank';
    const targets=[...arr(state.scouting?.targets)].sort((a,b)=>{
      if(a.status==='block'&&b.status!=='block')return 1;
      if(b.status==='block'&&a.status!=='block')return -1;
      return num(a[rankKey])-num(b[rankKey])||num(b[scoreKey])-num(a[scoreKey]);
    });
    const host=$('targetList');

    const universe=arr(state.scouting?.universe);
    const globalCount=universe.length||targets.length;
    const permitted=targets.filter(t=>t.status!=='block').length;
    const needsReview=targets.filter(t=>t.status==='block'||t.status==='caution'||t.requiresRefresh).length;
    setScoutKpi('kCandidates','Global Candidates',globalCount,universe.length?'UK + US + World network':'Active list until network sync');
    setScoutKpi('kPass','Active Scouting',targets.length,'Aurora 2 scored / review queue');
    setScoutKpi('kCaution','Transfer Permitted',permitted,'Current active shortlist');
    setScoutKpi('kBlock','Needs Review',needsReview,'Blocked / caution / evidence refresh');

    const topS=[...targets].filter(t=>t.status!=='block')
      .sort((a,b)=>b.sustainableScore-a.sustainableScore)[0];
    const topM=[...targets].filter(t=>t.status!=='block')
      .sort((a,b)=>b.maximumScore-a.maximumScore)[0];

    set('kTopSustainable',topS?.ticker||'—');
    set('kTopSustainableMeta',topS?`${topS.sustainableScore}/100 • ${topS.recommendation}`:'—');
    set('kTopMaximum',topM?.ticker||'—');
    set('kTopMaximumMeta',topM?`${topM.maximumScore}/100 • ${topM.recommendation}`:'—');
    set('scoutingStatus',state.scouting?.status||'SCOUTING REVIEW');
    const universeCount=arr(state.scouting?.universe).length;
    set('shortlistMeta',targets.length
      ?`${targets.filter(t=>t.status!=='block').length} permitted • ${targets.length} active from `+
        `${universeCount||targets.length} global candidate${(universeCount||targets.length)===1?'':'s'} • ranked by `+
        `${strategy==='maximum'?'Maximum Income':'Sustainable Income'} logic.`
      :'No Active Scouting candidates stored yet.'
    );

    if(!host)return;
    if(!targets.length){
      host.innerHTML='<div class="empty-state compact"><strong>No active candidates yet</strong><p>Promote a player from the Global Network or add a candidate below.</p></div>';
      return;
    }

    const meta=obj(state.scouting?.activeMeta);
    host.innerHTML=targets.map((t,i)=>{
      const m=meta[t.id]||{};
      const market=m.marketSymbol?` • ${esc(m.marketSymbol)}${m.region?' • '+esc(m.region):''}`:'';
      return `<article class="target-card ${i===0&&t.status!=='block'?'top':''}">
        <div class="target-copy">
          <strong>#${t[rankKey]||i+1} • ${esc(t.ticker)} — ${esc(t.name)} ${isAutoManagedTarget(t,state)?'<span class="auto-tag">AUTO</span>':''}</strong>
          <span>${esc(t.reason||'Scouting evaluation')} • ${accountLabel(t.preferredAccount)}${t.sector?' • '+esc(t.sector):''}${market}</span>
          <div class="score-strip">
            <span class="score-chip">Yield ${num(t.yieldPct)>0?num(t.yieldPct).toFixed(2)+'%':'—'}</span>
            <span class="score-chip">Safety ${Math.round(num(t.dividendSafety))}</span>
            <span class="score-chip">Income ${Math.round(num(t.incomeScore))}</span>
            <span class="score-chip">Value ${Math.round(num(t.valuationScore))}</span>
            <span class="score-chip">Fit ${Math.round(num(t.portfolioFit))}</span>
            <span class="score-chip">Growth ${Math.round(num(t.dividendGrowth))}</span>
            <span class="score-chip">Quality ${Math.round(num(t.businessQuality))}</span>
            <span class="score-chip">Confidence ${Math.round(num(t.confidence))}</span>
          </div>
        </div>
        <div class="target-side">
          <span class="status-pill ${esc(t.status)}">${esc(t.recommendation||t.status)}</span>
          <div class="target-score">${Math.round(num(t[scoreKey]))}</div>
          <small>${strategy==='maximum'?'MAXIMUM':'SUSTAINABLE'} / 100</small>
          <div class="action-row" style="justify-content:flex-end;margin-top:7px">
            <button class="btn secondary" data-edit="${esc(t.id)}">${isAutoManagedTarget(t,state)?'Take Over':'Edit'}</button>
            <button class="btn secondary" data-delete="${esc(t.id)}">Remove</button>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  function renderHealth(state){
    const targets=arr(state.scouting?.targets);
    const full=targets.filter(t=>
      num(t.livePriceGbp)>0&&num(t.yieldPct)>0&&num(t.dividendSafety)>0&&
      num(t.valuationScore)>0&&num(t.businessQuality)>0&&num(t.confidence)>=75&&!t.requiresRefresh
    ).length;
    const review=targets.filter(t=>
      t.status==='caution'||t.requiresRefresh||num(t.confidence)<75||num(t.livePriceGbp)<=0
    ).length;
    const broker=targets.filter(t=>accountCode(t.preferredAccount)==='CHECK').length;
    const legacy=targets.filter(t=>/AURORA1/i.test(String(t.source||''))).length;

    set('healthFull',full);set('healthReview',review);
    set('healthBroker',broker);set('healthLegacy',legacy);
    set('healthNote',targets.length
      ?`${full} active candidate${full===1?' has':'s have'} strong Aurora 2 evidence coverage. `+
        `Global Network players stay monitor-only until promoted and reviewed.`
      :'Promote or add candidates to assess Active Scouting data health.'
    );

    const scan=scanLegacy(),box=$('legacySummary'),btn=$('importLegacy');
    if(box){
      box.className=scan.targets.length?'notice good':'notice';
      box.textContent=scan.targets.length
        ?`${scan.targets.length} old browser-shortlist candidate${scan.targets.length===1?'':'s'} found${scan.stale?' • source marked stale':''}.`
        :'No old browser shortlist found. The Global Network above is sourced separately from Aurora 1.';
    }
    if(btn)btn.disabled=!scan.targets.length||scoutingLocked(state);
  }

  function renderHistory(state){
    const rows=arr(state.scouting?.decisionHistory),host=$('historyList');
    if(!host)return;
    if(!rows.length){
      host.innerHTML='<div class="empty-state compact"><strong>No approvals yet</strong><p>The first approved Scouting shortlist will appear here.</p></div>';
      return;
    }
    host.innerHTML=rows.map(r=>
      `<div class="history-row"><strong>${esc(r.topTicker||'—')} ranked #1 • `+
      `${r.count||0} permitted target${r.count===1?'':'s'}</strong>`+
      `<span>${new Date(r.approvedAt).toLocaleString('en-GB')} • mission `+
      `${esc(r.missionId||'none')} • top sustainable score ${Math.round(num(r.topScore))}/100</span></div>`
    ).join('');
  }

  function renderEditorGuard(state){
    const locked=scoutingLocked(state),guard=$('editorGuard');
    if(guard){
      guard.className=locked?'notice locked-box':'notice good';
      guard.textContent=locked
        ?'Active Scouting is frozen because Transfer is already locked. The Global Network can still sync, but no player can be promoted until Transfer is unlocked.'
        :'Active Scouting can be edited. Global Network sync is separate and never invalidates an approved shortlist.';
    }
    ['saveCandidate','runScouting','approveShortlist']
      .forEach(id=>{const el=$(id);if(el)el.disabled=locked});
    document.querySelectorAll('[data-delete]').forEach(b=>b.disabled=locked);
    document.querySelectorAll('[data-promote-network]').forEach(b=>b.disabled=locked);
  }

  function updateVersionLabels(){
    const notice=document.querySelector('.scout-notice b');
    if(notice)notice.textContent='Scouting Centre 2.0 — Auto Bench v0.3.1.';
    const badge=document.querySelector('.page-head .scout-badge');
    if(badge)badge.textContent='AUTO BENCH v0.3.1';
    const hero=document.querySelector('.scout-hero p');
    if(hero)hero.textContent=
      'Scouting now rotates the best evidence-qualified names from the UK, US and world network into a 12-player Active Scouting bench automatically. Transfer still requires shortlist approval.';
  }

  function render(){
    const state=A().core.read(),strategy=state.scouting?.strategy||'sustainable';
    injectNetworkUI();
    updateVersionLabels();
    renderMission(state);renderWeights(strategy);renderTargets(state);
    renderNetwork(state);renderHealth(state);renderHistory(state);renderEditorGuard(state);

    $('lensSustainable')?.classList.toggle('active',strategy==='sustainable');
    $('lensMaximum')?.classList.toggle('active',strategy==='maximum');
    const radio=document.querySelector(`input[name="scoutLens"][value="${strategy}"]`);
    if(radio)radio.checked=true;
    set('lensNote',strategy==='maximum'
      ?'Maximum Income is ranking Active Scouting by income-led logic. Eligibility gates still apply.'
      :'Sustainable Income balances six weighted factors with a confidence adjustment.'
    );
    set('lastUpdated',new Date(state.updatedAt).toLocaleString('en-GB'));
  }

  function wire(){
    $('runScouting')?.addEventListener('click',runScouting);
    $('approveShortlist')?.addEventListener('click',approveShortlist);
    $('saveCandidate')?.addEventListener('click',saveCandidate);
    $('resetCandidate')?.addEventListener('click',resetEditor);
    $('importLegacy')?.addEventListener('click',importLegacy);

    document.querySelectorAll('input[name="scoutLens"]')
      .forEach(r=>r.addEventListener('change',()=>changeLens(r.value)));

    document.addEventListener('click',e=>{
      const edit=e.target.closest('[data-edit]');
      if(edit){editCandidate(edit.dataset.edit);return}
      const del=e.target.closest('[data-delete]');
      if(del){deleteCandidate(del.dataset.delete);return}
      const promote=e.target.closest('[data-promote-network]');
      if(promote){promoteNetworkCandidate(promote.dataset.promoteNetwork)}
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    injectNetworkUI();
    updateVersionLabels();
    ensureEvaluated();
    resetEditor();
    wire();
    render();
    maybeAutoSyncNetwork();
    if(arr(A().core.read().scouting?.universe).length&&autoBenchEnabled()){
      setTimeout(()=>rebalanceAutoBench({silent:true}),80);
    }
  });

  w.addEventListener('aurora2:state',render);

  w.Aurora2=w.Aurora2||{};
  w.Aurora2.scouting={
    assess:assessTarget,
    rank:rankTargets,
    weights:{sustainable:SUSTAINABLE_WEIGHTS,maximum:MAXIMUM_WEIGHTS},
    incomeScoreFromYield,
    autoPortfolioFit,
    network:{
      parse:collectNetworkRows,
      counts:networkCounts,
      sync:syncGlobalNetwork,
      promote:promoteNetworkCandidate,
      autoProfile:autoPromotionProfile,
      autoSelect:selectAutoBench,
      rebalanceAutoBench,
      setAutoBenchEnabled,
      isAutoManagedTarget
    }
  };
})(window);
