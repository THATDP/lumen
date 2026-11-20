'use strict';

let container = null;

function ensureContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

export function notify(message, type = 'info', duration = 3800) {
  const wrap = ensureContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-6px)';
    el.style.transition = 'all 180ms ease';
    setTimeout(() => el.remove(), 200);
  }, duration);
}
