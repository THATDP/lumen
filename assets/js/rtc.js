'use strict';
// One independent transport per participant. Signaling is ordered per transport,
// and all tracks remain owned by the local media manager.
class PeerTransport {
  constructor(peer, initiator) {
    this.peer = peer;
    this.pc = peer.pc = new RTCPeerConnection({iceServers: ICE});
    this.polite = me > peer.id;
    this.makingOffer = false;
    this.settingAnswer = false;
    this.ignoringOffer = false;
    this.pendingCandidates = [];
    this.incoming = Promise.resolve();
    this.closed = false;
    const pc = this.pc;
    pc.onnegotiationneeded = () => this.negotiate();
    pc.onicecandidate = event => {
      if (!this.closed && event.candidate) this.send({cand: event.candidate});
    };
    pc.oniceconnectionstatechange = () => this.onIceState();
    pc.ontrack = event => this.onTrack(event);
    for (const stream of Object.values(local)) {
      if (stream) for (const track of stream.getTracks()) pc.addTrack(track, stream);
    }
    // Establish a connection even while neither participant has enabled media.
    if (initiator) this.control = pc.createDataChannel('lumen-control');
  }
  send(data) { tx({t:'signal', to:this.peer.id, d:data}); }
  async negotiate() {
    if (this.closed) return;
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      if (!this.closed) this.send({desc:this.pc.localDescription});
    } catch (error) { if (!this.closed) console.warn('negotiation', error); }
    finally { this.makingOffer = false; }
  }
  receive(data) {
    this.incoming = this.incoming.then(() => this.process(data)).catch(error => {
      if (!this.closed) console.warn('signal', error);
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
      if (this.ignoringOffer) { this.pendingCandidates = []; return; }
      this.settingAnswer = data.desc.type === 'answer';
      try { await pc.setRemoteDescription(data.desc); } finally { this.settingAnswer = false; }
      for (const candidate of this.pendingCandidates.splice(0)) await pc.addIceCandidate(candidate);
      if (data.desc.type === 'offer') {
        await pc.setLocalDescription();
        if (!this.closed) this.send({desc:pc.localDescription});
      }
      shape(this.peer);
    } else if (data.cand && !this.ignoringOffer) {
      if (!pc.remoteDescription) this.pendingCandidates.push(data.cand);
      else await pc.addIceCandidate(data.cand);
    }
  }
  onIceState() {
    clearTimeout(this.peer.disconnectTimer);
    if (this.closed) return;
    if (this.pc.iceConnectionState === 'failed') {
      refreshIce(false).finally(() => {
        if (this.closed) return;
        try { this.pc.setConfiguration({...this.pc.getConfiguration(),iceServers:ICE}); this.pc.restartIce(); }
        catch (error) { console.warn('ICE restart',error); }
      });
    } else if (this.pc.iceConnectionState === 'disconnected') {
      this.peer.disconnectTimer = setTimeout(() => {
        if (!this.closed && this.pc.iceConnectionState === 'disconnected') this.pc.restartIce();
      }, 5000);
    }
    renderAll();
  }
  onTrack(event) {
    const stream = event.streams[0];
    if (!stream || this.closed) return;
    const peer = this.peer;
    peer.media[stream.id] = stream;
    event.track.onended = () => {
      if (stream.getTracks().every(track => track.readyState === 'ended')) delete peer.media[stream.id];
      if (!this.closed) { syncAudio(peer); renderAll(); }
    };
    syncAudio(peer); renderAll();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.peer.disconnectTimer);
    clearTimeout(this.peer.statusTimer);
    this.pc.close();
  }
}
function addPeer(info,initiator) {
  if (peers.has(info.id)) return;
  const peer = {...info,st:info.st||{},media:{},vol:1,waitingSince:Date.now()};
  peers.set(info.id,peer);
  peer.statusTimer=setTimeout(()=>renderAll(),15000);
  peer.transport=new PeerTransport(peer,initiator);
}
function clearPeer(peer) {
  peer.transport.close();
  if (peer.au) { peer.au.pause(); peer.au.srcObject=null; }
  clearMeter(peer.id);
  const tile=tiles.get(peer.id);if(tile){tile.remove();tiles.delete(peer.id)}
}
function onSignal(from,data) { const peer=peers.get(from); if(peer)peer.transport.receive(data); }
