/* Aurora City FC — Match Report legacy renderer retired
 *
 * The visible Match Report is owned exclusively by match-report-canonical.js.
 * This compatibility stub intentionally performs no rendering, no refresh
 * binding and no Aurora state listening. It remains only so older cached HTML
 * that still references match-report.js cannot reintroduce a competing layer.
 */
(function(w){
'use strict';
w.AuroraMatchReportLegacy={retired:true,renderAuthority:'match-report-canonical.js'};
})(window);
