'use strict';

import { state } from '../../core/state.js';
import { ws } from '../../communication/websocket.js';
import { bus } from '../../core/events.js';
import { sounds } from '../../core/sounds.js';

export function renderPlatformer2D(container, onBack) {
  container.innerHTML = `
    <div class="flex-col gap-2" style="padding:12px;height:100%">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <button class="btn btn-ghost btn-sm" id="p2d-back">← Voltar</button>
          <span class="badge badge-accent">Lumen Dash 2D</span>
          <span class="text-xs text-muted">Use A/D ou Setas + Espaço para pular</span>
        </div>
        <div id="p2d-score" class="text-xs" style="font-weight:600">Estrelas: 0/5</div>
      </div>
      <canvas id="p2d-canvas" width="640" height="340" style="width:100%;max-height:340px;background:#0b0d14;border-radius:var(--radius-md);border:1px solid var(--border-subtle)"></canvas>
    </div>
  `;

  const canvas = container.querySelector('#p2d-canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = container.querySelector('#p2d-score');

  const platforms = [
    { x: 0, y: 310, w: 640, h: 30 },
    { x: 90, y: 245, w: 120, h: 14 },
    { x: 260, y: 195, w: 130, h: 14 },
    { x: 440, y: 145, w: 120, h: 14 },
    { x: 210, y: 100, w: 110, h: 14 }
  ];

  const stars = [
    { x: 140, y: 215, got: false },
    { x: 320, y: 165, got: false },
    { x: 495, y: 115, got: false },
    { x: 260, y: 70, got: false },
    { x: 580, y: 280, got: false }
  ];

  const me = { x: 40, y: 260, vx: 0, vy: 0, w: 22, h: 28, onGround: false, jumps: 0, score: 0 };
  const remotes = new Map();
  const keys = {};

  const onKey = (e, down) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW'].includes(e.code)) {
      keys[e.code] = down;
      if (down && (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') && me.jumps < 2) {
        me.vy = -8.5;
        me.jumps++;
        me.onGround = false;
      }
    }
  };
  const kd = e => onKey(e, true);
  const ku = e => onKey(e, false);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);

  const unsub = bus.on('ws:game', msg => {
    if (msg.game === 'platformer' && msg.action === 'pos' && msg.payload) {
      remotes.set(msg.id, { nick: msg.nick, ...msg.payload, ts: Date.now() });
    }
  });

  let raf = 0;
  let lastSync = 0;

  const loop = now => {
    // Physics
    const moveLeft = keys.ArrowLeft || keys.KeyA;
    const moveRight = keys.ArrowRight || keys.KeyD;
    me.vx = moveLeft ? -3.6 : moveRight ? 3.6 : 0;
    me.vy += 0.42;
    me.x = Math.max(0, Math.min(canvas.width - me.w, me.x + me.vx));
    me.y += me.vy;
    me.onGround = false;

    for (const p of platforms) {
      if (me.x + me.w > p.x && me.x < p.x + p.w && me.y + me.h >= p.y && me.y + me.h <= p.y + p.h + 10 && me.vy >= 0) {
        me.y = p.y - me.h;
        me.vy = 0;
        me.onGround = true;
        me.jumps = 0;
      }
    }

    for (const s of stars) {
      if (!s.got && Math.hypot(me.x + me.w / 2 - s.x, me.y + me.h / 2 - s.y) < 22) {
        s.got = true;
        me.score++;
        sounds.play('win');
        scoreEl.textContent = `Estrelas: ${me.score}/5`;
      }
    }

    if (now - lastSync > 50) {
      lastSync = now;
      ws.send({ t: 'game', game: 'platformer', action: 'pos', payload: { x: Math.round(me.x), y: Math.round(me.y), color: state.profile.color } });
    }

    // Render
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1e293b';
    for (const p of platforms) ctx.fillRect(p.x, p.y, p.w, p.h);

    for (const s of stars) {
      if (s.got) continue;
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const [id, r] of remotes) {
      if (now - r.ts > 5000) { remotes.delete(id); continue; }
      ctx.fillStyle = r.color || '#06b6d4';
      ctx.fillRect(r.x, r.y, 22, 28);
      ctx.fillStyle = '#fff';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(r.nick, r.x - 4, r.y - 5);
    }

    ctx.fillStyle = state.profile.color || '#6366f1';
    ctx.fillRect(me.x, me.y, me.w, me.h);
    ctx.fillStyle = '#fff';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('Você', me.x, me.y - 5);

    raf = requestAnimationFrame(loop);
  };

  raf = requestAnimationFrame(loop);
  container.querySelector('#p2d-back').onclick = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    unsub();
    onBack();
  };

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    unsub();
  };
}
