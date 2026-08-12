(function(w){
  'use strict';

  const A=()=>w.Aurora2;
  const $=id=>document.getElementById(id);
  const esc=s=>A().ui.escape(s);
  const money=v=>A().ui.money(v);
  const numValue=id=>{
    const el=$(id), n=Number(el?.value);
    return Number.isFinite(n)?Math.max(0,n):0;
  };
  const value=id=>$(id)?.value||'';
  const setValue=(id,v)=>{const el=$(id);if(el)el.value=v??''};
  const isoNow=()=>new Date().toISOString();

  function parseLocalDate(v){
    if(!v)return null;
    const d=new Date(`${v}T12:00:00`);
    return Number.isNaN(d.getTime())?null:d;
  }
  function dateISO(d){
    if(!(d instanceof Date)||Number.isNaN(d.getTime()))return '';
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function addMonthsClamped(d,months){
    const src=new Date(d.getTime()), day=src.getDate();
    src.setDate(1); src.setMonth(src.getMonth()+months);
    const last=new Date(src.getFullYear(),src.getMonth()+1,0).getDate();
    src.setDate(Math.min(day,last));
    return src;
  }
  function nextDue(date,frequency){
    const d=parseLocalDate(date);
    if(!d)return '';
    if(frequency==='weekly') d.setDate(d.getDate()+7);
    else if(frequency==='4-weeks') d.setDate(d.getDate()+28);
    else if(frequency==='5-weeks') d.setDate(d.getDate()+35);
    else if(frequency==='monthly') return dateISO(addMonthsClamped(d,1));
    else if(frequency==='yearly') return dateISO(addMonthsClamped(d,12));
    else return date;
    return dateISO(d);
  }
  function daysFromToday(date){
    const d=parseLocalDate(date), t=new Date(); t.setHours(12,0,0,0);
    if(!d)return null;
    return Math.round((d-t)/86400000);
  }
  function potFunded(p){
    const balance=Math.max(0,Number(p?.balance)||0);
    return p?.goalMode==='funded-progress'
      ? balance+Math.max(0,Number(p?.spent)||0)
      : balance;
  }
  function potGap(p){return Math.max(0,(Number(p?.target)||0)-potFunded(p))}
  function activePots(state){return (state.finance?.pots||[]).filter(p=>!p.archived)}
  function activeBills(state){return (state.finance?.bills||[]).filter(b=>!b.archived)}


  function cleanName(v){return String(v??'').trim().toLowerCase().replace(/\s+/g,' ')}
  function isHoldingPotName(v){return cleanName(v)==='holding pot'}
  function holdingPot(state){return activePots(state).find(p=>isHoldingPotName(p.name))||null}

  function occurrenceCountForUndatedBill(bill,payday,nextPayday){
    if(!payday||!nextPayday)return 0;
    const days=Math.max(1,Math.round((nextPayday-payday)/86400000));
    const frequency=String(bill.frequency||'one-off');
    if(frequency==='weekly')return Math.max(1,Math.ceil(days/7));
    if(frequency==='4-weeks')return Math.max(1,Math.ceil(days/28));
    if(frequency==='5-weeks')return Math.max(1,Math.ceil(days/35));
    if(frequency==='monthly')return Math.max(1,Math.round(days/30.4375));
    // Yearly and one-off bills require a real date so annual smoothing
    // cannot silently put them into the wrong funding year.
    return 0;
  }

  function projectBillOccurrences(bill,payday,nextPayday){
    if(!bill||bill.paid||bill.archived||bill.included===false||!payday||!nextPayday)return [];
    const amount=Math.max(0,Number(bill.amount)||0);
    if(amount<=0)return [];
    const frequency=String(bill.frequency||'one-off');
    const due=parseLocalDate(bill.due);
    const out=[];

    if(!due){
      const count=occurrenceCountForUndatedBill(bill,payday,nextPayday);
      for(let i=0;i<count;i++){
        out.push({
          billId:bill.id,billName:bill.name,amount,date:'',
          fundingSource:bill.fundingSource,frequency,estimated:true,overdue:false
        });
      }
      return out;
    }

    if(frequency==='one-off'){
      if(due.getTime()<nextPayday.getTime()){
        out.push({
          billId:bill.id,billName:bill.name,amount,date:dateISO(due),
          fundingSource:bill.fundingSource,frequency,estimated:false,
          overdue:due.getTime()<payday.getTime()
        });
      }
      return out;
    }

    let cursor=new Date(due.getTime()), guard=0;

    // Protect one overdue occurrence, then fast-forward to the current
    // payday cycle rather than inventing months of old missed payments.
    if(cursor.getTime()<payday.getTime()){
      out.push({
        billId:bill.id,billName:bill.name,amount,date:dateISO(cursor),
        fundingSource:bill.fundingSource,frequency,estimated:false,overdue:true
      });
      let next=parseLocalDate(nextDue(dateISO(cursor),frequency));
      while(next&&next.getTime()<payday.getTime()&&guard++<120){
        const after=parseLocalDate(nextDue(dateISO(next),frequency));
        if(!after||after.getTime()===next.getTime())break;
        next=after;
      }
      cursor=next;
    }

    guard=0;
    while(cursor&&cursor.getTime()<nextPayday.getTime()&&guard++<120){
      if(!(out.length&&out[0].overdue&&out[0].date===dateISO(cursor))){
        out.push({
          billId:bill.id,billName:bill.name,amount,date:dateISO(cursor),
          fundingSource:bill.fundingSource,frequency,estimated:false,overdue:false
        });
      }
      const next=parseLocalDate(nextDue(dateISO(cursor),frequency));
      if(!next||next.getTime()===cursor.getTime())break;
      cursor=next;
    }
    return out;
  }

  function summarizeOccurrences(occurrences){
    const map=new Map();
    occurrences.forEach(o=>{
      const x=map.get(o.billId)||{billId:o.billId,name:o.billName,count:0,total:0,estimated:false,overdue:false};
      x.count+=1;
      x.total+=Number(o.amount)||0;
      x.estimated=x.estimated||!!o.estimated;
      x.overdue=x.overdue||!!o.overdue;
      map.set(o.billId,x);
    });
    return [...map.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
  }


  const PAYDAYS_PER_YEAR=13;
  const PAY_CYCLE_DAYS=28;
  function addDays(d,days){
    const x=new Date(d.getTime());
    x.setDate(x.getDate()+days);
    return x;
  }

  function autoCommitments(state,plan){
    const payday=parseLocalDate(plan.paydayDate);
    const nextPayday=payday?addDays(payday,PAY_CYCLE_DAYS):null;
    const annualEnd=payday?addDays(payday,PAY_CYCLE_DAYS*PAYDAYS_PER_YEAR):null;
    const bills=activeBills(state).filter(b=>!b.paid&&b.included!==false);

    // Direct Current Account bills are still protected in the immediate cycle.
    const cycleOccurrences=[];
    bills.forEach(b=>cycleOccurrences.push(...projectBillOccurrences(b,payday,nextPayday)));

    const currentAccountOccurrences=cycleOccurrences.filter(o=>o.fundingSource==='Current Account');
    const currentAccountBills=[...new Set(currentAccountOccurrences.map(o=>o.billId))]
      .map(id=>bills.find(b=>b.id===id)).filter(Boolean);
    const billsDue=Number(currentAccountOccurrences.reduce((s,o)=>s+Math.max(0,Number(o.amount)||0),0).toFixed(2));

    // Holding Pot: project a complete 13-pay / 364-day funding year.
    // Named-pot bills are deliberately excluded so dedicated pots are not
    // double-counted as Holding Pot bills.
    const hp=holdingPot(state);
    const holdingBills=bills.filter(b=>isHoldingPotName(b.fundingSource));
    const holdingOccurrences=cycleOccurrences.filter(o=>isHoldingPotName(o.fundingSource));
    const annualHoldingOccurrences=[];
    holdingBills.forEach(b=>annualHoldingOccurrences.push(...projectBillOccurrences(b,payday,annualEnd)));

    const holdingRequired=Number(holdingOccurrences.reduce((s,o)=>s+Math.max(0,Number(o.amount)||0),0).toFixed(2));
    const annualHoldingTotal=Number(annualHoldingOccurrences.reduce((s,o)=>s+Math.max(0,Number(o.amount)||0),0).toFixed(2));
    const annualHoldingContribution=Number((annualHoldingTotal/PAYDAYS_PER_YEAR).toFixed(2));

    const holdingBalance=Number(Math.max(0,Number(hp?.balance)||0).toFixed(2));

    // Normal annual contribution lands first. Safety top-up is EXTRA only
    // when that still would not cover every Holding Pot bill before next pay.
    const holdingTopUp=Number(
      Math.max(0,holdingRequired-(holdingBalance+annualHoldingContribution)).toFixed(2)
    );
    const holdingSurplus=Number(
      Math.max(0,holdingBalance+annualHoldingContribution+holdingTopUp-holdingRequired).toFixed(2)
    );

    const pots=activePots(state);
    const potsDue=Number(pots.reduce((s,p)=>{
      const gap=potGap(p);
      return s+Math.min(gap,Math.max(0,Number(p.fundingPerPayday)||0));
    },0).toFixed(2));

    return {
      billsDue,potsDue,bills:currentAccountBills,
      billOccurrences:currentAccountOccurrences,
      allOccurrences:cycleOccurrences,
      payday:payday?dateISO(payday):'',
      nextPayday:nextPayday?dateISO(nextPayday):'',
      annualEnd:annualEnd?dateISO(annualEnd):'',
      holdingPot:hp,
      holdingOccurrences,
      holdingSummary:summarizeOccurrences(holdingOccurrences),
      annualHoldingOccurrences,
      annualHoldingSummary:summarizeOccurrences(annualHoldingOccurrences),
      annualHoldingTotal,
      annualHoldingContribution,
      holdingRequired,holdingBalance,holdingTopUp,holdingSurplus
    };
  }


  function stateWithFundingPreview(state,plan){
    const build=A()?.funding?.buildPlan;
    if(typeof build!=='function')return {state,fundingPlan:state.finance?.fundingPolicy?.lastPlan||null};
    try{
      const seeded={
        ...state,
        finance:{
          ...state.finance,
          plan:{...(state.finance?.plan||{}),...plan}
        }
      };
      const result=build(seeded);
      return {
        state:{
          ...seeded,
          finance:{
            ...seeded.finance,
            pots:result.pots,
            fundingPolicy:result.policy
          }
        },
        fundingPlan:result.policy?.lastPlan||null
      };
    }catch(_){
      return {state,fundingPlan:state.finance?.fundingPolicy?.lastPlan||null};
    }
  }

  function calc(plan,state=A().core.read()){
    const expectedWages=Math.max(0,Number(plan.expectedWages ?? plan.netPay)||0);
    const wagesReceived=Math.max(0,Number(plan.wagesReceived ?? plan.netPay)||0);
    const wageDifference=Number((wagesReceived-expectedWages).toFixed(2));
    const wageExtra=Math.max(0,wageDifference);
    const wageShortfall=Math.max(0,-wageDifference);

    const preview=stateWithFundingPreview(state,{
      ...plan,
      expectedWages,
      wagesReceived,
      netPay:wagesReceived
    });
    const auto=autoCommitments(preview.state,plan);
    const fundingPlan=preview.fundingPlan||{};
    const wageExtraToPots=Number(Math.max(0,Number(fundingPlan.extraAllocated)||0).toFixed(2));
    const wageExtraRemaining=Number(Math.max(0,wageExtra-wageExtraToPots).toFixed(2));

    const normalized={
      ...plan,
      expectedWages,
      wagesReceived,
      netPay:wagesReceived, // compatibility for existing Aurora 2 state/readers
      wageDifference,
      wageExtra,
      wageShortfall,
      wageExtraToPots,
      wageExtraRemaining,
      billsDue:auto.billsDue,
      potsDue:auto.potsDue,
      annualBillFunding:auto.annualHoldingContribution,
      holdingPotTopUp:auto.holdingTopUp
    };
    const totalCash=Number(((Number(normalized.openingCash)||0)+wagesReceived+(Number(normalized.extraCash)||0)).toFixed(2));
    const commitments=Number((
      auto.billsDue+
      auto.annualHoldingContribution+
      auto.holdingTopUp+
      auto.potsDue+
      (Number(normalized.otherPlanned)||0)
    ).toFixed(2));
    const safeSurplus=Number(Math.max(0,totalCash-commitments-(Number(normalized.protectedCash)||0)).toFixed(2));
    return {totalCash,commitments,safeSurplus,auto,plan:normalized,fundingPlan};
  }

  function readForm(){
    const state=A().core.read();
    const base=state.finance?.plan||{};
    const expectedWages=numValue('expectedWages');
    const wagesReceived=numValue('wagesReceived');
    return {
      ...base,
      paydayDate:value('paydayDate'),
      openingCash:numValue('openingCash'),
      expectedWages,
      wagesReceived,
      netPay:wagesReceived,
      extraCash:numValue('extraCash'),
      otherPlanned:numValue('otherPlanned'),
      protectedCash:numValue('protectedCash'),
      releaseAmount:numValue('releaseAmount')
    };
  }

  function savePlan(){
    const state=A().core.read(), plan=readForm(), c=calc(plan,state);
    const saved={...c.plan,releaseAmount:plan.releaseAmount};
    A().core.update(s=>({...s,finance:{...s.finance,plan:saved,lastCalculatedAt:isoNow()}}));
    A().funding?.recalc?.();
    renderAll();
    return {plan:saved,c:calc(saved,A().core.read())};
  }

  function planningAudit(state,plan,c){
    const active=activeBills(state).filter(b=>!b.paid&&b.included!==false),critical=[],warnings=[];
    active.forEach(b=>{
      const freq=String(b.frequency||'one-off');
      if((freq==='yearly'||freq==='one-off')&&!parseLocalDate(b.due))critical.push(`${b.name}: ${freq} bill needs a due date`);
      if(!String(b.fundingSource||'').trim())critical.push(`${b.name}: funding source is missing`);
    });
    const holdingFunded=active.filter(b=>isHoldingPotName(b.fundingSource));
    if(holdingFunded.length&&!c.auto.holdingPot)critical.push(`Holding Pot is missing but ${holdingFunded.length} active bill${holdingFunded.length===1?'':'s'} use it`);
    const fundingPlan=c.fundingPlan||state.finance?.fundingPolicy?.lastPlan;
    if(fundingPlan&&Math.abs((Number(fundingPlan.allocated)||0)-(Number(c.auto.potsDue)||0))>.011)warnings.push(`Pot funding view is out of sync by ${money(Math.abs((Number(fundingPlan.allocated)||0)-(Number(c.auto.potsDue)||0)))}`);
    const stale=active.filter(b=>{const d=parseLocalDate(b.due);return d&&String(b.frequency||'one-off')==='one-off'&&d.getTime()<Date.now()-86400000});
    if(stale.length)warnings.push(`${stale.length} overdue one-off bill${stale.length===1?'':'s'} still active`);
    const missionGate=!missionIsInFlight(state.mission)||state.mission?.status==='FINANCE_APPROVED';
    return {critical,warnings,billStatus:critical.some(x=>/bill needs a due date|funding source/.test(x))?'ACTION':'READY',holdingStatus:holdingFunded.length?(c.auto.holdingPot?'READY':'MISSING'):'NOT NEEDED',goalStatus:`${money(c.auto.potsDue)} SCHEDULED`,missionStatus:missionGate?'OPEN':'LOCKED'};
  }

  function renderPlanningAudit(state,plan,c){
    const a=planningAudit(state,plan,c),badge=$('financeReadinessBadge'),list=$('financePlanningGaps');
    if(badge){if(a.critical.length){badge.className='readiness-badge block';badge.textContent='ACTION REQUIRED'}else if(a.warnings.length){badge.className='readiness-badge warn';badge.textContent='READY WITH NOTES'}else{badge.className='readiness-badge ready';badge.textContent='FINANCE READY'}}
    A().ui.text('readyBills',a.billStatus);A().ui.text('readyHolding',a.holdingStatus);A().ui.text('readyGoalPots',a.goalStatus);A().ui.text('readyMission',a.missionStatus);
    if(list){if(!a.critical.length&&!a.warnings.length)list.innerHTML='<div class="notice good">Finance has no unresolved payday-planning gaps. The safe-release figure is fully reconciled from the information currently stored.</div>';else list.innerHTML=[...a.critical.map(x=>`<div class="planning-gap block"><b>BLOCK:</b> ${esc(x)}</div>`),...a.warnings.map(x=>`<div class="planning-gap"><b>CHECK:</b> ${esc(x)}</div>`)].join('')}
    return a;
  }

  function renderPlan(){
    const state=A().core.read(), raw=state.finance?.plan||{}, c=calc(raw,state), plan=c.plan, ui=A().ui;
    ui.text('mOpening',money(plan.openingCash));
    ui.text('mPay',money(plan.wagesReceived));
    ui.text('mPayMeta',`Expected ${money(plan.expectedWages)}`);
    ui.text('breakExpectedWages',money(plan.expectedWages));
    ui.text('breakWagesReceived',money(plan.wagesReceived));
    ui.text('breakWageExtra',plan.wageDifference>=0?money(plan.wageExtra):`− ${money(plan.wageShortfall)}`);
    ui.text('mCommitments',money(c.commitments));
    ui.text('mProtected',money(plan.protectedCash));
    ui.text('mAvailable',money(c.safeSurplus));
    ui.text('breakTotal',money(c.totalCash));
    ui.text('breakBills',`− ${money(c.auto.billsDue)}`);
    ui.text('breakAnnualBills',`− ${money(c.auto.annualHoldingContribution)}`);
    ui.text('breakHoldingTopUp',`− ${money(c.auto.holdingTopUp)}`);
    ui.text('breakPots',`− ${money(c.auto.potsDue)}`);
    ui.text('breakOther',`− ${money(plan.otherPlanned)}`);
    ui.text('breakProtected',`− ${money(plan.protectedCash)}`);
    ui.text('breakAvailable',money(c.safeSurplus));
    ui.text('autoExpectedWages',money(plan.expectedWages));
    ui.text('autoWageDifference',plan.wageDifference>=0?`+ ${money(plan.wageExtra)}`:`− ${money(plan.wageShortfall)}`);
    ui.text('autoWageDifferenceMeta',plan.wageDifference>0?'Extra pay detected':plan.wageDifference<0?'Below expected wage':'Wage matched expected');
    ui.text('autoWageToPots',money(plan.wageExtraToPots));
    ui.text('autoWageToPotsMeta',plan.wageExtra>0
      ?`${money(plan.wageExtraToPots)} of ${money(plan.wageExtra)} routed to remaining pot gaps`
      :'No extra wage to route');
    ui.text('autoWageRemaining',money(plan.wageExtraRemaining));
    ui.text('autoBillsDue',money(c.auto.billsDue));
    ui.text('autoAnnualBills',money(c.auto.annualHoldingContribution));
    ui.text('autoTotalFunding',money(c.commitments));
    ui.text('autoHoldingTopUp',money(c.auto.holdingTopUp));
    ui.text('autoPotsDue',money(c.auto.potsDue));
    ui.text('autoBillsCount',`${c.auto.billOccurrences.length} occurrence${c.auto.billOccurrences.length===1?'':'s'} across ${c.auto.bills.length} Current Account bill${c.auto.bills.length===1?'':'s'}`);
    ui.text('autoAnnualBillsMeta',c.auto.annualHoldingTotal>0
      ?`${money(c.auto.annualHoldingTotal)} projected across 13 paydays`
      :'No Holding Pot bills in the 13-pay funding year');
    ui.text('autoHoldingMeta',c.auto.holdingTopUp>0
      ?`${money(c.auto.holdingTopUp)} extra needed after normal 13-pay funding`
      :'Next payday cycle is covered by balance + normal funding');
    ui.text('autoPotsCount',`${activePots(state).filter(p=>Math.min(potGap(p),Number(p.fundingPerPayday)||0)>.009).length} pot contribution${activePots(state).filter(p=>Math.min(potGap(p),Number(p.fundingPerPayday)||0)>.009).length===1?'':'s'} scheduled`);
    ui.text('paydayWindowHelp',c.auto.payday&&c.auto.nextPayday
      ?`13-pay funding year starts ${c.auto.payday}; safety check covers bills before ${c.auto.nextPayday}.`
      :'Choose the payday date to calculate the 13-pay funding plan.');

    ui.text('holdingAnnualTotal',money(c.auto.annualHoldingTotal));
    ui.text('holdingAnnualContribution',money(c.auto.annualHoldingContribution));
    ui.text('holdingAnnualMeta',c.auto.annualEnd?`Funding horizon to before ${c.auto.annualEnd}`:'Choose payday date');
    ui.text('holdingRequired',money(c.auto.holdingRequired));
    ui.text('holdingBalance',money(c.auto.holdingBalance));
    ui.text('holdingTopUp',money(c.auto.holdingTopUp));
    ui.text('holdingRequiredMeta',`${c.auto.holdingOccurrences.length} projected occurrence${c.auto.holdingOccurrences.length===1?'':'s'}`);
    ui.text('holdingTopUpMeta',c.auto.holdingTopUp>0
      ?`${money(c.auto.holdingTopUp)} extra after the normal ${money(c.auto.annualHoldingContribution)} contribution`
      :c.auto.holdingRequired>0
        ?`${money(c.auto.holdingSurplus)} remains after next-cycle bills`
        :'No safety top-up required');

    const hpBox=$('holdingPotBreakdown');
    if(hpBox){
      if(!c.auto.holdingPot&&c.auto.holdingOccurrences.length){
        hpBox.className='notice red';
        hpBox.textContent=`Holding Pot-funded bills exist, but the Holding Pot record is missing. Finance is conservatively reserving the full ${money(c.auto.holdingRequired)} requirement.`;
      }else if(!c.auto.holdingSummary.length&&!c.auto.annualHoldingSummary.length){
        hpBox.className='notice good';
        hpBox.textContent='No Holding Pot-funded bills are projected in the 13-pay funding year.';
      }else{
        hpBox.className='notice';
        const nextCycle=c.auto.holdingSummary.length
          ?c.auto.holdingSummary.map(x=>`${esc(x.name)} ×${x.count} = ${money(x.total)}${x.estimated?' (date estimate)':''}${x.overdue?' (includes overdue)':''}`).join(' • ')
          :'No Holding Pot bills before next payday';
        hpBox.innerHTML=`<b>13-pay bill funding:</b> ${money(c.auto.annualHoldingTotal)} ÷ 13 = ${money(c.auto.annualHoldingContribution)} each payday.<br><br><b>Next-cycle safety check:</b> ${nextCycle}`;
      }
    }

    const release=$('releaseAmount');
    if(release&&document.activeElement!==release&&(!release.value||Number(release.value)>c.safeSurplus)){
      release.value=c.safeSurplus?c.safeSurplus.toFixed(2):'';
    }
    renderPlanningAudit(state,plan,c);
    renderReleaseGuard(c.safeSurplus);
  }

  function terminalMission(m){
    return !m || ['REGISTERED','COMPLETED','CANCELLED'].includes(String(m.status||''));
  }
  function missionIsInFlight(m){
    return !!(m&&m.status&&!terminalMission(m));
  }

  function renderReleaseGuard(safe){
    const requested=numValue('releaseAmount'), msg=$('releaseGuard'), btn=$('releaseMission');
    if(!msg||!btn)return;
    const state=A().core.read(),m=state.mission;
    const c=calc(state.finance?.plan||{},state),audit=planningAudit(state,c.plan,c);
    if(audit.critical.length){
      msg.className='notice red';
      msg.textContent=`Blocked: Finance has ${audit.critical.length} unresolved planning gap${audit.critical.length===1?'':'s'}. Fix the Payday Readiness items before releasing money to Transfer.`;
      btn.disabled=true; return;
    }
    if(missionIsInFlight(m)&&m.status!=='FINANCE_APPROVED'){
      msg.className='notice';
      msg.textContent=`Current mission ${money(m.approvedBudget||0)} is ${m.status}. This screen is calculating the next payday forecast; release is locked until that mission is completed/registered or cancelled.`;
      btn.disabled=true; return;
    }
    if(requested<=0){
      msg.className='notice';
      msg.textContent='Enter the amount you want Finance to release to Transfer. It can be lower than the safe surplus.';
      btn.disabled=true; return;
    }
    if(requested>safe+0.005){
      msg.className='notice red';
      msg.textContent=`Blocked: requested release is above the calculated safe surplus of ${money(safe)}.`;
      btn.disabled=true; return;
    }
    msg.className='notice good';
    msg.textContent=`Finance can release ${money(requested)}. Transfer will receive this exact locked budget.`;
    btn.disabled=false;
  }

  function releaseMission(){
    const {plan,c}=savePlan(), amount=numValue('releaseAmount');
    if(amount<=0||amount>c.safeSurplus+0.005)return;
    const current=A().core.read();
    const audit=planningAudit(current,c.plan,c);
    if(audit.critical.length){
      alert('Finance cannot release a mission while payday-planning gaps remain. Fix the Payday Readiness items first.');
      return;
    }
    if(missionIsInFlight(current.mission)&&current.mission.status!=='FINANCE_APPROVED'){
      alert('The current released mission is still in progress. Finance will keep calculating the next payday forecast, but a new mission cannot be released until the current mission is registered/completed or cancelled.');
      return;
    }
    const replacingTerminal=!!(current.mission&&terminalMission(current.mission));
    const mission={
      id:current.mission?.status==='FINANCE_APPROVED'?current.mission.id:A().core.uid('MISSION'),
      approvedBudget:Number(amount.toFixed(2)),
      status:'FINANCE_APPROVED',
      paydayDate:plan.paydayDate||'',
      createdAt:current.mission?.createdAt||isoNow(),
      updatedAt:isoNow(),
      source:'Finance',
      financeSnapshot:{
        totalCash:Number(c.totalCash.toFixed(2)),
        expectedWages:Number((c.plan.expectedWages||0).toFixed(2)),
        wagesReceived:Number((c.plan.wagesReceived||0).toFixed(2)),
        wageDifference:Number((c.plan.wageDifference||0).toFixed(2)),
        wageExtraToPots:Number((c.plan.wageExtraToPots||0).toFixed(2)),
        wageExtraRemaining:Number((c.plan.wageExtraRemaining||0).toFixed(2)),
        commitments:Number(c.commitments.toFixed(2)),
        billsDue:Number(c.auto.billsDue.toFixed(2)),
        holdingPotRequired:Number(c.auto.holdingRequired.toFixed(2)),
        holdingPotBalance:Number(c.auto.holdingBalance.toFixed(2)),
        annualBillFunding:Number(c.auto.annualHoldingContribution.toFixed(2)),
        annualHoldingTotal:Number(c.auto.annualHoldingTotal.toFixed(2)),
        holdingPotTopUp:Number(c.auto.holdingTopUp.toFixed(2)),
        holdingPotOccurrences:c.auto.holdingOccurrences.length,
        potsDue:Number(c.auto.potsDue.toFixed(2)),
        protectedCash:Number(plan.protectedCash.toFixed(2)),
        safeSurplus:Number(c.safeSurplus.toFixed(2))
      }
    };
    A().core.update(s=>({
      ...s,
      finance:{
        ...s.finance,
        plan:{...c.plan,releaseAmount:amount},
        lastReleasedAt:isoNow(),
        missionHistory:replacingTerminal
          ? [current.mission,...(s.finance?.missionHistory||[])].slice(0,24)
          : (s.finance?.missionHistory||[])
      },
      mission,
      alerts:[
        {id:A().core.uid('ALERT'),title:`Finance released ${money(amount)}`,note:'Investment mission is ready for Scouting and Transfer.',when:'now'},
        ...(s.alerts||[]).filter(x=>!String(x?.title||'').startsWith('Finance released '))
      ].slice(0,8)
    }));
    renderAll();
    showToast('Investment mission released to Aurora 2.0.');
  }

  function renderMission(){
    const s=A().core.read(),m=s.mission,ui=A().ui;
    const c=calc(s.finance?.plan||{},s);
    const currentBudget=m?.approvedBudget!=null?Number(m.approvedBudget):0;
    const nextSafe=Number(c.safeSurplus)||0;
    ui.text('missionStatus',m?.status==='FINANCE_APPROVED'?'FINANCE APPROVED':m?.status||'NO ACTIVE MISSION');
    ui.text('missionAmount',m?.approvedBudget!=null?money(m.approvedBudget):'£0.00');
    ui.text('missionMeta',m?`${m.id}${m.paydayDate?' • released payday '+m.paydayDate:''}`:'No released mission is active.');
    ui.text('reconNextSafe',money(nextSafe));
    ui.text('reconMission',m?money(currentBudget):'£0.00');
    ui.text('reconMissionStatus',m?`${m.status} • frozen released amount`:'No active mission');
    const difference=m?nextSafe-currentBudget:0;
    ui.text('reconDifference',`${difference>=0?'+':''}${money(difference)}`);
    ui.text('reconDifferenceMeta',m
      ? (Math.abs(difference)<.005?'Forecast currently matches the released mission.':difference>0?'Next forecast is above the current mission.':'Next forecast is below the current mission.')
      : 'No released mission to compare');
    const lock=$('missionLock');
    if(lock)lock.textContent=m
      ?'Current released mission is frozen. Transfer and Scouting may use it, but changing the next payday plan will not rewrite it.'
      :'Finance owns the investment budget.';
    const note=$('missionForecastNotice');
    if(note){
      if(m&&Math.abs(difference)>.005){
        note.className='notice';
        note.textContent=`Current mission ${money(currentBudget)} remains frozen at ${m.status}. The live next-payday forecast is ${money(nextSafe)} (${difference>=0?'+':''}${money(difference)} vs the current mission).`;
      }else if(m){
        note.className='notice good';
        note.textContent=`Current mission ${money(currentBudget)} is frozen and the next-payday forecast currently matches it.`;
      }else{
        note.className='notice good';
        note.textContent=`No released mission is active. Finance can currently support up to ${money(nextSafe)} based on the live payday plan.`;
      }
    }
  }

  function priorityLabel(p){return Number(p.priority)===1?'P1 Critical':Number(p.priority)===3?'P3 Flexible':'P2 Important'}
  function renderPots(){
    const state=A().core.read(), pots=state.finance?.pots||[], live=pots.filter(p=>!p.archived);
    const funded=live.reduce((s,p)=>s+potFunded(p),0);
    const targets=live.reduce((s,p)=>s+(Number(p.target)||0),0);
    const gaps=live.reduce((s,p)=>s+potGap(p),0);
    const due=live.reduce((s,p)=>s+Math.min(potGap(p),Number(p.fundingPerPayday)||0),0);
    A().ui.text('potBalanceTotal',money(live.reduce((s,p)=>s+(Number(p.balance)||0),0)));
    A().ui.text('potTargetTotal',money(targets));
    A().ui.text('potGapTotal',money(gaps));
    A().ui.text('potFundingTotal',money(due));
    const host=$('potList');
    if(!host)return;
    if(!pots.length){
      host.innerHTML='<div class="empty-state compact"><strong>No pots yet</strong><p>Add only the pots you actually use. Their payday funding will feed Finance automatically.</p></div>';
      return;
    }
    host.innerHTML=pots.map(p=>{
      const target=Math.max(0,Number(p.target)||0), fundedAmount=potFunded(p), pct=target>0?Math.min(100,fundedAmount/target*100):0, gap=potGap(p);
      const spentNote=p.goalMode==='funded-progress'?` • ${money(p.spent)} spent counts toward goal`:'';
      return `<article class="finance-item ${p.archived?'is-archived':''}">
        <div class="finance-item-main">
          <div class="finance-item-title"><strong>${esc(p.name)}</strong><span>${esc(priorityLabel(p))}</span></div>
          <div class="finance-item-meta">${money(p.balance)} available • ${money(fundedAmount)} funded of ${money(target)}${spentNote}</div>
          <div class="progress-mini"><i style="width:${pct.toFixed(1)}%"></i></div>
          <div class="finance-item-meta">Gap ${money(gap)} • <b class="good">Next payday ${money(Math.min(gap,Number(p.fundingPerPayday)||0))}</b>${p.deadline?` • Complete by ${esc(p.deadline)}`:''}</div>
          <div class="finance-item-meta">${esc(p.fundingReason||'Funding engine waiting')}</div>
        </div>
        <div class="finance-item-actions">
          <button class="btn secondary" data-pot-edit="${esc(p.id)}">Edit</button>
          <button class="btn secondary" data-pot-archive="${esc(p.id)}">${p.archived?'Restore':'Archive'}</button>
        </div>
      </article>`;
    }).join('');
  }

  function resetPotEditor(){
    setValue('potId',''); setValue('potName',''); setValue('potBalance',''); setValue('potTarget','');
    setValue('potFunding',''); setValue('potDeadline',''); setValue('potPriority','2'); setValue('potGoalMode','balance'); setValue('potSpent','');
    updatePotSpentVisibility();
    A().ui.text('potEditorTitle','Add Pot');
  }
  function updatePotSpentVisibility(){
    const show=value('potGoalMode')==='funded-progress';
    const wrap=$('potSpentField'); if(wrap)wrap.style.display=show?'grid':'none';
  }
  function editPot(id){
    const p=(A().core.read().finance?.pots||[]).find(x=>x.id===id); if(!p)return;
    setValue('potId',p.id); setValue('potName',p.name); setValue('potBalance',p.balance); setValue('potTarget',p.target);
    setValue('potFunding',p.fundingOverride||0); setValue('potDeadline',p.deadline||''); setValue('potPriority',p.priority); setValue('potGoalMode',p.goalMode); setValue('potSpent',p.spent);
    updatePotSpentVisibility();
    A().ui.text('potEditorTitle','Edit Pot');
    $('potEditor')?.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function savePot(){
    const id=value('potId')||A().core.uid('POT'), name=value('potName').trim();
    if(!name){alert('Enter a pot name.');return;}
    A().core.update(s=>{
      const existing=(s.finance.pots||[]).find(p=>p.id===id);
      const pot={
        ...(existing||{}),id,name,
        balance:numValue('potBalance'),target:numValue('potTarget'),
        fundingOverride:numValue('potFunding'),deadline:value('potDeadline'),
        fundingPerPayday:Number(existing?.fundingPerPayday)||0,priority:Number(value('potPriority')||2),
        goalMode:value('potGoalMode')==='funded-progress'?'funded-progress':'balance',
        spent:value('potGoalMode')==='funded-progress'?numValue('potSpent'):0,
        archived:Boolean(existing?.archived),createdAt:existing?.createdAt||isoNow(),updatedAt:isoNow()
      };
      const pots=[...(s.finance.pots||[])], index=pots.findIndex(p=>p.id===id);
      if(index>=0)pots[index]=pot; else pots.push(pot);
      return {...s,finance:{...s.finance,pots}};
    });
    resetPotEditor(); renderAll(); showToast('Pot saved.');
  }
  function togglePotArchive(id){
    A().core.update(s=>({...s,finance:{...s.finance,pots:(s.finance.pots||[]).map(p=>p.id===id?{...p,archived:!p.archived,updatedAt:isoNow()}:p)}}));
    renderAll();
  }

  function billStatus(b){
    if(b.archived)return {label:'Archived',tone:'muted'};
    if(b.paid)return {label:'Paid',tone:'good'};
    if(!b.included)return {label:'Excluded',tone:'muted'};
    const days=daysFromToday(b.due);
    if(days===null)return {label:'No date',tone:'muted'};
    if(days<0)return {label:'Overdue',tone:'red'};
    if(days===0)return {label:'Due today',tone:'gold'};
    if(days<=7)return {label:`Due in ${days}d`,tone:'gold'};
    return {label:'Planned',tone:'cyan'};
  }
  function frequencyLabel(v){
    return ({'one-off':'One-off','weekly':'Weekly','4-weeks':'Every 4 weeks','5-weeks':'Every 5 weeks','monthly':'Monthly','yearly':'Yearly'})[v]||v;
  }
  function renderBills(){
    const state=A().core.read(), bills=state.finance?.bills||[], plan=state.finance?.plan||{}, payday=parseLocalDate(plan.paydayDate);
    const active=bills.filter(b=>!b.archived), unpaid=active.filter(b=>!b.paid&&b.included!==false);
    const dueByPayday=unpaid.filter(b=>{
      const d=parseLocalDate(b.due);
      return d&&payday&&d<=payday;
    });
    const next7=unpaid.filter(b=>{const days=daysFromToday(b.due);return days!==null&&days>=0&&days<=7});
    const overdue=unpaid.filter(b=>{const days=daysFromToday(b.due);return days!==null&&days<0});
    A().ui.text('billDuePayday',money(dueByPayday.filter(b=>b.fundingSource==='Current Account').reduce((s,b)=>s+Number(b.amount||0),0)));
    A().ui.text('billNext7',money(next7.reduce((s,b)=>s+Number(b.amount||0),0)));
    A().ui.text('billOverdueCount',String(overdue.length));
    A().ui.text('billActiveCount',String(unpaid.length));

    const source=$('billFundingSource');
    if(source){
      const current=value('billFundingSource');
      source.innerHTML='<option>Current Account</option>'+activePots(state).map(p=>`<option>${esc(p.name)}</option>`).join('');
      if([...source.options].some(o=>o.value===current))source.value=current;
    }

    const host=$('billList');
    if(!host)return;
    if(!bills.length){
      host.innerHTML='<div class="empty-state compact"><strong>No bills yet</strong><p>Add a bill and Finance will automatically include current-account payments due by payday.</p></div>';
      return;
    }
    host.innerHTML=bills
      .slice()
      .sort((a,b)=>(a.archived-b.archived)||((parseLocalDate(a.due)?.getTime()||Infinity)-(parseLocalDate(b.due)?.getTime()||Infinity)))
      .map(b=>{
        const st=billStatus(b);
        const canComplete=!b.archived&&!b.paid&&b.included!==false;
        const actualId=`actual-${b.id}`;
        return `<article class="finance-item ${b.archived?'is-archived':''}">
          <div class="finance-item-main">
            <div class="finance-item-title"><strong>${esc(b.name)}</strong><span class="${st.tone}">${esc(st.label)}</span></div>
            <div class="finance-item-meta">${money(b.amount)} • due ${esc(b.due||'not set')} • ${esc(frequencyLabel(b.frequency))} • ${esc(b.category)}</div>
            <div class="finance-item-meta">Funding: ${esc(b.fundingSource)}${b.included===false?' • excluded from planning':''}</div>
          </div>
          <div class="finance-item-actions bill-actions">
            ${canComplete?`<div class="mini-actual"><label>Actual</label><input id="${esc(actualId)}" type="number" min="0" step="0.01" value="${Number(b.amount||0).toFixed(2)}"></div><button class="btn primary" data-bill-complete="${esc(b.id)}">Complete</button>`:''}
            <button class="btn secondary" data-bill-edit="${esc(b.id)}">Edit</button>
            <button class="btn secondary" data-bill-archive="${esc(b.id)}">${b.archived?'Restore':'Archive'}</button>
          </div>
        </article>`;
      }).join('');
  }

  function resetBillEditor(){
    setValue('billId',''); setValue('billName',''); setValue('billAmount',''); setValue('billDue','');
    setValue('billFrequency','one-off'); setValue('billFundingSource','Current Account'); setValue('billCategory','Other');
    $('billIncluded').checked=true; A().ui.text('billEditorTitle','Add Bill');
  }
  function editBill(id){
    const b=(A().core.read().finance?.bills||[]).find(x=>x.id===id); if(!b)return;
    setValue('billId',b.id); setValue('billName',b.name); setValue('billAmount',b.amount); setValue('billDue',b.due);
    setValue('billFrequency',b.frequency); renderBills(); setValue('billFundingSource',b.fundingSource);
    setValue('billCategory',b.category); $('billIncluded').checked=b.included!==false;
    A().ui.text('billEditorTitle','Edit Bill');
    $('billEditor')?.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function saveBill(){
    const id=value('billId')||A().core.uid('BILL'), name=value('billName').trim();
    if(!name){alert('Enter a bill name.');return;}
    A().core.update(s=>{
      const existing=(s.finance.bills||[]).find(b=>b.id===id);
      const bill={
        ...(existing||{}),id,name,amount:numValue('billAmount'),due:value('billDue'),
        frequency:value('billFrequency')||'one-off',fundingSource:value('billFundingSource')||'Current Account',
        category:value('billCategory').trim()||'Other',included:$('billIncluded').checked,
        paid:Boolean(existing?.paid),actualPaid:Number(existing?.actualPaid)||0,
        archived:Boolean(existing?.archived),createdAt:existing?.createdAt||isoNow(),updatedAt:isoNow()
      };
      const bills=[...(s.finance.bills||[])], index=bills.findIndex(b=>b.id===id);
      if(index>=0)bills[index]=bill; else bills.push(bill);
      return {...s,finance:{...s.finance,bills}};
    });
    resetBillEditor(); renderAll(); showToast('Bill saved.');
  }
  function toggleBillArchive(id){
    A().core.update(s=>({...s,finance:{...s.finance,bills:(s.finance.bills||[]).map(b=>b.id===id?{...b,archived:!b.archived,updatedAt:isoNow()}:b)}}));
    renderAll();
  }

  function completeBill(id){
    const current=A().core.read(), bill=(current.finance?.bills||[]).find(b=>b.id===id);
    if(!bill||bill.archived||bill.paid||bill.included===false)return;
    const input=$(`actual-${id}`), actual=Math.max(0,Number(input?.value)||0);
    if(actual<=0){alert('Enter the actual amount paid.');return;}
    const pot=(current.finance?.pots||[]).find(p=>!p.archived&&p.name===bill.fundingSource);
    if(pot&&actual>Number(pot.balance||0)+0.005){
      alert(`${pot.name} only has ${money(pot.balance)} available. Change the funding source or update the pot balance first.`);
      return;
    }
    A().core.update(s=>{
      const bills=[...(s.finance.bills||[])], pots=[...(s.finance.pots||[])], payments=[...(s.finance.payments||[])];
      const bi=bills.findIndex(b=>b.id===id); if(bi<0)return s;
      const beforeBill={...bills[bi]};
      let beforePot=null;
      if(beforeBill.fundingSource!=='Current Account'){
        const pi=pots.findIndex(p=>!p.archived&&p.name===beforeBill.fundingSource);
        if(pi>=0){
          beforePot={...pots[pi]};
          const nextSpent=pots[pi].goalMode==='funded-progress'?(Number(pots[pi].spent)||0)+actual:(Number(pots[pi].spent)||0);
          pots[pi]={...pots[pi],balance:Math.max(0,(Number(pots[pi].balance)||0)-actual),spent:nextSpent,updatedAt:isoNow()};
        }
      }
      const payment={
        id:A().core.uid('PAYMENT'),billId:id,billName:beforeBill.name,amount:actual,
        fundingSource:beforeBill.fundingSource,paidAt:isoNow(),dueAtPayment:beforeBill.due,
        reversed:false,reversedAt:null,beforeBill,beforePot
      };
      payments.unshift(payment);

      if(beforeBill.frequency==='one-off'){
        bills[bi]={...beforeBill,paid:true,actualPaid:actual,updatedAt:isoNow()};
      }else{
        bills[bi]={...beforeBill,due:nextDue(beforeBill.due,beforeBill.frequency),paid:false,actualPaid:0,updatedAt:isoNow()};
      }
      return {...s,finance:{...s.finance,bills,pots,payments}};
    });
    renderAll(); showToast('Payment recorded.');
  }


  function repairPaidRecurringBills(){
    const current=A().core.read();
    const bills=current.finance?.bills||[];
    const today=new Date(); today.setHours(12,0,0,0);
    const todayIso=dateISO(today);
    const adjustments=[];

    bills.forEach(b=>{
      if(!b||b.archived||!b.paid||b.frequency==='one-off')return;

      const beforeDue=String(b.due||'');
      let afterDue=beforeDue;

      if(beforeDue){
        // A recurring item imported as "Paid" belongs to the old Aurora state.
        // Move it to the first due date AFTER today so the next cycle is active.
        let cursor=beforeDue, guard=0;
        do{
          const next=nextDue(cursor,b.frequency);
          if(!next||next===cursor)break;
          cursor=next;
        }while(parseLocalDate(cursor)&&parseLocalDate(cursor).getTime()<=today.getTime()&&guard++<120);
        afterDue=cursor;
      }

      adjustments.push({
        id:b.id,name:b.name,frequency:b.frequency,
        beforeDue,afterDue,reactivatedAt:isoNow()
      });
    });

    if(!adjustments.length)return 0;

    const byId=new Map(adjustments.map(x=>[x.id,x]));
    A().core.update(s=>{
      const repaired=(s.finance?.bills||[]).map(b=>{
        const fix=byId.get(b.id);
        if(!fix)return b;
        return {
          ...b,
          due:fix.afterDue,
          paid:false,
          actualPaid:0,
          updatedAt:isoNow()
        };
      });
      return {
        ...s,
        finance:{
          ...s.finance,
          bills:repaired,
          recurringBillRepair:{
            version:1,
            appliedAt:isoNow(),
            today:todayIso,
            count:adjustments.length,
            adjustments
          }
        }
      };
    });
    return adjustments.length;
  }


  function repairLegacyDuplicateGroceries(){
    const current=A().core.read();

    // One-time migration only. Never keep trying to dedupe user-created bills.
    if(current.finance?.duplicateBillRepair?.version>=1)return 0;

    const bills=current.finance?.bills||[];
    const active=bills.filter(b=>b&&!b.archived&&b.included!==false&&!b.paid);

    const groceries=active.filter(b=>{
      const n=cleanName(b.name);
      return (n==='grocery'||n==='grocery shop')
        && String(b.frequency||'')==='weekly'
        && Math.abs((Number(b.amount)||0)-45)<0.005
        && isHoldingPotName(b.fundingSource);
    });

    const grocery=groceries.find(b=>cleanName(b.name)==='grocery');
    const groceryShop=groceries.find(b=>cleanName(b.name)==='grocery shop');

    const archivedIds=[];
    const keptId=grocery?.id||groceryShop?.id||null;

    // The legacy Aurora import contained both "Grocery Shop" and "Grocery"
    // for the same £45 weekly Holding Pot spend. Keep the current "Grocery"
    // record and archive only that known legacy duplicate.
    if(grocery&&groceryShop&&grocery.id!==groceryShop.id){
      archivedIds.push(groceryShop.id);
    }

    A().core.update(s=>{
      const repaired=(s.finance?.bills||[]).map(b=>archivedIds.includes(b.id)
        ? {
            ...b,
            archived:true,
            included:false,
            updatedAt:isoNow(),
            note:[String(b.note||'').trim(),'Archived automatically: duplicate legacy £45 weekly grocery bill.'].filter(Boolean).join(' ')
          }
        : b
      );

      return {
        ...s,
        finance:{
          ...s.finance,
          bills:repaired,
          duplicateBillRepair:{
            version:1,
            appliedAt:isoNow(),
            type:'LEGACY_GROCERY_DUPLICATE',
            keptBillId:keptId,
            archivedBillIds:archivedIds,
            archivedCount:archivedIds.length
          }
        }
      };
    });

    return archivedIds.length;
  }

  function renderRecurringRepairNotice(){
    const state=A().core.read();
    const recurring=state.finance?.recurringBillRepair;
    const duplicate=state.finance?.duplicateBillRepair;
    const el=$('recurringRepairNotice');
    if(!el)return;

    const parts=[];

    if(recurring?.count){
      const latest=(recurring.adjustments||[]).slice(0,5)
        .map(x=>`${esc(x.name)} → ${esc(x.afterDue||'date required')}`).join(' • ');
      parts.push(`<b>Recurring bills repaired:</b> ${recurring.count} imported paid recurring bill${recurring.count===1?'':'s'} reactivated for the next cycle.${latest?`<br><span class="muted">${latest}${(recurring.adjustments||[]).length>5?' • …':''}</span>`:''}`);
    }

    if(duplicate?.archivedCount){
      parts.push(`<b>Duplicate removed:</b> the old “Grocery Shop” £45 weekly bill was archived. Aurora now protects only one £45 weekly grocery bill.`);
    }

    if(!parts.length){
      el.style.display='none';
      return;
    }

    el.style.display='';
    el.className='notice good';
    el.innerHTML=parts.join('<br><br>');
  }
  function renderHistory(){
    const state=A().core.read(), payments=state.finance?.payments||[], host=$('paymentHistory');
    if(!host)return;
    if(!payments.length){
      host.innerHTML='<div class="empty-state compact"><strong>No payments recorded</strong><p>Completed bills will appear here with a safe undo trail.</p></div>';
      return;
    }
    const latestByBill=new Map();
    payments.forEach(p=>{if(!p.reversed&&!latestByBill.has(p.billId))latestByBill.set(p.billId,p.id)});
    host.innerHTML=payments.slice(0,30).map(p=>{
      const undoable=!p.reversed&&latestByBill.get(p.billId)===p.id;
      return `<article class="history-row ${p.reversed?'is-reversed':''}">
        <div><strong>${esc(p.billName)}</strong><span>${money(p.amount)} • ${esc(p.fundingSource)} • ${new Date(p.paidAt).toLocaleString('en-GB')}</span></div>
        <div>${p.reversed?'<span class="muted">UNDONE</span>':undoable?`<button class="btn secondary" data-payment-undo="${esc(p.id)}">Undo</button>`:''}</div>
      </article>`;
    }).join('');
  }

  function undoPayment(id){
    A().core.update(s=>{
      const payments=[...(s.finance.payments||[])], bills=[...(s.finance.bills||[])], pots=[...(s.finance.pots||[])];
      const pi=payments.findIndex(p=>p.id===id); if(pi<0||payments[pi].reversed)return s;
      const payment=payments[pi];
      const newer=payments.find(p=>!p.reversed&&p.billId===payment.billId&&new Date(p.paidAt)>new Date(payment.paidAt));
      if(newer){alert('Undo the newest payment for this bill first.');return s;}
      const bi=bills.findIndex(b=>b.id===payment.billId);
      if(bi>=0)bills[bi]={...payment.beforeBill,updatedAt:isoNow()};
      if(payment.beforePot){
        const pidx=pots.findIndex(p=>p.id===payment.beforePot.id);
        if(pidx>=0)pots[pidx]={...payment.beforePot,updatedAt:isoNow()};
      }
      payments[pi]={...payment,reversed:true,reversedAt:isoNow()};
      return {...s,finance:{...s.finance,bills,pots,payments}};
    });
    renderAll(); showToast('Payment undone.');
  }

  function renderLastUpdated(){
    const s=A().core.read();
    A().ui.text('lastUpdated',new Date(s.updatedAt).toLocaleString('en-GB'));
  }

  function renderAll(){
    renderPlan(); renderMission(); renderPots(); renderBills(); renderRecurringRepairNotice(); renderHistory(); renderLastUpdated();
  }

  function loadForm(){
    const p=A().core.read().finance?.plan||{};
    ['paydayDate','openingCash','extraCash','otherPlanned','protectedCash','releaseAmount'].forEach(id=>setValue(id,p[id]??''));
    const legacyPay=p.netPay??'';
    setValue('expectedWages',p.expectedWages??legacyPay);
    setValue('wagesReceived',p.wagesReceived??legacyPay);
  }

  function wireTabs(){
    document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
      document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===btn.dataset.tab));
    }));
  }

  function wire(){
    wireTabs();
    document.querySelectorAll('#paydayPanel input').forEach(el=>el.addEventListener('input',()=>{
      const state=A().core.read(), plan=readForm(), c=calc(plan,state);
      renderReleaseGuard(c.safeSurplus);
      A().ui.text('autoExpectedWages',money(c.plan.expectedWages));
      A().ui.text('autoWageDifference',c.plan.wageDifference>=0?`+ ${money(c.plan.wageExtra)}`:`− ${money(c.plan.wageShortfall)}`);
      A().ui.text('autoWageDifferenceMeta',c.plan.wageDifference>0?'Extra pay detected':c.plan.wageDifference<0?'Below expected wage':'Wage matched expected');
      A().ui.text('autoWageToPots',money(c.plan.wageExtraToPots));
      A().ui.text('autoWageToPotsMeta',c.plan.wageExtra>0?`${money(c.plan.wageExtraToPots)} of ${money(c.plan.wageExtra)} routed to remaining pot gaps`:'No extra wage to route');
      A().ui.text('autoWageRemaining',money(c.plan.wageExtraRemaining));
      A().ui.text('autoBillsDue',money(c.auto.billsDue));
      A().ui.text('autoAnnualBills',money(c.auto.annualHoldingContribution));
      A().ui.text('autoHoldingTopUp',money(c.auto.holdingTopUp));
      A().ui.text('autoPotsDue',money(c.auto.potsDue));
      A().ui.text('autoTotalFunding',money(c.commitments));
    }));
    $('savePlan')?.addEventListener('click',()=>{savePlan();showToast('Payday plan saved locally in Aurora 2.0.');});
    $('releaseMission')?.addEventListener('click',releaseMission);

    $('savePot')?.addEventListener('click',savePot);
    $('cancelPot')?.addEventListener('click',resetPotEditor);
    $('potGoalMode')?.addEventListener('change',updatePotSpentVisibility);

    $('saveBill')?.addEventListener('click',saveBill);
    $('cancelBill')?.addEventListener('click',resetBillEditor);

    document.addEventListener('click',e=>{
      const potEdit=e.target.closest('[data-pot-edit]'); if(potEdit){editPot(potEdit.dataset.potEdit);return;}
      const potArchive=e.target.closest('[data-pot-archive]'); if(potArchive){togglePotArchive(potArchive.dataset.potArchive);return;}
      const billEdit=e.target.closest('[data-bill-edit]'); if(billEdit){editBill(billEdit.dataset.billEdit);return;}
      const billArchive=e.target.closest('[data-bill-archive]'); if(billArchive){toggleBillArchive(billArchive.dataset.billArchive);return;}
      const billComplete=e.target.closest('[data-bill-complete]'); if(billComplete){completeBill(billComplete.dataset.billComplete);return;}
      const undo=e.target.closest('[data-payment-undo]'); if(undo){undoPayment(undo.dataset.paymentUndo);return;}
    });
  }

  function showToast(msg){
    const el=$('toast'); if(!el)return;
    el.textContent=msg; el.style.opacity='1';
    clearTimeout(showToast.t); showToast.t=setTimeout(()=>el.style.opacity='0',2800);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    repairPaidRecurringBills();
    repairLegacyDuplicateGroceries();
    loadForm(); resetPotEditor(); resetBillEditor(); renderAll(); wire();
  });
  w.addEventListener('aurora2:state',renderAll);
})(window);
