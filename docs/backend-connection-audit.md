# Aurora City FC backend connection audit

**Audit date:** 2026-08-17  
**Scope:** every repository `*.html` file and every production/test `*.js` file. Searches covered Apps Script URLs and `/exec`, `AuroraV2`, token/config names, spreadsheet IDs, `fetch`, backend actions, shared-client globals, and browser storage.

## Result

The repository had three competing browser connection paths:

1. `aurora-data2-client.js` used the retired spreadsheet `1kEyuEuHxSt69o8Wy198n9gLBXbx-sGCrxwcHJo9r6Ig` and old `aurora2:data2:*` storage keys.
2. Registration embedded a complete second client/router in `registration.html`, although it already named the correct Consolidated spreadsheet.
3. Transfer loaded a third implementation, `aurora-consolidated-client.js`, and called its generic `post('updatePlatformRule', ...)` method. The old deployment could consequently answer `Unknown AuroraV2 action: updatePlatformRule`.

The migration makes `aurora-data2-client.js` the sole implementation. It owns Registration Desk 2.1 endpoint/token configuration, JSONP reads, POST routing, purchase compatibility, and the explicit `updatePlatformRule()` route. Its source of truth is **AuroraData 2 — Consolidated**, spreadsheet `1ZDdYmyDrvNuz3utKmgsToKL7NqsibzbWyIo0vg-TjcA`. The old storage keys are read only for a one-time in-browser migration and then removed. `aurora-consolidated-client.js` is now a non-routing compatibility alias for cached pages; no current HTML loads it.

No Apps Script server source (`.gs`) exists in this repository, so this change neither adds nor duplicates `doGet()`/`doPost()`. The Consolidated deployment must expose the listed unified actions, including `updatePlatformRule`.

## HTML audit

| File | Backend connection method | Baseline | Exact reference/action found | Change required / disposition |
|---|---|---:|---|---|
| `AuroraCityFC_NexusV2.html` | Shared `aurora-data2-client.js`; dashboard calls originate in `nexus-hq-v4.js` | OLD | Old shared client/config and retired spreadsheet indirectly | **Yes, shared fix only.** HTML remains unchanged. |
| `index.html` | Shared `aurora-data2-client.js`; dashboard action indirectly | OLD | Old shared client/config and retired spreadsheet indirectly | **Yes, shared fix only.** HTML remains unchanged. |
| `income.html` | Shared `aurora-data2-client.js` | OLD | Income actions listed below went through old client/storage | **Yes, shared fix only.** HTML remains unchanged. |
| `system-health.html` | Shared `aurora-data2-client.js` | OLD | `health()` went through old client/storage | **Yes, shared fix only.** HTML remains unchanged. |
| `registration.html` | Former inline Registration Desk 2.1 client/router; now shared client | CURRENT | Inline `test`, `listRecentRegistrations`, `registerPurchase`, generic POST; `/exec` settings placeholder; correct Consolidated ID | **Yes.** Removed duplicate inline implementation and loaded shared client. Settings UI remains intentionally browser-local. |
| `transfer.html` | Former `aurora-consolidated-client.js`; now shared client | CURRENT | `getPlatformRules`, `updatePlatformRule`; separate client implementation | **Yes.** Repointed one script include; no UI/allocation edits. |
| `club-control.html` | No backend client | NO BACKEND | None | No. |
| `finance.html` | No backend client | NO BACKEND | None | No. |
| `finance-migration.html` | Local/session storage migration only | NO BACKEND | None | No. |
| `scouting.html` | Public data requests only (Wikipedia/AuroraMaster), no Apps Script backend | NO BACKEND | None | No. |
| `squad.html` | Public AuroraMaster request only, no Apps Script backend | NO BACKEND | None | No. |

`registration.html` still displays an Apps Script `/exec` example because the Registration Desk is the intentional authentication/configuration boundary. This is not a hard-coded deployment: the operator supplies the single Consolidated web-app URL, which remains local to that browser.

