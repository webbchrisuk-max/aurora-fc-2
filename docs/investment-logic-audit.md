# Aurora 2.0 investment logic and scoring audit

**Audit date:** 2026-08-16
**Scope:** repository-wide static review of investment scoring, eligibility, income,
allocation, concentration and Chairman rotation logic.
**Change policy:** this document records the current implementation. No production
formula, weight, gate, or application behaviour was changed as part of this audit.

## Executive conclusions

Aurora currently has **two independent Scouting implementations**. The browser
Scouting Centre (`scouting.js`) is the source of persisted target scores used by
Transfer, while `aurora-scouting-engine.js` is a separate CommonJS/browser global
pipeline with different components and weights. Consequently there is not yet one
canonical scoring specification.

The main Scouting Centre does distinguish Sustainable from Maximum Income and its
eligibility gates are shared between those lenses. Sustainable gives 80% of its
nominal weight to non-income components, while Maximum gives 45% to income score.
However, silent neutral defaults for missing safety, valuation, growth and quality
evidence can improve incomplete candidates, and the displayed component scores do
not preserve the confidence multiplier as a separate explainability component.

Transfer adds broker, price, dividend, approval, concentration, minimum-size and
position-cap constraints. It is therefore not a simple yield sort. Its stale-price
resolver, however, explicitly treats stale prices as usable and the executable gate
does not reject them. Transfer also has yield-unit ambiguity and computes projected
income from the allocated cash rather than purchasable whole shares.

## Current Sustainable formula

### Persisted Scouting Centre model (the model consumed by Transfer)

Inputs are component scores in `[0,100]`:

```text
raw sustainable =
    0.25 × dividend safety
  + 0.20 × income score
  + 0.20 × valuation score
  + 0.15 × portfolio fit
  + 0.10 × dividend growth
  + 0.10 × business quality

confidence factor = 0.72 + 0.0028 × confidence
final sustainable score = round(clamp(raw sustainable × confidence factor, 0, 100))
```

The confidence factor spans `0.72..1.00`. `income score` is derived from yield when
no positive explicit score exists:

| Supported forward yield `y` | Income score |
|---|---|
| `y <= 0` | `0` |
| `0 < y <= 2` | `35 + 12.5y` |
| `2 < y <= 6` | `60 + 8(y-2)` |
| `6 < y <= 8` | `92 + 4(y-6)` |
| `8 < y <= 10` | `100 - 5(y-8)` |
| `y > 10` | `clamp(90 - 10(y-10), 35, 90)` |

Thus the income component peaks at 8%, falls from 8–10%, and then declines to a
35-point floor. Sustainable genuinely places less weight on income than Maximum,
but “dependability” is partly undermined by missing safety and quality becoming
neutral defaults rather than explicit missing-evidence penalties.

### Separate global-pipeline Sustainable model

```text
yield score = clamp(dividendYield × 10, 0, 100)
fit = clamp(92 - 3 × existing-security portfolio %
               - 0.7 × candidate-sector portfolio %, 20, 95)
raw = 0.16 × yield score + 0.25 × safety + 0.16 × business quality
    + 0.16 × dividend coverage + 0.12 × dividend growth + 0.15 × fit
confidence penalty = 0.18 × (100 - confidence)
final = round(clamp(raw - confidence penalty, 0, 100))
```

This is materially different from the persisted model: it uses coverage rather
than valuation, gives direct yield 16% rather than a shaped income score at 20%,
and subtracts confidence rather than multiplying by it.

## Current Maximum Income formula

### Persisted Scouting Centre model

```text
raw maximum =
    0.45 × income score
  + 0.20 × dividend safety
  + 0.10 × valuation score
  + 0.10 × portfolio fit
  + 0.05 × dividend growth
  + 0.10 × business quality

confidence factor = 0.72 + 0.0028 × confidence
final maximum score = round(clamp(raw maximum × confidence factor, 0, 100))
```

It uses the same non-monotonic income-score curve and the same eligibility gates as
Sustainable. It seeks more income, but does not simply sort by raw yield.

### Separate global-pipeline Maximum model

```text
raw = 0.55 × yield score + 0.18 × safety + 0.07 × business quality
    + 0.07 × dividend coverage + 0.03 × dividend growth + 0.10 × fit
final = round(clamp(raw - 0.18 × (100-confidence), 0, 100))
```

