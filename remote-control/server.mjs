import http from 'node:http';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {execFile} from 'node:child_process';
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
async function bridge(mode,keys=[]){if(busy)throw Error('Aguarde o comando anterior');busy=true;try{return await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(here,'bridge.ps1'),'-Mode',mode,...(keys.length?['-Keys',keys.join(',')]:[])],{windowsHide:true,timeout:25000});}finally{busy=false;}}
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
   const c=config();return send(res,200,{tabs:c.data.tabs.map(t=>({id:t.id,name:t.name,sounds:t.sounds.map(s=>({id:s.id,name:s.name,ready:!!s.hotkeys.length}))})),outputs:c.settings.outputs});
  }
  if(req.method!=='POST')return send(res,404,{error:'Nao encontrado'});
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return send(res,403,{error:'Origem recusada'});
  if(req.headers['content-type']!=='application/json')return send(res,415,{error:'Formato invalido'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)return send(res,413,{error:'Pedido muito grande'});}
  const args=JSON.parse(body||'{}');
  if(url.pathname==='/api/sync'){await bridge('sync');return send(res,200,{ok:true});}
  const c=config();let keys;
  if(url.pathname==='/api/play'){const sound=c.data.tabs.flatMap(t=>t.sounds).find(s=>s.id===args.id);if(!sound)return send(res,404,{error:'Audio nao encontrado'});keys=sound.hotkeys;}
  else if(url.pathname==='/api/stop')keys=c.settings.stopHotkey;
  else return send(res,404,{error:'Nao encontrado'});
  if(!keys?.length)return send(res,409,{error:'Clique em Sincronizar no controle para preparar os atalhos.'});
  await bridge('keys',keys);send(res,200,{ok:true});
 }catch(e){send(res,500,{error:e.stderr?.trim()||e.message});}
});
server.listen(port,'0.0.0.0',()=>{
 const ips=Object.values(networkInterfaces()).flat().filter(i=>i.family==='IPv4'&&!i.internal&&!i.address.startsWith('169.254.'));
 const urls=ips.map(i=>`http://${i.address}:${port}/?key=${token}`);
 writeFileSync(join(dataDir,'remote-address.txt'),urls.join('\r\n'));
 console.log('Soundux Remote pronto. No celular, abra:\n'+urls.join('\n'));
});
