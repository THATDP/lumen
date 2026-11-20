'use strict';
// Lumen — servidor de sinalização WebSocket e descoberta de salas.
// Papel: salas, nicknames únicos POR SALA (validados aqui), moderação, chat e relay de sinalização WebRTC.
// A mídia usa conexões P2P ou um servidor TURN externo, nunca o servidor de sinalização.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
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
  } else if (turnUrls.length && process.env.TURN_USER && process.env.TURN_PASS) {
    result.push({ urls: turnUrls, username: process.env.TURN_USER, credential: process.env.TURN_PASS });
  }
  return result;
}

const json = (s, o) => { s.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': 'https://thatdp.github.io' }); s.end(JSON.stringify(o)); };
const server = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://localhost');
  if (u.pathname === '/api/ice') return json(s, iceServers());
  if (u.pathname === '/api/rooms') return json(s, [...rooms.values()].filter(r => r.peers.size && !r.priv && !r.locked).map(r => ({ code: r.code, name: r.name, n: r.peers.size })));
  // Serve only the public entry point, never server source or environment files.
  if (!['/', '/lumen/', '/index.html'].includes(u.pathname)) return s.writeHead(404).end('404');
  fs.readFile(path.join(__dirname, 'index.html'), (e, d) => {
    if (e) return s.writeHead(500).end('Unable to load application');
    s.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }); s.end(d);
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

function onMsg(p, m) {
  const err = (code, text) => p.send({ t: 'err', code, text });
  if (m.t === 'join') {
    if (p.room) return;
    const nick = cleanNick(m.nick); if (!nick) return err('bad_nick', 'Nickname inválido: use de 2 a 20 letras, números, espaço, _ . -');
    const uid = typeof m.uid === 'string' ? m.uid.slice(0, 64) : '';
    let r;
    if (m.create) {
      let c; do c = Array.from({ length: 6 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join(''); while (rooms.has(c));
      r = { code: c, name: String(m.name || '').trim().slice(0, 40) || 'Sala de ' + nick, priv: m.priv !== false, locked: false, peers: new Map(), reservations: new Map(), timer: null };
      rooms.set(c, r);
    } else {
      r = rooms.get(String(m.code || '').trim().toUpperCase());
      if (!r) return err('no_room', 'Sala não encontrada. Confira o código.');
    }
    const active = uid && [...r.peers.values()].find(x => x.uid === uid);
    const returning = uid && r.reservations.get(uid) > Date.now();
    if (r.locked && !returning && !active) return err('locked', 'Esta sala está trancada pelo administrador.');
    if (r.peers.size >= MAX && !active) return err('full', 'Sala cheia (limite de ' + MAX + ' participantes).');
    // Validate the nickname before replacing the old session: a rejected join must not evict it.
    const dup = nickTaken(r, nick, active);
    if (dup) return err('nick_taken', 'O nickname "' + nick + '" já está em uso nesta sala. Escolha outro.');
    if (active) { drop(active, 'replaced'); active.socket.close(); }
    clearTimeout(r.timer); r.timer = null; for (const [id, expires] of r.reservations) if (expires <= Date.now()) r.reservations.delete(id); r.reservations.delete(uid);
    Object.assign(p, { uid, nick, room: r, role: r.peers.size ? 'user' : 'host', st: {} });
    r.peers.set(p.id, p);
    p.send({ t: 'joined', id: p.id, role: p.role, room: { code: r.code, name: r.name, priv: r.priv, locked: r.locked }, peers: [...r.peers.values()].filter(x => x !== p).map(view) });
    return bcast(r, { t: 'peer', peer: view(p) }, p);
  }
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
