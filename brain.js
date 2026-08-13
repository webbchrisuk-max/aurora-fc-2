(function(w){
  'use strict';
  const A=()=>w.Aurora2;
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const money=v=>A().ui.money(num(v));
  const esc=v=>A().ui.escape(v);
  const now=()=>new Date().toISOString();
  const ENDPOINT_KEY='aurora2:brain:endpoint';
  const TOKEN_KEY='aurora2:brain:token';
  const CHAT_KEY='aurora2:brain:history:v1';
  const BRAIN_VERSION='0.1.1';

  function toast(msg){
    const el=$('toast');if(!el)return;el.textContent=msg;el.style.opacity='1';
    clearTimeout(w.__brainToast);w.__brainToast=setTimeout(()=>el.style.opacity='0',2400);
  }
  function set(id,v){const el=$(id);if(el)el.textContent=v}
  function state(){return A().core.read()}
  function account(v){
    const s=String(v||'').toLowerCase();
    if(s.includes('212'))return 'T212';
    if(/\big\b/.test(s)||s.includes('ig isa'))return 'IG';
    return String(v||'').toUpperCase();
  }
  function activeHoldings(s){return arr(s.squad?.holdings).filter(h=>num(h.shares)>0&&!['SOLD','ARCHIVED'].includes(String(h.status||'').toUpperCase()))}
  function confirmedDrafts(s){return arr(s.transfer?.registrationDrafts).filter(d=>d.status==='CONFIRMED')}
  function confirmedReceipts(s){return arr(s.registration?.receipts)}
  function route(s){return s.transfer?.route||null}
  function allocations(s){return arr(route(s)?.allocations).filter(a=>num(a.amount)>0)}
  function latestConfirmed(s){
    return [...confirmedDrafts(s)].sort((a,b)=>String(b.confirmedAt||b.updatedAt||'').localeCompare(String(a.confirmedAt||a.updatedAt||'')))[0]||null;
  }
  function latestForHolding(s,accountCode,ticker){
    return confirmedDrafts(s)
      .filter(d=>account(d.account)===account(accountCode)&&String(d.ticker||'').toUpperCase()===String(ticker||'').toUpperCase())
      .sort((a,b)=>String(b.confirmedAt||b.updatedAt||'').localeCompare(String(a.confirmedAt||a.updatedAt||'')))[0]||null;
  }

  function finding(severity,title,note,code){
    return {severity,title,note,code};
  }

  function audit(s=state()){
    const findings=[];
    const holdings=activeHoldings(s);
    const receipts=confirmedReceipts(s);
    const drafts=confirmedDrafts(s);
    const r=route(s);
    const mission=s.mission||null;

    const derivedValue=holdings.reduce((t,h)=>t+num(h.marketValueGbp),0);
    const derivedIncome=holdings.reduce((t,h)=>t+num(h.annualIncomeGbp),0);
    const portfolioValue=num(s.portfolio?.teamValue);
    const portfolioIncome=num(s.portfolio?.annualIncome);
    const portfolioSize=num(s.portfolio?.squadSize);

    if(holdings.length){
      const valueDiff=Math.abs(portfolioValue-derivedValue);
      if(portfolioValue>0&&valueDiff>Math.max(1,derivedValue*.002)){
        findings.push(finding('caution','HQ team value differs from Squad',`${money(portfolioValue)} on HQ versus ${money(derivedValue)} derived from active holdings.`,'PORTFOLIO_VALUE_MISMATCH'));
      }else findings.push(finding('pass','Team value reconciles',`${money(derivedValue)} derived from ${holdings.length} active holdings.`,'PORTFOLIO_VALUE_OK'));

      const incomeDiff=Math.abs(portfolioIncome-derivedIncome);
      if(portfolioIncome>0&&incomeDiff>0.05){
        findings.push(finding('caution','Annual income differs from Squad',`${money(portfolioIncome)} on HQ versus ${money(derivedIncome)} derived from holdings.`,'PORTFOLIO_INCOME_MISMATCH'));
      }else findings.push(finding('pass','Annual income reconciles',`${money(derivedIncome)} annual income derived from Squad.`,'PORTFOLIO_INCOME_OK'));

      if(portfolioSize>0&&portfolioSize!==holdings.length){
        findings.push(finding('caution','Squad size differs from HQ',`${portfolioSize} on HQ versus ${holdings.length} active holdings.`,'SQUAD_SIZE_MISMATCH'));
      }
    }else findings.push(finding('block','No active holdings found','Aurora Brain cannot reconcile portfolio totals without active Squad holdings.','NO_HOLDINGS'));

    holdings.forEach(h=>{
      if(num(h.shares)>0&&num(h.bookCostGbp)>0){
        const expected=num(h.bookCostGbp)/num(h.shares);
        if(Math.abs(expected-num(h.avgCostGbp))>0.02){
          findings.push(finding('caution',`${h.ticker} average cost mismatch`,`${money(h.bookCostGbp)} ÷ ${num(h.shares)} = ${money(expected)}, stored ${money(h.avgCostGbp)}.`,'AVG_COST_MISMATCH'));
        }
      }
      if(num(h.shares)>0&&num(h.annualDpsGbp)>0){
        const expected=num(h.shares)*num(h.annualDpsGbp);
        if(Math.abs(expected-num(h.annualIncomeGbp))>0.05){
          findings.push(finding('caution',`${h.ticker} income mismatch`,`Shares × annual DPS gives ${money(expected)}, stored ${money(h.annualIncomeGbp)}.`,'HOLDING_INCOME_MISMATCH'));
        }
      }
      const latest=latestForHolding(s,h.account,h.ticker);
      if(latest&&num(latest.newShares)>0&&num(latest.newShares)!==num(h.shares)){
        const newer=arr(s.transfer?.registrationDrafts).some(d=>
          d.status==='CONFIRMED'&&account(d.account)===account(h.account)&&String(d.ticker||'').toUpperCase()===String(h.ticker||'').toUpperCase()&&
          String(d.confirmedAt||d.updatedAt||'')>String(latest.confirmedAt||latest.updatedAt||'')
        );
        if(!newer){
          findings.push(finding('caution',`${h.ticker} latest registration does not match Squad`,`Latest confirmed registration ended at ${num(latest.newShares)} shares; Squad currently shows ${num(h.shares)}.`,'LATEST_SHARE_MISMATCH'));
        }
      }
    });

    const ids=new Map();
    arr(s.transfer?.registrationDrafts).forEach(d=>{
      if(!d.transactionId)return;
      ids.set(d.transactionId,(ids.get(d.transactionId)||0)+1);
    });
    [...ids.entries()].filter(([,count])=>count>1).forEach(([id,count])=>{
      findings.push(finding('block','Duplicate local transaction ID',`${id} appears ${count} times in Registration drafts.`,'DUPLICATE_TX'));
    });

    drafts.forEach(d=>{
      if(String(d.currency||'GBP').toUpperCase()!=='GBP'){
        if(!(num(d.fxRateToGbp)>0))findings.push(finding('block',`${d.ticker} confirmed without FX`,`Confirmed non-GBP transaction ${d.transactionId} has no valid FX rate.`,'MISSING_FX'));
        const expected=num(d.totalCostNative)*num(d.fxRateToGbp);
        if(num(d.totalCostNative)>0&&num(d.fxRateToGbp)>0&&Math.abs(expected-num(d.totalCostGbp))>0.03){
          findings.push(finding('block',`${d.ticker} GBP cost does not reconcile`,`Native ${num(d.totalCostNative).toFixed(2)} × FX ${num(d.fxRateToGbp).toFixed(6)} = ${money(expected)}, stored ${money(d.totalCostGbp)}.`,'FX_RECONCILIATION'));
        }
      }
      if(!receipts.some(rp=>rp.transactionId===d.transactionId)){
        findings.push(finding('caution',`${d.ticker} confirmed locally without receipt`,`Transaction ${d.transactionId} has no matching local backend receipt.`,'MISSING_RECEIPT'));
      }
    });

    receipts.forEach(rp=>{
      if(!drafts.some(d=>d.transactionId===rp.transactionId)){
        findings.push(finding('caution',`${rp.ticker} receipt has no confirmed local draft`,`Receipt ${rp.transactionId} is present but no confirmed draft matches it.`,'ORPHAN_RECEIPT'));
      }
    });

    if(mission&&r){
      if(r.missionId&&mission.id&&r.missionId!==mission.id){
        findings.push(finding('block','Mission and Transfer route are disconnected',`Mission ${mission.id} does not match route mission ${r.missionId}.`,'MISSION_ROUTE_MISMATCH'));
      }else findings.push(finding('pass','Mission and route are linked',`${mission.id||'Mission'} owns route ${r.id||'current route'}.`,'MISSION_ROUTE_OK'));

      const planned=allocations(s).reduce((t,a)=>t+num(a.amount),0);
      const storedAllocated=num(r.allocated);
      if(Math.abs(planned-storedAllocated)>0.02){
        findings.push(finding('caution','Route allocation total mismatch',`${money(planned)} from allocations versus ${money(storedAllocated)} stored route allocation.`,'ROUTE_TOTAL_MISMATCH'));
      }
    }

    const regErrors=arr(s.transfer?.registrationDrafts).filter(d=>d.status==='BACKEND_ERROR');
    if(regErrors.length) findings.push(finding('caution','Registration errors remain in queue',`${regErrors.length} backend-error draft${regErrors.length===1?'':'s'} still stored locally.`,'REG_ERRORS'));

    if(String(s.registration?.backend?.status||'').toUpperCase()==='CONNECTED'){
      findings.push(finding('pass','AuroraData 2 is connected','Registration backend reports CONNECTED.','BACKEND_OK'));
    }else{
      findings.push(finding('caution','AuroraData 2 is not currently marked connected',String(s.registration?.backend?.lastError||'Registration backend is not CONNECTED in local state.'),'BACKEND_STATUS'));
    }

    const counts={
      pass:findings.filter(f=>f.severity==='pass').length,
      caution:findings.filter(f=>f.severity==='caution').length,
      block:findings.filter(f=>f.severity==='block').length
    };
    const score=Math.max(0,Math.min(100,100-counts.block*18-counts.caution*5));
    return {at:now(),findings,counts,score,derived:{teamValue:derivedValue,annualIncome:derivedIncome,squadSize:holdings.length}};
  }

  function renderAudit(result){
    set('healthScore',String(result.score));
    set('healthLabel',result.counts.block?'ACTION REQUIRED':result.counts.caution?'CHECKS NEEDED':'HEALTHY');
    set('healthMeta',`${result.counts.pass} pass • ${result.counts.caution} caution • ${result.counts.block} block`);
    set('kFindings',String(result.findings.length));
    set('kFindingsMeta',`${result.counts.caution+result.counts.block} need attention`);
    set('auditTime',new Date(result.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
    const box=$('guardianList');
    if(box)box.innerHTML=result.findings.length?result.findings.map(f=>{
      const icon=f.severity==='pass'?'✓':f.severity==='block'?'⛔':'⚠';
      return `<div class="guardian-row"><div class="guardian-icon">${icon}</div><div class="guardian-main"><strong>${esc(f.title)}</strong><span>${esc(f.note)}</span></div><span class="guardian-pill ${f.severity}">${f.severity}</span></div>`;
    }).join(''):'<div class="notice">No findings.</div>';
    w.__auroraBrainAudit=result;
    renderObservation(state(),result);
  }

  function renderKPIs(s){
    const holdings=activeHoldings(s);
    const teamValue=holdings.reduce((t,h)=>t+num(h.marketValueGbp),0);
    const annual=holdings.reduce((t,h)=>t+num(h.annualIncomeGbp),0);
    const receipts=confirmedReceipts(s);
    const r=route(s),mission=s.mission;
    const confirmed=receipts.filter(x=>!r?.id||x.routeId===r.id).reduce((t,x)=>t+num(x.totalCostGbp),0);
    set('kTeamValue',money(teamValue));
    set('kAnnualIncome',money(annual));
    set('kMonthlyIncome',`${money(annual/12)} / month`);
    set('kMissionBudget',mission?money(num(mission.approvedBudget||r?.financeBudget)):money(num(r?.financeBudget)));
    set('kMissionStatus',mission?.status||r?.status||'No active mission');
    set('kConfirmed',money(confirmed));
    set('kConfirmedCount',`${receipts.length} receipt${receipts.length===1?'':'s'}`);
    set('lastUpdated',s.updatedAt?new Date(s.updatedAt).toLocaleString('en-GB'):'—');
  }

  function nextPendingAllocation(s){
    return allocations(s).find(a=>{
      const d=arr(s.transfer?.registrationDrafts).find(x=>x.allocationId===a.id&&x.routeId===route(s)?.id&&x.status!=='CANCELLED');
      return d?.status!=='CONFIRMED';
    })||null;
  }

  function renderObservation(s,result){
    const r=route(s),m=s.mission,next=nextPendingAllocation(s),latest=latestConfirmed(s);
    set('obsMission',m?`${m.status||'ACTIVE'} • ${money(num(m.approvedBudget||r?.financeBudget))}`:'No active mission');
    set('obsRoute',r?`${r.strategy||'—'} • ${allocations(s).length} allocations • ${r.status||'—'}`:'No route');
    set('obsNext',next?`${next.ticker} • ${account(next.account)} • planned ${money(next.amount)}`:'No unconfirmed allocation');
    set('obsLatest',latest?`${latest.ticker} • ${account(latest.account)} • ${money(latest.totalCostGbp)}`:'No confirmed purchase');
    let text;
    if(result.counts.block){
      const first=result.findings.find(f=>f.severity==='block');
      text=`Guardian found ${result.counts.block} blocking issue${result.counts.block===1?'':'s'}. First priority: ${first.title}. ${first.note}`;
    }else if(result.counts.caution){
      const first=result.findings.find(f=>f.severity==='caution');
      text=`Aurora is broadly coherent, with ${result.counts.caution} check${result.counts.caution===1?'':'s'} worth reviewing. First check: ${first.title}. ${first.note}`;
    }else if(next){
      text=`Aurora data reconciles cleanly. The active route still has an unconfirmed allocation for ${next.ticker}. Wait for the broker execution, then register the actual fill rather than the planned amount.`;
    }else{
      text='Aurora data reconciles cleanly and no unconfirmed route allocation is currently waiting.';
    }
    set('brainObservation',text);
  }

  function config(){
    return {endpoint:String(localStorage.getItem(ENDPOINT_KEY)||'').trim(),token:String(localStorage.getItem(TOKEN_KEY)||'').trim()};
  }
  function loadConfig(){
    const c=config();
    if($('brainEndpoint'))$('brainEndpoint').value=c.endpoint;
    if($('brainToken'))$('brainToken').value=c.token;
    set('connectionState',c.endpoint&&c.token?'CONFIGURED':'NOT CONFIGURED');
    set('brainModeBadge',c.endpoint&&c.token?'AI + LOCAL GUARDIAN':'LOCAL GUARDIAN');
    set('aiStatus',c.endpoint&&c.token?'AI READY':'LOCAL MODE');
  }
  function saveConfig(){
    const e=String($('brainEndpoint')?.value||'').trim(),t=String($('brainToken')?.value||'').trim();
    if(e)localStorage.setItem(ENDPOINT_KEY,e);else localStorage.removeItem(ENDPOINT_KEY);
    if(t)localStorage.setItem(TOKEN_KEY,t);else localStorage.removeItem(TOKEN_KEY);
    loadConfig();toast('Brain connection saved.');
  }
  function clearConfig(){
    localStorage.removeItem(ENDPOINT_KEY);localStorage.removeItem(TOKEN_KEY);
    if($('brainEndpoint'))$('brainEndpoint').value='';
    if($('brainToken'))$('brainToken').value='';
    loadConfig();set('connectionNote','Brain connection cleared. Local Guardian remains available.');
  }

  function safeSnapshot(s,auditResult){
    const holdings=activeHoldings(s).map(h=>({
      ticker:h.ticker,name:h.name,account:account(h.account),shares:num(h.shares),bookCostGbp:num(h.bookCostGbp),
      avgCostGbp:num(h.avgCostGbp),marketValueGbp:num(h.marketValueGbp),livePriceGbp:num(h.livePriceGbp),
      annualIncomeGbp:num(h.annualIncomeGbp),annualDpsGbp:num(h.annualDpsGbp),sector:h.sector,role:h.role,status:h.status,
      source:h.source,sourceUpdatedAt:h.sourceUpdatedAt
    }));
    const r=route(s);
    return {
      generatedAt:now(),
      portfolio:{
        teamValue:holdings.reduce((t,h)=>t+h.marketValueGbp,0),
        annualIncome:holdings.reduce((t,h)=>t+h.annualIncomeGbp,0),
        monthlyIncome:holdings.reduce((t,h)=>t+h.annualIncomeGbp,0)/12,
        squadSize:holdings.length
      },
      mission:s.mission?{
        id:s.mission.id,status:s.mission.status,paydayDate:s.mission.paydayDate,approvedBudget:num(s.mission.approvedBudget),
        financeSnapshot:s.mission.financeSnapshot?{
          totalCash:num(s.mission.financeSnapshot.totalCash),commitments:num(s.mission.financeSnapshot.commitments),
          protectedCash:num(s.mission.financeSnapshot.protectedCash),safeSurplus:num(s.mission.financeSnapshot.safeSurplus),
          expectedWages:num(s.mission.financeSnapshot.expectedWages),wagesReceived:num(s.mission.financeSnapshot.wagesReceived)
        }:null
      }:null,
      route:r?{
        id:r.id,missionId:r.missionId,strategy:r.strategy,status:r.status,locked:!!r.locked,
        financeBudget:num(r.financeBudget),allocated:num(r.allocated),remaining:num(r.remaining),
        expectedAnnualIncome:num(r.expectedAnnualIncome),
        allocations:allocations(s).map(a=>({
          id:a.id,ticker:a.ticker,name:a.name,account:account(a.account),amount:num(a.amount),
          yieldPct:num(a.yieldPct),expectedAnnualIncome:num(a.expectedAnnualIncome),score:num(a.score),reason:a.reason,status:a.status
        }))
      }:null,
      registration:{
        confirmed:confirmedDrafts(s).map(d=>({
          transactionId:d.transactionId,tradeDate:d.tradeDate,ticker:d.ticker,account:account(d.account),shares:num(d.shares),
          priceInput:num(d.priceInput),priceUnit:d.priceUnit,currency:d.currency,fxRateToGbp:num(d.fxRateToGbp),
          totalCostNative:num(d.totalCostNative),totalCostGbp:num(d.totalCostGbp),plannedAmount:num(d.plannedAmount),
          differenceGbp:num(d.differenceGbp),previousShares:num(d.previousShares),newShares:num(d.newShares),
          previousBookCostGbp:num(d.previousBookCostGbp),newBookCostGbp:num(d.newBookCostGbp),
          expectedAnnualIncomeGbp:num(d.expectedAnnualIncomeGbp),confirmedAt:d.confirmedAt
        })),
        pending:arr(s.transfer?.registrationDrafts).filter(d=>d.status!=='CONFIRMED'&&d.status!=='CANCELLED').map(d=>({
          ticker:d.ticker,account:account(d.account),status:d.status,plannedAmount:num(d.plannedAmount),error:d.error||''
        }))
      },
      holdings,
      scouting:arr(s.scouting?.targets).map(t=>({
        ticker:t.ticker,name:t.name,preferredAccount:account(t.preferredAccount),status:t.status,recommendation:t.recommendation,
        reason:t.reason,rank:num(t.rank),yieldPct:num(t.yieldPct),sustainableScore:num(t.sustainableScore),
        maximumScore:num(t.maximumScore),confidence:num(t.confidence),dividendSafety:num(t.dividendSafety),
        incomeScore:num(t.incomeScore),valuationScore:num(t.valuationScore),portfolioFit:num(t.portfolioFit),
        sourceUpdatedAt:t.sourceUpdatedAt,lastAssessedAt:t.lastAssessedAt
      })),
      income:{
        nextDividend:s.income?.nextDividend||null,
        history:arr(s.income?.history).slice(-12)
      },
      guardian:{
        score:auditResult.score,
        findings:auditResult.findings.filter(f=>f.severity!=='pass').map(f=>({severity:f.severity,title:f.title,note:f.note,code:f.code}))
      }
    };
  }

  async function postBrain(action,payload={}){
    const c=config();
    if(!c.endpoint||!c.token)throw new Error('Private Brain backend is not configured.');
    let res;
    try{
      res=await fetch(c.endpoint,{
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({action,token:c.token,...payload}),
        cache:'no-store',redirect:'follow'
      });
    }catch(err){throw new Error('Could not reach Brain backend: '+(err?.message||err))}
    const text=await res.text();
    let data;try{data=JSON.parse(text)}catch(_){throw new Error('Brain backend returned a non-JSON response.')}
    if(!res.ok||data?.ok===false)throw new Error(data?.message||data?.error||('Brain HTTP '+res.status));
    return data;
  }

  function localAnswer(question,s,a){
    const q=String(question||'').toLowerCase();
    const next=nextPendingAllocation(s),r=route(s),latest=latestConfirmed(s);
    const annual=activeHoldings(s).reduce((t,h)=>t+num(h.annualIncomeGbp),0);
    const receipts=confirmedReceipts(s);
    const confirmedCurrent=receipts.filter(x=>!r?.id||x.routeId===r.id).reduce((t,x)=>t+num(x.totalCostGbp),0);
    const budget=num(s.mission?.approvedBudget||r?.financeBudget);
    if(/next|what.*do|action/.test(q)){
      if(a.counts.block){const f=a.findings.find(x=>x.severity==='block');return `First fix the blocking Guardian issue: ${f.title}. ${f.note}`}
      if(next)return `The next Aurora step is to wait for the broker fill for ${next.ticker} (${account(next.account)}, planned ${money(next.amount)}). Once it executes, enter the actual shares, price and broker GBP cost in Registration and confirm it.`
      return 'There is no unconfirmed allocation in the current route. Review the mission totals and decide whether any leftover cash should roll forward.';
    }
    if(/left|remain|budget|mission/.test(q)){
      return `Current mission budget: ${money(budget)}. Backend-confirmed cost on the current route: ${money(confirmedCurrent)}. Difference versus budget: ${money(Math.max(0,budget-confirmedCurrent))}. This is not necessarily spendable leftover until all pending broker orders have executed.`;
    }
    if(/income|dividend/.test(q)){
      const lastIncome=num(latest?.expectedAnnualIncomeGbp);
      return `Current annual income derived from Squad is ${money(annual)} (${money(annual/12)} per month annualised). The latest confirmed purchase ${latest?`${latest.ticker} added approximately ${money(lastIncome)}/year`:'is not available in local Registration history'}.`;
    }
    if(/audit|reconcile|health|wrong|error/.test(q)){
      const attention=a.findings.filter(x=>x.severity!=='pass');
      return attention.length
        ? `Guardian score ${a.score}/100. ${attention.length} finding${attention.length===1?'':'s'} need attention:\n`+attention.map(x=>`• ${x.title}: ${x.note}`).join('\n')
        : `Guardian score ${a.score}/100. No caution or blocking findings were detected.`;
    }
    if(/route|why|transfer/.test(q)){
      if(!r)return 'There is no current Transfer route to explain.';
      const rows=allocations(s).map(x=>`${x.ticker} ${money(x.amount)} (${account(x.account)})${x.reason?` — ${x.reason}`:''}`);
      return `Current route uses the ${r.strategy||'unknown'} strategy with ${rows.length} allocations:\n${rows.map(x=>'• '+x).join('\n')}\nLocal mode can report Aurora's stored reasons; connect AI for a fuller natural-language comparison of scores and trade-offs.`;
    }
    return `Local Brain can answer mission status, next action, income, route and data-audit questions. Current Guardian score is ${a.score}/100. Connect the private AI backend for broader natural-language analysis.`;
  }

  async function ask(question){
    const q=String(question||'').trim();if(!q){toast('Ask Aurora a question.');return}
    const s=state(),a=w.__auroraBrainAudit||audit(s);renderAudit(a);
    set('brainAnswer','Thinking…');
    const c=config();
    if(!c.endpoint||!c.token){
      set('brainAnswer',localAnswer(q,s,a));set('aiStatus','LOCAL MODE');return;
    }
    try{
      set('aiStatus','AI THINKING');
      const data=await postBrain('ask',{question:q,snapshot:safeSnapshot(s,a)});
      set('brainAnswer',String(data.answer||'No answer returned.'));
      set('aiStatus',`AI READY${data.model?' • '+data.model:''}`);
      saveHistory(q,String(data.answer||''));      
    }catch(err){
      set('brainAnswer',`AI backend unavailable: ${err.message}\n\nLocal Guardian answer:\n${localAnswer(q,s,a)}`);
      set('aiStatus','AI ERROR • LOCAL FALLBACK');
    }
  }

  function saveHistory(question,answer){
    let rows=[];try{rows=JSON.parse(localStorage.getItem(CHAT_KEY)||'[]')}catch(_){}
    rows=Array.isArray(rows)?rows:[];
    rows.unshift({question,answer,at:now()});
    localStorage.setItem(CHAT_KEY,JSON.stringify(rows.slice(0,20)));
  }

  async function testConnection(){
    saveConfig();
    set('connectionState','CHECKING');
    try{
      const data=await postBrain('health',{});
      set('connectionState','CONNECTED');
      set('connectionNote',`Brain backend connected${data.model?' • '+data.model:''}. OpenAI key remains server-side.`);
      set('brainModeBadge','AI + LOCAL GUARDIAN');set('aiStatus','AI READY');
      toast('Aurora Brain connected.');
    }catch(err){
      set('connectionState','ERROR');set('connectionNote',err.message);set('aiStatus','LOCAL MODE');
      toast('Brain connection failed.');
    }
  }

  function wire(){
    if(w.__auroraBrainWired)return;
    w.__auroraBrainWired=true;
    loadConfig();
    set('connectionNote',config().endpoint&&config().token
      ? `Aurora Brain ${BRAIN_VERSION} loaded • connection saved. Click Test AI.`
      : `Aurora Brain ${BRAIN_VERSION} loaded • Local Guardian ready. Add the private AI connection when wanted.`);
    const s=state();renderKPIs(s);renderAudit(audit(s));
    $('runAudit')?.addEventListener('click',()=>{const s=state();renderKPIs(s);renderAudit(audit(s));toast('Guardian audit complete.');});
    $('askBrain')?.addEventListener('click',()=>ask($('question')?.value));
    $('askNextAction')?.addEventListener('click',()=>{if($('question'))$('question').value='What is the most important thing I should do next in Aurora?';ask($('question')?.value)});
    document.querySelectorAll('[data-question]').forEach(btn=>btn.addEventListener('click',()=>{const q=btn.getAttribute('data-question')||'';if($('question'))$('question').value=q;ask(q)}));
    $('question')?.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')ask($('question')?.value)});
    $('saveBrainConnection')?.addEventListener('click',saveConfig);
    $('testBrainConnection')?.addEventListener('click',testConnection);
    $('clearBrainConnection')?.addEventListener('click',clearConfig);
    w.addEventListener('aurora2:state',e=>{renderKPIs(e.detail||state());renderAudit(audit(e.detail||state()))});
  }
  // brain.html loads this file dynamically for automatic cache-busting.
  // Dynamic scripts can finish AFTER DOMContentLoaded, so initialise immediately
  // when the page is already ready; otherwise wait once for DOMContentLoaded.
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',wire,{once:true});
  }else{
    wire();
  }
})(window);
