(function(w){
  'use strict';

  const A=()=>w.Aurora2;
  const PAY_CYCLE_DAYS=28;
  const LEGACY_KEYS=['aurora_wealth_centre','aurora_wealth_centre_backup_v3'];
  let syncing=false;

  function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
  function arr(v){return Array.isArray(v)?v:[]}
  function num(v){
    const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?Math.max(0,n):0;
  }
  function norm(v){return String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
  function parse(raw){try{return JSON.parse(raw)}catch(_){return null}}
  function parseDate(v){
    if(!v)return null;
    const d=new Date(`${String(v).slice(0,10)}T12:00:00`);
    return Number.isNaN(d.getTime())?null:d;
  }
  function isoNow(){return new Date().toISOString()}
  function money(v){return A().ui.money(v)}
  function potFunded(p){
    const balance=num(p?.balance);
    return p?.goalMode==='funded-progress'?balance+num(p?.spent):balance;
  }
  function potGap(p){return Math.max(0,num(p?.target)-potFunded(p))}
  function excludedFromGoalFunding(p){
    const name=norm(p?.name);
    return !p || p.archived || potGap(p)<=.009 ||
      name==='holding pot' || name==='spending pot' || name==='ig trading';
  }

  function unwrapLegacy(v){
    if(!v||typeof v!=='object')return null;
    if(Array.isArray(v.editablePots)||v.paydayMission||v.holdingBalance!=null)return v;
    for(const k of ['plannerState','state','data','planner']){
      const n=v[k];
      if(n&&typeof n==='object'&&(Array.isArray(n.editablePots)||n.paydayMission||n.holdingBalance!=null))return n;
    }
    return null;
  }

  function readLegacy(){
    const candidates=[];
    for(const key of LEGACY_KEYS){
      try{
        const state=unwrapLegacy(parse(localStorage.getItem(key)||''));
        if(!state)continue;
        const saved=Date.parse(state?._persistence?.savedAt||state?.updatedAt||'')||Number(state?._persistence?.savedAt)||0;
        candidates.push({key,state,saved});
      }catch(_){}
    }
    candidates.sort((a,b)=>b.saved-a.saved);
    return candidates[0]||null;
  }

  function legacyPotMap(state){
    const map=new Map();
    arr(state?.editablePots).forEach(p=>{
      const keys=[norm(p?.name),norm(p?.id)].filter(Boolean);
      keys.forEach(k=>map.set(k,p));
    });
    return map;
  }

  function legacyGoalBudget(state){
    const mission=obj(state?.paydayMission), inputs=obj(mission.inputs);
    const direct=num(inputs.goalPots);
    if(direct>0)return direct;
    const alternatives=[
      state?.goalPotBudget,state?.goalPots,state?.paydayGoalPots,
      state?.paydayMission?.plan?.goalPots
    ];
    for(const v of alternatives){const n=num(v);if(n>0)return n;}
    return 250; // Aurora 1 payday mission default.
  }

  function legacyStrategy(state){
    const s=String(state?.paydayMission?.inputs?.strategy||'priority');
    return ['priority','balanced','critical'].includes(s)?s:'priority';
  }

  function importLegacyMetadata(state2){
    const legacy=readLegacy();
    if(!legacy)return {state:state2,changed:false,legacy:null};
    const lf=legacy.state, map=legacyPotMap(lf);
    const f=obj(state2.finance), policy={...obj(f.fundingPolicy)};
    let changed=false;

    const pots=arr(f.pots).map(p=>{
      const lp=map.get(norm(p.name))||map.get(norm(String(p.id||'').replace(/^A1-POT-/i,'')));
      if(!lp)return p;
      const deadline=String(p.deadline||lp.deadline||lp.completeBy||lp.targetDate||'').slice(0,10);
      const note=String(p.note||lp.note||'');
      if(deadline!==String(p.deadline||'')||note!==String(p.note||'')){
        changed=true;
        return {...p,deadline,note,updatedAt:isoNow()};
      }
      return p;
    });

    if(!policy.legacyImported){
      const budget=legacyGoalBudget(lf);
      const strategy=legacyStrategy(lf);
      policy.goalPotBudget=budget;
      policy.strategy=strategy;
      policy.source='AURORA1_MIGRATED';
      policy.legacyImported=true;
      changed=true;
    }

    if(!changed)return {state:state2,changed:false,legacy};
    return {state:{...state2,finance:{...f,pots,fundingPolicy:policy}},changed:true,legacy};
  }

  function deadlineInfo(p,payday){
    const gap=potGap(p), deadline=parseDate(p?.deadline), pd=parseDate(payday);
    if(!deadline||!pd||gap<=.009)return {hasDeadline:!!deadline,gap,required:0,paydays:0,deadline};
    const diff=deadline.getTime()-pd.getTime();
    const cycles=Math.floor(diff/(PAY_CYCLE_DAYS*86400000));
    const paydays=diff>=0?Math.max(1,cycles+1):0;
    const required=paydays>0?gap/paydays:gap;
    return {hasDeadline:true,gap,required,paydays,deadline};
  }

  function allocatePriority(candidates,remaining,allocations,strategy){
    if(remaining<=.009)return remaining;

    if(strategy==='balanced'){
      let active=candidates
        .map(x=>({...x,remainingGap:Math.max(0,x.gap-(allocations.get(x.pot.id)?.amount||0))}))
        .filter(x=>x.remainingGap>.009)
        .sort((a,b)=>a.priority-b.priority||b.remainingGap-a.remainingGap);
      while(remaining>.009&&active.length){
        const share=remaining/active.length, next=[];
        for(const row of active){
          const current=allocations.get(row.pot.id)?.amount||0;
          const need=Math.max(0,row.gap-current);
          const take=Math.min(remaining,share,need);
          if(take>.009)addAllocation(allocations,row.pot,take,`Balanced P${row.priority} funding`);
          if(need-take>.009)next.push(row);
          remaining-=take;
        }
        if(next.length===active.length&&share<.01)break;
        active=next;
      }
      return remaining;
    }

    const maxPriority=strategy==='critical'?1:3;
    for(const row of candidates
      .filter(x=>x.priority<=maxPriority)
      .sort((a,b)=>a.priority-b.priority||b.gap-a.gap||String(a.pot.name).localeCompare(String(b.pot.name)))){
      if(remaining<=.009)break;
      const current=allocations.get(row.pot.id)?.amount||0;
      const need=Math.max(0,row.gap-current);
      const take=Math.min(remaining,need);
      if(take>.009){
        addAllocation(allocations,row.pot,take,`P${row.priority} priority funding`);
        remaining-=take;
      }
    }
    return remaining;
  }

  function addAllocation(map,pot,amount,reason,required=0){
    const old=map.get(pot.id)||{amount:0,reasons:[],required:0};
    old.amount+=Math.max(0,amount);
    old.required=Math.max(old.required,required||0);
    if(reason&&!old.reasons.includes(reason))old.reasons.push(reason);
    map.set(pot.id,old);
  }

  function buildPlan(state){
    const f=obj(state.finance), plan=obj(f.plan), policy=obj(f.fundingPolicy);
    const budget=Math.max(0,num(policy.goalPotBudget));
    const strategy=['priority','balanced','critical'].includes(policy.strategy)?policy.strategy:'priority';
    const payday=plan.paydayDate||'';
    const pots=arr(f.pots);
    const candidates=pots
      .filter(p=>!excludedFromGoalFunding(p))
      .map(p=>({pot:p,gap:potGap(p),priority:[1,2,3].includes(Number(p.priority))?Number(p.priority):2,deadline:deadlineInfo(p,payday)}));
    const allocations=new Map();
    let remaining=budget;

    // 1) Explicit manual overrides, if the user has chosen one.
    for(const row of candidates.filter(x=>num(x.pot.fundingOverride)>0).sort((a,b)=>a.priority-b.priority||b.gap-a.gap)){
      if(remaining<=.009)break;
      const take=Math.min(remaining,row.gap,num(row.pot.fundingOverride));
      if(take>.009){
        addAllocation(allocations,row.pot,take,'Manual payday override');
        remaining-=take;
      }
    }

    // 2) Aurora 1 behaviour: dated pots protect their minimum payday amount first.
    const dated=candidates
      .filter(x=>x.deadline.hasDeadline&&x.deadline.gap>.009&&num(x.pot.fundingOverride)<=0)
      .sort((a,b)=>(a.deadline.deadline?.getTime()||Infinity)-(b.deadline.deadline?.getTime()||Infinity)||a.priority-b.priority||b.gap-a.gap);
    let deadlineRequired=0, deadlineAllocated=0;
    for(const row of dated){
      deadlineRequired+=row.deadline.required;
      if(remaining<=.009)continue;
      const current=allocations.get(row.pot.id)?.amount||0;
      const need=Math.max(0,Math.min(row.gap-current,row.deadline.required-current));
      const take=Math.min(remaining,need);
      if(take>.009){
        addAllocation(
          allocations,row.pot,take,
          `Deadline ${row.pot.deadline} • ${row.deadline.paydays>0?row.deadline.paydays+' payday'+(row.deadline.paydays===1?'':'s')+' left':'overdue'}`,
          row.deadline.required
        );
        deadlineAllocated+=take;
        remaining-=take;
      }
    }

    // 3) Remaining flexible budget follows priority P1 -> P2 -> P3.
    remaining=allocatePriority(candidates,remaining,allocations,strategy);

    const nextPots=pots.map(p=>{
      const a=allocations.get(p.id);
      const nextFunding=a?Math.min(potGap(p),a.amount):0;
      const reason=a?a.reasons.join(' • '):(potGap(p)<=.009?'Target funded':excludedFromGoalFunding(p)?'Excluded from goal-pot funding':'Waiting behind higher-priority pots');
      const required=a?.required||0;
      return {
        ...p,
        fundingPerPayday:Number(nextFunding.toFixed(2)),
        fundingReason:reason,
        fundingRequired:Number(required.toFixed(2))
      };
    });

    const allocated=budget-remaining;
    const shortfall=Math.max(0,deadlineRequired-deadlineAllocated);
    const rows=nextPots.filter(p=>num(p.fundingPerPayday)>0).map(p=>({
      id:p.id,name:p.name,amount:p.fundingPerPayday,reason:p.fundingReason,deadline:p.deadline||''
    }));

    return {
      pots:nextPots,
      policy:{
        ...policy,
        goalPotBudget:Number(budget.toFixed(2)),
        strategy,
        lastCalculatedAt:isoNow(),
        lastPlan:{
          paydayDate:payday,
          budget:Number(budget.toFixed(2)),
          allocated:Number(allocated.toFixed(2)),
          unallocated:Number(Math.max(0,remaining).toFixed(2)),
          deadlineRequired:Number(deadlineRequired.toFixed(2)),
          deadlineAllocated:Number(deadlineAllocated.toFixed(2)),
          deadlineShortfall:Number(shortfall.toFixed(2)),
          rows
        }
      }
    };
  }

  function materiallyChanged(a,b){
    if(arr(a).length!==arr(b).length)return true;
    for(let i=0;i<a.length;i++){
      if(a[i].id!==b[i].id)return true;
      for(const k of ['fundingPerPayday','fundingReason','fundingRequired','deadline','note']){
        if(String(a[i][k]??'')!==String(b[i][k]??''))return true;
      }
    }
    return false;
  }

  function recalc(){
    if(syncing||!A()?.core)return;
    syncing=true;
    try{
      let state=A().core.read();
      const imported=importLegacyMetadata(state);
      state=imported.state;
      const result=buildPlan(state);
      const oldPots=arr(state.finance?.pots);
      const oldPolicy=obj(state.finance?.fundingPolicy);
      const planChanged=JSON.stringify(oldPolicy.lastPlan||null)!==JSON.stringify(result.policy.lastPlan||null) ||
        num(oldPolicy.goalPotBudget)!==num(result.policy.goalPotBudget) ||
        oldPolicy.strategy!==result.policy.strategy ||
        oldPolicy.legacyImported!==result.policy.legacyImported ||
        oldPolicy.source!==result.policy.source;

      if(imported.changed||materiallyChanged(oldPots,result.pots)||planChanged){
        A().core.write({
          ...state,
          finance:{
            ...state.finance,
            pots:result.pots,
            fundingPolicy:result.policy
          }
        });
      }
    }finally{
      syncing=false;
    }
  }

  function savePolicyFromUI(){
    const budget=document.getElementById('goalPotBudget');
    const strategy=document.getElementById('fundingStrategy');
    if(!budget||!strategy)return;
    A().core.update(s=>({
      ...s,
      finance:{
        ...s.finance,
        fundingPolicy:{
          ...s.finance.fundingPolicy,
          goalPotBudget:num(budget.value),
          strategy:strategy.value,
          source:'AURORA2',
          legacyImported:true
        }
      }
    }));
    recalc();
  }

  function render(){
    if(!A()?.core)return;
    const s=A().core.read(), p=obj(s.finance?.fundingPolicy), plan=obj(p.lastPlan);
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
    set('fundingBudgetValue',money(plan.budget||p.goalPotBudget||0));
    set('fundingAllocatedValue',money(plan.allocated||0));
    set('fundingDeadlineValue',money(plan.deadlineAllocated||0));
    set('fundingUnallocatedValue',money(plan.unallocated||0));
    set('fundingEngineNote',
      (plan.deadlineShortfall||0)>.009
        ? `Deadline funding is short by ${money(plan.deadlineShortfall)} inside the current goal-pot budget.`
        : `Deadline needs are protected first; remaining money follows ${p.strategy==='balanced'?'balanced':p.strategy==='critical'?'P1-only':'P1 → P2 → P3'} priority.`
    );
    const budget=document.getElementById('goalPotBudget');
    const strategy=document.getElementById('fundingStrategy');
    if(budget&&document.activeElement!==budget)budget.value=Number(p.goalPotBudget||0).toFixed(2);
    if(strategy&&document.activeElement!==strategy)strategy.value=p.strategy||'priority';
  }

  document.addEventListener('DOMContentLoaded',()=>{
    recalc();
    render();
    document.getElementById('saveFundingPolicy')?.addEventListener('click',savePolicyFromUI);
    document.getElementById('paydayDate')?.addEventListener('change',()=>setTimeout(recalc,0));
  });
  w.addEventListener('aurora2:state',()=>{
    if(syncing)return;
    recalc();
    render();
  });

  w.Aurora2=w.Aurora2||{};
  w.Aurora2.funding={recalc,buildPlan,readLegacy};
})(window);
