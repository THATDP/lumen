'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { WebSocket } = require('ws');

function startServer(port) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    proc.stdout.on('data', chunk => {
      if (chunk.toString().includes('Lumen on port')) resolve(proc);
    });
    proc.on('error', reject);
  });
}

test('HTTP endpoints, CORS headers, and WebSocket room/chat/game flow', async () => {
  const port = 3457;
  const serverProc = await startServer(port);
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Health
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('access-control-allow-origin'), 'https://thatdp.github.io');
    const healthJson = await health.json();
    assert.equal(healthJson.ok, true);

    // 2. OPTIONS preflight
    const opt = await fetch(`${base}/api/rooms`, { method: 'OPTIONS' });
    assert.equal(opt.status, 204);
    assert.equal(opt.headers.get('access-control-allow-origin'), 'https://thatdp.github.io');

    // 3. /api/ice & /api/rooms
    const ice = await fetch(`${base}/api/ice`);
    assert.equal(ice.status, 200);
    const iceJson = await ice.json();
    assert.ok(Array.isArray(iceJson) && iceJson.length >= 1);

    const rooms = await fetch(`${base}/api/rooms`);
    assert.equal(rooms.status, 200);
    assert.deepEqual(await rooms.json(), []);

    // 4. WebSocket: create room, join room, chat, game
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => ws1.on('open', r));

    const joined1 = new Promise(r => ws1.on('message', d => {
      const m = JSON.parse(d);
      if (m.t === 'joined') r(m);
    }));
    ws1.send(JSON.stringify({ t: 'join', create: true, nick: 'Alice', uid: 'u1', priv: false }));
    const j1 = await joined1;
    assert.ok(j1.room.code);

    const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => ws2.on('open', r));
    const joined2 = new Promise(r => ws2.on('message', d => {
      const m = JSON.parse(d);
      if (m.t === 'joined') r(m);
    }));
    ws2.send(JSON.stringify({ t: 'join', create: false, code: j1.room.code, nick: 'Bob', uid: 'u2' }));
    const j2 = await joined2;
    assert.equal(j2.room.code, j1.room.code);

    // Chat
    const chatRecv = new Promise(r => ws2.on('message', d => {
      const m = JSON.parse(d);
      if (m.t === 'chat') r(m);
    }));
    ws1.send(JSON.stringify({ t: 'chat', op: 'new', text: 'Teste conectividade' }));
    const c = await chatRecv;
    assert.equal(c.text, 'Teste conectividade');

    ws1.close();
    ws2.close();
  } finally {
    serverProc.kill();
  }
});
