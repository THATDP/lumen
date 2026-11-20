'use strict';
// Lumen — servidor de sinalização. Zero dependências: `node server.js` (Node 18+).
// Papel: salas, nicknames únicos POR SALA (validados aqui), moderação, chat e relay de sinalização WebRTC.
// A mídia NÃO passa por aqui: vai direto entre os navegadores (malha P2P). Veja "Escala" no README da resposta.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = +process.env.PORT || 3000, MAX = +process.env.MAX_PEERS || 8, PUB = path.join(__dirname, 'public');
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', rooms = new Map(), socks = new Set();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const ICE = [{ urls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302').split(',') }];
if (process.env.TURN_URL) ICE.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER, credential: process.env.TURN_PASS });

const json = (s, o) => { s.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); s.end(JSON.stringify(o)); };
http.createServer((q, s) => {
  const u = new URL(q.url, 'http://h');
  if (u.pathname === '/api/ice') return json(s, ICE);
  if (u.pathname === '/api/rooms') return json(s, [...rooms.values()].filter(r => !r.priv && !r.locked).map(r => ({ code: r.code, name: r.name, n: r.peers.size })));
  const f = u.pathname === '/' || u.pathname.startsWith('/r/') ? 'index.html' : path.normalize(u.pathname).replace(/^[/\\]+/, '');
  const fp = path.join(PUB, f);
  if (!fp.startsWith(PUB)) return s.writeHead(403).end();
  fs.readFile(fp, (e, d) => {
    if (e) return s.writeHead(404).end('404');
    s.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
    s.end(d);
  });
}).on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') return socket.destroy();
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  const p = { id: crypto.randomBytes(6).toString('hex'), socket, alive: true, room: null, send: o => frame(socket, 1, Buffer.from(JSON.stringify(o))) };
  socks.add(p);
  let buf = Buffer.alloc(0);
  socket.on('data', d => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15, mask = buf[1] & 128;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 65536) return socket.destroy();
      if (buf.length < off + (mask ? 4 : 0) + len) return;
      const m = mask ? buf.subarray(off, off + 4) : null; if (mask) off += 4;
      const pl = Buffer.from(buf.subarray(off, off + len)); buf = buf.subarray(off + len);
      if (m) for (let i = 0; i < pl.length; i++) pl[i] ^= m[i & 3];
      if (op === 8) return socket.end();
      if (op === 9) frame(socket, 10, pl);
      else if (op === 10) p.alive = true;
      else if (op === 1) { try { onMsg(p, JSON.parse(pl.toString())); } catch (e) { /* mensagem inválida ignorada */ } }
    }
  });
  const gone = () => { socks.delete(p); drop(p, 'left'); };
  socket.on('close', gone); socket.on('error', () => socket.destroy());
}).listen(PORT, () => console.log('Lumen em http://localhost:' + PORT));

function frame(s, op, p) {
  if (s.destroyed) return;
  const n = p.length; let h;
  if (n < 126) h = Buffer.from([128 | op, n]);
  else if (n < 65536) { h = Buffer.alloc(4); h[0] = 128 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
  else { h = Buffer.alloc(10); h[0] = 128 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  s.write(Buffer.concat([h, p]));
}
setInterval(() => socks.forEach(p => { if (!p.alive) return p.socket.destroy(); p.alive = false; frame(p.socket, 9, Buffer.alloc(0)); }), 15000);

const norm = s => s.normalize('NFKC').trim().toLowerCase();               // "Player" == "PLAYER"
const cleanNick = v => { const n = String(v || '').normalize('NFKC').trim().replace(/\s+/g, ' '); return /^[\p{L}\p{N}_. -]{2,20}$/u.test(n) ? n : null; };
const nickTaken = (r, nick, except) => [...r.peers.values()].find(x => x !== except && norm(x.nick) === norm(nick));
const view = p => ({ id: p.id, nick: p.nick, role: p.role, st: p.st });
const bcast = (r, o, except) => r.peers.forEach(p => p !== except && p.send(o));

function drop(p, why) {
  const r = p.room; if (!r || !r.peers.delete(p.id)) return;
  p.room = null; bcast(r, { t: 'left', id: p.id, nick: p.nick, why });
  if (!r.peers.size) return void rooms.delete(r.code);
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
    let r;
    if (m.create) {
      let c; do c = Array.from({ length: 6 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join(''); while (rooms.has(c));
      r = { code: c, name: String(m.name || '').trim().slice(0, 40) || 'Sala de ' + nick, priv: m.priv !== false, locked: false, peers: new Map() };
      rooms.set(c, r);
    } else {
      r = rooms.get(String(m.code || '').trim().toUpperCase());
      if (!r) return err('no_room', 'Sala não encontrada. Confira o código.');
      if (r.locked) return err('locked', 'Esta sala está trancada pelo administrador.');
      if (r.peers.size >= MAX) return err('full', 'Sala cheia (limite de ' + MAX + ' participantes).');
    }
    const dup = nickTaken(r, nick);   // checagem síncrona no servidor: entradas simultâneas não duplicam
    if (dup) {
      if (m.uid && dup.uid === m.uid) { drop(dup, 'replaced'); dup.socket.end(); }  // mesmo dispositivo reconectando
      else return err('nick_taken', 'O nickname "' + nick + '" já está em uso nesta sala. Escolha outro.');
    }
    Object.assign(p, { uid: String(m.uid || '').slice(0, 64), nick, room: r, role: r.peers.size ? 'user' : 'host', st: {} });
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
      p.rl = (p.rl || []).filter(x => now - x < 5000); if (!text || p.rl.length >= 8) return; p.rl.push(now);
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
      if (isMod && tg && tg.role !== 'host' && !(p.role === 'mod' && tg.role === 'mod')) { tg.send({ t: 'kicked' }); drop(tg, 'kicked'); tg.socket.end(); }
      return;
    case 'mod':
      if (p.role === 'host' && tg && tg.role !== 'host') { tg.role = tg.role === 'mod' ? 'user' : 'mod'; bcast(r, { t: 'role', id: tg.id, role: tg.role }); }
      return;
  }
}
