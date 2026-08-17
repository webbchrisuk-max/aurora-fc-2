/* Aurora City FC — Match Report 2.0
 * Canonical base: Aurora2 state + AuroraFinancialTruth.
 * If a published 5pm MatchdayReport is later exposed inside Aurora2 state,
 * supported report fields are preferred without inventing missing values.
 */
(function(w){
  'use strict';
  const A=()=>w.Aurora2;
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[£,%]/g,''));return Number.isFinite(n)?n:NaN};
  const safe=v=>Number.isFinite(v)?v:0;
  const esc=v=>A()?.ui?.escape?.(String(v??''))||String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2}).format(safe(Number(v)));
  const pct=v=>Number.isFinite(v)?`${v>=0?'+':''}${v.toFixed(2)}%`:'—';
  const cleanTicker=v=>String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\.GB$/i,'').toUpperCase().trim();
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

  function active(state){
    return arr(state?.squad?.holdings).filter(h=>
      ['ACTIVE','LOCKED'].includes(String(h?.status||'').toUpperCase()) && safe(num(h?.shares))>0
    );
  }
  function holdingValue(h){
    const direct=num(h?.marketValueGbp??h?.market_value_gbp??h?.marketValue);
    if(Number.isFinite(direct)&&direct>=0)return direct;
    const shares=num(h?.shares),price=num(h?.livePriceGbp??h?.live_price_gbp??h?.price);
    return Number.isFinite(shares)&&Number.isFinite(price)?shares*price:0;
  }
  function holdingIncome(h){
    const direct=num(h?.annualIncomeGbp??h?.annual_income_gbp??h?.annualIncome);
    if(Number.isFinite(direct)&&direct>=0)return direct;
    const shares=num(h?.shares),dps=num(h?.annualDpsGbp??h?.annual_dps_gbp??h?.annualDps);
    return Number.isFinite(shares)&&Number.isFinite(dps)?shares*dps:0;
  }
  function confidence(h){
    for(const key of ['confidence','dataQuality','data_quality','buyStrength','buy_strength']){
      const n=num(h?.[key]);if(Number.isFinite(n))return clamp(n,0,100);
    }
    return NaN;
  }
  function safety(h){
    for(const key of ['dividendSafety','dividend_safety','safety','incomeSafety']){
      const n=num(h?.[key]);if(Number.isFinite(n))return clamp(n,0,100);
    }
    return NaN;
  }
  function dayPct(h){
    for(const key of ['dayChangePct','dailyChangePct','todayChangePct','changePct','day_change_pct']){
      const n=num(h?.[key]);if(Number.isFinite(n))return n;
    }
    const price=num(h?.livePriceGbp??h?.live_price_gbp),prev=num(h?.previousCloseGbp??h?.previous_close_gbp??h?.prevCloseGbp);
    if(Number.isFinite(price)&&Number.isFinite(prev)&&prev>0)return (price-prev)/prev*100;
    return NaN;
  }
  function dayGbp(h){
    for(const key of ['dailyChangeGbp','todayChangeGbp','dayChangeGbp','daily_change_gbp','today_change_gbp']){
      const n=num(h?.[key]);if(Number.isFinite(n))return n;
    }
    const p=dayPct(h),value=holdingValue(h);
    if(Number.isFinite(p)&&value>0&&p>-99.9){
      const before=value/(1+p/100);
      return value-before;
    }
    return NaN;
  }
  function hasDailyEvidence(h){return Number.isFinite(dayGbp(h))||Number.isFinite(dayPct(h))}
  function accountLabel(h){
    const s=String(h?.account||'').toLowerCase();
    if(s.includes('212'))return 'Trading 212';
    if(/\big\b/.test(s)||s.includes('ig isa'))return 'IG ISA';
    return String(h?.account||'—');
  }

  function reportDateValue(report){return report?.report_date||report?.reportDate||report?.created_at||report?.createdAt||report?.timestamp||report?.date||''}
  function reportTime(report){const d=new Date(reportDateValue(report));return Number.isNaN(d.getTime())?0:d.getTime()}
  function publishedReport(state){
    const candidates=[];
    const md=state?.matchday||state?.matchReport||{};
    if(md?.latest)candidates.push(md.latest);
    if(md?.report)candidates.push(md.report);
    candidates.push(...arr(md?.reports),...arr(state?.portfolio?.matchdayReports));
    return candidates.filter(Boolean).sort((a,b)=>reportTime(b)-reportTime(a))[0]||null;
  }
  function reportField(report,...keys){
    if(!report)return undefined;
    for(const key of keys){if(report[key]!==undefined&&report[key]!==null&&String(report[key]).trim()!=='')return report[key]}
    return undefined;
  }

  function metrics(state,holdings,report){
    const evidenced=holdings.filter(hasDailyEvidence);
    const value=holdings.reduce((sum,h)=>sum+holdingValue(h),0)||safe(num(state?.portfolio?.teamValue));
    const directReportGain=num(reportField(report,'portfolio_change_gbp','portfolioChangeGbp'));
    const directReportPct=num(reportField(report,'portfolio_change_pct','portfolioChangePct'));
    const gain=Number.isFinite(directReportGain)?directReportGain:
      (evidenced.length?evidenced.reduce((sum,h)=>sum+safe(dayGbp(h)),0):num(state?.portfolio?.todayChangeGbp??state?.market?.todayChangeGbp));
    const changePct=Number.isFinite(directReportPct)?directReportPct:
      Number.isFinite(gain)&&value>gain&&value-gain>0?gain/(value-gain)*100:NaN;
    const annual=w.AuroraFinancialTruth?.getCurrentAnnualIncome?Math.max(0,safe(w.AuroraFinancialTruth.getCurrentAnnualIncome(state))):holdings.reduce((sum,h)=>sum+holdingIncome(h),0);
    const up=evidenced.filter(h=>(Number.isFinite(dayGbp(h))?dayGbp(h):dayPct(h))>0).length;
    const down=evidenced.filter(h=>(Number.isFinite(dayGbp(h))?dayGbp(h):dayPct(h))<0).length;
    const flat=evidenced.length-up-down;
    return {evidenced,value,gain,changePct,annual,monthly:annual/12,up,down,flat};
  }

  function rating(h){
    if(!hasDailyEvidence(h))return NaN;
    const p=Number.isFinite(dayPct(h))?dayPct(h):holdingValue(h)>0?safe(dayGbp(h))/holdingValue(h)*100:0;
    const c=confidence(h),s=safety(h);
    let result=6.5+clamp(p,-4,4)*.55;
    if(Number.isFinite(c))result+=(c-65)/100;
    if(Number.isFinite(s))result+=(s-65)/120;
    return clamp(result,4.5,9.8);
  }

  function setText(id,value,cls=''){
    const el=$(id);if(!el)return;el.textContent=value;
    if(cls){el.classList.remove('positive','negative');el.classList.add(cls)}
  }
  function setAward(prefix,h,note,forcedRating){
    const name=$(prefix+'Name'),noteEl=$(prefix+'Note'),rate=$(prefix+'Rating');
    if(!h){if(name)name.textContent='Awaiting evidence';if(noteEl)noteEl.textContent=note;if(rate)rate.textContent='—';return}
    if(name)name.textContent=cleanTicker(h.ticker)||h.name||'—';
    if(noteEl)noteEl.textContent=note;
    const r=Number.isFinite(forcedRating)?forcedRating:rating(h);
    if(rate)rate.textContent=Number.isFinite(r)?r.toFixed(1):'—';
  }

  function fullTimeStatus(){
    const d=new Date(),weekday=d.getDay();
    if(weekday===0||weekday===6)return 'LATEST REPORT';
    return d.getHours()>=17?'FULL TIME':'MATCHDAY LIVE';
  }
  function regime(state,report){
    return String(reportField(report,'market_regime','regime')||state?.market?.regime||state?.notifications?.marketState?.regime||'Monitoring');
  }
  function buyMode(state,report){
    return String(reportField(report,'buy_mode','buyMode')||state?.notifications?.marketState?.buyMode||state?.decision?.mode||'Selective accumulation');
  }

  function renderAwards(holdings,m,report){
    const byMove=[...m.evidenced].sort((a,b)=>safe(dayGbp(b))-safe(dayGbp(a)));
    const motm=byMove[0]||null,worst=[...byMove].reverse()[0]||null;
    const incomeStar=[...holdings].sort((a,b)=>holdingIncome(b)-holdingIncome(a))[0]||null;
    const defenders=holdings.filter(h=>!hasDailyEvidence(h)||safe(dayGbp(h))>=0).sort((a,b)=>{
      const as=Number.isFinite(safety(a))?safety(a):Number.isFinite(confidence(a))?confidence(a):0;
      const bs=Number.isFinite(safety(b))?safety(b):Number.isFinite(confidence(b))?confidence(b):0;
      return bs-as||holdingIncome(b)-holdingIncome(a);
    });
    const def=defenders[0]||incomeStar;

    setAward('motm',motm,motm?`${money(dayGbp(motm))} supported contribution today${Number.isFinite(dayPct(motm))?` • ${pct(dayPct(motm))}`:''}.`:'No holding-level daily movement is currently published.');
    setAward('worst',worst,worst?`${money(dayGbp(worst))} supported contribution today${Number.isFinite(dayPct(worst))?` • ${pct(dayPct(worst))}`:''}.`:'No holding-level daily movement is currently published.');
    setAward('income',incomeStar,incomeStar?`${money(holdingIncome(incomeStar))} a year in canonical dividend income.`:'No annual holding income is currently available.',incomeStar?clamp(6.8+holdingIncome(incomeStar)/Math.max(1,m.annual)*3,6.8,9.6):NaN);
    const defEvidence=def&&(Number.isFinite(safety(def))?`Dividend safety ${Math.round(safety(def))}/100.`:Number.isFinite(confidence(def))?`Confidence ${Math.round(confidence(def))}/100.`:`${money(holdingIncome(def))}/yr income with no supported negative move.`);
    setAward('def',def,defEvidence||'Awaiting defensive evidence.',def?clamp(7+(Number.isFinite(safety(def))?safety(def)/100:0),7,9.3):NaN);

    // If a published report explicitly names an award, use that label only.
    const published=[['motm','motm'],['def','def'],['income','income'],['worst','worst']];
    published.forEach(([prefix,key])=>{
      const publishedName=reportField(report,`${key}_name`,`${key}Name`,key);
      if(publishedName&&$(prefix+'Name'))$(prefix+'Name').textContent=String(publishedName);
      const publishedRating=num(reportField(report,`${key}_rating`,`${key}Rating`));
      if(Number.isFinite(publishedRating)&&$(prefix+'Rating'))$(prefix+'Rating').textContent=publishedRating.toFixed(1);
      const publishedNote=reportField(report,`${key}_note`,`${key}Note`);
      if(publishedNote&&$(prefix+'Note'))$(prefix+'Note').textContent=String(publishedNote);
    });
  }

  function renderContributors(m){
    const pos=[...m.evidenced].filter(h=>safe(dayGbp(h))>0).sort((a,b)=>safe(dayGbp(b))-safe(dayGbp(a))).slice(0,5);
    const neg=[...m.evidenced].filter(h=>safe(dayGbp(h))<0).sort((a,b)=>safe(dayGbp(a))-safe(dayGbp(b))).slice(0,5);
    const rows=(list,positive)=>list.map(h=>`<div class="contrib-row"><strong>${esc(cleanTicker(h.ticker))} — ${esc(h.name||cleanTicker(h.ticker))}</strong><span class="${positive?'positive':'negative'}">${safe(dayGbp(h))>=0?'+':''}${money(dayGbp(h))}</span></div>`).join('');
    $('positiveContrib').innerHTML=rows(pos,true)||'<div class="empty">No supported positive holding contribution.</div>';
    $('negativeContrib').innerHTML=rows(neg,false)||'<div class="empty">No supported negative holding contribution.</div>';
  }

  function renderRatings(holdings){
    const rows=[...holdings].sort((a,b)=>{
      const ar=rating(a),br=rating(b);
      if(Number.isFinite(ar)||Number.isFinite(br))return safe(br)-safe(ar);
      return holdingValue(b)-holdingValue(a);
    });
    $('ratingsBody').innerHTML=rows.length?rows.map((h,i)=>{
      const d=dayGbp(h),p=dayPct(h),r=rating(h),s=safety(h);
      return `<tr><td><b>#${i+1}</b></td><td class="holding-name"><strong>${esc(cleanTicker(h.ticker))}</strong><span>${esc(h.name||h.ticker)}</span></td><td><span class="account-chip">${esc(accountLabel(h))}</span></td><td>${money(holdingValue(h))}</td><td class="move ${Number.isFinite(d)?d>0?'positive':d<0?'negative':'':''}">${Number.isFinite(d)?`${d>=0?'+':''}${money(d)}`:'—'}</td><td class="${Number.isFinite(p)?p>0?'positive':p<0?'negative':'':''}">${pct(p)}</td><td>${money(holdingIncome(h))}/yr</td><td>${Number.isFinite(s)?Math.round(s)+'/100':'—'}</td><td><span class="player-rating">${Number.isFinite(r)?r.toFixed(1):'—'}</span><div class="rating-bar"><i style="width:${Number.isFinite(r)?r*10:0}%"></i></div></td></tr>`;
    }).join(''):'<tr><td colspan="9"><div class="empty">No active canonical holdings are loaded.</div></td></tr>';
  }

  function nextDividend(state){
    const direct=state?.income?.nextDividend;
    if(direct)return direct;
    const now=Date.now()-86400000;
    return arr(state?.income?.calendar).filter(x=>{
      const d=new Date(x?.payDate||x?.pay_date||x?.exDate||x?.ex_date||'');
      return !Number.isNaN(d.getTime())&&d.getTime()>=now&&!['PAID','CANCELLED','ARCHIVED'].includes(String(x?.status||'').toUpperCase());
    }).sort((a,b)=>new Date(a.payDate||a.pay_date||a.exDate||a.ex_date)-new Date(b.payDate||b.pay_date||b.exDate||b.ex_date))[0]||null;
  }
  function dividendDescription(d){
    if(!d)return 'No upcoming dividend event is currently loaded.';
    const date=d.payDate||d.pay_date||d.exDate||d.ex_date||d.date;
    const amount=num(d.amount??d.expectedAmountGbp??d.expected_amount_gbp);
    return `${cleanTicker(d.ticker)||'Dividend'}${date?` • ${new Date(date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`:''}${Number.isFinite(amount)?` • ${money(amount)}`:''}`;
  }

  function renderWatch(state,holdings,m,report){
    const worst=[...m.evidenced].sort((a,b)=>safe(dayGbp(a))-safe(dayGbp(b)))[0];
    const next=nextDividend(state);
    const macro=reportField(report,'macro_watch','macroWatch')||state?.notifications?.marketState?.note||state?.notifications?.marketState?.detail||`Market regime: ${regime(state,report)}.`;
    const reportWatch=reportField(report,'one_to_watch','oneToWatch');
    const calendarWatch=reportField(report,'calendar_watch','calendarWatch');
    const route=state?.transfer?.route;
    const routeText=route?`${String(route.strategy||'sustainable').toLowerCase()==='maximum'?'Maximum Income':'Sustainable Income'} • ${arr(route.allocations).filter(a=>safe(num(a.amount))>0).length} proposed buys.`:'No live Transfer route requiring review.';
    $('watchItems').innerHTML=[
      ['👀','One to watch',reportWatch|| (worst?`${cleanTicker(worst.ticker)} is today's weakest supported contributor at ${money(dayGbp(worst))}.`:'No weakest holding can be named without daily evidence.')],
      ['📅','Dividend calendar',calendarWatch||dividendDescription(next)],
      ['🌍','Macro / market',String(macro)],
      ['🔄','Transfer desk',routeText]
    ].map(([icon,title,text])=>`<div class="watch"><i>${icon}</i><div><strong>${esc(title)}</strong><span>${esc(text)}</span></div></div>`).join('');
  }

  function historyRows(state){
    return [...arr(state?.portfolio?.history),...arr(state?.market?.history)].map((row,index)=>{
      const change=num(row?.changeGbp??row?.todayChangeGbp??row?.dayChangeGbp??row?.change);
      const p=num(row?.changePct??row?.dayChangePct??row?.pct);
      const date=new Date(row?.date||row?.timestamp||row?.createdAt||0);
      return {change,p,date,index};
    }).filter(x=>Number.isFinite(x.change)||Number.isFinite(x.p)).sort((a,b)=>(b.date?.getTime()||b.index)-(a.date?.getTime()||a.index)).slice(0,7).reverse();
  }
  function renderForm(state){
    const rows=historyRows(state);
    $('formRow').innerHTML=rows.length?rows.map(x=>{
      const score=Number.isFinite(x.change)?x.change:x.p;
      const result=score>0?'W':score<0?'L':'D';
      const label=!Number.isNaN(x.date.getTime())?x.date.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}):'Session';
      const value=Number.isFinite(x.change)?`${x.change>=0?'+':''}${money(x.change)}`:pct(x.p);
      return `<div class="form-chip ${result==='W'?'win':result==='L'?'loss':'draw'}"><b>${esc(label)} <em>${result}</em></b><span>${esc(value)}</span></div>`;
    }).join(''):'<div class="empty">Recent portfolio session history is still building.</div>';
  }

  function render(){
    if(!A()?.core)return;
    const state=A().core.read(),holdings=active(state),report=publishedReport(state),m=metrics(state,holdings,report);
    const resultClass=Number.isFinite(m.gain)?m.gain>0?'positive':m.gain<0?'negative':'':'';
    setText('portfolioValue',money(m.value));
    setText('dayGain',Number.isFinite(m.gain)?`${m.gain>=0?'+':''}${money(m.gain)}`:'Awaiting feed',resultClass);
    setText('annualIncome',money(m.annual));setText('monthlyIncome',money(m.monthly));
    setText('breadth',m.evidenced.length?`${m.up} ↑ • ${m.down} ↓`:'Awaiting feed');
    setText('marketRegime',regime(state,report));
    setText('resultPct',pct(m.changePct));
    $('scoreOrb')?.classList.toggle('loss',Number.isFinite(m.changePct)&&m.changePct<0);
    setText('matchStatus',fullTimeStatus());
    setText('upCount',m.evidenced.length?String(m.up):'—');setText('downCount',m.evidenced.length?String(m.down):'—');setText('flatCount',m.evidenced.length?String(m.flat):'—');setText('coverageCount',`${m.evidenced.length}/${holdings.length}`);

    const publishedSummary=reportField(report,'summary','result_summary','resultSummary');
    const summary=publishedSummary||(!m.evidenced.length?'Aurora has the canonical squad and income truth, but holding-level daily market movement has not been published yet.':m.gain>0?`Full time: Aurora finished the session ${money(Math.abs(m.gain))} higher, with ${m.up} holdings up and ${m.down} down.`:m.gain<0?`Full time: Aurora finished the session ${money(Math.abs(m.gain))} lower. The report identifies the main drag and keeps the income line in view.`:`Full time: the supported squad movement finished broadly flat.`);
    setText('reportSummary',String(summary));

    const managerReport=reportField(report,'manager_report','managerReport');
    const verdict=reportField(report,'verdict')||state?.decision?.title||'Hold team shape';
    const note=managerReport||state?.decision?.note||'No urgent manager instruction is currently published.';
    setText('decisionTitle',String(verdict).replace(/[?_]+/g,' ').trim().toUpperCase());
    setText('decisionNote',String(note));
    setText('managerHeadline',m.evidenced.length?`${pct(m.changePct)} • ${money(m.gain)} session • ${m.up} up / ${m.down} down • ${money(m.annual)}/yr income.`:'Daily market evidence is still loading; canonical portfolio value and income remain available.');
    setText('regimeReadout',regime(state,report));setText('buyMode',buyMode(state,report));
    const conf=holdings.map(confidence).filter(Number.isFinite);
    setText('confidenceReadout',conf.length?`${(conf.reduce((a,b)=>a+b,0)/conf.length).toFixed(0)}/100`:'Awaiting scores');

    renderAwards(holdings,m,report);renderContributors(m);renderRatings(holdings);renderWatch(state,holdings,m,report);renderForm(state);
    const connection=String(state?.connection?.status||'LOCAL').toUpperCase();
    setText('reportState',`● ${['LIVE','CONNECTED'].includes(connection)?'CLUB SYSTEMS LIVE':'AURORA 2 STATE'}`);
  }

  async function refresh(){
    const button=$('refreshReport');if(button){button.disabled=true;button.textContent='Refreshing…'}
    try{if(w.AuroraData2Client?.health)await w.AuroraData2Client.health().catch(()=>null);render()}
    finally{if(button){button.disabled=false;button.textContent='Refresh'}}
  }

  document.addEventListener('DOMContentLoaded',render);
  w.addEventListener('aurora2:state',render);
  $('refreshReport')?.addEventListener('click',refresh);
})(window);
