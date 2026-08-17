/* Aurora City FC — Nexus V2 manager polish v1.0
 * Final-layer UX polish for the replacement Nexus HQ candidate.
 * - clearer tactical lens explanation
 * - captain / vice-captain markers on the live XI
 * - manager-language confidence cards
 * - richer company drawer verdict strip
 * - removes Development Room wording from the finished-facing shell
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_V2_MANAGER_POLISH__)return;
w.__AURORA_NEXUS_V2_MANAGER_POLISH__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

const arr=v=>Array.isArray(v)?v:[];
const raw=v=>{
  if(v===null||v===undefined)return null;
  if(typeof v==='string'&&v.trim()==='')return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
};
const num=v=>raw(v)??0;
const esc=v=>w.Aurora2?.ui?.escape?.(v)||String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>w.Aurora2?.ui?.money?.(v)||new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(num(v));
const state=()=>w.Aurora2?.core?.read?.()||null;
const shortTicker=v=>String(v||'').trim().toUpperCase().replace(/\..*$/,'');

const lensCopy={
  value:{title:'VALUE XI',copy:'Ranked by current portfolio value. Captain and vice-captain are the two largest positions in this XI.'},
  income:{title:'INCOME XI',copy:'Ranked by annual dividend contribution. The biggest income producers lead the formation.'},
  form:{title:'FORM XI',copy:'Ranked by supported daily market movement. Holdings without genuine live evidence are never given false form.'},
  risk:{title:'RISK XI',copy:'Prioritises holdings that need the most manager attention when genuine Aurora confidence evidence exists.'}
};

function currentLens(){return document.querySelector('.lens.active')?.dataset?.lens||'value';}

function installStyle(){
  if(document.getElementById('nexusV2ManagerPolishStyle'))return;
  const style=document.createElement('style');
  style.id='nexusV2ManagerPolishStyle';
  style.textContent=`
    .n2-lens-context{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:2px 0 12px;padding:11px 13px;border:1px solid rgba(125,211,252,.14);border-radius:13px;background:linear-gradient(90deg,rgba(8,47,73,.32),rgba(2,6,23,.18));color:#9fb5c9;font-size:10px;line-height:1.45}
    .n2-lens-context b{color:#67e8f9;font-size:10px;letter-spacing:.12em;white-space:nowrap}.n2-lens-context span{flex:1}
    .n2-player-role-badge{position:absolute!important;left:6px!important;top:5px!important;display:grid!important;place-items:center!important;width:20px!important;height:20px!important;margin:0!important;border-radius:7px!important;background:rgba(251,191,36,.16)!important;border:1px solid rgba(251,191,36,.46)!important;color:#fde68a!important;font-size:8px!important;font-weight:1000!important;line-height:1!important;box-shadow:0 0 16px rgba(251,191,36,.12)!important;overflow:visible!important}
    .n2-player-role-badge.vc{width:24px!important;background:rgba(34,211,238,.12)!important;border-color:rgba(34,211,238,.36)!important;color:#a5f3fc!important}
    .n2-player-node.n2-captain{border-color:rgba(251,191,36,.48)!important;box-shadow:0 12px 28px rgba(0,0,0,.38),0 0 22px rgba(251,191,36,.10)!important}
    .n2-player-node.n2-vice{border-color:rgba(34,211,238,.40)!important}
    .n2-manager-verdict{margin:0 0 13px;padding:13px 14px;border:1px solid rgba(52,211,153,.18);border-radius:16px;background:linear-gradient(135deg,rgba(6,78,59,.22),rgba(2,6,23,.30));box-shadow:inset 3px 0 0 rgba(52,211,153,.50)}
    .n2-manager-verdict.watch{border-color:rgba(251,191,36,.20);background:linear-gradient(135deg,rgba(120,53,15,.18),rgba(2,6,23,.30));box-shadow:inset 3px 0 0 rgba(251,191,36,.55)}
    .n2-manager-verdict.review{border-color:rgba(251,113,133,.22);background:linear-gradient(135deg,rgba(127,29,29,.18),rgba(2,6,23,.30));box-shadow:inset 3px 0 0 rgba(251,113,133,.55)}
    .n2-manager-verdict.transfer{border-color:rgba(34,211,238,.24);background:linear-gradient(135deg,rgba(8,47,73,.30),rgba(2,6,23,.30));box-shadow:inset 3px 0 0 rgba(34,211,238,.62)}
    .n2-manager-verdict small{display:block;color:#7dd3fc;font-size:8px;font-weight:1000;letter-spacing:.13em;text-transform:uppercase}.n2-manager-verdict strong{display:block;margin-top:5px;color:#f0fdfa;font-size:17px;letter-spacing:-.02em}.n2-manager-verdict p{margin:5px 0 0;color:#9fb2c7;font-size:10px;line-height:1.45}
    .n2-manager-verdict-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.n2-manager-verdict-meta span{padding:5px 7px;border:1px solid rgba(148,163,184,.12);border-radius:999px;background:rgba(2,6,23,.34);color:#cbd5e1;font-size:8px;font-weight:850}
    @media(max-width:760px){.n2-lens-context{align-items:flex-start;flex-direction:column}.n2-player-role-badge{left:4px!important;top:4px!important}}
  `;
  document.head.appendChild(style);
}

function promoteHeader(){
  const sub=document.querySelector('.n2-header .brand span');
  if(sub)sub.textContent='NEXUS HEADQUARTERS • CLUB COMMAND';
  const footer=document.querySelector('.footer');
  if(footer&&/development/i.test(footer.textContent||''))footer.textContent='AURORA NEXUS 2.0 • CLUB COMMAND • CANONICAL AURORA 2 STATE';
}

function ensureLensContext(){
  const panel=document.querySelector('.pitch-panel'),pitch=panel?.querySelector('.pitch');
  if(!panel||!pitch)return;
  let box=panel.querySelector('.n2-lens-context');
  if(!box){box=document.createElement('div');box.className='n2-lens-context';panel.insertBefore(box,pitch);}
  const info=lensCopy[currentLens()]||lensCopy.value;
  box.innerHTML=`<b>${esc(info.title)}</b><span>${esc(info.copy)}</span>`;
}

function decoratePlayers(){
  const nodes=[...document.querySelectorAll('.n2-player-node')];
  nodes.forEach(n=>{
    n.classList.remove('n2-captain','n2-vice');
    n.querySelectorAll('.n2-player-role-badge').forEach(x=>x.remove());
  });
  if(nodes[0]){
    nodes[0].classList.add('n2-captain');
    const b=document.createElement('span');b.className='n2-player-role-badge';b.textContent='C';b.title='Captain — highest ranked holding in this tactical lens';nodes[0].appendChild(b);
  }
  if(nodes[1]){
    nodes[1].classList.add('n2-vice');
    const b=document.createElement('span');b.className='n2-player-role-badge vc';b.textContent='VC';b.title='Vice-captain — second ranked holding in this tactical lens';nodes[1].appendChild(b);
  }
}

function cleanLeaderLanguage(){
  document.querySelectorAll('#leaderList .leader').forEach(card=>{
    const label=String(card.querySelector('small')?.textContent||'').trim().toLowerCase();
    const ticker=card.querySelector('.leader-top b'),score=card.querySelector('.leader-top strong'),copy=card.querySelector('p');
    if(label==='confidence leader'&&score&&/not scored/i.test(score.textContent||'')){
      if(ticker)ticker.textContent='BUILDING';score.textContent='Awaiting scores';if(copy)copy.textContent='Aurora Intelligence is still building genuine holding-level confidence evidence.';
    }
    if(label==='needs attention'&&score&&/not scored/i.test(score.textContent||'')){
      if(ticker)ticker.textContent='NO ALERT';score.textContent='Awaiting scores';if(copy)copy.textContent='Aurora will not label a holding weak until genuine confidence evidence exists.';
    }
  });
}

function activeHoldings(s,t){
  return arr(s?.squad?.holdings).filter(h=>shortTicker(h?.ticker||h?.name)===shortTicker(t)&&['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&num(h?.shares)>0);
}
function routeRows(s){
  const buckets=[s?.transfer?.route?.allocations,s?.transfer?.route?.legs,s?.transfer?.mission?.allocations,s?.transfer?.mission?.legs];
  return buckets.flatMap(arr);
}
function routeAllocation(s,t){return routeRows(s).find(x=>shortTicker(x?.ticker||x?.securityTicker||x?.name)===shortTicker(t))||null;}
function scoutingRow(s,t){return arr(s?.scouting?.targets).find(x=>shortTicker(x?.ticker||x?.securityTicker||x?.name)===shortTicker(t))||null;}

function verdictFor(s,t){
  const hs=activeHoldings(s,t),route=routeAllocation(s,t),scout=scoutingRow(s,t);
  const annual=hs.reduce((a,h)=>a+num(h?.annualIncomeGbp||(num(h?.shares)*num(h?.annualDpsGbp))),0);
  const market=hs.reduce((a,h)=>a+num(h?.marketValueGbp||(num(h?.shares)*num(h?.livePriceGbp))||h?.bookCostGbp),0);
  const book=hs.reduce((a,h)=>a+num(h?.bookCostGbp||(num(h?.shares)*num(h?.avgCostGbp)),0),0);
  const pl=market-book;
  const rec=String(scout?.recommendation||scout?.status||scout?.action||'').toUpperCase();
  if(route)return {label:'TRANSFER TARGET',cls:'transfer',reason:'This company is included in the current live Transfer recommendation.',meta:[`Route ${money(route?.amount||route?.allocationGbp||0)}`,annual?`${money(annual)}/yr current income`:null]};
  if(/BLOCK|REJECT|AVOID|SELL/.test(rec))return {label:'REVIEW',cls:'review',reason:'Aurora has a restrictive or negative scouting signal attached to this company.',meta:[rec||null,pl?`${pl>=0?'+':''}${money(pl)} vs book`:null]};
  if(/CAUTION|WATCH|MONITOR/.test(rec))return {label:'WATCH',cls:'watch',reason:'Keep the holding under review before committing additional capital.',meta:[rec||null,annual?`${money(annual)}/yr income`:null]};
  if(annual>0&&pl>=0)return {label:'CORE STARTER',cls:'',reason:'An established income contributor currently sitting at or above book cost.',meta:[`${money(annual)}/yr income`,`${pl>=0?'+':''}${money(pl)} vs book`]};
  if(annual>0)return {label:'HOLD',cls:'watch',reason:'The company contributes portfolio income but remains below book cost, so Aurora should monitor it rather than chase it.',meta:[`${money(annual)}/yr income`,`${money(pl)} vs book`]};
  return {label:'SQUAD PLAYER',cls:'',reason:'An active portfolio holding with no stronger current manager instruction.',meta:[market?`${money(market)} value`:null]};
}

function patchDrawer(){
  const drawer=document.getElementById('n2PlayerDrawer'),content=document.getElementById('n2DrawerContent'),title=document.getElementById('n2DrawerTitle');
  if(!drawer?.classList.contains('open')||!content||!title)return;
  const t=shortTicker(String(title.textContent||'').split('—')[0]);if(!t)return;
  const s=state();if(!s)return;
  content.querySelectorAll('.n2-manager-verdict').forEach(x=>x.remove());
  const v=verdictFor(s,t),box=document.createElement('div');box.className=`n2-manager-verdict ${v.cls}`.trim();
  box.innerHTML=`<small>Manager verdict</small><strong>${esc(v.label)}</strong><p>${esc(v.reason)}</p><div class="n2-manager-verdict-meta">${v.meta.filter(Boolean).map(x=>`<span>${esc(x)}</span>`).join('')}</div>`;
  content.prepend(box);
}

function polish(){
  installStyle();promoteHeader();ensureLensContext();decoratePlayers();cleanLeaderLanguage();patchDrawer();
}

function init(){
  polish();
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-lens]'))setTimeout(polish,25);
    if(e.target.closest('.n2-player-node')){setTimeout(patchDrawer,20);setTimeout(patchDrawer,100);}
  });
  w.addEventListener('aurora2:state',()=>{setTimeout(polish,50);setTimeout(polish,350);});
  const target=document.querySelector('.pitch-panel')||document.body;
  const observer=new MutationObserver(()=>{clearTimeout(observer._t);observer._t=setTimeout(()=>{ensureLensContext();decoratePlayers();cleanLeaderLanguage();patchDrawer();},35);});
  observer.observe(target,{childList:true,subtree:true});
  setTimeout(polish,400);setTimeout(polish,1400);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
