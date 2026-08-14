(function(w){
'use strict';

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

let lastSnapshot=null;
let enginePromise=null;

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
function toast(msg){
  const el=document.getElementById('toast');
  if(!el)return;
  el.textContent=msg;
  el.style.opacity='1';
  clearTimeout(w.__a2CashToast);
  w.__a2CashToast=setTimeout(()=>el.style.opacity='0',2600);
}
function readJson(key,fallback){
  try{
    const x=JSON.parse(localStorage.getItem(key)||'null');
    return x??fallback;
  }catch(_){return fallback}
}
function writeJson(key,value){localStorage.setItem(key,JSON.stringify(value))}
function currentPlan(){return readJson(PLAN_KEY,null)}

async function ensureTransferEngine(){
  if(A()?.transferEngine?.simulate)return A().transferEngine;
  if(enginePromise)return enginePromise;

  enginePromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-income-transfer-engine]');
    if(existing){
      existing.addEventListener('load',()=>resolve(A()?.transferEngine),{once:true});
      existing.addEventListener('error',()=>reject(new Error('Transfer engine failed to load.')),{once:true});
      return;
    }
    const s=document.createElement('script');
    s.src='transfer-engine.js?v=020';
    s.dataset.incomeTransferEngine='1';
    s.onload=()=>A()?.transferEngine?.simulate
      ?resolve(A().transferEngine)
      :reject(new Error('Transfer engine is unavailable.'));
    s.onerror=()=>reject(new Error('Transfer engine failed to load.'));
    document.head.appendChild(s);
  });
  return enginePromise;
}

function setBalance(account,value){
  const id=accountCode(account)==='IG'?'cashBalanceIG':'cashBalanceT212';
  const el=document.getElementById(id);
  if(el)el.textContent=money(value);
}
function balanceFor(account){
  return num(lastSnapshot?.balances?.[accountCode(account)]);
}

function renderLedger(snapshot){
  const host=document.getElementById('cashLedger');
  if(!host)return;
  const rows=arr(snapshot?.ledger);
  if(!rows.length){
    host.innerHTML='<div class="ops-note">No broker dividend cash activity recorded yet.</div>';
    return;
  }
  host.innerHTML=rows.slice(0,20).map(r=>{
    const change=num(r.cashChangeGbp);
    const changeText=change===0?'No cash movement':`${change>0?'+':''}${money(change)}`;
    return `
      <div class="cash-ledger-row">
        <div>
          <strong>${ticker(r.ticker)||accountLabel(r.account)} • ${String(r.type||'').replaceAll('_',' ')}</strong>
          <span>${new Date(r.recordedAt).toLocaleString('en-GB')} • ${r.reference||'no reference'}${r.note?' • '+r.note:''}</span>
        </div>
        <b>${changeText}<br><span>${money(r.balanceAfterGbp)} balance</span></b>
      </div>
    `;
  }).join('');
}

function renderPlan(){
  const host=document.getElementById('cashPlan');
  if(!host)return;
  const p=currentPlan();
  if(!p||!arr(p.allocations).length){
    host.innerHTML='<div class="ops-note">No dividend cash deployment plan yet.</div>';
    return;
  }

  const registered=arr(p.allocations).filter(a=>a.status==='REGISTERED').length;
  host.innerHTML=`
    <div class="ops-note good">
      ${accountLabel(p.account)} • ${String(p.strategy||'').toUpperCase()} • ${money(p.budget)} •
      ${registered}/${p.allocations.length} registered
    </div>
    <div class="plan-list">
      ${p.allocations.map(a=>`
        <div class="plan-row">
          <div><strong>${ticker(a.ticker)} — ${a.name||a.ticker}</strong><span>${money(a.amount)} • ${num(a.yieldPct).toFixed(2)}% yield • projected ${money(a.expectedAnnualIncome)}/yr</span></div>
          <b>${String(a.status||'READY')}</b>
        </div>
      `).join('')}
    </div>
    <div class="ops-actions">
      <a class="ops-btn primary" href="registration.html" style="display:inline-grid;place-items:center;text-decoration:none">Open Registration</a>
      <button type="button" class="ops-btn" id="clearCashPlan">Clear Plan</button>
    </div>
  `;
  document.getElementById('clearCashPlan')?.addEventListener('click',()=>{
    localStorage.removeItem(PLAN_KEY);
    renderPlan();
    toast('Dividend cash plan cleared. Broker cash balance was not changed.');
  });
}

