/* Aurora City FC — Nexus V2 data-quality guard v1.0
 * Corrects blank-string market/score fields that JavaScript Number('') treats as zero.
 * Squad-level football views aggregate the same ticker across brokers into one player.
 * Broker panels remain account-specific and untouched.
 */
(function(w){
'use strict';
if(w.__AURORA_NEXUS_V2_DATA_QUALITY__)return;
w.__AURORA_NEXUS_V2_DATA_QUALITY__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

const arr=v=>Array.isArray(v)?v:[];
const rawNumber=v=>{
  if(v===null||v===undefined)return null;
  if(typeof v==='string'&&v.trim()==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
};
const num=v=>rawNumber(v)??0;
const esc=v=>w.Aurora2?.ui?.escape?.(v)||String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>w.Aurora2?.ui?.money?.(v)||new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(num(v));
const active=s=>arr(s?.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase())&&num(h?.shares)>0);
const ticker=h=>String(h?.ticker||h?.name||'UNKNOWN').trim().toUpperCase();
const value=h=>num(h?.marketValueGbp)||(num(h?.shares)*num(h?.livePriceGbp))||num(h?.bookCostGbp);
const book=h=>num(h?.bookCostGbp)||(num(h?.shares)*num(h?.avgCostGbp));
const income=h=>num(h?.annualIncomeGbp)||(num(h?.shares)*num(h?.annualDpsGbp));
const accountLabel=h=>{const a=String(h?.account||h?.platform||'').toLowerCase();return a.includes('212')?'T212':a.includes('ig')?'IG':String(h?.account||'OTHER').toUpperCase()};

function firstNumber(obj,keys){
  for(const k of keys){const n=rawNumber(obj?.[k]);if(n!==null)return n;}
  return null;
}
function dayGbp(h){return firstNumber(h,['dailyChangeGbp','todayChangeGbp','dayChangeGbp']);}
function dayPct(h){
  const direct=firstNumber(h,['dailyChangePct','todayChangePct','dayChangePct']);
  if(direct!==null)return direct;
  const d=dayGbp(h),mv=value(h);
  if(d===null)return null;
  const base=mv-d;
  return base?d/base*100:0;
}
function scoreValue(h){return firstNumber(h,['confidence','score','auroraScore','qualityScore','dataQuality']);}
function hasMarket(h){return dayGbp(h)!==null||dayPct(h)!==null;}

function aggregate(rows){
  const map=new Map();
  rows.forEach(h=>{
    const key=ticker(h);
    if(!map.has(key))map.set(key,{ticker:key,name:h?.name||key,shares:0,marketValueGbp:0,bookCostGbp:0,annualIncomeGbp:0,dayChangeGbp:0,dayEvidence:false,pctNumerator:0,pctWeight:0,scores:[],accounts:new Set(),rows:[]});
    const g=map.get(key),v=value(h),d=dayGbp(h),p=dayPct(h),sc=scoreValue(h);
    g.rows.push(h);g.shares+=num(h?.shares);g.marketValueGbp+=v;g.bookCostGbp+=book(h);g.annualIncomeGbp+=income(h);g.accounts.add(accountLabel(h));
    if(d!==null){g.dayChangeGbp+=d;g.dayEvidence=true;}
    if(p!==null){const wt=Math.max(1,v);g.pctNumerator+=p*wt;g.pctWeight+=wt;g.dayEvidence=true;}
    if(sc!==null)g.scores.push(sc);
  });
  return [...map.values()].map(g=>{
    g.dayChangePct=g.pctWeight?g.pctNumerator/g.pctWeight:(g.dayEvidence&&g.marketValueGbp-g.dayChangeGbp?g.dayChangeGbp/(g.marketValueGbp-g.dayChangeGbp)*100:null);
    g.confidence=g.scores.length?g.scores.reduce((a,b)=>a+b,0)/g.scores.length:null;
    g.accounts=[...g.accounts];
    g.yieldPct=g.marketValueGbp?g.annualIncomeGbp/g.marketValueGbp*100:0;
    return g;
  });
}

function currentLens(){return document.querySelector('.lens.active')?.dataset?.lens||'value';}
function lensScore(h,l){
  if(l==='income')return h.annualIncomeGbp;
  if(l==='form')return h.dayEvidence?(h.dayChangePct??0):-1e9+h.marketValueGbp/1e9;
  if(l==='risk')return h.confidence!==null?100-h.confidence:h.marketValueGbp/1000;
  return h.marketValueGbp;
}
function lensLabel(h,l){
  if(l==='income')return `${money(h.annualIncomeGbp)}/yr`;
  if(l==='form')return h.dayEvidence?`${(h.dayChangePct??0)>=0?'+':''}${(h.dayChangePct??0).toFixed(2)}%`:'Market feed pending';
  if(l==='risk')return h.confidence!==null?`${h.confidence.toFixed(0)}/100 confidence`:'Not scored';
  return money(h.marketValueGbp);
}

function renderStartingXI(groups){
  const target=document.getElementById('players'),note=document.getElementById('pitchNote');if(!target)return;
  const l=currentLens(),selected=[...groups].sort((a,b)=>lensScore(b,l)-lensScore(a,l)).slice(0,11);
  target.innerHTML=selected.length?selected.map((h,i)=>{
    const good=l==='form'&&h.dayEvidence&&(h.dayChangePct??0)>0;
    const risk=l==='risk'&&h.confidence!==null&&h.confidence<60;
    return `<div class="player ${risk?'risk':good?'good':''}" style="order:${i}"><div class="shirt">${i+1}</div><strong>${esc(h.ticker)}</strong><span>${esc(lensLabel(h,l))}</span></div>`;
  }).join(''):'<div class="empty">No active holdings are available in canonical squad state.</div>';
  if(note){const covered=groups.filter(h=>h.dayEvidence).length;note.textContent=`${selected.length} of ${groups.length} active securities shown • ${l.charAt(0).toUpperCase()+l.slice(1)} lens • ${covered}/${groups.length} have genuine daily market evidence. Same ticker across brokers is one squad player.`;}
}

function leagueRow(pos,h,scoreText,ratingText){
  const acc=h.accounts.length>1?` • ${h.accounts.join(' + ')}`:'';
  return `<div class="n2u-league-row"><span class="n2u-pos">${String(pos).padStart(2,'0')}</span><div class="n2u-player"><b>${esc(h.ticker)}</b><span>${esc(h.name||h.ticker)}${esc(acc)}</span></div><span class="n2u-league-score">${scoreText}</span><span class="n2u-league-rating">${ratingText}</span></div>`;
}
function renderLeagues(groups){
  const form=document.getElementById('n2uFormTable'),inc=document.getElementById('n2uIncomeTable');
  if(form){
    const evidence=groups.filter(h=>h.dayEvidence).sort((a,b)=>(b.dayChangePct??0)-(a.dayChangePct??0));
    form.innerHTML=evidence.length?evidence.slice(0,10).map((h,i)=>{
      const p=h.dayChangePct??0, rating=Math.max(1,Math.min(10,6+p*1.6));
      return leagueRow(i+1,h,`${p>=0?'+':''}${p.toFixed(2)}%`,rating.toFixed(1));
    }).join(''):'<div class="n2u-compact-note" style="padding:18px">Awaiting a genuine daily market feed. Blank market fields are no longer treated as +0.00% form.</div>';
  }
  if(inc){
    const ranked=[...groups].sort((a,b)=>b.annualIncomeGbp-a.annualIncomeGbp);
    inc.innerHTML=ranked.slice(0,10).map((h,i)=>leagueRow(i+1,h,money(h.annualIncomeGbp),`${h.yieldPct.toFixed(1)}%`)).join('');
  }
}

function renderMatch(groups){
  const evidence=groups.filter(h=>h.dayEvidence),result=document.getElementById('n2uResult');
  if(!result)return;
  if(!evidence.length){
    result.textContent='AWAITING MARKET';result.classList.remove('good','bad','draw');result.classList.add('draw');
    const summary=document.getElementById('n2uMatchSummary');if(summary)summary.textContent='The portfolio result will publish when Aurora receives genuine daily movement evidence. Blank fields are not counted as a draw.';
    ['n2uAdvancers','n2uDecliners','n2uMotm','n2uDrag'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='—';});
    const status=document.getElementById('n2uMatchStatus');if(status)status.textContent='AWAITING FEED';
    return;
  }
  const total=evidence.reduce((x,h)=>x+h.dayChangeGbp,0),adv=evidence.filter(h=>h.dayChangeGbp>0),dec=evidence.filter(h=>h.dayChangeGbp<0),best=[...evidence].sort((a,b)=>b.dayChangeGbp-a.dayChangeGbp)[0],worst=[...evidence].sort((a,b)=>a.dayChangeGbp-b.dayChangeGbp)[0];
  result.textContent=`${total>0?'WIN':total<0?'DEFEAT':'DRAW'} ${total>=0?'+':''}${money(total)}`;result.classList.remove('good','bad','draw');result.classList.add(total>0?'good':total<0?'bad':'draw');
  const summary=document.getElementById('n2uMatchSummary');if(summary)summary.textContent=`Aurora City FC have ${adv.length} advancer${adv.length===1?'':'s'} against ${dec.length} decliner${dec.length===1?'':'s'} in the current session.`;
  const vals={n2uAdvancers:String(adv.length),n2uDecliners:String(dec.length),n2uMotm:best?.ticker||'—',n2uDrag:worst?.ticker||'—'};Object.entries(vals).forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.textContent=v;});
}

