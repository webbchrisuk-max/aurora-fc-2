/* Aurora City FC — Nexus hero title compatibility shim v1.1
 *
 * Hero title styling now lives in aurora-typography.css and is applied during
 * the first browser paint. This file intentionally performs no DOM rewrites.
 * Replacing the title HTML after load caused the outlined second line to flash
 * twice when moving between Aurora departments.
 */
(function(){
'use strict';
if(window.__AURORA_NEXUS_HERO_TITLES__)return;
window.__AURORA_NEXUS_HERO_TITLES__=true;
})();
