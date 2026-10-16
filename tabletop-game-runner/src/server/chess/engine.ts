import type { Chess, Move } from "chess.js";
import { playLine, type GameLine } from "../../shared/chess/line";

// Material plus piece-square tables, from White's view with a8 first. Same tables as the chess research pilot.
export const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const PST: Record<string, number[]> = {
  p: [0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
};
const MATE = 100_000;
const CAPTURE_DEPTH = 6;
// A capture that cannot lift the score this close to alpha is skipped.
const DELTA_MARGIN = 200;

/*
 * The search uses chess.js internals. The public `moves({ verbose: true })` builds the SAN and two FEN
 * strings for every move, which made a 2-ply search take seconds. chess.js is pinned to 1.4.0 for this,
 * and the engine tests fail if these internals change.
 */
type Color = "w" | "b";
interface InternalMove {
  color: Color;
  from: number;
  to: number;
  piece: string;
  captured?: string;
  promotion?: string;
}
interface Internals {
  _board: ({ type: string; color: Color } | undefined)[];
  _turn: Color;
  /** Zobrist hash of the position. `_makeMove` and `_undoMove` keep it up to date. */
  _hash: bigint;
  /** How often each position of the game came up, by hash. Only the public `move()` and `undo()` change it. */
  _positionCount: Map<bigint, number>;
  _moves(options?: { legal?: boolean }): InternalMove[];
  _makeMove(move: InternalMove): void;
  _undoMove(): unknown;
  _isKingAttacked(color: Color): boolean;
}
const internals = (game: Chess) => game as unknown as Internals;

/** A position seen before in the game or on the search path counts as a draw. This is the usual engine rule. */
const repeats = (g: Internals, path: bigint[]) => g._positionCount.has(g._hash) || path.includes(g._hash);

/** Static score in centipawns for the side to move. */
export function evaluate(game: Chess): number {
  const g = internals(game);
  let score = 0;
  // 0x88 board: index = row * 16 + column, with row 0 = rank 8.
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) continue;
    const piece = g._board[i];
    if (!piece) continue;
    const row = i >> 4;
    const col = i & 7;
    const index = piece.color === "w" ? row * 8 + col : (7 - row) * 8 + col;
    const value = VALUE[piece.type]! + PST[piece.type]![index]!;
    score += piece.color === "w" ? value : -value;
  }
  return g._turn === "w" ? score : -score;
}

/** Captures first, most valuable victim with the cheapest attacker first. */
function ordered<T extends { captured?: string; piece: string }>(moves: T[]): T[] {
  const key = (m: T) => (m.captured ? VALUE[m.captured]! * 10 - VALUE[m.piece]! : -1);
  return moves.sort((a, b) => key(b) - key(a));
}

/**
 * Follows captures until the position is quiet, so the score does not stop in the middle of an exchange.
 * `moves` are the legal moves when the caller has them already. Move generation is the slowest part of the search.
 */
