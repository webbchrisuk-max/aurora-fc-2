(function(w){
  'use strict';
  const ENDPOINT_KEY='aurora2:data2:endpoint';
  const TOKEN_KEY='aurora2:data2:token';
  const SPREADSHEET_ID='1kEyuEuHxSt69o8Wy198n9gLBXbx-sGCrxwcHJo9r6Ig';
  const SPREADSHEET_URL='https://docs.google.com/spreadsheets/d/1kEyuEuHxSt69o8Wy198n9gLBXbx-sGCrxwcHJo9r6Ig/edit';

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
      throw new Error('Could not reach AuroraData 2: '+(err?.message||err));
    }
    const text=await response.text();
    let data;
    try{data=JSON.parse(text)}catch(_){
      throw new Error('AuroraData 2 returned a non-JSON response.');
    }
    if(!response.ok||data?.ok===false)throw new Error(data?.message||data?.error||('Backend HTTP '+response.status));
    return data;
  }

  async function health(){return post('health',{spreadsheetId:SPREADSHEET_ID})}

  w.AuroraData2Client={
    spreadsheetId:SPREADSHEET_ID,
    spreadsheetUrl:SPREADSHEET_URL,
    config,saveConfig,clearToken,post,health
  };
})(window);
