'use strict';

import { state } from '../core/state.js';
import { bus } from '../core/events.js';
import { ws } from '../communication/websocket.js';
import { getRtcDiagnostics } from '../communication/rtc.js';
import { toggleMic, toggleCam, toggleScreenShare, stopAllLocalMedia } from '../media/media-controller.js';
import { renderChatPanel } from '../chat/chat-controller.js';
import { renderGamesHub } from '../games/game-hub.js';
import { renderWatchTogether } from '../media-room/watch-together.js';
import { renderCollabPanel } from '../collaboration/collab-tools.js';
import { openProfileModal } from '../profiles/profile-controller.js';
import { LAYOUT_PRESETS, makePanelDraggable } from './room-layout.js';
import { openModal } from '../components/modal.js';
import { notify } from '../components/notification.js';

const PANEL_DEFS = {
  participants: { title: 'Participantes' },
  stage: { title: 'Palco / Transmissão' },
  chat: { title: 'Chat' },
  games: { title: 'Jogos' },
  watch: { title: 'Watch Together' },
  collab: { title: 'Colaboração' }
};

export function renderRoomView(root, onLeave) {
  root.innerHTML = `
    <div class="room-view">
      <header class="room-topbar">
        <div class="flex items-center gap-3">
          <div class="brand-orb" style="width:24px;height:24px;font-size:12px">L</div>
          <div>
            <div class="text-sm" style="font-weight:600">${state.room?.name || 'Sala Lumen'}</div>
            <div class="text-xs text-muted font-mono">Código: ${state.room?.code || ''}</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-copy-invite">Copiar Convite</button>
        </div>
        <div class="flex items-center gap-2">
          <select class="select" id="layout-preset-select" style="width:auto;height:32px;font-size:12px">
            ${Object.entries(LAYOUT_PRESETS).map(([k, v]) => `<option value="${k}" ${state.layout.preset === k ? 'selected' : ''}>Layout: ${v.label}</option>`).join('')}
          </select>
          <button class="btn btn-ghost btn-sm" id="btn-diagnostics">Diagnóstico</button>
          <button class="btn btn-ghost btn-sm" id="btn-room-profile">Perfil</button>
          <button class="btn btn-danger btn-sm" id="btn-leave-room">Sair</button>
        </div>
      </header>

      <main class="room-workspace" id="room-workspace"></main>

      <footer class="room-dock">
        <div class="dock-group">
          <button class="btn btn-secondary" id="dock-mic">🎙️ Microfone</button>
          <button class="btn btn-secondary" id="dock-cam">📷 Câmera</button>
          <button class="btn btn-secondary" id="dock-share">🖥️ Compartilhar Tela</button>
        </div>
        <div class="dock-group">
          <button class="btn btn-ghost btn-sm" id="dock-hand">✋ Mão</button>
          <button class="btn btn-ghost btn-sm" data-quick-emoji="👍">👍</button>
          <button class="btn btn-ghost btn-sm" data-quick-emoji="👏">👏</button>
          <button class="btn btn-ghost btn-sm" data-quick-emoji="🔥">🔥</button>
        </div>
        <div class="dock-group">
          <button class="btn btn-ghost btn-sm" data-open-panel="games">🎮 Jogos</button>
          <button class="btn btn-ghost btn-sm" data-open-panel="watch">🎬 Watch</button>
          <button class="btn btn-ghost btn-sm" data-open-panel="collab">🎨 Quadro</button>
        </div>
      </footer>
    </div>
  `;

  const workspace = root.querySelector('#room-workspace');
  const cleanups = [];
  const panelEls = {};

  const mountPanel = id => {
    if (panelEls[id]) return panelEls[id];
    const el = document.createElement('section');
    el.className = 'lumen-panel';
    el.dataset.panel = id;
    el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">${PANEL_DEFS[id].title}</span>
        <div class="panel-controls">
          <button class="panel-ctrl-btn" data-p-min title="Minimizar">_</button>
          <button class="panel-ctrl-btn" data-p-max title="Maximizar">□</button>
          <button class="panel-ctrl-btn" data-p-close title="Ocultar">✕</button>
        </div>
      </div>
      <div class="panel-body"></div>
      <div class="panel-resize-handle"></div>
    `;

    el.querySelector('[data-p-min]').onclick = () => el.classList.toggle('is-minimized');
    el.querySelector('[data-p-max]').onclick = () => el.classList.toggle('is-maximized');
    el.querySelector('[data-p-close]').onclick = () => { el.hidden = true; };

    makePanelDraggable(el, workspace);
    const body = el.querySelector('.panel-body');

    if (id === 'participants') {
      const renderPeers = () => {
        const cards = [];
        // Local card
        cards.push(`
          <div class="participant-card">
            <div class="participant-video-wrap">
              ${state.local.camEnabled && state.local.cam
                ? `<video id="local-cam-vid" autoplay muted playsinline style="transform:scaleX(-1)"></video>`
                : `<div class="avatar-circle" style="background:${state.profile.color}">${state.profile.nick.slice(0, 2).toUpperCase()}</div>`}
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs truncate" style="font-weight:600">${state.profile.nick} (Você)</span>
              <span class="text-xs">${state.local.micEnabled ? '🎙️' : '🔇'} ${state.local.handRaised ? '✋' : ''}</span>
            </div>
          </div>
        `);
        for (const p of state.peers.values()) {
          cards.push(`
            <div class="participant-card" data-peer-card="${p.id}">
              <div class="participant-video-wrap">
                ${p.streamCam
                  ? `<video autoplay playsinline data-peer-cam="${p.id}"></video>`
                  : `<div class="avatar-circle" style="background:${p.st?.profile?.color || '#06b6d4'}">${p.nick.slice(0, 2).toUpperCase()}</div>`}
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs truncate" style="font-weight:600">${p.nick}</span>
                <span class="text-xs">${p.st?.mic ? '🎙️' : '🔇'} ${p.st?.hand ? '✋' : ''}</span>
              </div>
            </div>
          `);
        }
        body.innerHTML = `<div class="participants-grid">${cards.join('')}</div>`;
        const localVid = body.querySelector('#local-cam-vid');
        if (localVid && state.local.cam) localVid.srcObject = state.local.cam;
        for (const p of state.peers.values()) {
          const pv = body.querySelector(`[data-peer-cam="${p.id}"]`);
          if (pv && p.streamCam) pv.srcObject = p.streamCam;
          if (p.streamAudio) {
            let aud = document.getElementById(`aud-${p.id}`);
            if (!aud) {
              aud = document.createElement('audio');
              aud.id = `aud-${p.id}`;
              aud.autoplay = true;
              document.body.appendChild(aud);
            }
            if (aud.srcObject !== p.streamAudio) aud.srcObject = p.streamAudio;
          }
        }
      };
      renderPeers();
      cleanups.push(bus.on('rtc:tracks-updated', renderPeers));
      cleanups.push(bus.on('media:updated', renderPeers));
      cleanups.push(bus.on('room:peers-updated', renderPeers));
    } else if (id === 'stage') {
      const renderStage = () => {
        const sharingPeer = [...state.peers.values()].find(p => p.streamScreen);
        if (state.local.screenEnabled && state.local.screen) {
          body.innerHTML = `<div class="stage-container"><video id="stage-vid" autoplay muted playsinline></video></div>`;
          body.querySelector('#stage-vid').srcObject = state.local.screen;
        } else if (sharingPeer) {
          body.innerHTML = `<div class="stage-container"><video id="stage-vid" autoplay playsinline></video></div>`;
          body.querySelector('#stage-vid').srcObject = sharingPeer.streamScreen;
        } else {
          body.innerHTML = `<div class="stage-container"><div class="text-xs text-muted">Nenhuma transmissão de tela ativa. Clique em "Compartilhar Tela" abaixo.</div></div>`;
        }
      };
      renderStage();
      cleanups.push(bus.on('rtc:tracks-updated', renderStage));
      cleanups.push(bus.on('media:updated', renderStage));
    } else if (id === 'chat') {
      cleanups.push(renderChatPanel(body));
    } else if (id === 'games') {
      cleanups.push(renderGamesHub(body));
    } else if (id === 'watch') {
      cleanups.push(renderWatchTogether(body));
    } else if (id === 'collab') {
      cleanups.push(renderCollabPanel(body));
    }

    panelEls[id] = el;
    workspace.appendChild(el);
    return el;
  };

  const applyPreset = presetKey => {
    state.layout.preset = presetKey;
    const preset = LAYOUT_PRESETS[presetKey] || LAYOUT_PRESETS.call;
    const isFree = presetKey === 'freeform';
    workspace.classList.toggle('is-freeform', isFree);

    Object.values(panelEls).forEach(el => { el.hidden = true; });
    for (const [panelId, area] of Object.entries(preset.areas)) {
      const el = mountPanel(panelId);
      el.hidden = false;
      if (isFree) {
        el.style.gridArea = '';
        el.style.left = area.x + 'px';
        el.style.top = area.y + 'px';
        el.style.width = area.w + 'px';
        el.style.height = area.h + 'px';
      } else {
        el.style.left = '';
        el.style.top = '';
        el.style.width = '';
        el.style.height = '';
        el.style.gridArea = area;
      }
    }
  };

  applyPreset(state.layout.preset);

  root.querySelector('#layout-preset-select').onchange = e => applyPreset(e.target.value);

  root.querySelectorAll('[data-open-panel]').forEach(btn => {
    btn.onclick = () => {
      const p = btn.dataset.openPanel;
      if (p === 'games' || p === 'watch' || p === 'collab') {
        root.querySelector('#layout-preset-select').value = p;
        applyPreset(p);
      }
    };
  });

  // Dock controls
  const updateDock = () => {
    root.querySelector('#dock-mic').classList.toggle('is-active', state.local.micEnabled);
    root.querySelector('#dock-cam').classList.toggle('is-active', state.local.camEnabled);
    root.querySelector('#dock-share').classList.toggle('is-active', state.local.screenEnabled);
    root.querySelector('#dock-hand').classList.toggle('is-active', state.local.handRaised);
  };
  cleanups.push(bus.on('media:updated', updateDock));

  root.querySelector('#dock-mic').onclick = toggleMic;
  root.querySelector('#dock-cam').onclick = toggleCam;
  root.querySelector('#dock-share').onclick = toggleScreenShare;
  root.querySelector('#dock-hand').onclick = () => {
    state.local.handRaised = !state.local.handRaised;
    ws.send({ t: 'hand', v: state.local.handRaised });
    updateDock();
  };

  root.querySelectorAll('[data-quick-emoji]').forEach(btn => {
    btn.onclick = () => {
      ws.send({ t: 'react', e: btn.dataset.quickEmoji });
      notify(`Você reagiu com ${btn.dataset.quickEmoji}`, 'info', 1800);
    };
  });

  root.querySelector('#btn-copy-invite').onclick = async () => {
    const url = `${location.origin}${location.pathname}?room=${state.room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      notify('Link de convite copiado!', 'success');
    } catch {
      notify(`Código da sala: ${state.room.code}`, 'info');
    }
  };

  root.querySelector('#btn-room-profile').onclick = openProfileModal;

  root.querySelector('#btn-diagnostics').onclick = async () => {
    const rows = await getRtcDiagnostics();
    const html = rows.length
      ? rows.map(r => `<div class="surface-box" style="padding:10px;margin-bottom:8px">
          <div class="text-sm" style="font-weight:600">${r.nick}</div>
          <div class="text-xs text-muted">ICE: ${r.iceState} | Sinalização: ${r.signalingState} | RTT: ${r.rtt} | Candidato: ${r.candidateType}</div>
        </div>`).join('')
      : '<div class="text-sm text-muted">Nenhum outro participante conectado no momento.</div>';
    openModal({ title: 'Diagnóstico WebRTC', body: html });
  };

  root.querySelector('#btn-leave-room').onclick = () => {
    stopAllLocalMedia();
    ws.disconnect();
    cleanups.forEach(fn => fn && fn());
    onLeave();
  };
}
