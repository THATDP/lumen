'use strict';

import { ws } from '../communication/websocket.js';
import { bus } from '../core/events.js';

export function renderCollabPanel(container) {
  container.innerHTML = `
    <div class="flex-col" style="height:100%">
      <div class="flex gap-1" style="padding:8px 12px;border-bottom:1px solid var(--border-subtle);background:var(--bg-elevated)">
        <button class="btn btn-ghost btn-sm is-active" data-ctab="wb">Quadro Branco</button>
        <button class="btn btn-ghost btn-sm" data-ctab="notes">Notas</button>
        <button class="btn btn-ghost btn-sm" data-ctab="polls">Enquetes & Timer</button>
      </div>
      <div id="collab-mount" class="flex-1" style="min-height:0;overflow:auto;padding:12px"></div>
    </div>
  `;

  const mount = container.querySelector('#collab-mount');
  const tabs = container.querySelectorAll('[data-ctab]');
  let cleanup = null;

  const showTab = tab => {
    if (cleanup) { cleanup(); cleanup = null; }
    tabs.forEach(t => t.classList.toggle('is-active', t.dataset.ctab === tab));

    if (tab === 'wb') {
      mount.innerHTML = `
        <div class="flex-col gap-2" style="height:100%">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <input type="color" id="wb-color" value="#6366f1" style="width:28px;height:28px;border:0;background:none" />
              <input type="range" id="wb-size" min="2" max="14" value="3" style="width:80px" />
            </div>
            <button class="btn btn-secondary btn-sm" id="wb-clear">Limpar</button>
          </div>
          <canvas id="wb-canvas" width="520" height="280" style="width:100%;height:260px;background:#0b0d14;border-radius:var(--radius-md);border:1px solid var(--border-subtle);cursor:crosshair"></canvas>
        </div>
      `;
      const canvas = mount.querySelector('#wb-canvas');
      const ctx = canvas.getContext('2d');
      let drawing = false;
      let last = null;

      const getPos = e => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) * (canvas.width / rect.width),
          y: (e.clientY - rect.top) * (canvas.height / rect.height)
        };
      };

      const drawLine = (a, b, color, size) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      };

      canvas.onpointerdown = e => { drawing = true; last = getPos(e); };
      canvas.onpointermove = e => {
        if (!drawing) return;
        const pos = getPos(e);
        const color = mount.querySelector('#wb-color').value;
        const size = Number(mount.querySelector('#wb-size').value);
        drawLine(last, pos, color, size);
        ws.send({ t: 'collab', tool: 'wb', payload: { a: last, b: pos, color, size } });
        last = pos;
      };
      window.addEventListener('pointerup', () => { drawing = false; });

      mount.querySelector('#wb-clear').onclick = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ws.send({ t: 'collab', tool: 'wb_clear' });
      };

      const unsub = bus.on('ws:collab', msg => {
        if (msg.tool === 'wb' && msg.payload) {
          drawLine(msg.payload.a, msg.payload.b, msg.payload.color, msg.payload.size);
        } else if (msg.tool === 'wb_clear') {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      });
      cleanup = unsub;
    } else if (tab === 'notes') {
      mount.innerHTML = `
        <div class="flex-col gap-2" style="height:100%">
          <div class="text-xs text-muted">Notas compartilhadas da sala (sincronizadas em tempo real)</div>
          <textarea class="textarea" id="collab-notes" style="flex:1;min-height:220px" placeholder="Escreva ideias, pautas ou links..."></textarea>
        </div>
      `;
      const ta = mount.querySelector('#collab-notes');
      ta.oninput = () => ws.send({ t: 'collab', tool: 'notes', payload: { text: ta.value } });
      const unsub = bus.on('ws:collab', msg => {
        if (msg.tool === 'notes' && msg.payload) ta.value = msg.payload.text || '';
      });
      cleanup = unsub;
    } else if (tab === 'polls') {
      mount.innerHTML = `
        <div class="flex-col gap-4">
          <div class="flex-col gap-2">
            <div class="text-xs" style="font-weight:600">Enquete Rápida</div>
            <form class="flex gap-2" id="poll-form">
              <input class="input" id="poll-q" placeholder="Pergunta da enquete..." />
              <button class="btn btn-primary btn-sm" type="submit">Criar</button>
            </form>
            <div id="poll-active"></div>
          </div>
          <div class="flex-col gap-2">
            <div class="text-xs" style="font-weight:600">Temporizador Compartilhado</div>
            <div class="flex items-center gap-2">
              <span id="timer-display" class="font-mono" style="font-size:20px;font-weight:700">05:00</span>
              <button class="btn btn-secondary btn-sm" id="timer-start">Iniciar 5m</button>
            </div>
          </div>
        </div>
      `;
      let votes = { yes: 0, no: 0 };
      const pollActive = mount.querySelector('#poll-active');
      const renderPoll = q => {
        if (!q) return;
        pollActive.innerHTML = `
          <div class="surface-box" style="padding:12px">
            <div class="text-sm" style="font-weight:600;margin-bottom:8px">${q}</div>
            <div class="flex gap-2">
              <button class="btn btn-secondary btn-sm" data-vote="yes">Sim (${votes.yes})</button>
              <button class="btn btn-secondary btn-sm" data-vote="no">Não (${votes.no})</button>
            </div>
          </div>
        `;
        pollActive.querySelectorAll('[data-vote]').forEach(b => {
          b.onclick = () => {
            votes[b.dataset.vote]++;
            renderPoll(q);
            ws.send({ t: 'collab', tool: 'poll_vote', payload: { vote: b.dataset.vote, q } });
          };
        });
      };

      mount.querySelector('#poll-form').onsubmit = e => {
        e.preventDefault();
        const q = mount.querySelector('#poll-q').value.trim();
        if (!q) return;
        votes = { yes: 0, no: 0 };
        renderPoll(q);
        ws.send({ t: 'collab', tool: 'poll_new', payload: { q } });
      };

      let timerInt = null;
      mount.querySelector('#timer-start').onclick = () => {
        clearInterval(timerInt);
        let sec = 300;
        const disp = mount.querySelector('#timer-display');
        timerInt = setInterval(() => {
          sec--;
          if (sec <= 0) { clearInterval(timerInt); disp.textContent = '00:00'; return; }
          disp.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
        }, 1000);
      };

      const unsub = bus.on('ws:collab', msg => {
        if (msg.tool === 'poll_new' && msg.payload) {
          votes = { yes: 0, no: 0 };
          renderPoll(msg.payload.q);
        } else if (msg.tool === 'poll_vote' && msg.payload) {
          votes[msg.payload.vote]++;
          renderPoll(msg.payload.q);
        }
      });
      cleanup = () => { clearInterval(timerInt); unsub(); };
    }
  };

  tabs.forEach(t => { t.onclick = () => showTab(t.dataset.ctab); });
  showTab('wb');
  return () => { if (cleanup) cleanup(); };
}
