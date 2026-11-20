'use strict';

import { state } from '../../core/state.js';
import { ws } from '../../communication/websocket.js';
import { bus } from '../../core/events.js';

export function renderArena3D(container, onBack) {
  container.innerHTML = `
    <div class="flex-col gap-2" style="padding:12px;height:100%">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <button class="btn btn-ghost btn-sm" id="a3d-back">← Voltar</button>
          <span class="badge badge-accent">Lumen Arena 3D</span>
          <span class="text-xs text-muted">WASD / Setas para mover na arena 3D</span>
        </div>
      </div>
      <canvas id="a3d-canvas" width="640" height="340" style="width:100%;max-height:340px;background:#07090f;border-radius:var(--radius-md);border:1px solid var(--border-subtle)"></canvas>
    </div>
  `;

  const canvas = container.querySelector('#a3d-canvas');
  const ctx = canvas.getContext('2d');
  const me = { x: 0, z: 0, color: state.profile.color || '#6366f1' };
  const remotes = new Map();
  const keys = {};

  const kd = e => { keys[e.code] = true; };
  const ku = e => { keys[e.code] = false; };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);

  const unsub = bus.on('ws:game', msg => {
    if (msg.game === 'arena3d' && msg.action === 'pos' && msg.payload) {
      remotes.set(msg.id, { nick: msg.nick, ...msg.payload, ts: Date.now() });
    }
  });

  // Projeção 3D em perspectiva simples e fluida
  const project = (x, y, z) => {
    const camY = 5.5;
    const camZ = -9;
    const dz = z - camZ;
    if (dz <= 0.5) return null;
    const scale = 320 / dz;
    return {
      x: canvas.width / 2 + x * scale,
      y: canvas.height / 2 + (camY - y) * scale * 0.65,
      s: scale
    };
  };

  let raf = 0;
  let lastSync = 0;

  const loop = now => {
    const speed = 0.12;
    if (keys.KeyW || keys.ArrowUp) me.z += speed;
    if (keys.KeyS || keys.ArrowDown) me.z -= speed;
    if (keys.KeyA || keys.ArrowLeft) me.x -= speed;
    if (keys.KeyD || keys.ArrowRight) me.x += speed;
    me.x = Math.max(-5, Math.min(5, me.x));
    me.z = Math.max(-5, Math.min(5, me.z));

    if (now - lastSync > 50) {
      lastSync = now;
      ws.send({ t: 'game', game: 'arena3d', action: 'pos', payload: { x: +me.x.toFixed(2), z: +me.z.toFixed(2), color: me.color } });
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grade 3D da arena
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
    ctx.lineWidth = 1;
    for (let i = -5; i <= 5; i++) {
      const a = project(i, 0, -5), b = project(i, 0, 5);
      if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      const c = project(-5, 0, i), d = project(5, 0, i);
      if (c && d) { ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke(); }
    }

    const drawCube = (x, z, color, label) => {
      const p = project(x, 0.5, z);
      if (!p) return;
      const size = Math.max(12, p.s * 0.7);
      ctx.fillStyle = color;
      ctx.fillRect(p.x - size / 2, p.y - size, size, size);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.strokeRect(p.x - size / 2, p.y - size, size, size);
      ctx.fillStyle = '#fff';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, p.x, p.y - size - 6);
    };

    for (const [id, r] of remotes) {
      if (now - r.ts > 5000) { remotes.delete(id); continue; }
      drawCube(r.x, r.z, r.color || '#06b6d4', r.nick);
    }
    drawCube(me.x, me.z, me.color, 'Você');

    raf = requestAnimationFrame(loop);
  };

  raf = requestAnimationFrame(loop);
  const cleanup = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    unsub();
  };
  container.querySelector('#a3d-back').onclick = () => { cleanup(); onBack(); };
  return cleanup;
}
