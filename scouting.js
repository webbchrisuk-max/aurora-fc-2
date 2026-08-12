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

  const SUSTAINABLE_WEIGHTS={
    dividendSafety:25,incomeScore:20,valuationScore:20,
    portfolioFit:15,dividendGrowth:10,businessQuality:10
  };
  const MAXIMUM_WEIGHTS={
    incomeScore:45,dividendSafety:20,valuationScore:10,
    portfolioFit:10,dividendGrowth:5,businessQuality:10
  };

  function toast(msg){
    const el=$('toast');if(!el)return;el.textContent=msg;el.style.opacity='1';
    clearTimeout(w.__a2ScoutToast);w.__a2ScoutToast=setTimeout(()=>el.style.opacity='0',2300);
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
  function accountLabel(v){const c=accountCode(v);return c==='IG'?'IG ISA':c==='T212'?'Trading 212 ISA':'Platform check'}
  function field(o,keys){for(const k of keys){if(o&&o[k]!=null&&o[k]!=='')return o[k]}return null}
  function yieldPctFrom(v){let y=num(v);if(y>0&&y<=1)y*=100;return Math.max(0,y)}

  function scoutingLocked(state=A().core.read()){
    return !!state.transfer?.route?.locked || ['TRANSFER_READY','REGISTERED','COMPLETED'].includes(String(state.mission?.status||''));
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
    const holdings=arr(state.squad?.holdings).filter(h=>h&&h.status!=='SOLD'&&h.status!=='ARCHIVED'&&num(h.shares)>0);
    const total=holdings.reduce((s,h)=>s+Math.max(0,num(h.marketValueGbp)||num(h.shares)*num(h.livePriceGbp)),0);
    if(total<=0)return 70;

    const ticker=String(target.ticker||'').toUpperCase();
    const sector=norm(target.sector);
    const tickerValue=holdings.filter(h=>String(h.ticker||'').toUpperCase()===ticker)
      .reduce((s,h)=>s+Math.max(0,num(h.marketValueGbp)||num(h.shares)*num(h.livePriceGbp)),0);
    const sectorValue=sector
      ? holdings.filter(h=>norm(h.sector)===sector).reduce((s,h)=>s+Math.max(0,num(h.marketValueGbp)||num(h.shares)*num(h.livePriceGbp)),0)
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
    const raw=Object.entries(weights).reduce((s,[k,wgt])=>s+clamp(parts[k])*(wgt/100),0);
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

    if(ticker==='TSCO'){status='block';reasons.push('TSCO is a locked legacy / 2029 holding and is excluded from active buys.')}
    if(!(yieldPct>0)){status='block';reasons.push('Recurring dividend yield is missing.')}
    if(!(livePriceGbp>0)){
      if(legacy&&status!=='block'){status='caution';reasons.push('Live price is not present in the migrated Aurora 1 cache; refresh before execution.')}
      else if(!legacy){status='block';reasons.push('Live price is missing.')}
    }
    const dividendStatus=String(t.dividendStatus||'').toLowerCase();
    const payoutRisk=String(t.payoutRisk||'').toLowerCase();
    if(/suspend|cancel|omit/.test(dividendStatus)){status='block';reasons.push('Dividend is suspended or cancelled.')}
    if(payoutRisk.includes('very high')){status='block';reasons.push('Payout risk is very high.')}
    if(dividendSafety<35){status='block';reasons.push('Dividend-safety score is below the purchase gate.')}
    if(confidence<50){status='block';reasons.push('Data confidence is below the purchase gate.')}
    if(status!=='block'&&(dividendSafety<60||confidence<75||yieldPct>10||accountCode(t.preferredAccount)==='CHECK')){
      status='caution';
      if(dividendSafety<60)reasons.push('Dividend safety is below the clean-pass threshold.');
      if(confidence<75)reasons.push('Data confidence needs review.');
      if(yieldPct>10)reasons.push('Yield is above 10% and requires controlled sizing.');
      if(accountCode(t.preferredAccount)==='CHECK')reasons.push('Preferred broker still needs confirmation.');
    }
    if(!reasons.length)reasons.push('Clears the sustainable-income eligibility gates.');

    const activeScore=(state.scouting?.strategy||'sustainable')==='maximum'?maximumScore:sustainableScore;
    const rec=recommendation(status,activeScore);
    const reason=`${rec} • Sustainable ${sustainableScore}/100 • Maximum ${maximumScore}/100 • ${yieldPct>0?yieldPct.toFixed(2)+'% yield • ':''}${reasons.join(' ')}`;

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
      return b.sustainableScore-a.sustainableScore||b.confidence-a.confidence||b.yieldPct-a.yieldPct;
    });
    sustainable.forEach((t,i)=>t.rank=i+1);
    const maxOrder=[...assessed].sort((a,b)=>{
      if(a.status==='block'&&b.status!=='block')return 1;
      if(b.status==='block'&&a.status!=='block')return -1;
      return b.maximumScore-a.maximumScore||b.yieldPct-a.yieldPct||b.confidence-a.confidence;
    });
    const maxRank=new Map(maxOrder.map((t,i)=>[t.id||t.ticker,i+1]));
    sustainable.forEach(t=>t.maximumRank=maxRank.get(t.id||t.ticker)||0);
    return sustainable;
  }

  function invalidateApproval(mutator){
    const state=A().core.read();
    if(scoutingLocked(state)){toast('Unlock the Transfer route before changing Scouting.');return false}
    A().core.update(s=>{
      const next=mutator(s);
      const m=next.mission;
      const route=next.transfer?.route;
      return {
        ...next,
        scouting:{...next.scouting,status:'SCOUTING_REVIEW',updatedAt:now()},
        mission:m?.status==='SCOUTING_READY'?{...m,status:'FINANCE_APPROVED',updatedAt:now()}:m,
        transfer:{...next.transfer,route:route?.locked?route:null,updatedAt:route&&!route.locked?now():next.transfer?.updatedAt}
      };
    });
    return true;
  }

  function runScouting(){
    if(!invalidateApproval(s=>{
      const ranked=rankTargets(s.scouting?.targets||[],s);
      return {...s,scouting:{...s.scouting,targets:ranked,source:'AURORA2_SCOUTING',updatedAt:now()}};
    }))return;
    toast('Scouting scores recalculated. Approve the shortlist when ready.');
  }

  function approveShortlist(){
    const state=A().core.read();
    if(scoutingLocked(state)){toast('Transfer is already locked. Unlock it before changing the approved shortlist.');return}
    const ranked=rankTargets(state.scouting?.targets||[],state);
    const eligible=ranked.filter(t=>t.status!=='block');
    if(!eligible.length){toast('No permitted target clears the Scouting gates.');return}
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
        source:'AURORA2_SCOUTING',importedFromLegacy:s.scouting?.importedFromLegacy||false,
        decisionHistory:[history,...arr(s.scouting?.decisionHistory)].slice(0,20),updatedAt:now()
      },
      mission:s.mission?.status==='FINANCE_APPROVED'
        ? {...s.mission,status:'SCOUTING_READY',updatedAt:now()}
        : s.mission,
      portfolio:{...s.portfolio,topAuroraPlayer:top.ticker},
      decision:{
        title:`Scouting recommends ${top.ticker}`,
        note:`${top.recommendation} • Sustainable ${top.sustainableScore}/100 • Maximum ${top.maximumScore}/100 • ${top.yieldPct.toFixed(2)}% yield.`,
        ticker:top.ticker,confidence:top.confidence
      },
      alerts:[
        {id:A().core.uid('ALERT'),title:'Scouting shortlist approved',note:`${eligible.length} permitted target${eligible.length===1?'':'s'} • ${top.ticker} ranked #1.`,when:'now'},
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
    if(scoutingLocked(state)){toast('Unlock Transfer before editing Scouting.');return}
    const ticker=String($('editTicker')?.value||'').replace(/\..*$/,'').toUpperCase().trim();
    if(!ticker){toast('Enter a ticker.');return}
    const id=$('editId')?.value||A().core.uid('TARGET');
    const existing=arr(state.scouting?.targets).find(t=>t.id===id);
    const target={
      ...existing,
      id,ticker,
      name:String($('editName')?.value||ticker).trim(),
      preferredAccount:accountCode($('editAccount')?.value),
      sector:String($('editSector')?.value||'').trim(),
      livePriceGbp:Math.max(0,num($('editLivePrice')?.value)),
      yieldPct:Math.max(0,num($('editYield')?.value)),
      confidence:editorNumber('editConfidence'),
      dividendSafety:editorNumber('editSafety'),
      incomeScore:editorNumber('editIncome'),
      valuationScore:editorNumber('editValuation'),
      portfolioFit:editorNumber('editFit'),
      dividendGrowth:editorNumber('editGrowth'),
      businessQuality:editorNumber('editQuality'),
      dividendStatus:String($('editDividendStatus')?.value||'').trim(),
      payoutRisk:String($('editPayoutRisk')?.value||'').trim(),
      source:existing?.source||'AURORA2_MANUAL',
      createdAt:existing?.createdAt||now(),updatedAt:now()
    };
    const assessed=assessTarget(target,state);
    if(!invalidateApproval(s=>{
      const rows=arr(s.scouting?.targets);
      const next=rows.some(t=>t.id===id)?rows.map(t=>t.id===id?assessed:t):[...rows,assessed];
      return {...s,scouting:{...s.scouting,targets:rankTargets(next,s),source:'AURORA2_SCOUTING',updatedAt:now()}};
    }))return;
    resetEditor();
    toast(`${ticker} saved and scored.`);
  }

  function editCandidate(id){
    const t=arr(A().core.read().scouting?.targets).find(x=>x.id===id);if(!t)return;
    setValue('editId',t.id);setValue('editTicker',t.ticker);setValue('editName',t.name);
    setValue('editAccount',accountCode(t.preferredAccount));setValue('editSector',t.sector);
    setValue('editLivePrice',t.livePriceGbp||'');setValue('editYield',t.yieldPct||'');
    setValue('editConfidence',t.confidence||'');setValue('editSafety',t.dividendSafety||'');
    setValue('editIncome',t.incomeScore||'');setValue('editValuation',t.valuationScore||'');
    setValue('editFit',t.portfolioFit||'');setValue('editGrowth',t.dividendGrowth||'');
    setValue('editQuality',t.businessQuality||'');setValue('editDividendStatus',t.dividendStatus||'');
    setValue('editPayoutRisk',t.payoutRisk||'');set('editorMode',`EDIT ${t.ticker}`);
    $('editTicker')?.focus();
  }

  function deleteCandidate(id){
    const t=arr(A().core.read().scouting?.targets).find(x=>x.id===id);
    if(!t)return;
    if(!confirm(`Remove ${t.ticker} from the Scouting universe?`))return;
    if(!invalidateApproval(s=>({...s,scouting:{...s.scouting,targets:arr(s.scouting?.targets).filter(x=>x.id!==id),updatedAt:now()}})))return;
    resetEditor();toast(`${t.ticker} removed.`);
  }

  function resetEditor(){
    ['editId','editTicker','editName','editSector','editLivePrice','editYield','editIncome','editFit','editDividendStatus','editPayoutRisk'].forEach(id=>setValue(id,''));
    setValue('editAccount','CHECK');setValue('editConfidence','75');setValue('editSafety','60');
    setValue('editValuation','55');setValue('editGrowth','50');setValue('editQuality','55');
    set('editorMode','NEW CANDIDATE');
  }

  function collectPlanTargets(plan){
    for(const key of ['targets','purchases','allocations','items','deals']){
      const rows=arr(plan?.[key]);if(rows.length)return rows.map(x=>x.row||x.target||x).filter(Boolean);
    }
    return [];
  }
  function scanLegacy(){
    const decision=readJson(LEGACY_DECISION_KEY),plan=readJson(LEGACY_PLAN_KEY);
    let rows=arr(decision?.targets),source=LEGACY_DECISION_KEY,stale=!!decision?.isStale;
    if(!rows.length){rows=collectPlanTargets(plan);source=LEGACY_PLAN_KEY;stale=false}
    const targets=[],seen=new Set();
    rows.forEach((raw,index)=>{
      const ticker=String(field(raw,['ticker','symbol','code','Ticker'])||'').replace(/\..*$/,'').toUpperCase().trim();
      if(!ticker||seen.has(ticker))return;seen.add(ticker);
      const sustainable=obj(raw.sustainable);
      targets.push({
        id:`A1-SCOUT-${ticker}`,ticker,
        name:String(field(raw,['name','company','companyName','securityName'])||ticker),
        preferredAccount:accountCode(field(raw,['preferredAccount','account','platform','broker'])||'CHECK'),
        sector:String(field(raw,['sector','industry'])||''),
        livePriceGbp:Math.max(0,num(field(raw,['livePriceGbp','live','livePrice','price','currentPrice']))),
        yieldPct:yieldPctFrom(field(raw,['yieldPct','dividendYield','yield','incomeRate','forwardYield','dividend_yield'])),
        confidence:clamp(field(raw,['confidence','dataConfidence','dataScore'])||field(raw,['dataQualityScore'])||sustainable.dataQuality||75),
        dividendSafety:clamp(field(raw,['dividendSafety','dividendSafetyScore','dividend_safety'])||sustainable.dividendSafety||0),
        incomeScore:clamp(field(raw,['incomeScore'])||sustainable.income||0),
        valuationScore:clamp(field(raw,['valuationScore','valuation'])||sustainable.valuation||0),
        portfolioFit:clamp(field(raw,['portfolioFit','diversificationScore'])||sustainable.portfolioFit||0),
        dividendGrowth:clamp(field(raw,['dividendGrowth','dividendGrowthScore'])||sustainable.dividendGrowth||0),
        businessQuality:clamp(field(raw,['businessQuality','qualityScore'])||sustainable.businessQuality||0),
        dividendStatus:String(field(raw,['dividend_status','distribution_status','dividend_action'])||''),
        payoutRisk:String(field(raw,['payout_risk','risk'])||''),
        source:'AURORA1_SCOUTING',sourceUpdatedAt:decision?.updatedAt||plan?.updatedAt||null,
        createdAt:now(),updatedAt:now()
      });
    });
    return {targets,source,stale};
  }

  function importLegacy(){
    const state=A().core.read();
    if(scoutingLocked(state)){toast('Unlock Transfer before importing Scouting evidence.');return}
    const scan=scanLegacy();
    if(!scan.targets.length){toast('No Aurora 1 shortlist found in this browser.');return}
    if(!invalidateApproval(s=>{
      const byTicker=new Map(arr(s.scouting?.targets).map(t=>[String(t.ticker).toUpperCase(),t]));
      scan.targets.forEach(t=>{if(!byTicker.has(t.ticker))byTicker.set(t.ticker,t)});
      const ranked=rankTargets([...byTicker.values()],s);
      return {...s,scouting:{...s.scouting,targets:ranked,importedFromLegacy:true,source:'AURORA2_SCOUTING',updatedAt:now()}};
    }))return;
    toast(`${scan.targets.length} Aurora 1 candidate${scan.targets.length===1?'':'s'} imported for review.`);
  }

  function changeLens(value){
    if(!['sustainable','maximum'].includes(value))return;
    A().core.update(s=>({...s,scouting:{...s.scouting,strategy:value,updatedAt:now()}}));
  }

  function ensureEvaluated(){
    const state=A().core.read(),targets=arr(state.scouting?.targets);
    if(!targets.length)return;
    const needs=targets.some(t=>!num(t.sustainableScore)||!num(t.maximumScore)||!t.recommendation);
    if(!needs)return;
    const ranked=rankTargets(targets,state);
    A().core.update(s=>({...s,scouting:{...s.scouting,targets:ranked,updatedAt:now()}}));
  }

  function renderMission(state){
    const m=state.mission,b=Math.max(0,num(m?.approvedBudget));
    set('missionBudget',money(b));set('missionStatus',m?.status||'NO ACTIVE MISSION');
    set('missionMeta',m?`${m.id}${m.paydayDate?' • payday '+m.paydayDate:''}`:'Scouting can prepare targets without a mission. Transfer cannot deploy them until Finance releases money.');
    const locked=scoutingLocked(state),el=$('scoutingLock');
    if(el){el.textContent=locked?'Transfer route is locked — Scouting changes are frozen.':'Scouting editor available.';el.className=locked?'lock red':'lock'}
  }

  function renderWeights(strategy){
    const weights=strategy==='maximum'?MAXIMUM_WEIGHTS:SUSTAINABLE_WEIGHTS;
    set('weightsTitle',strategy==='maximum'?'Maximum Income Weights':'Sustainable Income Weights');
    const labels={
      dividendSafety:'Dividend safety',incomeScore:'Income',valuationScore:'Valuation',
      portfolioFit:'Portfolio fit',dividendGrowth:'Dividend growth',businessQuality:'Business quality'
    };
    const host=$('weights');if(host)host.innerHTML=Object.entries(weights)
      .map(([k,v])=>`<div class="weight"><small>${esc(labels[k])}</small><strong>${v}%</strong></div>`).join('');
  }

  function renderTargets(state){
    const strategy=state.scouting?.strategy||'sustainable';
    const scoreKey=strategy==='maximum'?'maximumScore':'sustainableScore';
    const rankKey=strategy==='maximum'?'maximumRank':'rank';
    const targets=[...arr(state.scouting?.targets)].sort((a,b)=>{
      if(a.status==='block'&&b.status!=='block')return 1;if(b.status==='block'&&a.status!=='block')return -1;
      return num(a[rankKey])-num(b[rankKey])||num(b[scoreKey])-num(a[scoreKey]);
    });
    const host=$('targetList');
    set('kCandidates',targets.length);set('kPass',targets.filter(t=>t.status==='pass').length);
    set('kCaution',targets.filter(t=>t.status==='caution').length);set('kBlock',targets.filter(t=>t.status==='block').length);
    const topS=[...targets].filter(t=>t.status!=='block').sort((a,b)=>b.sustainableScore-a.sustainableScore)[0];
    const topM=[...targets].filter(t=>t.status!=='block').sort((a,b)=>b.maximumScore-a.maximumScore)[0];
    set('kTopSustainable',topS?.ticker||'—');set('kTopSustainableMeta',topS?`${topS.sustainableScore}/100 • ${topS.recommendation}`:'—');
    set('kTopMaximum',topM?.ticker||'—');set('kTopMaximumMeta',topM?`${topM.maximumScore}/100 • ${topM.recommendation}`:'—');
    set('scoutingStatus',state.scouting?.status||'SCOUTING REVIEW');
    set('shortlistMeta',targets.length?`${targets.filter(t=>t.status!=='block').length} permitted • ranked by ${strategy==='maximum'?'Maximum Income':'Sustainable Income'} logic.`:'No Scouting candidates stored yet.');
    if(!host)return;
    if(!targets.length){host.innerHTML='<div class="empty-state compact"><strong>No candidates yet</strong><p>Import the Aurora 1 shortlist or add a candidate below.</p></div>';return}
    host.innerHTML=targets.map((t,i)=>`<article class="target-card ${i===0&&t.status!=='block'?'top':''}">
      <div class="target-copy"><strong>#${t[rankKey]||i+1} • ${esc(t.ticker)} — ${esc(t.name)}</strong>
        <span>${esc(t.reason||'Scouting evaluation')} • ${accountLabel(t.preferredAccount)}${t.sector?' • '+esc(t.sector):''}</span>
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
      <div class="target-side"><span class="status-pill ${esc(t.status)}">${esc(t.recommendation||t.status)}</span><div class="target-score">${Math.round(num(t[scoreKey]))}</div><small>${strategy==='maximum'?'MAXIMUM':'SUSTAINABLE'} / 100</small>
        <div class="action-row" style="justify-content:flex-end;margin-top:7px"><button class="btn secondary" data-edit="${esc(t.id)}">Edit</button><button class="btn secondary" data-delete="${esc(t.id)}">Remove</button></div>
      </div></article>`).join('');
  }

  function renderHealth(state){
    const targets=arr(state.scouting?.targets);
    const full=targets.filter(t=>num(t.livePriceGbp)>0&&num(t.yieldPct)>0&&num(t.dividendSafety)>0&&num(t.valuationScore)>0&&num(t.businessQuality)>0&&num(t.confidence)>=75).length;
    const review=targets.filter(t=>t.status==='caution'||num(t.confidence)<75||num(t.livePriceGbp)<=0).length;
    const broker=targets.filter(t=>accountCode(t.preferredAccount)==='CHECK').length;
    const legacy=targets.filter(t=>/AURORA1/i.test(String(t.source||''))).length;
    set('healthFull',full);set('healthReview',review);set('healthBroker',broker);set('healthLegacy',legacy);
    set('healthNote',targets.length?`${full} candidate${full===1?' has':'s have'} strong evidence coverage. Missing fields remain visible rather than being silently guessed.`:'Add or import candidates to assess data health.');
    const scan=scanLegacy(),box=$('legacySummary'),btn=$('importLegacy');
    if(box){
      box.className=scan.targets.length?'notice good':'notice';
      box.textContent=scan.targets.length?`${scan.targets.length} Aurora 1 candidate${scan.targets.length===1?'':'s'} found${scan.stale?' • source marked stale':''}.`:'No Aurora 1 shortlist found in browser storage.';
    }
    if(btn)btn.disabled=!scan.targets.length||scoutingLocked(state);
  }

  function renderHistory(state){
    const rows=arr(state.scouting?.decisionHistory),host=$('historyList');if(!host)return;
    if(!rows.length){host.innerHTML='<div class="empty-state compact"><strong>No approvals yet</strong><p>The first approved Scouting shortlist will appear here.</p></div>';return}
    host.innerHTML=rows.map(r=>`<div class="history-row"><strong>${esc(r.topTicker||'—')} ranked #1 • ${r.count||0} permitted target${r.count===1?'':'s'}</strong><span>${new Date(r.approvedAt).toLocaleString('en-GB')} • mission ${esc(r.missionId||'none')} • top sustainable score ${Math.round(num(r.topScore))}/100</span></div>`).join('');
  }

  function renderEditorGuard(state){
    const locked=scoutingLocked(state),guard=$('editorGuard');
    if(guard){
      guard.className=locked?'notice locked-box':'notice good';
      guard.textContent=locked?'Scouting is frozen because Transfer is already locked. Unlock the Transfer route before changing the approved evidence.':'Scouting can be edited. Any change returns the mission to Finance-approved / Scouting-review until the shortlist is approved again.';
    }
    ['saveCandidate','runScouting','approveShortlist'].forEach(id=>{const el=$(id);if(el)el.disabled=locked});
    document.querySelectorAll('[data-delete]').forEach(b=>b.disabled=locked);
  }

  function render(){
    const state=A().core.read(),strategy=state.scouting?.strategy||'sustainable';
    renderMission(state);renderWeights(strategy);renderTargets(state);renderHealth(state);renderHistory(state);renderEditorGuard(state);
    const s=$(`lens${strategy==='maximum'?'Maximum':'Sustainable'}`);$('lensSustainable')?.classList.toggle('active',strategy==='sustainable');$('lensMaximum')?.classList.toggle('active',strategy==='maximum');
    const radio=document.querySelector(`input[name="scoutLens"][value="${strategy}"]`);if(radio)radio.checked=true;
    set('lensNote',strategy==='maximum'?'Maximum Income is ranking by income-led logic. Eligibility gates still apply.':'Sustainable Income balances six weighted factors with a confidence adjustment.');
    set('lastUpdated',new Date(state.updatedAt).toLocaleString('en-GB'));
  }

  function wire(){
    $('runScouting')?.addEventListener('click',runScouting);$('approveShortlist')?.addEventListener('click',approveShortlist);
    $('saveCandidate')?.addEventListener('click',saveCandidate);$('resetCandidate')?.addEventListener('click',resetEditor);
    $('importLegacy')?.addEventListener('click',importLegacy);
    document.querySelectorAll('input[name="scoutLens"]').forEach(r=>r.addEventListener('change',()=>changeLens(r.value)));
    document.addEventListener('click',e=>{
      const edit=e.target.closest('[data-edit]');if(edit){editCandidate(edit.dataset.edit);return}
      const del=e.target.closest('[data-delete]');if(del)deleteCandidate(del.dataset.delete);
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    ensureEvaluated();resetEditor();wire();render();
  });
  w.addEventListener('aurora2:state',render);

  w.Aurora2=w.Aurora2||{};
  w.Aurora2.scouting={
    assess:assessTarget,rank:rankTargets,
    weights:{sustainable:SUSTAINABLE_WEIGHTS,maximum:MAXIMUM_WEIGHTS},
    incomeScoreFromYield,autoPortfolioFit
  };
})(window);