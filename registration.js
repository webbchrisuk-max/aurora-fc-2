(function(w){
  'use strict';
  const A=()=>w.Aurora2;
  const D=()=>w.AuroraData2Client;
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const money=v=>A().ui.money(Number(v)||0);
  const esc=v=>A().ui.escape(v);
  const now=()=>new Date().toISOString();

  function toast(msg){
    const el=$('toast');if(!el)return;el.textContent=msg;el.style.opacity='1';
    clearTimeout(w.__a2RegToast);w.__a2RegToast=setTimeout(()=>el.style.opacity='0',2400);
  }
  function set(id,v){const el=$(id);if(el)el.textContent=v}
  function setValue(id,v){const el=$(id);if(el)el.value=v??''}
  function accountCode(v){
    const s=String(v||'').toLowerCase();
    if(s.includes('212'))return 'T212';
    if(/\big\b/.test(s)||s.includes('ig isa'))return 'IG';
    return String(v||'').toUpperCase()==='IG'?'IG':String(v||'').toUpperCase()==='T212'?'T212':'CHECK';
  }
  function accountLabel(v){const c=accountCode(v);return c==='IG'?'IG ISA':c==='T212'?'Trading 212 ISA':'Platform check'}
  function currentState(){return A().core.read()}
  function route(state=currentState()){return state.transfer?.route||null}
  function mission(state=currentState()){return state.mission||null}
  function allocations(state=currentState()){return arr(route(state)?.allocations).filter(a=>num(a.amount)>0)}
  function routeReady(state=currentState()){
    const r=route(state),m=mission(state);
    return !!(r?.locked&&m&&r.missionId===m.id&&['TRANSFER_READY','REGISTERED'].includes(String(r.status||'')));
  }
  function currentAllocation(state=currentState()){
    const id=$('regAllocation')?.value;
    return allocations(state).find(a=>a.id===id)||null;
  }
  function localHolding(state,account,ticker){
    const ac=accountCode(account),tk=String(ticker||'').toUpperCase();
    return arr(state.squad?.holdings).find(h=>accountCode(h.account)===ac&&String(h.ticker||'').toUpperCase()===tk&&h.status!=='SOLD'&&h.status!=='ARCHIVED')||null;
  }
  function scoutingTarget(state,ticker){
    const tk=String(ticker||'').toUpperCase();
    return arr(state.scouting?.targets).find(t=>String(t.ticker||'').toUpperCase()===tk)||null;
  }
  function draftForAllocation(state,id){
    return arr(state.transfer?.registrationDrafts).find(d=>d.allocationId===id&&d.routeId===route(state)?.id&&d.status!=='CANCELLED')||null;
  }
  function uid(prefix){return A().core.uid(prefix)}


  function setExecutionLocked(locked){
    ['regDate','regShares','regPrice','regPriceUnit','regCurrency','regActualGbp','regFx','regFees'].forEach(id=>{
      const el=$(id);if(el)el.disabled=!!locked;
    });
    const save=$('saveDraft'),register=$('registerPurchase');
    if(save)save.disabled=!!locked;
    if(register)register.disabled=!!locked;
  }


  function ensureActualGbpField(){
    if($('regActualGbp'))return;
    const currencyField=$('regCurrency')?.closest('.field');
    if(!currencyField)return;
    const field=document.createElement('div');
    field.className='field';
    field.id='regActualGbpField';
    field.innerHTML=`<label for="regActualGbp">Actual GBP charged</label><input id="regActualGbp" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Broker total, e.g. 165.03"><small id="regActualGbpHint" style="display:block;margin-top:5px;color:var(--muted);font-size:7px;line-height:1.35">Enter the broker's final GBP cost. For non-GBP trades Aurora derives FX automatically.</small>`;
    currencyField.insertAdjacentElement('afterend',field);
  }

  function updateFxUi(currency,brokerActualGbp,totalNative,fx,derived){
    const fxInput=$('regFx');
    const fxLabel=document.querySelector('label[for="regFx"]');
    const hint=$('regActualGbpHint');
    if(currency==='GBP'){
      if(fxLabel)fxLabel.textContent='FX to GBP';
      if(fxInput){fxInput.readOnly=true;fxInput.value='1'}
      if(hint)hint.textContent='Optional cross-check for GBP trades. It must match the execution total (including fees).';
      return;
    }
    if(derived&&brokerActualGbp>0&&totalNative>0){
      if(fxLabel)fxLabel.textContent='FX to GBP (auto)';
      if(fxInput){fxInput.readOnly=true;fxInput.value=Number(fx.toFixed(9)).toString()}
      if(hint)hint.textContent=`Broker total locked at ${money(brokerActualGbp)} • Aurora derived 1 ${currency} = £${fx.toFixed(6)}.`;
    }else{
      if(fxLabel)fxLabel.textContent='FX to GBP (manual fallback)';
      if(fxInput)fxInput.readOnly=false;
      if(hint)hint.textContent=`Enter the broker's final GBP cost to derive ${currency} → GBP automatically. Use FX manually only if no GBP total is available.`;
    }
  }

  // Registration Currency Guard v1.5.0 — broker GBP total + automatic FX
  // Prefer explicit route/holding/scouting metadata. ARCC is retained as a
  // safe fallback because legacy Aurora 2 routes did not persist quote currency.
  function normalizeCurrency(v){
    const c=String(v||'').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(c)?c:'';
  }
  function firstCurrency(...values){
    for(const v of values){
      const c=normalizeCurrency(v);
      if(c)return c;
    }
    return '';
  }
  function executionCurrency(state,a){
    if(!a)return 'GBP';
    const holding=localHolding(state,a.account,a.ticker);
    const target=scoutingTarget(state,a.ticker);
    const explicit=firstCurrency(
      a.currency,a.tradingCurrency,a.quoteCurrency,a.priceCurrency,a.executionCurrency,
      target?.currency,target?.tradingCurrency,target?.quoteCurrency,target?.priceCurrency,
      holding?.currency,holding?.tradingCurrency,holding?.quoteCurrency,holding?.priceCurrency
    );
    if(explicit)return explicit;
    const ticker=String(a.ticker||'').trim().toUpperCase();
    if(ticker==='ARCC')return 'USD';
    return 'GBP';
  }
  function ensurePriceUnitOption(currency){
    const select=$('regPriceUnit'),c=normalizeCurrency(currency)||'GBP';
    if(!select)return;
    const major=[...select.options].find(o=>String(o.value||'').toUpperCase()==='GBP');
    const pence=[...select.options].find(o=>String(o.value||'').toUpperCase()==='PENCE');
    // AuroraData 2's backend schema uses priceUnit=GBP to mean a major-unit
    // per-share price, while currency carries the real quote currency.
    // Keep the backend value GBP, but show the user the true quote currency.
    if(major)major.textContent=`${c} / share`;
    if(pence)pence.hidden=c!=='GBP';
  }
  function syncPriceUnitToCurrency(){
    const currency=normalizeCurrency($('regCurrency')?.value)||'GBP';
    ensurePriceUnitOption(currency);
    const unit=String($('regPriceUnit')?.value||'GBP').toUpperCase();
    if(currency==='GBP'){
      if(!['GBP','PENCE'].includes(unit))setValue('regPriceUnit','GBP');
      setValue('regFx','1');
      return;
    }
    // Non-GBP purchases are still sent as backend priceUnit=GBP (major units),
    // with currency=USD/EUR/etc and fxRateToGbp carrying the conversion.
    if(unit!=='GBP')setValue('regPriceUnit','GBP');
  }

  function loadConnection(){
    const c=D().config();
    setValue('backendEndpoint',c.endpoint);
    setValue('backendToken',c.token);
  }

  function saveConnection(){
    const c=D().saveConfig($('backendEndpoint')?.value,$('backendToken')?.value);
    A().core.update(s=>({...s,registration:{...s.registration,backend:{...s.registration.backend,spreadsheetId:D().spreadsheetId,status:c.endpoint&&c.token?'CONFIGURED':'NOT_CONNECTED',lastError:null},updatedAt:now()}}));
    toast(c.endpoint&&c.token?'AuroraData 2 connection saved.':'Connection cleared.');
  }

  async function testConnection(){
    saveConnection();
    set('connectionState','CHECKING');
    $('testConnection').disabled=true;
    try{
      const res=await D().health();
      A().core.update(s=>({...s,
        connection:{...s.connection,mode:'AuroraData2',status:'CONNECTED',spreadsheetId:D().spreadsheetId},
        registration:{...s.registration,backend:{...s.registration.backend,status:'CONNECTED',lastHealthAt:now(),lastError:null},updatedAt:now()}
      }));
      set('connectionNote',`Connected • ${res.transactions||0} transaction${res.transactions===1?'':'s'} • ${res.holdings||0} holding row${res.holdings===1?'':'s'}.`);
      toast('AuroraData 2 connected.');
    }catch(err){
      A().core.update(s=>({...s,connection:{...s.connection,status:'ERROR'},registration:{...s.registration,backend:{...s.registration.backend,status:'ERROR',lastError:String(err.message||err)},updatedAt:now()}}));
      set('connectionNote',String(err.message||err));
      toast('Connection test failed.');
    }finally{$('testConnection').disabled=false}
  }

  async function seedSquad(){
    saveConnection();
    const state=currentState();
    const holdings=arr(state.squad?.holdings)
      .filter(h=>num(h.shares)>0&&h.status!=='SOLD'&&h.status!=='ARCHIVED'&&['IG','T212'].includes(accountCode(h.account)))
      .map(h=>({
        holdingId:h.id||uid('HOLDING'),
        account:accountCode(h.account),ticker:String(h.ticker||'').toUpperCase(),name:h.name||h.ticker,
        shares:num(h.shares),bookCostGbp:num(h.bookCostGbp),avgCostGbp:num(h.avgCostGbp),
        livePriceGbp:num(h.livePriceGbp),marketValueGbp:num(h.marketValueGbp),profitLossGbp:num(h.profitLossGbp),
        annualDpsGbp:num(h.annualDpsGbp),annualIncomeGbp:num(h.annualIncomeGbp),sector:h.sector||'',role:h.role||'',
        status:h.status||'ACTIVE',locked:!!h.locked,lockReason:h.lockReason||'',source:h.source||'AURORA2_SQUAD',
        sourceUpdatedAt:h.sourceUpdatedAt||null
      }));
    if(!holdings.length){toast('No active IG / Trading 212 Squad holdings to seed.');return}
    $('seedSquad').disabled=true;
    try{
      const res=await D().post('seedHoldings',{holdings});
      set('connectionNote',`Squad seed complete • ${res.inserted||0} inserted • ${res.skipped||0} already present.`);
      toast('AuroraData 2 holdings seed complete.');
    }catch(err){
      set('connectionNote',String(err.message||err));toast('Squad seed failed.');
    }finally{$('seedSquad').disabled=false}
  }

  function populateAllocationSelect(state=currentState(),preferredId){
    const select=$('regAllocation');if(!select)return;
    const rows=allocations(state);
    const current=preferredId||select.value;
    select.innerHTML=rows.length?rows.map(a=>{
      const d=draftForAllocation(state,a.id);
      const status=d?.status==='CONFIRMED'?' ✓ CONFIRMED':d?' • '+d.status:'';
      const estimate=num(a.estimatedShares)>0?` • plan ~${num(a.estimatedShares).toLocaleString('en-GB')} shares`:'';
      return `<option value="${esc(a.id)}">${esc(a.ticker)} • ${accountLabel(a.account)} • ${money(a.amount)}${esc(estimate)}${esc(status)}</option>`;
    }).join(''):'<option value="">No locked route purchases</option>';
    if(rows.some(a=>a.id===current))select.value=current;
  }

  function loadAllocation(preferredId){
    const state=currentState();
    populateAllocationSelect(state,preferredId);
    const a=currentAllocation(state);
    if(!a){clearExecution(false);return}
    const existing=draftForAllocation(state,a.id);
    setValue('regAccount',accountLabel(a.account));setValue('regTicker',a.ticker);
    const defaultCurrency=executionCurrency(state,a);
    ensurePriceUnitOption(defaultCurrency);
    if(existing){
      setValue('draftId',existing.id);setValue('transactionId',existing.transactionId);setValue('clientRequestId',existing.clientRequestId);
      setValue('regDate',existing.tradeDate);setValue('regShares',existing.shares||'');setValue('regPrice',existing.priceInput||'');
      const storedCurrency=normalizeCurrency(existing.currency);
      const savedCurrency=defaultCurrency!=='GBP'&&(!storedCurrency||storedCurrency==='GBP')
        ?defaultCurrency
        :(storedCurrency||defaultCurrency);
      setValue('regCurrency',savedCurrency);
      ensurePriceUnitOption(savedCurrency);
      // Repair legacy contradictory drafts such as ARCC = USD currency but GBP/share.
      const savedUnit=String(existing.priceUnit||'').toUpperCase();
      setValue('regPriceUnit',savedCurrency==='GBP'&&['GBP','PENCE'].includes(savedUnit)?savedUnit:'GBP');
      setValue('regActualGbp',existing.brokerActualGbp||(existing.status==='CONFIRMED'?existing.totalCostGbp:'')||'');
      setValue('regFx',savedCurrency==='GBP'?1:(existing.fxRateToGbp||''));
      setValue('regFees',existing.feesNative||0);
    }else{
      setValue('draftId','');setValue('transactionId','');setValue('clientRequestId','');
      setValue('regShares','');setValue('regPrice','');
      setValue('regCurrency',defaultCurrency);
      setValue('regPriceUnit','GBP');
      setValue('regActualGbp','');
      setValue('regFx',defaultCurrency==='GBP'?'1':'');
      setValue('regFees','0');
      if(!$('regDate')?.value){const d=new Date();setValue('regDate',`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)}
    }
    const note=$('precheckNote');
    if(note&&!existing&&num(a.estimatedShares)>0){
      note.className='notice';
      note.textContent=`Transfer plan: ${money(a.amount)} via ${accountLabel(a.account)} • approximately ${num(a.estimatedShares).toLocaleString('en-GB')} shares at ${money(a.estimatedPriceGbp)}. Enter the actual broker execution below.`;
    }
    syncPriceUnitToCurrency();
    setExecutionLocked(existing?.status==='CONFIRMED');
    calcExecution();
  }

  function calcExecution(){
    const state=currentState(),a=currentAllocation(state);
    const existing=a?draftForAllocation(state,a.id):null;
    if(existing?.status==='CONFIRMED'){
      setExecutionLocked(true);
      const planned=num(a?.amount),actual=num(existing.totalCostGbp),difference=actual-planned;
      setValue('regActualGbp',actual||'');
      updateFxUi(normalizeCurrency(existing.currency)||'GBP',actual,num(existing.totalCostNative),num(existing.fxRateToGbp)||1,(normalizeCurrency(existing.currency)||'GBP')!=='GBP');
      set('pPlanned',money(planned));set('pActual',money(actual));set('pDifference',`${difference>=0?'+ ':'− '}${money(Math.abs(difference))}`);
      set('pPreviousShares',num(existing.previousShares).toLocaleString('en-GB',{maximumFractionDigits:6}));
      set('pNewShares',num(existing.newShares).toLocaleString('en-GB',{maximumFractionDigits:6}));
      set('pNewAvg',money(num(existing.newAvgCostGbp)));
      set('executionState','CONFIRMED');
      const note=$('precheckNote');
      if(note){note.className='notice good';note.textContent=`Confirmed by AuroraData 2 • ${existing.transactionId} • ${money(actual)}. This allocation is locked against duplicate registration.`}
      return {a,existing,confirmed:true,ready:false};
    }
    setExecutionLocked(false);
    const shares=Math.max(0,num($('regShares')?.value)),price=Math.max(0,num($('regPrice')?.value));
    const priceUnit=String($('regPriceUnit')?.value||'GBP').toUpperCase().trim();
    const currency=normalizeCurrency($('regCurrency')?.value)||'GBP';
    const fees=Math.max(0,num($('regFees')?.value));
    const brokerActualGbp=Math.max(0,num($('regActualGbp')?.value));
    const unitPrice=priceUnit==='PENCE'?price/100:price;
    const grossNative=shares*unitPrice,totalNative=grossNative+fees;
    const manualFx=currency==='GBP'?1:Math.max(0,num($('regFx')?.value));
    const fxWasDerived=currency!=='GBP'&&brokerActualGbp>0&&totalNative>0;
    const fx=currency==='GBP'?1:(fxWasDerived?brokerActualGbp/totalNative:manualFx);
    const totalGbp=currency==='GBP'?totalNative:(fxWasDerived?brokerActualGbp:totalNative*(fx||0));
    updateFxUi(currency,brokerActualGbp,totalNative,fx,fxWasDerived);
    const planned=num(a?.amount),difference=totalGbp-planned;
    const holding=a?localHolding(state,a.account,a.ticker):null;
    const previousShares=num(holding?.shares),previousBook=num(holding?.bookCostGbp);
    const newShares=previousShares+shares,newBook=previousBook+totalGbp,newAvg=newShares>0?newBook/newShares:0;
    const target=a?scoutingTarget(state,a.ticker):null;
    const yieldPct=num(target?.yieldPct||a?.yieldPct),expectedAnnualIncome=totalGbp*(yieldPct/100);
    const checks=[];
    if(!routeReady(state))checks.push('Transfer route is not locked and ready.');
    if(!a)checks.push('Select a route allocation.');
    if(a&&!['IG','T212'].includes(accountCode(a.account)))checks.push('Allocation broker is unresolved.');
    if(!(shares>0))checks.push('Shares must be greater than zero.');
    if(!(price>0))checks.push('Execution price must be greater than zero.');
    if(currency==='GBP'&&!['GBP','PENCE'].includes(priceUnit))checks.push(`Price Unit ${priceUnit} does not match GBP currency.`);
    if(currency!=='GBP'&&priceUnit!=='GBP')checks.push(`Price Unit must use major ${currency} units per share.`);
    if(currency!=='GBP'&&!(fx>0))checks.push('Enter Actual GBP charged (recommended) or an FX to GBP rate.');
    if(currency==='GBP'&&brokerActualGbp>0&&Math.abs(brokerActualGbp-totalNative)>0.02)checks.push(`Actual GBP charged ${money(brokerActualGbp)} does not match execution total ${money(totalNative)}. Check price and fees.`);
    if(!(totalGbp>0))checks.push('Calculated GBP cost must be greater than zero.');
    const ready=checks.length===0;
    set('pPlanned',money(planned));set('pActual',money(totalGbp));set('pDifference',`${difference>=0?'+ ':'− '}${money(Math.abs(difference))}`);
    set('pPreviousShares',previousShares.toLocaleString('en-GB',{maximumFractionDigits:6}));
    set('pNewShares',newShares.toLocaleString('en-GB',{maximumFractionDigits:6}));set('pNewAvg',money(newAvg));
    set('executionState',ready?'READY':'WAITING');
    const note=$('precheckNote');
    if(note){const fxNote=currency==='GBP'?'GBP trade':fxWasDerived?`FX auto-derived ${fx.toFixed(6)} from broker total ${money(brokerActualGbp)}`:`manual FX ${fx.toFixed(6)}`;note.className=ready?'notice good':'notice';note.textContent=ready?`Ready • ${fxNote} • backend will re-calculate ${money(totalGbp)} before writing. Expected new annual income from this purchase: ${money(expectedAnnualIncome)}/yr.`:checks.join(' ')}
    $('registerPurchase').disabled=!ready;
    return {a,shares,price,priceUnit,currency,fx,fees,brokerActualGbp,fxWasDerived,unitPrice,grossNative,totalNative,totalGbp,planned,difference,holding,previousShares,previousBook,newShares,newBook,newAvg,target,yieldPct,expectedAnnualIncome,ready,checks};
  }

  function draftPayload(c,existing={}){
    const state=currentState(),r=route(state),m=mission(state);
    return {
      ...existing,
      id:existing.id||$('draftId')?.value||uid('REGDRAFT'),
      routeId:r?.id||'',missionId:m?.id||'',allocationId:c.a?.id||'',
      transactionId:existing.transactionId||$('transactionId')?.value||uid('TX'),
      clientRequestId:existing.clientRequestId||$('clientRequestId')?.value||uid('REQ'),
      tradeDate:$('regDate')?.value||'',account:accountCode(c.a?.account),ticker:c.a?.ticker||'',name:c.a?.name||c.a?.ticker||'',
      side:'BUY',shares:c.shares,priceInput:c.price,priceUnit:(c.currency==='GBP'&&c.priceUnit==='PENCE'?'PENCE':'GBP'),currency:c.currency,fxRateToGbp:c.fx,
      grossCostNative:c.grossNative,feesNative:c.fees,totalCostNative:c.totalNative,totalCostGbp:c.totalGbp,
      brokerActualGbp:c.brokerActualGbp||0,fxSource:c.fxWasDerived?'BROKER_GBP_TOTAL':(c.currency==='GBP'?'GBP':'MANUAL'),
      plannedAmount:c.planned,differenceGbp:c.difference,previousShares:c.previousShares,newShares:c.newShares,
      previousBookCostGbp:c.previousBook,newBookCostGbp:c.newBook,previousAvgCostGbp:num(c.holding?.avgCostGbp),newAvgCostGbp:c.newAvg,
      expectedAnnualIncomeGbp:c.expectedAnnualIncome,status:existing.status==='CONFIRMED'?'CONFIRMED':'READY_FOR_BACKEND',
      error:'',createdAt:existing.createdAt||now(),updatedAt:now()
    };
  }

  function saveDraft(){
    const c=calcExecution();if(!c.ready){toast('Complete the registration pre-check first.');return null}
    const state=currentState(),existing=draftForAllocation(state,c.a.id);
    if(existing?.status==='CONFIRMED'){toast('This allocation is already confirmed.');return existing}
    const draft=draftPayload(c,existing||{});
    A().core.update(s=>({...s,transfer:{...s.transfer,registrationDrafts:[
      draft,...arr(s.transfer?.registrationDrafts).filter(d=>d.id!==draft.id&&!(d.routeId===draft.routeId&&d.allocationId===draft.allocationId&&d.status!=='CONFIRMED'))
    ],updatedAt:now()},registration:{...s.registration,updatedAt:now()}}));
    setValue('draftId',draft.id);setValue('transactionId',draft.transactionId);setValue('clientRequestId',draft.clientRequestId);
    toast('Registration draft saved. Squad has not changed.');
    return draft;
  }

  function priorHoldingSnapshot(h){
    if(!h)return null;
    return {
      holdingId:h.id||'',account:accountCode(h.account),ticker:String(h.ticker||'').toUpperCase(),name:h.name||h.ticker,
      shares:num(h.shares),bookCostGbp:num(h.bookCostGbp),avgCostGbp:num(h.avgCostGbp),livePriceGbp:num(h.livePriceGbp),
      marketValueGbp:num(h.marketValueGbp),profitLossGbp:num(h.profitLossGbp),annualDpsGbp:num(h.annualDpsGbp),
      annualIncomeGbp:num(h.annualIncomeGbp),sector:h.sector||'',role:h.role||'',status:h.status||'ACTIVE',
      locked:!!h.locked,lockReason:h.lockReason||'',source:h.source||'AURORA2_SQUAD',sourceUpdatedAt:h.sourceUpdatedAt||null
    };
  }

  async function registerPurchase(){
    let confirmedDraft=null;
    saveConnection();
    const c=calcExecution();if(!c.ready)return;
    let draft=saveDraft();if(!draft||draft.status==='CONFIRMED')return;
    $('registerPurchase').disabled=true;set('executionState','WRITING');
    A().core.update(s=>({...s,transfer:{...s.transfer,registrationDrafts:arr(s.transfer.registrationDrafts).map(d=>d.id===draft.id?{...d,status:'SENDING',error:'',updatedAt:now()}:d)}}));
    try{
      const state=currentState(),r=route(state),m=mission(state),target=scoutingTarget(state,draft.ticker);
      const result=await D().post('registerPurchase',{
        transaction:{
          transactionId:draft.transactionId,clientRequestId:draft.clientRequestId,tradeDate:draft.tradeDate,
          account:draft.account,ticker:draft.ticker,name:draft.name,side:'BUY',shares:draft.shares,priceInput:draft.priceInput,
          priceUnit:(draft.currency==='GBP'&&draft.priceUnit==='PENCE'?'PENCE':'GBP'),currency:draft.currency,fxRateToGbp:draft.fxRateToGbp,feesNative:draft.feesNative,
          totalCostGbp:draft.totalCostGbp,missionId:draft.missionId,routeId:draft.routeId,allocationId:draft.allocationId,
          strategy:r?.strategy||'',recommendation:target?.recommendation||'',confidence:num(target?.confidence),
          expectedAnnualIncomeGbp:draft.expectedAnnualIncomeGbp
        },
        priorHolding:priorHoldingSnapshot(c.holding),
        missionSnapshot:m?{
          missionId:m.id,paydayDate:m.paydayDate,approvedBudget:num(m.approvedBudget),status:m.status,
          totalCash:num(m.financeSnapshot?.totalCash),commitments:num(m.financeSnapshot?.commitments),protectedCash:num(m.financeSnapshot?.protectedCash),
          safeSurplus:num(m.financeSnapshot?.safeSurplus),expectedWages:num(m.financeSnapshot?.expectedWages),wagesReceived:num(m.financeSnapshot?.wagesReceived),
          wageDifference:num(m.financeSnapshot?.wageDifference),annualBillFunding:num(m.financeSnapshot?.annualBillFunding),
          potFundingRequired:num(m.financeSnapshot?.potsDue),holdingPotTopUp:num(m.financeSnapshot?.holdingPotTopUp),source:'AURORA2_FINANCE'
        }:null,
        routeSnapshot:r?{
          routeId:r.id,missionId:r.missionId,strategy:r.strategy,financeBudget:num(r.financeBudget),allocated:num(r.allocated),
          remaining:num(r.remaining),expectedAnnualIncome:num(r.expectedAnnualIncome),status:r.status,locked:!!r.locked,
          createdAt:r.createdAt,allocations:r.allocations
        }:null
      });
      if(!result?.confirmed||!result?.transaction||!result?.holding)throw new Error('Backend did not return a confirmed transaction and holding.');
      if(String(result.transaction.transactionId)!==String(draft.transactionId))throw new Error('Read-back transaction ID did not match the submitted transaction.');

      const h=result.holding;
      const receipt={
        id:result.receiptId||result.backendReceiptId||uid('RECEIPT'),
        backendReceiptId:result.receiptId||result.backendReceiptId||'',
        transactionId:draft.transactionId,routeId:draft.routeId,missionId:draft.missionId,allocationId:draft.allocationId,
        account:draft.account,ticker:draft.ticker,totalCostGbp:num(result.transaction.totalCostGbp||draft.totalCostGbp),
        confirmedAt:result.confirmedAt||now(),duplicate:!!result.duplicate,source:'AURORADATA2'
      };

      A().core.update(s=>{
        const newHolding={
          id:h.holdingId||h.id||c.holding?.id||uid('HOLDING'),
          ticker:String(h.ticker||draft.ticker).toUpperCase(),name:h.name||draft.name,account:accountCode(h.account||draft.account),
          shares:num(h.shares),bookCostGbp:num(h.bookCostGbp),avgCostGbp:num(h.avgCostGbp),livePriceGbp:num(h.livePriceGbp),
          marketValueGbp:num(h.marketValueGbp),profitLossGbp:num(h.profitLossGbp),annualDpsGbp:num(h.annualDpsGbp),
          annualIncomeGbp:num(h.annualIncomeGbp),sector:h.sector||c.holding?.sector||'',role:h.role||c.holding?.role||'',
          status:h.status||'ACTIVE',locked:!!h.locked,lockReason:h.lockReason||'',source:'AURORADATA2',
          sourceKey:draft.transactionId,sourceUpdatedAt:receipt.confirmedAt,createdAt:c.holding?.createdAt||now(),updatedAt:receipt.confirmedAt
        };
        const holdings=arr(s.squad?.holdings);
        const hitIndex=holdings.findIndex(x=>accountCode(x.account)===newHolding.account&&String(x.ticker||'').toUpperCase()===newHolding.ticker&&x.status!=='SOLD'&&x.status!=='ARCHIVED');
        const nextHoldings=hitIndex>=0?holdings.map((x,i)=>i===hitIndex?{...x,...newHolding}:x):[newHolding,...holdings];
        const nextDrafts=arr(s.transfer?.registrationDrafts).map(d=>d.id===draft.id?{
          ...d,status:'CONFIRMED',backendReceiptId:receipt.backendReceiptId,confirmedAt:receipt.confirmedAt,error:'',
          previousShares:num(result.transaction.previousShares),newShares:num(result.transaction.newShares),
          previousBookCostGbp:num(result.transaction.previousBookCostGbp),newBookCostGbp:num(result.transaction.newBookCostGbp),
          previousAvgCostGbp:num(result.transaction.previousAvgCostGbp),newAvgCostGbp:num(result.transaction.newAvgCostGbp),updatedAt:receipt.confirmedAt
        }:d);
        const nextAllocations=arr(s.transfer?.route?.allocations).map(a=>a.id===draft.allocationId?{...a,status:'REGISTERED'}:a);
        const allRegistered=nextAllocations.filter(a=>num(a.amount)>0).every(a=>a.status==='REGISTERED');
        const nextRoute=s.transfer?.route?{...s.transfer.route,allocations:nextAllocations,status:allRegistered?'REGISTERED':s.transfer.route.status,locked:true,updatedAt:receipt.confirmedAt}:s.transfer?.route;
        const nextMission=s.mission&&allRegistered?{...s.mission,status:'REGISTERED',updatedAt:receipt.confirmedAt}:s.mission;
        const relatedDrafts=nextDrafts.filter(d=>d.routeId===nextRoute?.id&&d.status==='CONFIRMED');
        const completedMission=allRegistered&&nextRoute&&nextMission?{
          missionId:nextMission.id,routeId:nextRoute.id,paydayDate:nextMission.paydayDate||'',strategy:nextRoute.strategy||'',
          plannedTransferAmount:num(nextMission.approvedBudget),plannedAllocated:num(nextRoute.allocated),
          actualAmountInvested:relatedDrafts.reduce((sum,d)=>sum+num(d.totalCostGbp),0),
          amountRemaining:Math.max(0,num(nextMission.approvedBudget)-relatedDrafts.reduce((sum,d)=>sum+num(d.totalCostGbp),0)),
          estimatedIncomeUplift:num(nextRoute.income),baselineAnnualIncome:num(nextRoute.baselineAnnualIncome),
          currentAnnualIncomeAfter:nextHoldings.reduce((sum,h)=>sum+(num(h.annualIncomeGbp)||(num(h.shares)*num(h.annualDpsGbp))),0),
          completedAt:receipt.confirmedAt,purchases:relatedDrafts.map(d=>({transactionId:d.transactionId,allocationId:d.allocationId,ticker:d.ticker,account:d.account,shares:num(d.shares),priceInput:num(d.priceInput),priceUnit:d.priceUnit,totalCostGbp:num(d.totalCostGbp)}))
        }:null;
        return {
          ...s,
          connection:{...s.connection,mode:'AuroraData2',status:'CONNECTED',spreadsheetId:D().spreadsheetId},
          transfer:{...s.transfer,route:nextRoute,registrationDrafts:nextDrafts,
            completedMissions:completedMission?[completedMission,...arr(s.transfer?.completedMissions).filter(x=>x.routeId!==completedMission.routeId)].slice(0,24):arr(s.transfer?.completedMissions),
            updatedAt:receipt.confirmedAt},
          squad:{...s.squad,holdings:nextHoldings,source:'AURORADATA2',updatedAt:receipt.confirmedAt},
          registration:{...s.registration,backend:{...s.registration.backend,status:'CONNECTED',lastHealthAt:receipt.confirmedAt,lastError:null},
            receipts:[receipt,...arr(s.registration?.receipts).filter(x=>x.transactionId!==receipt.transactionId)].slice(0,100),updatedAt:receipt.confirmedAt},
          mission:nextMission,
          alerts:[{id:A().core.uid('ALERT'),title:'Purchase registered',note:`${draft.ticker} • ${draft.account} • ${money(receipt.totalCostGbp)} confirmed by AuroraData 2.`,when:'now'},...arr(s.alerts).filter(a=>a?.title!=='Purchase registered')].slice(0,8)
        };
      });
      confirmedDraft=draft;
      toast(result.duplicate?'Existing transaction confirmed — no duplicate write.':'Purchase confirmed and Squad updated.');
      set('executionState','CONFIRMED');
    }catch(err){
      const msg=String(err.message||err);
      A().core.update(s=>({...s,registration:{...s.registration,backend:{...s.registration.backend,lastError:msg},updatedAt:now()},transfer:{...s.transfer,registrationDrafts:arr(s.transfer.registrationDrafts).map(d=>d.id===draft.id?{...d,status:'BACKEND_ERROR',error:msg,updatedAt:now()}:d)}}));
      set('precheckNote',msg);toast('Registration failed — Squad was not changed.');
    }finally{
      render();
      if(confirmedDraft){
        const updated=currentState();
        const next=allocations(updated).find(a=>draftForAllocation(updated,a.id)?.status!=='CONFIRMED');
        if(next)loadAllocation(next.id);
        else loadAllocation(confirmedDraft.allocationId);
      }else if($('registerPurchase')){
        $('registerPurchase').disabled=false;
      }
    }
  }

  function clearExecution(keepAllocation=true){
    ['draftId','transactionId','clientRequestId','regShares','regPrice','regActualGbp'].forEach(id=>setValue(id,''));
    const state=currentState(),a=keepAllocation?currentAllocation(state):null;
    const currency=a?executionCurrency(state,a):'GBP';
    ensurePriceUnitOption(currency);
    setValue('regCurrency',currency);
    setValue('regPriceUnit','GBP');
    setValue('regFx',currency==='GBP'?'1':'');
    setValue('regFees','0');
    if(!keepAllocation){setValue('regAccount','');setValue('regTicker','')}
    const d=new Date();setValue('regDate',`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    calcExecution();
  }

  function loadDraft(id){
    const state=currentState(),d=arr(state.transfer?.registrationDrafts).find(x=>x.id===id);if(!d)return;
    populateAllocationSelect(state,d.allocationId);setValue('regAllocation',d.allocationId);loadAllocation(d.allocationId);
    document.getElementById('executionSection')?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function deleteDraft(id){
    const state=currentState(),d=arr(state.transfer?.registrationDrafts).find(x=>x.id===id);
    if(!d||d.status==='CONFIRMED'){toast('Confirmed registrations cannot be deleted locally.');return}
    A().core.update(s=>({...s,transfer:{...s.transfer,registrationDrafts:arr(s.transfer.registrationDrafts).filter(x=>x.id!==id),updatedAt:now()}}));
    toast('Draft removed.');
  }

  function renderConnection(state){
    const b=state.registration?.backend||{},connected=b.status==='CONNECTED';
    set('connectionState',b.status||'NOT CONNECTED');set('kBackend',connected?'ONLINE':b.status==='ERROR'?'ERROR':'OFFLINE');
    set('kBackendMeta',connected?'AuroraData 2 confirmed':b.lastError||'Connect AuroraData 2');
    const note=$('connectionNote');
    if(note&&b.lastError){note.className='notice backend-bad';note.textContent=b.lastError}
    else if(note&&connected){note.className='notice backend-good'}
  }

  function renderRoute(state){
    const r=route(state),m=mission(state),ready=routeReady(state),allocs=allocations(state),drafts=arr(state.transfer?.registrationDrafts).filter(d=>d.routeId===r?.id);
    const confirmed=drafts.filter(d=>d.status==='CONFIRMED');
    const confirmedTotal=confirmed.reduce((s,d)=>s+num(d.totalCostGbp),0),planned=num(r?.allocated||r?.financeBudget);
    set('routeBudget',money(planned));set('routeStatus',ready?(r.status||'TRANSFER_READY'):'NO LOCKED ROUTE');
    set('routeMeta',r?`${r.id} • mission ${m?.id||'—'} • ${allocs.length} purchase allocation${allocs.length===1?'':'s'}`:'Approve the Transfer route first.');
    set('routeLock',ready?'Locked Transfer authority loaded.':'Registration cannot create its own budget.');
    set('kPlanned',money(planned));set('kConfirmed',money(confirmedTotal));set('kRemaining',money(Math.max(0,planned-confirmedTotal)));set('kPurchases',String(confirmed.length));
    set('allocationCount',`${allocs.length} allocation${allocs.length===1?'':'s'}`);
    const host=$('allocationList');
    if(host){
      if(!allocs.length)host.innerHTML='<div class="empty-state compact"><strong>No approved purchases</strong><p>Build and approve the final route in Transfer first.</p></div>';
      else host.innerHTML=allocs.map(a=>{
        const d=draftForAllocation(state,a.id),status=d?.status||a.status||'PLANNED';
        const cls=status==='CONFIRMED'?'confirmed':'ready';
        return `<article class="alloc-row ${cls}"><div class="alloc-main"><strong>${esc(a.ticker)} — ${esc(a.name)} • ${accountLabel(a.account)}</strong><span>${money(a.amount)} planned • ${num(a.yieldPct)>0?num(a.yieldPct).toFixed(2)+'% yield • ':''}${money(a.expectedAnnualIncome)}/yr projected</span></div><div class="alloc-side"><span class="status-pill ${status==='CONFIRMED'?'pass':status==='BACKEND_ERROR'?'block':status==='SENDING'?'info':'caution'}">${esc(status)}</span><div class="action-row" style="justify-content:flex-end;margin-top:6px"><button class="btn secondary" data-load-allocation="${esc(a.id)}">${status==='CONFIRMED'?'View':'Register'}</button></div></div></article>`;
      }).join('');
    }
  }

  function renderQueue(state){
    const r=route(state),rows=arr(state.transfer?.registrationDrafts).filter(d=>!r?.id||d.routeId===r.id),host=$('queueList');
    set('queueCount',`${rows.length} item${rows.length===1?'':'s'}`);
    if(!host)return;
    if(!rows.length){host.innerHTML='<div class="empty-state compact"><strong>No drafts yet</strong><p>Enter the first broker execution above.</p></div>';return}
    host.innerHTML=rows.map(d=>`<article class="queue-row"><div class="queue-main"><strong>${esc(d.ticker)} • ${accountLabel(d.account)} • ${money(d.totalCostGbp)}</strong><span>${esc(d.transactionId)} • ${Number(d.shares||0).toLocaleString('en-GB')} shares • ${esc(d.tradeDate||'date pending')}${d.error?' • '+esc(d.error):''}</span></div><div class="queue-side"><span class="status-pill ${d.status==='CONFIRMED'?'pass':d.status==='BACKEND_ERROR'?'block':d.status==='SENDING'?'info':'caution'}">${esc(d.status)}</span><div class="action-row" style="justify-content:flex-end;margin-top:6px"><button class="btn secondary" data-load-draft="${esc(d.id)}">Open</button>${d.status!=='CONFIRMED'?`<button class="btn secondary" data-delete-draft="${esc(d.id)}">Delete</button>`:''}</div></div></article>`).join('');
  }

  function renderReceipts(state){
    const rows=arr(state.registration?.receipts),host=$('receiptList');set('receiptCount',`${rows.length} receipt${rows.length===1?'':'s'}`);
    if(!host)return;
    if(!rows.length){host.innerHTML='<div class="empty-state compact"><strong>No backend receipts yet</strong><p>Confirmed AuroraData 2 registrations appear here.</p></div>';return}
    host.innerHTML=rows.slice(0,20).map(r=>`<article class="receipt-row"><div class="receipt-main"><strong>${esc(r.ticker)} • ${accountLabel(r.account)} • ${money(r.totalCostGbp)}</strong><span>${esc(r.transactionId)} • ${new Date(r.confirmedAt).toLocaleString('en-GB')}${r.duplicate?' • duplicate request safely re-read':''}</span></div><span class="status-pill pass">CONFIRMED</span></article>`).join('');
  }

  function render(){
    const state=currentState();renderConnection(state);renderRoute(state);populateAllocationSelect(state);renderQueue(state);renderReceipts(state);
    set('lastUpdated',new Date(state.updatedAt).toLocaleString('en-GB'));
    const current=$('regAllocation')?.value;if(current)calcExecution();
  }

  function wire(){
    ensureActualGbpField();
    loadConnection();
    $('saveConnection')?.addEventListener('click',saveConnection);$('testConnection')?.addEventListener('click',testConnection);$('seedSquad')?.addEventListener('click',seedSquad);
    $('regAllocation')?.addEventListener('change',()=>loadAllocation());
    ['regShares','regPrice','regPriceUnit','regActualGbp','regFx','regFees'].forEach(id=>$(id)?.addEventListener('input',calcExecution));
    $('regCurrency')?.addEventListener('change',()=>{syncPriceUnitToCurrency();calcExecution();});
    $('regPriceUnit')?.addEventListener('change',calcExecution);
    $('saveDraft')?.addEventListener('click',saveDraft);$('registerPurchase')?.addEventListener('click',registerPurchase);$('clearExecution')?.addEventListener('click',()=>clearExecution(true));
    $('openExecution')?.addEventListener('click',()=>document.getElementById('executionSection')?.scrollIntoView({behavior:'smooth',block:'start'}));
    document.addEventListener('click',e=>{
      const a=e.target.closest('[data-load-allocation]');if(a){loadAllocation(a.dataset.loadAllocation);document.getElementById('executionSection')?.scrollIntoView({behavior:'smooth',block:'start'});return}
      const d=e.target.closest('[data-load-draft]');if(d){loadDraft(d.dataset.loadDraft);return}
      const del=e.target.closest('[data-delete-draft]');if(del)deleteDraft(del.dataset.deleteDraft);
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{wire();render();const first=allocations()[0];if(first)loadAllocation(first.id);else clearExecution(false)});
  w.addEventListener('aurora2:state',render);
})(window);