## JavaScript audit — backend-connected files

| File | Backend connection method | Baseline | Exact legacy reference/action found | Change required / disposition |
|---|---|---:|---|---|
| `aurora-data2-client.js` | Shared client/config/router | OLD | Retired ID `1kEyu…r6Ig`; `aurora2:data2:endpoint`; `aurora2:data2:token`; direct Apps Script `fetch`; actions `test`, `listRecentRegistrations`, `registerPurchase`, and generic routed actions | **Yes.** Rebuilt as the sole Consolidated client. Legacy keys now exist only as one-time migration inputs. Added `updatePlatformRule(rule)`. |
| `aurora-consolidated-client.js` | Duplicate client/router | CURRENT but DUPLICATE | Separate JSONP and POST implementations; `AuroraConsolidatedClient` global | **Yes.** Reduced to an alias of the shared client. No current page loads it. |
| `aurora-holdings-sync.js` | Shared client, formerly with local fallback router | OLD | Direct `fetch`, direct reads of `aurora2:data2:*`, retired spreadsheet ID; `marketPriceSnapshot` | **Yes.** Removed bypass; requires shared client and uses Consolidated ID. |
| `aurora-sync-manager.js` | Shared client health, formerly with direct fallback | OLD | Direct `fetch`, direct reads of `aurora2:data2:*`; `health` | **Yes.** Removed bypass; requires shared client. |
| `aurora-core.js` | State metadata only | OLD | Retired spreadsheet ID in registration defaults/normalisation | **Yes.** Updated metadata to Consolidated ID. |
| `registration.js` | `AuroraData2Client.post()` | CURRENT after shared migration | `seedHoldings`, `registerPurchase` | Shared fix only; no page logic rewrite. |
| `registration-holding-enrichment.js` | `AuroraData2Client.post()` | CURRENT after shared migration | `enrichHolding` | Shared fix only. |
| `registration-operations-upgrade.js` | `AuroraData2Client.post()` | CURRENT after shared migration | `archiveRegistrationBatch`, `registrationBatchSnapshot`, `brokerCashSnapshot`, `registerManualPurchase`, `spendBrokerCash` | Shared fix only. |
| `registration-ui.js` | Reads shared client/config; no transport | CURRENT after shared migration | Connection-state/config UI only | Shared fix only. |
| `income.js` | `AuroraData2Client.post()` | CURRENT after shared migration | `incomeSnapshot`, `upsertDividend`, `dividendEngineStatus`, `runDividendUpdate`, `installDividendUpdateTrigger`, `removeDividendUpdateTrigger` | Shared fix only. |
| `income-dividend-cash.js` | `AuroraData2Client.post()` | CURRENT after shared migration | `brokerCashSnapshot`, `recordDividendSettlement`, `adjustBrokerCash` | Shared fix only. |
| `nexus-hq-v4.js` | `AuroraData2Client.post()` | CURRENT after shared migration | `nexusDashboardSnapshot` | Shared fix only. |
| `system-health.js` | `AuroraData2Client.health()` | CURRENT after shared migration | `test` plus recent-registration probe inside shared `health()` | Shared fix only. |
| `aurora-notifications.js` | Reads shared config/status; no transport | CURRENT after shared migration | `AuroraData2Client.config()` | Shared fix only. |
| `transfer-broker-memory.js` | Former duplicate client; now `AuroraData2Client.get()` and explicit method | CURRENT | `getPlatformRules`; formerly generic `post('updatePlatformRule', ...)` | **Yes.** Uses `updatePlatformRule(rule)` on the shared Consolidated client. |

## JavaScript audit — no Aurora backend

These files were individually inspected and contain no Apps Script/Aurora backend transport. Browser storage in this group holds application state, finance migration data, UI preferences, or public-data caches—not backend URLs/tokens.