function renderLeaders(groups){
  const leaderList=document.getElementById('leaderList');if(!leaderList)return;
  const byValue=[...groups].sort((a,b)=>b.marketValueGbp-a.marketValueGbp)[0],byIncome=[...groups].sort((a,b)=>b.annualIncomeGbp-a.annualIncomeGbp)[0],scored=groups.filter(h=>h.confidence!==null),topScore=[...scored].sort((a,b)=>b.confidence-a.confidence)[0],lowScore=[...scored].sort((a,b)=>a.confidence-b.confidence)[0];
  const s=w.Aurora2?.core?.read?.()||{},permitted=arr(s?.scouting?.targets).filter(x=>!x?.restricted&&!['BLOCKED','RESTRICTED','REJECTED'].includes(String(x?.status||'').toUpperCase())).sort((a,b)=>num(b?.score||b?.confidence)-num(a?.score||a?.confidence))[0];
  const cards=[
    ['Value Leader',byValue,byValue?money(byValue.marketValueGbp):'—','Largest current squad position'],
    ['Income Leader',byIncome,byIncome?`${money(byIncome.annualIncomeGbp)} / year`:'—','Sets the income tempo'],
    ['Confidence Leader',topScore,topScore?`${topScore.confidence.toFixed(0)}/100`:'Not scored','No false zero scores'],
    ['Best Opportunity',permitted,permitted?`${num(permitted.score||permitted.confidence).toFixed(0)}/100`:'—','Permitted scouting route'],
    ['Needs Attention',lowScore,lowScore?`${lowScore.confidence.toFixed(0)}/100`:'Not scored','Awaiting genuine confidence evidence']
  ];
  leaderList.innerHTML=cards.map(([label,h,val,note])=>`<div class="leader"><small>${esc(label)}</small><div class="leader-top"><b>${esc(h?.ticker||'—')}</b><strong>${esc(val)}</strong></div><p>${esc(h?.name||note)} • ${esc(note)}</p></div>`).join('');
}

