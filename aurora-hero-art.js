/* Aurora 2 shared hero artwork configuration. Presentation only. */
(function(){
  'use strict';

  const ASSET_VERSION='20260815-1';
  const heroes={
    nexus:{selector:'.hq4-hero',image:'assets/heroes/nexus-hq-stadium.png',position:'center',tablet:'62% center',mobile:'70% center'},
    finance:{selector:'.finance-command-hero',image:'assets/heroes/finance-command.png',position:'center',tablet:'64% center',mobile:'72% center'},
    transfer:{selector:'.transfer-command-hero',image:'assets/heroes/transfer-centre.png',position:'center',tablet:'65% center',mobile:'73% center'},
    squad:{selector:'.squad-command-hero',image:'assets/heroes/squad-hub.png',position:'center',tablet:'64% center',mobile:'70% center'},
    scouting:{selector:'.scouting-command-hero',image:'assets/heroes/scouting-centre.png',position:'center',tablet:'65% center',mobile:'72% center'},
    registration:{selector:'.registration-command-hero',image:'assets/heroes/registration-desk.png',position:'center',tablet:'65% center',mobile:'74% center'},
    income:{selector:'.income-command-hero',image:'assets/heroes/income-centre.png',position:'center',tablet:'65% center',mobile:'72% center'},
    boardroom:{selector:'.chairman-command-hero',image:'assets/heroes/club-control.png',position:'center',tablet:'64% center',mobile:'71% center'},
    health:{selector:'.health-hero',image:'assets/heroes/system-health.png',position:'center',tablet:'65% center',mobile:'72% center'}
  };

  Object.entries(heroes).forEach(function([department,config]){
    const hero=document.querySelector(config.selector);
    if(!hero)return;
    hero.classList.add('aurora-hero-art');
    hero.dataset.auroraHero=department;
    hero.style.setProperty('--aurora-hero-image','url("'+config.image+'?v='+ASSET_VERSION+'")');
    hero.style.setProperty('--aurora-hero-position',config.position);
    hero.style.setProperty('--aurora-hero-tablet-position',config.tablet);
    hero.style.setProperty('--aurora-hero-mobile-position',config.mobile);
  });
})();
