/* Aurora City FC — Scouting Intelligence 3.0.1
 * Canonical Scouting score authority.
 *
 * One factor model, two strategy lenses, fixed safety gates, bounded learning.
 * No neutral placeholder scores are manufactured when evidence is missing.
 * Learning can calibrate weights only after genuine 30/90-day outcomes exist;
 * it can never weaken hard safety / eligibility gates.
 */
(function(w){
'use strict';
if(w.AuroraScoutingIntelligence3)return;

const PAGE=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
if(PAGE!=='scouting.html')return;

const VERSION='3.0.1';
const ENGINE='AURORA_SCOUTING_INTELLIGENCE_3';
const MASTER_URL='AuroraMaster.json';
const MASTER_REFRESH_MS=10*60*1000;
const SNAPSHOT_GAP_MS=7*24*60*60*1000;
const MAX_SAMPLES=320;
const MIN_LEARNING_SAMPLES=10;
const MAX_WEIGHT_DRIFT=3;

const FACTORS=['dividendSafety','incomeScore','valuationScore','portfolioFit','dividendGrowth','businessQuality'];
const BASE_WEIGHTS=Object.freeze({
  sustainable:Object.freeze({dividendSafety:25,incomeScore:20,valuationScore:20,portfolioFit:15,dividendGrowth:10,businessQuality:10}),
  maximum:Object.freeze({dividendSafety:20,incomeScore:45,valuationScore:10,portfolioFit:10,dividendGrowth:5,businessQuality:10})
});
const HARD_GATES=Object.freeze({minDividendSafety:35,cleanDividendSafety:60,minConfidence:50,cleanConfidence:75,cautionYield:10,pendingCoverage:0.55});

const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const num=v=>{
  if(v==null)return null;
  const raw=String(v).trim();
  if(!raw)return null;
  const cleaned=raw.replace(/[^0-9.-]/g,'');
  if(!cleaned||cleaned==='-'||cleaned==='.'||cleaned==='-.')return null;
  const n=Number(cleaned);
  return Number.isFinite(n)?n:null;
};
const n0=v=>{const n=num(v);return n==null?0:n};
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
const upper=v=>String(v||'').trim().toUpperCase();
const norm=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const ticker=v=>upper(v).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\..*$/,'');
const nowIso=()=>new Date().toISOString();
const dayKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const msDay=24*60*60*1000;

let master={};
let maps={intelligence:new Map(),scout:new Map(),live:new Map()};
let lastMasterFetch=0,applying=false,queued=false,fetchRunning=false,legacyApi=null;

function A(){return w.Aurora2||{}}
function state(){try{return A().core?.read?.()||null}catch(_){return null}}
function parseDate(v){
  if(!v)return NaN;if(v instanceof Date)return v.getTime();const s=String(v).trim();
  const uk=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(uk)return new Date(Number(uk[3]),Number(uk[2])-1,Number(uk[1]),Number(uk[4]||12),Number(uk[5]||0),Number(uk[6]||0)).getTime();
  const t=Date.parse(s);return Number.isFinite(t)?t:NaN;
}
function field(row,keys){for(const k of keys){if(row&&row[k]!=null&&row[k]!=='')return row[k]}return null}
function pctYield(v){const raw=String(v??'').trim();let y=num(raw);if(y==null)return null;if(y>0&&y<=1&&!raw.includes('%'))y*=100;return y>0&&y<100?y:null}
function scoreFromYield(y){if(!(y>0))return null;if(y<=2)return clamp(35+y*12.5);if(y<=6)return clamp(60+(y-2)*8);if(y<=8)return clamp(92+(y-6)*4);if(y<=10)return clamp(100-(y-8)*5);return clamp(90-(y-10)*10,30,90)}
function payoutSafety(v){const s=upper(v);if(!s)return null;if(s.includes('VERY HIGH'))return 25;if(s.includes('HIGH'))return 45;if(s.includes('MEDIUM'))return 65;if(s.includes('LOW'))return 82;return null}
function normaliseAccount(v){const s=norm(v);if(/212/.test(s))return'T212';if(/\big\b|ig isa/.test(s))return'IG';return'CHECK'}
function currentHoldings(s){return arr(s?.squad?.holdings).filter(h=>!['SOLD','ARCHIVED'].includes(upper(h?.status))&&n0(h?.shares)>0)}
function holdingValue(h){return Math.max(0,n0(h?.marketValueGbp)||n0(h?.shares)*n0(h?.livePriceGbp))}
function missionBudget(s){for(const v of [s?.mission?.budget,s?.mission?.amount,s?.transfer?.route?.budget,s?.transfer?.route?.totalBudget,s?.finance?.releaseAmount,s?.finance?.payday?.releaseAmount]){const n=num(v);if(n!=null&&n>0)return n}return 1000}
function portfolioFit(target,s){
  const holdings=currentHoldings(s),total=holdings.reduce((a,h)=>a+holdingValue(h),0);if(total<=0)return{score:70,projectedTickerPct:0,projectedSectorPct:0,testAmount:missionBudget(s)};
  const tk=ticker(target?.ticker),sector=norm(target?.sector),add=missionBudget(s),tickerValue=holdings.filter(h=>ticker(h?.ticker)===tk).reduce((a,h)=>a+holdingValue(h),0),sectorValue=sector?holdings.filter(h=>norm(h?.sector)===sector).reduce((a,h)=>a+holdingValue(h),0):0,after=total+add;
  const tickerPct=((tickerValue+add)/after)*100,sectorPct=sector?((sectorValue+add)/after)*100:0;let score=92;if(tickerPct>2)score-=Math.min(48,(tickerPct-2)*2.5);if(sector&&sectorPct>25)score-=Math.min(30,(sectorPct-25)*1.2);if(tickerValue===0)score+=3;
  return{score:Math.round(clamp(score,20,95)),projectedTickerPct:Number(tickerPct.toFixed(2)),projectedSectorPct:Number(sectorPct.toFixed(2)),testAmount:add};
}
function valuationFromFairValue(price,fair){if(!(price>0&&fair>0))return null;return Math.round(clamp(55+(fair/price-1)*100*2.2,20,95))}
function newestByTicker(rows,stampKeys){const map=new Map();arr(rows).forEach(row=>{const tk=ticker(field(row,['ticker','Ticker','symbol']));if(!tk)return;let stamp=0;for(const k of stampKeys){const t=parseDate(row?.[k]);if(Number.isFinite(t)){stamp=t;break}}const prev=map.get(tk);if(!prev||stamp>=prev.__stamp)map.set(tk,{...row,__stamp:stamp})});return map}
function rebuildMaps(payload){master=obj(payload);maps={intelligence:newestByTicker(master.AuroraIntelligence,['generated_at','updated_at','timestamp']),scout:newestByTicker(master.AuroraScout,['last_updated','date_checked','updated_at']),live:newestByTicker(master.LivePrices,['tradeTime','trade_time','updated_at','timestamp'])}}
async function refreshMaster(force=false){if(fetchRunning||(!force&&Date.now()-lastMasterFetch<MASTER_REFRESH_MS))return;fetchRunning=true;try{const res=await fetch(`${MASTER_URL}?v=${Date.now()}`,{cache:'no-store'});if(!res.ok)throw new Error(`AuroraMaster ${res.status}`);rebuildMaps(await res.json());lastMasterFetch=Date.now()}catch(err){console.warn('[Aurora Scouting 3] evidence refresh failed',err)}finally{fetchRunning=false}}
function evidenceFor(raw,s){
  const tk=ticker(raw?.ticker),intel=maps.intelligence.get(tk)||{},scout=maps.scout.get(tk)||{},live=maps.live.get(tk)||{},holding=currentHoldings(s).find(h=>ticker(h?.ticker)===tk)||{};
  const livePrice=[num(raw?.livePriceGbp),num(field(live,['price','live_price','livePrice'])),num(intel.live_price),num(scout.live_price),num(holding.livePriceGbp)].find(v=>v!=null&&v>0)||null;
  const yieldPct=[pctYield(raw?.yieldPct),pctYield(intel.yield_pct),pctYield(scout.dividend_yield)].find(v=>v!=null&&v>0)||null;
  const safetyExplicit=[num(raw?.dividendSafety),num(raw?.dividendSafetyScore)].find(v=>v!=null&&v>0)||null,safetyProxy=safetyExplicit==null?payoutSafety(field(raw,['payoutRisk','payout_risk'])||scout.payout_risk):null,dividendSafety=safetyExplicit??safetyProxy;
  const incomeExplicit=[num(raw?.incomeScore),num(intel.income_score)].find(v=>v!=null&&v>0)||null,incomeScore=incomeExplicit??scoreFromYield(yieldPct);
  const valuationExplicit=[num(raw?.valuationScore),num(intel.valuation_score)].find(v=>v!=null&&v>0)||null,fair=num(scout.fair_value),valuationScore=valuationExplicit??valuationFromFairValue(livePrice,fair);
  const fit=portfolioFit({...raw,sector:raw?.sector||intel.sector||scout.sector},s),dividendGrowth=[num(raw?.dividendGrowth),num(raw?.dividendGrowthScore)].find(v=>v!=null&&v>0)||null,businessQuality=[num(raw?.businessQuality),num(raw?.businessQualityScore)].find(v=>v!=null&&v>0)||null;
  const explicitConfidence=[num(raw?.confidence),num(raw?.dataQuality),num(intel.confidence_score)].find(v=>v!=null&&v>0)||null,dividendStatus=String(field(raw,['dividendStatus','dividend_status'])||''),payoutRisk=String(field(raw,['payoutRisk','payout_risk'])||scout.payout_risk||''),preferredAccount=normaliseAccount(raw?.preferredAccount||raw?.account||intel.account);
  const factors={dividendSafety,incomeScore,valuationScore,portfolioFit:fit.score,dividendGrowth,businessQuality};
  const sources={dividendSafety:safetyExplicit!=null?'explicit':safetyProxy!=null?'AuroraScout payout-risk proxy':'missing',incomeScore:incomeExplicit!=null?'Aurora Intelligence / explicit':yieldPct!=null?'yield-derived':'missing',valuationScore:valuationExplicit!=null?'Aurora Intelligence / explicit':fair!=null&&livePrice!=null?'fair-value derived':'missing',portfolioFit:'projected portfolio after budget',dividendGrowth:dividendGrowth!=null?'explicit':'missing',businessQuality:businessQuality!=null?'explicit':'missing'};
  return{tk,intel,scout,live,holding,livePrice,yieldPct,dividendStatus,payoutRisk,preferredAccount,factors,sources,explicitConfidence,fit};
}
function defaultLearning(){return{version:1,engineVersion:VERSION,samples:[],calibration:{sustainable:{...BASE_WEIGHTS.sustainable},maximum:{...BASE_WEIGHTS.maximum}},matured30:0,matured90:0,lastCalibratedAt:null,updatedAt:null}}
function learningState(s){return{...defaultLearning(),...obj(s?.scouting?.learningV3),samples:arr(s?.scouting?.learningV3?.samples),calibration:{sustainable:{...BASE_WEIGHTS.sustainable,...obj(s?.scouting?.learningV3?.calibration?.sustainable)},maximum:{...BASE_WEIGHTS.maximum,...obj(s?.scouting?.learningV3?.calibration?.maximum)}}}}
function factorCoverage(factors,weights){let present=0,total=0;for(const k of FACTORS){const wgt=n0(weights[k]);total+=wgt;if(num(factors[k])!=null)present+=wgt}return total>0?present/total:0}
function weightedScore(factors,weights,confidence){let sum=0,weight=0;for(const k of FACTORS){const v=num(factors[k]),wgt=n0(weights[k]);if(v==null||wgt<=0)continue;sum+=clamp(v)*wgt;weight+=wgt}if(weight<=0)return null;const coverage=factorCoverage(factors,weights),raw=sum/weight;return Math.round(clamp(raw*(.66+.34*coverage)*(.78+.22*(clamp(confidence)/100))))}
function normaliseWeights(input,base){const out={};let total=0;for(const k of FACTORS){out[k]=Math.max(1,Number(input[k]??base[k]??0));total+=out[k]}if(total<=0)return{...base};let roundedTotal=0;for(const k of FACTORS){out[k]=Math.round(out[k]/total*1000)/10;roundedTotal+=out[k]}const diff=Math.round((100-roundedTotal)*10)/10;out[FACTORS[0]]=Math.round((out[FACTORS[0]]+diff)*10)/10;return out}
function correlation(xs,ys){const n=Math.min(xs.length,ys.length);if(n<3)return 0;const mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;let top=0,dx=0,dy=0;for(let i=0;i<n;i++){const x=xs[i]-mx,y=ys[i]-my;top+=x*y;dx+=x*x;dy+=y*y}return dx>0&&dy>0?top/Math.sqrt(dx*dy):0}
function calibrate(samples){
  const matured=samples.filter(x=>num(x?.outcome90)!=null||num(x?.outcome30)!=null),use90=matured.filter(x=>num(x?.outcome90)!=null),pool=use90.length>=MIN_LEARNING_SAMPLES?use90:matured.filter(x=>num(x?.outcome30)!=null);
  if(pool.length<MIN_LEARNING_SAMPLES)return{sustainable:{...BASE_WEIGHTS.sustainable},maximum:{...BASE_WEIGHTS.maximum},count:pool.length,active:false};
  const quality=Math.min(1,pool.length/30),adjusted={};for(const lens of ['sustainable','maximum']){const base=BASE_WEIGHTS[lens],draft={...base};for(const k of FACTORS){const rows=pool.filter(x=>num(x?.factors?.[k])!=null);if(rows.length<MIN_LEARNING_SAMPLES)continue;const corr=correlation(rows.map(x=>Number(x.factors[k])),rows.map(x=>Number(x.outcome90??x.outcome30))),delta=clamp(corr*MAX_WEIGHT_DRIFT*quality,-MAX_WEIGHT_DRIFT,MAX_WEIGHT_DRIFT);draft[k]=Math.max(1,base[k]+delta)}adjusted[lens]=normaliseWeights(draft,base)}return{...adjusted,count:pool.length,active:true};
}
function currentPriceForTicker(tk,s){const t=arr(s?.scouting?.targets).find(x=>ticker(x?.ticker)===tk),h=currentHoldings(s).find(x=>ticker(x?.ticker)===tk),l=maps.live.get(tk)||{},i=maps.intelligence.get(tk)||{},sc=maps.scout.get(tk)||{};return[num(t?.livePriceGbp),num(field(l,['price','live_price'])),num(i.live_price),num(sc.live_price),num(h?.livePriceGbp)].find(v=>v!=null&&v>0)||null}
function currentYieldForTicker(tk,s){const t=arr(s?.scouting?.targets).find(x=>ticker(x?.ticker)===tk),i=maps.intelligence.get(tk)||{},sc=maps.scout.get(tk)||{};return[pctYield(t?.yieldPct),pctYield(i.yield_pct),pctYield(sc.dividend_yield)].find(v=>v!=null&&v>0)||null}
function matureLearning(learning,s){
  const now=Date.now();let changed=false,m30=0,m90=0;const samples=learning.samples.map(sample=>{const next={...sample},age=now-parseDate(sample.assessedAt),price=currentPriceForTicker(sample.ticker,s),yieldNow=currentYieldForTicker(sample.ticker,s),incomeContinuity=yieldNow!=null&&yieldNow>0?clamp(65+(Math.min(yieldNow,12)/12)*25):25;
    const outcome=()=>{if(!(price>0&&sample.startPrice>0))return null;const ret=(price/sample.startPrice-1)*100,capital=clamp(50+ret*3,0,100);return Math.round(clamp(capital*.45+incomeContinuity*.55))};
    if(age>=30*msDay&&num(next.outcome30)==null){const v=outcome();if(v!=null){next.outcome30=v;next.matured30At=nowIso();changed=true}}if(age>=90*msDay&&num(next.outcome90)==null){const v=outcome();if(v!=null){next.outcome90=v;next.matured90At=nowIso();changed=true}}if(num(next.outcome30)!=null)m30++;if(num(next.outcome90)!=null)m90++;return next});
  const calibration=calibrate(samples),calibrationChanged=JSON.stringify(calibration.sustainable)!==JSON.stringify(learning.calibration?.sustainable)||JSON.stringify(calibration.maximum)!==JSON.stringify(learning.calibration?.maximum);
  return{...learning,samples,calibration:{sustainable:calibration.sustainable,maximum:calibration.maximum},matured30:m30,matured90:m90,learningActive:calibration.active,learningSampleCount:calibration.count,lastCalibratedAt:(changed||calibrationChanged)?nowIso():learning.lastCalibratedAt,updatedAt:(changed||calibrationChanged)?nowIso():learning.updatedAt};
}
function confidenceFor(ev,coverage){const cap=40+coverage*60,explicit=ev.explicitConfidence;return Math.round(clamp(explicit!=null?Math.min(explicit,cap):coverage*100))}
function assess(raw,s,weights){
  const ev=evidenceFor(raw,s),factors=ev.factors,sustainableCoverage=factorCoverage(factors,weights.sustainable),maximumCoverage=factorCoverage(factors,weights.maximum),coverage=Math.max(sustainableCoverage,maximumCoverage),confidence=confidenceFor(ev,coverage),sustainableScore=weightedScore(factors,weights.sustainable,confidence),maximumScore=weightedScore(factors,weights.maximum,confidence);
  const reasons=[];let status='pass',pending=false;const tk=ev.tk,dividendStatus=ev.dividendStatus.toLowerCase(),payoutRisk=ev.payoutRisk.toLowerCase();
  if(tk==='TSCO'){status='block';reasons.push('TSCO is a locked legacy / 2029 holding and is excluded from active buys.')}if(/suspend|cancel|omit/.test(dividendStatus)){status='block';reasons.push('Dividend is suspended or cancelled.')}if(payoutRisk.includes('very high')){status='block';reasons.push('Payout risk is very high.')}if(factors.dividendSafety!=null&&factors.dividendSafety<HARD_GATES.minDividendSafety){status='block';reasons.push('Dividend-safety evidence is below the purchase gate.')}if(ev.explicitConfidence!=null&&confidence<HARD_GATES.minConfidence){status='block';reasons.push('Evidence confidence is below the purchase gate.')}if(raw?.brokerEligible===false||raw?.brokerEligibility===false){status='block';reasons.push('Broker eligibility is explicitly unavailable.')}
  if(status!=='block'){if(!(ev.livePrice>0)){pending=true;reasons.push('Live price evidence is missing.')}if(!(ev.yieldPct>0)){pending=true;reasons.push('Recurring dividend yield evidence is missing.')}if(factors.dividendSafety==null){pending=true;reasons.push('Dividend-safety evidence is still missing.')}if(coverage<HARD_GATES.pendingCoverage){pending=true;reasons.push(`Only ${Math.round(coverage*100)}% of weighted factor evidence is available.`)}if(pending)status='pending'}
  if(status==='pass'&&(factors.dividendSafety<HARD_GATES.cleanDividendSafety||confidence<HARD_GATES.cleanConfidence||ev.yieldPct>HARD_GATES.cautionYield||ev.preferredAccount==='CHECK'||coverage<.8)){status='caution';if(factors.dividendSafety<HARD_GATES.cleanDividendSafety)reasons.push('Dividend safety is below the clean-pass threshold.');if(confidence<HARD_GATES.cleanConfidence)reasons.push('Evidence confidence needs review.');if(ev.yieldPct>HARD_GATES.cautionYield)reasons.push('Yield is above 10% and requires controlled sizing.');if(ev.preferredAccount==='CHECK')reasons.push('Preferred broker still needs confirmation.');if(coverage<.8)reasons.push(`Evidence coverage is ${Math.round(coverage*100)}%; controlled sizing only.`)}
  if(!reasons.length)reasons.push('Clears the canonical income, safety, valuation and portfolio-fit gates.');const strategy=s?.scouting?.strategy==='maximum'?'maximum':'sustainable',activeScore=strategy==='maximum'?maximumScore:sustainableScore;let recommendation='WATCH';if(status==='block')recommendation='BLOCK';else if(status==='pending')recommendation='DATA PENDING';else if(status==='caution')recommendation='CAUTION';else if(activeScore>=80)recommendation='STRONG BUY';else if(activeScore>=70)recommendation='BUY';
  const reason=`${recommendation} • Sustainable ${sustainableScore??'—'}/100 • Maximum ${maximumScore??'—'}/100 • ${ev.yieldPct?ev.yieldPct.toFixed(2)+'% yield • ':''}${reasons.join(' ')}`;
  return{...raw,ticker:tk,name:String(raw?.name||ev.intel?.company||ev.scout?.company_name||tk||'Target'),sector:String(raw?.sector||ev.intel?.sector||ev.scout?.sector||''),preferredAccount:ev.preferredAccount,yieldPct:ev.yieldPct!=null?Number(ev.yieldPct.toFixed(4)):0,livePriceGbp:ev.livePrice!=null?Number(ev.livePrice.toFixed(6)):0,confidence,dataQuality:confidence,dividendSafety:factors.dividendSafety,incomeScore:factors.incomeScore,valuationScore:factors.valuationScore,portfolioFit:factors.portfolioFit,dividendGrowth:factors.dividendGrowth,businessQuality:factors.businessQuality,sustainableScore:sustainableScore??0,maximumScore:maximumScore??0,status,recommendation,eligibilityReasons:reasons,reason,evidenceCoverage:Number((coverage*100).toFixed(1)),evidenceSources:ev.sources,projectedPortfolio:{tickerPct:ev.fit.projectedTickerPct,sectorPct:ev.fit.projectedSectorPct,testAmountGbp:ev.fit.testAmount},scoringEngine:ENGINE,scoringEngineVersion:VERSION,canonicalFactors:factors,eligibleForTransfer:status==='pass'||status==='caution',approvedForTransfer:status==='pending'||status==='block'?false:Boolean(raw?.approvedForTransfer),source:String(raw?.source||'AURORA2_SCOUTING')};
}
function rank(targets,s,weights){const assessed=arr(targets).map(t=>assess(t,s,weights)),orderStatus=x=>x.status==='pass'?0:x.status==='caution'?1:x.status==='pending'?2:3,sustainable=[...assessed].sort((a,b)=>orderStatus(a)-orderStatus(b)||b.sustainableScore-a.sustainableScore||b.confidence-a.confidence||b.yieldPct-a.yieldPct);sustainable.forEach((t,i)=>t.rank=i+1);const maximum=[...assessed].sort((a,b)=>orderStatus(a)-orderStatus(b)||b.maximumScore-a.maximumScore||b.confidence-a.confidence||b.yieldPct-a.yieldPct),maxRank=new Map(maximum.map((t,i)=>[t.id||t.ticker,i+1]));sustainable.forEach(t=>t.maximumRank=maxRank.get(t.id||t.ticker)||0);return sustainable}
function snapshotSamples(learning,targets,s){const now=Date.now(),existing=[...learning.samples],latest=new Map();existing.forEach(x=>{const t=parseDate(x.assessedAt);if(Number.isFinite(t)){const prev=latest.get(x.ticker)||0;if(t>prev)latest.set(x.ticker,t)}});for(const t of targets.filter(t=>t.status!=='block'&&t.status!=='pending'&&t.livePriceGbp>0&&t.evidenceCoverage>=65).slice(0,24)){const tk=ticker(t.ticker);if(now-(latest.get(tk)||0)<SNAPSHOT_GAP_MS)continue;existing.push({id:`${tk}:${dayKey()}`,ticker:tk,assessedAt:nowIso(),strategy:s?.scouting?.strategy==='maximum'?'maximum':'sustainable',recommendation:t.recommendation,status:t.status,startPrice:t.livePriceGbp,startYield:t.yieldPct,confidence:t.confidence,evidenceCoverage:t.evidenceCoverage,factors:{...t.canonicalFactors},sustainableScore:t.sustainableScore,maximumScore:t.maximumScore,outcome30:null,outcome90:null});latest.set(tk,now)}return{...learning,samples:existing.slice(-MAX_SAMPLES),updatedAt:nowIso()}}
function engineSignature(t){return JSON.stringify([t.ticker,t.livePriceGbp,t.yieldPct,t.dividendSafety,t.incomeScore,t.valuationScore,t.portfolioFit,t.dividendGrowth,t.businessQuality,t.sustainableScore,t.maximumScore,t.status,t.recommendation,t.confidence,t.evidenceCoverage,t.scoringEngineVersion,t.approvedForTransfer])}
function updateVersionUi(learning){const pill=document.querySelector('.scouting-version-pill');if(pill){const count=learning.learningSampleCount||0,m30=learning.matured30||0,m90=learning.matured90||0;pill.textContent=`INTELLIGENCE 3.0 • ${learning.learningActive?'CALIBRATING':`MATURED ${Math.min(count,MIN_LEARNING_SAMPLES)}/${MIN_LEARNING_SAMPLES}`}`;pill.title=`One canonical scoring engine. Matured outcomes: ${m30} at 30d • ${m90} at 90d. Hard safety gates never learn away.`}}
function installApi(weights){const api=A().scouting;if(!api)return;if(!legacyApi)legacyApi={assess:api.assess,rank:api.rank,weights:api.weights};api.assess=(raw,s=state())=>assess(raw,s||state(),learningState(s||state()).calibration);api.rank=(targets,s=state())=>rank(targets,s||state(),learningState(s||state()).calibration);api.weights={sustainable:{...weights.sustainable},maximum:{...weights.maximum}};api.engineVersion=VERSION;api.engine=ENGINE;api.hardGates={...HARD_GATES}}
function applyCanonical({snapshot=false}={}){if(applying)return;const s=state();if(!s?.scouting)return;applying=true;try{let learning=matureLearning(learningState(s),s),weights=learning.calibration;const ranked=rank(arr(s.scouting.targets),s,weights);if(snapshot)learning=snapshotSamples(learning,ranked,s);weights=learning.calibration;const changedTargets=ranked.some((t,i)=>engineSignature(t)!==engineSignature(arr(s.scouting.targets)[i]||{})),learningChanged=JSON.stringify(learning)!==JSON.stringify(learningState(s));installApi(weights);updateVersionUi(learning);if(!changedTargets&&!learningChanged)return;A().core?.update?.(current=>{if(!current?.scouting)return current;const refreshed=rank(arr(current.scouting.targets),current,learning.calibration);return{...current,scouting:{...current.scouting,targets:refreshed,learningV3:learning,scoringEngine:ENGINE,scoringEngineVersion:VERSION,updatedAt:current.scouting.updatedAt||nowIso()}}})}finally{applying=false}}
function queueApply(opts={}){if(queued)return;queued=true;setTimeout(()=>{queued=false;applyCanonical(opts)},40)}
async function fullRefresh(snapshot=false){await refreshMaster(true);queueApply({snapshot})}
function init(){if(!A().core)return setTimeout(init,120);legacyApi=A().scouting?{assess:A().scouting.assess,rank:A().scouting.rank,weights:A().scouting.weights}:null;refreshMaster(true).finally(()=>queueApply({snapshot:false}));w.addEventListener('aurora2:state',()=>queueApply({snapshot:false}));document.getElementById('runScouting')?.addEventListener('click',()=>setTimeout(()=>fullRefresh(true),120));document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshMaster(false).finally(()=>queueApply({snapshot:false}))});setInterval(()=>refreshMaster(false).then(()=>queueApply({snapshot:false})),MASTER_REFRESH_MS)}

w.AuroraScoutingIntelligence3={version:VERSION,engine:ENGINE,baseWeights:BASE_WEIGHTS,hardGates:HARD_GATES,refresh:fullRefresh,assess:(raw,s=state())=>assess(raw,s,learningState(s).calibration),rank:(targets,s=state())=>rank(targets,s,learningState(s).calibration),legacy:()=>legacyApi};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})(window);
