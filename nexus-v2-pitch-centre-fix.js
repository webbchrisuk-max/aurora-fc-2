/* Aurora City FC — Nexus V2 pitch geometry fix v1.1
 * Uses explicit DOM markings so the centre circle cannot inherit shell pseudo-element positioning.
 * Also fully resets the shared shell .pitch:before dimensions so no ghost circle remains top-left.
 */
(function(){
'use strict';
if(window.__AURORA_NEXUS_V2_PITCH_CENTRE_FIX_V11__)return;
window.__AURORA_NEXUS_V2_PITCH_CENTRE_FIX_V11__=true;

const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(page!=='auroracityfc_nexusv2.html')return;

function installStyle(){
  if(document.getElementById('nexusV2PitchCentreFixStyleV11'))return;
  const old=document.getElementById('nexusV2PitchCentreFixStyle');
  if(old)old.remove();
  const style=document.createElement('style');
  style.id='nexusV2PitchCentreFixStyleV11';
  style.textContent=`
    .pitch-panel .pitch:before{
      content:""!important;
      position:absolute!important;
      left:13px!important;
      right:13px!important;
      top:13px!important;
      bottom:13px!important;
      width:auto!important;
      height:auto!important;
      aspect-ratio:auto!important;
      transform:none!important;
      border:1px solid rgba(209,250,229,.30)!important;
      border-radius:16px!important;
      background:none!important;
      pointer-events:none!important;
    }
    .pitch-panel .pitch:after{content:none!important;display:none!important;}
    .n2-halfway-line{
      position:absolute;left:13px;right:13px;top:50%;height:1px;
      background:rgba(209,250,229,.30);z-index:1;pointer-events:none;
      transform:translateY(-.5px);
    }
    .n2-centre-circle{
      position:absolute;left:50%;top:50%;width:128px;height:128px;
      transform:translate(-50%,-50%);border:1px solid rgba(209,250,229,.32);
      border-radius:50%;z-index:1;pointer-events:none;
    }
    .n2-centre-spot{
      position:absolute;left:50%;top:50%;width:6px;height:6px;
      transform:translate(-50%,-50%);border-radius:50%;
      background:rgba(236,253,245,.76);z-index:2;pointer-events:none;
    }
  `;
  document.head.appendChild(style);
}

function installGeometry(){
  const pitch=document.querySelector('.pitch-panel .pitch');
  if(!pitch)return false;
  pitch.querySelectorAll('.n2-halfway-line,.n2-centre-circle,.n2-centre-spot').forEach(n=>n.remove());
  const halfway=document.createElement('div');halfway.className='n2-halfway-line';halfway.setAttribute('aria-hidden','true');
  const circle=document.createElement('div');circle.className='n2-centre-circle';circle.setAttribute('aria-hidden','true');
  const spot=document.createElement('div');spot.className='n2-centre-spot';spot.setAttribute('aria-hidden','true');
  pitch.prepend(spot);pitch.prepend(circle);pitch.prepend(halfway);
  return true;
}

function init(){
  installStyle();
  if(!installGeometry())setTimeout(installGeometry,350);
  setTimeout(installGeometry,1000);
  window.addEventListener('aurora2:state',()=>setTimeout(installGeometry,0));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
