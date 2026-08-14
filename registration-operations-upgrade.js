(function(w){
'use strict';

const ARCHIVE_KEY='aurora2:registration:completed:v1';
const PLAN_KEY='aurora2:broker-cash-plan:v1';
const HANDOFF_KEY='aurora2:reinvest:handoff:v1';

const A=()=>w.Aurora2;
const D=()=>w.AuroraData2Client;
const arr=v=>Array.isArray(v)?v:[];
const num=v=>{
  const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:0;
};
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)||0);
const now=()=>new Date().toISOString();

function accountCode(v){
  const s=String(v||'').toLowerCase();
  if(s.includes('212'))return 'T212';
  if(/\big\b/.test(s)||s.includes('ig isa'))return 'IG';
  const u=String(v||'').toUpperCase();
  return u==='IG'||u==='T212'?u:'CHECK';
}
function accountLabel(v){return accountCode(v)==='IG'?'IG ISA':'Trading 212 ISA'}
function ticker(v){
  return String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();
}
function uid(prefix){
  if(A()?.core?.uid)return A().core.uid(prefix);
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}
function toast(msg){
  const el=document.getElementById('toast');
  if(!el)return;
  el.textContent=msg;
  el.style.opacity='1';
  clearTimeout(w.__a2OpsToast);
  w.__a2OpsToast=setTimeout(()=>el.style.opacity='0',2600);
}
function readJson(key,fallback){
  try{
    const x=JSON.parse(localStorage.getItem(key)||'null');
    return x??fallback;
  }catch(_){return fallback}
}
function writeJson(key,value){
  localStorage.setItem(key,JSON.stringify(value));
}

function activeHolding(state,account,tk){
  const ac=accountCode(account), t=ticker(tk);
  return arr(state.squad?.holdings).find(h=>
    accountCode(h.account)===ac &&
    ticker(h.ticker)===t &&
    !['SOLD','ARCHIVED'].includes(String(h.status||'').toUpperCase())
  )||null;
}
function scoutingTarget(state,tk){
  const t=ticker(tk);
  return arr(state.scouting?.targets).find(x=>ticker(x.ticker)===t)||null;
}
function priorHoldingSnapshot(h){
  if(!h)return null;
  return {
    holdingId:h.id||h.holdingId||'',
    account:accountCode(h.account),
    ticker:ticker(h.ticker),
    name:h.name||h.ticker||'',
    shares:num(h.shares),
    bookCostGbp:num(h.bookCostGbp),
    avgCostGbp:num(h.avgCostGbp),
    livePriceGbp:num(h.livePriceGbp),
    marketValueGbp:num(h.marketValueGbp),
    profitLossGbp:Number(h.profitLossGbp)||0,
    annualDpsGbp:num(h.annualDpsGbp),
    annualIncomeGbp:num(h.annualIncomeGbp),
    sector:h.sector||'',
    role:h.role||'',
    status:h.status||'ACTIVE',
    locked:!!h.locked,
    lockReason:h.lockReason||''
  };
}

function currentRouteComplete(state=A().core.read()){
  const r=state.transfer?.route;
  if(!r||!r.id)return false;
  const allocations=arr(r.allocations).filter(a=>num(a.amount)>0);
  if(!allocations.length)return false;
  if(String(r.status||'').toUpperCase()!=='REGISTERED')return false;
  if(!allocations.every(a=>String(a.status||'').toUpperCase()==='REGISTERED'))return false;

  const drafts=arr(state.transfer?.registrationDrafts).filter(d=>d.routeId===r.id);
  return allocations.every(a=>
    drafts.some(d=>d.allocationId===a.id&&String(d.status||'').toUpperCase()==='CONFIRMED')
  );
}

