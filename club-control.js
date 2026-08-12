(function(w){
  'use strict';

  const A=()=>w.Aurora2;
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const num=v=>{const n=Number(String(v??'').replace(/[£,%]/g,'').replace(/,/g,''));return Number.isFinite(n)?n:0};
  const esc=v=>A().ui.escape(v);
  const money=v=>A().ui.money(Number(v)||0);
  const now=()=>new Date().toISOString();

  let selectedKey='';
  let lens='sustainable';
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
  function profitTrigger(h){
    if(h.locked||String(h.status||'').toUpperCase()==='LOCKED')return {code:'locked',label:'LOCKED'};
    const p=holdingMetrics(h).profitPct;
    if(p>=10)return {code:'strong',label:'+10% STRONG REVIEW'};
    if(p>=6)return {code:'review',label:'+6% REVIEW'};
    return {code:'keep',label:'KEEP ZONE'};
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
  function nextExDate(state,h){
    const tk=ticker(h.ticker),ac=accountCode(h.account);
    const today=new Date();today.setHours(0,0,0,0);
    const events=arr(state.income?.calendar)
      .filter(e=>!['CANCELLED','ARCHIVED'].includes(String(e.status||'').toUpperCase()))
      .filter(e=>ticker(e.ticker)===tk)
      .filter(e=>accountCode(e.account)===ac||accountCode(e.account)==='CHECK'||ac==='CHECK')
      .map(e=>({...e,date:parseDate(e.exDate)}))
      .filter(e=>e.date&&e.date.getTime()>=today.getTime())
      .sort((a,b)=>a.date-b.date);
    const e=events[0];
    if(!e)return null;
    return {...e,days:dayDiff(today,e.date)};
  }

  function scoutingCandidates(state,currentTicker){
    return arr(state.scouting?.targets)
      .filter(t=>ticker(t.ticker)!==currentTicker)
      .filter(t=>String(t.status||'').toLowerCase()!=='block')
      .filter(t=>num(t.yieldPct)>0)
      .map(t=>({
        ...t,
        _ticker:ticker(t.ticker),
        _yield:Math.max(0,num(t.yieldPct)),
        _sustainable:Math.max(0,num(t.sustainableScore)),
        _maximum:Math.max(0,num(t.maximumScore)),
        _status:String(t.status||'caution').toLowerCase()
      }));
  }
  function rankedCandidates(state,currentTicker,mode){
    const rows=scoutingCandidates(state,currentTicker);
    const scoreKey=mode==='maximum'?'_maximum':'_sustainable';
    return rows.sort((a,b)=>{
      const aPass=a._status==='pass'?0:1,bPass=b._status==='pass'?0:1;
      return aPass-bPass||b[scoreKey]-a[scoreKey]||b._yield-a._yield;
    });
  }

  function allocateBasket(cash,candidates){
    const rows=arr(candidates).slice(0,5);
    if(!(cash>0)||!rows.length)return [];
    const base=Math.floor((cash/rows.length)*100)/100;
    let used=0;
    return rows.map((c,i)=>{
      const amount=i===rows.length-1?Math.max(0,Number((cash-used).toFixed(2))):base;
      used+=amount;
      return {
        id:c.id||c._ticker,
        ticker:c._ticker,
        name:String(c.name||c._ticker),
        account:accountLabel(c.preferredAccount),
        status:c._status,
        yieldPct:c._yield,
        score:lens==='maximum'?c._maximum:c._sustainable,
        amount,
        annualIncome:amount*c._yield/100
      };
    });
  }

  function replacementBasket(state,h,m){
    const candidates=rankedCandidates(state,ticker(h.ticker),lens==='maximum'?'maximum':'sustainable');
    if(lens==='custom'){
      const selected=candidates.filter(c=>customIds.has(String(c.id||c._ticker)));
      return allocateBasket(m.value,selected);
    }
    return allocateBasket(m.value,candidates.slice(0,3));
  }

  function buildVerdict({holding,metrics,basket,exEvent}){
    const replacementIncome=basket.reduce((s,r)=>s+r.annualIncome,0);
    const net=replacementIncome-metrics.income;
    const netPct=metrics.income>0?net/metrics.income*100:(replacementIncome>0?100:0);
    const caution=basket.filter(r=>r.status!=='pass').length;
    const closeEx=exEvent&&exEvent.days>=0&&exEvent.days<=7;

    if(holding.locked||String(holding.status||'').toUpperCase()==='LOCKED'){
      return {code:'block',title:'DO NOT ROTATE',reason:'This is a locked / legacy Squad position. Chairman can inspect it, but it is not eligible for a normal rotation.'};
    }
    if(!(metrics.value>0)){
      return {code:'review',title:'REVIEW',reason:'Current market value is missing, so Aurora cannot produce a reliable cash-released comparison.'};
    }
    if(!basket.length){
      return {code:'review',title:'REVIEW',reason:'There are no eligible Active Scouting replacements for this case. Promote and review more candidates in Scouting first.'};
    }
    if(closeEx){
      return {code:'review',title:'REVIEW',reason:`The next ex-dividend date is only ${exEvent.days} day${exEvent.days===1?'':'s'} away. Aurora caps the case at REVIEW so the income timing is considered before any exit.`};
    }
    if(caution>0){
      return {code:'review',title:'REVIEW',reason:`The replacement basket contains ${caution} caution target${caution===1?'':'s'}. The income comparison is useful, but Scouting evidence must be cleared before a stronger verdict.`};
    }
    if(metrics.profitPct>=10&&netPct>=5){
      return {code:'strong',title:'STRONG ROTATION',reason:`Capital profit is ${metrics.profitPct.toFixed(1)}% and the replacement basket improves annual income by ${money(net)} (${netPct.toFixed(1)}%). Both sides of the rotation case are stronger.`};
    }
    if((metrics.profitPct>=10&&net>=-0.005)||(metrics.profitPct>=6&&net>0)){
      return {code:'attractive',title:'ATTRACTIVE ROTATION',reason:`The profit trigger is active and the replacement basket ${net>=0?'maintains/improves':'nearly replaces'} the surrendered income. This is a credible Chairman review, not an automatic sale.`};
    }
    if(metrics.profitPct>=6||net>0){
      return {code:'review',title:'REVIEW',reason:`There is enough value on one side of the case to investigate, but the combined capital-profit and dividend-income result is not yet strong enough for an attractive rotation verdict.`};
    }
    if(metrics.income>0&&replacementIncome<metrics.income*.85){
      return {code:'keep',title:'KEEP',reason:'The replacement basket would surrender more than 15% of the current annual income without a +6% capital-profit trigger.'};
    }
    return {code:'keep',title:'KEEP',reason:'The current position does not yet offer a compelling enough capital-profit and replacement-income advantage to justify a rotation.'};
  }

  function selectedHolding(state=A().core.read()){
    const hs=activeHoldings(state);
    return hs.find(h=>holdingKey(h)===selectedKey)||hs[0]||null;
  }

  function caseData(state=A().core.read()){
    const h=selectedHolding(state);
    if(!h)return null;
    const m=holdingMetrics(h);
    const exEvent=nextExDate(state,h);
    const basket=replacementBasket(state,h,m);
    const replacementIncome=basket.reduce((s,r)=>s+r.annualIncome,0);
    const netAnnual=replacementIncome-m.income;
    const netMonthly=netAnnual/12;
    const coverage=m.income>0?replacementIncome/m.income*100:(replacementIncome>0?100:0);
    const profitYears=m.profit>0&&m.income>0?m.profit/m.income:null;
    const profitCushion=netAnnual<0&&m.profit>0?m.profit/Math.abs(netAnnual):null;
    const replacementYield=m.value>0?replacementIncome/m.value*100:0;
    const verdict=buildVerdict({holding:h,metrics:m,basket,exEvent});
    return {holding:h,metrics:m,exEvent,basket,replacementIncome,netAnnual,netMonthly,coverage,profitYears,profitCushion,replacementYield,verdict};
  }

  function renderKpis(state){
    const hs=activeHoldings(state);
    set('kPositions',hs.length);
    set('kReview',hs.filter(h=>!h.locked&&holdingMetrics(h).profitPct>=6).length);
    set('kStrong',hs.filter(h=>!h.locked&&holdingMetrics(h).profitPct>=10).length);
    set('kScouts',arr(state.scouting?.targets).length);
    set('kGlobal',arr(state.scouting?.universe).length||arr(state.scouting?.targets).length);
  }

  function renderMarket(state){
    const hs=activeHoldings(state)
      .map(h=>({h,m:holdingMetrics(h),trigger:profitTrigger(h)}))
      .sort((a,b)=>{
        if(a.trigger.code==='locked'&&b.trigger.code!=='locked')return 1;
        if(b.trigger.code==='locked'&&a.trigger.code!=='locked')return -1;
        return b.m.profitPct-a.m.profitPct||b.m.value-a.m.value;
      });
    const host=$('marketRows');
    if(!host)return;
    if(!hs.length){
      host.innerHTML='<tr><td colspan="9">No active Squad positions found.</td></tr>';
      return;
    }
    host.innerHTML=hs.map(({h,m,trigger})=>{
      const key=holdingKey(h),selected=key===selectedKey;
      const plClass=m.profit>=0?'good-text':'bad-text';
      return `<tr class="${selected?'selected':''}">
        <td class="player"><strong>${esc(ticker(h.ticker))}</strong><span>${esc(h.name||ticker(h.ticker))}</span></td>
        <td>${esc(accountLabel(h.account))}</td>
        <td>${money(m.value)}</td>
        <td>${money(m.book)}</td>
        <td class="${plClass}">${m.profit>=0?'+':''}${money(m.profit)}</td>
        <td>${money(m.income)} / yr</td>
        <td class="${m.profitPct>=6?'gold-text':''}">${m.profitPct>=0?'+':''}${m.profitPct.toFixed(1)}%</td>
        <td><span class="trigger ${trigger.code}">${trigger.label}</span></td>
        <td><button class="btn secondary" type="button" data-review="${esc(key)}">Review</button></td>
      </tr>`;
    }).join('');
  }

  function renderSelect(state){
    const hs=activeHoldings(state);
    const el=$('holdingSelect');if(!el)return;
    if(!hs.length){
      el.innerHTML='<option value="">No Squad holdings</option>';selectedKey='';return;
    }
    if(!selectedKey||!hs.some(h=>holdingKey(h)===selectedKey)){
      const preferred=[...hs].filter(h=>!h.locked).sort((a,b)=>holdingMetrics(b).profitPct-holdingMetrics(a).profitPct)[0]||hs[0];
      selectedKey=holdingKey(preferred);
    }
    el.innerHTML=hs
      .sort((a,b)=>ticker(a.ticker).localeCompare(ticker(b.ticker))||accountCode(a.account).localeCompare(accountCode(b.account)))
      .map(h=>`<option value="${esc(holdingKey(h))}">${esc(ticker(h.ticker))} • ${esc(accountLabel(h.account))}${h.locked?' • LOCKED':''}</option>`)
      .join('');
    el.value=selectedKey;
  }

  function renderCustomPool(state,h){
    const host=$('customPool');if(!host)return;
    const candidates=rankedCandidates(state,ticker(h.ticker),'sustainable');
    host.style.display=lens==='custom'?'grid':'none';
    if(lens!=='custom')return;
    if(!candidates.length){
      host.innerHTML='<div class="empty-state compact"><strong>No eligible Active Scouts</strong><p>Promote candidates in Scouting first.</p></div>';
      return;
    }
    if(!customIds.size){
      candidates.slice(0,3).forEach(c=>customIds.add(String(c.id||c._ticker)));
    }
    host.innerHTML=candidates.slice(0,12).map(c=>{
      const id=String(c.id||c._ticker);
      return `<label class="custom-choice"><input type="checkbox" data-custom="${esc(id)}" ${customIds.has(id)?'checked':''}>
        <div><strong>${esc(c._ticker)} — ${esc(c.name||c._ticker)}</strong><span>${c._yield.toFixed(2)}% yield • Sustainable ${Math.round(c._sustainable)} • Maximum ${Math.round(c._maximum)} • ${esc(c._status.toUpperCase())}</span></div>
      </label>`;
    }).join('');
  }

  function renderBasket(data){
    const host=$('basketList');if(!host)return;
    set('basketMeta',data.basket.length
      ?`${data.basket.length} replacement${data.basket.length===1?'':'s'} • equal split of ${money(data.metrics.value)} • scenario only`
      :'No eligible Active Scouting replacements for this case.'
    );
    if(!data.basket.length){
      host.innerHTML='<div class="empty-state compact"><strong>No replacement basket</strong><p>Open Scouting, promote candidates and clear their evidence first.</p></div>';
      return;
    }
    host.innerHTML=data.basket.map(r=>`<div class="basket-row">
      <div><strong>${esc(r.ticker)} — ${esc(r.name)}</strong><span>${esc(r.account)} • ${esc(r.status.toUpperCase())}</span></div>
      <div class="basket-num"><b>${money(r.amount)}</b><small>allocation</small></div>
      <div class="basket-num"><b>${r.yieldPct.toFixed(2)}%</b><small>yield</small></div>
      <div class="basket-num"><b>${money(r.annualIncome)}</b><small>income / yr</small></div>
      <div class="basket-num"><b>${Math.round(r.score)}/100</b><small>${lens==='maximum'?'maximum':'sustainable'}</small></div>
    </div>`).join('');
  }

  function paintSigned(id,value){
    const el=$(id);if(!el)return;
    el.classList.remove('good-text','bad-text');
    if(value>0.005)el.classList.add('good-text');
    if(value<-.005)el.classList.add('bad-text');
  }

  function renderCase(state){
    const data=caseData(state);
    if(!data)return;
    const {holding:h,metrics:m,exEvent,basket,replacementIncome,netAnnual,netMonthly,coverage,profitYears,profitCushion,replacementYield,verdict}=data;

    set('caseBadge',`${ticker(h.ticker)} • ${accountLabel(h.account)}`);
    set('caseCash',money(m.value));
    set('caseProfit',`${m.profit>=0?'+':''}${money(m.profit)}`);
    paintSigned('caseProfit',m.profit);
    set('caseProfitMeta',`${m.profitPct>=0?'+':''}${m.profitPct.toFixed(2)}% versus book cost ${money(m.book)}`);
    set('caseIncomeLost',`${money(m.income)} / yr`);
    set('caseIncomeMeta',`${money(m.income/12)} / month • current yield ${m.currentYield.toFixed(2)}%`);
    if(exEvent){
      set('caseExDate',dateLabel(exEvent.exDate));
      set('caseExMeta',exEvent.days===0?'Ex-date is today':`${exEvent.days} day${exEvent.days===1?'':'s'} away • ${String(exEvent.status||'FORECAST').toUpperCase()}`);
    }else{
      set('caseExDate','No upcoming');
      set('caseExMeta','No future ex-date is loaded in the Income calendar for this account position.');
    }

    renderCustomPool(state,h);
    // Custom pool may seed selections. Rebuild once if necessary.
    const fresh=lens==='custom'?caseData(state):data;
    if(fresh!==data){
      renderBasket(fresh);
      renderComparison(fresh);
      renderVerdict(fresh);
    }else{
      renderBasket(data);
      renderComparison(data);
      renderVerdict(data);
    }
  }

  function renderComparison(data){
    const old=data.metrics.income,newInc=data.replacementIncome,net=data.netAnnual;
    set('oldIncome',money(old));
    set('newIncome',money(newInc));
    set('newIncomeMeta',`${data.basket.length} Scouting replacement${data.basket.length===1?'':'s'} • ${data.replacementYield.toFixed(2)}% blended yield`);
    set('netAnnual',`${net>=0?'+':''}${money(net)}`);
    paintSigned('netAnnual',net);
    set('netAnnualMeta',old>0?`${net>=0?'+':''}${(net/old*100).toFixed(1)}% versus surrendered income`:'No old dividend income to replace');
    set('netMonthly',`${data.netMonthly>=0?'+':''}${money(data.netMonthly)}`);
    paintSigned('netMonthly',data.netMonthly);
    set('incomeCoverage',old>0?`${data.coverage.toFixed(1)}%`:newInc>0?'NEW INCOME':'—');
    set('profitYears',data.profitYears!=null?`${data.profitYears.toFixed(1)} years`:'—');
    set('profitCushion',net>=0?'No erosion':data.profitCushion!=null?`${data.profitCushion.toFixed(1)} years`:'No cushion');
    set('replacementYield',`${data.replacementYield.toFixed(2)}%`);
    set('comparisonLens',lens==='maximum'?'MAXIMUM':lens==='custom'?'CUSTOM':'SUSTAINABLE');
  }

  function renderVerdict(data){
    const card=$('verdictCard');
    if(card){
      card.className=`verdict-card ${data.verdict.code}`;
    }
    set('verdictTitle',data.verdict.title);
    set('verdictReason',data.verdict.reason);
  }

  function render(){
    const state=A().core.read();
    renderKpis(state);
    renderSelect(state);
    renderMarket(state);
    renderCase(state);
    document.querySelectorAll('[data-lens]').forEach(b=>b.classList.toggle('active',b.dataset.lens===lens));
    set('lensNote',
      lens==='custom'
        ?'Custom mode uses only the Active Scouting players you tick below. Allocation is equal-split and remains hypothetical.'
        :`${lens==='maximum'?'Maximum Income':'Sustainable'} mode takes the top three current Active Scouting candidates. Allocation is equal-split so Chairman does not recreate Transfer deployment logic.`
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
      toast('Chairman case refreshed from Squad, Income and Scouting.');
    });
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

  document.addEventListener('DOMContentLoaded',()=>{
    wire();
    render();
  });
  w.addEventListener('aurora2:state',render);

  w.Aurora2=w.Aurora2||{};
  w.Aurora2.clubControl={
    holdingMetrics,
    profitTrigger,
    allocateBasket,
    buildVerdict,
    caseData
  };
})(window);