async function refreshCash(){
  if(!D()?.post)return;
  const status=document.getElementById('cashBackendStatus');
  if(status)status.textContent='SYNCING';

  try{
    const res=await D().post('brokerCashSnapshot',{});
    lastSnapshot=res;
    setBalance('IG',res?.balances?.IG||0);
    setBalance('T212',res?.balances?.T212||0);
    renderLedger(res);
    if(status){
      status.textContent='CONNECTED';
      status.className='ops-chip good';
    }
    return res;
  }catch(err){
    if(status){
      status.textContent='CHECK';
      status.className='ops-chip warn';
    }
    const note=document.getElementById('cashRecordNote');
    if(note){
      note.className='ops-note warn';
      note.textContent=`Broker cash engine not ready: ${err.message||err}`;
    }
    return null;
  }
}

async function recordDividend(){
  const account=accountCode(document.getElementById('cashRecordAccount')?.value);
  const tk=ticker(document.getElementById('cashRecordTicker')?.value);
  const amount=Math.max(0,num(document.getElementById('cashRecordAmount')?.value));
  const mode=String(document.getElementById('cashRecordMode')?.value||'CASH').toUpperCase();
  const reference=String(document.getElementById('cashRecordReference')?.value||'').trim() ||
    `DIV:${account}:${tk}:${new Date().toISOString().slice(0,10)}:${amount.toFixed(2)}`;
  const note=String(document.getElementById('cashRecordNoteText')?.value||'').trim();

  if(!['IG','T212'].includes(account)||!tk||!(amount>0)){
    toast('Enter broker, ticker and dividend amount.');
    return;
  }

  const btn=document.getElementById('recordDividendCash');
  btn.disabled=true;
  btn.textContent='Recording…';

  try{
    const res=await D().post('recordDividendSettlement',{
      account,ticker:tk,amountGbp:amount,mode,reference,note
    });
    lastSnapshot=res.snapshot||await refreshCash();
    if(res.snapshot){
      setBalance('IG',res.snapshot?.balances?.IG||0);
      setBalance('T212',res.snapshot?.balances?.T212||0);
      renderLedger(res.snapshot);
    }

    const noteEl=document.getElementById('cashRecordNote');
    if(noteEl){
      noteEl.className='ops-note good';
      noteEl.textContent=mode==='CASH'
        ?`${tk} dividend ${money(amount)} added to the ${accountLabel(account)} cash pot.`
        :`${tk} dividend ${money(amount)} recorded as broker auto-reinvested. No cash was added to the pot.`;
    }

    if(mode==='REINVESTED'){
      writeJson(HANDOFF_KEY,{
        account,ticker:tk,amountGbp:amount,reference,
        createdAtMs:Date.now()
      });
      const open=document.getElementById('openReinvestmentRegistration');
      if(open)open.classList.remove('ops-hidden');
    }

    toast(res.duplicate?'Dividend settlement already recorded.':'Dividend settlement recorded.');
  }catch(err){
    const noteEl=document.getElementById('cashRecordNote');
    if(noteEl){
      noteEl.className='ops-note warn';
      noteEl.textContent=String(err?.message||err);
    }
    toast('Dividend cash record failed.');
  }finally{
    btn.disabled=false;
    btn.textContent='Record Dividend';
  }
}