async function archiveCurrentRegistration(){
  const state=A().core.read(),r=state.transfer?.route;
  if(!r||!currentRouteComplete(state)){
    toast('The current route is not fully confirmed yet.');
    return;
  }

  const drafts=arr(state.transfer?.registrationDrafts).filter(d=>d.routeId===r.id);
  const txIds=new Set(drafts.map(d=>d.transactionId).filter(Boolean));
  const receipts=arr(state.registration?.receipts).filter(x=>txIds.has(x.transactionId));
  const batch={
    batchId:`BATCH-${Date.now()}`,
    completedAt:now(),
    routeId:r.id,
    missionId:r.missionId||state.mission?.id||'',
    strategy:r.strategy||'',
    purchaseCount:drafts.filter(d=>d.status==='CONFIRMED').length,
    totalCostGbp:receipts.reduce((s,x)=>s+num(x.totalCostGbp),0),
    transactionIds:[...txIds],
    note:'Completed through Aurora Registration Desk'
  };

  const btn=document.getElementById('completeRegistrationBatch');
  if(btn){btn.disabled=true;btn.textContent='Archiving…'}

  try{
    const result=await D().post('archiveRegistrationBatch',{batch});
    const canonical=result?.batch||batch;
    const archives=readJson(ARCHIVE_KEY,[]);
    writeJson(ARCHIVE_KEY,[canonical,...archives.filter(x=>x.routeId!==canonical.routeId)].slice(0,50));

    A().core.update(s=>({
      ...s,
      transfer:{
        ...s.transfer,
        route:null,
        registrationDrafts:arr(s.transfer?.registrationDrafts).filter(d=>d.routeId!==r.id),
        updatedAt:now()
      },
      registration:{
        ...s.registration,
        receipts:arr(s.registration?.receipts).filter(x=>!txIds.has(x.transactionId)),
        updatedAt:now()
      },
      mission:s.mission&&s.mission.id===r.missionId?null:s.mission
    }));

    renderArchives();
    toast('Registration completed, archived in AuroraData 2, and reset for the next batch.');
  }catch(err){
    toast(`Could not complete Registration: ${err.message||err}`);
  }finally{
    updateCompleteButton();
  }
}
async function loadArchivesBackend(){
  try{
    const res=await D().post('registrationBatchSnapshot',{});
    const rows=arr(res?.batches);
    if(rows.length||!readJson(ARCHIVE_KEY,[]).length){
      writeJson(ARCHIVE_KEY,rows);
      renderArchives();
    }
  }catch(err){
    console.warn('Registration batch history sync failed',err);
  }
}

function renderArchives(){
  const host=document.getElementById('opsCompletedHistory');
  if(!host)return;
  const rows=readJson(ARCHIVE_KEY,[]);
  if(!rows.length){
    host.innerHTML='<div class="ops-note">No completed registration batches archived yet.</div>';
    return;
  }
  host.innerHTML=rows.slice(0,10).map(b=>`
    <div class="ops-history-row">
      <div>
        <strong>${b.purchaseCount||0} confirmed purchase${(b.purchaseCount||0)===1?'':'s'}</strong>
        <span>${new Date(b.completedAt).toLocaleString('en-GB')} • ${String(b.route?.strategy||'route').toUpperCase()}</span>
      </div>
      <b>${money(b.totalCostGbp)}</b>
    </div>
  `).join('');
}

function updateCompleteButton(){
  const btn=document.getElementById('completeRegistrationBatch');
  if(!btn||!A()?.core?.read)return;
  const ready=currentRouteComplete(A().core.read());
  btn.disabled=!ready;
  btn.textContent=ready?'✓ Complete Registration':'Complete Registration';
  btn.title=ready
    ?'Archive this fully confirmed batch and reset the active Registration Desk.'
    :'All route purchases must be backend-confirmed first.';
}

function currentPlan(){
  return readJson(PLAN_KEY,null);
}
function savePlan(plan){
  if(plan)writeJson(PLAN_KEY,plan);
  else localStorage.removeItem(PLAN_KEY);
  renderPlan();
}
function planAllocationByTicker(account,tk){
  const p=currentPlan();
  if(!p||accountCode(p.account)!==accountCode(account))return null;
  return arr(p.allocations).find(a=>ticker(a.ticker)===ticker(tk)&&String(a.status||'READY')!=='REGISTERED')||null;
}

