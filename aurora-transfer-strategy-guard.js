/* Aurora City FC — Transfer Strategy persistence guard v1.1
 * Legacy Transfer settings writes can omit `strategy`; Aurora core then normalises
 * the missing value back to Sustainable. This guard immediately restores the
 * Transfer-owned strategy from the compatibility mirror/current route.
 */
(function(w){
  'use strict';
  if(w.__AURORA_TRANSFER_STRATEGY_GUARD_V11__)return;
  w.__AURORA_TRANSFER_STRATEGY_GUARD_V11__=true;

  const A=()=>w.Aurora2;
  const valid=v=>['sustainable','maximum'].includes(String(v||'').toLowerCase())
    ?String(v).toLowerCase()
    :'';
  const isTransfer=()=>((String(location.pathname||'').split('/').pop()||'').toLowerCase()==='transfer.html');
  let repairing=false;

  function desiredStrategy(state){
    if(state?.transfer?.strategyOwner!=='TRANSFER')return '';
    const route=valid(state?.transfer?.route?.strategy);
    const scouting=valid(state?.scouting?.strategy);
    const stored=valid(state?.transfer?.settings?.strategy);

    // A live route is authoritative for the recommendation currently on screen.
    // The Scouting mirror preserves the user's Transfer choice if legacy settings
    // code temporarily drops transfer.settings.strategy during Auto Build Route.
    if(route && scouting===route)return route;
    if(scouting)return scouting;
    if(route)return route;
    return stored;
  }

  function repair(state){
    if(!isTransfer()||repairing)return state;
    const core=A()?.core;
    if(!core?.read||!core?.update)return state;
    state=state||core.read();
    const desired=desiredStrategy(state);
    const stored=valid(state?.transfer?.settings?.strategy);
    if(!desired||stored===desired)return state;

    repairing=true;
    try{
      return core.update(current=>({
        ...current,
        transfer:{
          ...current.transfer,
          strategyOwner:'TRANSFER',
          settings:{...current.transfer?.settings,strategy:desired},
          updatedAt:new Date().toISOString()
        }
      }));
    }finally{
      repairing=false;
    }
  }

  function init(){
    if(!isTransfer())return;
    repair(A()?.core?.read?.());

    // State events catch background/legacy writes.
    w.addEventListener('aurora2:state',event=>repair(event.detail||A()?.core?.read?.()));

    // transfer.js handles Auto Build Route on the button itself. This delegated
    // bubble handler runs immediately afterwards in the SAME click task, so if
    // legacy setSettings() drops strategy we restore it before the browser can
    // paint a false Sustainable label over a Maximum route.
    document.addEventListener('click',event=>{
      if(event.target.closest?.('#autoBuildRoute'))repair(A()?.core?.read?.());
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})(window);
