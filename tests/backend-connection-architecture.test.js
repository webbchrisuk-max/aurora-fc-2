const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function sourceFiles(directory=root){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if(entry.name==='.git')return [];
    const absolute=path.join(directory,entry.name);
    return entry.isDirectory()?sourceFiles(absolute):/\.(?:html|js)$/.test(entry.name)?[absolute]:[];
  });
}

test('all app backend callers use the Consolidated shared client',()=>{
  const canonical='1ZDdYmyDrvNuz3utKmgsToKL7NqsibzbWyIo0vg-TjcA';
  const retired='1kEyuEuHxSt69o8Wy198n9gLBXbx-sGCrxwcHJo9r6Ig';
  const files=sourceFiles();
  // This test names forbidden values as fixtures, so do not scan its own source.
  const combined=files.filter(name=>name!==__filename).map(name=>fs.readFileSync(name,'utf8')).join('\n');
  assert.doesNotMatch(combined,new RegExp(retired));
  assert.doesNotMatch(combined,/AuroraV2|AURORA_DATA2_TOKEN/);
  assert.match(read('aurora-data2-client.js'),new RegExp(canonical));
  assert.match(read('registration.html'),/src="aurora-data2-client\.js/);
  assert.match(read('transfer.html'),/src="aurora-data2-client\.js/);
  assert.doesNotMatch(read('transfer.html'),/aurora-consolidated-client\.js/);
  for(const page of ['AuroraCityFC_NexusV2.html','index.html','income.html','registration.html','system-health.html','transfer.html']){
    assert.match(read(page),/src="aurora-data2-client\.js\?v=20260817-consolidated"/,page);
  }
});

test('Transfer platform-rule writes use the explicit shared-client method',()=>{
  const transfer=read('transfer-broker-memory.js');
  const client=read('aurora-data2-client.js');
  assert.match(transfer,/AuroraData2Client/);
  assert.match(transfer,/updatePlatformRule\(rule\)/);
  assert.doesNotMatch(transfer,/\.post\('updatePlatformRule'/);
  assert.match(client,/return post\('updatePlatformRule', \{ spreadsheetId: SPREADSHEET_ID, rule \}\)/);
});

test('backend helpers contain no direct transport or storage bypass',()=>{
  for(const name of ['aurora-holdings-sync.js','aurora-sync-manager.js']){
    const source=read(name);
    assert.doesNotMatch(source,/fetch\s*\(/,name);
    assert.doesNotMatch(source,/aurora2:data2:(?:endpoint|token)/,name);
    assert.match(source,/AuroraData2Client/,name);
  }
});