async function adjustCash(){
  const account=accountCode(document.getElementById('cashAdjustAccount')?.value);
  const change=num(document.getElementById('cashAdjustChange')?.value);
  const note=String(document.getElementById('cashAdjustNote')?.value||'Opening / reconciliation adjustment').trim();

  if(!['IG','T212'].includes(account)||Math.abs(change)<0.005){
    toast('Enter a non-zero broker cash adjustment.');
    return;
  }

  const btn=document.getElementById('adjustBrokerCash');
  btn.disabled=true;
  btn.textContent='Adjusting…';
  try{
    const res=await D().post('adjustBrokerCash',{
      account,
      changeGbp:change,
      reference:`ADJ:${account}:${Date.now()}`,
      note
    });
    lastSnapshot=res.snapshot||await refreshCash();
    if(res.snapshot){
      setBalance('IG',res.snapshot?.balances?.IG||0);
      setBalance('T212',res.snapshot?.balances?.T212||0);
      renderLedger(res.snapshot);
    }
    document.getElementById('cashAdjustChange').value='';
    toast('Broker cash adjustment recorded.');
  }catch(err){
    toast(String(err?.message||err));
  }finally{
    btn.disabled=false;
    btn.textContent='Apply Adjustment';
  }
}

async function buildDeployment(account,strategy){
  const ac=accountCode(account);
  const balance=balanceFor(ac);
  if(!(balance>0)){
    toast(`${accountLabel(ac)} dividend cash pot is empty.`);
    return;
  }

  let engine;
  try{
    engine=await ensureTransferEngine();
  }catch(err){
    toast(String(err?.message||err));
    return;
  }

  const state=A().core.read();
  const baseMin=Math.max(1,num(state.transfer?.settings?.minAllocation)||250);
  const baseInc=Math.max(1,num(state.transfer?.settings?.increment)||25);

  // Small dividend pots need finer sizing than normal payday missions.
  const minAllocation=Math.min(baseMin,Math.max(1,balance));
  const increment=balance<100?1:Math.min(baseInc,5);

  const sim=engine.simulate(state,{
    budget:balance,
    strategy:strategy==='maximum'?'maximum':'sustainable',
    brokerScope:ac,
    minAllocation,
    increment,
    maxTargets:4
  });

  if(!arr(sim.allocations).length){
    toast('Transfer could not build an eligible dividend-cash route.');
    return;
  }

  const plan={
    id:`DIVCASH-${Date.now()}`,
    account:ac,
    strategy:strategy==='maximum'?'maximum':'sustainable',
    budget:balance,
    allocated:num(sim.allocated),
    remaining:num(sim.remaining),
    expectedAnnualIncome:num(sim.income),
    createdAt:new Date().toISOString(),
    status:'READY_FOR_REGISTRATION',
    allocations:arr(sim.allocations).map(a=>({
      id:a.id||`${ticker(a.ticker)}-${Date.now()}`,
      ticker:ticker(a.ticker),
      name:a.name||a.ticker,
      account:ac,
      amount:num(a.amount),
      yieldPct:num(a.yieldPct),
      expectedAnnualIncome:num(a.expectedAnnualIncome),
      scoutingStatus:a.scoutingStatus||'caution',
      status:'READY'
    }))
  };

  writeJson(PLAN_KEY,plan);
  renderPlan();

  const note=document.getElementById('cashDeploymentNote');
  if(note){
    note.className='ops-note good';
    note.textContent=`${accountLabel(ac)} ${plan.strategy} plan built: ${plan.allocations.length} allocation${plan.allocations.length===1?'':'s'}, ${money(plan.allocated)} planned, ${money(plan.remaining)} holdback, projected ${money(plan.expectedAnnualIncome)}/yr. Cash is not deducted until real broker purchases are confirmed in Registration.`;
  }

  toast('Dividend cash deployment plan sent to Registration.');
}

function prefillTickerFromCalendar(){
  const holding=document.getElementById('eventHolding');
  if(!holding)return;
  const [account,tk]=String(holding.value||'').split('|');
  if(['IG','T212'].includes(accountCode(account))){
    document.getElementById('cashRecordAccount').value=accountCode(account);
  }
  if(tk)document.getElementById('cashRecordTicker').value=ticker(tk);
  const actual=num(document.getElementById('eventActual')?.value);
  if(actual>0)document.getElementById('cashRecordAmount').value=actual.toFixed(2);
}

