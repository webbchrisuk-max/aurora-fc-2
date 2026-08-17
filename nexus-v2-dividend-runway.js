/* Aurora City FC — Nexus V2 interactive dividend runway v1.0
 * Turns each 12-month runway tile into a dividend fixture list.
 * All dates, amounts, accounts and statuses come from the canonical Income calendar.
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_V2_DIVIDEND_RUNWAY__)return;
w.__AURORA_NEXUS_V2_DIVIDEND_RUNWAY__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

const arr=v=>Array.isArray(v)?v:[];
const rawNumber=v=>{
  if(v===null||v===undefined)return null;
  if(typeof v==='string'&&!v.trim())return null;
  const n=Number(String(v).replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:null;
};
const esc=v=>w.Aurora2?.ui?.escape?.(v)||String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>w.Aurora2?.ui?.money?.(v)||new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)||0);

let openKey='';
let lastTrigger=null;
let observer=null;

function monthAt(index){
  const now=new Date();
  const d=new Date(now.getFullYear(),now.getMonth()+index,1,12);
  return {
    key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
    short:d.toLocaleDateString('en-GB',{month:'short'}).toUpperCase(),
    full:d.toLocaleDateString('en-GB',{month:'long',year:'numeric'})
  };
}

function rowDate(row){
  const fields=[
    ['paymentDate','Payment date'],['payDate','Payment date'],['payment_date','Payment date'],
    ['date','Scheduled date'],['exDate','Ex-dividend date'],['ex_date','Ex-dividend date']
  ];
  for(const [field,label] of fields){
    const raw=String(row?.[field]||'').trim();
    if(!raw)continue;
    const d=new Date(raw);
    if(!Number.isNaN(d.getTime()))return {date:d,raw,label,field};
  }
  return null;
}

function rowAmount(row){
  for(const field of ['actualAmountGbp','amountGbp','amount','expectedAmountGbp','forecastAmountGbp']){
    const n=rawNumber(row?.[field]);
    if(n!==null)return {value:n,field};
  }
  return {value:null,field:''};
}

function statusFor(row,dateInfo,amountInfo){
  const status=String(row?.status||row?.paymentStatus||'').trim().toUpperCase();
  if(status==='PAID')return {label:'PAID',tone:'paid'};
  if(['CONFIRMED','DECLARED','APPROVED'].includes(status))return {label:'CONFIRMED',tone:'confirmed'};
  if(dateInfo?.field==='exDate'||dateInfo?.field==='ex_date')return {label:'EX-DIV DATE',tone:'exdiv'};
  if(dateInfo?.field==='paymentDate'||dateInfo?.field==='payDate'||dateInfo?.field==='payment_date')return {label:'SCHEDULED',tone:'scheduled'};
  if(amountInfo?.field==='forecastAmountGbp')return {label:'FORECAST',tone:'forecast'};
  return {label:status||'MAPPED',tone:'mapped'};
}

function fixturesFor(key){
  const state=w.Aurora2?.core?.read?.();
  return arr(state?.income?.calendar).map(row=>{
    const dateInfo=rowDate(row);
    if(!dateInfo)return null;
    const rowKey=`${dateInfo.date.getFullYear()}-${String(dateInfo.date.getMonth()+1).padStart(2,'0')}`;
    if(rowKey!==key)return null;
    const amountInfo=rowAmount(row);
    return {
      row,
      dateInfo,
      amountInfo,
      status:statusFor(row,dateInfo,amountInfo),
      ticker:String(row?.ticker||row?.symbol||row?.name||'Dividend').trim().toUpperCase(),
      name:String(row?.name||row?.company||'').trim(),
      account:String(row?.account||row?.broker||row?.platform||'Account not mapped').trim()
    };
  }).filter(Boolean).sort((a,b)=>a.dateInfo.date-b.dateInfo.date||a.ticker.localeCompare(b.ticker));
}

function installStyle(){
  if(document.getElementById('nexusV2DividendRunwayStyle'))return;
  const style=document.createElement('style');
  style.id='nexusV2DividendRunwayStyle';
  style.textContent=`
    #n2uRunway .n2u-month.n2-runway-clickable{cursor:pointer;position:relative;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease;outline:none}
    #n2uRunway .n2u-month.n2-runway-clickable:after{content:'Tap for fixtures';display:block;margin-top:8px;color:#6f8fa6;font-size:7px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;opacity:.75}
    #n2uRunway .n2u-month.n2-runway-clickable:hover,#n2uRunway .n2u-month.n2-runway-clickable:focus-visible,#n2uRunway .n2u-month.n2-runway-selected{transform:translateY(-2px);border-color:rgba(37,221,255,.62)!important;box-shadow:0 12px 28px rgba(0,0,0,.28),0 0 22px rgba(37,221,255,.11);background:linear-gradient(145deg,rgba(9,36,58,.96),rgba(5,21,36,.98))!important}
    #n2uRunway .n2u-month.n2-runway-selected:after{content:'Fixtures open';color:#25ddff}

    .n2-runway-shade{position:fixed;inset:0;z-index:520;background:rgba(1,5,12,.72);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);opacity:0;pointer-events:none;transition:opacity .2s ease}
    .n2-runway-shade.open{opacity:1;pointer-events:auto}
    .n2-runway-dialog{position:fixed;z-index:521;left:50%;top:50%;width:min(620px,calc(100vw - 28px));max-height:min(76vh,720px);display:flex;flex-direction:column;transform:translate(-50%,-46%) scale(.97);opacity:0;pointer-events:none;border:1px solid rgba(37,221,255,.24);border-radius:22px;background:linear-gradient(155deg,rgba(8,25,43,.985),rgba(3,10,21,.995));box-shadow:0 28px 90px rgba(0,0,0,.68),0 0 48px rgba(37,221,255,.09);color:#effaff;transition:transform .22s ease,opacity .22s ease;overflow:hidden}
    .n2-runway-dialog.open{transform:translate(-50%,-50%) scale(1);opacity:1;pointer-events:auto}
    .n2-runway-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:22px 22px 17px;border-bottom:1px solid rgba(125,211,252,.13);background:radial-gradient(circle at 14% 0,rgba(37,221,255,.12),transparent 48%)}
    .n2-runway-kicker{display:block;color:#25ddff;font-size:9px;font-weight:1000;letter-spacing:.16em;text-transform:uppercase}.n2-runway-head h3{margin:6px 0 5px;font-size:27px;letter-spacing:-.04em}.n2-runway-head p{margin:0;color:#91a8be;font-size:11px;line-height:1.45}.n2-runway-close{width:40px;height:40px;flex:0 0 40px;border:1px solid rgba(125,211,252,.18);border-radius:13px;background:rgba(8,29,48,.74);color:#bfefff;font-size:24px;cursor:pointer}
    .n2-runway-list{overflow:auto;padding:8px 18px 5px;-webkit-overflow-scrolling:touch}.n2-runway-fixture{display:grid;grid-template-columns:76px minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px 4px;border-bottom:1px solid rgba(148,163,184,.10)}.n2-runway-fixture:last-child{border-bottom:0}.n2-runway-date{color:#8be8ff;font-size:10px;font-weight:950;text-transform:uppercase}.n2-runway-company{min-width:0}.n2-runway-company b{display:block;color:#f4fbff;font-size:14px}.n2-runway-company span{display:block;margin-top:4px;color:#8399aa;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.n2-runway-money{text-align:right}.n2-runway-money strong{display:block;color:#86efac;font-size:14px}.n2-runway-status{display:inline-block;margin-top:5px;padding:4px 7px;border:1px solid rgba(37,221,255,.20);border-radius:99px;color:#91cde0;font-size:7px;font-weight:1000;letter-spacing:.08em}.n2-runway-status.paid{color:#86efac;border-color:rgba(52,211,153,.34)}.n2-runway-status.confirmed,.n2-runway-status.scheduled{color:#7dd3fc}.n2-runway-status.exdiv{color:#c4b5fd;border-color:rgba(167,139,250,.34)}.n2-runway-status.forecast{color:#fde68a;border-color:rgba(251,191,36,.32)}
    .n2-runway-empty{padding:44px 18px;text-align:center;color:#7f95a5;font-size:11px}.n2-runway-empty strong{display:block;margin-bottom:8px;color:#d9f5ff;font-size:15px}.n2-runway-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 20px 18px;border-top:1px solid rgba(125,211,252,.12);background:rgba(2,8,18,.62)}.n2-runway-total small{display:block;color:#71899a;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.1em}.n2-runway-total strong{display:block;margin-top:4px;font-size:19px;color:#effaff}.n2-runway-income-link{display:inline-flex;align-items:center;justify-content:center;padding:10px 13px;border-radius:9px;background:#25ddff;color:#03121c;text-decoration:none;font-size:9px;font-weight:1000;white-space:nowrap}
    @media(max-width:620px){.n2-runway-dialog{width:calc(100vw - 18px);max-height:82vh}.n2-runway-head{padding:18px 16px 14px}.n2-runway-head h3{font-size:23px}.n2-runway-list{padding-inline:12px}.n2-runway-fixture{grid-template-columns:66px minmax(0,1fr);gap:9px}.n2-runway-money{grid-column:2;text-align:left;display:flex;align-items:center;gap:8px}.n2-runway-money strong{font-size:12px}.n2-runway-status{margin-top:0}.n2-runway-foot{padding:12px 14px 15px}}
  `;
  document.head.appendChild(style);
}

function ensureDialog(){
  if(document.getElementById('n2DividendRunwayDialog'))return;
  document.body.insertAdjacentHTML('beforeend',`
    <div class="n2-runway-shade" id="n2DividendRunwayShade" aria-hidden="true"></div>
    <section class="n2-runway-dialog" id="n2DividendRunwayDialog" role="dialog" aria-modal="true" aria-labelledby="n2DividendRunwayTitle" aria-hidden="true">
      <header class="n2-runway-head"><div><span class="n2-runway-kicker">Dividend fixtures</span><h3 id="n2DividendRunwayTitle">Dividend month</h3><p id="n2DividendRunwayMeta">Canonical Income calendar</p></div><button class="n2-runway-close" id="n2DividendRunwayClose" type="button" aria-label="Close dividend fixtures">×</button></header>
      <div class="n2-runway-list" id="n2DividendRunwayList"></div>
      <footer class="n2-runway-foot"><div class="n2-runway-total"><small>Month total</small><strong id="n2DividendRunwayTotal">—</strong></div><a class="n2-runway-income-link" href="income.html">Open Income Centre →</a></footer>
    </section>`);
}

function decorateRunway(){
  const runway=document.getElementById('n2uRunway');
  if(!runway)return false;
  [...runway.querySelectorAll('.n2u-month')].forEach((tile,index)=>{
    const month=monthAt(index);
    tile.classList.add('n2-runway-clickable');
    tile.classList.toggle('n2-runway-selected',month.key===openKey);
    tile.dataset.runwayMonth=month.key;
    tile.dataset.runwayMonthIndex=String(index);
    tile.setAttribute('role','button');
    tile.setAttribute('tabindex','0');
    tile.setAttribute('aria-haspopup','dialog');
    tile.setAttribute('aria-label',`Open ${month.full} dividend fixtures`);
  });
  return true;
}

function renderDialog(key){
  const monthIndex=Array.from({length:12},(_,i)=>monthAt(i)).findIndex(m=>m.key===key);
  const month=monthIndex>=0?monthAt(monthIndex):null;
  const rows=fixturesFor(key);
  const total=rows.reduce((sum,item)=>sum+(item.amountInfo.value??0),0);
  const title=document.getElementById('n2DividendRunwayTitle');
  const meta=document.getElementById('n2DividendRunwayMeta');
  const list=document.getElementById('n2DividendRunwayList');
  const totalEl=document.getElementById('n2DividendRunwayTotal');
  if(title)title.textContent=(month?.full||key).toUpperCase();
  if(meta)meta.textContent=`${rows.length} dividend${rows.length===1?'':'s'} mapped • dates shown exactly as held by Income Centre`;
  if(totalEl)totalEl.textContent=rows.some(x=>x.amountInfo.value!==null)?money(total):'Amount not mapped';
  if(!list)return;
  list.innerHTML=rows.length?rows.map(item=>{
    const date=item.dateInfo.date.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'});
    const amount=item.amountInfo.value===null?'—':money(item.amountInfo.value);
    const secondary=[item.name&&item.name.toUpperCase()!==item.ticker?item.name:'',item.account,item.dateInfo.label].filter(Boolean).join(' • ');
    return `<article class="n2-runway-fixture"><time class="n2-runway-date" datetime="${esc(item.dateInfo.raw)}">${esc(date)}</time><div class="n2-runway-company"><b>${esc(item.ticker)}</b><span>${esc(secondary)}</span></div><div class="n2-runway-money"><strong>${esc(amount)}</strong><span class="n2-runway-status ${esc(item.status.tone)}">${esc(item.status.label)}</span></div></article>`;
  }).join(''):'<div class="n2-runway-empty"><strong>No mapped dividend fixtures</strong>Income Centre has no dated dividend event in this month yet.</div>';
}

function openMonth(tile){
  ensureDialog();
  const key=tile?.dataset?.runwayMonth;
  if(!key)return;
  openKey=key;
  lastTrigger=tile;
  renderDialog(key);
  decorateRunway();
  const shade=document.getElementById('n2DividendRunwayShade');
  const dialog=document.getElementById('n2DividendRunwayDialog');
  shade?.classList.add('open');shade?.setAttribute('aria-hidden','false');
  dialog?.classList.add('open');dialog?.setAttribute('aria-hidden','false');
  setTimeout(()=>document.getElementById('n2DividendRunwayClose')?.focus(),30);
}

function closeDialog(){
  openKey='';
  const shade=document.getElementById('n2DividendRunwayShade');
  const dialog=document.getElementById('n2DividendRunwayDialog');
  shade?.classList.remove('open');shade?.setAttribute('aria-hidden','true');
  dialog?.classList.remove('open');dialog?.setAttribute('aria-hidden','true');
  decorateRunway();
  const focus=lastTrigger;lastTrigger=null;
  setTimeout(()=>focus?.focus?.(),20);
}

function bind(){
  if(document.documentElement.dataset.n2RunwayBound==='1')return;
  document.documentElement.dataset.n2RunwayBound='1';
  document.addEventListener('click',e=>{
    const tile=e.target.closest('#n2uRunway .n2u-month');
    if(tile){openMonth(tile);return;}
    if(e.target.closest('#n2DividendRunwayClose')||e.target===document.getElementById('n2DividendRunwayShade'))closeDialog();
  });
  document.addEventListener('keydown',e=>{
    const tile=e.target.closest?.('#n2uRunway .n2u-month');
    if(tile&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openMonth(tile);return;}
    if(e.key==='Escape'&&openKey)closeDialog();
  });
  w.addEventListener('aurora2:state',()=>{
    setTimeout(()=>{
      decorateRunway();
      if(openKey)renderDialog(openKey);
    },40);
  });
}

function watch(){
  installStyle();ensureDialog();bind();
  let attempts=0;
  const timer=setInterval(()=>{
    attempts++;
    const ready=decorateRunway();
    if(ready){
      const runway=document.getElementById('n2uRunway');
      if(runway&&!observer){observer=new MutationObserver(()=>{decorateRunway();if(openKey)renderDialog(openKey)});observer.observe(runway,{childList:true});}
      if(attempts>12)clearInterval(timer);
    }
    if(attempts>80)clearInterval(timer);
  },125);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});
else watch();
})(window);
