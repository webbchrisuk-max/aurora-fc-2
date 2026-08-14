(function(w){
  'use strict';
  const ENDPOINT_KEY='aurora2:data2:endpoint';
  const TOKEN_KEY='aurora2:data2:token';
  const SPREADSHEET_ID='1kEyuEuHxSt69o8Wy198n9gLBXbx-sGCrxwcHJo9r6Ig';
  const SPREADSHEET_URL='https://docs.google.com/spreadsheets/d/1kEyuEuHxSt69o8Wy198n9gLBXbx-sGCrxwcHJo9r6Ig/edit';

  const INCOME_ACTIONS=new Set([
    'incomeSnapshot',
    'upsertDividend',
    'dividendEngineStatus',
    'runDividendUpdate',
    'installDividendUpdateTrigger',
    'removeDividendUpdateTrigger'
  ]);

  function config(){
    return {
      endpoint:String(localStorage.getItem(ENDPOINT_KEY)||'').trim(),
      token:String(localStorage.getItem(TOKEN_KEY)||'').trim(),
      spreadsheetId:SPREADSHEET_ID,
      spreadsheetUrl:SPREADSHEET_URL
    };
  }

  function saveConfig(endpoint,token){
    const e=String(endpoint||'').trim();
    const t=String(token||'').trim();
    if(e)localStorage.setItem(ENDPOINT_KEY,e);else localStorage.removeItem(ENDPOINT_KEY);
    if(t)localStorage.setItem(TOKEN_KEY,t);else localStorage.removeItem(TOKEN_KEY);
    return config();
  }

  function clearToken(){
    localStorage.removeItem(TOKEN_KEY);
  }

  function stampConnection(action,status,error){
    const A=w.Aurora2;
    if(!A?.core?.read||!A?.core?.update)return;

    const isIncome=INCOME_ACTIONS.has(action);
    const isHealth=action==='health';
    if(!isIncome&&!isHealth)return;

    const current=A.core.read();
    const now=new Date().toISOString();

    const currentGlobal=String(current.connection?.status||'');
    const currentIncome=String(current.income?.backend?.status||'');
    const nextGlobal=status==='CONNECTED'?'CONNECTED':currentGlobal;
    const nextIncome=isIncome||location.pathname.endsWith('/income.html')||location.pathname.endsWith('income.html')
      ? status
      : currentIncome;

    const oldError=String(current.income?.backend?.lastError||'');
    const nextError=error?String(error):'';

    if(
      nextGlobal===currentGlobal &&
      nextIncome===currentIncome &&
      oldError===nextError &&
      status==='CONNECTED'
    ) return;

    A.core.update(s=>({
      ...s,
      connection:isHealth||status==='CONNECTED'
        ? {
            ...s.connection,
            mode:'AuroraData2',
            status:status==='CONNECTED'?'CONNECTED':s.connection?.status,
            spreadsheetId:SPREADSHEET_ID
          }
        : s.connection,
      income:(isIncome||location.pathname.endsWith('/income.html')||location.pathname.endsWith('income.html'))
        ? {
            ...s.income,
            backend:{
              ...s.income?.backend,
              status,
              spreadsheetId:SPREADSHEET_ID,
              lastHealthAt:status==='CONNECTED'?now:s.income?.backend?.lastHealthAt,
              lastEngineContactAt:isIncome&&status==='CONNECTED'?now:s.income?.backend?.lastEngineContactAt,
              lastError:error?String(error):null
            },
            updatedAt:now
          }
        : s.income
    }));
  }

  async function post(action,payload={}){
    const c=config();
    if(!c.endpoint)throw new Error('AuroraData 2 web-app endpoint is not configured.');
    if(!c.token)throw new Error('AuroraData 2 token is not configured.');

    const body=JSON.stringify({action,token:c.token,...payload});
    let response;
    try{
      response=await fetch(c.endpoint,{
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body,
        redirect:'follow',
        cache:'no-store'
      });
    }catch(err){
      if(INCOME_ACTIONS.has(action))stampConnection(action,'ERROR','Could not reach AuroraData 2: '+(err?.message||err));
      throw new Error('Could not reach AuroraData 2: '+(err?.message||err));
    }

    const text=await response.text();
    let data;
    try{
      data=JSON.parse(text);
    }catch(_){
      if(INCOME_ACTIONS.has(action))stampConnection(action,'ERROR','AuroraData 2 returned a non-JSON response.');
      throw new Error('AuroraData 2 returned a non-JSON response.');
    }

    if(!response.ok||data?.ok===false){
      const message=data?.message||data?.error||('Backend HTTP '+response.status);
      if(INCOME_ACTIONS.has(action))stampConnection(action,'ERROR',message);
      throw new Error(message);
    }

    // Connection bridge:
    // any successful Income/Dividend Engine call proves that the Income backend
    // is connected to the same AuroraData 2 web app used by Registration.
    if(INCOME_ACTIONS.has(action))stampConnection(action,'CONNECTED',null);
    if(action==='health')stampConnection(action,'CONNECTED',null);

    return data;
  }

  async function health(){return post('health',{spreadsheetId:SPREADSHEET_ID})}

  // When Income opens, verify the shared AuroraData 2 connection immediately.
  // This fixes the old state where the Dividend Engine could be working in
  // Apps Script while Income's Data Health card still remained LOCAL.
  function probeIncomePage(){
    const path=String(location.pathname||'').toLowerCase();
    if(!path.endsWith('/income.html')&&!path.endsWith('income.html'))return;
    const c=config();
    if(!c.endpoint||!c.token){
      stampConnection('incomeSnapshot','NOT_CONNECTED','AuroraData 2 connection is not configured in this browser.');
      return;
    }
    setTimeout(()=>{
      health().catch(err=>stampConnection('incomeSnapshot','ERROR',String(err?.message||err)));
    },0);
  }

  w.AuroraData2Client={
    spreadsheetId:SPREADSHEET_ID,
    spreadsheetUrl:SPREADSHEET_URL,
    config,saveConfig,clearToken,post,health
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',probeIncomePage,{once:true});
  }else{
    probeIncomePage();
  }
})(window);
