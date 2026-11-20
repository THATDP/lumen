'use strict';

export function openModal({ title, body, footer = '', large = false, onMount = null }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-card ${large ? 'modal-lg' : ''}" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h4>${title}</h4>
        <button class="btn btn-ghost btn-icon" data-close-modal aria-label="Fechar">✕</button>
      </div>
      <div class="modal-body">${typeof body === 'string' ? body : ''}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;

  if (typeof body !== 'string' && body instanceof HTMLElement) {
    backdrop.querySelector('.modal-body').appendChild(body);
  }

  const close = () => {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
  };

  const onKey = e => {
    if (e.key === 'Escape') close();
  };

  backdrop.addEventListener('click', e => {
    if (e.target === backdrop || e.target.closest('[data-close-modal]')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);

  if (onMount) onMount(backdrop, close);
  return close;
}
