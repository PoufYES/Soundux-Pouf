import http from 'node:http';
import {readFileSync,rmSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import QRCode from 'qrcode';
import multicastDns from 'multicast-dns';
import {hostname} from 'node:os';
import {createPairing} from './pairing.mjs';
import {lanAddresses} from './network.mjs';
import {execFile,spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {promisify} from 'node:util';
import {networkInterfaces} from 'node:os';
import {createLifecycle} from './lifecycle.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const run=promisify(execFile);
const dataDir=join(process.env.LOCALAPPDATA,'Soundux-Pouf');
const configPath=join(process.env.APPDATA,'Soundux','config.json');
const pairing=createPairing(join(dataDir,'remote-devices.json'));
for(const legacy of ['remote-token','remote-address.txt'])rmSync(join(dataDir,legacy),{force:true});
const localName='soundux-'+createHash('sha256').update(hostname()).digest('hex').slice(0,8)+'.local';
const port=Number(process.env.SOUNDUX_REMOTE_PORT||3210);
function config(){const snapshot=join(dataDir,'remote-state.json');return JSON.parse(readFileSync(existsSync(snapshot)?snapshot:configPath,'utf8'));}
function authorized(req){return pairing.authorized(req.headers.cookie);}
let physicalNames=null;
async function refreshNetwork(){
 try{
  const command="$routes=@(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue); $names=@(Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | Sort-Object @{Expression={if($_.ifIndex -in $routes.InterfaceIndex){0}else{1}}} | Select-Object -ExpandProperty Name); ConvertTo-Json -InputObject $names -Compress";
  const {stdout}=await run('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true,timeout:10000});
  const names=JSON.parse(stdout.trim());if(Array.isArray(names))physicalNames=names;
 }catch(e){console.error('Usando deteccao local de rede: '+e.message);}
}
function addresses(){return [...lanAddresses(networkInterfaces(),physicalNames).map(ip=>`http://${ip}:${port}`),`http://${localName}:${port}`];}
function localAdmin(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&[`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host);}
async function jsonBody(req){let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)throw Error('Pedido muito grande');}return JSON.parse(body||'{}');}
async function sounduxPid(){
 const {stdout}=await run('powershell.exe',['-NoProfile','-Command',"$p=Get-Process soundux -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $env:SOUNDUX_EXE} | Select-Object -First 1; if($p){$p.Id}"],{windowsHide:true,timeout:10000,env:{...process.env,SOUNDUX_EXE:join(here,'..','soundux.exe')}});
 const pid=Number(stdout.trim());
 if(!Number.isSafeInteger(pid)||pid<=0)throw Error('Soundux nao esta aberto');
 return pid;
}
const lifecycle=createLifecycle({
 isAlive(pid){try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}},
 onExit(){console.log('Soundux encerrado. Finalizando controle web e audio.');process.exit(0);}
});
let engine=null,sequence=0;const pending=new Map();
function startEngine(){
 engine=spawn(process.env.SOUNDUX_PYTHON||'python.exe',['-u',join(here,'audio_engine.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const processRef=engine;
 createInterface({input:engine.stdout}).on('line',line=>{try{const result=JSON.parse(line),p=pending.get(result.requestId);if(p){pending.delete(result.requestId);clearTimeout(p.timer);result.error?p.reject(Error(result.error)):p.resolve(result);}}catch(e){console.error(e.message);}});
 engine.stderr.on('data',data=>console.error(data.toString()));
 const fail=()=>{if(engine===processRef)engine=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Motor de áudio encerrado. Tente novamente.'));}pending.clear();};
 engine.on('error',fail);engine.on('exit',fail);
}
function audio(action,soundId){if(!engine)startEngine();const requestId=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);if(engine)engine.kill();reject(Error('Tempo de reprodução excedido'));},20000);pending.set(requestId,{resolve,reject,timer});engine.stdin.write(JSON.stringify({requestId,action,soundId})+'\n',error=>{if(error){clearTimeout(timer);pending.delete(requestId);reject(error);}});});}
let preparation=null;
function prepareAudio(){return preparation??=(audio('prepare').finally(()=>{preparation=null;}));}
process.on('exit',()=>engine?.kill());
process.on('SIGINT',()=>process.exit(0));
process.on('SIGTERM',()=>process.exit(0));
function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const server=http.createServer(async(req,res)=>{
 try{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/admin/')){
   if(!localAdmin(req))return send(res,403,{error:'Abra Conectar celular no computador.'});
   if(req.method==='GET'&&url.pathname==='/admin/addresses')return send(res,200,addresses());
   if(req.method==='GET'&&url.pathname==='/admin/devices')return send(res,200,pairing.list());
   if(req.method!=='POST'||req.headers.origin!==`http://${req.headers.host}`||req.headers['content-type']!=='application/json')return send(res,403,{error:'Pedido recusado'});
   const body=await jsonBody(req);
   if(url.pathname==='/admin/invite'){
    if(!addresses().includes(body.address))return send(res,400,{error:'Escolha uma rede disponível.'});
    const invitation=pairing.invite();
    return send(res,200,{qr:await QRCode.toDataURL(`${body.address}/#pair=${invitation.code}`,{width:320,margin:3}),expires:invitation.expires});
   }
   if(url.pathname==='/admin/revoke'){pairing.revoke(body.id);return send(res,200,{ok:true});}
   return send(res,404,{error:'Nao encontrado'});
  }
  if(req.method==='GET'&&url.pathname==='/'){
   res.setHeader('Set-Cookie','soundux=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(readFileSync(join(here,'index.html')));
  }
  if(req.method==='POST'&&url.pathname==='/api/pair'){
   if(req.headers.origin!==`http://${req.headers.host}`||req.headers['content-type']!=='application/json')return send(res,403,{error:'Origem recusada'});
   const body=await jsonBody(req), secret=pairing.pair(body.code,body.name);
   if(!secret)return send(res,401,{error:'QR Code expirado ou já utilizado. Gere outro no computador.'});
   res.setHeader('Set-Cookie',`soundux_device=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=15552000`);
   return send(res,200,{ok:true});
  }
  if(!authorized(req))return send(res,401,{error:'No Soundux do PC, clique em CONECTAR CELULAR e escaneie o QR Code.'});
  if(req.method==='GET'&&url.pathname==='/api/state'){
   await prepareAudio();const c=config();return send(res,200,{tabs:c.data.tabs.map(t=>({id:t.id,name:t.name,sounds:t.sounds.map(s=>({id:s.id,name:s.name,ready:true}))})),outputs:c.settings.outputs});
  }
  if(req.method!=='POST')return send(res,404,{error:'Nao encontrado'});
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return send(res,403,{error:'Origem recusada'});
  if(req.headers['content-type']!=='application/json')return send(res,415,{error:'Formato invalido'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)return send(res,413,{error:'Pedido muito grande'});}
  const args=JSON.parse(body||'{}');
  if(url.pathname==='/api/sync'){config();await prepareAudio();return send(res,200,{ok:true});}
  if(url.pathname==='/api/play'){const sound=config().data.tabs.flatMap(t=>t.sounds).find(s=>s.id===args.id);if(!sound)return send(res,404,{error:'Audio nao encontrado'});return send(res,200,await audio('play',sound.id));}
  if(url.pathname==='/api/stop')return send(res,200,await audio('stop'));
  return send(res,404,{error:'Nao encontrado'});
 }catch(e){send(res,500,{error:e.stderr?.trim()||e.message});}
});
const mdns=multicastDns();
mdns.on('error',e=>console.error('Nome local indisponível; use a rede alternativa: '+e.message));
mdns.on('query',(query,peer)=>{
 if(query.questions.some(q=>q.name.toLowerCase()===localName&&(q.type==='A'||q.type==='ANY'))){
  const answers=lanAddresses(networkInterfaces(),physicalNames).map(ip=>({name:localName,type:'A',ttl:30,data:ip}));
  if(answers.length){
   if(peer.port!==5353)mdns.respond({id:query.id,questions:query.questions,answers},peer);
   else mdns.respond({answers});
  }
 }
});
lifecycle.attach(await sounduxPid());
await refreshNetwork();
prepareAudio().catch(error=>console.error('Preparacao de audio: '+error.message));
setInterval(refreshNetwork,10000).unref();
setInterval(()=>lifecycle.check(),1000).unref();
server.listen(port,'0.0.0.0',()=>{
 console.log('Soundux Remote pronto. Conecte o celular pelo botão no aplicativo.');
});
