'use strict';

import { bus } from '../core/events.js';
import { state } from '../core/state.js';
import { notify } from '../components/notification.js';

const WS_URL = (() => {
  if (location.hostname === 'thatdp.github.io') return 'wss://lumen-v0q5.onrender.com';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}`;
})();

export const API_BASE = location.hostname === 'thatdp.github.io' ? 'https://lumen-v0q5.onrender.com' : '';

class WSClient {
  constructor() {
    this.ws = null;
    this.reconnectTimer = null;
    this.lastJoin = null;
    this.manualClose = false;
  }

  connect(joinPayload = null) {
    if (joinPayload) this.lastJoin = joinPayload;
    this.manualClose = false;
    clearTimeout(this.reconnectTimer);

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (joinPayload && this.ws.readyState === WebSocket.OPEN) {
        this.send({ t: 'join', ...joinPayload });
      }
      return;
    }

    this.ws = new WebSocket(WS_URL);
    this.ws.onopen = () => {
      state.connected = true;
      state.reconnecting = false;
      bus.emit('ws:open');
      if (this.lastJoin) {
        this.send({ t: 'join', ...this.lastJoin });
      }
    };

    this.ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        bus.emit('ws:msg', msg);
        bus.emit(`ws:${msg.t}`, msg);
      } catch (err) {
        console.warn('[WS] Invalid JSON:', err);
      }
    };

    this.ws.onclose = () => {
      state.connected = false;
      bus.emit('ws:close');
      if (!this.manualClose && state.room) {
        state.reconnecting = true;
        bus.emit('ws:reconnecting');
        this.reconnectTimer = setTimeout(() => {
          if (this.lastJoin) {
            this.lastJoin = { ...this.lastJoin, create: false, code: state.room.code };
            this.connect();
          }
        }, 2500);
      }
    };

    this.ws.onerror = () => {
      notify('Erro de conexão com o servidor.', 'error');
    };
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  disconnect() {
    this.manualClose = true;
    this.lastJoin = null;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    state.connected = false;
    state.reconnecting = false;
  }
}

export const ws = new WSClient();
