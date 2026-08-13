
(function(){
'use strict';

function activateFinanceTab(id){
  const button=document.querySelector(`[data-tab="${id}"]`);
  if(button){button.click();return}
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===id));
  document.querySelectorAll('.finance-tabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));
}
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-finance-tab]');
  if(!target)return;
  event.preventDefault();
  activateFinanceTab(target.dataset.financeTab);
  requestAnimationFrame(()=>window.scrollTo({top:Math.max(0,document.querySelector('.finance-tabs')?.offsetTop||0),behavior:'smooth'}));
});
document.addEventListener('DOMContentLoaded',()=>{
  const label=document.getElementById('currentDepartment');
  if(label)label.textContent='FINANCE COMMAND';
});
})();
