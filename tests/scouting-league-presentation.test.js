const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function authority(){
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync('aurora-scouting-leagues.js','utf8'),context);
  return context.window.AuroraScoutingLeagues;
}

test('league placement follows the active canonical Scouting rank',()=>{
  const league=authority();
  const targets=Array.from({length:12},(_,i)=>({ticker:`T${i+1}`,status:'pass',rank:i+1,
    maximumRank:12-i,sustainableScore:100-i,maximumScore:80+i,yieldPct:i+1}));
  const sustainable=league.table(targets,'sustainable');
  assert.deepEqual(Array.from(sustainable.filter(x=>x.league.id==='champions'),x=>x.target.ticker),['T1','T2','T3']);
  const maximum=league.table(targets,'maximum');
  assert.equal(maximum[0].target.ticker,'T12');
  assert.equal(maximum[0].league.name,'Champions League');
});

test('blocked targets receive no eligible league and income per £1,000 uses forward yield',()=>{
  const league=authority();
  const rows=league.table([
    {ticker:'PASS',status:'pass',rank:1,sustainableScore:90,yieldPct:8.54},
    {ticker:'BLOCK',status:'block',rank:2,sustainableScore:80,yieldPct:12}
  ],'sustainable');
  assert.equal(rows[1].league,null);
  assert.ok(Math.abs(league.incomePerThousand(rows[0].target)-85.4)<1e-9);
});