## PASS / CAUTION / BLOCK rules

The persisted Scouting Centre starts every assessment at PASS, then applies all
BLOCK rules before CAUTION:

**BLOCK** if any of the following is true:

* `requiresRefresh` is true;
* base ticker is `TSCO` (a hard-coded legacy restriction);
* recurring dividend yield is absent/non-positive;
* live GBP price is absent/non-positive, except an Aurora 1 legacy record is merely
  CAUTION when not already blocked;
* dividend status contains `suspend`, `cancel`, or `omit`;
* payout-risk text contains `very high`;
* dividend safety is below 35; or
* confidence is below 50.

**CAUTION** (only if not BLOCK) when any condition is true:

* dividend safety below 60;
* confidence below 75;
* yield above 10%; or
* preferred broker resolves to `CHECK`.

**PASS** means none of the BLOCK or CAUTION conditions was met. Recommendation is
separate: BLOCK/CAUTION mirror status; otherwise score `>=80` is STRONG BUY,
`>=70` is BUY, and lower is WATCH.

Transfer then applies a second executable gate: positive supported yield, positive
resolved GBP price, supported IG/T212 broker route, `transferPermitted !== false`,
and no ineligible/block eligibility status. Ordinary mission routes additionally
require the target to be approved in the current approval batch. A new security
does **not** need a holding: absent holdings correctly resolve to zero shares/value.

Contradiction found: a stale positive price can remain Scouting PASS and Transfer
executable because Transfer labels it `STALE_BUT_USABLE` but only checks `price > 0`.
There is also no date/freshness gate in the persisted Scouting Centre assessment.

## Transfer sizing formula

1. Eligible candidates pass status, current-batch approval (unless explicitly
   bypassed for active Scouting/Chairman), executable evidence, exclusions, broker
   scope, and optional selected-ID filters.
2. `targetScore` is the chosen persisted strategy score. Missing Maximum score
   falls back to `clamp(yield% × 10)`; missing Sustainable score falls back to
   confidence or `100 - 5 × rank`. CAUTION multiplies it by `0.82`; BLOCK is zero.
3. `returnPriority = yield% × qualityMultiplier`, where Maximum multiplier is
   `0.80 + 0.20 × targetScore/100`, and Sustainable is
   `0.55 + 0.45 × targetScore/100`.
4. In a rotation, route score is `returnPriority × concentrationFactor`.
5. Candidate count is bounded by availability, `maxTargets`, and affordability at
   requested minimum. A square-root soft cap and relative opportunity thresholds
   (`0.80`, `0.74`, then `0.70`) decide whether additional candidates join.
6. Effective minimum is the requested minimum when affordable for all selected
   candidates; otherwise it is the increment-rounded-down value of
   `max(increment, 0.75 × budget/count)`.
7. Each candidate is seeded with the minimum, subject to route and portfolio caps.
   Remaining cash is assigned one increment at a time by
   `routeScore × current concentration factor / (1 + 0.65 × allocation/average)`.
8. A final non-increment remainder is assigned to the highest score that has cap
   room; otherwise it is holdback (`remaining`).
9. Per-leg expected annual income is `allocation × yield% / 100`; expected shares
   are `floor(allocation / supported GBP price)`.

Position cap is all budget for one target. With two targets it is 65%, then for
Maximum it is 50%/42%/38% depending on budget, and for Sustainable 45%/36%/32%.
CAUTION caps at 60% for two targets and 35% otherwise. Chairman rotation also solves
the post-route maximum-position inequality:

```text
allocation cap = ((base portfolio × maxPositionPct) - existing candidate value)
                 / (1 - maxPositionPct)
```

rounded down to the allocation increment. Defaults are £250 minimum, £25 increment,
eight targets, and a 20% Chairman post-rotation maximum position.

## Concentration rules

* Scouting portfolio fit starts at 88, subtracts up to 48 points for existing
  ticker weight (`2.6 × weight%`), subtracts up to 25 when sector weight exceeds
  25% (`1.15 × excess percentage points`), adds four if ticker weight is below 2%,
  and clamps to `[25,95]`. An empty portfolio receives 70.
* The separate global pipeline starts fit at 92, subtracts `3 × ticker%` and
  `0.7 × sector%`, and clamps to `[20,95]`.
