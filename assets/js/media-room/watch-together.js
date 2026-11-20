'use strict';

import { ws } from '../communication/websocket.js';
import { bus } from '../core/events.js';
import { notify } from '../components/notification.js';

function parseMediaUrl(raw) {
  try {
    const u = new URL(raw.trim());
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      const id = u.hostname.includes('youtu.be') ? u.pathname.slice(1) : u.searchParams.get('v');
      if (id) return { provider: 'youtube', id, embed: `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=1`, title: `YouTube (${id})` };
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      if (id) return { provider: 'vimeo', id, embed: `https://player.vimeo.com/video/${id}?autoplay=1`, title: `Vimeo (${id})` };
    }
    if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) {
      return { provider: 'video', id: raw, embed: raw, title: u.pathname.split('/').pop() };
    }
  } catch {}
  return null;
}

export function renderWatchTogether(container) {
  const queue = [];
  let currentIndex = -1;

  container.innerHTML = `
    <div class="media-room-wrap">
      <form class="flex gap-2" id="wt-form">
        <input class="input" id="wt-url" placeholder="Cole link do YouTube, Vimeo ou MP4..." />
        <button class="btn btn-primary btn-sm" type="submit">Adicionar</button>
      </form>
      <div class="media-player-box" id="wt-player">
        <div class="text-xs text-muted">Nenhum vídeo na fila. Cole um link acima para assistir juntos.</div>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted">Fila compartilhada</span>
        <div class="flex gap-1">
          <button class="btn btn-secondary btn-sm" id="wt-prev">⏮</button>
          <button class="btn btn-secondary btn-sm" id="wt-next">⏭</button>
        </div>
      </div>
      <div class="media-queue-list" id="wt-queue"></div>
    </div>
  `;

  const playerBox = container.querySelector('#wt-player');
  const queueEl = container.querySelector('#wt-queue');

  const renderPlayer = () => {
    const item = queue[currentIndex];
    if (!item) {
      playerBox.innerHTML = `<div class="text-xs text-muted">Nenhum vídeo na fila.</div>`;
    } else if (item.provider === 'video') {
      playerBox.innerHTML = `<video src="${item.embed}" controls autoplay></video>`;
    } else {
      playerBox.innerHTML = `<iframe src="${item.embed}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
    }

    queueEl.innerHTML = queue.map((q, i) => `
      <div class="media-queue-item" style="${i === currentIndex ? 'border:1px solid var(--accent-primary)' : ''}">
        <span class="truncate">${i + 1}. ${q.title} <span class="text-muted">(${q.by || 'Participante'})</span></span>
        <button class="panel-ctrl-btn" data-play-idx="${i}">▶</button>
      </div>
    `).join('');
  };

  container.querySelector('#wt-form').onsubmit = e => {
    e.preventDefault();
    const input = container.querySelector('#wt-url');
    const parsed = parseMediaUrl(input.value);
    if (!parsed) {
      notify('Link não suportado. Use YouTube, Vimeo ou MP4.', 'warning');
      return;
    }
    input.value = '';
    queue.push({ ...parsed, by: 'Você' });
    if (currentIndex === -1) currentIndex = 0;
    renderPlayer();
    ws.send({ t: 'media_room', action: 'add', payload: parsed });
  };

  container.querySelector('#wt-prev').onclick = () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderPlayer();
      ws.send({ t: 'media_room', action: 'index', payload: { index: currentIndex } });
    }
  };

  container.querySelector('#wt-next').onclick = () => {
    if (currentIndex < queue.length - 1) {
      currentIndex++;
      renderPlayer();
      ws.send({ t: 'media_room', action: 'index', payload: { index: currentIndex } });
    }
  };

  queueEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-play-idx]');
    if (btn) {
      currentIndex = Number(btn.dataset.playIdx);
      renderPlayer();
      ws.send({ t: 'media_room', action: 'index', payload: { index: currentIndex } });
    }
  });

  const unsub = bus.on('ws:media_room', msg => {
    if (msg.action === 'add' && msg.payload) {
      queue.push({ ...msg.payload, by: msg.nick });
      if (currentIndex === -1) currentIndex = 0;
      renderPlayer();
    } else if (msg.action === 'index' && msg.payload) {
      currentIndex = msg.payload.index;
      renderPlayer();
    }
  });

  return () => unsub();
}
