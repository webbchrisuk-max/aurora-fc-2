/* Aurora City FC — Transfer Window Command layout v1.0
 * Keeps the operational decision together:
 * Transfer Window Command -> Transfer Strategy -> Recommended Income Effect.
 */
(function(w){
  'use strict';
  if(w.__AURORA_TRANSFER_WINDOW_LAYOUT_V1__)return;
  w.__AURORA_TRANSFER_WINDOW_LAYOUT_V1__=true;

  const A=()=>w.Aurora2;
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)||0);
  const strategy=v=>String(v||'').toLowerCase()==='maximum'?'maximum':'sustainable';
  const strategyLabel=v=>strategy(v)==='maximum'?'Maximum Income':'Sustainable Income';
  let lastStrategy=null;
  let autoBuildQueued=false;

  function isTransfer(){
    return (String(location.pathname||'').split('/').pop()||'').toLowerCase()==='transfer.html';
  }

  function routeSummary(route){
    const allocations=arr(route?.allocations).filter(row=>num(row?.amount)>0);
    return {
      allocations,
      allocated:allocations.reduce((sum,row)=>sum+num(row.amount),0),
      uplift:allocations.reduce((sum,row)=>sum+num(row.expectedAnnualIncome),0)
    };
  }

  function currentAnnualIncome(state){
    if(w.AuroraFinancialTruth?.getCurrentAnnualIncome){
      return Math.max(0,num(w.AuroraFinancialTruth.getCurrentAnnualIncome(state)));
    }
    return arr(state?.squad?.holdings).reduce((sum,h)=>{
      const status=String(h?.status||'').toUpperCase();
      if(!['ACTIVE','LOCKED'].includes(status)||num(h?.shares)<=0)return sum;
      const dps=num(h?.annualDpsGbp??h?.annual_dps);
      return sum+(dps>0?num(h.shares)*dps:Math.max(0,num(h?.annualIncomeGbp)));
    },0);
  }

  function installStyles(){
    if(document.getElementById('aurora-transfer-window-layout-styles'))return;
    const style=document.createElement('style');
    style.id='aurora-transfer-window-layout-styles';
    style.textContent=`
      .transfer-window-command-stack{display:grid;gap:12px;margin-top:12px;min-width:0}
      .transfer-window-command-stack>.transfer3-command,.transfer-window-command-stack>.strategy-panel,.transfer-window-command-stack>.transfer-recommendation-effect{margin-top:0;min-width:0}
      .transfer-window-command-stack .strategy-panel{width:100%}
      .transfer-command-grid.transfer-grid-single{grid-template-columns:minmax(0,1fr)!important}
      .transfer-recommendation-effect{border-color:rgba(89,255,154,.16)!important;background:radial-gradient(circle at 100% 0,rgba(89,255,154,.07),transparent 36%),linear-gradient(145deg,rgba(10,22,17,.72),rgba(4,8,16,.98))!important}
      .transfer-recommendation-effect .recommendation-effect-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:13px}
      .transfer-recommendation-effect .recommendation-effect-grid>div{min-width:0;padding:11px;border:1px solid rgba(255,255,255,.055);border-radius:11px;background:rgba(255,255,255,.015)}
      .transfer-recommendation-effect small{display:block;color:#7b8d82;font-size:6px;font-weight:1000;letter-spacing:.09em;text-transform:uppercase}
      .transfer-recommendation-effect strong{display:block;margin-top:5px;color:#ecfff2;font-size:clamp(12px,1.5vw,18px);line-height:1.15;overflow-wrap:anywhere}
      .transfer-recommendation-effect span{display:block;margin-top:4px;color:#779081;font-size:7px;line-height:1.4}
      .transfer-recommendation-effect .effect-uplift strong{color:#aaffc5}
      .transfer-recommendation-effect .effect-status{margin-top:10px;padding:9px 10px;border:1px solid rgba(89,255,154,.11);border-radius:10px;background:rgba(89,255,154,.025);color:#8eab98;font-size:8px;line-height:1.45}
      .transfer-recommendation-effect .effect-status.waiting{border-color:rgba(245,200,91,.14);background:rgba(245,200,91,.025);color:#c9ad74}
      @media(max-width:900px){.transfer-recommendation-effect .recommendation-effect-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:560px){.transfer-recommendation-effect .recommendation-effect-grid{grid-template-columns:minmax(0,1fr)}}
    `;
    document.head.appendChild(style);
  }

  function ensureEffectCard(){
    let card=document.getElementById('transferRecommendationEffect');
    if(card)return card;
    card=document.createElement('article');
    card.id='transferRecommendationEffect';
    card.className='transfer-panel transfer-recommendation-effect';
    card.innerHTML=`
      <div class="transfer-panel-head">
        <div>
          <span class="transfer-panel-kicker">RECOMMENDED INCOME EFFECT</span>
          <h3>What this strategy does to your income</h3>
          <p class="transfer3-head-copy" id="transferEffectCopy">Aurora will show the selected strategy's recommended dividend-income effect here.</p>
        </div>
        <span class="route-status-chip" id="transferEffectStatus">CHECKING</span>
      </div>
      <div class="recommendation-effect-grid">
        <div><small>Selected Strategy</small><strong id="effectStrategy">—</strong><span>Controls Transfer ranking and allocation</span></div>
        <div class="effect-uplift"><small>Recommended Annual Uplift</small><strong id="effectAnnualUplift">+£0.00</strong><span id="effectAllocationMeta">No route built</span></div>
        <div><small>Annual Income</small><strong id="effectAnnualJourney">£0.00 → £0.00</strong><span>Current → recommended</span></div>
        <div><small>Monthly Equivalent</small><strong id="effectMonthlyJourney">£0.00 → £0.00</strong><span>Current → recommended</span></div>
      </div>
      <div class="effect-status waiting" id="transferEffectNote">Choose a strategy to build the recommendation.</div>`;
    return card;
  }

  function arrange(){
    if(!isTransfer())return;
    installStyles();
    const hero=document.querySelector('.transfer-command-hero');
    const command=document.getElementById('transferCommandFlow');
    const strategyPanel=document.querySelector('#allocationPanel .strategy-panel')||document.querySelector('.strategy-panel');
    if(!hero||!command||!strategyPanel)return;

    let stack=document.getElementById('transferWindowCommandStack');
    if(!stack){
      stack=document.createElement('section');
      stack.id='transferWindowCommandStack';
      stack.className='transfer-window-command-stack';
      hero.insertAdjacentElement('afterend',stack);
    }

    if(command.parentElement!==stack)stack.appendChild(command);
    if(strategyPanel.parentElement!==stack)stack.appendChild(strategyPanel);
    const effect=ensureEffectCard();
    if(effect.parentElement!==stack)stack.appendChild(effect);

    const allocationGrid=document.querySelector('#allocationPanel .transfer-command-grid.two');
    if(allocationGrid&&allocationGrid.children.length===1)allocationGrid.classList.add('transfer-grid-single');
  }

  function render(state=A()?.core?.read?.()){
    if(!isTransfer()||!state)return;
    arrange();
    const selected=strategy(state?.transfer?.settings?.strategy||state?.scouting?.strategy);
    const route=state?.transfer?.route;
    const summary=routeSummary(route);
    const current=currentAnnualIncome(state);
    const projected=current+summary.uplift;
    const budget=Math.max(0,num(state?.mission?.approvedBudget));
    const remaining=Math.max(0,budget-summary.allocated);
    const locked=!!route?.locked;

    const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
    set('effectStrategy',strategyLabel(selected));
    set('effectAnnualUplift',`+${money(summary.uplift)}`);
    set('effectAnnualJourney',`${money(current)} → ${money(projected)}`);
    set('effectMonthlyJourney',`${money(current/12)} → ${money(projected/12)}`);
    set('effectAllocationMeta',route?`${summary.allocations.length} buy${summary.allocations.length===1?'':'s'} • ${money(summary.allocated)} allocated`:'Recommendation not built yet');
    set('transferEffectStatus',route?(locked?'APPROVED':'LIVE RECOMMENDATION'):'AWAITING ROUTE');
    set('transferEffectCopy',`${strategyLabel(selected)} is selected. The figures below show the income effect of the current recommended Transfer route.`);

    const note=document.getElementById('transferEffectNote');
    if(note){
      const ready=String(state?.scouting?.status||'').toUpperCase()==='SCOUTING_READY';
      note.classList.toggle('waiting',!route);
      note.textContent=route
        ?`${strategyLabel(selected)} recommends ${money(summary.allocated)} across ${summary.allocations.length} purchase${summary.allocations.length===1?'':'s'}, adding ${money(summary.uplift)} a year and leaving ${money(remaining)} unallocated.`
        :budget<=0
          ?'Finance has not released a Transfer budget yet.'
          :!ready
            ?'Approve the Scouting shortlist first; then Aurora can calculate the income recommendation.'
            :'Choose Sustainable Income or Maximum Income above and Aurora will build the recommended route automatically.';
    }
  }

  function queueAutoBuild(state){
    if(autoBuildQueued||!isTransfer())return;
    const route=state?.transfer?.route;
    const locked=!!route?.locked||['LOCKED','PARTIALLY_REGISTERED','COMPLETE','COMPLETED'].includes(String(state?.mission?.status||'').toUpperCase());
    const ready=String(state?.scouting?.status||'').toUpperCase()==='SCOUTING_READY';
    const budget=Math.max(0,num(state?.mission?.approvedBudget));
    if(locked||!ready||!(budget>0))return;
    autoBuildQueued=true;
    setTimeout(()=>{
      autoBuildQueued=false;
      document.getElementById('autoBuildRoute')?.click();
    },100);
  }

  function onState(state){
    const selected=strategy(state?.transfer?.settings?.strategy||state?.scouting?.strategy);
    if(lastStrategy!==null&&selected!==lastStrategy)queueAutoBuild(state);
    lastStrategy=selected;
    render(state);
  }

  function init(){
    if(!isTransfer())return;
    arrange();
    const state=A()?.core?.read?.();
    if(state){lastStrategy=strategy(state?.transfer?.settings?.strategy||state?.scouting?.strategy);render(state)}
    w.addEventListener('aurora2:state',event=>onState(event.detail||A()?.core?.read?.()));
    setTimeout(()=>render(A()?.core?.read?.()),180);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})(window);
