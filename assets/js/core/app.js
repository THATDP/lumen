'use strict';

import { state } from './state.js';
import { storage } from './storage.js';
import { bus } from './events.js';
import { sounds } from './sounds.js';
import { ws } from '../communication/websocket.js';
import { refreshIce, createPeerTransport } from '../communication/rtc.js';
import { initChat, addSystemMessage } from '../chat/chat-controller.js';
import { broadcastProfile } from '../profiles/profile-controller.js';
import { renderHomeView } from './home-controller.js';
import { renderRoomView } from '../room/room-controller.js';
import { notify } from '../components/notification.js';

const appRoot = document.getElementById('app');

document.documentElement.setAttribute('data-theme', state.settings.theme || 'dark');
initChat();

function joinRoom(payload) {
  refreshIce().finally(() => {
    ws.connect(payload);
  });
}

bus.on('ws:joined', msg => {
  state.me = msg.id;
  state.role = msg.role;
  state.room = msg.room;
  state.peers.clear();
  state.chat.messages = [];

  for (const p of msg.peers || []) {
    const peer = { ...p, streamCam: null, streamScreen: null, streamAudio: null };
    state.peers.set(p.id, peer);
    createPeerTransport(peer, true);
  }

  storage.addRecentRoom({ code: msg.room.code, name: msg.room.name });
  broadcastProfile();
  sounds.play('join');
  addSystemMessage(`Você entrou na sala ${msg.room.name} (${msg.room.code}).`);

  state.view = 'room';
  renderRoomView(appRoot, () => {
    state.room = null;
    state.peers.clear();
    state.view = 'home';
    renderHomeView(appRoot, joinRoom);
  });
});

bus.on('ws:peer', msg => {
  const peer = { ...msg.peer, streamCam: null, streamScreen: null, streamAudio: null };
  state.peers.set(peer.id, peer);
  createPeerTransport(peer, false);
  sounds.play('join');
  addSystemMessage(`${peer.nick} entrou na sala.`);
  bus.emit('room:peers-updated');
});

bus.on('ws:left', msg => {
  const peer = state.peers.get(msg.id);
  if (peer) {
    if (peer.transport) peer.transport.close();
    state.peers.delete(msg.id);
    const aud = document.getElementById(`aud-${msg.id}`);
    if (aud) aud.remove();
    sounds.play('leave');
    addSystemMessage(`${msg.nick || peer.nick} saiu da sala.`);
    bus.emit('room:peers-updated');
    bus.emit('rtc:tracks-updated');
  }
});

bus.on('ws:signal', msg => {
  const peer = state.peers.get(msg.from);
  if (peer && peer.transport) {
    peer.transport.receive(msg.d);
  }
});

bus.on('ws:state', msg => {
  const peer = state.peers.get(msg.id);
  if (peer) {
    peer.st = { ...peer.st, ...msg.st };
    bus.emit('room:peers-updated');
  }
});

bus.on('ws:profile', msg => {
  const peer = state.peers.get(msg.id);
  if (peer) {
    peer.st = peer.st || {};
    peer.st.profile = msg.profile;
    bus.emit('room:peers-updated');
  }
});

bus.on('ws:err', msg => {
  notify(msg.text || 'Erro na sala.', 'error');
});

// Verifica convite na URL (?room=CODIGO)
const params = new URLSearchParams(location.search);
const inviteCode = params.get('room');
renderHomeView(appRoot, joinRoom);

if (inviteCode) {
  joinRoom({
    create: false,
    code: inviteCode.trim().toUpperCase(),
    nick: state.profile.nick,
    uid: state.profile.uid
  });
}