| File | Connection method | Classification | Legacy backend reference/action | Code change required |
|---|---|---:|---|---:|
| `aurora-cloud-sync.js` | Firebase Auth/Firestore only | NO BACKEND | None (its `fetch` calls are Google Firebase REST calls) | No |
| `scouting.js` | Wikipedia and public AuroraMaster JSON only | NO BACKEND | None | No |
| `squad.js` | Public AuroraMaster JSON only | NO BACKEND | None | No |
| `aurora-motion.js` | UI only | NO BACKEND | None | No |
| `aurora-platform.js` | Platform diagnostics only | NO BACKEND | None | No |
| `aurora-release.js` | Static release metadata | NO BACKEND | None | No |
| `aurora-shell.js` | Navigation/shell only | NO BACKEND | None | No |
| `aurora-page-shell.js` | Navigation/shell only | NO BACKEND | None | No |
| `aurora-hero-art.js` | UI art only | NO BACKEND | None | No |
| `aurora-notifications.js` | See connected table | CURRENT | See above | No direct change |
| `aurora-transfer-mission.js` | Local workflow state | NO BACKEND | None | No |
| `club-control.js` | Local state/decision logic | NO BACKEND | None | No |
| `finance.js` | Local finance model | NO BACKEND | None | No |
| `finance-funding.js` | Local finance/state migration | NO BACKEND | None | No |
| `finance-house.js` | Local/session storage | NO BACKEND | None | No |
| `finance-migration.js` | Local/session storage migration | NO BACKEND | None | No |
| `finance-ui.js` | UI only | NO BACKEND | None | No |
| `hq.js` | UI/state only | NO BACKEND | None | No |
| `income-runway-intelligence.js` | Derived local analytics | NO BACKEND | None | No |
| `income-ui.js` | UI/local state | NO BACKEND | None | No |
| `nexus-income-runway.js` | Derived local analytics | NO BACKEND | None | No |
| `registration-ui.js` | See connected table | CURRENT | See above | No direct change |
| `scouting-ui.js` | UI/local watch storage | NO BACKEND | None | No |
| `scouting-universe.js` | Static/local scouting model | NO BACKEND | None | No |
| `aurora-scouting-engine.js` | Local scouting model | NO BACKEND | None | No |
| `aurora-scouting-leagues.js` | Static league model | NO BACKEND | None | No |
| `SCOUTING_AUTHORITY_BRIDGE_REFERENCE.js` | Reference/local bridge | NO BACKEND | None | No |
| `squad-ui.js` | UI only | NO BACKEND | None | No |
| `squad-command-ui.js` | UI only | NO BACKEND | None | No |
| `transfer.js` | Local transfer state | NO BACKEND | None | No |
| `transfer-engine.js` | Local allocation engine | NO BACKEND | None | No |
| `transfer-ui.js` | UI/local bridge | NO BACKEND | None | No |

## Test JavaScript audit

All 13 files under `tests/` were inspected. They use Node VM/localStorage fakes and exercise local business/UI logic; none connects to an Apps Script backend: `chairman-decision-intelligence.test.js`, `core-normalization.test.js`, `finance-commitments.test.js`, `global-scouting-engine.test.js`, `motion-layout-safety.test.js`, `new-holding-executable-resolution.test.js`, `responsive-layout.test.js`, `scouting-league-presentation.test.js`, `scouting-universe.test.js`, `transfer-mission-reset.test.js`, `transfer-mission.test.js`, `transfer-portfolio-preview.test.js`, and `transfer-route-build.test.js`.

## Consolidated router contract

The single deployed Consolidated Apps Script router needs to accept every action enumerated above. The front end now sends `updatePlatformRule` exclusively through `AuroraData2Client.updatePlatformRule()`, using the Registration Desk 2.1 browser token and endpoint. This repository contains no web-app deployment URL, server router, `doGet()`, or `doPost()` implementation; deployment verification therefore remains an operational check against the Consolidated Apps Script project.
