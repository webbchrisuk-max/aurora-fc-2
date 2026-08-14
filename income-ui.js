
(function(){
'use strict';

function jump(id){
  const target=document.getElementById(id);
  if(!target)return;
  const offset=(document.querySelector('.aurora-shell-header')?.offsetHeight||0)+(document.querySelector('.income-jumpbar')?.offsetHeight||0)+18;
  const top=target.getBoundingClientRect().top+window.scrollY-offset;
  window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
}

document.addEventListener('click',event=>{
  const btn=event.target.closest('[data-income-jump]');
  if(!btn)return;
  event.preventDefault();
  jump(btn.dataset.incomeJump);
});

document.addEventListener('DOMContentLoaded',()=>{
  const label=document.getElementById('currentDepartment');
  if(label)label.textContent='INCOME CENTRE • DIVIDEND DEPARTMENT';
  document.title='Aurora City FC — Income Centre';
});
})();


/* =========================================================
   INCOME UI v1 — PROMOTION COMMAND
   Presentation-only. Reads values published by Income engine.
   ========================================================= */
(function(){
'use strict';

const $=id=>document.getElementById(id);
const num=v=>{
  const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:0;
};
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)||0);

function sourceText(id){return $(id)?.textContent||''}
function set(id,value){const el=$(id);if(el)el.textContent=value}

function renderPromotion(){
  const monthly=num(sourceText('kMonthly'));
  const annual=num(sourceText('kAnnual'));
  const target=625;
  const pct=target>0?Math.max(0,Math.min(100,monthly/target*100)):0;
  const gap=Math.max(0,target-monthly);

  set('income3Monthly',money(monthly));
  set('income3Percent',`${pct.toFixed(1)}% of £625`);
  set('income3Gap',gap>0?money(gap):'TARGET REACHED');
  set('income3Annual',money(annual));

  const ring=$('income3Ring');
  if(ring)ring.style.setProperty('--inc-progress',`${pct*3.6}deg`);
  const bar=$('income3ProgressBar');
  if(bar)bar.style.width=`${pct}%`;

  const status=$('income3PromotionStatus');
  if(status){
    status.classList.toggle('hit',monthly>=target);
    status.textContent=monthly>=target?'PROMOTED':'IN PROGRESS';
  }

  const routeAnnual=num(sourceText('routeUplift'));
  const projectedMonthly=monthly+(routeAnnual/12);
  if(routeAnnual>0){
    set('income3Projected',`${money(projectedMonthly)}/m`);
    set('income3ProjectedMeta',`includes ${money(routeAnnual)}/yr active Transfer projection`);
  }else{
    set('income3Projected','No active route');
    set('income3ProjectedMeta','current canonical income only');
  }

  const note=$('income3PromotionNote');
  if(note){
    if(monthly>=target){
      note.textContent='The £625 per month promotion target has been reached on the current canonical forward-income run rate.';
    }else{
      note.textContent=`Current forward income is ${money(monthly)} per month. ${money(gap)} per month remains to reach promotion.`;
    }
  }

  let marked=false;
  document.querySelectorAll('#income3Milestones [data-target]').forEach(card=>{
    const t=num(card.dataset.target);
    card.classList.remove('hit','current');
    if(monthly>=t)card.classList.add('hit');
    else if(!marked){card.classList.add('current');marked=true}
  });

  // Mirror existing authoritative Income outputs — do not recalculate a second answer.
  set('income3Yoc',sourceText('kYoc')||'0.00%');
  set('income3Yield',sourceText('kYield')||'0.00%');
  set('income3Best',sourceText('kBest')||'—');
  set('income3BestMeta',sourceText('kBestMeta')||'—');

  const nextTicker=sourceText('kNext')||'—';
  const nextMeta=sourceText('kNextMeta')||'Calendar event required';
  set('income3NextTicker',nextTicker);

  // kNext may itself carry the amount depending on the current Income renderer.
  // Preserve its published text; otherwise show the event meta as the detail.
  const amountMatch=nextMeta.match(/£\s?[\d,.]+/);
  set('income3NextAmount',amountMatch?amountMatch[0]:'Upcoming');
  set('income3NextMeta',nextMeta);

  const coverage=num(sourceText('calendarCoverage'));
  set('income3Coverage',String(coverage));
}

function reorderBrokerCashJump(){
  const nav=document.querySelector('.income-jumpbar');
  const cash=nav?.querySelector('[data-income-jump="brokerDividendCashSection"]');
  const runway=nav?.querySelector('[data-income-jump="incomeRunwaySection"]');
  if(cash&&runway&&cash.previousElementSibling!==nav.querySelector('[data-income-jump="incomePromotionSection"]')){
    nav.insertBefore(cash,runway);
    cash.textContent='Broker Cash';
  }
}

function bind(){
  const ids=['kMonthly','kAnnual','routeUplift','kYoc','kYield','kBest','kBestMeta','kNext','kNextMeta','calendarCoverage'];
  const observer=new MutationObserver(()=>renderPromotion());
  ids.forEach(id=>{
    const el=$(id);
    if(el)observer.observe(el,{childList:true,subtree:true,characterData:true});
  });

  setTimeout(()=>{renderPromotion();reorderBrokerCashJump()},80);
  setTimeout(()=>{renderPromotion();reorderBrokerCashJump()},700);
  setTimeout(()=>{renderPromotion();reorderBrokerCashJump()},1800);

  document.addEventListener('click',()=>setTimeout(renderPromotion,100));
  window.addEventListener('storage',()=>setTimeout(renderPromotion,60));
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)setTimeout(renderPromotion,80);
  });
}

document.addEventListener('DOMContentLoaded',bind);
})();
