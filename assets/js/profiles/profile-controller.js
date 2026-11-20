'use strict';

import { state } from '../core/state.js';
import { storage } from '../core/storage.js';
import { bus } from '../core/events.js';
import { ws } from '../communication/websocket.js';
import { openModal } from '../components/modal.js';
import { notify } from '../components/notification.js';

export function broadcastProfile() {
  if (!state.connected || !state.room) return;
  const p = state.profile;
  const sf = p.shareFields || {};
  ws.send({
    t: 'profile',
    profile: {
      color: sf.color ? p.color : undefined,
      bio: sf.bio ? p.bio : undefined,
      status: sf.status ? p.status : undefined,
      avatar: sf.avatar ? p.avatar : undefined
    }
  });
}

export function openProfileModal() {
  const p = state.profile;
  const body = `
    <div class="flex-col gap-4">
      <div class="flex items-center gap-4">
        <div class="avatar-circle" id="prof-preview-avatar" style="width:64px;height:64px;font-size:22px;background:${p.color}">
          ${p.nick.slice(0, 2).toUpperCase()}
        </div>
        <div class="flex-col gap-1 flex-1">
          <div class="text-sm" style="font-weight:600">${p.nick}</div>
          <div class="text-xs text-muted">ID de sessão local: ${p.uid.slice(0, 10)}…</div>
        </div>
      </div>
      <div class="field">
        <label class="field-label">Nome de exibição</label>
        <input class="input" id="prof-nick" value="${p.nick}" maxlength="20" />
      </div>
      <div class="flex gap-3">
        <div class="field flex-1">
          <label class="field-label">Cor do perfil</label>
          <input type="color" class="input" id="prof-color" value="${p.color}" style="padding:2px;height:38px" />
        </div>
        <div class="field flex-1">
          <label class="field-label">Status</label>
          <select class="select" id="prof-status">
            <option value="online" ${p.status === 'online' ? 'selected' : ''}>Online</option>
            <option value="away" ${p.status === 'away' ? 'selected' : ''}>Ausente</option>
            <option value="busy" ${p.status === 'busy' ? 'selected' : ''}>Ocupado</option>
            <option value="dnd" ${p.status === 'dnd' ? 'selected' : ''}>Não perturbe</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">Biografia curta</label>
        <textarea class="textarea" id="prof-bio" maxlength="160" placeholder="Conte algo sobre você...">${p.bio || ''}</textarea>
      </div>
      <div class="text-xs text-muted">
        Sem cadastro: seu perfil é salvo localmente neste navegador e compartilhado apenas quando você entra em uma sala.
      </div>
    </div>
  `;

  openModal({
    title: 'Perfil Local',
    body,
    footer: `
      <button class="btn btn-secondary" data-close-modal>Cancelar</button>
      <button class="btn btn-primary" id="prof-save-btn">Salvar Perfil</button>
    `,
    onMount: (modal, close) => {
      const colorInput = modal.querySelector('#prof-color');
      const preview = modal.querySelector('#prof-preview-avatar');
      colorInput.oninput = () => { preview.style.background = colorInput.value; };

      modal.querySelector('#prof-save-btn').onclick = () => {
        const nick = modal.querySelector('#prof-nick').value.trim();
        if (nick.length < 2) {
          notify('Use pelo menos 2 caracteres no nome.', 'warning');
          return;
        }
        state.profile = storage.saveProfile({
          nick,
          color: colorInput.value,
          status: modal.querySelector('#prof-status').value,
          bio: modal.querySelector('#prof-bio').value.trim()
        });
        if (state.connected && state.room) {
          ws.send({ t: 'nick', nick });
          broadcastProfile();
        }
        bus.emit('profile:updated');
        notify('Perfil atualizado.', 'success');
        close();
      };
    }
  });
}
