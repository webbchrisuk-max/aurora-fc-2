/* Aurora City FC — Nexus V2 polish
 * Keeps the development Nexus aligned with the shared Aurora page language.
 * - menu/navigation trigger sits on the left
 * - Starting XI always renders canonical active holdings, even while market data is pending
 */
(function(w){
  'use strict';
  if(w.__AURORA_NEXUS_V2_POLISH__)return;
  w.__AURORA_NEXUS_V2_POLISH__=true;

  const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
  if(page!=='auroracityfc_nexusv2.html')return;

  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const esc=v=>w.Aurora2?.ui?.escape?.(v)||String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>w.Aurora2?.ui?.money?.(v)||new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(num(v));

  function installHeaderPolish(){
    const header=document.querySelector('.n2-header');
    const brand=header?.querySelector('.brand');
    const menu=header?.querySelector('#auroraShellMenuButton');
    if(!header||!brand||!menu||header.querySelector('.n2-header-left'))return;

    const left=document.createElement('div');
    left.className='n2-header-left';
    header.insertBefore(left,brand);
    left.append(menu,brand);

    const style=document.createElement('style');
    style.id='nexusV2HeaderPolish';
    style.textContent=`
      .n2-header-left{display:flex;align-items:center;gap:12px;min-width:0}
      .n2-header-left .menu{order:0;flex:0 0 auto}
      .n2-header-left .brand{order:1;min-width:0}
      .n2-header{justify-content:space-between!important}
      @media(max-width:680px){.n2-header-left{gap:8px}.n2-header-left .brand strong{font-size:12px}}
    `;
    document.head.appendChild(style);
  }

  function state(){return w.Aurora2?.core?.read?.()||null}
  function activeHoldings(s){
    return arr(s?.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&num(h?.shares)>0);
  }
  function value(h){return num(h?.marketValueGbp)||(num(h?.shares)*num(h?.livePriceGbp))||num(h?.bookCostGbp)}
  function income(h){return num(h?.annualIncomeGbp)||(num(h?.shares)*num(h?.annualDpsGbp))}
  function confidence(h){return num(h?.confidence||h?.score||h?.auroraScore||h?.qualityScore)}
  function hasMarket(h){return ['dailyChangePct','todayChangePct','dayChangePct','dailyChangeGbp','todayChangeGbp','dayChangeGbp'].some(k=>Number.isFinite(Number(h?.[k])))}
  function dayPct(h){
    for(const k of ['dailyChangePct','todayChangePct','dayChangePct']){
      const n=Number(h?.[k]);if(Number.isFinite(n))return n;
    }
    const d=num(h?.dailyChangeGbp||h?.todayChangeGbp||h?.dayChangeGbp),mv=value(h),base=mv-d;
    return base?d/base*100:0;
  }
  function lens(){return document.querySelector('.lens.active')?.dataset?.lens||'value'}
  function score(h,l){
    if(l==='income')return income(h);
    if(l==='form')return hasMarket(h)?dayPct(h):(-1000000+value(h)/1000000);
    if(l==='risk')return confidence(h)?100-confidence(h):value(h)/1000;
    return value(h);
  }
  function label(h,l){
    if(l==='income')return `${money(income(h))}/yr`;
    if(l==='form')return hasMarket(h)?`${dayPct(h)>=0?'+':''}${dayPct(h).toFixed(2)}%`:'Market feed pending';
    if(l==='risk')return confidence(h)?`${confidence(h).toFixed(0)}/100 confidence`:'Risk score pending';
    return money(value(h));
  }

  function renderStartingXI(){
    const s=state(),target=document.getElementById('players'),note=document.getElementById('pitchNote');
    if(!s||!target)return;
    const hs=activeHoldings(s),l=lens();
    if(!hs.length){
      target.innerHTML='<div class="empty">No active holdings are available in canonical squad state.</div>';
      if(note)note.textContent='Starting XI is waiting for active holdings from Squad Hub.';
      return;
    }

    const selected=[...hs].sort((a,b)=>score(b,l)-score(a,l)).slice(0,11);
    target.innerHTML=selected.map((h,i)=>{
      const form=dayPct(h),risk=l==='risk'&&confidence(h)&&confidence(h)<60;
      const cls=risk?'risk':(l==='form'&&hasMarket(h)&&form>0?'good':'');
      return `<div class="player ${cls}" style="order:${i}"><div class="shirt">${i+1}</div><strong>${esc(h?.ticker||h?.name||'—')}</strong><span>${esc(label(h,l))}</span></div>`;
    }).join('');

    if(note){
      const covered=hs.filter(hasMarket).length;
      const lensName=l.charAt(0).toUpperCase()+l.slice(1);
      note.textContent=`${selected.length} of ${hs.length} active holdings shown • ${lensName} lens • ${covered}/${hs.length} have daily market evidence. Holdings remain visible while a feed is pending.`;
    }
  }

  function init(){
    installHeaderPolish();
    renderStartingXI();
    document.addEventListener('click',e=>{
      if(!e.target.closest('[data-lens]'))return;
      setTimeout(renderStartingXI,0);
    });
    w.addEventListener('aurora2:state',()=>setTimeout(renderStartingXI,0));
    setTimeout(renderStartingXI,300);
    setTimeout(renderStartingXI,1200);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
