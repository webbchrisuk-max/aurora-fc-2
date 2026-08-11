(function(w){
  'use strict';
  function render(){
    const A=w.Aurora2;if(!A?.core||!A?.ui)return;const s=A.core.read(),ui=A.ui;
    ui.text('teamValue',ui.money(s.portfolio?.teamValue));
    ui.text('annualIncome',ui.money(s.portfolio?.annualIncome));
    ui.text('monthlyIncome',ui.money(s.portfolio?.monthlyIncome));
    ui.text('squadSize',Number.isFinite(Number(s.portfolio?.squadSize))?String(s.portfolio.squadSize):'—');
    ui.text('bestDividend',s.portfolio?.bestDividendPlayer?.ticker||'—');
    ui.text('bestDividendMeta',s.portfolio?.bestDividendPlayer?.annualIncome!=null?`${ui.money(s.portfolio.bestDividendPlayer.annualIncome)} / year`:'Awaiting Income Centre');
    ui.text('topPlayer',s.portfolio?.topAuroraPlayer?.ticker||'—');
    ui.text('topPlayerMeta',s.portfolio?.topAuroraPlayer?.score!=null?`${s.portfolio.topAuroraPlayer.score}/100 Aurora score`:'Awaiting Scouting');
    ui.text('decisionTitle',s.decision?.title||'No decision');ui.text('decisionNote',s.decision?.note||'No decision engine connected.');
    const nd=s.income?.nextDividend;ui.text('nextDividend',nd?.ticker||'—');ui.text('nextDividendMeta',nd?`${ui.money(nd.amount)} • ${nd.date||'date pending'}`:'Awaiting Income Centre');
    ui.text('connectionState',s.connection?.status==='LIVE'?'LIVE':'FOUNDATION');renderMission(s.mission,ui);renderAlerts(s.alerts||[],ui);ui.text('lastUpdated',new Date(s.updatedAt).toLocaleString('en-GB'));
  }
  function renderMission(m,ui){ui.text('missionBudget',m?.approvedBudget!=null?ui.money(m.approvedBudget):'No active mission');const stages=['FINANCE_APPROVED','SCOUTING_READY','TRANSFER_READY','REGISTERED'];const current=String(m?.status||'');stages.forEach((name,i)=>{const el=document.querySelector(`[data-stage="${name}"]`);if(!el)return;el.classList.remove('complete','active');const idx=stages.indexOf(current);if(idx>i)el.classList.add('complete');else if(idx===i)el.classList.add('active')});}
  function renderAlerts(alerts,ui){const host=document.getElementById('alerts');if(!host)return;if(!alerts.length){host.innerHTML='<div class="notice">No live alerts yet. The 2.0 Data Guardian will feed this panel.</div>';return;}host.innerHTML=alerts.slice(0,4).map(a=>`<div class="alert-row"><i class="alert-dot"></i><div><strong>${ui.escape(a.title)}</strong><span>${ui.escape(a.note||'')}</span></div><time>${ui.escape(a.when||'')}</time></div>`).join('');}
  document.addEventListener('DOMContentLoaded',render);w.addEventListener('aurora2:state',render);
})(window);
