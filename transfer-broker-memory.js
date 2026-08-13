(function(w){
  'use strict';

  const A=()=>w.Aurora2;
  const arr=v=>Array.isArray(v)?v:[];
  const now=()=>new Date().toISOString();

  function ticker(v){
    return String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();
  }
  function accountCode(v){
    const s=String(v||'').toLowerCase();
    if(s.includes('212'))return 'T212';
    if(/\big\b/.test(s)||s.includes('ig isa'))return 'IG';
    const u=String(v||'').toUpperCase();
    return u==='IG'||u==='T212'?u:'CHECK';
  }
  function accountLabel(v){
    const a=accountCode(v);
    return a==='IG'?'IG ISA':a==='T212'?'Trading 212 ISA':'no saved broker';
  }
  function showToast(msg){
    const el=document.getElementById('toast');
    if(!el)return;
    el.textContent=msg;
    el.style.opacity='1';
    clearTimeout(w.__a2BrokerMemoryToast);
    w.__a2BrokerMemoryToast=setTimeout(()=>el.style.opacity='0',2200);
  }

  function rememberBroker(tk,value,{quiet=false}={}){
    tk=ticker(tk);
    const account=accountCode(value);
    if(!tk)return false;

    A().core.update(s=>{
      const prefs={...(s.transfer?.brokerPreferences||{})};
      if(account==='IG'||account==='T212'){
        prefs[tk]={account,updatedAt:now(),source:'TRANSFER_DEAL_SHEET'};
      }else{
        delete prefs[tk];
      }
      return {
        ...s,
        transfer:{
          ...s.transfer,
          brokerPreferences:prefs,
          updatedAt:now()
        }
      };
    });

    if(!quiet){
      showToast(account==='IG'||account==='T212'
        ?`${tk} remembered as ${accountLabel(account)} for future payday routes.`
        :`${tk} broker memory cleared.`
      );
    }
    return true;
  }

  function preferenceFor(tk,state=A().core.read()){
    const raw=state.transfer?.brokerPreferences?.[ticker(tk)];
    return accountCode(raw&&typeof raw==='object'?raw.account:raw);
  }

  /*
   * Capture the broker choice before Transfer's normal change handler.
   * The normal handler still owns the current route; this module only stores
   * the future ticker -> broker preference.
   */
  document.addEventListener('change',e=>{
    const select=e.target?.closest?.('[data-route-account]');
    if(!select)return;

    const state=A().core.read();
    const allocation=arr(state.transfer?.route?.allocations)
      .find(a=>String(a.id||'')===String(select.dataset.routeAccount||''));
    if(!allocation)return;

    rememberBroker(allocation.ticker,select.value);
  },true);

  w.Aurora2=w.Aurora2||{};
  w.Aurora2.transferBrokerMemory={
    rememberBroker,
    preferenceFor
  };
})(window);