* Chairman/Transfer concentration factor starts at 1; above 8% ticker weight it
  multiplies by `1/(1+(ticker%-8)/9)`, and above 25% sector weight it multiplies by
  `1/(1+(sector%-25)/18)`, finally clamped to `[0.35,1.08]`.
* Rotation position cap independently limits each post-sale holding (default 20%).
* `concentrationSnapshot` aggregates values by ticker and non-empty sector before
  and after sale/allocation, returning largest ticker and sector percentages.
* Chairman verdict adds a caution when largest ticker concentration worsens by more
  than five percentage points. The UI also displays both ticker and sector changes,
  but the verdict builder does not use its sector change.

## Income, yield, growth and rotation economics

| Path | Canonical current formula |
|---|---|
| Holding annual income | `shares × annualDpsGbp` when both positive; otherwise stored non-negative `annualIncomeGbp` |
| Holding market value | `shares × livePriceGbp` when positive; otherwise stored non-negative market value |
| Portfolio monthly income | holding annual total `/ 12` |
| Yield on cost | annual income `/ book cost × 100` |
| Portfolio yield | annual income `/ market value × 100` |
| Calendar event | paid actual amount; else eligible shares × event DPS; else current account/ticker shares × DPS; else expected amount |
| Transfer leg income | allocated capital × supported yield% `/ 100` |
| Route income | sum of leg expected annual income |
| Registered uplift | distinct confirmed draft expected annual incomes, displayed separately |
| Rotation surrendered income | sold fraction × source holding annual income |
| Rotation net annual | replacement route income − surrendered annual income |
| Rotation net monthly | net annual `/ 12` |
| Rotation coverage | replacement income `/ surrendered income × 100` |
| Profit years | realised profit `/ surrendered annual income` |
| Replacement yield | replacement income `/ released cash × 100` |

Current holdings are therefore share/DPS authoritative and projected candidates are
capital/yield authoritative, which is appropriate before execution. But Transfer's
whole-share estimate is not used for income, so a £250 allocation at a £200 price
reports income on £250 despite only one estimated share (£200) being purchasable.

“Income growth” has two meanings: Scouting accepts a manually/evidence-provided
0–100 dividend-growth component; Income history reports the arithmetic difference
between current and prior annual run-rates. There is no canonical conversion from
historical dividend growth rates to the Scouting component score.

## Formula/function inventory

Ranges below are implementation ranges, not intended ranges.

