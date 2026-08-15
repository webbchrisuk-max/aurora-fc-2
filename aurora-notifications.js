/* Aurora 2 Rich Notification Centre v1 — one shared, cloud-safe event engine. */
(function(w){
'use strict';
if(w.AuroraNotifications)return;

const VERSION='1.0.0';
const MAX_RECORDS=500;
const FILTERS=['all','action','investments','finance','system','unread'];
const ICONS={income:'£',investments:'↗',chairman:'🏛',finance:'◷',system:'⚙'};
const LABELS={income:'Income',investments:'Investments',chairman:"Chairman's Office",finance:'Finance',system:'Aurora System'};
let ready=false,centreOpen=false,activeFilter='all',writing=false,evaluateTimer=0;
const pending=[];
const $=(s,root=document)=>root.querySelector(s);
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const now=()=>new Date().toISOString();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)||0);
function localDate(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function dateAt(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))return null;const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
function dayDiff(a,b){return Math.round((b-a)/86400000)}
function core(){return w.Aurora2?.core}
function state(){return core()?.read?.()}
function notificationState(s=state()){return {version:1,records:[],marketState:{},healthState:{},updatedAt:null,...obj(s?.notifications),records:arr(s?.notifications?.records),marketState:obj(s?.notifications?.marketState),healthState:obj(s?.notifications?.healthState)}}
function save(mutator){
  if(writing||!core()?.update)return null;
  writing=true;
  try{return core().update(s=>({...s,notifications:{...notificationState(s),...mutator(notificationState(s)),version:1,updatedAt:now()}}))}
  finally{writing=false}
}
function normalise(input){
  const category=['income','investments','chairman','finance','system'].includes(input.category)?input.category:'system';
  const priority=['critical','important','positive','info','premium','date'].includes(input.priority)?input.priority:'info';
  const key=String(input.key||'').trim().slice(0,220);
  if(!key)throw new Error('Aurora notification event key is required.');
  return {
    id:key,key,category,priority,
    icon:String(input.icon||ICONS[category]||'•').slice(0,8),
    label:String(input.label||LABELS[category]||'Aurora').slice(0,50),
    title:String(input.title||'Aurora update').slice(0,100),
    detail:String(input.detail||'').slice(0,240),
    actionLabel:String(input.actionLabel||'Open').slice(0,32),
    actionUrl:safeUrl(input.actionUrl||''),
    createdAt:input.createdAt||now(),readAt:null,archivedAt:null,
    pinned:Boolean(input.pinned),toast:input.toast!==false,
    source:String(input.source||'AURORA2').slice(0,40)
  };
}
function safeUrl(value){
  const url=String(value||'');
  return /^[a-z0-9._-]+\.html(?:[?#].*)?$/i.test(url)?url:'';
}
function emit(input){
  if(!ready){pending.push(input);return null}
  const record=normalise(input),ns=notificationState();
  if(ns.records.some(x=>x?.key===record.key))return null;
  save(n=>({records:[record,...n.records].slice(0,MAX_RECORDS)}));
  render();
  if(record.toast&&['critical','important','positive','premium','date'].includes(record.priority))showToast(record);
  return record;
}
function mutateRecord(key,patch){
  const stamp=now();
  save(n=>({records:n.records.map(r=>r.key===key?{...r,...patch(stamp)}:r)}));render();
}
function markRead(key){mutateRecord(key,t=>({readAt:t}))}
function markAllRead(){save(n=>({records:n.records.map(r=>r.readAt?r:{...r,readAt:now()})}));render()}
function dismiss(key){mutateRecord(key,t=>({archivedAt:t,readAt:t,pinned:false}))}
function openAction(record){
  if(!record)return;
  markRead(record.key);
  if(record.actionUrl)location.assign(record.actionUrl);
}
function status(){const n=notificationState();return {version:VERSION,total:n.records.length,unread:n.records.filter(x=>!x.readAt&&!x.archivedAt).length,active:n.records.filter(x=>!x.archivedAt).length,archived:n.records.filter(x=>x.archivedAt).length,centreOpen,filter:activeFilter}}

function relative(iso){
  const ms=Date.now()-new Date(iso).getTime();if(!Number.isFinite(ms)||ms<0)return 'just now';
  const min=Math.floor(ms/60000);if(min<1)return 'just now';if(min<60)return `${min}m ago`;
  const hr=Math.floor(min/60);if(hr<24)return `${hr}h ago`;const day=Math.floor(hr/24);return day===1?'yesterday':`${day}d ago`;
}
function matches(r){
  if(activeFilter==='unread')return !r.readAt;
  if(activeFilter==='action')return r.pinned||['critical','premium'].includes(r.priority);
  if(activeFilter==='investments')return ['investments','income','chairman'].includes(r.category);
  return activeFilter==='all'||r.category===activeFilter;
}
function card(r){return `<article class="an-card an-${esc(r.priority)} ${r.readAt?'is-read':'is-unread'} ${r.pinned?'is-pinned':''}" data-key="${esc(r.key)}">
  <div class="an-icon">${esc(r.icon)}</div><div class="an-card-body"><div class="an-eyebrow"><span>${esc(r.label)}</span>${!r.readAt?'<i aria-label="Unread"></i>':''}</div>
  <strong class="an-title">${esc(r.title)}</strong><p>${esc(r.detail)}</p><div class="an-meta"><time datetime="${esc(r.createdAt)}">${esc(relative(r.createdAt))}</time>${r.pinned?'<span>REVIEW REQUIRED</span>':''}</div>
  <div class="an-actions">${r.actionUrl?`<button type="button" data-an-action>${esc(r.actionLabel)}</button>`:''}${!r.readAt?'<button type="button" class="an-secondary" data-an-read>Mark read</button>':''}<button type="button" class="an-dismiss" data-an-dismiss aria-label="Archive notification">Dismiss</button></div></div></article>`}
function render(){
  if(!ready)return;const ns=notificationState(),active=ns.records.filter(r=>!r.archivedAt),unread=active.filter(r=>!r.readAt).length;
  const badge=$('#auroraNotificationBadge');if(badge){badge.textContent=unread>99?'99+':String(unread);badge.hidden=!unread}
  const list=$('#auroraNotificationList');if(list){const rows=active.filter(matches);list.innerHTML=rows.map(card).join('')||'<div class="an-empty"><span>✦</span><strong>All clear</strong><p>No notifications match this view.</p></div>'}
  const count=$('#auroraNotificationCount');if(count)count.textContent=`${unread} UNREAD • ${active.length} ACTIVE`;
  document.querySelectorAll('[data-an-filter]').forEach(b=>b.classList.toggle('is-active',b.dataset.anFilter===activeFilter));
}
function showToast(r){
  const host=$('#auroraNotificationToasts');if(!host||document.visibilityState==='hidden')return;
  const el=document.createElement('article');el.className=`an-toast an-${r.priority}`;el.innerHTML=`<div class="an-icon">${esc(r.icon)}</div><div><small>${esc(r.label)}</small><strong>${esc(r.title)}</strong><p>${esc(r.detail)}</p></div><button aria-label="Close">×</button>`;
  el.addEventListener('click',e=>{if(e.target.closest('button')){el.remove();return}openAction(r)});host.prepend(el);requestAnimationFrame(()=>el.classList.add('show'));setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),300)},6500);
}

