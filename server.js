'use strict';
// Lumen — servidor de sinalização WebSocket e descoberta de salas.
// Papel: salas, nicknames únicos POR SALA (validados aqui), moderação, chat e relay de sinalização WebRTC.
// A mídia usa conexões P2P ou um servidor TURN externo, nunca o servidor de sinalização.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
let passwordWork=0;
async function derivePassword(password,salt){
  if(passwordWork>=8){const error=new Error('Authentication busy');error.code='BUSY';throw error}
  passwordWork++;
  try{return await scrypt(password,salt,32)}finally{passwordWork--}
}
const PORT = +process.env.PORT || 3000, MAX = +process.env.MAX_PEERS || 8;
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', rooms = new Map(), socks = new Set();
const ICE = [{ urls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302').split(',').map(x => x.trim()).filter(Boolean) }];
const turnUrls = (process.env.TURN_URL || '').split(',').map(x => x.trim()).filter(Boolean);
function iceServers() {
  const result = [...ICE];
  if (turnUrls.length && process.env.TURN_SECRET) {
    const ttl = Math.max(60, Number(process.env.TURN_TTL) || 3600);
    const username = `${Math.floor(Date.now() / 1000) + ttl}:${crypto.randomBytes(12).toString('hex')}`;
    const credential = crypto.createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64');
    result.push({ urls: turnUrls, username, credential });
  }
  return result;
}

const json = (s, o) => { s.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': 'https://thatdp.github.io' }); s.end(JSON.stringify(o)); };
const server = http.createServer((q, s) => {
  let u;try{u=new URL(q.url,'http://localhost')}catch{return s.writeHead(400).end('Bad request')}
  if (u.pathname === '/api/ice') return json(s, iceServers());
  if (u.pathname === '/api/rooms') return json(s, [...rooms.values()].filter(r => r.peers.size && !r.priv && !r.locked).map(r => ({ code: r.code, name: r.name, description: r.description, hasPassword: !!r.passwordHash, n: r.peers.size })));
  // Serve only the public entry point and explicitly scoped static assets.
  const asset = u.pathname.replace(/^\/lumen(?=\/)/, '');
  const isEntry = ['/', '/lumen/', '/index.html'].includes(u.pathname);
  if (!isEntry && !/^\/assets\/(?:css\/[a-z0-9-]+\.css|js\/[a-z0-9-]+\.js|img\/[a-z0-9-]+\.jpg)$/.test(asset)) return s.writeHead(404).end('404');
  const file = isEntry ? 'index.html' : asset.slice(1);
  fs.readFile(path.join(__dirname, file), (e, d) => {
    if (e) return s.writeHead(404).end('Not found');
    const type = isEntry ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.jpg') ? 'image/jpeg' : 'text/javascript';
    s.writeHead(200, { 'content-type': type + (file.endsWith('.jpg') ? '' : '; charset=utf-8'), 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }); s.end(d);
  });
});
const wss = new WebSocketServer({ server, maxPayload: 65536, perMessageDeflate: false });
wss.on('connection', socket => {
  const p = { id: crypto.randomBytes(6).toString('hex'), socket, alive: true, room: null,
    send: o => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(o)); } };
  socks.add(p);
  socket.on('pong', () => { p.alive = true; });
  socket.on('message', (data, binary) => {
    if (binary) return;
    const now=Date.now();p.messages=(p.messages||[]).filter(ts=>now-ts<10000);
    if(p.messages.length>=300){socket.close(1008,'rate limit');return}p.messages.push(now);
    try { const m = JSON.parse(data.toString()); if (m && typeof m === 'object' && !Array.isArray(m)) onMsg(p, m); } catch (e) { console.warn('Invalid message:', e.message); }
  });
  socket.on('close', () => { socks.delete(p); drop(p, 'left'); });
  socket.on('error', () => socket.terminate());
});
server.listen(PORT, '0.0.0.0', () => console.log('Lumen on port ' + PORT));
setInterval(() => socks.forEach(p => { if (!p.alive) return p.socket.terminate(); p.alive = false; p.socket.ping(); }), 15000);

const norm = s => s.normalize('NFKC').trim().toLowerCase();               // "Player" == "PLAYER"
const cleanNick = v => { const n = String(v || '').normalize('NFKC').trim().replace(/\s+/g, ' '); return /^[\p{L}\p{N}_. -]{2,20}$/u.test(n) ? n : null; };
const nickTaken = (r, nick, except) => [...r.peers.values()].find(x => x !== except && norm(x.nick) === norm(nick));
const view = p => ({ id: p.id, nick: p.nick, role: p.role, st: p.st });
const bcast = (r, o, except) => r.peers.forEach(p => p !== except && p.send(o));

function drop(p, why) {
  const r = p.room; if (!r || !r.peers.delete(p.id)) return;
  p.room = null; bcast(r, { t: 'left', id: p.id, nick: p.nick, why });
  if (why === 'left' && p.uid) r.reservations.set(p.uid, Date.now() + 60000);
  if (!r.peers.size) {
    r.timer = setTimeout(() => { if (!r.peers.size) rooms.delete(r.code); }, 60000);
    return;
  }
  if (p.role === 'host') {
    const n = [...r.peers.values()].find(x => x.role === 'mod') || r.peers.values().next().value;
    n.role = 'host'; bcast(r, { t: 'role', id: n.id, role: 'host' });
  }
}

async function joinRoom(p, m) {
  if (p.room || p.joining) return;
  const err = (code, text) => p.send({t:'err',code,text});
  const nick = cleanNick(m.nick);
  if (!nick) return err('bad_nick', 'Nickname inválido: use de 2 a 20 letras, números, espaço, _ . -');
  if (m.password != null && (typeof m.password !== 'string' || m.password.length > 128)) return err('password_invalid','Senha inválida. Use até 128 caracteres.');
  const uid=typeof m.uid==='string'?m.uid.slice(0,64):'', password=m.password||'';
  p.joining=true;
  try {
    let r;
    if(m.create){
      let passwordHash=null,passwordSalt=null;
      if(password){passwordSalt=crypto.randomBytes(16);passwordHash=await derivePassword(password,passwordSalt)}
      if(p.socket.readyState!==WebSocket.OPEN)return;
      let code;do code=Array.from({length:6},()=>ALPHA[crypto.randomInt(ALPHA.length)]).join('');while(rooms.has(code));
      r={code,name:String(m.name||'').trim().slice(0,40)||'Sala de '+nick,description:String(m.description||'').trim().slice(0,160),priv:m.priv!==false,locked:false,peers:new Map(),reservations:new Map(),timer:null,passwordHash,passwordSalt};
      rooms.set(code,r);
    } else {
      r=rooms.get(String(m.code||'').trim().toUpperCase());
      if(!r)return err('no_room','Sala não encontrada. Confira o código.');
      if(r.passwordHash){
        const now=Date.now();r.passwordTries=(r.passwordTries||[]).filter(ts=>now-ts<60000);
        if(r.passwordTries.length>=20)return err('rate_limit','Muitas tentativas. Aguarde um pouco e tente novamente.');
        r.passwordTries.push(now);
        const hash=await derivePassword(password,r.passwordSalt);
        if(p.socket.readyState!==WebSocket.OPEN)return;
        if(!crypto.timingSafeEqual(hash,r.passwordHash))return err('bad_password','Senha incorreta.');
        if(rooms.get(r.code)!==r)return err('no_room','Sala não encontrada. Confira o código.');
      }
    }
    if(p.socket.readyState!==WebSocket.OPEN||p.room)return;
    const active=uid&&[...r.peers.values()].find(x=>x.uid===uid),returning=uid&&r.reservations.get(uid)>Date.now();
    if(r.locked&&!returning&&!active)return err('locked','Esta sala está trancada pelo administrador.');
    if(r.peers.size>=MAX&&!active)return err('full','Sala cheia (limite de '+MAX+' participantes).');
    if(nickTaken(r,nick,active))return err('nick_taken','O nickname "'+nick+'" já está em uso nesta sala. Escolha outro.');
    if(active){drop(active,'replaced');active.socket.close()}
    clearTimeout(r.timer);r.timer=null;for(const [id,expires] of r.reservations)if(expires<=Date.now())r.reservations.delete(id);r.reservations.delete(uid);
    Object.assign(p,{uid,nick,room:r,role:r.peers.size?'user':'host',st:{}});r.peers.set(p.id,p);
    p.send({t:'joined',id:p.id,role:p.role,room:{code:r.code,name:r.name,description:r.description,hasPassword:!!r.passwordHash,priv:r.priv,locked:r.locked},peers:[...r.peers.values()].filter(x=>x!==p).map(view)});
    bcast(r,{t:'peer',peer:view(p)},p);
  } catch(error){if(error.code==='BUSY')err('rate_limit','Muitas tentativas. Aguarde um pouco e tente novamente.');else{console.error('Join failed:',error.message);err('server_error','Não foi possível entrar na sala. Tente novamente.')}}
  finally{p.joining=false}
}
function onMsg(p, m) {
  const err = (code, text) => p.send({ t: 'err', code, text });
  if (m.t === 'join') { void joinRoom(p,m); return; }
  const r = p.room; if (!r) return;
  const tg = r.peers.get(m.id), isMod = p.role === 'host' || p.role === 'mod';
  switch (m.t) {
    case 'state': {
      const a = m.st || {};
      for (const k of ['mic', 'cam', 'share']) if (k in a) p.st[k] = !!a[k];
      if ('watch' in a) p.st.watch = a.watch ? String(a.watch).slice(0, 20) : null;
      if (a.streams && typeof a.streams === 'object') p.st.streams = Object.fromEntries(Object.entries(a.streams).slice(0, 6).map(([k, v]) => [String(k).slice(0, 80), String(v).slice(0, 10)]));
      return bcast(r, { t: 'state', id: p.id, st: p.st }, p);
    }
    case 'signal': { const to = r.peers.get(m.to); return to && to.send({ t: 'signal', from: p.id, d: m.d }); }
    case 'chat': {
      const text = String(m.text || '').trim().slice(0, 500), now = Date.now();
      p.rl = (p.rl || []).filter(x => now - x < 5000); if (!text) return; if (p.rl.length >= 8) return err('rate_limit', 'Muitas mensagens. Aguarde um pouco e tente novamente.'); p.rl.push(now);
      return bcast(r, { t: 'chat', id: p.id, nick: p.nick, text, ts: now });
    }
    case 'react': return ['👍', '👏', '😂', '🔥', '😮', '❤️'].includes(m.e) && bcast(r, { t: 'react', id: p.id, nick: p.nick, e: m.e });
    case 'nick': {
      const nick = cleanNick(m.nick); if (!nick) return err('bad_nick', 'Nickname inválido.');
      if (nickTaken(r, nick, p)) return err('nick_taken', 'O nickname "' + nick + '" já está em uso nesta sala.');
      p.nick = nick; return bcast(r, { t: 'nick', id: p.id, nick });
    }
    case 'lock': if (isMod) { r.locked = !!m.v; return bcast(r, { t: 'room', locked: r.locked }); } return;
    case 'mute': if (isMod && tg && tg.role !== 'host') tg.send({ t: 'mute', by: p.nick }); return;
    case 'kick':
      if (isMod && tg && tg.role !== 'host' && !(p.role === 'mod' && tg.role === 'mod')) { tg.send({ t: 'kicked' }); drop(tg, 'kicked'); tg.socket.close(); }
      return;
    case 'mod':
      if (p.role === 'host' && tg && tg.role !== 'host') { tg.role = tg.role === 'mod' ? 'user' : 'mod'; bcast(r, { t: 'role', id: tg.id, role: tg.role }); }
      return;
  }
}