| File | Function | Formula / purpose | Principal inputs | Output/range |
|---|---|---|---|---|
| `scouting.js` | `yieldPctFrom` | Treats unmarked `(0,1]` as decimal and ×100 | yield text/number | non-negative %, unbounded |
| `scouting.js` | `deriveNetworkYield` | explicit yield; else DPS/price×100; else income-from-£500/500×100 | network evidence | yield `(0,100)` or 0 |
| `scouting.js` | `incomeScoreFromYield` | piecewise curve above | yield % | `[0,100]` (35 floor above extreme yields) |
| `scouting.js` | `autoPortfolioFit` | ticker/sector exposure penalties above | target + holdings | integer `[25,95]`, or 70 empty |
| `scouting.js` | `confidenceFor` | explicit confidence, else evidence-field count/6×100 | candidate evidence | integer `[35,100]` |
| `scouting.js` | `scoreWithWeights` | weighted components × confidence factor | parts, weights, confidence | integer `[0,100]` |
| `scouting.js` | `assessTarget` | defaults components, computes both scores and gates | candidate + state | scores `[0,100]`, PASS/CAUTION/BLOCK |
| `scouting.js` | `rankTargets` | non-blocked first, chosen score descending, confidence/yield tie-breaks | assessed targets | ranks `1..N` |
| `aurora-scouting-engine.js` | `portfolioExposure` | security, sector and country value / portfolio | security + holdings | percentages `0..100` under valid data |
| `aurora-scouting-engine.js` | `freshness` | 18/stale + 12/missing confidence penalty | timestamps + clock | penalty `0..90`; execution-safe boolean |
| `aurora-scouting-engine.js` | `convertToGbp` | native amount × supplied FX-to-GBP | amount, currency, rates | GBP number or null |
| `aurora-scouting-engine.js` | `score` | alternate weighted formulas above | evidence + exposure | integer `[0,100]` |
| `aurora-scouting-engine.js` | `fastScout` / `deepScout` | evidence/freshness/broker gates and scoring | registry, evidence, holdings | passed/approved booleans + scores |
| `transfer-engine.js` | `normalizePrice` / `resolveMarketPrice` | GBP/GBX/pence normalization, foreign FX, evidence ranking, 36h stale label | evidence + clock | supported GBP price or 0 |
| `transfer-engine.js` | `resolveIncomeEvidence` | first positive yield field | candidate and matched evidence | supported boolean + non-negative % |
| `transfer-engine.js` | `resolveBrokerRoute` | first evidence tier; explicit negatives authoritative | security/transfer/market/route broker evidence | IG, T212, or CHECK |
| `transfer-engine.js` | `resolveExistingExposure` | sums matching active holdings | holdings + security identity | shares/value ≥0 |
| `transfer-engine.js` | `resolveExecutableCandidate` | income + price + broker + permission gates | candidate + canonical state | executable boolean/reasons |
| `transfer-engine.js` | `targetScore` | strategy score/fallback; CAUTION ×0.82; BLOCK 0 | candidate + strategy | nominally ≥0; fallback ≤100 |
| `transfer-engine.js` | `concentrationFactor` | ticker >8% and sector >25% penalties | post-sale rows + allocation | `[0.35,1]` in practice |
| `transfer-engine.js` | `desiredTargetCount` | affordability, sqrt soft-cap, relative thresholds | budget/candidates/settings | integer `0..maxTargets` |
| `transfer-engine.js` | `effectiveMinimum` | requested floor or 75% fair-share rounded down | budget/count/increment | ≥ increment |
| `transfer-engine.js` | `returnPriority` | yield × strategy quality multiplier | yield + score | non-negative, unbounded with yield |
| `transfer-engine.js` | `positionCap` / `portfolioPositionCap` | route share cap and post-rotation position inequality | budget/status/portfolio | non-negative GBP or Infinity |
| `transfer-engine.js` | `simulate` | seed + iterative opportunity-weighted increments | state, budget, strategy/settings | allocations ≤ budget; holdback ≥0 |
| `transfer-engine.js` | `routeSummary` | sum allocations/income; budget−allocated | route | non-negative totals |
| `transfer-engine.js` | `concentrationSnapshot` | grouped before/after ticker and sector shares | holdings, rotation, allocations | largest percentages `0..100` |
| `income.js` | `holdingIncome` / `metrics` | DPS/share income and portfolio aggregation | active holdings | non-negative annual/monthly/yields |
| `income.js` | `eventAmount` | actual, locked-shares×DPS, live-shares×DPS, fallback | holding + calendar event | non-negative under normalized state |
| `income.js` | `registeredUplift` | distinct confirmed expected-income sum | registration drafts | non-negative annual GBP |
| `club-control.js` | `holdingMetrics` / `scenarioMetrics` | holding value/income/profit and sale-fraction economics | selected holding + fraction | GBP/% metrics |
| `club-control.js` | `buildVerdict` | materiality, ex-date, caution legs, concentration, profit and replacement-income thresholds | scenario + Transfer simulation | HOLD/REVIEW/rotation verdict object |
| `club-control.js` | `caseData` / `strategyComparison` | net annual/monthly, coverage, profit years, replacement yield | holding + simulations | signed economics and percentages |
| `aurora-core.js` | normalization + `validate` | clamps persisted financial fields; checks route totals | state | normalized state + errors/warnings |

No independent score arithmetic was found in HTML. `scouting.html` does contain
hard-coded textual gate descriptions; these can drift from JavaScript and should be
rendered from a future canonical model metadata object.

## Duplicated logic

1. **CRITICAL — two Scouting models:** `scouting.js` and
   `aurora-scouting-engine.js` implement different Sustainable/Maximum formulas,
   confidence treatment, portfolio fit, evidence requirements and ranking.
2. **SHOULD FIX — yield normalization:** Scouting handles decimal-versus-percent;
   global Scouting assumes a percentage; Transfer takes the raw first positive
   value. The same `0.085` can mean 8.5%, score as 0.85 yield points, or project
   0.085% income.
3. **SHOULD FIX — holdings/value/income:** variants exist in Core, Income, Transfer,
   Chairman, HQ and UI modules. Most prefer shares×price and shares×DPS, but not all
   have identical status/exemption and fallback rules.
