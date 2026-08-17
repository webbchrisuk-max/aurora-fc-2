/* Deprecated name retained for cached pages; all routing lives in aurora-data2-client.js. */
(function(w){
  'use strict';
  if(!w.AuroraData2Client){
    throw new Error('Load aurora-data2-client.js before the consolidated-client compatibility alias.');
  }
  w.AuroraConsolidatedClient=w.AuroraData2Client;
})(window);
