import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {chromium} from 'playwright-core';
const run=promisify(execFile);

async function deadline(operation, label) {
 let timer;
 try {
  return await Promise.race([operation,new Promise((_,reject)=>{
   timer=setTimeout(()=>reject(Error('Native UI did not respond: '+label)),5000);
  })]);
 } finally { clearTimeout(timer); }
}

test('native Windows settings, tray restoration and shutdown of remote audio',{
 skip:process.platform!=='win32',timeout:60000
},async t=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const folder=mkdtempSync(join(tmpdir(),'soundux-settings-test-'));
 const appdata=join(folder,'roaming'),local=join(folder,'local');
 mkdirSync(join(appdata,'Soundux'),{recursive:true});mkdirSync(local);
 writeFileSync(join(appdata,'Soundux','config.json'),JSON.stringify({
  data:{width:1000,height:750,soundIdCounter:0,tabs:[]},settings:{language:'pt-BR'}
 }));
 const probe=net.createServer();
 await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
 const port=probe.address().port;
 await new Promise(resolve=>probe.close(resolve));
 const environment={...process.env,APPDATA:appdata,LOCALAPPDATA:local,
   WEBVIEW2_USER_DATA_FOLDER:join(folder,'webview'),
   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port};
 let child=spawn(join(root,'soundux.exe'),['--hidden'],{
  windowsHide:true,stdio:'ignore',env:environment
 });
 let browser,server,serverExit,exited=false;
 let exit=new Promise(resolve=>child.once('exit',()=>{exited=true;resolve();}));
 t.after(async()=>{
  if(!exited){
   // Stop only this test's process tree, including its isolated WebView runtime.
   await new Promise(resolve=>spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{
    windowsHide:true,stdio:'ignore'
   }).once('exit',resolve));
   await exit;
  }
  if(browser)await browser.close();
  if(server && server.exitCode===null){
   await new Promise(resolve=>spawn('taskkill.exe',['/PID',String(server.pid),'/T','/F'],{
    windowsHide:true,stdio:'ignore'
   }).once('exit',resolve));
   await serverExit;
  }
  // Only remove the temporary directory created by this test.
  assert.equal(dirname(resolve(folder)),resolve(tmpdir()));
  await rm(folder,{recursive:true,force:true,maxRetries:10,retryDelay:200});
 });
 for(let attempt=0;attempt<80;attempt++){
  if(exited)throw Error('Soundux exited during startup. Close other Soundux instances before this test.');
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:500});break;}
  catch{await new Promise(resolve=>setTimeout(resolve,250));}
 }
 assert.ok(browser,'Native WebView debugging endpoint unavailable');
 const page=browser.contexts()[0].pages()[0];
 await page.waitForFunction(()=>window.getStore?.().getters.outputs.length>0,{timeout:20000});
 const names=await page.evaluate(()=>window.getStore().getters.outputs.map(output=>output.name));
 assert.ok(names.length,'At least one playback device is required');
 await deadline(page.evaluate(async()=>{
  const store=window.getStore();
  await store.dispatch('setSelectedOutputs',[store.getters.outputs[0]]);
 }),'select device');
 const selected=await deadline(page.evaluate(()=>window.getSettings()),'read selected device');
 assert.deepEqual(selected.outputs,[names[0]]);
 for(let iteration=0;iteration<5;iteration++){
  for(const key of ['allowOverlapping','tabHotkeysOnly','minimizeToTray','deleteToTrash']){
   await deadline(page.evaluate(async key=>{
    const store=window.getStore();
    store.commit('setSettings',{...store.getters.settings,[key]:!store.getters.settings[key]});
    await store.dispatch('saveSettings');
   },key),'save '+key);
  }
 }
 for(const language of ['en','pt-BR']){
  await deadline(page.evaluate(async language=>{
   const store=window.getStore();store.commit('setLanguage',language);await store.dispatch('saveSettings');
  },language),'save language');
  assert.equal(await page.evaluate(()=>document.documentElement.lang),language);
 }
 const malformed=await deadline(page.evaluate(name=>window.changeSettings({
  ...window.getStore().getters.settings,outputs:[name,null],stopHotkey:[17,null]
 }),names[0]),'reject malformed arrays');
 assert.deepEqual(malformed.outputs,[]);
 assert.deepEqual(malformed.stopHotkey,[]);
 await deadline(page.evaluate(()=>window.getStore().dispatch('getOutputs',[])),'refresh devices');
 const final=await deadline(page.evaluate(()=>window.getSettings()),'read settings after recovery');
 assert.deepEqual(final.outputs,[names[0]]);
 assert.equal(final.language,'pt-BR');

 const windowAction=async(action,text)=>{
  const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'remote-control/test-fixtures/window.ps1'),
   '-ProcessId',String(child.pid),'-Action',action];
  if(text)args.push('-MenuText',text);
  const {stdout}=await run('powershell.exe',args,{windowsHide:true,timeout:10000});
  return action==='state'?JSON.parse(stdout):undefined;
 };
 await deadline(page.evaluate(async()=>{
  const store=window.getStore();
  store.commit('setSettings',{...store.getters.settings,minimizeToTray:true});
  await store.dispatch('saveSettings');
 }),'enable minimize to tray');

 // Run the production server and engine against the isolated native owner.
 const remoteProbe=net.createServer();
 await new Promise(resolve=>remoteProbe.listen(0,'127.0.0.1',resolve));
 const remotePort=remoteProbe.address().port;
 await new Promise(resolve=>remoteProbe.close(resolve));
 server=spawn(process.execPath,[join(root,'remote-control/server.mjs')],{
  windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...environment,SOUNDUX_REMOTE_PORT:String(remotePort)}
 });
 serverExit=new Promise(resolve=>server.once('exit',resolve));
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Remote server startup timed out')),15000);
  server.stdout.on('data',data=>{if(data.toString().includes('pronto')){clearTimeout(timer);resolve();}});
  server.once('exit',code=>{clearTimeout(timer);reject(Error('Remote server exited: '+code));});
 });
 const {stdout:engineList}=await run('powershell.exe',['-NoProfile','-Command',
  'ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter "ParentProcessId = '+server.pid+'" | Where-Object Name -Like "python*" | Select-Object -ExpandProperty ProcessId)'
 ],{windowsHide:true,timeout:10000});
 const engineIds=JSON.parse(engineList.trim());
 assert.ok(engineIds.length,'Production audio engine must be running');

 await windowAction('click');
 assert.equal((await windowAction('state')).visible,true,'Tray click opens the hidden app');
 await windowAction('close');
 assert.equal((await windowAction('state')).visible,false,'X hides the window');
 assert.equal(exited,false,'X keeps the owner alive');
 assert.equal((await fetch('http://127.0.0.1:'+remotePort+'/api/state')).status,401,'Remote stays available while hidden');
 await windowAction('click');
 assert.equal((await windowAction('state')).visible,true,'Tray click restores after X');
 await windowAction('minimize');
 assert.equal((await windowAction('state')).minimized,true);
 await windowAction('click');
 const restored=await windowAction('state');
 assert.equal(restored.visible,true);assert.equal(restored.minimized,false,'Tray click restores a minimized window');
 await windowAction('close');
 const showText=await page.evaluate(()=>window.getTranslation('tray.show'));
 await windowAction('menu',showText);
 assert.equal((await windowAction('state')).visible,true,'Context menu also restores the app');
 await windowAction('close');
 const exitText=await page.evaluate(()=>window.getTranslation('tray.exit'));
 await windowAction('menu',exitText);
 await deadline(exit,'exit from tray');
 assert.equal(child.exitCode,0,'Tray exit finishes cleanly even when minimizeToTray is enabled');
 await deadline(serverExit,'remote owner shutdown');
 assert.equal(server.exitCode,0);
 for(const id of engineIds)assert.throws(()=>process.kill(id,0),{code:'ESRCH'},'Remote audio engine exits with the owner');

 // The same X must still exit normally when the option is disabled.
 await browser.close();browser=null;
 const configPath=join(appdata,'Soundux','config.json');
 const saved=JSON.parse(readFileSync(configPath,'utf8'));
 saved.settings.minimizeToTray=false;
 writeFileSync(configPath,JSON.stringify(saved));
 child=spawn(join(root,'soundux.exe'),['--hidden'],{windowsHide:true,stdio:'ignore',env:environment});
 exited=false;
 exit=new Promise(resolve=>child.once('exit',()=>{exited=true;resolve();}));
 for(let attempt=0;attempt<80;attempt++){
  if(exited)throw Error('Second Soundux startup failed');
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:500});break;}
  catch{await new Promise(resolve=>setTimeout(resolve,250));}
 }
 assert.ok(browser);
 const normalPage=browser.contexts()[0].pages()[0];
 await normalPage.waitForFunction(()=>window.getStore?.().getters.outputs.length>0 &&
  window.getStore().getters.settings.minimizeToTray===false,{timeout:15000});
 await windowAction('close');
 await deadline(exit,'close with minimize to tray disabled');
 assert.equal(child.exitCode,0);
});