function buildUi(){
  if($('#auroraNotificationCentre'))return;
  const context=$('.aurora-shell-context')||$('.shell-context');
  const bell=document.createElement('button');bell.type='button';bell.id='auroraNotificationBell';bell.className='shell-control an-bell';bell.title='Notification Centre';bell.setAttribute('aria-label','Open Notification Centre');bell.innerHTML='<span>♢</span><b id="auroraNotificationBadge" hidden>0</b>';
  if(context)context.insertBefore(bell,context.querySelector('.aurora-shell-live')||null);else document.body.appendChild(bell);
  document.body.insertAdjacentHTML('beforeend',`<div class="an-shade" id="auroraNotificationShade"></div><aside class="an-centre" id="auroraNotificationCentre" aria-label="Notification Centre" aria-hidden="true"><header><div><small>AURORA 2 • LIVE INTELLIGENCE</small><h2>Notification Centre</h2><span id="auroraNotificationCount">0 UNREAD</span></div><button type="button" data-an-close aria-label="Close">×</button></header><nav aria-label="Notification filters">${[['all','All'],['action','Action Required'],['investments','Investments'],['finance','Finance'],['system','System'],['unread','Unread']].map(([k,v])=>`<button type="button" data-an-filter="${k}">${v}</button>`).join('')}</nav><div class="an-toolbar"><span>Important club events only</span><button type="button" data-an-all-read>Mark all read</button></div><div class="an-list" id="auroraNotificationList"></div></aside><div class="an-toasts" id="auroraNotificationToasts" aria-live="polite"></div>`);
  bell.addEventListener('click',toggleCentre);$('#auroraNotificationShade').addEventListener('click',closeCentre);
  $('#auroraNotificationCentre').addEventListener('click',e=>{const cardEl=e.target.closest('[data-key]'),key=cardEl?.dataset.key;if(e.target.closest('[data-an-close]'))closeCentre();else if(e.target.closest('[data-an-filter]')){activeFilter=e.target.closest('[data-an-filter]').dataset.anFilter;render()}else if(e.target.closest('[data-an-all-read]'))markAllRead();else if(key&&e.target.closest('[data-an-action]'))openAction(notificationState().records.find(r=>r.key===key));else if(key&&e.target.closest('[data-an-read]'))markRead(key);else if(key&&e.target.closest('[data-an-dismiss]'))dismiss(key)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&centreOpen)closeCentre()});
}
function toggleCentre(){centreOpen?closeCentre():openCentre()}
function openCentre(){centreOpen=true;document.body.classList.add('an-open');$('#auroraNotificationCentre')?.setAttribute('aria-hidden','false');render()}
function closeCentre(){centreOpen=false;document.body.classList.remove('an-open');$('#auroraNotificationCentre')?.setAttribute('aria-hidden','true')}

