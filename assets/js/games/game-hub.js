'use strict';

import { renderChessPanel } from './chess/chess-ui.js';
import { renderPlatformer2D } from './platformer/platformer-2d.js';
import { renderArena3D } from './arena3d/arena-3d.js';

export function renderGamesHub(container) {
  let activeCleanup = null;

  const showHub = () => {
    if (activeCleanup) { activeCleanup(); activeCleanup = null; }
    container.innerHTML = `
      <div class="games-hub">
        <div>
          <h4>Biblioteca de Jogos</h4>
          <p class="text-xs text-muted">Experiências multiplayer integradas à sala.</p>
        </div>
        <div class="games-grid">
          <div class="game-card">
            <div class="flex items-center justify-between">
              <span style="font-size:24px">♔</span>
              <span class="badge badge-accent">Tabuleiro</span>
            </div>
            <h4>Xadrez Lumen</h4>
            <p class="text-xs text-secondary">1P vs IA, 2P Clássico, 3P Tripartite e 4P Cruz 14×14 com mapas temáticos.</p>
            <button class="btn btn-primary btn-sm" data-launch="chess">Jogar Xadrez</button>
          </div>
          <div class="game-card">
            <div class="flex items-center justify-between">
              <span style="font-size:24px">🏃</span>
              <span class="badge badge-success">2D Multiplayer</span>
            </div>
            <h4>Lumen Dash</h4>
            <p class="text-xs text-secondary">Plataforma 2D sincronizada com pulo duplo, obstáculos e coleta de estrelas.</p>
            <button class="btn btn-primary btn-sm" data-launch="platformer">Jogar 2D</button>
          </div>
          <div class="game-card">
            <div class="flex items-center justify-between">
              <span style="font-size:24px">🧊</span>
              <span class="badge">3D WebGL</span>
            </div>
            <h4>Lumen Arena 3D</h4>
            <p class="text-xs text-secondary">Arena 3D em perspectiva com avatares sincronizados em tempo real.</p>
            <button class="btn btn-primary btn-sm" data-launch="arena3d">Jogar 3D</button>
          </div>
        </div>
      </div>
    `;

    container.querySelectorAll('[data-launch]').forEach(btn => {
      btn.onclick = () => {
        const g = btn.dataset.launch;
        if (g === 'chess') {
          container.innerHTML = `<div style="padding:8px 12px 0"><button class="btn btn-ghost btn-sm" id="chess-back-hub">← Biblioteca</button></div><div id="chess-mount"></div>`;
          container.querySelector('#chess-back-hub').onclick = showHub;
          activeCleanup = renderChessPanel(container.querySelector('#chess-mount'));
        } else if (g === 'platformer') {
          activeCleanup = renderPlatformer2D(container, showHub);
        } else if (g === 'arena3d') {
          activeCleanup = renderArena3D(container, showHub);
        }
      };
    });
  };

  showHub();
  return () => { if (activeCleanup) activeCleanup(); };
}
