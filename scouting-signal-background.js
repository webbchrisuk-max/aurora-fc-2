/* Aurora 2 — Background External Signal Scouting
 * Keeps Buffett/Berkshire and Dividend Champions as silent inputs.
 * The visible watchlist is removed from Scouting Centre.
 * On Run Scouting, matched Global Network names can be promoted only when
 * Aurora's existing auto-promotion evidence gate says they are eligible.
 */
(function(w){
  'use strict';
  if(w.AuroraBackgroundSignalScouting)return;

  const WATCH_KEY='aurora2:scouting:signal-watch:v2';
  const norm=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const ticker=v=>String(v||'').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'').replace(/\..*$/,'');
  const arr=v=>Array.isArray(v)?v:[];

  function state(){
    try{return w.Aurora2?.core?.read?.()||null}catch(_){return null}
  }
  function watchRows(){
    try{
      const rows=JSON.parse(localStorage.getItem(WATCH_KEY)||'null');
      return Array.isArray(rows)?rows:[];
    }catch(_){return []}
  }
  function activeKeys(s){
    const keys=new Set();
    arr(s?.scouting?.targets).forEach(row=>{
      const t=ticker(row?.ticker||row?.marketSymbol);
      if(t)keys.add(`t:${t}`);
      const n=norm(row?.name||row?.company||row?.companyName);
      if(n)keys.add(`n:${n}`);
    });
    return keys;
  }
  function rowNames(row){
    return [row?.name,row?.company,row?.companyName,row?.securityName]
      .map(norm).filter(Boolean);
  }
  function matchWatch(item,universe){
    const wt=ticker(item?.ticker||item?.symbol);
    const names=[item?.name,item?.company,item?.companyName].map(norm).filter(Boolean);
    return universe.find(row=>{
      const rt=ticker(row?.ticker||row?.marketSymbol||row?.symbol);
      if(wt&&rt&&(wt===rt||rt.endsWith(wt)||wt.endsWith(rt)))return true;
      const rn=rowNames(row);
      return names.some(n=>rn.some(x=>x===n||x.includes(n)||n.includes(x)));
    })||null;
  }
  function alreadyActive(match,keys){
    const t=ticker(match?.ticker||match?.marketSymbol||match?.symbol);
    if(t&&keys.has(`t:${t}`))return true;
    return rowNames(match).some(n=>keys.has(`n:${n}`));
  }

  function removeVisibleWatch(){
    document.getElementById('notableInvestorWatch')?.remove();
    document.querySelectorAll('[data-scout-jump="notableInvestorWatch"]').forEach(el=>el.remove());
  }

  function scanSignals(){
    const A=w.Aurora2;
    const s=state();
    const network=A?.scouting?.network;
    if(!s||!network?.autoProfile||!network?.promote)return {matched:0,promoted:0};
    if(s.transfer?.route?.locked||['LOCKED','PARTIALLY_REGISTERED','COMPLETE'].includes(String(s.mission?.status||'')))return {matched:0,promoted:0,locked:true};

    const universe=arr(s.scouting?.universe);
    if(!universe.length)return {matched:0,promoted:0};
    const keys=activeKeys(s);
    let matched=0,promoted=0;
    const promotedIds=new Set();

    watchRows().forEach(item=>{
      const match=matchWatch(item,universe);
      if(!match)return;
      matched++;
      if(alreadyActive(match,keys))return;
      const profile=network.autoProfile(match);
      if(!profile?.eligible)return;
      const id=match.id||match.securityId||match.networkSecurityId;
      if(!id||promotedIds.has(String(id)))return;
      promotedIds.add(String(id));
      network.promote(id);
      promoted++;
      const t=ticker(match.ticker||match.marketSymbol);
      if(t)keys.add(`t:${t}`);
      rowNames(match).forEach(n=>keys.add(`n:${n}`));
    });

    try{
      localStorage.setItem('aurora2:scouting:signal-background:last',JSON.stringify({
        at:new Date().toISOString(),matched,promoted
      }));
    }catch(_){}
    return {matched,promoted};
  }

  function bind(){
    removeVisibleWatch();
    const button=document.getElementById('runScouting');
    button?.addEventListener('click',()=>scanSignals(),{capture:true});
    const observer=new MutationObserver(()=>removeVisibleWatch());
    observer.observe(document.body,{childList:true,subtree:true});
    setTimeout(removeVisibleWatch,0);
    setTimeout(removeVisibleWatch,250);
  }

  w.AuroraBackgroundSignalScouting={scan:scanSignals,hide:removeVisibleWatch};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})(window);
