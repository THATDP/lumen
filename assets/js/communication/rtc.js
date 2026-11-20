'use strict';

import { bus } from '../core/events.js';
import { state } from '../core/state.js';
import { CONFIG } from '../core/config.js';
import { ws } from './websocket.js';

let ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export async function refreshIce() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}${CONFIG.ENDPOINTS.ice}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length) ICE_SERVERS = data;
    }
  } catch (err) {
    console.warn('[RTC] Failed to fetch ICE servers:', err);
  }
  return ICE_SERVERS;
}

class PeerTransport {
  constructor(peer, initiator) {
    this.peer = peer;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peer.pc = this.pc;
    peer.transport = this;
    this.polite = state.me > peer.id;
    this.makingOffer = false;
    this.settingAnswer = false;
    this.ignoringOffer = false;
    this.pendingCandidates = [];
    this.incoming = Promise.resolve();
    this.closed = false;

    const pc = this.pc;
    pc.onnegotiationneeded = () => this.negotiate();
    pc.onicecandidate = e => {
      if (!this.closed && e.candidate) this.send({ cand: e.candidate });
    };
    pc.oniceconnectionstatechange = () => this.onIceState();
    pc.ontrack = e => this.onTrack(e);

    // Adiciona todas as tracks locais ativas (mic, cam, screen) para suportar late join
    for (const key of ['mic', 'cam', 'screen']) {
      const stream = state.local[key];
      if (stream) {
        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream);
        }
      }
    }

    if (initiator) {
      this.control = pc.createDataChannel('lumen-control');
    }
  }

  send(d) {
    ws.send({ t: 'signal', to: this.peer.id, d });
  }

  async negotiate() {
    if (this.closed) return;
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      if (!this.closed) this.send({ desc: this.pc.localDescription });
    } catch (err) {
      if (!this.closed) console.warn('[RTC] negotiate:', err);
    } finally {
      this.makingOffer = false;
    }
  }

  receive(data) {
    this.incoming = this.incoming.then(() => this.process(data)).catch(err => {
      if (!this.closed) console.warn('[RTC] signal:', err);
    });
    return this.incoming;
  }

  async process(data) {
    if (this.closed || !data || typeof data !== 'object') return;
    const pc = this.pc;
    if (data.desc) {
      const ready = !this.makingOffer && (pc.signalingState === 'stable' || this.settingAnswer);
      const collision = data.desc.type === 'offer' && !ready;
      this.ignoringOffer = !this.polite && collision;
      if (this.ignoringOffer) {
        this.pendingCandidates = [];
        return;
      }
      this.settingAnswer = data.desc.type === 'answer';
      try {
        await pc.setRemoteDescription(data.desc);
      } finally {
        this.settingAnswer = false;
      }
      for (const cand of this.pendingCandidates.splice(0)) {
        await pc.addIceCandidate(cand);
      }
      if (data.desc.type === 'offer') {
        await pc.setLocalDescription();
        if (!this.closed) this.send({ desc: pc.localDescription });
      }
    } else if (data.cand && !this.ignoringOffer) {
      if (!pc.remoteDescription) {
        this.pendingCandidates.push(data.cand);
      } else {
        await pc.addIceCandidate(data.cand);
      }
    }
  }

  onTrack(event) {
    const stream = event.streams[0] || new MediaStream([event.track]);
    const streamMap = this.peer.st?.streams || {};
    const kind = streamMap[stream.id];

    if (kind === 'screen') {
      this.peer.streamScreen = stream;
    } else if (kind === 'cam' || event.track.kind === 'video') {
      // Se já tem cam e chegou outro vídeo, assume screen
      if (this.peer.streamCam && this.peer.streamCam.id !== stream.id && this.peer.st?.share) {
        this.peer.streamScreen = stream;
      } else if (this.peer.st?.share && !this.peer.st?.cam) {
        this.peer.streamScreen = stream;
      } else {
        this.peer.streamCam = stream;
      }
    } else if (event.track.kind === 'audio') {
      this.peer.streamAudio = stream;
    }

    event.track.onended = () => {
      if (this.peer.streamScreen === stream) this.peer.streamScreen = null;
      if (this.peer.streamCam === stream) this.peer.streamCam = null;
      bus.emit('rtc:tracks-updated', this.peer);
    };

    bus.emit('rtc:tracks-updated', this.peer);
  }

  onIceState() {
    if (this.closed) return;
    if (this.pc.iceConnectionState === 'failed') {
      refreshIce().finally(() => {
        if (this.closed) return;
        try {
          this.pc.setConfiguration({ ...this.pc.getConfiguration(), iceServers: ICE_SERVERS });
          this.pc.restartIce();
        } catch {}
      });
    }
    bus.emit('rtc:ice-state', { peer: this.peer, state: this.pc.iceConnectionState });
  }

  close() {
    this.closed = true;
    try { this.pc.close(); } catch {}
  }
}

export function createPeerTransport(peer, initiator) {
  return new PeerTransport(peer, initiator);
}

export function syncLocalTracksToPeers() {
  const streamsMap = {};
  for (const key of ['mic', 'cam', 'screen']) {
    if (state.local[key]) streamsMap[state.local[key].id] = key;
  }

  ws.send({
    t: 'state',
    st: {
      mic: state.local.micEnabled,
      cam: state.local.camEnabled,
      share: state.local.screenEnabled,
      streams: streamsMap
    }
  });

  for (const peer of state.peers.values()) {
    const pc = peer.pc;
    if (!pc) continue;
    const senders = pc.getSenders();

    // Remove senders de tracks que não existem mais
    for (const sender of senders) {
      if (!sender.track) continue;
      const stillActive = ['mic', 'cam', 'screen'].some(k =>
        state.local[k]?.getTracks().includes(sender.track)
      );
      if (!stillActive) {
        try { pc.removeTrack(sender); } catch {}
      }
    }

    // Adiciona novas tracks
    for (const key of ['mic', 'cam', 'screen']) {
      const stream = state.local[key];
      if (!stream) continue;
      for (const track of stream.getTracks()) {
        if (!senders.some(s => s.track === track)) {
          pc.addTrack(track, stream);
        }
      }
    }
  }
}

export async function getRtcDiagnostics() {
  const rows = [];
  for (const peer of state.peers.values()) {
    const pc = peer.pc;
    if (!pc) continue;
    let rtt = '-';
    let candidateType = '-';
    let bytesSent = 0;
    let bytesRecv = 0;
    try {
      const stats = await pc.getStats();
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime != null) rtt = Math.round(report.currentRoundTripTime * 1000) + ' ms';
        }
        if (report.type === 'local-candidate' && candidateType === '-') {
          candidateType = report.candidateType || '-';
        }
        if (report.type === 'outbound-rtp') bytesSent += report.bytesSent || 0;
        if (report.type === 'inbound-rtp') bytesRecv += report.bytesReceived || 0;
      });
    } catch {}
    rows.push({
      id: peer.id,
      nick: peer.nick,
      iceState: pc.iceConnectionState,
      signalingState: pc.signalingState,
      rtt,
      candidateType,
      bytesSent,
      bytesRecv
    });
  }
  return rows;
}
