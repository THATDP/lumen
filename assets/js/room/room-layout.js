'use strict';

export const LAYOUT_PRESETS = {
  call: {
    label: 'Call',
    areas: {
      participants: '1 / 1 / 13 / 5',
      stage: '1 / 5 / 13 / 9',
      chat: '1 / 9 / 13 / 13'
    }
  },
  cinema: {
    label: 'Cinema',
    areas: {
      stage: '1 / 1 / 10 / 10',
      participants: '10 / 1 / 13 / 10',
      chat: '1 / 10 / 13 / 13'
    }
  },
  games: {
    label: 'Jogos',
    areas: {
      games: '1 / 1 / 13 / 9',
      participants: '1 / 9 / 6 / 13',
      chat: '6 / 9 / 13 / 13'
    }
  },
  watch: {
    label: 'Watch Together',
    areas: {
      watch: '1 / 1 / 13 / 9',
      participants: '1 / 9 / 6 / 13',
      chat: '6 / 9 / 13 / 13'
    }
  },
  collab: {
    label: 'Colaboração',
    areas: {
      collab: '1 / 1 / 13 / 9',
      participants: '1 / 9 / 6 / 13',
      chat: '6 / 9 / 13 / 13'
    }
  },
  freeform: {
    label: 'Livre (Arrastável)',
    areas: {
      participants: { x: 16, y: 16, w: 340, h: 320 },
      stage: { x: 372, y: 16, w: 460, h: 320 },
      chat: { x: 848, y: 16, w: 320, h: 480 }
    }
  }
};

export function makePanelDraggable(panelEl, workspaceEl) {
  const header = panelEl.querySelector('.panel-header');
  const resize = panelEl.querySelector('.panel-resize-handle');

  header.addEventListener('pointerdown', e => {
    if (e.target.closest('.panel-controls') || !workspaceEl.classList.contains('is-freeform')) return;
    panelEl.classList.add('is-dragging');
    const startX = e.clientX - panelEl.offsetLeft;
    const startY = e.clientY - panelEl.offsetTop;

    const onMove = ev => {
      panelEl.style.left = Math.max(0, ev.clientX - startX) + 'px';
      panelEl.style.top = Math.max(0, ev.clientY - startY) + 'px';
    };
    const onUp = () => {
      panelEl.classList.remove('is-dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  if (resize) {
    resize.addEventListener('pointerdown', e => {
      if (!workspaceEl.classList.contains('is-freeform')) return;
      e.stopPropagation();
      const startW = panelEl.offsetWidth;
      const startH = panelEl.offsetHeight;
      const startX = e.clientX;
      const startY = e.clientY;

      const onMove = ev => {
        panelEl.style.width = Math.max(240, startW + (ev.clientX - startX)) + 'px';
        panelEl.style.height = Math.max(180, startH + (ev.clientY - startY)) + 'px';
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }
}
