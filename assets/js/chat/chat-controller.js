'use strict';

import { state } from '../core/state.js';
import { bus } from '../core/events.js';
import { ws } from '../communication/websocket.js';
import { sounds } from '../core/sounds.js';

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatText(str) {
  const safe = esc(str);
  return safe.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--accent-primary);text-decoration:underline">$1</a>');
}

export function initChat() {
  bus.on('ws:chat', msg => {
    if (msg.op === 'new' || !msg.op) {
      const item = {
        msgId: msg.msgId || ('m-' + Date.now() + Math.random()),
        id: msg.id,
        nick: msg.nick,
        text: msg.text,
        replyTo: msg.replyTo || null,
        ts: msg.ts || Date.now(),
        reactions: {},
        edited: false,
        deleted: false
      };
      state.chat.messages.push(item);
      if (msg.id !== state.me) sounds.play('msg');
      bus.emit('chat:updated');
    } else if (msg.op === 'edit') {
      const target = state.chat.messages.find(m => m.msgId === msg.msgId && m.id === msg.id);
      if (target) {
        target.text = msg.text;
        target.edited = true;
        bus.emit('chat:updated');
      }
    } else if (msg.op === 'del') {
      const target = state.chat.messages.find(m => m.msgId === msg.msgId && m.id === msg.id);
      if (target) {
        target.deleted = true;
        target.text = 'Mensagem removida';
        bus.emit('chat:updated');
      }
    } else if (msg.op === 'react') {
      const target = state.chat.messages.find(m => m.msgId === msg.msgId);
      if (target) {
        target.reactions[msg.emoji] = (target.reactions[msg.emoji] || 0) + 1;
        bus.emit('chat:updated');
      }
    }
  });
}

export function addSystemMessage(text) {
  state.chat.messages.push({
    msgId: 'sys-' + Date.now(),
    system: true,
    text,
    ts: Date.now()
  });
  bus.emit('chat:updated');
}

export function renderChatPanel(container) {
  container.innerHTML = `
    <div class="chat-panel-wrap">
      <div class="chat-messages" id="chat-messages-list"></div>
      <div id="chat-reply-bar" class="text-xs text-secondary" style="padding:4px 12px;background:var(--bg-app);border-top:1px solid var(--border-subtle);display:none;align-items:center;justify-content:space-between;">
        <span id="chat-reply-label"></span>
        <button class="btn btn-ghost btn-sm" id="chat-reply-cancel">✕</button>
      </div>
      <form class="chat-input-bar" id="chat-form">
        <input class="input" id="chat-input" placeholder="Enviar mensagem..." maxlength="500" autocomplete="off" />
        <button type="submit" class="btn btn-primary btn-sm">Enviar</button>
      </form>
    </div>
  `;

  const list = container.querySelector('#chat-messages-list');
  const form = container.querySelector('#chat-form');
  const input = container.querySelector('#chat-input');
  const replyBar = container.querySelector('#chat-reply-bar');
  const replyLabel = container.querySelector('#chat-reply-label');

  const draw = () => {
    list.innerHTML = state.chat.messages.map(m => {
      if (m.system) {
        return `<div class="chat-msg is-system">${esc(m.text)}</div>`;
      }
      const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const reacts = Object.entries(m.reactions || {})
        .map(([e, c]) => `<button class="chat-react-pill" data-react="${m.msgId}" data-emoji="${e}">${e} ${c}</button>`)
        .join('');
      const mine = m.id === state.me && !m.deleted;
      return `
        <div class="chat-msg" data-msgid="${m.msgId}">
          <div class="chat-msg-header">
            <span class="chat-msg-author">${esc(m.nick)}</span>
            <div class="flex items-center gap-1">
              <span class="chat-msg-time">${time}${m.edited ? ' (editada)' : ''}</span>
              <button class="panel-ctrl-btn" title="Reagir 👍" data-quick-react="${m.msgId}">👍</button>
              <button class="panel-ctrl-btn" title="Responder" data-reply="${m.msgId}">↩</button>
              ${mine ? `<button class="panel-ctrl-btn" title="Excluir" data-del="${m.msgId}">🗑</button>` : ''}
            </div>
          </div>
          <div class="${m.deleted ? 'text-muted' : ''}">${formatText(m.text)}</div>
          ${reacts ? `<div class="chat-reactions">${reacts}</div>` : ''}
        </div>
      `;
    }).join('');
    list.scrollTop = list.scrollHeight;
  };

  draw();
  const unsub = bus.on('chat:updated', draw);

  list.addEventListener('click', e => {
    const reactBtn = e.target.closest('[data-quick-react]');
    if (reactBtn) {
      ws.send({ t: 'chat', op: 'react', msgId: reactBtn.dataset.quickReact, emoji: '👍' });
    }
    const pill = e.target.closest('[data-react]');
    if (pill) {
      ws.send({ t: 'chat', op: 'react', msgId: pill.dataset.react, emoji: pill.dataset.emoji });
    }
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      ws.send({ t: 'chat', op: 'del', msgId: delBtn.dataset.del });
    }
    const repBtn = e.target.closest('[data-reply]');
    if (repBtn) {
      const target = state.chat.messages.find(m => m.msgId === repBtn.dataset.reply);
      if (target) {
        state.chat.replyTo = target.msgId;
        replyLabel.textContent = `Respondendo a ${target.nick}: "${target.text.slice(0, 40)}"`;
        replyBar.style.display = 'flex';
        input.focus();
      }
    }
  });

  container.querySelector('#chat-reply-cancel').onclick = () => {
    state.chat.replyTo = null;
    replyBar.style.display = 'none';
  };

  form.onsubmit = e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    ws.send({ t: 'chat', op: 'new', text, replyTo: state.chat.replyTo });
    input.value = '';
    state.chat.replyTo = null;
    replyBar.style.display = 'none';
  };

  return () => unsub();
}
