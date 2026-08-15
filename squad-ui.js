
(function(){
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const label=document.getElementById('currentDepartment');
  if(label)label.textContent='SQUAD HUB • FIRST TEAM';
  document.title='Aurora City FC — Squad Hub';
});
})();


/* =========================================================
   SQUAD UI v1 — FIRST TEAM COMMAND
   Reads Aurora2.squad.metrics(); does not replace Squad maths.
   ========================================================= */
(function(){
'use strict';

const A=()=>window.Aurora2;
const $=id=>document.getElementById(id);
const num=v=>{
  const n=Number(String(v??'').replace(/[£,%]/g,'').replace(/,/g,''));
  return Number.isFinite(n)?n:0;
};
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(num(v));
const esc=v=>String(v??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};

function state(){
  try{return A()?.core?.read?.()||{}}catch(_){return {}}
}
function metrics(){
  try{
    const s=state();
    return A()?.squad?.metrics?.(s)||null;
  }catch(_){return null}
}
function accountName(v){
  const s=String(v||'').toLowerCase();
  if(s.includes('212'))return 'Trading 212 ISA';
  if(s==='ig'||s.includes('ig isa'))return 'IG ISA';
  return 'Account Review';
}
function grouped(m){
  if(!m?.byTicker)return [];
  try{return [...m.byTicker.values()]}catch(_){return []}
}
function profitOf(x){return num(x?.value)-num(x?.book)}
function pct(v){return `${num(v).toFixed(1)}%`}

function setLeader(prefix,row,valueText,meta){
  set(`${prefix}`,row?.ticker||'—');
  set(`${prefix}Value`,row?valueText:'—');
  set(`${prefix}Meta`,row?meta:'No canonical player available');
}
function topRows(m){
  return grouped(m).sort((a,b)=>num(b.value)-num(a.value));
}

function renderLeadership(m){
  const rows=grouped(m);
  const byValue=rows.slice().sort((a,b)=>num(b.value)-num(a.value));
  const byIncome=rows.slice().sort((a,b)=>num(b.income)-num(a.income));
  const byProfit=rows.slice().sort((a,b)=>profitOf(b)-profitOf(a));
  const byDrag=rows.slice().sort((a,b)=>profitOf(a)-profitOf(b));

  const value=byValue[0]||null;
  const income=byIncome[0]||null;
  const profit=byProfit[0]||null;
  const drag=(byDrag[0]&&profitOf(byDrag[0])<0)?byDrag[0]:null;

  setLeader(
    'squad3ValueCaptain',
    value,
    money(value?.value),
    value&&m.value>0?`${pct(num(value.value)/num(m.value)*100)} of total Squad value`:'Largest canonical holding'
  );
  setLeader(
    'squad3IncomeCaptain',
    income,
    money(income?.income),
    income&&m.income>0?`${pct(num(income.income)/num(m.income)*100)} of annual Squad income`:'Largest income contributor'
  );
  setLeader(
    'squad3ProfitLeader',
    profit,
    `${profitOf(profit)>=0?'+':''}${money(profitOf(profit))}`,
    profit?'Market value minus canonical book cost':'No canonical player available'
  );
  setLeader(
    'squad3Drag',
    drag,
    drag?money(profitOf(drag)):'NO DRAG',
    drag?'Largest negative book-to-market contribution':'No player is currently below book cost'
  );
}

function renderCore(m){
  const rows=topRows(m).slice(0,5);
  set('squad3CoreMeta',`${rows.length} core player${rows.length===1?'':'s'}`);

  const host=$('squad3CoreList');
  if(!host)return;
  if(!rows.length){
    host.innerHTML='<div class="empty">No active canonical holdings are available yet.</div>';
    return;
  }

  host.innerHTML=rows.map((x,i)=>{
    const valueShare=m.value>0?num(x.value)/num(m.value)*100:0;
    const incomeShare=m.income>0?num(x.income)/num(m.income)*100:0;
    const pl=profitOf(x);
    return `<article class="squad3-core-row" data-squad-ticker="${esc(x.ticker)}">
      <div class="squad3-core-rank">${i+1}</div>
      <div class="squad3-core-copy">
        <strong>${esc(x.ticker)} — ${esc(x.name||x.ticker)}</strong>
        <span>${money(x.value)} value • ${money(x.income)}/yr income • ${pl>=0?'+':''}${money(pl)} P/L</span>
      </div>
      <div class="squad3-core-progress">
        <span><b>Squad value</b><em>${valueShare.toFixed(1)}%</em></span>
        <div class="squad3-core-bar"><i style="width:${Math.min(100,valueShare).toFixed(1)}%"></i></div>
      </div>
      <div class="squad3-core-side">
        <strong>${money(x.income)}/yr</strong>
        <span>${incomeShare.toFixed(1)}% of income</span>
      </div>
    </article>`;
  }).join('');
}

function brokerRows(m){
  // Existing Squad account totals are authoritative for broker values.
  const rows=[
    {name:'IG ISA',value:num($('igValue')?.textContent),meta:$('igMeta')?.textContent||''},
    {name:'Trading 212 ISA',value:num($('t212Value')?.textContent),meta:$('t212Meta')?.textContent||''},
    {name:'Account Review',value:num($('reviewValue')?.textContent),meta:$('reviewMeta')?.textContent||''}
  ].filter(x=>x.value>0||!/^0 /.test(x.meta));
  const total=rows.reduce((s,x)=>s+x.value,0)||num(m?.value);
  return {rows,total};
}
function renderBrokers(m){
  const host=$('squad3BrokerBars');
  if(!host)return;
  const {rows,total}=brokerRows(m);
  if(!rows.length){
    host.innerHTML='<div class="empty">No broker-scoped Squad positions.</div>';
    return;
  }
  host.innerHTML=rows.map(x=>{
    const share=total>0?x.value/total*100:0;
    return `<div class="squad3-bar-row">
      <div class="squad3-bar-copy">
        <strong>${esc(x.name)}</strong>
        <span>${money(x.value)} • ${esc(x.meta)}</span>
        <div class="squad3-bar"><i style="width:${Math.min(100,share).toFixed(1)}%"></i></div>
      </div>
      <b>${share.toFixed(1)}%</b>
    </div>`;
  }).join('');
}

function structuralData(m){
  const active=Array.isArray(m?.active)?m.active:[];
  const locked=active.filter(h=>h?.locked||String(h?.status||'').toUpperCase()==='LOCKED').length;
  const review=active.filter(h=>accountName(h?.account)==='Account Review').length;

  const uniqueByTicker=new Map();
  active.forEach(h=>{
    const t=String(h?.ticker||'').toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'');
    if(!t)return;
    const old=uniqueByTicker.get(t)||{};
    uniqueByTicker.set(t,{...old,...h,ticker:t,sector:old.sector||h?.sector||''});
  });

  const unique=[...uniqueByTicker.values()];
  const missingSector=unique.filter(h=>!String(h?.sector||'').trim()).length;
  const missingIncome=unique.filter(h=>num(h?.annualIncomeGbp)<=0&&num(h?.annualDpsGbp)<=0).length;
  const metadata=missingSector+missingIncome;

  const sectors=new Map();
  unique.forEach(h=>{
    const sector=String(h?.sector||'Unclassified').trim()||'Unclassified';
    sectors.set(sector,(sectors.get(sector)||0)+1);
  });
  const sectorRows=[...sectors.entries()]
    .map(([name,count])=>({name,count}))
    .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));

  return {locked,review,missingSector,missingIncome,metadata,sectors:sectorRows,unique};
}
function renderBalance(m){
  const rows=topRows(m);
  const top5=rows.slice(0,5).reduce((s,x)=>s+num(x.value),0);
  const concentration=m.value>0?top5/num(m.value)*100:0;
  const d=structuralData(m);

  set('squad3Top5Concentration',pct(concentration));
  set('squad3Locked',String(d.locked));
  set('squad3Review',String(d.review));
  set('squad3Metadata',String(d.metadata));

  const host=$('squad3SectorList');
  if(host){
    if(!d.sectors.length){
      host.innerHTML='<div class="empty">No sector metadata available.</div>';
    }else{
      host.innerHTML=d.sectors.slice(0,6).map(x=>`
        <div class="squad3-sector-row">
          <div><strong>${esc(x.name)}</strong><span>${x.count} player${x.count===1?'':'s'}</span></div>
          <b>${x.count}</b>
        </div>`).join('');
    }
  }
  renderBrokers(m);
  return d;
}

