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

  function autoCommitments(state,plan){
    const payday=parseLocalDate(plan.paydayDate);
    const bills=activeBills(state).filter(b=>{
      if(b.paid||b.included===false||b.fundingSource!=='Current Account')return false;
      const due=parseLocalDate(b.due);
      if(!due||!payday)return false;
      return due.getTime()<=payday.getTime();
    });
    const billsDue=bills.reduce((s,b)=>s+Math.max(0,Number(b.amount)||0),0);

    const pots=activePots(state);
    const potsDue=pots.reduce((s,p)=>{
      const gap=potGap(p);
      return s+Math.min(gap,Math.max(0,Number(p.fundingPerPayday)||0));
    },0);

    return {billsDue,potsDue,bills};
  }

  function calc(plan,state=A().core.read()){
    const auto=autoCommitments(state,plan);
    const normalized={...plan,billsDue:auto.billsDue,potsDue:auto.potsDue};
    const totalCash=(Number(normalized.openingCash)||0)+(Number(normalized.netPay)||0)+(Number(normalized.extraCash)||0);
    const commitments=auto.billsDue+auto.potsDue+(Number(normalized.otherPlanned)||0);
    const safeSurplus=Math.max(0,totalCash-commitments-(Number(normalized.protectedCash)||0));
    return {totalCash,commitments,safeSurplus,auto,plan:normalized};
  }

  function readForm(){
    const state=A().core.read();
    const base=state.finance?.plan||{};
    return {
      ...base,
      paydayDate:value('paydayDate'),
      openingCash:numValue('openingCash'),
      netPay:numValue('netPay'),
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
    renderAll();
    return {plan:saved,c};
  }

  function renderPlan(){
    const state=A().core.read(), raw=state.finance?.plan||{}, c=calc(raw,state), plan=c.plan, ui=A().ui;
    ui.text('mOpening',money(plan.openingCash));
    ui.text('mPay',money(plan.netPay));
    ui.text('mCommitments',money(c.commitments));
    ui.text('mProtected',money(plan.protectedCash));
    ui.text('mAvailable',money(c.safeSurplus));
    ui.text('breakTotal',money(c.totalCash));
    ui.text('breakBills',`− ${money(c.auto.billsDue)}`);
    ui.text('breakPots',`− ${money(c.auto.potsDue)}`);
    ui.text('breakOther',`− ${money(plan.otherPlanned)}`);
    ui.text('breakProtected',`− ${money(plan.protectedCash)}`);
    ui.text('breakAvailable',money(c.safeSurplus));
    ui.text('autoBillsDue',money(c.auto.billsDue));
    ui.text('autoPotsDue',money(c.auto.potsDue));
    ui.text('autoBillsCount',`${c.auto.bills.length} current-account bill${c.auto.bills.length===1?'':'s'} due by payday`);
    ui.text('autoPotsCount',`${activePots(state).filter(p=>Math.min(potGap(p),Number(p.fundingPerPayday)||0)>.009).length} pot contribution${activePots(state).filter(p=>Math.min(potGap(p),Number(p.fundingPerPayday)||0)>.009).length===1?'':'s'} scheduled`);

    const release=$('releaseAmount');
    if(release&&document.activeElement!==release&&(!release.value||Number(release.value)>c.safeSurplus)){
      release.value=c.safeSurplus?c.safeSurplus.toFixed(2):'';
    }
    renderReleaseGuard(c.safeSurplus);
  }

  function renderReleaseGuard(safe){
    const requested=numValue('releaseAmount'), msg=$('releaseGuard'), btn=$('releaseMission');
    if(!msg||!btn)return;
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
    if(current.mission&&current.mission.status&&!['FINANCE_APPROVED','CANCELLED'].includes(current.mission.status)){
      alert('This mission has already moved beyond Finance and is locked. Finish or cancel it in the owning department before replacing it.');
      return;
    }
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
        commitments:Number(c.commitments.toFixed(2)),
        billsDue:Number(c.auto.billsDue.toFixed(2)),
        potsDue:Number(c.auto.potsDue.toFixed(2)),
        protectedCash:Number(plan.protectedCash.toFixed(2)),
        safeSurplus:Number(c.safeSurplus.toFixed(2))
      }
    };
    A().core.update(s=>({
      ...s,
      finance:{...s.finance,plan:{...c.plan,releaseAmount:amount},lastReleasedAt:isoNow()},
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
    ui.text('missionStatus',m?.status==='FINANCE_APPROVED'?'FINANCE APPROVED':m?.status||'NO ACTIVE MISSION');
    ui.text('missionAmount',m?.approvedBudget!=null?money(m.approvedBudget):'£0.00');
    ui.text('missionMeta',m?`${m.id}${m.paydayDate?' • payday '+m.paydayDate:''}`:'Nothing has been released to Transfer yet.');
    const lock=$('missionLock');
    if(lock)lock.textContent=m?.status==='FINANCE_APPROVED'
      ?'Budget locked at Finance. Transfer may read it but cannot overwrite it.'
      :'Finance owns the investment budget.';
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
    renderPlan(); renderMission(); renderPots(); renderBills(); renderHistory(); renderLastUpdated();
  }

  function loadForm(){
    const p=A().core.read().finance?.plan||{};
    ['paydayDate','openingCash','netPay','extraCash','otherPlanned','protectedCash','releaseAmount'].forEach(id=>setValue(id,p[id]??''));
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
      A().ui.text('autoBillsDue',money(c.auto.billsDue));
      A().ui.text('autoPotsDue',money(c.auto.potsDue));
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
    loadForm(); resetPotEditor(); resetBillEditor(); renderAll(); wire();
  });
  w.addEventListener('aurora2:state',renderAll);
})(window);
