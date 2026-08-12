(function(w){
  'use strict';

  const A=()=>w.Aurora2;
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[£,%]/g,'').replace(/,/g,''));return Number.isFinite(n)?n:0};
  const esc=v=>A().ui.escape(v);
  const money=v=>A().ui.money(Number(v)||0);

  let selectedKey='';
  let lens='sustainable';
  let saleFraction=1;
  let customIds=new Set();

  function set(id,v){const el=$(id);if(el)el.textContent=v}
  function toast(msg){
    const el=$('toast');if(!el)return;
    el.textContent=msg;el.style.opacity='1';
    clearTimeout(w.__a2ChairToast);
    w.__a2ChairToast=setTimeout(()=>el.style.opacity='0',2200);
  }
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
  function accountLabel(v){
    const a=accountCode(v);
    return a==='IG'?'IG ISA':a==='T212'?'Trading 212 ISA':'Account review';
  }
  function activeHoldings(state=A().core.read()){
    return arr(state.squad?.holdings).filter(h=>
      ['ACTIVE','LOCKED'].includes(String(h.status||'').toUpperCase())&&num(h.shares)>0
    );
  }
  function holdingKey(h){
    return String(h.id||`${ticker(h.ticker)}|${accountCode(h.account)}`);
  }
  function holdingMetrics(h){
    const shares=Math.max(0,num(h.shares));
    const price=Math.max(0,num(h.livePriceGbp));
    const value=shares>0&&price>0?shares*price:Math.max(0,num(h.marketValueGbp));
    const book=Math.max(0,num(h.bookCostGbp));
    const avg=shares>0&&book>0?book/shares:Math.max(0,num(h.avgCostGbp));
    const dps=Math.max(0,num(h.annualDpsGbp));
    const income=shares>0&&dps>0?shares*dps:Math.max(0,num(h.annualIncomeGbp));
    const profit=value-book;
    const profitPct=book>0?profit/book*100:0;
    const currentYield=value>0?income/value*100:0;
    return {shares,price,value,book,avg,income,profit,profitPct,currentYield};
  }
  function materiality(state,h,m=holdingMetrics(h)){
    const metrics=activeHoldings(state).map(holdingMetrics);
    const totalValue=metrics.reduce((s,x)=>s+x.value,0);
    const totalIncome=metrics.reduce((s,x)=>s+x.income,0);
    const valueFloor=Math.max(100,totalValue*.001);
    const profitFloor=Math.max(10,totalValue*.0002);
    const incomeFloor=Math.max(5,totalIncome*.005);
    const micro=m.value<valueFloor&&Math.abs(m.profit)<profitFloor&&m.income<incomeFloor;
    const priority=
      (Math.max(0,m.profitPct)*.25)+
      (Math.max(0,m.profit)/Math.max(1,profitFloor))*18+
      (Math.max(0,m.value)/Math.max(1,valueFloor))*4+
      (Math.max(0,m.income)/Math.max(1,incomeFloor))*5;
    return {micro,priority,valueFloor,profitFloor,incomeFloor,totalValue,totalIncome};
  }
  function profitTrigger(state,h,m=holdingMetrics(h),mat=materiality(state,h,m)){
    if(h.locked||String(h.status||'').toUpperCase()==='LOCKED')return {code:'locked',label:'LOCKED'};
    if(mat.micro&&m.profitPct>=6)return {code:'micro',label:'MICRO POSITION'};
    if(m.profitPct>=10)return {code:'strong',label:'+10% STRONG REVIEW'};
    if(m.profitPct>=6)return {code:'review',label:'+6% REVIEW'};
    return {code:'keep',label:'KEEP ZONE'};
  }

  function scenarioMetrics(m){
    const f=Math.max(0,Math.min(1,saleFraction));
    return {
      fraction:f,
      sharesSold:m.shares*f,
      sharesRemaining:m.shares*(1-f),
      cashReleased:m.value*f,
      bookReleased:m.book*f,
      profitRealised:m.profit*f,
      incomeSurrendered:m.income*f
    };
  }

  function parseDate(v){
    if(!v)return null;
    const d=new Date(`${String(v).slice(0,10)}T12:00:00`);
    return Number.isNaN(d.getTime())?null:d;
  }
  function dateLabel(v){
    const d=parseDate(v);
    return d?d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
  }
  function dayDiff(from,to){
    const a=new Date(from.getFullYear(),from.getMonth(),from.getDate());
    const b=new Date(to.getFullYear(),to.getMonth(),to.getDate());
    return Math.round((b-a)/86400000);
  }
  function eventDps(e){
    const fields=[
      e?.dividendPerShareGbp,e?.dividend_per_share_gbp,e?.dpsGbp,e?.dps,
      e?.dividendPerShare,e?.dividend_per_share
    ];
    for(const v of fields){if(num(v)>0)return num(v)}
    return 0;
  }
  function nextExDate(state,h,scenario){
    const tk=ticker(h.ticker),ac=accountCode(h.account);
    const today=new Date();today.setHours(0,0,0,0);
    const events=arr(state.income?.calendar)
      .filter(e=>!['CANCELLED','ARCHIVED'].includes(String(e.status||'').toUpperCase()))
      .filter(e=>ticker(e.ticker)===tk)
      .filter(e=>accountCode(e.account)===ac||accountCode(e.account)==='CHECK'||ac==='CHECK')
      .map(e=>({...e,date:parseDate(e.exDate||e.ex_date)}))
      .filter(e=>e.date&&e.date.getTime()>=today.getTime())
      .sort((a,b)=>a.date-b.date);
    const e=events[0];
    if(!e)return null;

    const dps=eventDps(e);
    const expectedFull=Math.max(0,num(e.expectedAmountGbp||e.expected_amount_gbp||e.grossDividendGbp||e.gross_dividend_gbp));
    let dividendAtRisk=0;
    if(dps>0&&scenario.sharesSold>0)dividendAtRisk=scenario.sharesSold*dps;
    else if(expectedFull>0)dividendAtRisk=expectedFull*scenario.fraction;

    return {
      ...e,
      exDate:e.exDate||e.ex_date,
      days:dayDiff(today,e.date),
      dps,
      dividendAtRisk
    };
  }

  function eligibleCustomCandidates(state,currentTicker){
    return arr(state.scouting?.targets)
      .filter(t=>ticker(t.ticker)!==currentTicker)
      .filter(t=>String(t.status||'').toLowerCase()!=='block')
      .filter(t=>num(t.yieldPct)>0)
      .sort((a,b)=>num(b.sustainableScore)-num(a.sustainableScore)||num(b.yieldPct)-num(a.yieldPct));
  }

  function transferSimulation(state,h,scenario){
    const engine=A().transferEngine;
    if(!engine?.simulate)return {
      financeBudget:scenario.cashReleased,allocations:[],allocated:0,income:0,
      remaining:scenario.cashReleased,status:'SIMULATION',reason:'ENGINE_MISSING'
    };

    let targetIds=null,strategy=lens==='maximum'?'maximum':'sustainable';
    if(lens==='custom'){
      targetIds=[...customIds];
      strategy='sustainable';
    }

    return engine.simulate(state,{
      budget:scenario.cashReleased,
      strategy,
      brokerScope:'both',
      minAllocation:state.transfer?.settings?.minAllocation||250,
      increment:state.transfer?.settings?.increment||25,
      maxTargets:8,
      excludeTicker:ticker(h.ticker),
      targetIds,
      rotationContext:{
        holdingId:h.id||'',
        ticker:ticker(h.ticker),
        account:h.account,
        saleFraction:scenario.fraction
      }
    });
  }

  function concentration(state,h,scenario,sim){
    const engine=A().transferEngine;
    if(!engine?.concentrationSnapshot)return null;
    return engine.concentrationSnapshot(
      state,
      {holdingId:h.id||'',ticker:ticker(h.ticker),account:h.account,saleFraction:scenario.fraction},
      sim.allocations
    );
  }

  function selectedHolding(state=A().core.read()){
    const hs=activeHoldings(state);
    return hs.find(h=>holdingKey(h)===selectedKey)||hs[0]||null;
  }

  function buildVerdict({holding,metrics,mat,scenario,sim,exEvent,concentration:conc}){
    const replacementIncome=num(sim.income);
    const net=replacementIncome-scenario.incomeSurrendered;
    const netPct=scenario.incomeSurrendered>0?net/scenario.incomeSurrendered*100:(replacementIncome>0?100:0);
    const caution=arr(sim.allocations).filter(r=>String(r.scoutingStatus||'caution')!=='pass').length;
    const closeEx=exEvent&&exEvent.days>=0&&exEvent.days<=7;
    const worsens=conc&&(conc.after.largestTickerPct-conc.before.largestTickerPct)>5;

    if(holding.locked||String(holding.status||'').toUpperCase()==='LOCKED'){
      return {code:'block',title:'DO NOT ROTATE',reason:'This is a locked / legacy Squad position. It may be inspected, but Chairman will not recommend a normal rotation.'};
    }
    if(mat.micro){
      return {code:'micro',title:'MICRO POSITION',reason:`The percentage move is real, but the £ impact is below Aurora's dynamic materiality thresholds. Current value ${money(metrics.value)} and capital P/L ${money(metrics.profit)} are too small to deserve a rotation priority.`};
    }
    if(!(scenario.cashReleased>0)){
      return {code:'review',title:'REVIEW',reason:'No meaningful sale proceeds are available for this scenario.'};
    }
    if(closeEx&&num(exEvent.dividendAtRisk)>0){
      return {code:'wait',title:'WAIT FOR DIVIDEND',reason:`The next ex-date is ${exEvent.days===0?'today':`only ${exEvent.days} day${exEvent.days===1?'':'s'} away`} and approximately ${money(exEvent.dividendAtRisk)} of the next dividend is attached to the shares being sold. Re-run the case after the ex-date.`};
    }
    if(!arr(sim.allocations).length){
      return {code:'review',title:'REVIEW',reason:'Transfer could not build a hypothetical replacement route from the currently eligible Active Scouting candidates.'};
    }
    if(caution>0){
      return {code:'review',title:'REVIEW',reason:`Transfer used ${caution} caution replacement${caution===1?'':'s'}. The economics can be compared, but Scouting evidence must be cleared before a stronger verdict.`};
    }
    if(worsens){
      return {code:'review',title:'REVIEW',reason:'The simulated route worsens the largest-position concentration by more than 5 percentage points, so Chairman caps the verdict at REVIEW.'};
    }
    if(metrics.profitPct>=10&&netPct>=5){
      return {code:'strong',title:'STRONG ROTATION',reason:`The holding is up ${metrics.profitPct.toFixed(1)}%, this ${Math.round(scenario.fraction*100)}% sale realises ${money(scenario.profitRealised)}, and Transfer improves the surrendered annual income by ${money(net)} (${netPct.toFixed(1)}%).`};
    }
    if((metrics.profitPct>=10&&net>=-0.005)||(metrics.profitPct>=6&&net>0)){
      return {code:'attractive',title:'ATTRACTIVE ROTATION',reason:`The profit trigger is active and Transfer ${net>=0?'maintains/improves':'almost replaces'} the income attached to the sold fraction. This is a credible rotation case, not an automatic sell.`};
    }
    if(metrics.profitPct>=6||net>0){
      return {code:'review',title:'REVIEW',reason:'One side of the case is attractive, but the combined capital-profit, income and concentration result is not strong enough for a positive rotation verdict.'};
    }
    if(scenario.incomeSurrendered>0&&replacementIncome<scenario.incomeSurrendered*.85){
      return {code:'keep',title:'KEEP',reason:'Transfer would replace less than 85% of the surrendered annual income and there is no meaningful +6% capital-profit case.'};
    }
    return {code:'keep',title:'KEEP',reason:'The current holding remains more compelling than the simulated rotation at this point.'};
  }

  function caseData(state=A().core.read()){
    const h=selectedHolding(state);
    if(!h)return null;
    const metrics=holdingMetrics(h);
    const mat=materiality(state,h,metrics);
    const scenario=scenarioMetrics(metrics);
    const exEvent=nextExDate(state,h,scenario);
    const sim=transferSimulation(state,h,scenario);
    const replacementIncome=num(sim.income);
    const netAnnual=replacementIncome-scenario.incomeSurrendered;
    const netMonthly=netAnnual/12;
    const coverage=scenario.incomeSurrendered>0?replacementIncome/scenario.incomeSurrendered*100:(replacementIncome>0?100:0);
    const profitYears=scenario.profitRealised>0&&scenario.incomeSurrendered>0?scenario.profitRealised/scenario.incomeSurrendered:null;
    const profitCushion=netAnnual<0&&scenario.profitRealised>0?scenario.profitRealised/Math.abs(netAnnual):null;
    const replacementYield=scenario.cashReleased>0?replacementIncome/scenario.cashReleased*100:0;
    const conc=concentration(state,h,scenario,sim);
    const verdict=buildVerdict({holding:h,metrics,mat,scenario,sim,exEvent,concentration:conc});
    return {holding:h,metrics,mat,scenario,exEvent,sim,replacementIncome,netAnnual,netMonthly,coverage,profitYears,profitCushion,replacementYield,concentration:conc,verdict};
  }

  function renderKpis(state){
    const rows=activeHoldings(state).map(h=>{
      const m=holdingMetrics(h),mat=materiality(state,h,m);
      return {h,m,mat};
    });
    const unlocked=rows.filter(x=>!x.h.locked&&String(x.h.status||'').toUpperCase()!=='LOCKED');
    const triggered=unlocked.filter(x=>x.m.profitPct>=6);
    set('kPositions',rows.length);
    set('kReview',triggered.filter(x=>!x.mat.micro).length);
    set('kStrong',triggered.filter(x=>!x.mat.micro&&x.m.profitPct>=10).length);
    set('kMicro',triggered.filter(x=>x.mat.micro).length);
    set('kScouts',arr(state.scouting?.targets).length);
    set('kGlobal',arr(state.scouting?.universe).length||arr(state.scouting?.targets).length);
  }

  function renderMarket(state){
    const rows=activeHoldings(state).map(h=>{
      const m=holdingMetrics(h),mat=materiality(state,h,m);
      return {h,m,mat,trigger:profitTrigger(state,h,m,mat)};
    }).sort((a,b)=>{
      if(a.trigger.code==='locked'&&b.trigger.code!=='locked')return 1;
      if(b.trigger.code==='locked'&&a.trigger.code!=='locked')return -1;
      if(a.mat.micro!==b.mat.micro)return a.mat.micro?1:-1;
      if((a.m.profitPct>=6)!==(b.m.profitPct>=6))return a.m.profitPct>=6?-1:1;
      return b.mat.priority-a.mat.priority||b.m.profit-a.m.profit;
    });

    const host=$('marketRows');
    if(!host)return;
    if(!rows.length){
      host.innerHTML='<tr><td colspan="10">No active Squad positions found.</td></tr>';
      return;
    }

    host.innerHTML=rows.map(({h,m,mat,trigger})=>{
      const key=holdingKey(h),selected=key===selectedKey;
      const plClass=m.profit>=0?'good-text':'bad-text';
      return `<tr class="${selected?'selected':''}">
        <td class="player"><strong>${esc(ticker(h.ticker))}</strong><span>${esc(h.name||ticker(h.ticker))}</span></td>
        <td>${esc(accountLabel(h.account))}</td>
        <td>${money(m.value)}</td>
        <td>${money(m.book)}</td>
        <td class="${plClass}">${m.profit>=0?'+':''}${money(m.profit)}</td>
        <td>${money(m.income)} / yr</td>
        <td class="${m.profitPct>=6&&!mat.micro?'gold-text':''}">${m.profitPct>=0?'+':''}${m.profitPct.toFixed(1)}%</td>
        <td>${mat.micro?'<span class="trigger micro">MICRO</span>':'<span class="trigger keep">MEANINGFUL</span>'}</td>
        <td><span class="trigger ${trigger.code}">${trigger.label}</span></td>
        <td><button class="btn secondary" type="button" data-review="${esc(key)}">Review</button></td>
      </tr>`;
    }).join('');
  }

  function renderSelect(state){
    const hs=activeHoldings(state);
    const el=$('holdingSelect');if(!el)return;
    if(!hs.length){el.innerHTML='<option value="">No Squad holdings</option>';selectedKey='';return}
    if(!selectedKey||!hs.some(h=>holdingKey(h)===selectedKey)){
      const preferred=hs
        .map(h=>({h,m:holdingMetrics(h),mat:materiality(state,h)}))
        .filter(x=>!x.h.locked)
        .sort((a,b)=>{
          if(a.mat.micro!==b.mat.micro)return a.mat.micro?1:-1;
          return b.mat.priority-a.mat.priority;
        })[0]?.h||hs[0];
      selectedKey=holdingKey(preferred);
    }
    el.innerHTML=[...hs]
      .sort((a,b)=>ticker(a.ticker).localeCompare(ticker(b.ticker))||accountCode(a.account).localeCompare(accountCode(b.account)))
      .map(h=>`<option value="${esc(holdingKey(h))}">${esc(ticker(h.ticker))} • ${esc(accountLabel(h.account))}${h.locked?' • LOCKED':''}</option>`)
      .join('');
    el.value=selectedKey;
  }

  function renderCustomPool(state,h){
    const host=$('customPool');if(!host)return;
    const candidates=eligibleCustomCandidates(state,ticker(h.ticker));
    host.style.display=lens==='custom'?'grid':'none';
    if(lens!=='custom')return;
    if(!candidates.length){
      host.innerHTML='<div class="empty-state compact"><strong>No eligible Active Scouts</strong><p>Promote candidates in Scouting first.</p></div>';
      return;
    }
    if(!customIds.size){
      candidates.slice(0,3).forEach(c=>customIds.add(String(c.id||ticker(c.ticker))));
    }
    host.innerHTML=candidates.slice(0,16).map(c=>{
      const id=String(c.id||ticker(c.ticker));
      return `<label class="custom-choice"><input type="checkbox" data-custom="${esc(id)}" ${customIds.has(id)?'checked':''}>
        <div><strong>${esc(ticker(c.ticker))} — ${esc(c.name||ticker(c.ticker))}</strong><span>${num(c.yieldPct).toFixed(2)}% yield • S ${Math.round(num(c.sustainableScore))} • M ${Math.round(num(c.maximumScore))} • ${esc(String(c.status||'caution').toUpperCase())}</span></div>
      </label>`;
    }).join('');
  }

  function renderMateriality(data){
    const box=$('materialityBox');
    if(!box)return;
    box.className=`materiality ${data.mat.micro?'micro':'good'}`;
    set('materialityTitle',data.mat.micro?'MICRO POSITION — percentage noise muted':'MATERIALLY MEANINGFUL POSITION');
    set('materialityMeta',data.mat.micro
      ?`Dynamic thresholds: value ${money(data.mat.valueFloor)} • capital P/L ${money(data.mat.profitFloor)} • income ${money(data.mat.incomeFloor)}/yr. This holding is below all three.`
      :`Aurora ranks this case using percentage gain plus actual £ profit, position value and annual income impact.`
    );
  }

  function renderBasket(data){
    const host=$('basketList');if(!host)return;
    const rows=arr(data.sim.allocations);
    set('basketMeta',rows.length
      ?`${rows.length} Transfer-sized replacement${rows.length===1?'':'s'} • ${money(data.sim.allocated)} invested • ${money(data.sim.remaining)} holdback • scenario only`
      :'Transfer could not build a replacement route from the current Active Scouting pool.'
    );
    if(!rows.length){
      host.innerHTML='<div class="empty-state compact"><strong>No Transfer simulation</strong><p>Promote/clear eligible candidates in Scouting, or select a different custom basket.</p></div>';
      return;
    }
    host.innerHTML=rows.map(r=>`<div class="basket-row">
      <div><strong>${esc(r.ticker)} — ${esc(r.name)}</strong><span>${esc(accountLabel(r.account))} • ${esc(String(r.scoutingStatus||'caution').toUpperCase())}${r.sector?' • '+esc(r.sector):''}</span></div>
      <div class="basket-num"><b>${money(r.amount)}</b><small>allocation</small></div>
      <div class="basket-num"><b>${num(r.yieldPct).toFixed(2)}%</b><small>yield</small></div>
      <div class="basket-num"><b>${money(r.expectedAnnualIncome)}</b><small>income / yr</small></div>
      <div class="basket-num"><b>${Math.round(num(r.scoutingScore))}/100</b><small>Scouting score</small></div>
      <div class="basket-num"><b>${num(r.concentrationFactor).toFixed(2)}×</b><small>route fit</small></div>
    </div>`).join('');
  }

  function paintSigned(id,value){
    const el=$(id);if(!el)return;
    el.classList.remove('good-text','bad-text');
    if(value>.005)el.classList.add('good-text');
    if(value<-.005)el.classList.add('bad-text');
  }

  function renderComparison(data){
    const old=data.scenario.incomeSurrendered,newInc=data.replacementIncome,net=data.netAnnual;
    set('oldIncome',money(old));
    set('newIncome',money(newInc));
    set('newIncomeMeta',`${arr(data.sim.allocations).length} Transfer allocation${arr(data.sim.allocations).length===1?'':'s'} • ${data.replacementYield.toFixed(2)}% on released cash`);
    set('netAnnual',`${net>=0?'+':''}${money(net)}`);paintSigned('netAnnual',net);
    set('netAnnualMeta',old>0?`${net>=0?'+':''}${(net/old*100).toFixed(1)}% versus surrendered income`:'No old dividend income to replace');
    set('netMonthly',`${data.netMonthly>=0?'+':''}${money(data.netMonthly)}`);paintSigned('netMonthly',data.netMonthly);
    set('incomeCoverage',old>0?`${data.coverage.toFixed(1)}%`:newInc>0?'NEW INCOME':'—');
    set('profitYears',data.profitYears!=null?`${data.profitYears.toFixed(1)} years`:'—');
    set('profitCushion',net>=0?'No erosion':data.profitCushion!=null?`${data.profitCushion.toFixed(1)} years`:'No cushion');
    set('replacementYield',`${data.replacementYield.toFixed(2)}%`);
    set('simHoldback',money(data.sim.remaining));

    const c=data.concentration;
    if(c){
      set('largestBefore',`${c.before.largestTickerPct.toFixed(1)}%`);
      set('largestBeforeMeta',`${c.before.largestTicker} • portfolio`);
      set('largestAfter',`${c.after.largestTickerPct.toFixed(1)}%`);
      set('largestAfterMeta',`${c.after.largestTicker} • simulated`);
      set('sectorAfter',c.after.largestSector!=='—'?`${c.after.largestSectorPct.toFixed(1)}%`:'—');
      set('sectorAfterMeta',c.after.largestSector!=='—'?`${c.after.largestSector} • known sectors only`:'No sector labels available');
    }else{
      set('largestBefore','—');set('largestAfter','—');set('sectorAfter','—');
    }
    set('comparisonLens',lens==='maximum'?'MAXIMUM':lens==='custom'?'CUSTOM':'SUSTAINABLE');
  }

  function renderVerdict(data){
    const card=$('verdictCard');
    if(card)card.className=`verdict-card ${data.verdict.code}`;
    set('verdictTitle',data.verdict.title);
    set('verdictReason',data.verdict.reason);
  }

  function renderCase(state){
    const first=selectedHolding(state);
    if(!first)return;
    renderCustomPool(state,first);

    // Custom mode may seed its first three choices on this render.
    const data=caseData(state);
    if(!data)return;
    const {holding:h,metrics:m,scenario:s,exEvent}=data;

    set('caseBadge',`${ticker(h.ticker)} • ${accountLabel(h.account)} • ${Math.round(s.fraction*100)}%`);
    set('caseShares',s.sharesSold.toLocaleString('en-GB',{maximumFractionDigits:6}));
    set('caseSharesMeta',`${s.sharesRemaining.toLocaleString('en-GB',{maximumFractionDigits:6})} shares remain`);
    set('caseCash',money(s.cashReleased));
    set('caseProfit',`${s.profitRealised>=0?'+':''}${money(s.profitRealised)}`);paintSigned('caseProfit',s.profitRealised);
    set('caseProfitMeta',`${m.profitPct>=0?'+':''}${m.profitPct.toFixed(2)}% holding gain • ${money(s.bookReleased)} book cost sold`);
    set('caseIncomeLost',`${money(s.incomeSurrendered)} / yr`);
    set('caseIncomeMeta',`${money(s.incomeSurrendered/12)} / month surrendered`);

    if(exEvent){
      set('caseExDate',dateLabel(exEvent.exDate));
      set('caseExMeta',exEvent.days===0?'Ex-date is today':`${exEvent.days} day${exEvent.days===1?'':'s'} away • ${String(exEvent.status||'FORECAST').toUpperCase()}`);
      set('caseDividendRisk',money(exEvent.dividendAtRisk));
      set('caseDividendRiskMeta',exEvent.dividendAtRisk>0
        ?`${Math.round(s.fraction*100)}% sale before ${dateLabel(exEvent.exDate)}`
        :'Upcoming event loaded, but no per-share/expected amount is available.'
      );
    }else{
      set('caseExDate','No upcoming');
      set('caseExMeta','No future ex-date loaded in Income for this account position.');
      set('caseDividendRisk','—');
      set('caseDividendRiskMeta','No upcoming dividend event to value.');
    }

    renderMateriality(data);
    renderBasket(data);
    renderComparison(data);
    renderVerdict(data);
  }

  function render(){
    const state=A().core.read();
    renderKpis(state);
    renderSelect(state);
    renderMarket(state);
    renderCase(state);
    document.querySelectorAll('[data-lens]').forEach(b=>b.classList.toggle('active',b.dataset.lens===lens));
    document.querySelectorAll('[data-sale]').forEach(b=>b.classList.toggle('active',Math.abs(num(b.dataset.sale)-saleFraction)<.001));
    set('lensNote',
      lens==='custom'
        ?'Custom mode chooses the eligible players; Transfer still applies its own sizing, increments and holdback rules.'
        :`${lens==='maximum'?'Maximum Income':'Sustainable'} mode uses Transfer's shared route engine with the selected holding reduced before concentration is tested.`
    );
    set('lastUpdated',new Date(state.updatedAt).toLocaleString('en-GB'));
  }

  function wire(){
    $('holdingSelect')?.addEventListener('change',e=>{
      selectedKey=e.target.value;
      customIds.clear();
      render();
    });
    $('refreshCase')?.addEventListener('click',()=>{
      render();
      toast('Chairman case refreshed from Squad, Income, Scouting and Transfer.');
    });
    document.querySelectorAll('[data-sale]').forEach(b=>b.addEventListener('click',()=>{
      saleFraction=Math.max(.25,Math.min(1,num(b.dataset.sale)||1));
      render();
    }));
    document.querySelectorAll('[data-lens]').forEach(b=>b.addEventListener('click',()=>{
      lens=b.dataset.lens;
      if(lens!=='custom')customIds.clear();
      render();
    }));
    document.addEventListener('click',e=>{
      const review=e.target.closest('[data-review]');
      if(review){
        selectedKey=review.dataset.review;
        customIds.clear();
        render();
        $('rotationCase')?.scrollIntoView({behavior:'smooth',block:'start'});
      }
    });
    document.addEventListener('change',e=>{
      const box=e.target.closest('[data-custom]');
      if(!box)return;
      const id=box.dataset.custom;
      if(box.checked)customIds.add(id);else customIds.delete(id);
      render();
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{wire();render()});
  w.addEventListener('aurora2:state',render);

  w.Aurora2=w.Aurora2||{};
  w.Aurora2.clubControl={
    holdingMetrics,
    materiality,
    scenarioMetrics,
    buildVerdict,
    caseData
  };
})(window);