function openTab(id){
  document.querySelector(`.squad-tabs [data-tab="${id}"]`)?.click();
}
function filterTicker(ticker){
  openTab('squadPanel');
  const input=$('holdingSearch');
  if(input){
    input.value=ticker;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  setTimeout(()=>$('holdingGrid')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
}


const squad4Formation=[
  ['ST',50,13],
  ['LW',19,29],['RW',81,29],
  ['LCM',27,48],['CM',50,53],['RCM',73,48],
  ['LB',16,71],['LCB',38,78],['RCB',62,78],['RB',84,71],
  ['GK',50,91]
];

function accountsForTicker(m,ticker){
  const names=new Set(
    (Array.isArray(m?.active)?m.active:[])
      .filter(h=>String(h?.ticker||'').toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'')===ticker)
      .map(h=>accountName(h?.account))
  );
  return [...names].join(' + ')||'Squad';
}

function renderValueXI(m){
  const pitch=$('squad4Field'),bench=$('squad4BenchList');
  if(!pitch||!bench)return;

  // Use Squad's own grouped ticker metrics: one company = one player.
  const players=grouped(m)
    .slice()
    .sort((a,b)=>num(b.value)-num(a.value)||String(a.ticker).localeCompare(String(b.ticker)));

  const starters=players.slice(0,11);
  const subs=players.slice(11);

  const xiValue=starters.reduce((s,x)=>s+num(x.value),0);
  const xiIncome=starters.reduce((s,x)=>s+num(x.income),0);
  const xiBook=starters.reduce((s,x)=>s+num(x.book),0);
  const xiProfit=xiValue-xiBook;

  set('squad4XIValue',money(xiValue));
  set('squad4XIValueMeta',m.value>0?`${(xiValue/num(m.value)*100).toFixed(1)}% of total Squad value`:'0.0% of Squad');
  set('squad4XIIncome',money(xiIncome));
  set('squad4XIProfit',`${xiProfit>=0?'+':''}${money(xiProfit)}`);
  set('squad4BenchMeta',`${subs.length} PLAYER${subs.length===1?'':'S'}`);

  // Remove only dynamically rendered player nodes; keep permanent pitch markings.
  pitch.querySelectorAll('.squad4-xi-player').forEach(x=>x.remove());

  starters.forEach((x,i)=>{
    const [slot,left,top]=squad4Formation[i]||['SUB',50,50];
    const node=document.createElement('div');
    const pl=num(x.value)-num(x.book);
    node.className=`squad4-xi-player ${pl>=0?'is-profit':'is-loss'}`;
    node.dataset.squadTicker=x.ticker;
    node.style.left=`${left}%`;
    node.style.top=`${top}%`;
    node.innerHTML=`
      <b><i>${slot}</i><strong>${esc(x.ticker)}</strong></b>
      <span>${money(x.value)} • ${pl>=0?'+':''}${money(pl)} P/L</span>`;
    pitch.appendChild(node);
  });

  if(!subs.length){
    bench.innerHTML='<div class="empty">All Squad players are in the Value XI.</div>';
  }else{
    bench.innerHTML=subs.map((x,i)=>{
      const pl=num(x.value)-num(x.book);
      return `<article class="squad4-bench-card" data-squad-ticker="${esc(x.ticker)}">
        <div class="squad4-bench-head">
          <strong>${i+12}. ${esc(x.ticker)} — ${esc(x.name||x.ticker)}</strong>
          <span>${esc(accountsForTicker(m,x.ticker))}</span>
        </div>
        <div class="squad4-bench-metrics">
          <div><small>Value</small><b>${money(x.value)}</b></div>
          <div><small>P/L</small><b class="${pl>=0?'good':'bad'}">${pl>=0?'+':''}${money(pl)}</b></div>
          <div><small>Income</small><b>${money(x.income)}/yr</b></div>
        </div>
      </article>`;
    }).join('');
  }
}

function renderNext(m,d){
  const status=$('squad3Status');
  if(status)status.className='squad3-status';

  const action=$('squad3NextAction');
  const meta=$('squad3NextMeta');
  const btn=$('squad3NextButton');

  if(!m.positions){
    if(status){status.textContent='SQUAD EMPTY';status.classList.add('warn')}
    if(action)action.textContent='Add or restore the first canonical holding';
    if(meta)meta.textContent='Squad has no active account-scoped positions yet.';
    if(btn){btn.textContent='Open Holding Editor';btn.dataset.action='editor'}
    return;
  }

  if(d.review>0){
    if(status){status.textContent='ACCOUNT REVIEW';status.classList.add('warn')}
    if(action)action.textContent='Resolve broker account labels';
    if(meta)meta.textContent=`${d.review} active position${d.review===1?'':'s'} still sit in Account Review.`;
    if(btn){btn.textContent='Open Data Health';btn.dataset.action='health'}
    return;
  }

  if(d.metadata>0){
    if(status){status.textContent='METADATA REVIEW';status.classList.add('warn')}
    if(action)action.textContent='Complete first-team metadata';
    if(meta)meta.textContent=`${d.missingSector} missing sector • ${d.missingIncome} missing dividend metadata.`;
    if(btn){btn.textContent='Open Data Health';btn.dataset.action='health'}
    return;
  }

  if(status){status.textContent='CANONICAL FIRST TEAM';status.classList.add('good')}
  if(action)action.textContent='Squad is clean — continue to Income Centre';
  if(meta)meta.textContent=`${m.players} players • ${m.positions} account positions • ${money(m.income)}/year forward income.`;
  if(btn){btn.textContent='Open Income Centre';btn.dataset.action='income'}
}

function render(){
  const m=metrics();
  if(!m)return;
  renderLeadership(m);
  renderCore(m);
  renderValueXI(m);
  const d=renderBalance(m);
  renderNext(m,d);
  set('squad3BalanceMeta',`${m.players} players • ${m.positions} positions`);
}

function bind(){
  $('squad4OpenValueXI')?.addEventListener('click',()=>openTab('pitchPanel'));

  $('squad3NextButton')?.addEventListener('click',()=>{
    const a=$('squad3NextButton')?.dataset.action;
    if(a==='editor')openTab('editorPanel');
    else if(a==='health')openTab('healthPanel');
    else if(a==='income')location.href='income.html';
  });

  document.addEventListener('click',e=>{
    const row=e.target.closest('[data-squad-ticker]');
    if(row){filterTicker(row.dataset.squadTicker||'');return}

    const tab=e.target.closest('.squad-tabs [data-tab="pitchPanel"]');
    if(tab){
      // Paint after the tab is visible and again after legacy squad.js has completed
      // its compatibility render into the hidden legacy targets.
      requestAnimationFrame(()=>requestAnimationFrame(()=>render()));
      setTimeout(render,80);
      setTimeout(render,220);
    }
  });

  // Observe only authoritative existing Squad output cells.
  const observer=new MutationObserver(()=>render());
  [
    'kValue','kBook','kProfit','kIncome','kPlayers','kPositions','kYoc',
    'igValue','igMeta','t212Value','t212Meta','reviewValue','reviewMeta','registerMeta'
  ].forEach(id=>{
    const el=$(id);
    if(el)observer.observe(el,{childList:true,subtree:true,characterData:true});
  });

  window.addEventListener('aurora2:state',()=>setTimeout(render,0));
  window.addEventListener('storage',e=>{if(e.key?.includes('aurora2'))setTimeout(render,40)});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(render,50)});

  [0,90,400,1100].forEach(ms=>setTimeout(render,ms));
}
document.addEventListener('DOMContentLoaded',bind);
})();