4. **SHOULD FIX — concentration:** Scouting fit, global fit, Transfer factor,
   Transfer cap, snapshot, and Chairman verdict are separate computations with
   different thresholds. These serve different purposes but duplicate exposure
   aggregation and identity rules.
5. **SHOULD FIX — broker/account parsing:** account-code parsing occurs in multiple
   modules; Transfer has the richest evidence resolver.
6. **OPTIONAL — route income summaries:** `routeSummary`, route persisted fields,
   Income read-only route uplift, and HQ/UI fallbacks sum or select different route
   income properties.
7. **OPTIONAL — UI specification:** HTML repeats current eligibility thresholds as
   text, although it does not calculate decisions.

## Score direction audit

**Correct direction:** higher safety, valuation, fit, growth, quality, coverage and
confidence increase scores; higher existing ticker/sector exposure lowers fit and
rotation priority; BLOCK removes allocation; CAUTION reduces route score and caps;
broker/price/dividend absence blocks Transfer; the main income curve penalizes very
high yield rather than rewarding it indefinitely.

**Problems:**

* Missing main-model safety becomes 55, valuation 55, growth 50 and quality 55.
  Missing evidence therefore contributes positive points.
* Explicit zero is treated as “missing” and replaced with those defaults, so a real
  zero safety/quality/valuation assessment can become favourable.
* Confidence inference has a 35 floor and counts positive fields without freshness;
  a candidate can obtain meaningful scores from sparse/stale evidence.
* The global score's missing components correctly clamp to zero, but default
  confidence is 80 before the deep-pipeline adjustment.
* Transfer stale price remains executable. No stale dividend/fundamental gate exists
  in the persisted model.
* Maximum route priority is monotonic in raw yield even though the main Scouting
  income score penalizes yield above 8%; at sufficiently large yields, direct yield
  dominates the bounded quality multiplier.
* `targetScore` synthesizes missing scores from yield, confidence, or rank. This can
  conceal the absence of an actual model score and model version.

## Range, normalization and data-quality risks

### Mathematical bugs

* **CRITICAL:** two incompatible scoring engines can issue different scores under
  the same strategy name.
* **CRITICAL:** stale Transfer prices are executable, permitting sizing with old
  price evidence despite a “review before execution” label.
* **CRITICAL:** absent or explicit-zero component evidence is replaced by positive
  neutral values in the persisted scoring path.
* **SHOULD FIX:** projected leg income uses all allocated cash, not estimated whole
  shares × price × yield or shares × DPS, overstating deployable income where
  fractional shares are unavailable.
* **SHOULD FIX:** Core validation tolerance is £1.01, large relative to penny-accurate
  route arithmetic, and only warns rather than rejecting mismatched totals.
* **SHOULD FIX:** route score is unbounded because yield is unbounded; one malformed
  yield can dominate sizing even though final scouting scores are clamped.
* **SHOULD FIX:** `concentrationFactor` allows a nominal upper clamp of 1.08 but never
  produces above 1, making the declared range misleading.

### Data-quality risks

* There is no `SCOUTING_MODEL_VERSION`; scores persist without formula provenance.
* `num()` helpers commonly coerce null, malformed strings and NaN to zero, losing
  the distinction between “measured zero” and “missing”.
* Percent/decimal yield inference is local to main Scouting and ambiguous at 1%.
* Global Scouting's `dividendYield × 10` assumes percent units without declaring it.
* Transfer foreign native prices require an explicit FX rate; missing FX becomes no
  price (safe), but currency/unit metadata are inconsistently available.
* A raw GBP quote without pence/GBX metadata can be 100× wrong; conversely explicit
  `livePriceGbp` bypasses currency conversion by design.
* Negative scoring inputs clamp to zero, but negative yields are treated as missing;
  the original invalid evidence is not preserved in score explanations.
* Main Scouting does not preserve component contribution values, confidence impact,
  source timestamp state, or model version alongside the final scores.
* Main scoring accepts manually entered component scores without a canonical mapping
  from raw fundamentals to valuation, quality, risk/safety, or growth scores.

## Existing holdings versus new candidates

The Transfer evidence resolver correctly separates holdings from eligibility:
holdings enrich `currentShares`, `currentValueGbp` and accounts, while a never-owned
security receives zero exposure and remains executable if security identity, yield,
price and broker evidence exist. Main and global Scouting also score against an
empty matching holding set. No holdings-dependent gate was found.