function buildUi(){
  if(document.getElementById('brokerDividendCashSection'))return;
  const jumpbar=document.querySelector('.income-jumpbar');
  if(jumpbar&&!jumpbar.querySelector('[data-income-jump="brokerDividendCashSection"]')){
    const jump=document.createElement('button');
    jump.type='button';
    jump.dataset.incomeJump='brokerDividendCashSection';
    jump.textContent='Broker Cash';
    jump.addEventListener('click',()=>document.getElementById('brokerDividendCashSection')?.scrollIntoView({behavior:'smooth',block:'start'}));
    jumpbar.appendChild(jump);
  }

  const anchor=document.getElementById('incomeRunwaySection');
  if(!anchor)return;

  const section=document.createElement('section');
  section.id='brokerDividendCashSection';
  section.className='ops-panel';
  section.innerHTML=`
    <div class="ops-head">
      <div>
        <small>Dividend Treasury</small>
        <h3>Broker Dividend Cash</h3>
        <p>Keep dividend cash inside the broker it arrived in. Cash dividends build the broker pot; auto-reinvested dividends are recorded without double-counting cash.</p>
      </div>
      <span id="cashBackendStatus" class="ops-chip">CHECKING</span>
    </div>

    <div class="cash-pot-grid">
      <article class="cash-pot">
        <small>Trading 212 Dividend Cash</small>
        <strong id="cashBalanceT212">£0.00</strong>
        <span>Broker-locked • deploy only to Trading 212 eligible targets</span>
        <div class="cash-pot-actions">
          <button class="ops-btn green" data-deploy-account="T212" data-deploy-strategy="sustainable">Sustainable</button>
          <button class="ops-btn gold" data-deploy-account="T212" data-deploy-strategy="maximum">Maximum Income</button>
        </div>
      </article>

      <article class="cash-pot">
        <small>IG ISA Dividend Cash</small>
        <strong id="cashBalanceIG">£0.00</strong>
        <span>Broker-locked • deploy only to IG eligible targets</span>
        <div class="cash-pot-actions">
          <button class="ops-btn green" data-deploy-account="IG" data-deploy-strategy="sustainable">Sustainable</button>
          <button class="ops-btn gold" data-deploy-account="IG" data-deploy-strategy="maximum">Maximum Income</button>
        </div>
      </article>
    </div>

    <div id="cashDeploymentNote" class="ops-note">Build a plan only after cash is genuinely available at the broker. Aurora does not deduct the pot until the actual broker purchase is confirmed in Registration.</div>

    <div class="ops-head" style="margin-top:24px;margin-bottom:10px">
      <div><small>Dividend Settlement</small><h3>Record Received Dividend</h3><p>Use CASH when money is sitting at the broker. Use AUTO-REINVESTED when the broker immediately bought shares with the dividend.</p></div>
      <button class="ops-btn" id="prefillCashFromCalendar">Use Calendar Selection</button>
    </div>

    <div class="ops-grid">
      <div class="ops-field"><label>Broker / account</label><select id="cashRecordAccount"><option value="T212">Trading 212 ISA</option><option value="IG">IG ISA</option></select></div>
      <div class="ops-field"><label>Ticker</label><input id="cashRecordTicker" placeholder="e.g. FSFL"></div>
      <div class="ops-field"><label>Dividend amount £</label><input id="cashRecordAmount" type="number" min="0" step="0.01"></div>
      <div class="ops-field"><label>Settlement</label><select id="cashRecordMode"><option value="CASH">Cash into broker pot</option><option value="REINVESTED">Broker auto-reinvested</option></select></div>
      <div class="ops-field wide"><label>Reference</label><input id="cashRecordReference" placeholder="Optional broker/payment reference"></div>
      <div class="ops-field wide"><label>Note</label><input id="cashRecordNoteText" placeholder="Optional note"></div>
    </div>

    <div id="cashRecordNote" class="ops-note">A cash settlement increases the matching broker pot. Auto-reinvested records the dividend but leaves the pot unchanged.</div>
    <div class="ops-actions">
      <button class="ops-btn primary" id="recordDividendCash">Record Dividend</button>
      <a class="ops-btn ops-hidden" id="openReinvestmentRegistration" href="registration.html" style="display:inline-grid;place-items:center;text-decoration:none">Register Reinvested Shares</a>
      <button class="ops-btn" id="refreshBrokerCash">Refresh Pots</button>
    </div>

    <div class="ops-head" style="margin-top:20px;margin-bottom:10px">
      <div><small>Reconciliation</small><h3>Opening / Broker Cash Adjustment</h3><p>Use this only to bring Aurora in line with real broker cash already present when the pots are first introduced, or to correct a known cash discrepancy.</p></div>
      <span class="ops-chip warn">Manual adjustment</span>
    </div>
    <div class="ops-grid three">
      <div class="ops-field"><label>Broker / account</label><select id="cashAdjustAccount"><option value="T212">Trading 212 ISA</option><option value="IG">IG ISA</option></select></div>
      <div class="ops-field"><label>Change £</label><input id="cashAdjustChange" type="number" step="0.01" placeholder="+25.00 or -5.00"></div>
      <div class="ops-field"><label>Reason</label><input id="cashAdjustNote" placeholder="Opening balance / reconciliation"></div>
    </div>
    <div class="ops-actions"><button class="ops-btn" id="adjustBrokerCash">Apply Adjustment</button></div>

    <div class="ops-head" style="margin-top:24px;margin-bottom:8px">
      <div><small>Deployment Plan</small><h3>Dividend Cash Route</h3><p>Transfer sizes a broker-restricted reinvestment plan. Registration records the real fills and deducts the cash only after confirmation.</p></div>
      <span class="ops-chip good">Transfer-owned sizing</span>
    </div>
    <div id="cashPlan"></div>

    <div class="ops-head" style="margin-top:24px;margin-bottom:8px">
      <div><small>Cash Ledger</small><h3>Recent Broker Cash Activity</h3></div>
      <span class="ops-chip">AuroraData 2</span>
    </div>
    <div id="cashLedger" class="cash-ledger"></div>
  `;

  anchor.parentNode.insertBefore(section,anchor.nextSibling);

  section.querySelectorAll('[data-deploy-account]').forEach(btn=>{
    btn.addEventListener('click',()=>buildDeployment(
      btn.dataset.deployAccount,
      btn.dataset.deployStrategy
    ));
  });
  document.getElementById('recordDividendCash')?.addEventListener('click',recordDividend);
  document.getElementById('refreshBrokerCash')?.addEventListener('click',refreshCash);
  document.getElementById('adjustBrokerCash')?.addEventListener('click',adjustCash);
  document.getElementById('prefillCashFromCalendar')?.addEventListener('click',prefillTickerFromCalendar);

  renderPlan();

  const saveDividend=document.getElementById('saveEvent');
  if(saveDividend&&!saveDividend.dataset.cashBridge){
    saveDividend.dataset.cashBridge='1';
    saveDividend.addEventListener('click',()=>{
      setTimeout(()=>{
        const status=String(document.getElementById('eventStatus')?.value||'').toUpperCase();
        const actual=num(document.getElementById('eventActual')?.value);
        if(status!=='PAID'||!(actual>0))return;
        prefillTickerFromCalendar();
        document.getElementById('cashRecordAmount').value=actual.toFixed(2);
        const note=document.getElementById('cashRecordNote');
        if(note){
          note.className='ops-note good';
          note.textContent='Paid dividend detected. Choose whether the broker left it as cash or auto-reinvested it, then record the settlement.';
        }
        section.scrollIntoView({behavior:'smooth',block:'start'});
      },700);
    });
  }
}

function start(){
  if(!A()?.core?.read||!D()?.post){
    setTimeout(start,300);
    return;
  }
  buildUi();
  refreshCash();
  renderPlan();

  window.addEventListener('storage',e=>{
    if(e.key===PLAN_KEY)renderPlan();
  });

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      refreshCash();
      renderPlan();
    }
  });
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',start,{once:true});
}else{
  start();
}

})(window);