function dividendEvents(s,today){
  arr(s.income?.calendar).forEach(e=>{
    const ticker=String(e.ticker||'').toUpperCase(),id=String(e.id||e.backendId||'EVENT'),status=String(e.status||'').toUpperCase();
    if(e.exDate===today&&!['CANCELLED','ARCHIVED'].includes(status))emit({key:`EXDIV:${ticker}:${today}`,category:'investments',priority:'date',icon:'◇',title:'Ex-dividend today',detail:`${ticker} goes ex-dividend today. Eligibility uses the canonical Income calendar.`,actionLabel:'Open Income',actionUrl:'income.html',source:'INCOME'});
    if(e.payDate===today&&status==='PAID')emit({key:`DIVIDEND:${ticker}:${today}:${id}`,category:'income',priority:'positive',icon:'£',title:'Dividend received',detail:`${ticker} paid ${money(e.actualAmountGbp||e.expectedAmountGbp)} into your ${e.account||'investment account'} today.`,actionLabel:'View Income',actionUrl:'income.html',source:'INCOME'});
  });
}
function financeEvents(s,todayDate,today){
  const payday=dateAt(s.finance?.plan?.paydayDate),diff=payday?dayDiff(todayDate,payday):null;
  if(diff===2||diff===0)emit({key:`PAYDAY:${today}:${diff===0?'TODAY':'TWO_DAYS'}:${s.finance.plan.paydayDate}`,category:'finance',priority:diff===0?'positive':'important',title:diff===0?'Payday today':'Payday approaching',detail:diff===0?'Payday has arrived. Review wage routing and protected commitments.':'Payday is in two days. Finance can confirm the protected runway.',actionLabel:'Open Finance',actionUrl:'finance.html',source:'FINANCE'});
  arr(s.finance?.bills).filter(b=>!b.paid&&!b.archived&&b.included!==false).forEach(b=>{const due=dateAt(b.due);if(!due)return;const d=dayDiff(todayDate,due);let stage='';if(d===3)stage='THREE_DAYS';else if(d===1)stage='TOMORROW';else if(d===0)stage='TODAY';else if(d<0)stage='OVERDUE';if(!stage)return;emit({key:`BILL:${b.id}:${stage}:${b.due}`,category:'finance',priority:d<0?'critical':d===0?'important':'info',icon:d<0?'!':'◷',title:d<0?'Bill overdue':d===0?'Bill due today':d===1?'Bill due tomorrow':'Bill due in three days',detail:`${b.name} • ${money(b.amount)} from ${b.fundingSource||'Current Account'}.`,actionLabel:'Review Bill',actionUrl:'finance.html#billsPanel',source:'FINANCE'})});
}
function marketEvents(s){
  const ns=notificationState(s),next={...ns.marketState};
  arr(s.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h.status||'').toUpperCase())&&Number(h.shares)>0).forEach(h=>{
    const ticker=String(h.ticker||'').toUpperCase(),pct=Number(h.dayChangePct);if(!ticker||!Number.isFinite(pct))return;
    const direction=pct>=2?'UP':pct<=-2?'DOWN':'FLAT',magnitude=Math.abs(pct),tier=[7,4,2].find(x=>magnitude>=x)||0,previous=obj(next[ticker]);
    if(tier&&!(previous.direction===direction&&Number(previous.tier)>=tier))emit({key:`MARKET:${ticker}:${direction}:${tier}`,category:'investments',priority:tier>=7?'critical':tier>=4?'important':'info',icon:direction==='UP'?'↗':'↘',title:`${ticker} moved ${direction==='UP'?'up':'down'} ${tier}%`,detail:`The canonical Squad feed shows ${pct>0?'+':''}${pct.toFixed(2)}%, crossing the ${tier}% movement threshold.`,actionLabel:'View Holding',actionUrl:`squad.html#${encodeURIComponent(ticker)}`,source:'SQUAD'});
    const previousPrice=Number(previous.price)||0;
    const price=Number(h.livePriceGbp),targets=[['USER',Number(h.priceTargetGbp)],['CHAIRMAN',Number(h.chairmanTargetGbp)]];
    targets.forEach(([kind,target])=>{if(previousPrice>0&&previousPrice<target&&price>=target)emit({key:`PRICE_TARGET:${ticker}:${kind}:${target}`,category:'investments',priority:kind==='CHAIRMAN'?'premium':'important',title:'Price target crossed',detail:`${ticker} reached ${money(price)}, above the ${kind==='CHAIRMAN'?"Chairman's ":''}target of ${money(target)}.`,actionLabel:'Review Holding',actionUrl:'club-control.html',source:'SQUAD'})});
    next[ticker]={direction,tier,percent:pct,price};
  });
  if(JSON.stringify(next)!==JSON.stringify(ns.marketState))save(n=>({marketState:next}));
}
function offerEvents(s){
  arr(s.transfer?.offers).forEach(o=>{const ticker=String(o.ticker||o.symbol||'HOLDING').toUpperCase(),id=String(o.id||o.offerId||'');if(!id)return;const status=String(o.status||'RECEIVED').toUpperCase(),reviewed=Boolean(o.reviewedAt||o.dismissedAt||o.acceptedAt)||['REVIEWED','ACCEPTED','DISMISSED'].includes(status);
    if(!reviewed&&['RECEIVED','NEW','PENDING','OPEN'].includes(status))emit({key:`CHAIRMAN_OFFER:${ticker}:${id}:RECEIVED`,category:'chairman',priority:'premium',title:"Chairman's Offer Received",detail:`${ticker} has generated a new offer and needs review.`,actionLabel:'Review Offer',actionUrl:'club-control.html#chairmanReviewBoardV11',pinned:true,source:'CHAIRMAN'});
    if(['ACTIVE','ACTIVATED','TARGET_REACHED'].includes(status))emit({key:`CHAIRMAN_OFFER:${ticker}:${id}:${status==='TARGET_REACHED'?'TARGET_REACHED':'ACTIVATED'}`,category:'chairman',priority:'premium',title:status==='TARGET_REACHED'?"Chairman's Offer target reached":"Chairman's Offer activated",detail:`${ticker} offer ${status==='TARGET_REACHED'?'has reached its recorded target':'is now active'}.`,actionLabel:'Review Offer',actionUrl:'club-control.html#chairmanReviewBoardV11',source:'CHAIRMAN'});
    const legitimatelyEnded=(status==='WITHDRAWN'&&o.withdrawnAt)||(status==='EXPIRED'&&(o.expiredAt||(o.expiresAt&&new Date(o.expiresAt)<=new Date())));if(legitimatelyEnded)emit({key:`CHAIRMAN_OFFER:${ticker}:${id}:${status}`,category:'chairman',priority:'important',title:`Chairman's Offer ${status.toLowerCase()}`,detail:`${ticker} offer was explicitly ${status.toLowerCase()} in the canonical offer record.`,actionLabel:'Open Club Control',actionUrl:'club-control.html',source:'CHAIRMAN'});
  });
}
function healthEvents(s){
  const ns=notificationState(s),health={...ns.healthState},cfg=w.AuroraData2Client?.config?.(),backend=String(s.income?.backend?.status||s.connection?.status||'');
  if(w.AuroraData2Client){const dataProblem=!cfg?.endpoint?'ENDPOINT_MISSING':(['ERROR','FAILED'].includes(backend)?'BACKEND_FAILED':'');
    if(dataProblem&&health.data2!==dataProblem)emit({key:`DATA2:${dataProblem}:${localDate()}`,category:'system',priority:'critical',title:dataProblem==='ENDPOINT_MISSING'?'AuroraData 2 endpoint missing':'AuroraData 2 backend failed',detail:dataProblem==='ENDPOINT_MISSING'?'This browser has no AuroraData 2 endpoint configured. Credentials remain local and are never synced.':String(s.income?.backend?.lastError||'The backend reported a real failure.'),actionLabel:'Open System Health',actionUrl:'system-health.html',source:'AURORADATA2'});
    if(!dataProblem&&health.data2&&health.data2!=='HEALTHY')emit({key:`DATA2:RECOVERED:${localDate()}:${health.data2}`,category:'system',priority:'positive',title:'AuroraData 2 recovered',detail:'The backend responded successfully after the recorded problem.',actionLabel:'View Health',actionUrl:'system-health.html',source:'AURORADATA2'});
    health.data2=dataProblem||'HEALTHY';
  }
  const cloud=w.AuroraCloudSync?.status?.();if(cloud){let issue='';if(arr(cloud.conflicts).length)issue='CONFLICT';else if(cloud.signedIn&&cloud.online&&cloud.phase==='ERROR')issue='SYNC_FAILURE';else if(cloud.signedIn&&cloud.online&&cloud.lastSyncAt&&Date.now()-new Date(cloud.lastSyncAt).getTime()>86400000)issue='STALE_DEVICE';if(issue&&health.cloud!==issue)emit({key:`CLOUD:${issue}:${localDate()}`,category:'system',priority:issue==='CONFLICT'?'critical':'important',title:issue==='CONFLICT'?'Aurora Cloud conflict':'Aurora Cloud needs attention',detail:issue==='CONFLICT'?'A real department conflict needs a protected copy choice.':issue==='STALE_DEVICE'?'This joined device has not completed a sync for more than 24 hours.':'Aurora Cloud reported a sync failure.',actionLabel:'Review Cloud',actionUrl:'system-health.html',source:'AURORA_CLOUD'});health.cloud=issue||'HEALTHY'}
  if(JSON.stringify(health)!==JSON.stringify(ns.healthState))save(n=>({healthState:health}));
}
function evaluate(){
  if(!ready||writing)return status();const s=state();if(!s)return status();const d=new Date();d.setHours(12,0,0,0);const today=localDate(d);
  const paidBills=new Set(arr(s.finance?.bills).filter(b=>b.paid||b.archived).map(b=>String(b.id)));
  const closedOffers=new Set(arr(s.transfer?.offers).filter(o=>o.reviewedAt||o.dismissedAt||o.acceptedAt||['REVIEWED','ACCEPTED','DISMISSED'].includes(String(o.status||'').toUpperCase())).map(o=>String(o.id||o.offerId)));
  const currentNotifications=notificationState(s);
  if(currentNotifications.records.some(r=>(!r.archivedAt&&r.key.startsWith('BILL:')&&paidBills.has(r.key.split(':')[1]))||(r.pinned&&r.key.startsWith('CHAIRMAN_OFFER:')&&closedOffers.has(r.key.split(':')[2]))))save(n=>({records:n.records.map(r=>{if(!r.archivedAt&&r.key.startsWith('BILL:')&&paidBills.has(r.key.split(':')[1]))return {...r,archivedAt:now(),readAt:r.readAt||now()};if(r.pinned&&r.key.startsWith('CHAIRMAN_OFFER:')&&closedOffers.has(r.key.split(':')[2]))return {...r,pinned:false,readAt:r.readAt||now()};return r})}));
  dividendEvents(s,today);financeEvents(s,d,today);marketEvents(state());offerEvents(state());healthEvents(state());render();return status();
}
function scheduleEvaluate(){clearTimeout(evaluateTimer);evaluateTimer=setTimeout(evaluate,350)}
function init(){
  if(ready||!core()?.read){setTimeout(init,50);return}ready=true;injectStyles();buildUi();pending.splice(0).forEach(emit);render();setTimeout(evaluate,200);w.addEventListener('aurora2:state',scheduleEvaluate);w.addEventListener('aurora2:cloud-applied',scheduleEvaluate);setInterval(()=>{render();evaluate()},5*60*1000);
}
function injectStyles(){
  if($('#auroraNotificationStyles'))return;const style=document.createElement('style');style.id='auroraNotificationStyles';style.textContent=`
:root{--an-bg:#090d13;--an-line:rgba(115,202,255,.14);--an-cyan:#52d9ff}.an-bell{position:relative}.an-bell>span{font-size:20px;color:#bfefff}.an-bell b{position:absolute;right:-3px;top:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:10px;background:#ff455d;color:#fff;font:900 9px/17px Inter,Arial;box-shadow:0 0 15px #ff304f}.an-shade{position:fixed;inset:0;z-index:9990;background:rgba(2,5,10,.68);opacity:0;pointer-events:none;transition:.25s}.an-centre{position:fixed;z-index:9991;right:0;top:0;width:min(520px,100vw);height:100dvh;transform:translateX(102%);transition:transform .32s cubic-bezier(.2,.8,.2,1);background:linear-gradient(145deg,rgba(12,19,29,.985),rgba(5,8,13,.99));border-left:1px solid var(--an-line);box-shadow:-30px 0 90px rgba(0,0,0,.65);color:#e9f7ff;display:flex;flex-direction:column;font-family:Inter,system-ui,sans-serif}.an-open .an-shade{opacity:1;pointer-events:auto}.an-open .an-centre{transform:none}.an-centre header{padding:28px 24px 20px;display:flex;justify-content:space-between;border-bottom:1px solid var(--an-line);background:radial-gradient(circle at 15% 0,rgba(55,194,255,.11),transparent 55%)}.an-centre header small,.an-toast small{font-size:9px;font-weight:900;letter-spacing:.18em;color:#52d9ff}.an-centre h2{margin:6px 0 4px;font:800 25px/1.1 Inter,system-ui}.an-centre header span{font-size:9px;letter-spacing:.12em;color:#7f96a6}.an-centre header button{border:0;background:transparent;color:#89a0af;font-size:30px;cursor:pointer}.an-centre nav{display:flex;gap:7px;padding:14px 18px;overflow:auto;border-bottom:1px solid rgba(255,255,255,.06)}.an-centre nav button,.an-toolbar button{white-space:nowrap;border:1px solid rgba(130,205,238,.14);border-radius:20px;background:rgba(255,255,255,.025);color:#8094a3;padding:8px 11px;font:800 9px Inter;letter-spacing:.04em;cursor:pointer}.an-centre nav button.is-active{color:#dff8ff;border-color:rgba(67,211,255,.48);background:rgba(49,191,235,.12);box-shadow:0 0 18px rgba(49,191,235,.08)}.an-toolbar{padding:10px 20px;display:flex;align-items:center;justify-content:space-between;color:#657b89;font-size:10px}.an-toolbar button{border:0;color:#79dffa;background:none}.an-list{padding:6px 16px 35px;overflow:auto}.an-card{--accent:#52d9ff;position:relative;display:grid;grid-template-columns:48px 1fr;gap:13px;margin:10px 0;padding:16px;border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);border-radius:15px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 6%,rgba(15,20,28,.9)),rgba(8,12,18,.88));box-shadow:inset 3px 0 var(--accent),0 12px 35px rgba(0,0,0,.2)}.an-card.is-read{opacity:.66;box-shadow:inset 2px 0 color-mix(in srgb,var(--accent) 40%,transparent)}.an-card.is-pinned{border-color:color-mix(in srgb,var(--accent) 48%,transparent)}.an-critical{--accent:#ff4059}.an-important{--accent:#ffb947}.an-positive{--accent:#4ee39a}.an-info{--accent:#52d9ff}.an-premium{--accent:#e9b94d}.an-date{--accent:#b985ff}.an-icon{width:44px;height:44px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--accent) 50%,transparent);border-radius:13px;background:color-mix(in srgb,var(--accent) 11%,transparent);color:var(--accent);font-size:21px;font-weight:900;box-shadow:0 0 20px color-mix(in srgb,var(--accent) 12%,transparent)}.an-eyebrow{display:flex;align-items:center;gap:7px;color:var(--accent);font:900 8px Inter;letter-spacing:.17em;text-transform:uppercase}.an-eyebrow i{width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 9px var(--accent)}.an-title{display:block;margin:7px 0 5px;color:#f2fbff;font-size:14px}.an-card p,.an-toast p{margin:0;color:#8fa3b0;font-size:11px;line-height:1.5}.an-meta{display:flex;gap:10px;margin-top:9px;color:#586e7c;font-size:9px}.an-meta span{color:var(--accent);font-weight:900;letter-spacing:.1em}.an-actions{display:flex;align-items:center;gap:9px;margin-top:12px}.an-actions button{border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);border-radius:8px;background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent);padding:7px 10px;font:900 9px Inter;letter-spacing:.04em;cursor:pointer}.an-actions .an-secondary,.an-actions .an-dismiss{border:0;background:none;color:#78909e}.an-actions .an-dismiss{margin-left:auto}.an-empty{text-align:center;padding:80px 25px;color:#617480}.an-empty span{display:block;color:#52d9ff;font-size:30px}.an-empty strong{display:block;margin:10px;color:#cdebf7}.an-empty p{font-size:11px}.an-toasts{position:fixed;z-index:9995;right:18px;top:78px;width:min(390px,calc(100vw - 28px));pointer-events:none}.an-toast{--accent:#52d9ff;display:grid;grid-template-columns:44px 1fr 20px;gap:12px;margin-bottom:10px;padding:15px;border:1px solid color-mix(in srgb,var(--accent) 42%,transparent);border-radius:14px;background:rgba(9,14,21,.97);box-shadow:0 18px 55px rgba(0,0,0,.55),0 0 25px color-mix(in srgb,var(--accent) 9%,transparent);transform:translateX(115%);opacity:0;transition:.3s;pointer-events:auto;cursor:pointer;color:white}.an-toast.show{transform:none;opacity:1}.an-toast strong{display:block;margin:5px 0;font-size:13px}.an-toast button{border:0;background:none;color:#7e929f;font-size:19px;cursor:pointer}@media(max-width:600px){.an-centre{width:100vw}.an-centre header{padding:20px 18px 15px}.an-list{padding:5px 10px 26px}.an-card{grid-template-columns:40px 1fr;padding:14px 12px;gap:10px}.an-icon{width:38px;height:38px}.an-actions{flex-wrap:wrap}.an-toasts{right:14px;top:66px}}
`;document.head.appendChild(style)}

w.AuroraNotifications={version:VERSION,emit,markRead,dismiss,markAllRead,status,evaluate,open:openCentre,close:closeCentre};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
