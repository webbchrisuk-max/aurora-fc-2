/* Aurora 2 — House Dashboard Priority Layout v1.1
 * Presentation-only ordering for Finance > House Projects.
 * Also loads the Finance bill action bridge so dynamically rendered bill
 * buttons reliably reach finance.js on iPad/Safari.
 */
(function(w){
  'use strict';
  if(w.AuroraFinanceHousePriorityLayout)return;

  const file=String(location.pathname||'').split('/').pop().toLowerCase();
  if(file!=='finance.html')return;

  const $=id=>document.getElementById(id);
  let applying=false;

  function loadBillActionsFix(){
    if(document.querySelector('script[data-aurora-bill-actions-fix]'))return;
    const script=document.createElement('script');
    script.src='finance-bill-actions-fix.js?v=20260819-bill-actions-1';
    script.async=false;
    script.dataset.auroraBillActionsFix='1';
    document.head.appendChild(script);
  }

  function injectStyles(){
    if($('auroraHousePriorityLayoutStyles'))return;
    const style=document.createElement('style');
    style.id='auroraHousePriorityLayoutStyles';
    style.textContent=`
      #houseMigrationCard{display:none!important}
      #housePanel #houseEntryEditor{display:none!important}
      .aurora-house-modal #houseEntryEditor{display:block!important}
      #housePanel .house-editor-grid-shell{display:none!important}
      #housePanel .house-reserved-priority{
        width:100%;
        margin:0 0 20px;
      }
      #housePanel .house-reserved-priority .finance-panel-head h3{
        font-size:clamp(26px,2.4vw,34px)!important;
      }
      #housePanel .house-reserved-priority .finance-panel-kicker{
        color:#52ddff!important;
        font-size:12px!important;
        letter-spacing:.16em!important;
      }
    `;
    document.head.appendChild(style);
  }

  function renameReservedLedger(card){
    if(!card)return;
    const kicker=card.querySelector('.finance-panel-kicker');
    const title=card.querySelector('.finance-panel-head h3');
    if(kicker)kicker.textContent='Reserved Renovation Work';
    if(title)title.textContent='Reserved by Room';
  }

  function applyLayout(){
    if(applying)return false;
    const panel=$('housePanel');
    const moneyPosition=$('financeV2HouseCommand');
    const ledgerHost=$('houseLedgerList');
    if(!panel||!moneyPosition||!ledgerHost)return false;

    applying=true;
    try{
      injectStyles();

      const migration=$('houseMigrationCard');
      if(migration){
        migration.hidden=true;
        migration.setAttribute('aria-hidden','true');
      }

      const ledgerCard=ledgerHost.closest('article.finance-panel,.finance-panel');
      const roomCard=$('houseRoomGrid')?.closest('section.finance-panel,.finance-panel');
      const oldLedgerGrid=ledgerCard?.closest('.finance-command-grid.two');

      if(ledgerCard){
        ledgerCard.classList.add('house-reserved-priority');
        renameReservedLedger(ledgerCard);
        if(moneyPosition.nextElementSibling!==ledgerCard)moneyPosition.insertAdjacentElement('afterend',ledgerCard);
      }

      if(oldLedgerGrid && oldLedgerGrid!==ledgerCard?.parentElement){
        oldLedgerGrid.classList.add('house-editor-grid-shell');
      }else if(oldLedgerGrid){
        oldLedgerGrid.classList.add('house-editor-grid-shell');
      }

      if(roomCard&&ledgerCard&&ledgerCard.nextElementSibling!==roomCard){
        ledgerCard.insertAdjacentElement('afterend',roomCard);
      }

      return true;
    }finally{
      applying=false;
    }
  }

  function init(){
    loadBillActionsFix();
    injectStyles();
    [0,80,220,500,1000].forEach(delay=>setTimeout(applyLayout,delay));
    const panel=$('housePanel');
    if(panel){
      const observer=new MutationObserver(()=>{
        if(!applying)requestAnimationFrame(applyLayout);
      });
      observer.observe(panel,{childList:true,subtree:false});
    }
  }

  w.AuroraFinanceHousePriorityLayout={refresh:applyLayout};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})(window);