function quiesce(game: Chess, alpha: number, beta: number, depth: number, moves?: InternalMove[]): number {
  const stand = evaluate(game);
  if (stand >= beta || depth === 0) return stand;
  if (stand > alpha) alpha = stand;
  const g = internals(game);
  const captures = (moves ?? g._moves({ legal: true })).filter((m) => m.captured && stand + VALUE[m.captured]! + DELTA_MARGIN > alpha);
  for (const m of ordered(captures)) {
    g._makeMove(m);
    const score = -quiesce(game, -beta, -alpha, depth - 1);
    g._undoMove();
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

const EXACT = 0;
const LOWER = 1;
const UPPER = 2;

/** A searched position: its score, whether the score is exact or only a bound, and its best move. */
interface Entry {
  depth: number;
  score: number;
  bound: typeof EXACT | typeof LOWER | typeof UPPER;
  best: number;
}

/**
 * The memory of one `scoreMoves` call. A new one per call keeps each result independent of earlier searches,
 * so the same position always gives the same moves.
 */
interface SearchContext {
  table: Map<bigint, Entry>;
  /** Per ply, the last two quiet moves that caused a cut-off. */
  killers: [number, number][];
  /** Per from and to square, how often a quiet move caused a cut-off, weighted by depth. */
  history: Int32Array;
}

const newContext = (): SearchContext => ({ table: new Map(), killers: [], history: new Int32Array(128 * 128) });

const PROMOTION_CODE: Record<string, number> = { q: 1, r: 2, b: 3, n: 4 };
const moveKey = (m: InternalMove) => m.from | (m.to << 7) | ((m.promotion ? PROMOTION_CODE[m.promotion]! : 0) << 14);

// A mate score counts plies from the root. The table stores it from the position, so it is right on every path.
const toTable = (score: number, ply: number) => (score > MATE / 2 ? score + ply : score < -MATE / 2 ? score - ply : score);
const fromTable = (score: number, ply: number) => (score > MATE / 2 ? score - ply : score < -MATE / 2 ? score + ply : score);

/** The move order only changes the speed: the stored best move, captures, killer moves, then quiet moves by history. */
function searchOrder(moves: InternalMove[], best: number, killers: [number, number] | undefined, history: Int32Array): InternalMove[] {
  const keyed = moves.map((m) => {
    const key = moveKey(m);
    let rank: number;
    if (key === best) rank = 4e9;
    else if (m.captured) rank = 3e9 + VALUE[m.captured]! * 10 - VALUE[m.piece]!;
    else if (m.promotion) rank = 2e9;
    else if (killers && (key === killers[0] || key === killers[1])) rank = 1e9;
    else rank = history[m.from * 128 + m.to]!;
    return { m, rank };
  });
  return keyed.sort((a, b) => b.rank - a.rank).map((k) => k.m);
}

/**
 * `path` holds the hashes of the positions between the root and this node. A capture can never repeat, so `quiesce` needs no check.
 * A stored score is used only at the same depth, so the result equals a search without the table.
 */
function search(game: Chess, depth: number, alpha: number, beta: number, ply: number, path: bigint[], ctx: SearchContext): number {
  const g = internals(game);
  const entry = depth > 0 ? ctx.table.get(g._hash) : undefined;
  if (entry && entry.depth === depth) {
    const stored = fromTable(entry.score, ply);
    if (entry.bound === EXACT || (entry.bound === LOWER && stored >= beta) || (entry.bound === UPPER && stored <= alpha)) return stored;
  }
  const moves = g._moves({ legal: true });
  // Mate sooner scores higher.
  if (moves.length === 0) return g._isKingAttacked(g._turn) ? -MATE + ply : 0;
  if (depth === 0) return quiesce(game, alpha, beta, CAPTURE_DEPTH, moves);
  const alphaStart = alpha;
  let best = -Infinity;
  let bestKey = 0;
  for (const m of searchOrder(moves, entry?.best ?? -1, ctx.killers[ply], ctx.history)) {
    g._makeMove(m);
    let score = 0;
    if (!repeats(g, path)) {
      path.push(g._hash);
      score = -search(game, depth - 1, -beta, -alpha, ply + 1, path, ctx);
      path.pop();
    }
    g._undoMove();
    if (score > best) {
      best = score;
      bestKey = moveKey(m);
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (!m.captured) {
        const killers = (ctx.killers[ply] ??= [-1, -1]);
        if (killers[0] !== bestKey) ctx.killers[ply] = [bestKey, killers[0]];
        const square = m.from * 128 + m.to;
        ctx.history[square] = ctx.history[square]! + depth * depth;
      }
      break;
    }
  }
  ctx.table.set(g._hash, { depth, score: toTable(best, ply), bound: best <= alphaStart ? UPPER : best >= beta ? LOWER : EXACT, best: bestKey });
  return best;
}

export interface ScoredMove {
  move: Move;
  /** Centipawns for the side to move after `depth` plies plus captures. */
  score: number;
  /** False when the move fell outside the margin: `score` is then only an upper bound. */
  exact: boolean;
}

/**
 * Every legal move after `line`, with its search score, best first. Depth 2 means this move plus the opponent's reply.
 * Moves more than `margin` below the best so far are cut off early, which makes the search much faster.
 * A move to a position that came up before in the game scores 0, so the better side avoids repeats.
 * The search goes one ply deeper each round. Each round tries the best moves of the round before first, which makes the cut-offs come sooner.
 */
export function scoreMoves(line: GameLine, depth: number, margin = Infinity): ScoredMove[] {
  const game = playLine(line);
  const g = internals(game);
  const ctx = newContext();
  // `index` is the order of the search without rounds. Equal scores keep it, so ties go to the same move as before.
  let order = ordered(game.moves({ verbose: true })).map((move, index) => ({ move, index, score: 0, exact: false }));
  // At depth 1 and 2 the extra rounds cost more time than they save.
  for (let round = depth <= 2 ? depth : 1; round <= depth; round++) {
    let best = -Infinity;
    const scored = order.map(({ move, index }) => {
      // Scores are whole centipawns. A score at `floor` is only a bound, so the window starts one below the margin.
      const floor = best - margin - 1;
      game.move({ from: move.from, to: move.to, promotion: move.promotion });
      // `move()` counted the new position once already, so one more means it came up before.
      const repeated = (g._positionCount.get(g._hash) ?? 0) >= 2;
      const score = repeated ? 0 : -search(game, round - 1, -Infinity, -floor, 1, [], ctx);
      game.undo();
      if (score > best) best = score;
      return { move, index, score, exact: score > floor };
    });
    // A move that looked inside the margin early can fall outside once a better move is found.
    order = scored.map((s) => ({ ...s, exact: s.exact && s.score >= best - margin })).sort((a, b) => b.score - a.score || a.index - b.index);
  }
  return order.map(({ move, score, exact }) => ({ move, score, exact }));
}

/** Moves within `margin` centipawns of the best, at most `max` of them. */
export function candidates(scored: ScoredMove[], margin: number, max: number): ScoredMove[] {
  if (scored.length === 0) return [];
  const best = scored[0]!.score;
  return scored.filter((s) => s.exact && s.score >= best - margin).slice(0, max);
}

export const isMateScore = (score: number) => Math.abs(score) > MATE / 2;