function calculateManual(){
  const shares=Math.max(0,num(document.getElementById('opsShares')?.value));
  const price=Math.max(0,num(document.getElementById('opsPrice')?.value));
  const fees=Math.max(0,num(document.getElementById('opsFees')?.value));
  const currency=String(document.getElementById('opsCurrency')?.value||'GBP').toUpperCase();
  const unit=String(document.getElementById('opsPriceUnit')?.value||'GBP').toUpperCase();
  const brokerActual=Math.max(0,num(document.getElementById('opsActualGbp')?.value));
  let fx=Math.max(0,num(document.getElementById('opsFx')?.value));

  const unitPrice=unit==='PENCE'?price/100:price;
  const gross=shares*unitPrice;
  const totalNative=gross+fees;
  let totalGbp=0;

  if(currency==='GBP'){
    fx=1;
    totalGbp=totalNative;
  }else if(brokerActual>0&&totalNative>0){
    fx=brokerActual/totalNative;
    totalGbp=brokerActual;
  }else if(fx>0){
    totalGbp=totalNative*fx;
  }

  const account=accountCode(document.getElementById('opsAccount')?.value);
  const tk=ticker(document.getElementById('opsTicker')?.value);
  const state=A()?.core?.read?A().core.read():{};
  const holding=activeHolding(state,account,tk);
  const target=scoutingTarget(state,tk);
  const expectedAnnual=totalGbp*(Math.max(0,num(target?.yieldPct))/100);
  const previousShares=num(holding?.shares);
  const previousBook=num(holding?.bookCostGbp);
  const newShares=previousShares+shares;
  const newBook=previousBook+totalGbp;
  const newAvg=newShares>0?newBook/newShares:0;
  const planAlloc=planAllocationByTicker(account,tk);
  const planned=planAlloc?num(planAlloc.amount):0;

  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
  set('opsPreviewActual',money(totalGbp));
  set('opsPreviewPlan',planned>0?money(planned):'—');
  set('opsPreviewDiff',planned>0?`${totalGbp-planned>=0?'+':''}${money(totalGbp-planned)}`:'—');
  set('opsPreviewShares',newShares.toLocaleString('en-GB',{maximumFractionDigits:6}));
  set('opsPreviewAvg',money(newAvg));

  const note=document.getElementById('opsManualNote');
  const funding=document.getElementById('opsFunding')?.value||'EXTERNAL';
  const unitCoherent=(currency==='GBP'||unit!=='PENCE');
  const gbpCrosscheck=(currency!=='GBP'||brokerActual<=0||Math.abs(brokerActual-totalNative)<=0.02);
  const ready=
    ['IG','T212'].includes(account)&&
    !!tk&&shares>0&&price>0&&totalGbp>0&&
    (currency==='GBP'||fx>0)&&unitCoherent&&gbpCrosscheck;

  if(note){
    note.className='ops-note'+(ready?' good':'');
    note.textContent=ready
      ?`${accountLabel(account)} • ${tk} • actual ${money(totalGbp)} • ${funding==='BROKER_CASH'?'funded from broker dividend cash':funding==='AUTO_REINVESTED'?'broker auto-reinvestment':'manual/external broker cash'}.`
      :'Enter broker, ticker, shares, execution price and enough GBP/FX information to reconcile the purchase.';
  }

  const btn=document.getElementById('opsRegisterManual');
  if(btn)btn.disabled=!ready;

  return {
    ready,account,tk,shares,price,fees,currency,unit,brokerActual,fx,
    gross,totalNative,totalGbp,holding,target,expectedAnnual,newShares,newBook,newAvg,planAlloc,funding
  };
}