The remaining risk is identity inconsistency: several UI helpers reduce exchange
symbols to a base ticker, while Transfer uses exchange+ticker where possible. The
Transfer legacy fallback only matches ticker-only evidence when the canonical
universe proves it unambiguous, which is the safer behaviour to standardize.

## Explainability status

Main Scouting persists raw component scores, eligibility reasons, final scores and a
one-line summary. It can therefore show broad drivers, but cannot exactly reconcile
“why 72” because it does not preserve each weighted contribution, the confidence
factor contribution, default/missing flags, source/freshness, or a model version.
Transfer preserves route score, scouting score and concentration factor per leg but
does not expose the full incremental sizing trace or cap that stopped each leg.

## Golden fixtures and invariant coverage assessment

Existing tests cover strategy divergence, concentration direction, stale/missing
global evidence, exchange identity, FX conversion, new/never-owned candidates,
broker independence, Chairman paths and several route behaviours. The requested
single deterministic golden set (moderate-quality yield, risky high yield, low-yield
quality, new, large existing, missing price/dividend, stale, foreign, concentrated
sector) does not yet exist as one canonical suite.

Current invariant tests cover important portions of budget limits, executable new
holdings and no zero-value purchases. Gaps remain for an exhaustive matrix proving
all scores finite/bounded, exact route `allocated + holdback = released cash`, route
income equals every leg, monthly equals annual/12 in every path, simulated
concentration reconstruction, all BLOCK causes producing no allocation, and model
version/strategy independence. Per the request to deliver and review the audit
before changing production scoring, those fixtures and tests are proposed for the
next implementation phase rather than being coupled to an unreviewed choice of
canonical model.

## Recommended changes

### CRITICAL

1. Select one canonical Scouting engine/API, move both current strategies, gates,
   normalization and component explanations into it, and make Scouting UI and
   Transfer consume it. Preserve current weights/formulas during extraction.
2. Add `SCOUTING_MODEL_VERSION` and store it with both strategy scores and their
   component-contribution records. Reject or explicitly label unversioned/stale
   scores rather than silently presenting them as current.
3. Represent missing/invalid evidence as `null` plus reason metadata. Do not turn
   missing or explicit zero safety/quality/valuation/growth into positive defaults.
4. Define and enforce a canonical freshness policy. At minimum, stale execution
   prices must not be executable without an explicit, auditable override.

### SHOULD FIX

1. Canonicalize yield as one named unit (`yieldPct`) at ingestion; reject ambiguity,
   retain raw/source units, and test `8.5`, `0.085`, zero, null, negative and NaN.
2. Centralize monetary/price conversion with explicit currency, quote unit and FX
   timestamp. Test GBP, GBX/pence, USD and CAD.
3. Centralize holding annual income (`shares × supported annual DPS`) and candidate
   income (`deployed capital × supported forward yield`) while distinguishing cash
   allocated from cash actually deployable under broker fractional-share rules.
4. Extract one exposure snapshot primitive used by score fit, route penalties,
   caps, Chairman and UI. Keep purpose-specific thresholds but remove duplicated
   aggregation/identity arithmetic.
5. Remove `targetScore`'s silent score fallbacks once versioned canonical scores are
   required; expose missing-score as a gate/reason.
6. Build the requested golden fixture matrix and invariant/property tests before
   formula tuning. Include component monotonicity and missing-evidence assertions.
7. Tighten Core route validation to penny-level accounting and validate leg-income
   sum, finite scores, non-negative amounts and no allocated BLOCK legs.

### OPTIONAL

1. Render gate descriptions and weights in HTML from read-only canonical model
   metadata so documentation cannot drift from code.
2. Preserve an allocation trace containing seed, every cap, concentration before/
   after, marginal priority and holdback reason for Chairman explanations.
3. Define evidence-to-component methodologies for valuation, business quality,
   dividend safety and dividend growth rather than relying on manual 0–100 values.
4. Replace the hard-coded TSCO ticker restriction with a general security/account
   policy record so future unrelated holdings of the same ticker are not affected.

## Review boundary

No weights or production formulas have been tuned, and no rules were tailored to
current holdings. After this audit is reviewed, the safest implementation order is:
characterization/golden tests → canonical extraction without formula changes →
versioned explainability → bug fixes approved individually → only then any strategy
weight review.