function patchTouchline(groups){
  const scored=groups.filter(h=>h.confidence!==null),top=[...scored].sort((a,b)=>b.confidence-a.confidence)[0],low=[...scored].sort((a,b)=>a.confidence-b.confidence)[0];
  document.querySelectorAll('#intelGrid .mini').forEach(card=>{
    const label=String(card.querySelector('small')?.textContent||'').trim().toLowerCase(),strong=card.querySelector('strong'),span=card.querySelector('span');
    if(!strong)return;
    if(label==='top confidence'){strong.textContent=top?.ticker||'Not scored';if(span)span.textContent=top?`${top.confidence.toFixed(0)}/100 squad score`:'No genuine holding confidence score is available.';}
    if(label==='lowest confidence'){strong.textContent=low?.ticker||'Not scored';if(span)span.textContent=low?`${low.confidence.toFixed(0)}/100 — review form`:'No genuine holding confidence score is available.';}
  });
}

function patchHealth(groups){
  const live=groups.some(h=>h.dayEvidence);
  document.querySelectorAll('#healthStrip .health').forEach(card=>{
    if(String(card.querySelector('small')?.textContent||'').trim().toLowerCase()!=='market data')return;
    const strong=card.querySelector('strong');if(!strong)return;strong.textContent=live?'LIVE':'AWAITING FEED';strong.classList.toggle('check',!live);
  });
}

function patchCommand(groups){
  const live=groups.filter(h=>h.dayEvidence),copy=document.getElementById('n2uCommandCopy');
  if(copy){const strategy=String(w.Aurora2?.core?.read?.()?.transfer?.settings?.strategy||'sustainable').toLowerCase()==='maximum'?'Maximum Income':'Sustainable Income';copy.textContent=`${groups.length} active securities • ${strategy} • ${live.length}/${groups.length} securities have genuine daily market evidence.`;}
  if(!live.length){const today=document.getElementById('n2uToday');if(today)today.textContent='Awaiting feed';const form=document.getElementById('n2uFormLeader');if(form)form.textContent='Awaiting feed';const meta=document.getElementById('n2uFormLeaderMeta');if(meta)meta.textContent='No genuine daily movement yet';}
}

function render(){
  const s=w.Aurora2?.core?.read?.();if(!s)return;
  const groups=aggregate(active(s));
  renderStartingXI(groups);renderLeagues(groups);renderMatch(groups);renderLeaders(groups);patchTouchline(groups);patchHealth(groups);patchCommand(groups);
}
function init(){render();document.addEventListener('click',e=>{if(e.target.closest('[data-lens]'))setTimeout(render,0)});w.addEventListener('aurora2:state',()=>setTimeout(render,0));setTimeout(render,350);setTimeout(render,1300);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
