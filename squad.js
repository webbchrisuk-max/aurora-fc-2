(function(w){
  'use strict';

  const A=()=>w.Aurora2;
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const num=v=>{const n=Number(String(v??'').replace(/[£,%]/g,'').replace(/,/g,''));return Number.isFinite(n)?n:0};
  const now=()=>new Date().toISOString();
  const esc=v=>A().ui.escape(v);
  const money=v=>A().ui.money(Number(v)||0);
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const LEGACY_URLS=[
    '/aurora-city-fc/AuroraMaster.json',
    'https://webbchrisuk-max.github.io/aurora-city-fc/AuroraMaster.json'
  ];
  const MIGRATION_BACKUP='aurora2:pre-squad-migration:latest';
  let migrationScan=null;
  let renderingDerived=false;

  function toast(msg){
    const el=$('toast');if(!el)return;el.textContent=msg;el.style.opacity='1';
    clearTimeout(w.__a2SquadToast);w.__a2SquadToast=setTimeout(()=>el.style.opacity='0',2200);
  }
  function set(id,v){const el=$(id);if(el)el.textContent=v}
  function setValue(id,v){const el=$(id);if(el)el.value=v??''}
  function value(id){return $(id)?.value||''}
  function shortTicker(v){return String(v||'').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'').trim()}
  function account(v){
    const s=norm(v);
    if(!s)return 'ACCOUNT REVIEW';
    if(/trade ?212|trading ?212|t212/.test(s))return 'Trading 212 ISA';
    if(/\big\b|ig isa/.test(s))return 'IG ISA';
    return String(v).trim();
  }
  function statusFor(row,shares){
    const raw=String(first(row,['status','Status','position_status','holding_status'])||'').toUpperCase();
    if(/SOLD|EXITED|CLOSED|ARCHIVED/.test(raw)||shares<=0)return 'ARCHIVED';
    if(/LOCKED|LEGACY/.test(raw))return 'LOCKED';
    return 'ACTIVE';
  }
  function first(row,keys){
    for(const k of keys){
      if(row&&row[k]!==undefined&&row[k]!==null&&String(row[k]).trim()!=='')return row[k];
    }
    return null;
  }
  function rowsFromValue(value){
    if(Array.isArray(value)){
      if(!value.length)return [];
      if(value.every(x=>x&&typeof x==='object'&&!Array.isArray(x)))return value;
      return [];
    }
    if(!value||typeof value!=='object')return [];
    for(const k of ['rows','values','data']){
      if(Array.isArray(value[k])){
        const candidate=value[k];
        if(candidate.every(x=>x&&typeof x==='object'&&!Array.isArray(x)))return candidate;
        const headers=Array.isArray(value.headers)?value.headers.map(String):Array.isArray(value.columns)?value.columns.map((x,i)=>String(x?.label||x?.name||x||`column_${i+1}`)):[];
        if(headers.length&&candidate.every(Array.isArray)){
          return candidate.map(row=>{const out={};headers.forEach((h,i)=>out[h]=row[i]);return out});
        }
      }
    }
    if(Array.isArray(value.cols)&&Array.isArray(value.rows)){
      const headers=value.cols.map((c,i)=>String(c?.label||c?.id||`column_${i+1}`));
      return value.rows.map(row=>{const cells=Array.isArray(row?.c)?row.c:[];const out={};headers.forEach((h,i)=>out[h]=cells[i]?.v??cells[i]?.f??'');return out});
    }
    return [];
  }
  function readTab(master,label){
    const wanted=norm(label).replace(/\s/g,'');
    const containers=[master,master?.data,master?.tabs,master?.sheets,master?.feeds,master?.tables,master?.payload].filter(x=>x&&typeof x==='object');
    for(const c of containers){
      for(const k of Object.keys(c)){
        if(norm(k).replace(/\s/g,'')===wanted){
          const rows=rowsFromValue(c[k]);
          if(rows.length)return rows;
        }
      }
    }
    return [];
  }

  function canonicalFromLegacy(row,index){
    const ticker=shortTicker(first(row,['ticker','Ticker','symbol','Symbol']));
    if(!ticker)return null;
    const shares=Math.max(0,num(first(row,['shares','Shares','quantity','Quantity','units','Units'])));
    const directValue=Math.max(0,num(first(row,['current_value','market_value','holding_value','value','Value','Market Value'])));
    const rawPrice=Math.max(0,num(first(row,['live_price_gbp','current_price_gbp','price_gbp','live_price','Live Price','price','Price'])));
    const priceUnit=String(first(row,['price_unit','Price Unit'])||'').toUpperCase();
    const currency=String(first(row,['currency','Currency','quote_currency'])||'GBP').toUpperCase();

    let livePriceGbp=shares>0&&directValue>0?directValue/shares:0;
    if(livePriceGbp<=0){
      if(first(row,['live_price_gbp','current_price_gbp','price_gbp'])!=null)livePriceGbp=rawPrice;
      else if(currency==='GBP')livePriceGbp=priceUnit==='PENCE'?rawPrice/100:rawPrice;
    }
    const marketValueGbp=directValue||(shares*livePriceGbp);

    let bookCostGbp=Math.max(0,num(first(row,['book_cost','Book Cost','cost_basis','costBasis','bookValue'])));
    const sourceAvg=Math.max(0,num(first(row,['average_price','avg_price','average_cost','avg_cost','Average Price','Average Cost'])));
    if(bookCostGbp<=0&&sourceAvg>0&&shares>0)bookCostGbp=sourceAvg*shares;
    const avgCostGbp=shares>0&&bookCostGbp>0?bookCostGbp/shares:sourceAvg;

    let annualIncomeGbp=Math.max(0,num(first(row,['annual_dps_total','Annual DPS Total','annual_income','Annual Income','income_annual','dividend_income','annual_dividend_total'])));
    let annualDpsGbp=Math.max(0,num(first(row,['annual_dps_gbp','annual_dps','Annual_DPS','dps','dividend_per_share'])));
    if(annualIncomeGbp>0&&shares>0)annualDpsGbp=annualIncomeGbp/shares;
    else if(annualIncomeGbp<=0&&annualDpsGbp>0&&shares>0)annualIncomeGbp=shares*annualDpsGbp;

    const acct=account(first(row,['account','Account','platform','Platform','broker','Broker']));
    let locked=Boolean(first(row,['locked','is_locked','legacy_locked']));
    let lockReason=String(first(row,['lock_reason','lockReason','restriction_note'])||'');
    if(ticker==='TSCO'){
      locked=true;
      lockReason=lockReason||'Tesco legacy / 2029 holding — excluded from normal Transfer buying.';
    }
    const st=statusFor(row,shares);
    return {
      id:`A1-HOLD-${ticker}-${acct.replace(/[^A-Za-z0-9]/g,'').toUpperCase()||'REVIEW'}`,
      ticker,
      name:String(first(row,['name','Name','company','Company','company_name','Company Name','security_name','Security Name'])||ticker),
      account:acct,
      shares,
      bookCostGbp,
      avgCostGbp,
      livePriceGbp,
      marketValueGbp,
      profitLossGbp:marketValueGbp-bookCostGbp,
      annualDpsGbp,
      annualIncomeGbp,
      sector:String(first(row,['sector','Sector'])||''),
      role:String(first(row,['role','Role','squad_role','Squad Role'])||''),
      status:locked&&st==='ACTIVE'?'LOCKED':st,
      locked,
      lockReason,
      source:'AURORA1_MASTER',
      sourceKey:`${ticker}|${acct}`,
      sourceUpdatedAt:String(first(row,['updated_at','Updated','date','Date','timestamp','Timestamp'])||''),
      createdAt:now(),updatedAt:now()
    };
  }

  async function scanLegacy(){
    set('migrationBadge','SCANNING');
    let master=null,source='';
    for(const base of LEGACY_URLS){
      try{
        const url=`${base}${base.includes('?')?'&':'?'}v=${Date.now()}`;
        const res=await fetch(url,{cache:'no-store'});
        if(!res.ok)continue;
        master=await res.json();source=base;break;
      }catch(_){}
    }
    if(!master){
      migrationScan={source:'',rows:[],holdings:[],error:'Aurora 1 AuroraMaster could not be loaded.'};
      renderMigration();return migrationScan;
    }
    const rows=readTab(master,'Holdings');
    const holdings=rows.map(canonicalFromLegacy).filter(Boolean);
    const active=holdings.filter(h=>['ACTIVE','LOCKED'].includes(h.status)&&h.shares>0);
    const missingAccount=active.filter(h=>h.account==='ACCOUNT REVIEW').length;
    const missingBook=active.filter(h=>h.bookCostGbp<=0).length;
    const tickerAccounts=new Map();
    active.forEach(h=>{if(!tickerAccounts.has(h.ticker))tickerAccounts.set(h.ticker,new Set());tickerAccounts.get(h.ticker).add(h.account)});
    const duplicates=[...tickerAccounts].filter(([,set])=>set.size>1);
    migrationScan={source,rows,holdings,active,missingAccount,missingBook,duplicates,error:''};
    renderMigration();return migrationScan;
  }

  function importLegacy(){
    const scan=migrationScan;
    if(!scan?.holdings?.length){toast('No Aurora 1 holdings are ready to import.');return}
    localStorage.setItem(MIGRATION_BACKUP,localStorage.getItem(A().core.KEY)||JSON.stringify(A().core.read()));
    A().core.update(s=>{
      const existing=[...arr(s.squad?.holdings)];
      scan.holdings.forEach(incoming=>{
        const i=existing.findIndex(h=>shortTicker(h.ticker)===incoming.ticker&&account(h.account)===incoming.account);
        if(i<0){existing.push(incoming);return}
        const old=existing[i];
        if(old.source==='MANUAL'){
          existing[i]={...old,sourceKey:incoming.sourceKey,sourceUpdatedAt:incoming.sourceUpdatedAt,updatedAt:now()};
          return;
        }
        existing[i]={
          ...old,...incoming,
          id:old.id||incoming.id,
          createdAt:old.createdAt||incoming.createdAt,
          locked:old.locked||incoming.locked,
          lockReason:old.lockReason||incoming.lockReason,
          status:(old.locked||incoming.locked)&&incoming.status==='ACTIVE'?'LOCKED':incoming.status,
          updatedAt:now()
        };
      });
      return {
        ...s,
        squad:{
          ...s.squad,
          holdings:existing,
          source:'AURORA1_MIGRATED',
          migration:{
            source:scan.source,
            importedAt:now(),
            rows:scan.rows.length,
            positions:scan.holdings.length,
            missingAccount:scan.missingAccount,
            missingBookCost:scan.missingBook,
            multiAccountTickers:scan.duplicates.length
          },
          updatedAt:now()
        },
        alerts:[
          {id:A().core.uid('ALERT'),title:'Squad holdings migrated',note:`${scan.active.length} active account-scoped positions loaded from Aurora 1.`,when:'now'},
          ...(s.alerts||[]).filter(a=>a?.title!=='Squad holdings migrated')
        ].slice(0,8)
      };
    });
    toast(`${scan.active.length} active Squad positions imported.`);
  }

  function activeHoldings(state=A().core.read()){
    return arr(state.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h.status).toUpperCase())&&num(h.shares)>0);
  }
  function holdingMetrics(h){
    const shares=num(h.shares),book=num(h.bookCostGbp),price=num(h.livePriceGbp);
    const value=num(h.marketValueGbp)||(shares*price),income=num(h.annualIncomeGbp)||(shares*num(h.annualDpsGbp));
    const profit=value-book,yoc=book>0?income/book*100:0,avg=shares>0?book/shares:0;
    return {shares,book,price,value,income,profit,yoc,avg};
  }
  function squadMetrics(state=A().core.read()){
    const active=activeHoldings(state);
    let value=0,book=0,income=0;
    active.forEach(h=>{const m=holdingMetrics(h);value+=m.value;book+=m.book;income+=m.income});
    const unique=[...new Set(active.map(h=>shortTicker(h.ticker)))].filter(Boolean);
    const byTicker=new Map();
    active.forEach(h=>{
      const t=shortTicker(h.ticker),m=holdingMetrics(h),x=byTicker.get(t)||{ticker:t,name:h.name,value:0,income:0,book:0};
      x.value+=m.value;x.income+=m.income;x.book+=m.book;byTicker.set(t,x);
    });
    const bestIncome=[...byTicker.values()].sort((a,b)=>b.income-a.income)[0]||null;
    return {active,value,book,income,monthly:income/12,profit:value-book,yoc:book>0?income/book*100:0,players:unique.length,positions:active.length,bestIncome,byTicker};
  }

  function updatePortfolioSummary(){
    if(renderingDerived)return;
    const s=A().core.read(),m=squadMetrics(s);
    const next={
      teamValue:Number(m.value.toFixed(2)),
      annualIncome:Number(m.income.toFixed(2)),
      monthlyIncome:Number(m.monthly.toFixed(2)),
      squadSize:m.players,
      bestDividendPlayer:m.bestIncome?{ticker:m.bestIncome.ticker,annualIncome:Number(m.bestIncome.income.toFixed(2))}:null,
      topAuroraPlayer:s.portfolio?.topAuroraPlayer||null
    };
    const old=s.portfolio||{};
    const same=['teamValue','annualIncome','monthlyIncome','squadSize'].every(k=>String(old[k])===String(next[k])) &&
      JSON.stringify(old.bestDividendPlayer||null)===JSON.stringify(next.bestDividendPlayer||null);
    if(same)return;
    renderingDerived=true;
    try{A().core.write({...s,portfolio:{...old,...next}})}finally{renderingDerived=false}
  }

  function accountClass(v){const a=account(v);return a==='IG ISA'?'ig':a==='Trading 212 ISA'?'t212':'review'}
  function renderKpis(state,m){
    set('heroValue',money(m.value));set('heroMeta',`${m.players} players • ${m.positions} account positions • ${money(m.income)} annual income`);
    set('kValue',money(m.value));set('kBook',money(m.book));set('kProfit',`${m.profit>=0?'+':''}${money(m.profit)}`);
    set('kIncome',money(m.income));set('kMonthly',`${money(m.monthly)} monthly`);set('kPlayers',m.players);set('kPositions',`${m.positions} account positions`);set('kYoc',`${m.yoc.toFixed(2)}%`);
    for(const [acct,valueId,metaId] of [['IG ISA','igValue','igMeta'],['Trading 212 ISA','t212Value','t212Meta'],['ACCOUNT REVIEW','reviewValue','reviewMeta']]){
      const rows=m.active.filter(h=>account(h.account)===acct),total=rows.reduce((s,h)=>s+holdingMetrics(h).value,0);
      set(valueId,money(total));set(metaId,`${rows.length} position${rows.length===1?'':'s'}`);
    }
  }

  function filteredRows(state){
    const q=norm(value('holdingSearch')),acct=value('holdingAccountFilter')||'ALL',status=value('holdingStatusFilter')||'ACTIVE';
    return arr(state.squad?.holdings).filter(h=>{
      const active=['ACTIVE','LOCKED'].includes(String(h.status).toUpperCase())&&num(h.shares)>0;
      if(status==='ACTIVE'&&!active)return false;
      if(status==='LOCKED'&&!h.locked&&h.status!=='LOCKED')return false;
      if(status==='ARCHIVED'&&active)return false;
      if(acct!=='ALL'&&account(h.account)!==acct)return false;
      if(q&&!norm(`${h.ticker} ${h.name}`).includes(q))return false;
      return true;
    }).sort((a,b)=>holdingMetrics(b).value-holdingMetrics(a).value||String(a.ticker).localeCompare(String(b.ticker)));
  }

  function renderRegister(state){
    const host=$('holdingGrid');if(!host)return;
    const rows=filteredRows(state);set('registerMeta',`${rows.length} record${rows.length===1?'':'s'}`);
    if(!rows.length){host.innerHTML='<div class="empty">No holdings match these filters.</div>';return}
    host.innerHTML=rows.map(h=>{
      const m=holdingMetrics(h),locked=h.locked||h.status==='LOCKED',archived=!['ACTIVE','LOCKED'].includes(h.status);
      return `<article class="player-card ${locked?'locked':''} ${archived?'archived':''}">
        <div class="player-head">
          <div class="shirt">${esc(h.ticker)}</div>
          <div><strong>${esc(h.ticker)} — ${esc(h.name)}</strong><span>${esc(h.sector||'Sector not set')}${h.role?` • ${esc(h.role)}`:''}<br>${m.shares.toLocaleString('en-GB',{maximumFractionDigits:8})} shares</span></div>
          <div><span class="account-pill ${accountClass(h.account)}">${esc(account(h.account))}</span>${locked?'<span class="lock-pill">LOCKED</span>':''}</div>
        </div>
        <div class="player-metrics">
          <div class="player-metric"><small>Value</small><strong>${money(m.value)}</strong></div>
          <div class="player-metric"><small>Book cost</small><strong>${money(m.book)}</strong></div>
          <div class="player-metric"><small>Average</small><strong>${money(m.avg)}</strong></div>
          <div class="player-metric"><small>Live</small><strong>${money(m.price)}</strong></div>
          <div class="player-metric"><small>P / L</small><strong class="${m.profit>=0?'good':'red'}">${m.profit>=0?'+':''}${money(m.profit)}</strong></div>
          <div class="player-metric"><small>Annual income</small><strong>${money(m.income)}</strong></div>
          <div class="player-metric"><small>Yield on cost</small><strong>${m.yoc.toFixed(2)}%</strong></div>
          <div class="player-metric"><small>Status</small><strong>${esc(h.status)}</strong></div>
        </div>
        ${locked&&h.lockReason?`<div class="notice" style="margin-top:10px">${esc(h.lockReason)}</div>`:''}
        <div class="player-actions"><button class="btn secondary" data-edit-holding="${esc(h.id)}">Edit</button></div>
      </article>`;
    }).join('');
  }

  const formation=[
    ['ST',50,14],['LW',18,29],['RW',82,29],['LCM',26,48],['CM',50,52],['RCM',74,48],
    ['LB',16,72],['LCB',38,78],['RCB',62,78],['RB',84,72],['GK',50,91]
  ];
  function renderPitch(m){
    const host=$('squadPitch'),bench=$('benchList');if(!host||!bench)return;
    host.querySelectorAll('.pitch-player').forEach(x=>x.remove());
    const rows=[...m.active].sort((a,b)=>holdingMetrics(b).value-holdingMetrics(a).value);
    rows.slice(0,11).forEach((h,i)=>{
      const [slot,left,top]=formation[i]||['SUB',50,50],node=document.createElement('div');node.className='pitch-player';node.style.left=`${left}%`;node.style.top=`${top}%`;
      node.innerHTML=`<b>${esc(h.ticker)}</b><span>${slot} • ${money(holdingMetrics(h).value)}</span>`;host.appendChild(node);
    });
    const rest=rows.slice(11);
    bench.innerHTML=rest.length?rest.map(h=>`<div class="history-row"><div><strong>${esc(h.ticker)} — ${esc(h.name)}</strong><span>${esc(account(h.account))} • ${money(holdingMetrics(h).value)} • ${money(holdingMetrics(h).income)}/yr</span></div></div>`).join(''):'<div class="empty">No bench positions yet.</div>';
  }

  function renderHealth(state,m){
    const active=m.active,missingAccount=active.filter(h=>account(h.account)==='ACCOUNT REVIEW').length,missingBook=active.filter(h=>num(h.bookCostGbp)<=0).length,missingIncome=active.filter(h=>num(h.annualIncomeGbp)<=0&&num(h.annualDpsGbp)<=0).length;
    const tickers=new Map();active.forEach(h=>{const t=shortTicker(h.ticker);if(!tickers.has(t))tickers.set(t,new Set());tickers.get(t).add(account(h.account))});
    const multi=[...tickers].filter(([,set])=>set.size>1);
    const put=(id,count,ok,desc)=>{const el=$(id);if(!el)return;el.className=`health-card ${ok?'':'warn'}`;el.querySelector('strong').textContent=String(count);el.querySelector('span').textContent=desc};
    put('healthAccounts',missingAccount,!missingAccount,missingAccount?'Resolve account labels before registration.':'All active positions have broker accounts.');
    put('healthBook',missingBook,!missingBook,missingBook?'These positions need an account-scoped book cost.':'Book costs available for every active position.');
    put('healthDuplicates',multi.length,true,multi.length?multi.map(([t,s])=>`${t} ×${s.size}`).join(' • '):'No ticker currently spans multiple accounts.');
    put('healthIncome',missingIncome,!missingIncome,missingIncome?'Dividend data is missing on these active positions.':'Income fields available for every active position.');
    const drafts=arr(state.transfer?.registrationDrafts),host=$('registrationBridge');
    if(host)host.innerHTML=drafts.length?drafts.map(d=>`<div class="history-row"><div><strong>${esc(d.ticker)} • ${esc(d.account)}</strong><span>${money(d.totalCostGbp)} • ${esc(d.status)} • ${esc(d.transactionId)}</span></div></div>`).join(''):'<div class="empty">No pending Transfer registration drafts.</div>';
  }

  function renderMigration(){
    const s=migrationScan;
    if(!s){return}
    if(s.error){
      set('migrationBadge','NOT FOUND');$('migrationBadge').className='red';set('migrationText',s.error);$('importLegacyHoldings').disabled=true;
      return;
    }
    set('migrationBadge','FOUND');$('migrationBadge').className='good';
    set('migrationText',`Read-only source found at ${s.source}. Account-scoped rows will be kept separate.`);
    set('migRows',s.rows.length);set('migActive',s.active.length);set('migAccounts',s.missingAccount);set('migBook',s.missingBook);set('migDuplicates',s.duplicates.length);
    $('importLegacyHoldings').disabled=!s.holdings.length;
    const warnings=[];
    if(s.missingAccount)warnings.push(`${s.missingAccount} active position${s.missingAccount===1?'':'s'} will be marked ACCOUNT REVIEW rather than guessed.`);
    if(s.missingBook)warnings.push(`${s.missingBook} active position${s.missingBook===1?'':'s'} has no usable book cost in the source.`);
    if(s.duplicates.length)warnings.push(`Multi-account tickers preserved deliberately: ${s.duplicates.map(([t,set])=>`${t} (${[...set].join(' + ')})`).join(' • ')}`);
    const box=$('migrationWarnings');if(box)box.innerHTML=warnings.length?warnings.map(x=>`<div class="notice" style="margin-top:7px">${esc(x)}</div>`):'<div class="notice good">Source health looks clean for migration.</div>';
  }

  function clearEditor(){
    ['editHoldingId','editTicker','editName','editShares','editBook','editPrice','editDps','editSector','editRole','editLockReason'].forEach(id=>setValue(id,''));
    setValue('editAccount','IG ISA');setValue('editStatus','ACTIVE');$('editLocked').checked=false;previewEditor();
  }
  function editHolding(id){
    const h=arr(A().core.read().squad?.holdings).find(x=>x.id===id);if(!h)return;
    setValue('editHoldingId',h.id);setValue('editTicker',h.ticker);setValue('editName',h.name);setValue('editAccount',account(h.account));setValue('editStatus',h.status);
    setValue('editShares',h.shares);setValue('editBook',h.bookCostGbp);setValue('editPrice',h.livePriceGbp);setValue('editDps',h.annualDpsGbp);setValue('editSector',h.sector);setValue('editRole',h.role);setValue('editLockReason',h.lockReason);$('editLocked').checked=!!h.locked;
    document.querySelector('[data-tab="editorPanel"]')?.click();previewEditor();
  }
  function previewEditor(){
    const shares=Math.max(0,num(value('editShares'))),book=Math.max(0,num(value('editBook'))),price=Math.max(0,num(value('editPrice'))),dps=Math.max(0,num(value('editDps')));
    const avg=shares>0?book/shares:0,val=shares*price,profit=val-book,income=shares*dps,yoc=book>0?income/book*100:0;
    set('previewAvg',money(avg));set('previewValue',money(val));set('previewProfit',`${profit>=0?'+':''}${money(profit)}`);set('previewIncome',money(income));set('previewYoc',`${yoc.toFixed(2)}%`);
  }
  function saveHolding(){
    const id=value('editHoldingId')||A().core.uid('HOLD'),ticker=shortTicker(value('editTicker')),name=value('editName').trim()||ticker,acct=account(value('editAccount')),shares=Math.max(0,num(value('editShares'))),book=Math.max(0,num(value('editBook'))),price=Math.max(0,num(value('editPrice'))),dps=Math.max(0,num(value('editDps')));
    let status=value('editStatus')||'ACTIVE',locked=$('editLocked').checked;
    if(!ticker){toast('Enter a ticker.');return}
    if(acct==='ACCOUNT REVIEW'&&['ACTIVE','LOCKED'].includes(status)){toast('Choose the real broker account before saving an active holding.');return}
    if(locked&&status==='ACTIVE')status='LOCKED';
    const market=shares*price,income=shares*dps;
    A().core.update(s=>{
      const holdings=[...arr(s.squad?.holdings)],idx=holdings.findIndex(h=>h.id===id);
      const old=idx>=0?holdings[idx]:null;
      const record={...(old||{}),id,ticker,name,account:acct,shares,bookCostGbp:book,avgCostGbp:shares>0?book/shares:0,livePriceGbp:price,marketValueGbp:market,profitLossGbp:market-book,annualDpsGbp:dps,annualIncomeGbp:income,sector:value('editSector').trim(),role:value('editRole').trim(),status,locked,lockReason:value('editLockReason').trim(),source:'MANUAL',sourceKey:`${ticker}|${acct}`,createdAt:old?.createdAt||now(),updatedAt:now()};
      if(idx>=0)holdings[idx]=record;else holdings.push(record);
      return {...s,squad:{...s.squad,holdings,source:'AURORA2',updatedAt:now()}};
    });
    clearEditor();toast('Canonical holding saved.');
  }

  function render(){
    if(renderingDerived)return;
    const state=A().core.read(),m=squadMetrics(state);
    renderKpis(state,m);renderRegister(state);renderPitch(m);renderHealth(state,m);set('lastUpdated',new Date(state.updatedAt).toLocaleString('en-GB'));
    updatePortfolioSummary();
  }

  function tabs(){
    document.querySelectorAll('.tab[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
      document.querySelectorAll('.tab[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===btn.dataset.tab));
    }));
  }
  function wire(){
    tabs();
    $('openMigration')?.addEventListener('click',()=>document.querySelector('[data-tab="migrationPanel"]')?.click());
    $('openEditor')?.addEventListener('click',()=>document.querySelector('[data-tab="editorPanel"]')?.click());
    $('importLegacyHoldings')?.addEventListener('click',importLegacy);$('rescanLegacy')?.addEventListener('click',scanLegacy);
    ['holdingSearch','holdingAccountFilter','holdingStatusFilter'].forEach(id=>$(id)?.addEventListener(id==='holdingSearch'?'input':'change',render));
    $('clearFilters')?.addEventListener('click',()=>{setValue('holdingSearch','');setValue('holdingAccountFilter','ALL');setValue('holdingStatusFilter','ACTIVE');render()});
    document.addEventListener('click',e=>{const b=e.target.closest('[data-edit-holding]');if(b)editHolding(b.dataset.editHolding)});
    ['editShares','editBook','editPrice','editDps'].forEach(id=>$(id)?.addEventListener('input',previewEditor));
    $('saveHolding')?.addEventListener('click',saveHolding);$('clearHolding')?.addEventListener('click',clearEditor);
  }

  document.addEventListener('DOMContentLoaded',()=>{wire();clearEditor();render();scanLegacy()});
  w.addEventListener('aurora2:state',()=>{if(!renderingDerived)render()});
  w.Aurora2=w.Aurora2||{};w.Aurora2.squad={metrics:squadMetrics,scanLegacy,importLegacy};
})(window);
