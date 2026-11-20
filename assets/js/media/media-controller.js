'use strict';

import { state } from '../core/state.js';
import { bus } from '../core/events.js';
import { sounds } from '../core/sounds.js';
import { notify } from '../components/notification.js';
import { syncLocalTracksToPeers } from '../communication/rtc.js';

export async function toggleMic() {
  if (state.local.micEnabled && state.local.mic) {
    state.local.mic.getTracks().forEach(t => t.stop());
    state.local.mic = null;
    state.local.micEnabled = false;
    sounds.play('mic');
    syncLocalTracksToPeers();
    bus.emit('media:updated');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: state.settings.echoCancellation,
        noiseSuppression: state.settings.noiseSuppression,
        autoGainControl: state.settings.autoGainControl
      }
    });
    state.local.mic = stream;
    state.local.micEnabled = true;
    sounds.play('mic');
    syncLocalTracksToPeers();
    bus.emit('media:updated');
  } catch (err) {
    notify('Não foi possível acessar o microfone: ' + err.message, 'error');
  }
}

export async function toggleCam() {
  if (state.local.camEnabled && state.local.cam) {
    state.local.cam.getTracks().forEach(t => t.stop());
    state.local.cam = null;
    state.local.camEnabled = false;
    syncLocalTracksToPeers();
    bus.emit('media:updated');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
    });
    state.local.cam = stream;
    state.local.camEnabled = true;
    syncLocalTracksToPeers();
    bus.emit('media:updated');
  } catch (err) {
    notify('Não foi possível acessar a câmera: ' + err.message, 'error');
  }
}

export async function toggleScreenShare() {
  if (state.local.screenEnabled && state.local.screen) {
    stopScreenShare();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30 } },
      audio: true
    });
    state.local.screen = stream;
    state.local.screenEnabled = true;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => stopScreenShare();
    }
    syncLocalTracksToPeers();
    bus.emit('media:updated');
    notify('Compartilhamento de tela iniciado.', 'success');
  } catch (err) {
    if (err.name !== 'AbortError') {
      notify('Compartilhamento de tela cancelado ou indisponível.', 'warning');
    }
  }
}

export function stopScreenShare() {
  if (state.local.screen) {
    state.local.screen.getTracks().forEach(t => t.stop());
    state.local.screen = null;
  }
  state.local.screenEnabled = false;
  syncLocalTracksToPeers();
  bus.emit('media:updated');
}

export function stopAllLocalMedia() {
  for (const key of ['mic', 'cam', 'screen']) {
    if (state.local[key]) {
      state.local[key].getTracks().forEach(t => t.stop());
      state.local[key] = null;
    }
  }
  state.local.micEnabled = false;
  state.local.camEnabled = false;
  state.local.screenEnabled = false;
}
