'use strict';

export const PIECE_GLYPHS = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

export class ChessEngine {
  constructor(mode = '2p') {
    this.mode = mode; // '1p' | '2p' | '3p' | '4p'
    this.reset(mode);
  }

  reset(mode = this.mode) {
    this.mode = mode;
    this.history = [];
    this.turnIndex = 0;
    this.winner = null;
    this.inCheck = null;

    if (mode === '4p') {
      this.size = 14;
      this.players = ['w', 'r', 'b', 'g'];
      this.board = Array.from({ length: 14 }, () => Array(14).fill(null));
      this.voids = new Set();
      for (let r = 0; r < 14; r++) {
        for (let c = 0; c < 14; c++) {
          if ((r < 3 || r > 10) && (c < 3 || c > 10)) this.voids.add(`${r},${c}`);
        }
      }
      const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
      for (let i = 0; i < 8; i++) {
        this.board[13][3 + i] = { t: back[i], c: 'w' };
        this.board[12][3 + i] = { t: 'P', c: 'w' };
        this.board[0][3 + i] = { t: back[i], c: 'b' };
        this.board[1][3 + i] = { t: 'P', c: 'b' };
        this.board[3 + i][0] = { t: back[i], c: 'r' };
        this.board[3 + i][1] = { t: 'P', c: 'r' };
        this.board[3 + i][13] = { t: back[i], c: 'g' };
        this.board[3 + i][12] = { t: 'P', c: 'g' };
      }
    } else if (mode === '3p') {
      this.size = 9;
      this.players = ['w', 'b', 'r'];
      this.voids = new Set();
      this.board = Array.from({ length: 9 }, () => Array(9).fill(null));
      const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
      for (let i = 0; i < 8; i++) {
        this.board[8][i] = { t: back[i], c: 'w' };
        this.board[7][i] = { t: 'P', c: 'w' };
        this.board[0][i] = { t: back[i], c: 'b' };
        this.board[1][i] = { t: 'P', c: 'b' };
      }
      // Terceiro exército (Vermelho) na lateral direita
      const side = ['R', 'N', 'B', 'Q', 'K'];
      for (let i = 0; i < 5; i++) {
        this.board[2 + i][8] = { t: side[i], c: 'r' };
        this.board[2 + i][7] = { t: 'P', c: 'r' };
      }
    } else {
      this.size = 8;
      this.players = ['w', 'b'];
      this.voids = new Set();
      this.board = Array.from({ length: 8 }, () => Array(8).fill(null));
      const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
      for (let c = 0; c < 8; c++) {
        this.board[0][c] = { t: back[c], c: 'b' };
        this.board[1][c] = { t: 'P', c: 'b' };
        this.board[6][c] = { t: 'P', c: 'w' };
        this.board[7][c] = { t: back[c], c: 'w' };
      }
    }
  }

  get turn() {
    return this.players[this.turnIndex % this.players.length];
  }

  isInside(r, c) {
    return r >= 0 && r < this.size && c >= 0 && c < this.size && !this.voids.has(`${r},${c}`);
  }

  getLegalMoves(r, c) {
    const piece = this.board[r]?.[c];
    if (!piece || piece.c !== this.turn || this.winner) return [];
    const pseudo = this.getPseudoMoves(r, c, piece);
    if (this.mode === '1p' || this.mode === '2p') {
      return pseudo.filter(m => !this.wouldBeInCheck(r, c, m.r, m.c, piece.c));
    }
    return pseudo;
  }

  getPseudoMoves(r, c, piece) {
    const moves = [];
    const add = (nr, nc) => {
      if (!this.isInside(nr, nc)) return false;
      const target = this.board[nr][nc];
      if (!target) {
        moves.push({ r: nr, c: nc });
        return true;
      }
      if (target.c !== piece.c) {
        moves.push({ r: nr, c: nc, capture: true });
      }
      return false;
    };

    const slide = dirs => {
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (add(nr, nc)) {
          nr += dr;
          nc += dc;
        }
      }
    };

