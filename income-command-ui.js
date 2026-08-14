
(function(){
'use strict';

function jump(id){
  const target=document.getElementById(id);
  if(!target)return;
  const offset=(document.querySelector('.aurora-shell-header')?.offsetHeight||0)+(document.querySelector('.income-jumpbar')?.offsetHeight||0)+18;
  const top=target.getBoundingClientRect().top+window.scrollY-offset;
  window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
}

document.addEventListener('click',event=>{
  const btn=event.target.closest('[data-income-jump]');
  if(!btn)return;
  event.preventDefault();
  jump(btn.dataset.incomeJump);
});

document.addEventListener('DOMContentLoaded',()=>{
  const label=document.getElementById('currentDepartment');
  if(label)label.textContent='INCOME CENTRE • DIVIDEND DEPARTMENT';
  document.title='Aurora City FC — Income Centre';
});
})();