function fillFromPlan(allocation){
  if(!allocation)return;
  document.getElementById('opsMode').value='DIVIDEND_REINVESTMENT';
  document.getElementById('opsAccount').value=accountCode(allocation.account);
  document.getElementById('opsTicker').value=ticker(allocation.ticker);
  document.getElementById('opsName').value=allocation.name||allocation.ticker||'';
  document.getElementById('opsFunding').value='BROKER_CASH';
  const note=document.getElementById('opsPlanHint');
  if(note)note.textContent=`Planned ${money(allocation.amount)} from the ${accountLabel(allocation.account)} dividend cash pot. Enter the real broker execution below.`;
  calculateManual();
}

function renderPlan(){
  const host=document.getElementById('opsReinvestmentPlan');
  if(!host)return;
  const plan=currentPlan();

  if(!plan||!arr(plan.allocations).length){
    host.innerHTML='<div class="ops-note">No Dividend Cash deployment plan waiting. Build one in Income Centre.</div>';
    return;
  }

  host.innerHTML=`
    <div class="ops-note good">
      ${accountLabel(plan.account)} • ${String(plan.strategy||'').toUpperCase()} • ${money(plan.budget)} planned •
      ${arr(plan.allocations).filter(a=>a.status==='REGISTERED').length}/${plan.allocations.length} registered
    </div>
    <div class="plan-list">
      ${plan.allocations.map((a,i)=>`
        <div class="plan-row">
          <div><strong>${ticker(a.ticker)} — ${a.name||a.ticker}</strong><span>${money(a.amount)} planned • ${num(a.yieldPct).toFixed(2)}% yield • ${String(a.status||'READY')}</span></div>
          <button class="ops-btn ${a.status==='REGISTERED'?'':'primary'}" data-load-plan="${i}" ${a.status==='REGISTERED'?'disabled':''}>${a.status==='REGISTERED'?'Registered':'Load'}</button>
        </div>
      `).join('')}
    </div>
  `;
}

function markPlanRegistered(transactionId,c){
  const plan=currentPlan();
  if(!plan||!c.planAlloc)return;
  const tk=ticker(c.planAlloc.ticker);
  const next={
    ...plan,
    allocations:arr(plan.allocations).map(a=>
      ticker(a.ticker)===tk&&String(a.status||'READY')!=='REGISTERED'
        ?{...a,status:'REGISTERED',transactionId,actualGbp:c.totalGbp,registeredAt:now()}
        :a
    )
  };
  next.status=next.allocations.every(a=>a.status==='REGISTERED')?'COMPLETE':'IN_PROGRESS';
  savePlan(next);
}

function applyReinvestHandoff(){
  const handoff=readJson(HANDOFF_KEY,null);
  if(!handoff)return;
  if(Date.now()-num(handoff.createdAtMs)>86400000){
    localStorage.removeItem(HANDOFF_KEY);
    return;
  }
  document.getElementById('opsMode').value='DIVIDEND_REINVESTMENT';
  document.getElementById('opsAccount').value=accountCode(handoff.account);
  document.getElementById('opsTicker').value=ticker(handoff.ticker);
  document.getElementById('opsFunding').value='AUTO_REINVESTED';
  const hint=document.getElementById('opsPlanHint');
  if(hint)hint.textContent=`Auto-reinvested dividend handoff • ${accountLabel(handoff.account)} • ${ticker(handoff.ticker)} • dividend ${money(handoff.amountGbp)}. Enter the broker's actual shares and execution price.`;
  localStorage.removeItem(HANDOFF_KEY);
  calculateManual();
}

