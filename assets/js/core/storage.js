'use strict';

const PREFIX = 'lumen2:';

function randomId(len = 16) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

const DEFAULT_PROFILE = () => ({
  uid: randomId(12),
  nick: 'Viajante ' + Math.floor(100 + Math.random() * 900),
  color: '#6366f1',
  bio: '',
  status: 'online',
  avatar: '',
  shareFields: { color: true, bio: true, status: true, avatar: true }
});

const DEFAULT_SETTINGS = () => ({
  theme: 'dark',
  soundsEnabled: true,
  soundVolume: 0.5,
  pushToTalk: false,
  pttKey: 'Space',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  videoQuality: '720p',
  mirrorCamera: true
});

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  getProfile() {
    let p = this.get('profile');
    if (!p || !p.uid) {
      p = DEFAULT_PROFILE();
      this.set('profile', p);
    }
    return { ...DEFAULT_PROFILE(), ...p };
  },

  saveProfile(patch) {
    const next = { ...this.getProfile(), ...patch };
    this.set('profile', next);
    return next;
  },

  getSettings() {
    return { ...DEFAULT_SETTINGS(), ...this.get('settings', {}) };
  },

  saveSettings(patch) {
    const next = { ...this.getSettings(), ...patch };
    this.set('settings', next);
    return next;
  },

  getRecentRooms() {
    return this.get('recent_rooms', []);
  },

  addRecentRoom(room) {
    const list = this.getRecentRooms().filter(r => r.code !== room.code);
    list.unshift({ code: room.code, name: room.name, ts: Date.now() });
    this.set('recent_rooms', list.slice(0, 8));
  }
};
