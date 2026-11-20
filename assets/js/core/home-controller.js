'use strict';

import { state } from './state.js';
import { storage } from './storage.js';
import { API_BASE } from '../communication/websocket.js';
import { openProfileModal } from '../profiles/profile-controller.js';
import { openModal } from '../components/modal.js';
import { notify } from '../components/notification.js';

export function renderHomeView(root, onJoinRequest) {
  const recent = storage.getRecentRooms();

  root.innerHTML = `
    <div class="home-view">
      <header class="home-topbar">
        <div class="brand-mark">
          <div class="brand-orb">L</div>
          <span>Lumen</span>
          <span class="badge badge-accent">2.0</span>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn btn-ghost btn-sm" id="btn-toggle-theme">${state.settings.theme === 'dark' ? '☀️ Tema Claro' : '🌙 Tema Escuro'}</button>
          <button class="btn btn-secondary btn-sm" id="btn-home-profile">${state.profile.nick}</button>
        </div>
      </header>

      <main class="home-main">
        <section class="home-hero">
          <h1>Comunicação, colaboração e jogos em uma única sala.</h1>
          <p>Sem cadastro, sem login obrigatório. Crie uma sala instantaneamente ou entre por convite.</p>

          <div class="home-actions-grid">
            <div class="surface-box flex-col gap-3">
              <h3>Criar Sala</h3>
              <div class="field">
                <label class="field-label">Nome da sala</label>
                <input class="input" id="create-name" placeholder="Ex: Sala de ${state.profile.nick}" maxlength="40" />
              </div>
              <div class="field">
                <label class="field-label">Senha opcional</label>
                <input class="input" id="create-pass" type="password" placeholder="Deixe vazio para sala aberta" maxlength="128" />
              </div>
              <label class="flex items-center gap-2 text-xs text-secondary" style="cursor:pointer">
                <input type="checkbox" id="create-public" /> Listar nas salas públicas
              </label>
              <button class="btn btn-primary btn-lg" id="btn-create-room">Criar Sala Agora</button>
            </div>

            <div class="surface-box flex-col gap-3">
              <h3>Entrar em Sala</h3>
              <div class="field">
                <label class="field-label">Código da sala</label>
                <input class="input font-mono" id="join-code" placeholder="EX: A1B2C3" maxlength="10" style="text-transform:uppercase" />
              </div>
              <div class="field">
                <label class="field-label">Senha (se houver)</label>
                <input class="input" id="join-pass" type="password" placeholder="Senha da sala" maxlength="128" />
              </div>
              <button class="btn btn-secondary btn-lg" id="btn-join-room" style="margin-top:auto">Entrar na Sala</button>
            </div>
          </div>
        </section>

        <aside class="flex-col gap-4">
          <div class="surface-box">
            <div class="flex items-center justify-between">
              <h4>Salas Públicas Ativas</h4>
              <button class="btn btn-ghost btn-sm" id="btn-refresh-rooms">Atualizar</button>
            </div>
            <div class="rooms-list" id="public-rooms-list">
              <div class="text-xs text-muted">Carregando salas...</div>
            </div>
          </div>

          <div class="surface-box">
            <h4>Salas Recentes</h4>
            <div class="rooms-list">
              ${recent.length
                ? recent.map(r => `
                  <div class="room-row">
                    <div>
                      <div class="text-sm" style="font-weight:600">${r.name}</div>
                      <div class="text-xs text-muted font-mono">${r.code}</div>
                    </div>
                    <button class="btn btn-secondary btn-sm" data-quick-join="${r.code}">Entrar</button>
                  </div>
                `).join('')
                : '<div class="text-xs text-muted">Nenhuma sala recente ainda.</div>'}
            </div>
          </div>
        </aside>
      </main>
    </div>
  `;

  const loadPublicRooms = async () => {
    const listEl = root.querySelector('#public-rooms-list');
    try {
      const res = await fetch(`${API_BASE}/api/rooms`, { cache: 'no-store' });
      const rooms = await res.json();
      if (!rooms.length) {
        listEl.innerHTML = '<div class="text-xs text-muted">Nenhuma sala pública ativa no momento.</div>';
        return;
      }
      listEl.innerHTML = rooms.map(r => `
        <div class="room-row">
          <div>
            <div class="text-sm" style="font-weight:600">${r.name} ${r.hasPassword ? '🔒' : ''}</div>
            <div class="text-xs text-muted">${r.n} participante(s) · <span class="font-mono">${r.code}</span></div>
          </div>
          <button class="btn btn-primary btn-sm" data-quick-join="${r.code}">Entrar</button>
        </div>
      `).join('');
    } catch {
      listEl.innerHTML = '<div class="text-xs text-muted">Não foi possível carregar as salas.</div>';
    }
  };

  loadPublicRooms();
  root.querySelector('#btn-refresh-rooms').onclick = loadPublicRooms;

  root.querySelector('#btn-toggle-theme').onclick = () => {
    const next = state.settings.theme === 'dark' ? 'light' : 'dark';
    state.settings = storage.saveSettings({ theme: next });
    document.documentElement.setAttribute('data-theme', next);
    renderHomeView(root, onJoinRequest);
  };

  root.querySelector('#btn-home-profile').onclick = openProfileModal;

  root.querySelector('#btn-create-room').onclick = () => {
    onJoinRequest({
      create: true,
      nick: state.profile.nick,
      uid: state.profile.uid,
      name: root.querySelector('#create-name').value.trim(),
      password: root.querySelector('#create-pass').value,
      priv: !root.querySelector('#create-public').checked
    });
  };

  root.querySelector('#btn-join-room').onclick = () => {
    const code = root.querySelector('#join-code').value.trim().toUpperCase();
    if (!code) {
      notify('Informe o código da sala.', 'warning');
      return;
    }
    onJoinRequest({
      create: false,
      code,
      nick: state.profile.nick,
      uid: state.profile.uid,
      password: root.querySelector('#join-pass').value
    });
  };

  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-quick-join]');
    if (btn) {
      onJoinRequest({
        create: false,
        code: btn.dataset.quickJoin,
        nick: state.profile.nick,
        uid: state.profile.uid
      });
    }
  });
}
