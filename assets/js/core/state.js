'use strict';

import { storage } from './storage.js';

export const state = {
  view: 'home', // 'home' | 'room'
  profile: storage.getProfile(),
  settings: storage.getSettings(),
  connected: false,
  reconnecting: false,
  me: null,
  role: 'user',
  room: null,
  peers: new Map(), // id -> { id, nick, role, st, pc, streamCam, streamScreen, volume, speaking }
  local: {
    mic: null,
    cam: null,
    screen: null,
    micEnabled: false,
    camEnabled: false,
    screenEnabled: false,
    handRaised: false
  },
  chat: {
    messages: [],
    typing: new Map(),
    replyTo: null
  },
  layout: {
    preset: 'call',
    panels: {}
  }
};
