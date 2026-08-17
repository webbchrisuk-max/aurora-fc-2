(function(w){
  'use strict';
  const A=()=>w.Aurora2,C=()=>w.AuroraData2Client;
  const arr=v=>Array.isArray(v)?v:[],now=()=>new Date().toISOString();
  const ticker=v=>String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\.GB$/i,'').toUpperCase().trim();
  function accountCode(v){const s=String(v||'').toLowerCase();if(s.includes('212'))return'T212';if(/\big\b/.test(s)||s.includes('ig isa'))return'IG';return String(v||'').toUpperCase()==='BOTH'?'BOTH':'CHECK'}
  function toast(message){const el=document.getElementById('toast');if(!el)return;el.textContent=message;el.style.opacity='1';clearTimeout(w.__a2BrokerToast);w.__a2BrokerToast=setTimeout(()=>el.style.opacity='0',2400)}
  function rows(result){return arr(result?.platformRules||result?.rules||result?.rows||result?.data)}
  function installRules(rules){A().core.update(state=>({...state,transfer:{...state.transfer,platformRules:rules,updatedAt:now()}}))}
  async function loadRules(){try{const result=await C().get('getPlatformRules',{});installRules(rows(result).filter(rule=>String(rule?.active??'true').toLowerCase()!=='false'))}catch(error){console.warn('PlatformRules could not be loaded:',error?.message||error)}}
  function currentRule(tk,state=A().core.read()){return arr(state.transfer?.platformRules).find(rule=>ticker(rule.ticker)===ticker(tk))}
  function selection(rule){const allowed=String(rule?.allowed_accounts||rule?.allowedAccounts||'');return accountCode(allowed.includes(',')?'BOTH':allowed||rule?.preferred_account)}
  let activeTicker='',previousFocus=null;
  function close(){const sheet=document.getElementById('brokerRuleSheet');if(sheet)sheet.hidden=true;previousFocus?.focus?.();activeTicker=''}
  function markCurrent(sheet,current){sheet.querySelectorAll('[data-broker-choice]').forEach(choice=>{const selected=choice.dataset.brokerChoice===current;choice.classList.toggle('current',selected);choice.setAttribute('aria-checked',String(selected))})}
  function target(tk,state=A().core.read()){return arr(state.scouting?.targets).find(row=>ticker(row.ticker)===ticker(tk))}
  function effectiveSelection(tk,state=A().core.read()){
    const saved=currentRule(tk,state);
    if(saved)return selection(saved);
    const route=A().transferEngine?.resolveBrokerRoute?.(state,target(tk,state));
    if(arr(route?.eligible).includes('IG')&&arr(route?.eligible).includes('T212'))return'BOTH';
    return accountCode(route?.account);
  }
  function open(tk,button){activeTicker=ticker(tk);previousFocus=button;const sheet=document.getElementById('brokerRuleSheet'),title=document.getElementById('brokerRuleTitle'),status=document.getElementById('brokerRuleStatus'),current=effectiveSelection(activeTicker);if(!sheet)return;title.textContent=`${activeTicker} broker availability`;status.textContent='';status.className='broker-rule-status';markCurrent(sheet,current);sheet.hidden=false;sheet.querySelector('[data-broker-choice].current,[data-broker-choice]')?.focus()}
  function buildRule(choice,oldRule){const existing=accountCode(oldRule?.preferred_account);const resolved=accountCode(A().transferEngine?.resolveBrokerRoute?.(A().core.read(),target(activeTicker))?.account);const preferred=choice==='IG'?'IG ISA':choice==='T212'?'Trade 212':(existing==='T212'||(!oldRule&&resolved==='T212'))?'Trade 212':'IG ISA';return {...(oldRule||{}),ticker:activeTicker,preferred_account:preferred,allowed_accounts:choice==='IG'?'IG ISA':choice==='T212'?'Trade 212':'IG ISA, Trade 212',active:true,note:oldRule?.note||'Updated in Transfer Centre',updated_at:now()}}
  async function save(choice){const oldRule=currentRule(activeTicker),status=document.getElementById('brokerRuleStatus'),buttons=document.querySelectorAll('[data-broker-choice]');buttons.forEach(button=>button.disabled=true);status.textContent='Saving…';status.className='broker-rule-status';const rule=buildRule(choice,oldRule);try{const result=await C().post('updatePlatformRule',rule);const saved={...rule,...(result?.rule||{})};const next=[saved,...arr(A().core.read().transfer?.platformRules).filter(row=>ticker(row.ticker)!==activeTicker)];installRules(next);markCurrent(document.getElementById('brokerRuleSheet'),selection(saved));status.textContent='Broker rule saved';toast('Broker rule saved');setTimeout(close,700)}catch(error){status.textContent=error?.message||'Broker rule could not be saved.';status.className='broker-rule-status error'}finally{buttons.forEach(button=>button.disabled=false)}}
  document.addEventListener('click',event=>{const edit=event.target.closest?.('[data-edit-broker]');if(edit){event.preventDefault();event.stopPropagation();open(edit.dataset.editBroker,edit);return}if(event.target.closest?.('[data-close-broker]')){close();return}const choice=event.target.closest?.('[data-broker-choice]');if(choice&&!choice.disabled)save(choice.dataset.brokerChoice)});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('brokerRuleSheet')?.hidden)close()});
  document.addEventListener('DOMContentLoaded',loadRules);
  w.Aurora2=w.Aurora2||{};w.Aurora2.transferBrokerRules={loadRules,currentRule,open};

  if(!document.querySelector('script[data-aurora-shared="transfer-strategy-owner"]')){
    const script=document.createElement('script');
    script.src='aurora-transfer-strategy.js?v=20260817-transfer-owner-1';
    script.dataset.auroraShared='transfer-strategy-owner';
    document.head.appendChild(script);
  }
  if(!document.querySelector('script[data-aurora-shared="transfer-window-layout"]')){
    const script=document.createElement('script');
    script.src='aurora-transfer-window-layout.js?v=20260817-command-stack-1';
    script.dataset.auroraShared='transfer-window-layout';
    document.head.appendChild(script);
  }
})(window);