    switch (piece.t) {
      case 'P': {
        const dirs = { w: [-1, 0], b: [1, 0], r: [0, this.mode === '4p' ? 1 : -1], g: [0, -1] };
        const [dr, dc] = dirs[piece.c] || [-1, 0];
        const nr = r + dr, nc = c + dc;
        if (this.isInside(nr, nc) && !this.board[nr][nc]) {
          moves.push({ r: nr, c: nc });
          const startRow = (piece.c === 'w' && r === this.size - 2) || (piece.c === 'b' && r === 1);
          if (startRow && this.isInside(r + dr * 2, c + dc * 2) && !this.board[r + dr * 2][c + dc * 2]) {
            moves.push({ r: r + dr * 2, c: c + dc * 2 });
          }
        }
        const caps = dr !== 0 ? [[dr, -1], [dr, 1]] : [[-1, dc], [1, dc]];
        for (const [cr, cc] of caps) {
          const tr = r + cr, tc = c + cc;
          if (this.isInside(tr, tc) && this.board[tr][tc] && this.board[tr][tc].c !== piece.c) {
            moves.push({ r: tr, c: tc, capture: true });
          }
        }
        break;
      }
      case 'N':
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(r + dr, c + dc);
        break;
      case 'B':
        slide([[-1,-1],[-1,1],[1,-1],[1,1]]);
        break;
      case 'R':
        slide([[-1,0],[1,0],[0,-1],[0,1]]);
        break;
      case 'Q':
        slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
        break;
      case 'K':
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr || dc) add(r + dr, c + dc);
          }
        }
        break;
    }
    return moves;
  }

  wouldBeInCheck(r1, c1, r2, c2, color) {
    const saved = this.board[r2][c2];
    this.board[r2][c2] = this.board[r1][c1];
    this.board[r1][c1] = null;
    const check = this.isKingInCheck(color);
    this.board[r1][c1] = this.board[r2][c2];
    this.board[r2][c2] = saved;
    return check;
  }

  isKingInCheck(color) {
    let kr = -1, kc = -1;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const p = this.board[r][c];
        if (p && p.t === 'K' && p.c === color) { kr = r; kc = c; break; }
      }
    }
    if (kr === -1) return false;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const p = this.board[r][c];
        if (p && p.c !== color) {
          if (this.getPseudoMoves(r, c, p).some(m => m.r === kr && m.c === kc)) return true;
        }
      }
    }
    return false;
  }

  move(r1, c1, r2, c2) {
    const legal = this.getLegalMoves(r1, c1);
    if (!legal.some(m => m.r === r2 && m.c === c2)) return false;

    const piece = this.board[r1][c1];
    const captured = this.board[r2][c2];
    this.board[r2][c2] = piece;
    this.board[r1][c1] = null;

    // Promoção automática para Rainha
    if (piece.t === 'P' && ((piece.c === 'w' && r2 === 0) || (piece.c === 'b' && r2 === this.size - 1))) {
      piece.t = 'Q';
    }

    const colName = c => String.fromCharCode(97 + c);
    const note = `${piece.t === 'P' ? '' : piece.t}${captured ? 'x' : ''}${colName(c2)}${this.size - r2}`;
    this.history.push({ from: [r1, c1], to: [r2, c2], color: piece.c, note });

    if (captured && captured.t === 'K') {
      this.winner = piece.c;
      return true;
    }

    this.turnIndex++;
    const nextColor = this.turn;
    this.inCheck = this.isKingInCheck(nextColor) ? nextColor : null;

    if (this.mode === '1p' || this.mode === '2p') {
      let hasMoves = false;
      for (let r = 0; r < this.size && !hasMoves; r++) {
        for (let c = 0; c < this.size && !hasMoves; c++) {
          if (this.board[r][c]?.c === nextColor && this.getLegalMoves(r, c).length) hasMoves = true;
        }
      }
      if (!hasMoves) {
        this.winner = this.inCheck ? piece.c : 'draw';
      }
    }
    return true;
  }

  evaluateBoard(color) {
    let score = 0;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const p = this.board[r][c];
        if (!p) continue;
        const val = PIECE_VALUES[p.t.toLowerCase()] || 0;
        score += p.c === color ? val : -val;
      }
    }
    return score;
  }

  getBestAIMove(difficulty = 'medium') {
    const aiColor = this.turn;
    const allMoves = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.board[r][c]?.c === aiColor) {
          for (const m of this.getLegalMoves(r, c)) {
            allMoves.push({ r1: r, c1: c, r2: m.r, c2: m.c, capture: m.capture });
          }
        }
      }
    }
    if (!allMoves.length) return null;
    if (difficulty === 'beginner') {
      return allMoves[Math.floor(Math.random() * allMoves.length)];
    }

    const depth = difficulty === 'hard' ? 2 : 1;
    let best = allMoves[0];
    let bestScore = -Infinity;

    for (const m of allMoves) {
      const saved = this.board[m.r2][m.c2];
      this.board[m.r2][m.c2] = this.board[m.r1][m.c1];
      this.board[m.r1][m.c1] = null;
      const score = this.minimax(depth - 1, false, aiColor, -Infinity, Infinity);
      this.board[m.r1][m.c1] = this.board[m.r2][m.c2];
      this.board[m.r2][m.c2] = saved;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  minimax(depth, maximizing, aiColor, alpha, beta) {
    if (depth <= 0) return this.evaluateBoard(aiColor);
    const color = maximizing ? aiColor : (aiColor === 'w' ? 'b' : 'w');
    let best = maximizing ? -Infinity : Infinity;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.board[r][c]?.c !== color) continue;
        for (const m of this.getPseudoMoves(r, c, this.board[r][c])) {
          const saved = this.board[m.r][m.c];
          this.board[m.r][m.c] = this.board[r][c];
          this.board[r][c] = null;
          const val = this.minimax(depth - 1, !maximizing, aiColor, alpha, beta);
          this.board[r][c] = this.board[m.r][m.c];
          this.board[m.r][m.c] = saved;
          if (maximizing) {
            best = Math.max(best, val);
            alpha = Math.max(alpha, best);
          } else {
            best = Math.min(best, val);
            beta = Math.min(beta, best);
          }
          if (beta <= alpha) return best;
        }
      }
    }
    return best;
  }
}
