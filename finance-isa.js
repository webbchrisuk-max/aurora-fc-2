(function(){
'use strict';
const KEY='aurora.finance.isaTracker.v1';
const SNAPSHOT={
  annual:20000,
  monzoCash:753.04,
  monzoStocks:5200.00,
  t212:9440.00,
  igCurrent:0.00,
  igFlexible:50510.31,
  snapshotDate:'24/09/2026'
};
const ids={
  annual:'isaAnnualInput',
  monzoCash:'isaMonzoCashInput',
  monzoStocks:'isaMonzoStocksInput',
  t212:'isaT212Input',
  igCurrent:'isaIgCurrentInput',
  igFlexible:'isaIgFlexibleInput'
};
const money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(n)||0);
const readNum=id=>Math.max(0,Number(document.getElementById(id)?.value)||0);
function values(){
  return {
    annual:readNum(ids.annual),
    monzoCash:readNum(ids.monzoCash),
    monzoStocks:readNum(ids.monzoStocks),
    t212:readNum(ids.t212),
    igCurrent:readNum(ids.igCurrent),
    igFlexible:readNum(ids.igFlexible)
  };
}
function writeValues(v){
  Object.keys(ids).forEach(k=>{
    const el=document.getElementById(ids[k]);
    if(el) el.value=Number(v[k]??SNAPSHOT[k]).toFixed(2);
  });
}
function setText(id,value){
  const el=document.getElementById(id);
  if(el) el.textContent=value;
}
function recalc(){
  const v=values();
  const used=Number((v.monzoCash+v.monzoStocks+v.t212+v.igCurrent).toFixed(2));
  const rawLeft=Number((v.annual-used).toFixed(2));
  const normalLeft=Math.max(0,rawLeft);
  const over=Math.max(0,-rawLeft);
  const igMax=Number((normalLeft+v.igFlexible).toFixed(2));

  setText('isaAnnualOut',money(v.annual));
  setText('isaUsedOut',money(used));
  setText('isaNormalLeftOut',money(normalLeft));
  setText('isaIgFlexibleOut',money(v.igFlexible));
  setText('isaIgMaxOut',money(igMax));
  setText('isaAnyOut',money(normalLeft));
  setText('isaReplaceOut',money(v.igFlexible));
  setText('isaIgCombinedOut',money(igMax));
  setText('isaOverOut',money(over));

  const overBox=document.getElementById('isaOverBox');
  if(overBox) overBox.hidden=over===0;
  const badge=document.getElementById('isaStatusPill');
  if(badge){
    badge.textContent=over>0?'CHECK ALLOWANCE':(normalLeft===0?'NORMAL ALLOWANCE FULL':'ON TRACK');
    badge.classList.toggle('warn',over>0);
  }
}
function save(){
  const data={...values(),savedAt:new Date().toISOString()};
  try{localStorage.setItem(KEY,JSON.stringify(data));}catch(_){}
  recalc();
  const meta=document.getElementById('isaSavedMeta');
  if(meta) meta.textContent='Saved on this device: '+new Date().toLocaleString('en-GB');
}
function reset(){
  writeValues(SNAPSHOT);
  try{localStorage.removeItem(KEY);}catch(_){}
  recalc();
  const meta=document.getElementById('isaSavedMeta');
  if(meta) meta.textContent='Snapshot restored: 24 Sep 2026';
}
function load(){
  let data=null;
  try{data=JSON.parse(localStorage.getItem(KEY)||'null');}catch(_){}
  writeValues(data||SNAPSHOT);
  recalc();
  const meta=document.getElementById('isaSavedMeta');
  if(meta){
    meta.textContent=data?.savedAt
      ? 'Saved on this device: '+new Date(data.savedAt).toLocaleString('en-GB')
      : 'Snapshot: 24 Sep 2026';
  }
}
function init(){
  if(!document.getElementById('isaPanel')) return;
  load();
  Object.values(ids).forEach(id=>document.getElementById(id)?.addEventListener('input',recalc));
  document.getElementById('isaSaveBtn')?.addEventListener('click',save);
  document.getElementById('isaResetBtn')?.addEventListener('click',reset);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
else init();
})();