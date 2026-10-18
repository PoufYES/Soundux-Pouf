import {randomBytes, createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync, renameSync} from 'node:fs';

const digest = value => createHash('sha256').update(value).digest('hex');
export function createPairing(file, now = Date.now) {
  let devices = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  let invitation = null;
  const save = () => {writeFileSync(file + '.tmp', JSON.stringify(devices), {mode:0o600}); renameSync(file + '.tmp', file);};
  return {
    invite() {invitation = {code:randomBytes(24).toString('hex'), expires:now()+120000}; return {...invitation};},
    pair(code, name) {
      if (!invitation || invitation.expires <= now() || code !== invitation.code) return null;
      invitation = null;
      const secret = randomBytes(32).toString('hex');
      devices = devices.filter(d=>d.expires>now());
      devices.push({id:randomBytes(8).toString('hex'), hash:digest(secret), name:String(name || 'Celular').slice(0,80), expires:now()+180*86400000});
      save(); return secret;
    },
    authorized(cookie='') {
      const secret = cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('soundux_device='))?.slice(15);
      return !!secret && devices.some(d=>d.expires>now() && d.hash===digest(secret));
    },
    list() {return devices.filter(d=>d.expires>now()).map(({id,name,expires})=>({id,name,expires}));},
    revoke(id) {devices=devices.filter(d=>d.id!==id); save();}
  };
}
