'use strict';

import { ChessEngine, PIECE_GLYPHS } from './chess-engine.js';
import { ws } from '../../communication/websocket.js';
import { bus } from '../../core/events.js';
import { sounds } from '../../core/sounds.js';

export function renderChessPanel(container) {
  const engine = new ChessEngine('1p');
  let selected = null;
  let legalMoves = [];
  let theme = 'classic';
  let difficulty = 'medium';

  container.innerHTML = `
    <div class="chess-layout">
      <div class="flex-col gap-3" style="align-items:center">
        <div class="flex gap-2 items-center" style="flex-wrap:wrap">
          <select class="select" id="chess-mode" style="width:auto;height:32px">
            <option value="1p">1 Jogador (vs IA)</option>
            <option value="2p">2 Jogadores (Multiplayer)</option>
            <option value="3p">3 Jogadores (Tripartite)</option>
            <option value="4p">4 Jogadores (Cruz 14×14)</option>
          </select>
          <select class="select" id="chess-ai-diff" style="width:auto;height:32px">
            <option value="beginner">IA Iniciante</option>
            <option value="medium" selected>IA Intermediária</option>
            <option value="hard">IA Avançada</option>
          </select>
          <select class="select" id="chess-theme" style="width:auto;height:32px">
            <option value="classic">Mapa Clássico</option>
            <option value="futuristic">Arena Futurista</option>
            <option value="medieval">Medieval</option>
            <option value="space">Espacial</option>
          </select>
          <button class="btn btn-secondary btn-sm" id="chess-reset">Reiniciar</button>
        </div>
        <div id="chess-status" class="badge badge-accent">Vez das Brancas</div>
        <div id="chess-board" class="chess-board"></div>
      </div>
      <div class="flex-col gap-2" style="min-width:180px;max-width:220px;flex:1">
        <div class="text-xs text-muted" style="font-weight:600;text-transform:uppercase">Histórico de Lances</div>
        <div id="chess-history" style="height:240px;overflow-y:auto;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:8px;font-family:var(--font-mono);font-size:12px"></div>
      </div>
    </div>
  `;

  const boardEl = container.querySelector('#chess-board');
  const statusEl = container.querySelector('#chess-status');
  const historyEl = container.querySelector('#chess-history');

  const turnNames = { w: 'Brancas', b: 'Pretas', r: 'Vermelhas', g: 'Verdes' };

  const draw = () => {
    const sqSize = engine.size === 14 ? 26 : engine.size === 9 ? 36 : 42;
    boardEl.style.gridTemplateColumns = `repeat(${engine.size}, ${sqSize}px)`;
    boardEl.className = `chess-board theme-${theme}`;

    if (engine.winner) {
      statusEl.textContent = engine.winner === 'draw' ? 'Empate!' : `Vitória: ${turnNames[engine.winner]}!`;
    } else {
      statusEl.textContent = `Vez: ${turnNames[engine.turn]}${engine.inCheck ? ' (XEQUE!)' : ''}`;
    }

    let html = '';
    for (let r = 0; r < engine.size; r++) {
      for (let c = 0; c < engine.size; c++) {
        const isVoid = engine.voids.has(`${r},${c}`);
        if (isVoid) {
          html += `<div class="chess-square is-void" style="width:${sqSize}px;height:${sqSize}px"></div>`;
          continue;
        }
        const light = (r + c) % 2 === 0;
        const isSel = selected && selected[0] === r && selected[1] === c;
        const isLeg = legalMoves.some(m => m.r === r && m.c === c);
        const piece = engine.board[r][c];
        const isCheck = piece && piece.t === 'K' && engine.inCheck === piece.c;
        const glyph = piece ? PIECE_GLYPHS[piece.c === 'w' ? piece.t : piece.t.toLowerCase()] : '';

        html += `
          <div class="chess-square ${light ? 'sq-light' : 'sq-dark'} ${isSel ? 'is-selected' : ''} ${isLeg ? 'is-legal' : ''} ${isCheck ? 'is-check' : ''}"
               style="width:${sqSize}px;height:${sqSize}px;font-size:${Math.round(sqSize * 0.65)}px"
               data-r="${r}" data-c="${c}">
            ${piece ? `<span class="chess-piece p-${piece.c}">${glyph}</span>` : ''}
          </div>
        `;
      }
    }
    boardEl.innerHTML = html;
    historyEl.innerHTML = engine.history.map((h, i) => `<div>${i + 1}. ${h.note}</div>`).join('');
    historyEl.scrollTop = historyEl.scrollHeight;
  };

  boardEl.addEventListener('click', e => {
    const sq = e.target.closest('.chess-square');
    if (!sq || sq.classList.contains('is-void') || engine.winner) return;
    const r = Number(sq.dataset.r);
    const c = Number(sq.dataset.c);

    if (selected && legalMoves.some(m => m.r === r && m.c === c)) {
      const [r1, c1] = selected;
      if (engine.move(r1, c1, r, c)) {
        sounds.play('game');
        selected = null;
        legalMoves = [];
        draw();
        if (engine.mode !== '1p') {
          ws.send({ t: 'game', game: 'chess', action: 'move', payload: { r1, c1, r2: r, c2: c } });
        } else if (!engine.winner && engine.turn === 'b') {
          setTimeout(() => {
            const aiMove = engine.getBestAIMove(difficulty);
            if (aiMove) {
              engine.move(aiMove.r1, aiMove.c1, aiMove.r2, aiMove.c2);
              sounds.play('game');
              draw();
            }
          }, 220);
        }
        return;
      }
    }

    const piece = engine.board[r][c];
    if (piece && piece.c === engine.turn) {
      selected = [r, c];
      legalMoves = engine.getLegalMoves(r, c);
    } else {
      selected = null;
      legalMoves = [];
    }
    draw();
  });

  container.querySelector('#chess-mode').onchange = e => {
    engine.reset(e.target.value);
    selected = null;
    legalMoves = [];
    draw();
    ws.send({ t: 'game', game: 'chess', action: 'reset', payload: { mode: e.target.value } });
  };

  container.querySelector('#chess-ai-diff').onchange = e => { difficulty = e.target.value; };
  container.querySelector('#chess-theme').onchange = e => { theme = e.target.value; draw(); };
  container.querySelector('#chess-reset').onclick = () => {
    engine.reset(engine.mode);
    selected = null;
    legalMoves = [];
    draw();
    ws.send({ t: 'game', game: 'chess', action: 'reset', payload: { mode: engine.mode } });
  };

  const unsub = bus.on('ws:game', msg => {
    if (msg.game !== 'chess') return;
    if (msg.action === 'move' && msg.payload) {
      engine.move(msg.payload.r1, msg.payload.c1, msg.payload.r2, msg.payload.c2);
      sounds.play('game');
      draw();
    } else if (msg.action === 'reset' && msg.payload) {
      engine.reset(msg.payload.mode || '2p');
      selected = null;
      legalMoves = [];
      draw();
    }
  });

  draw();
  return () => unsub();
}