async function registerManual(){
  const c=calculateManual();
  if(!c.ready)return;

  const btn=document.getElementById('opsRegisterManual');
  btn.disabled=true;
  btn.textContent='Registering…';

  const transactionId=uid('TX-MANUAL');
  const requestId=uid('REQ-MANUAL');
  const mode=document.getElementById('opsMode').value||'MANUAL';
  const name=String(document.getElementById('opsName')?.value||c.target?.name||c.holding?.name||c.tk).trim();
  const date=document.getElementById('opsDate').value;
  const strategy=currentPlan()?.strategy==='maximum'?'maximum':'sustainable';

  try{
    if(c.funding==='BROKER_CASH'){
      const cash=await D().post('brokerCashSnapshot',{});
      const available=num(cash?.balances?.[c.account]);
      if(c.totalGbp>available+0.005){
        throw new Error(`${accountLabel(c.account)} dividend cash has ${money(available)} available, but this execution requires ${money(c.totalGbp)}.`);
      }
    }

    const result=await D().post('registerManualPurchase',{
      sourceMode:mode==='DIVIDEND_REINVESTMENT'?'DIVIDEND_REINVESTMENT':'MANUAL_PURCHASE',
      transaction:{
        transactionId,
        clientRequestId:requestId,
        tradeDate:date,
        account:c.account,
        ticker:c.tk,
        name,
        side:'BUY',
        shares:c.shares,
        priceInput:c.price,
        priceUnit:c.currency==='GBP'&&c.unit==='PENCE'?'PENCE':'GBP',
        currency:c.currency,
        fxRateToGbp:c.fx,
        feesNative:c.fees,
        totalCostGbp:c.totalGbp,
        strategy,
        recommendation:mode==='DIVIDEND_REINVESTMENT'?'DIVIDEND REINVESTMENT':'MANUAL PURCHASE',
        confidence:num(c.target?.confidence),
        expectedAnnualIncomeGbp:c.expectedAnnual
      },
      priorHolding:priorHoldingSnapshot(c.holding)
    });

    const confirmedTx=result?.transaction||{};
    const receipt=result?.receipt||{};
    const actual=num(confirmedTx.totalCostGbp)||num(receipt.totalCostGbp)||c.totalGbp;
    const confirmedAt=receipt.confirmedAt||confirmedTx.confirmedAt||now();
    const finalTx=confirmedTx.transactionId||receipt.transactionId||transactionId;

    let cashWarning='';
    if(c.funding==='BROKER_CASH'){
      try{
        await D().post('spendBrokerCash',{
          account:c.account,
          ticker:c.tk,
          amountGbp:actual,
          reference:`PURCHASE:${finalTx}`,
          note:`Dividend cash deployment • ${c.tk}`
        });
      }catch(err){
        cashWarning=` Purchase is confirmed, but broker cash needs reconciliation: ${err.message||err}`;
      }
    }

    A().core.update(s=>({
      ...s,
      registration:{
        ...s.registration,
        receipts:[{
          id:receipt.backendReceiptId||receipt.id||uid('RECEIPT'),
          backendReceiptId:receipt.backendReceiptId||receipt.id||'',
          transactionId:finalTx,
          routeId:confirmedTx.routeId||'MANUAL',
          missionId:confirmedTx.missionId||'MANUAL',
          allocationId:confirmedTx.allocationId||'MANUAL',
          account:c.account,
          ticker:c.tk,
          totalCostGbp:actual,
          confirmedAt,
          duplicate:!!result?.duplicate,
          source:mode==='DIVIDEND_REINVESTMENT'?'AURORADATA2_REINVESTMENT':'AURORADATA2_MANUAL'
        },...arr(s.registration?.receipts).filter(x=>x.transactionId!==finalTx)].slice(0,100),
        updatedAt:confirmedAt
      }
    }));

    markPlanRegistered(finalTx,{...c,totalGbp:actual});

    setTimeout(()=>w.AuroraHoldingsSync?.sync?.(),300);
    toast(`${c.tk} confirmed by AuroraData 2.${cashWarning}`);
    clearManual(false);
  }catch(err){
    const note=document.getElementById('opsManualNote');
    if(note){
      note.className='ops-note warn';
      note.textContent=String(err?.message||err);
    }
    toast('Manual registration failed.');
  }finally{
    btn.disabled=false;
    btn.textContent='Register & Confirm';
    calculateManual();
  }
}

