/* Aurora City FC — Nexus V2 Canonical Controller v1.1
 * One render owner for Nexus Headquarters.
 *
 * Data ownership:
 * - Aurora2 core: portfolio, Finance/Scouting/Transfer/Income/Mission state
 * - AuroraClubCommand LivePrices: intraday price/change evidence
 * - AuroraMaster.json: current AuroraIntelligence confidence + dividend fallback
 * - Match Report feed: canonical latest report in Aurora2 state
 *
 * This controller is read-only. It never writes trades, Finance money,
 * Scouting scores, Transfer allocations or Registration executions.
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_CANONICAL_CONTROLLER__)return;
w.__AURORA_NEXUS_CANONICAL_CONTROLLER__=true;
const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

const arr=v=>Array.isArray(v)?v:[];
const raw=v=>{if(v===null||v===undefined||(typeof v==='string'&&!v.trim()))return null;const n=Number(String(v).replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
const num=v=>raw(v)??0;
const esc=v=>w.Aurora2?.ui?.escape?.(v)||String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ticker=v=>String(v||'').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'').replace(/\..*$/,'');
const money=v=>{const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(n):'—'};
const signedMoney=v=>{const n=Number(v);return Number.isFinite(n)?`${n>0?'+':''}${money(n)}`:'—'};
const pct=v=>{const n=Number(v);return Number.isFinite(n)?`${n>0?'+':''}${n.toFixed(2)}%`:'—'};
const state=()=>w.Aurora2?.core?.read?.()||null;
const accountKind=h=>{const s=String(h?.account||h?.platform||'').toLowerCase();return s.includes('212')?'T212':s.includes('ig')?'IG':'OTHER'};
const BUILD='20260819-nexus-fulltime-4';
const positions=[
 {left:50,top:88},
 {left:18,top:72},{left:39,top:69},{left:61,top:69},{left:82,top:72},
 {left:28,top:48},{left:50,top:43},{left:72,top:48},
 {left:18,top:22},{left:50,top:15},{left:82,top:22}
];
const lensCopy={
 value:['VALUE XI','Ranked by current live portfolio value.'],
 income:['INCOME XI','Ranked by current annual dividend contribution.'],
 form:['FORM XI','Ranked only from genuine LivePrices daily movement.'],
 risk:['RISK XI','Lowest genuine Aurora Intelligence confidence appears first.']
};

let master=null,masterAt=0,masterPromise=null,renderQueued=false,currentDrawerTicker='';
let confidenceMap=new Map();

function activePositions(s){return arr(s?.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&num(h?.shares)>0)}
function holdingBook(h){return num(h?.bookCostGbp)||(num(h?.shares)*num(h?.avgCostGbp))}
function holdingIncome(h){return num(h?.annualIncomeGbp)||(num(h?.shares)*num(h?.annualDpsGbp))}
function storedValue(h){return num(h?.marketValueGbp)||(num(h?.shares)*num(h?.livePriceGbp))||holdingBook(h)}
function marketRows(){return arr(w.AuroraClubCommand?.marketRows?.()).map(r=>({ticker:ticker(r?.ticker||r?.symbol),price:raw(r?.price),change:raw(r?.change??r?.day_change),tradeTime:r?.tradeTime||r?.trade_time||''})).filter(r=>r.ticker&&r.price!==null&&r.price>0&&r.change!==null)}
function contribution(price,change,shares){if(!(price>0)||change===null||!(shares>0)||change<=-99.99)return null;const prev=price/(1+change/100);return (price-prev)*shares}
function aggregate(s){
 const live=new Map(marketRows().map(r=>[r.ticker,r])),map=new Map();
 activePositions(s).forEach(h=>{
  const tk=ticker(h?.ticker||h?.marketSymbol||h?.name);if(!tk)return;
  if(!map.has(tk))map.set(tk,{ticker:tk,name:String(h?.name||tk),shares:0,book:0,income:0,storedValue:0,accounts:new Set(),rows:[],sector:'',role:''});
  const g=map.get(tk);g.shares+=num(h.shares);g.book+=holdingBook(h);g.income+=holdingIncome(h);g.storedValue+=storedValue(h);g.accounts.add(accountKind(h));g.rows.push(h);if(!g.sector&&h?.sector)g.sector=String(h.sector);if(!g.role&&h?.role)g.role=String(h.role);
 });
 return [...map.values()].map(g=>{
  const m=live.get(g.ticker),price=m?.price??null,change=m?.change??null;
  const value=price!==null?price*g.shares:g.storedValue;
  const move=price!==null&&change!==null?contribution(price,change,g.shares):null;
  const pl=value-g.book,yieldPct=value>0?g.income/value*100:0;
  return {...g,accounts:[...g.accounts],price,change,move,value,pl,plPct:g.book?pl/g.book*100:0,yieldPct,confidence:confidenceMap.has(g.ticker)?confidenceMap.get(g.ticker):null};
 });
}
function totalAnnual(s,groups){const truth=w.AuroraFinancialTruth?.getCurrentAnnualIncome?.(s);return Number.isFinite(Number(truth))?Number(truth):groups.reduce((x,g)=>x+g.income,0)}
function strategy(s){return String(s?.transfer?.settings?.strategy||s?.scouting?.strategy||'sustainable').toLowerCase().includes('max')?'Maximum Income':'Sustainable Income'}
function targetScore(t,s){const max=strategy(s)==='Maximum Income';return num(max?(t?.maximumScore??t?.score??t?.confidence):(t?.sustainableScore??t?.score??t?.confidence))}
function permittedTargets(s){return arr(s?.scouting?.targets).filter(t=>t?.eligibleForTransfer===true&&['PASS','CAUTION'].includes(String(t?.status||'').toUpperCase()))}
function bestTarget(s){return permittedTargets(s).sort((a,b)=>targetScore(b,s)-targetScore(a,s))[0]||null}
function managerAction(s){
 const mission=String(s?.mission?.status||'').toUpperCase();
 if(/REGISTER|EXECUT/.test(mission))return ['Complete registration','Record real broker executions so Squad and Income can update.','registration.html'];
 if(/TRANSFER/.test(mission))return ['Review Transfer','A live mission is waiting for its broker route.','transfer.html'];
 if(/SCOUT/.test(mission))return ['Review Scouting','Scouting owns the evidence gate before money reaches Transfer.','scouting.html'];
 if(/FINANCE/.test(mission))return ['Review Finance','Confirm the released budget before the football operation continues.','finance.html'];
 if(s?.decision?.title)return [String(s.decision.title),String(s.decision.note||'Current Aurora manager instruction.'),'scouting.html'];
 const t=bestTarget(s);if(t)return [`Scouting recommends ${ticker(t.ticker||t.name)}`,`${strategy(s)} • ${targetScore(t,s).toFixed(0)}/100 current opportunity.`,'scouting.html'];
 return ['Hold team shape','No urgent mission gate is currently waiting.','match-report.html'];
}
function sectorName(g){const r=String(g.sector||'Other').toLowerCase();if(/consumer|grocery|staple|defen/.test(r))return'Consumer Defence';if(/reit|property|real estate/.test(r))return'REIT / Property';if(/infra|renew|utilit/.test(r))return'Infrastructure';if(/bdc|credit|lending/.test(r))return'BDC / Credit';if(/financ|bank|insurance/.test(r))return'Financials';if(/housebuilder/.test(r))return'Housebuilders';return g.sector||'Other'}

function parseStamp(v){const s=String(v||'').trim();let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);if(m)return new Date(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0)).getTime();const d=new Date(s);return Number.isNaN(d.getTime())?0:d.getTime()}
function normKey(k){return String(k||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
function rowObj(row){const o={};Object.entries(row||{}).forEach(([k,v])=>o[normKey(k)]=v);return o}
function pick(r,names){for(const n of names){const v=r?.[normKey(n)];if(v!==undefined&&v!==null&&String(v).trim()!=='')return v}return ''}
function rebuildConfidence(){
 const latest=new Map();
 arr(master?.AuroraIntelligence).forEach(row=>{const r=rowObj(row),tk=ticker(pick(r,['ticker','symbol'])),score=raw(pick(r,['confidence_score','confidence']));if(!tk||score===null||score<=0||score>100)return;const stamp=parseStamp(pick(r,['generated_at','updated_at','timestamp']));const old=latest.get(tk);if(!old||stamp>=old.stamp)latest.set(tk,{score,stamp})});
 confidenceMap=new Map([...latest.entries()].map(([k,v])=>[k,v.score]));
}
async function loadMaster(force=false){
 if(master&&!force&&Date.now()-masterAt<20*60*1000)return master;if(masterPromise&&!force)return masterPromise;
 masterPromise=fetch(`AuroraMaster.json?_=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`AuroraMaster ${r.status}`);return r.json()}).then(j=>{master=j;masterAt=Date.now();rebuildConfidence();return j}).catch(err=>{console.warn('Nexus master refresh failed:',err);return master}).finally(()=>{masterPromise=null});return masterPromise;
}

function setText(id,text,cls=''){const el=document.getElementById(id);if(!el)return;el.textContent=text;el.classList.remove('positive','negative','warning');if(cls)el.classList.add(cls)}
function renderHero(s,g){
 const value=g.reduce((x,r)=>x+r.value,0),live=g.filter(r=>r.move!==null),move=live.reduce((x,r)=>x+r.move,0),annual=totalAnnual(s,g),scores=g.map(r=>r.confidence).filter(x=>x!==null),avg=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null,act=managerAction(s);
 setText('portfolioValue',money(value));setText('todayMove',live.length?signedMoney(move):'Awaiting feed',move>0?'positive':move<0?'negative':'');setText('annualIncome',money(annual));setText('monthlyIncome',money(annual/12));setText('squadConfidence',avg!==null?`${avg.toFixed(0)}/100`:'Awaiting scores');setText('marketRegime',String(s?.market?.regime||s?.notifications?.marketState?.regime||'Monitoring'));
 setText('heroVerdict',act[0]);setText('heroVerdictNote',act[1]);const link=document.getElementById('heroAction');if(link)link.href=act[2];
}
function renderIntel(s,g){
 const scored=g.filter(x=>x.confidence!==null),top=[...scored].sort((a,b)=>b.confidence-a.confidence)[0],low=[...scored].sort((a,b)=>a.confidence-b.confidence)[0],restrictions=arr(s?.scouting?.targets).filter(x=>x?.restricted||['BLOCK','BLOCKED','RESTRICTED'].includes(String(x?.status||'').toUpperCase())).length,op=bestTarget(s),total=g.reduce((x,r)=>x+r.value,0),largest=[...g].sort((a,b)=>b.value-a.value)[0],weight=largest&&total?largest.value/total*100:0,act=managerAction(s);
 const fields=[
  ['Manager verdict',act[0],act[1]],
  ['Top confidence',top?`${top.ticker} ${top.confidence.toFixed(0)}/100`:'Not scored',top?'Current Aurora Intelligence confidence':'No genuine score available'],
  ['Lowest confidence',low?`${low.ticker} ${low.confidence.toFixed(0)}/100`:'Not scored',low?'Manager review lens':'No genuine score available'],
  ['Restrictions',String(restrictions),restrictions?'Live Scouting restrictions':'No live restrictions'],
  ['Best permitted',op?`${ticker(op.ticker||op.name)} ${targetScore(op,s).toFixed(0)}/100`:'—',op?'Intelligence 3 Transfer-eligible route':'No Transfer-eligible target'],
  ['Main risk',largest?`${largest.ticker} ${weight.toFixed(1)}% of value`:'—',weight>25?'Concentration review':'Concentration within current shape'],
  ['Buy mode',strategy(s),String(s?.market?.buyMode||s?.scouting?.buyMode||'Current transfer posture')]
 ];
 const host=document.getElementById('intelGrid');if(host)host.innerHTML=fields.map(x=>`<div class="mini"><small>${esc(x[0])}</small><strong>${esc(x[1])}</strong><span>${esc(x[2])}</span></div>`).join('');
}
function currentLens(){return document.querySelector('.lens.active')?.dataset?.lens||'value'}
function lensSort(g,l){
 if(l==='income')return [...g].sort((a,b)=>b.income-a.income);
 if(l==='form')return [...g].sort((a,b)=>{const ae=a.change!==null,be=b.change!==null;if(ae!==be)return be-ae;if(ae&&be&&b.change!==a.change)return b.change-a.change;return b.value-a.value});
 if(l==='risk')return [...g].sort((a,b)=>{const ae=a.confidence!==null,be=b.confidence!==null;if(ae!==be)return be-ae;if(ae&&be&&a.confidence!==b.confidence)return a.confidence-b.confidence;return b.value-a.value});
 return [...g].sort((a,b)=>b.value-a.value);
}
function lensLabel(r,l){if(l==='income')return `${money(r.income)}/yr`;if(l==='form')return r.change!==null?pct(r.change):'Feed pending';if(l==='risk')return r.confidence!==null?`${r.confidence.toFixed(0)}/100`:'Not scored';return money(r.value)}
function installPitchGeometry(){const pitch=document.querySelector('.pitch-panel .pitch');if(!pitch)return;if(!pitch.querySelector('.n2-halfway-line'))pitch.insertAdjacentHTML('afterbegin','<div class="n2-halfway-line"></div><div class="n2-centre-circle"></div><div class="n2-centre-spot"></div><div class="n2-pitch-box top"></div><div class="n2-pitch-box bottom"></div>')}
function renderPitch(g){
 installPitchGeometry();const l=currentLens(),rows=lensSort(g,l).slice(0,11),host=document.getElementById('players'),note=document.getElementById('pitchNote'),context=document.getElementById('lensContext');if(context){const x=lensCopy[l]||lensCopy.value;context.innerHTML=`<b>${x[0]}</b><span>${x[1]}</span>`}
 if(host)host.innerHTML=rows.map((r,i)=>{const p=positions[i],bad=l==='risk'&&r.confidence!==null&&r.confidence<60,review=(l==='form'&&r.change!==null&&r.change<0)||(l==='risk'&&r.confidence!==null&&r.confidence<65),good=l==='form'&&r.change!==null&&r.change>0;return `<button type="button" class="n2-player-node ${bad?'bad':review?'review':good?'good':''}" style="left:${p.left}%;top:${p.top}%" data-n2-player="${esc(r.ticker)}" title="${esc(r.name)}">${i===0?'<span class="n2-player-role-badge">C</span>':i===1?'<span class="n2-player-role-badge vc">VC</span>':''}<span class="n2-player-number">${i+1}</span><b>${esc(r.ticker)}</b><span>${esc(lensLabel(r,l))}</span></button>`}).join('');
 if(note){const evidence=l==='risk'?`${g.filter(x=>x.confidence!==null).length}/${g.length} have current confidence evidence`:`${g.filter(x=>x.change!==null).length}/${g.length} have genuine daily market evidence`;note.innerHTML=`${rows.length} of ${g.length} active securities shown • ${esc((lensCopy[l]||lensCopy.value)[0])} • ${evidence}. <span class="n2-tactical-hint">Tap a player for company analysis</span>`}
}
function renderLeaders(s,g){
 const byValue=[...g].sort((a,b)=>b.value-a.value)[0],byIncome=[...g].sort((a,b)=>b.income-a.income)[0],scored=g.filter(x=>x.confidence!==null),top=[...scored].sort((a,b)=>b.confidence-a.confidence)[0],low=[...scored].sort((a,b)=>a.confidence-b.confidence)[0],op=bestTarget(s);
 const cards=[
  ['Value Leader',byValue,byValue?money(byValue.value):'—','Largest current squad position'],
  ['Income Leader',byIncome,byIncome?`${money(byIncome.income)} / year`:'—','Sets the income tempo'],
  ['Confidence Leader',top,top?`${top.confidence.toFixed(0)}/100`:'Awaiting scores','Current Aurora Intelligence'],
  ['Best Opportunity',op,op?`${targetScore(op,s).toFixed(0)}/100`:'—','Intelligence 3 Transfer-eligible route'],
  ['Needs Attention',low,low?`${low.confidence.toFixed(0)}/100`:'No scored alert','Lowest genuine confidence']
 ];
 const host=document.getElementById('leaderList');if(host)host.innerHTML=cards.map(([label,r,val,note])=>`<div class="leader"><small>${esc(label)}</small><div class="leader-top"><b>${esc(r?.ticker||r?.name||'—')}</b><strong>${esc(val)}</strong></div><p>${esc(r?.name||note)} • ${esc(note)}</p></div>`).join('');
}
function renderMomentum(g){
 const live=g.filter(r=>r.move!==null),total=live.reduce((x,r)=>x+r.move,0),up=live.filter(r=>r.change>0),down=live.filter(r=>r.change<0),best=[...live].sort((a,b)=>b.change-a.change)[0];
 const pulse=document.getElementById('momentumPulse');if(pulse)pulse.innerHTML=`<div class="pulse-main"><small>Today's Portfolio Movement</small><strong class="${total>0?'positive':total<0?'negative':''}">${live.length?signedMoney(total):'Awaiting feed'}</strong><span>${live.length?`LivePrices contribution • ${live.length}/${g.length} unique securities covered`:'No genuine intraday evidence yet'}</span></div><div class="pulse-card"><small>Form leader</small><strong>${best?`${esc(best.ticker)} ${esc(pct(best.change))}`:'Awaiting feed'}</strong></div><div class="pulse-card"><small>Breadth</small><strong>${live.length?`${up.length} up • ${down.length} down${live.length-up.length-down.length?` • ${live.length-up.length-down.length} flat`:''}`:'Unavailable'}</strong></div>`;
 const list=(id,rows,positive)=>{const el=document.getElementById(id);if(!el)return;el.innerHTML=rows.length?rows.sort((a,b)=>positive?b.move-a.move:a.move-b.move).slice(0,6).map(r=>`<div class="contrib-row"><span><b>${esc(r.ticker)}</b> ${esc(pct(r.change))}</span><strong class="${positive?'positive':'negative'}">${esc(signedMoney(r.move))}</strong></div>`).join(''):`<div class="empty">No ${positive?'positive':'negative'} live contribution right now.</div>`};
 list('positiveContrib',live.filter(r=>r.move>0.004),true);list('negativeContrib',live.filter(r=>r.move<-0.004),false);
}
function brokerStats(list,liveMap){
 let value=0,book=0,income=0,move=0,liveCount=0;const securities=new Set();
 list.forEach(h=>{const tk=ticker(h.ticker||h.marketSymbol),shares=num(h.shares),m=liveMap.get(tk),v=m?m.price*shares:storedValue(h),b=holdingBook(h);securities.add(tk);value+=v;book+=b;income+=holdingIncome(h);if(m){const d=contribution(m.price,m.change,shares);if(d!==null){move+=d;liveCount++}}});return{value,book,income,move,pl:value-book,positions:list.length,securities:securities.size,liveCount};
}
function renderBrokers(s){
 const positions=activePositions(s),lm=new Map(marketRows().map(r=>[r.ticker,r])),groups=[['overall','Overall',positions],['ig','IG ISA',positions.filter(h=>accountKind(h)==='IG')],['t212','Trading 212',positions.filter(h=>accountKind(h)==='T212')]],total=brokerStats(positions,lm).value;
 const host=document.getElementById('n2uBrokerGrid');if(!host)return;host.innerHTML=groups.map(([cls,label,list])=>{const x=brokerStats(list,lm),weight=total?x.value/total*100:0;return `<div class="n2u-broker ${cls}"><div class="n2u-broker-head"><b>${esc(label)}</b><span>${x.positions} positions • ${x.securities} securities</span></div><div class="n2u-broker-value">${esc(money(x.value))}</div><div class="n2u-broker-meta"><span>P/L <b class="${x.pl>=0?'positive':'negative'}">${esc(signedMoney(x.pl))}</b></span><span>Today <b class="${x.move>=0?'positive':'negative'}">${x.liveCount?esc(signedMoney(x.move)):'Awaiting'}</b></span></div><div class="n2u-broker-meta"><span>Book ${esc(money(x.book))}</span><span>Income ${esc(money(x.income))}/yr</span></div><div class="n2u-broker-bar"><i style="width:${Math.min(100,weight).toFixed(1)}%"></i></div></div>`}).join('');
}
function routeRows(s){return [s?.transfer?.route?.allocations,s?.transfer?.route?.legs,s?.transfer?.mission?.allocations,s?.transfer?.mission?.legs,s?.transfer?.allocations].flatMap(arr).filter(r=>num(r?.amount??r?.allocationGbp)>0)}
function renderRoute(s){
 const rows=routeRows(s),budget=num(s?.mission?.approvedBudget||s?.transfer?.route?.budget||s?.transfer?.settings?.budget),allocated=rows.reduce((x,r)=>x+num(r?.amount??r?.allocationGbp),0),uplift=rows.reduce((x,r)=>x+num(r?.expectedAnnualIncome??r?.incomeUplift),0),names=rows.map(r=>ticker(r?.ticker||r?.name)).filter(Boolean);
 setText('n2uRouteStrategy',strategy(s));setText('n2uRouteBudget',budget?money(budget):'Awaiting mission');setText('n2uRouteAllocated',money(allocated));setText('n2uRouteBuys',String(rows.length));setText('n2uRouteIncome',uplift?signedMoney(uplift):'—');setText('n2uRouteSummary',rows.length?`${strategy(s)} currently routes ${rows.length} purchase${rows.length===1?'':'s'} — ${names.join(' · ')}. ${Math.max(0,budget-allocated).toLocaleString('en-GB',{style:'currency',currency:'GBP'})} remains unallocated.`:'No live Transfer route is currently built.');
}
function parseDate(v){const s=String(v||'').trim();if(!s)return null;let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return new Date(+m[1],+m[2]-1,+m[3],12);m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);if(m)return new Date(+m[3],+m[2]-1,+m[1],12);const d=new Date(s);return Number.isNaN(d.getTime())?null:d}
function dividendRows(s){const stateRows=arr(s?.income?.calendar);if(stateRows.length)return stateRows;return arr(master?.Dividends)}
function dividendAmount(r){for(const k of ['actualAmountGbp','actual_amount_gbp','amountGbp','expectedAmountGbp','expected_amount_gbp','forecastAmountGbp','gross_dividend_gbp']){const n=raw(r?.[k]);if(n!==null&&n>0)return n}return null}
function dividendDate(r){return parseDate(r?.payDate||r?.paymentDate||r?.pay_date||r?.payment_date||r?.date)}
function upcomingDividends(s){const today=new Date();today.setHours(0,0,0,0);return dividendRows(s).map(r=>({r,d:dividendDate(r),amount:dividendAmount(r)})).filter(x=>x.d&&x.d>=today&&!['PAID','CANCELLED','ARCHIVED'].includes(String(x.r?.status||'').toUpperCase())).sort((a,b)=>a.d-b.d)}
function renderRunway(s){
 const months=Array.from({length:12},(_,i)=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth()+i,1,12)}),events=upcomingDividends(s),totals=months.map(m=>events.filter(e=>e.d.getFullYear()===m.getFullYear()&&e.d.getMonth()===m.getMonth()).reduce((x,e)=>x+(e.amount||0),0));
 const host=document.getElementById('n2uRunway');if(host)host.innerHTML=months.map((m,i)=>`<div class="n2u-month"><small>${m.toLocaleDateString('en-GB',{month:'short'}).toUpperCase()}</small><strong>${totals[i]?esc(money(totals[i])):'—'}</strong><span>${events.filter(e=>e.d.getFullYear()===m.getFullYear()&&e.d.getMonth()===m.getMonth()).length} fixture${events.filter(e=>e.d.getFullYear()===m.getFullYear()&&e.d.getMonth()===m.getMonth()).length===1?'':'s'}</span></div>`).join('');
 const sum=totals.reduce((a,b)=>a+b,0),max=Math.max(...totals),maxI=totals.indexOf(max),nonzero=totals.map((v,i)=>({v,i})).filter(x=>x.v>0),min=nonzero.length?Math.min(...nonzero.map(x=>x.v)):0,minI=nonzero.find(x=>x.v===min)?.i??-1;setText('n2uScheduled',money(sum));setText('n2uBestMonth',max?`${months[maxI].toLocaleDateString('en-GB',{month:'short'}).toUpperCase()} ${money(max)}`:'—');setText('n2uWeakMonth',minI>=0?`${months[minI].toLocaleDateString('en-GB',{month:'short'}).toUpperCase()} ${money(min)}`:'—');setText('n2uCoverage',`${events.length} upcoming fixtures`);
}
function renderLeagues(g){
 const form=document.getElementById('n2uFormTable'),income=document.getElementById('n2uIncomeTable');const row=(r,i,a,b)=>`<div class="n2u-league-row"><span class="n2u-pos">${String(i+1).padStart(2,'0')}</span><span class="n2u-player"><b>${esc(r.ticker)}</b><span>${esc(r.name)}${r.accounts.length>1?` • ${esc(r.accounts.join(' + '))}`:''}</span></span><span class="n2u-league-score">${a}</span><span class="n2u-league-rating">${b}</span></div>`;
 const live=g.filter(r=>r.change!==null).sort((a,b)=>b.change-a.change);if(form)form.innerHTML=live.length?live.slice(0,10).map((r,i)=>row(r,i,`<span class="${r.change>0?'positive':r.change<0?'negative':''}">${esc(pct(r.change))}</span>`,esc(money(r.price)))).join(''):'<div class="n2u-compact-note" style="padding:18px">Awaiting genuine LivePrices movement. Nexus does not manufacture +0.00% form.</div>';
 const inc=[...g].sort((a,b)=>b.income-a.income);if(income)income.innerHTML=inc.slice(0,10).map((r,i)=>row(r,i,esc(money(r.income)),`${r.yieldPct.toFixed(1)}%`)).join('');
}
function renderSectors(g){
 const total=g.reduce((x,r)=>x+r.value,0),map=new Map();g.forEach(r=>{const key=sectorName(r);if(!map.has(key))map.set(key,[]);map.get(key).push(r)});const host=document.getElementById('sectors');if(!host)return;host.innerHTML=[...map.entries()].sort((a,b)=>b[1].reduce((x,r)=>x+r.value,0)-a[1].reduce((x,r)=>x+r.value,0)).map(([name,rows])=>{const value=rows.reduce((x,r)=>x+r.value,0),weight=total?value/total*100:0;return `<article class="panel sector"><div class="sector-head"><b>${esc(name)}</b><strong>${weight.toFixed(1)}%</strong></div><p>${rows.map(r=>esc(r.ticker)).join(' · ')}</p><div class="bar"><i style="width:${Math.min(100,weight)}%"></i></div><span class="warn">${weight>30?'⚠ Concentration review required':weight>20?'Monitor sector concentration':'Diversification within limit'}</span></article>`}).join('');
}
function nextDividendSummary(s){const rows=upcomingDividends(s);if(!rows.length)return null;const date=rows[0].d,same=rows.filter(x=>x.d.toDateString()===date.toDateString()),amount=same.reduce((x,e)=>x+(e.amount||0),0),names=[...new Set(same.map(e=>ticker(e.r?.ticker||e.r?.symbol)).filter(Boolean))];return{date,names,amount}}
function renderIncome(s,g){const annual=totalAnnual(s,g),monthly=annual/12,target=num(s?.income?.settings?.monthlyTarget||s?.income?.monthlyTarget),nd=nextDividendSummary(s);setText('incomeAnnual',money(annual));setText('incomeMonthly',money(monthly));setText('nextDividend',nd?`${nd.names.slice(0,2).join(' + ')}${nd.names.length>2?' + more':''} • ${nd.date.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}${nd.amount?` • ${money(nd.amount)}`:''}`:'No upcoming mapped payment');setText('incomeTarget',target?money(target):'Not set');const bar=document.getElementById('targetProgress');if(bar)bar.style.width=`${target?Math.min(100,monthly/target*100):0}%`;setText('targetMeta',target?`${money(monthly)} of ${money(target)} per month • ${(monthly/target*100).toFixed(1)}%`:'Set the active monthly target in Income Centre.');}
function renderMission(s){const status=String(s?.mission?.status||'WAITING').toUpperCase(),order=['FINANCE_APPROVED','SCOUTING_READY','TRANSFER_READY','REGISTERED'],idx=order.indexOf(status),blocked=/BLOCK|CANCEL|ERROR/.test(status),host=document.getElementById('pipeline');if(host)host.innerHTML=['Finance','Scouting','Transfer','Registration'].map((name,i)=>{const st=blocked&&i===Math.max(0,idx)?'blocked':idx>i||status==='COMPLETE'?'complete':idx===i?'active':'waiting';return `<div class="stage ${st}"><small>0${i+1}</small><b>${name}</b><span>${st}</span></div>`}).join('');const link=document.getElementById('missionLink'),next=Math.max(0,Math.min(3,idx<0?0:idx));if(link)link.href=['finance.html','scouting.html','transfer.html','registration.html'][next]}
function unread(s){return arr(s?.notifications?.records).filter(n=>!n?.read).length}
function renderHealth(s,g){const market=g.filter(r=>r.change!==null).length,conn=String(s?.connection?.status||'LOCAL').toUpperCase(),mission=String(s?.mission?.status||'WAITING'),items=[['AuroraData',conn],['Market data',market?`${market}/${g.length} LIVE`:'AWAITING FEED'],['Financial Truth',w.AuroraFinancialTruth?'CANONICAL':'CHECK'],['Mission state',mission],['Notifications',`${unread(s)} unread`]],host=document.getElementById('healthStrip');if(host)host.innerHTML=items.map(([a,b])=>`<div class="health"><small>${esc(a)}</small><strong class="${/AWAIT|LOCAL|CHECK|WAIT/.test(String(b).toUpperCase())?'check':''}">${esc(b)}</strong></div>`).join('')}
function latestReport(s){return w.AuroraMatchReportPublishedFeed?.latest?.()||s?.matchday?.latest||s?.matchdayReport?.latest||s?.matchdayReport||s?.matchReport?.latest||null}
function reportDate(r){return parseDate(r?.report_date||r?.reportDate||r?.generated_at||r?.generatedAt||r?.created_at||r?.createdAt||r?.date)}
function renderMatchday(s,g){
 const r=latestReport(s),today=new Date(),d=reportDate(r),same=d&&d.toDateString()===today.toDateString(),status=document.getElementById('matchdayStatus'),result=document.getElementById('matchdayResult'),summary=document.getElementById('matchdaySummary');if(!status||!result)return;
 if(same){status.textContent=r?.recovered?'RECOVERED FULL TIME':'PUBLISHED FULL TIME';const p=raw(r?.portfolio_change_pct??r?.portfolioChangePct),gain=raw(r?.portfolio_change_gbp??r?.portfolioChangeGbp);result.textContent=p!==null?`${p>0?'+':''}${p.toFixed(2)}%${gain!==null?` • ${signedMoney(gain)}`:''}`:'Full-time report';result.className=p>0?'positive':p<0?'negative':'';if(summary)summary.textContent=String(r?.summary||r?.manager_report||r?.managerReport||'Today’s published portfolio report.');return}
 if(today.getHours()<17){status.textContent='DUE 5PM';result.textContent='Market in progress';result.className='warning';if(summary)summary.textContent='The published full-time report will appear after the market session.';return}
 const live=arr(g).filter(x=>x?.move!==null&&x?.change!==null&&x?.price!==null&&x?.price>0),complete=g.length>0&&live.length===g.length;
 if(complete){
  const value=live.reduce((x,r)=>x+r.value,0),gain=live.reduce((x,r)=>x+r.move,0),before=value-gain,p=before>0?gain/before*100:null,up=live.filter(x=>x.change>0).length,down=live.filter(x=>x.change<0).length,flat=live.length-up-down,leader=[...live].sort((a,b)=>b.move-a.move)[0],drag=[...live].sort((a,b)=>a.move-b.move)[0];
  status.textContent='RECOVERED LIVE FULL TIME';result.textContent=p!==null?`${p>0?'+':''}${p.toFixed(2)}% • ${signedMoney(gain)}`:signedMoney(gain);result.className=p>0?'positive':p<0?'negative':'';
  if(summary)summary.textContent=`Published MatchdayReport is not currently in Nexus state, so this card is recovered from ${live.length}/${g.length} genuine LivePrices securities: ${up} up, ${down} down, ${flat} flat${leader?` • ${leader.ticker} led`:''}${drag&&drag!==leader?` • ${drag.ticker} was the largest drag`:''}.`;
 }else{
  status.textContent='AWAITING COMPLETE FEED';result.textContent=`${live.length}/${g.length||'—'} securities ready`;result.className='warning';if(summary)summary.textContent='Aurora will not invent a full-time result. Nexus is waiting for complete supported LivePrices or the canonical MatchdayReport.';
 }
}

function ensureDrawer(){if(document.getElementById('n2PlayerDrawer'))return;document.body.insertAdjacentHTML('beforeend','<div class="n2-player-drawer-backdrop" id="n2PlayerDrawerBackdrop" hidden></div><aside class="n2-player-drawer" id="n2PlayerDrawer" aria-hidden="true"><header class="n2-drawer-head"><div><span class="n2-drawer-kicker">Squad analysis</span><h2 id="n2DrawerTitle">Holding</h2><p id="n2DrawerSubtitle">Canonical company view</p></div><button id="n2DrawerClose" type="button" aria-label="Close">×</button></header><div class="n2-drawer-content" id="n2DrawerContent"></div></aside>')}
function scoutingFor(s,tk){return arr(s?.scouting?.targets).find(x=>ticker(x?.ticker||x?.name)===tk)||null}
function openDrawer(tk){const s=state(),g=aggregate(s).find(x=>x.ticker===ticker(tk));if(!s||!g)return;currentDrawerTicker=g.ticker;ensureDrawer();setText('n2DrawerTitle',`${g.ticker} — ${g.name}`);setText('n2DrawerSubtitle',`${g.role||'Squad holding'} • ${sectorName(g)} • ${g.accounts.join(' / ')}`);const scout=scoutingFor(s,g.ticker),score=scout?targetScore(scout,s):null,content=document.getElementById('n2DrawerContent');if(content)content.innerHTML=`<div class="n2-drawer-metrics"><div class="metric"><small>Live price</small><strong>${g.price!==null?esc(money(g.price)):'Feed pending'}</strong></div><div class="metric"><small>Today</small><strong class="${g.change>0?'positive':g.change<0?'negative':''}">${g.change!==null?esc(pct(g.change)):'Feed pending'}</strong></div><div class="metric"><small>Market value</small><strong>${esc(money(g.value))}</strong></div><div class="metric"><small>Shares</small><strong>${g.shares.toLocaleString('en-GB',{maximumFractionDigits:4})}</strong></div><div class="metric"><small>Profit / loss</small><strong class="${g.pl>=0?'positive':'negative'}">${esc(signedMoney(g.pl))} • ${esc(pct(g.plPct))}</strong></div><div class="metric"><small>Annual income</small><strong>${esc(money(g.income))}</strong></div><div class="metric"><small>Dividend yield</small><strong>${g.yieldPct.toFixed(2)}%</strong></div><div class="metric"><small>Confidence</small><strong>${g.confidence!==null?`${g.confidence.toFixed(0)}/100`:'Not scored'}</strong></div></div><div class="n2-drawer-card"><b>Scouting:</b> ${scout?`${esc(scout?.recommendation||scout?.status||'Tracked')} • ${score!==null?`${score.toFixed(0)}/100`:''}`:'No current Scouting target row.'}</div><div class="n2-drawer-card"><b>Manager view:</b> ${g.change!==null&&g.change>0.5?'Strong live form today.':g.change!==null&&g.change<-0.5?'Under pressure in today’s session.':g.pl<0?'Below book cost — monitor rather than chase.':g.income>0?'Established income contributor.':'Current squad holding.'}</div>`;const backdrop=document.getElementById('n2PlayerDrawerBackdrop'),drawer=document.getElementById('n2PlayerDrawer');if(backdrop)backdrop.hidden=false;if(drawer){drawer.classList.add('open');drawer.setAttribute('aria-hidden','false')}}
function closeDrawer(){currentDrawerTicker='';const backdrop=document.getElementById('n2PlayerDrawerBackdrop'),drawer=document.getElementById('n2PlayerDrawer');if(backdrop)backdrop.hidden=true;if(drawer){drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true')}}

function render(){const s=state();if(!s)return;const g=aggregate(s);renderHero(s,g);renderIntel(s,g);renderPitch(g);renderLeaders(s,g);renderMomentum(g);renderBrokers(s);renderRoute(s);renderRunway(s);renderLeagues(g);renderSectors(g);renderIncome(s,g);renderMission(s);renderHealth(s,g);renderMatchday(s,g);if(currentDrawerTicker)openDrawer(currentDrawerTicker);document.body.classList.remove('loading');document.documentElement.dataset.nexusController='canonical'}
function schedule(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render()})}
async function hydrateMaster(force=false){await loadMaster(force);schedule()}
function init(){ensureDrawer();render();hydrateMaster();[250,900,1800].forEach(ms=>setTimeout(schedule,ms));setTimeout(()=>w.AuroraMatchReportPublishedFeed?.refresh?.(),500);document.addEventListener('click',e=>{const lens=e.target.closest('[data-lens]');if(lens){document.querySelectorAll('.lens').forEach(x=>x.classList.toggle('active',x===lens));schedule();return}const player=e.target.closest('[data-n2-player]');if(player){openDrawer(player.dataset.n2Player);return}if(e.target.closest('#n2DrawerClose')||e.target===document.getElementById('n2PlayerDrawerBackdrop'))closeDrawer()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});w.addEventListener('aurora2:state',schedule);w.addEventListener('aurora:market-live',schedule);w.addEventListener('aurora2:match-report-hydrated',schedule);w.addEventListener('aurora2:nexus-hydrated',()=>{schedule();hydrateMaster(true)});document.addEventListener('visibilitychange',()=>{if(!document.hidden){schedule();hydrateMaster();w.AuroraMatchReportPublishedFeed?.refresh?.()}});setInterval(()=>{if(!document.hidden)schedule()},15000);setInterval(()=>{if(!document.hidden)hydrateMaster()},20*60*1000)}
w.AuroraNexusCanonical={build:BUILD,render:schedule,refresh:async()=>{try{await w.AuroraClubCommand?.refreshMarket?.()}catch(_){}try{await w.AuroraMatchReportPublishedFeed?.refresh?.()}catch(_){}await hydrateMaster(true);schedule()},snapshot:()=>{const s=state();return s?aggregate(s):[]}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
