import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import multicastDns from 'multicast-dns';
import http from 'node:http';
import net from 'node:net';
import {networkInterfaces} from 'node:os';

test('HTTP QR pairing, authorization, admin protection, revocation and old key removal',async t=>{
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const dir=mkdtempSync(join(tmpdir(),'soundux-http-'));
 const data=join(dir,'Soundux-Pouf');mkdirSync(data);mkdirSync(join(dir,'Soundux'));
 writeFileSync(join(data,'remote-token'),'old-secret');writeFileSync(join(data,'remote-address.txt'),'old-url');
 writeFileSync(join(dir,'Soundux','config.json'),JSON.stringify({data:{tabs:[]},settings:{outputs:[]}}));
 // Isolate app discovery only; the production HTTP server, QR encoder and store run unchanged.
 const bootstrap=`import {PassThrough} from 'node:stream';import {EventEmitter} from 'node:events';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';cp.execFile=(file,args,options,cb)=>{cb(null,{stdout:String(process.pid),stderr:''});};cp.spawn=()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.stdin.on('data',data=>{for(const line of data.toString().trim().split('\\n')){const request=JSON.parse(line);child.stdout.write(JSON.stringify({ok:true,requestId:request.requestId})+'\\n');}});child.kill=()=>{};return child;};syncBuiltinESMExports();await import(${JSON.stringify(new URL('./server.mjs',import.meta.url).href)});`;
 const child=spawn(process.execPath,['--input-type=module','-e',bootstrap],{env:{...process.env,LOCALAPPDATA:dir,APPDATA:dir,SOUNDUX_REMOTE_PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
 t.after(async()=>{child.kill();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));rmSync(dir,{recursive:true,force:true});});
 let stderr='';
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out')),15000);child.stdout.on('data',d=>{if(d.toString().includes('pronto')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited: '+code+' '+stderr));});child.stderr.on('data',d=>{stderr+=d.toString();});});
 const base=`http://127.0.0.1:${port}`;
 const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal(existsSync(join(data,'remote-token')),false);
 assert.equal(existsSync(join(data,'remote-address.txt')),false);
 assert.equal((await fetch(base+'/connect')).status,401);
 const foreignHostStatus=await new Promise((resolve,reject)=>{const req=http.get(base+'/admin/devices',{headers:{Host:'attacker.test:3210'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
 assert.equal(foreignHostStatus,403);
 assert.equal((await fetch(base+'/api/state?key=old-secret',{headers:{Cookie:'soundux=old-secret'}})).status,401);
 assert.equal((await post('/admin/invite',{}, {Origin:'http://attacker.test'})).status,403);
 const addresses=await (await fetch(base+'/admin/addresses')).json();const localAddress=addresses.find(a=>a.includes('.local'));assert.ok(localAddress);
 if(Object.values(networkInterfaces()).flat().some(i=>i.family==='IPv4'&&!i.internal&&!i.address.startsWith('169.254.'))){
  const dns=multicastDns();
  try{await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Local hostname did not resolve')),3000);
   dns.on('response',response=>{if(response.answers.some(a=>a.name===new URL(localAddress).hostname&&a.type==='A')){clearTimeout(timer);resolve();}});
   dns.on('error',reject);dns.on('ready',()=>dns.query(new URL(localAddress).hostname,'A'));
  });}finally{dns.destroy();}
 }
 const qr=await (await post('/admin/invite',{address:addresses[0]})).json();
 const png=PNG.sync.read(Buffer.from(qr.qr.split(',')[1],'base64'));
 const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);assert.ok(decoded);
 const link=new URL(decoded.data);assert.equal(link.origin,addresses[0]);assert.equal(link.search,'');
 const code=new URLSearchParams(link.hash.slice(1)).get('pair');
 const paired=await post('/api/pair',{code,name:'Test phone'});assert.equal(paired.status,200);
 const cookie=paired.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Max-Age=15552000/);
 assert.equal((await post('/api/pair',{code,name:'Reuse'})).status,401);
 assert.equal((await fetch(base+'/api/state',{headers:{Cookie:cookie.split(';')[0]}})).status,200);
 const snapshot={data:{tabs:[{id:1,name:'Atualizada sem reiniciar',sounds:[]}]},settings:{outputs:['Test output']}};
 writeFileSync(join(data,'remote-state.json'),JSON.stringify(snapshot));
 assert.equal((await post('/api/sync',{}, {Cookie:cookie.split(';')[0]})).status,200);
 const state=await (await fetch(base+'/api/state',{headers:{Cookie:cookie.split(';')[0]}})).json();
 assert.equal(state.tabs[0].name,snapshot.data.tabs[0].name);
 assert.deepEqual(state.outputs,snapshot.settings.outputs);
 assert.equal((await post('/api/play',{id:999}, {Cookie:cookie.split(';')[0]})).status,404);
 const devices=await (await fetch(base+'/admin/devices')).json();assert.equal(devices[0].name,'Test phone');
 assert.equal((await post('/admin/revoke',{id:devices[0].id})).status,200);
 assert.equal((await fetch(base+'/api/state',{headers:{Cookie:cookie.split(';')[0]}})).status,401);
});

test('connecting launches only the server, with no app restart or browser',()=>{
 const start=readFileSync(new URL('./start.ps1',import.meta.url),'utf8');
 assert.doesNotMatch(start,/bridge\.ps1|Stop-Process|PostThreadMessage|Start-Process ['"`]http/);
 const sidebar=readFileSync(new URL('./sidebar.js',import.meta.url),'utf8');
 assert.match(sidebar,/dialog\.showModal\(\)/);
 assert.doesNotMatch(sidebar,/window\.open|<iframe/);
});
