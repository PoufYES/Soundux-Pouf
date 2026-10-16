import http from 'node:http';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {promisify} from 'node:util';
import {networkInterfaces} from 'node:os';
const here=dirname(fileURLToPath(import.meta.url));
const run=promisify(execFile);
const dataDir=join(process.env.LOCALAPPDATA,'Soundux-Pouf');
const configPath=join(process.env.APPDATA,'Soundux','config.json');
const tokenFile=join(dataDir,'remote-token');
const token=existsSync(tokenFile)?readFileSync(tokenFile,'utf8').trim():randomBytes(12).toString('hex');
writeFileSync(tokenFile,token);
const port=3210;
let busy=false;
function config(){return JSON.parse(readFileSync(configPath,'utf8'));}
function authorized(req){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('soundux='))?.slice(8)||'';return cookie.length===token.length&&timingSafeEqual(Buffer.from(cookie),Buffer.from(token));}
async function bridge(mode){if(busy)throw Error('Aguarde o comando anterior');busy=true;try{return await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(here,'bridge.ps1'),'-Mode',mode],{windowsHide:true,timeout:25000});}finally{busy=false;}}
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
process.on('exit',()=>engine?.kill());
function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const server=http.createServer(async(req,res)=>{
 try{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/'){
   if(url.searchParams.get('key')===token){res.writeHead(303,{'Set-Cookie':`soundux=${token}; HttpOnly; SameSite=Strict; Path=/`,'Location':'/','Cache-Control':'no-store'});return res.end();}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(readFileSync(join(here,'index.html')));
  }
  if(!authorized(req))return send(res,401,{error:'Abra o link completo exibido no PC para conectar este celular.'});
  if(req.method==='GET'&&url.pathname==='/api/state'){
   const c=config();return send(res,200,{tabs:c.data.tabs.map(t=>({id:t.id,name:t.name,sounds:t.sounds.map(s=>({id:s.id,name:s.name,ready:true}))})),outputs:c.settings.outputs});
  }
  if(req.method!=='POST')return send(res,404,{error:'Nao encontrado'});
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return send(res,403,{error:'Origem recusada'});
  if(req.headers['content-type']!=='application/json')return send(res,415,{error:'Formato invalido'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)return send(res,413,{error:'Pedido muito grande'});}
  const args=JSON.parse(body||'{}');
  if(url.pathname==='/api/sync'){await audio('stop');await bridge('sync');return send(res,200,{ok:true});}
  if(url.pathname==='/api/play'){if(busy)return send(res,409,{error:'Aguarde a sincronização'});const sound=config().data.tabs.flatMap(t=>t.sounds).find(s=>s.id===args.id);if(!sound)return send(res,404,{error:'Audio nao encontrado'});return send(res,200,await audio('play',sound.id));}
  if(url.pathname==='/api/stop')return send(res,200,await audio('stop'));
  return send(res,404,{error:'Nao encontrado'});
 }catch(e){send(res,500,{error:e.stderr?.trim()||e.message});}
});
let lastAddresses='';
function refreshAddresses(){
 const ips=Object.values(networkInterfaces()).flat().filter(i=>i.family==='IPv4'&&!i.internal&&!i.address.startsWith('169.254.'));
 const urls=ips.map(i=>`http://${i.address}:${port}/?key=${token}`);
 const addresses=urls.join('\r\n');
 if(addresses!==lastAddresses||!existsSync(join(dataDir,'remote-address.txt'))){
  writeFileSync(join(dataDir,'remote-address.txt'),addresses);
  lastAddresses=addresses;
 }
 return urls;
}
server.listen(port,'0.0.0.0',()=>{
 console.log('Soundux Remote pronto. No celular, abra:\n'+refreshAddresses().join('\n'));
 setInterval(()=>{try{refreshAddresses();}catch(e){console.error('Falha ao atualizar enderecos: '+e.message);}},5000).unref();
});