function clearManual(clearPlanHint=true){
  ['opsTicker','opsName','opsShares','opsPrice','opsActualGbp'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  document.getElementById('opsCurrency').value='GBP';
  document.getElementById('opsPriceUnit').value='GBP';
  document.getElementById('opsFx').value='1';
  document.getElementById('opsFees').value='0';
  document.getElementById('opsFunding').value='EXTERNAL';
  if(clearPlanHint){
    const hint=document.getElementById('opsPlanHint');
    if(hint)hint.textContent='Manual purchases do not need a Finance/Transfer mission. Dividend Reinvestment can use a plan from Income Centre.';
  }
  calculateManual();
}

function buildUi(){
  if(document.getElementById('registrationOperationsUpgrade'))return;

  const heroActions=document.querySelector('.registration-hero-actions');
  if(heroActions){
    const complete=document.createElement('button');
    complete.type='button';
    complete.id='completeRegistrationBatch';
    complete.className='registration-btn secondary';
    complete.textContent='Complete Registration';
    complete.disabled=true;
    heroActions.appendChild(complete);
    complete.addEventListener('click',()=>{
      if(!currentRouteComplete(A().core.read()))return;
      if(confirm('Archive this fully confirmed registration batch and reset the active desk?')){
        archiveCurrentRegistration();
      }
    });
  }

  const jumpbar=document.querySelector('.registration-jumpbar');
  if(jumpbar&&!jumpbar.querySelector('[data-reg-jump="registrationOperationsUpgrade"]')){
    const jump=document.createElement('button');
    jump.type='button';
    jump.dataset.regJump='registrationOperationsUpgrade';
    jump.textContent='Manual & Reinvestment';
    jump.addEventListener('click',()=>document.getElementById('registrationOperationsUpgrade')?.scrollIntoView({behavior:'smooth',block:'start'}));
    jumpbar.appendChild(jump);
  }

  const queue=document.getElementById('queueSection');
  if(!queue)return;

  const section=document.createElement('section');
  section.id='registrationOperationsUpgrade';
  section.className='ops-panel';
  section.innerHTML=`
    <div class="ops-head">
      <div>
        <small>Flexible Registration</small>
        <h3>Manual Purchase & Dividend Reinvestment</h3>
        <p>Record broker reality that did not originate from the current Transfer route. The same canonical AuroraData 2 purchase writer still confirms Transactions and Holdings.</p>
      </div>
      <span class="ops-chip">Canonical write</span>
    </div>

    <div class="mode-switch">
      <button type="button" class="ops-btn is-active" data-ops-mode="MANUAL">Manual Purchase</button>
      <button type="button" class="ops-btn" data-ops-mode="DIVIDEND_REINVESTMENT">Dividend Reinvestment</button>
    </div>

    <input type="hidden" id="opsMode" value="MANUAL">

    <div id="opsReinvestmentPlan"></div>
    <div id="opsPlanHint" class="ops-note">Manual purchases do not need a Finance/Transfer mission. Dividend Reinvestment can use a plan from Income Centre.</div>

    <div class="ops-grid" style="margin-top:14px">
      <div class="ops-field"><label>Broker / account</label><select id="opsAccount"><option value="T212">Trading 212 ISA</option><option value="IG">IG ISA</option></select></div>
      <div class="ops-field"><label>Trade date</label><input id="opsDate" type="date"></div>
      <div class="ops-field"><label>Ticker</label><input id="opsTicker" placeholder="e.g. BATS"></div>
      <div class="ops-field"><label>Name</label><input id="opsName" placeholder="Optional company name"></div>

      <div class="ops-field"><label>Shares bought</label><input id="opsShares" type="number" min="0" step="0.000001"></div>
      <div class="ops-field"><label>Execution price</label><input id="opsPrice" type="number" min="0" step="0.000001"></div>
      <div class="ops-field"><label>Price unit</label><select id="opsPriceUnit"><option value="GBP">Major currency / share</option><option value="PENCE">Pence / share</option></select></div>
      <div class="ops-field"><label>Currency</label><input id="opsCurrency" value="GBP"></div>

      <div class="ops-field"><label>Actual GBP charged</label><input id="opsActualGbp" type="number" min="0" step="0.01" placeholder="Recommended for non-GBP"></div>
      <div class="ops-field"><label>FX to GBP</label><input id="opsFx" type="number" min="0" step="0.000001" value="1"></div>
      <div class="ops-field"><label>Fees</label><input id="opsFees" type="number" min="0" step="0.01" value="0"></div>
      <div class="ops-field"><label>Funding source</label>
        <select id="opsFunding">
          <option value="EXTERNAL">Manual / external broker cash</option>
          <option value="BROKER_CASH">Broker dividend cash pot</option>
          <option value="AUTO_REINVESTED">Broker auto-reinvested dividend</option>
        </select>
      </div>
    </div>

    <div class="manual-preview">
      <div><small>Actual GBP</small><strong id="opsPreviewActual">£0.00</strong></div>
      <div><small>Planned</small><strong id="opsPreviewPlan">—</strong></div>
      <div><small>Difference</small><strong id="opsPreviewDiff">—</strong></div>
      <div><small>New shares</small><strong id="opsPreviewShares">0</strong></div>
      <div><small>New avg cost</small><strong id="opsPreviewAvg">£0.00</strong></div>
    </div>

    <div id="opsManualNote" class="ops-note">Enter the broker execution.</div>
    <div class="ops-actions">
      <button type="button" class="ops-btn primary" id="opsRegisterManual">Register & Confirm</button>
      <button type="button" class="ops-btn" id="opsClearManual">Clear</button>
      <a class="ops-btn" href="income.html" style="display:inline-grid;place-items:center;text-decoration:none">Open Income Cash Pots</a>
    </div>

    <div class="ops-head" style="margin-top:24px;margin-bottom:8px">
      <div><small>Completed Operations</small><h3>Registration History</h3><p>Completed active-route batches are archived locally here. Canonical Transactions and Holdings remain in AuroraData 2.</p></div>
      <span class="ops-chip good">Archive</span>
    </div>
    <div id="opsCompletedHistory" class="ops-history"></div>
  `;

  queue.parentNode.insertBefore(section,queue);

  const date=document.getElementById('opsDate');
  if(date&&!date.value){
    const d=new Date();
    date.value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  section.querySelectorAll('[data-ops-mode]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      section.querySelectorAll('[data-ops-mode]').forEach(x=>x.classList.remove('is-active'));
      btn.classList.add('is-active');
      document.getElementById('opsMode').value=btn.dataset.opsMode;
      document.getElementById('opsFunding').value=btn.dataset.opsMode==='DIVIDEND_REINVESTMENT'?'BROKER_CASH':'EXTERNAL';
      calculateManual();
    });
  });

  ['opsAccount','opsDate','opsTicker','opsName','opsShares','opsPrice','opsPriceUnit','opsCurrency','opsActualGbp','opsFx','opsFees','opsFunding']
    .forEach(id=>document.getElementById(id)?.addEventListener('input',calculateManual));

  document.getElementById('opsRegisterManual')?.addEventListener('click',registerManual);
  document.getElementById('opsClearManual')?.addEventListener('click',()=>clearManual(true));

  section.addEventListener('click',e=>{
    const btn=e.target.closest('[data-load-plan]');
    if(!btn)return;
    const plan=currentPlan(),alloc=arr(plan?.allocations)[Number(btn.dataset.loadPlan)];
    fillFromPlan(alloc);
  });

  renderPlan();
  renderArchives();
  applyReinvestHandoff();
  updateCompleteButton();
}

function start(){
  if(!A()?.core?.read||!D()?.post){
    setTimeout(start,300);
    return;
  }
  buildUi();
  updateCompleteButton();
  loadArchivesBackend();
  w.addEventListener('aurora2:state',()=>{
    updateCompleteButton();
    renderPlan();
  });
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',start,{once:true});
}else{
  start();
}

})(window);
