import type { Chess, Move, Square } from "chess.js";
import type { ChessColor } from "./types";

// Plain-language text for Jev, computed in code. The research found piece lists the most reliable board format.

export const PIECE_NAME: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
export const COLOR_NAME: Record<ChessColor, string> = { w: "White", b: "Black" };
const POINTS: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

export const otherColor = (c: ChessColor): ChessColor => (c === "w" ? "b" : "w");

function squaresOf(game: Chess, color: ChessColor): Square[] {
  return game
    .board()
    .flat()
    .filter((p) => p && p.color === color)
    .map((p) => p!.square);
}

function named(game: Chess, square: Square): string {
  const p = game.get(square)!;
  return `${COLOR_NAME[p.color].toLowerCase()} ${PIECE_NAME[p.type]} ${square}`;
}

export function pieceLists(game: Chess): { white_pieces: string; black_pieces: string } {
  const list = (c: ChessColor) =>
    squaresOf(game, c)
      .map((s) => `${PIECE_NAME[game.get(s)!.type]} ${s}`)
      .join(", ");
  return { white_pieces: list("w"), black_pieces: list("b") };
}

export function materialText(game: Chess): string {
  let diff = 0;
  for (const p of game.board().flat()) if (p) diff += (p.color === "w" ? 1 : -1) * POINTS[p.type]!;
  if (diff === 0) return "Material is equal.";
  const who = diff > 0 ? "White" : "Black";
  const a = Math.abs(diff);
  const size = a === 1 ? "a pawn" : a === 2 ? "two pawns" : a <= 4 ? "about a knight or bishop" : a <= 6 ? "about a rook" : "more than a rook";
  return `${who} is ahead by ${size}.`;
}

/** "knight from g1 to f3, captures the black pawn, gives check" */
export function basicText(move: Move): string {
  const parts: string[] = [];
  if (move.san.startsWith("O-O-O")) parts.push("castles on the queen side");
  else if (move.san.startsWith("O-O")) parts.push("castles on the king side");
  else parts.push(`${PIECE_NAME[move.piece]} from ${move.from} to ${move.to}`);
  if (move.captured) parts.push(`captures the ${COLOR_NAME[otherColor(move.color)].toLowerCase()} ${PIECE_NAME[move.captured]}`);
  if (move.promotion) parts.push(`promotes to a ${PIECE_NAME[move.promotion]}`);
  if (move.san.includes("#")) parts.push("gives checkmate");
  else if (move.san.includes("+")) parts.push("gives check");
  return parts.join(", ");
}

/** A position for repetition: the pieces, the side to move, castling and en passant. They are the first four FEN fields. */
const positionKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

/** How often each position of the game came up so far. `history` is the game's verbose history, `fen` its current position. */
export function positionCounts(history: Move[], fen: string): Map<string, number> {
  const fens = history.length ? [history[0]!.before, ...history.map((m) => m.after)] : [fen];
  const counts = new Map<string, number>();
  for (const f of fens) counts.set(positionKey(f), (counts.get(positionKey(f)) ?? 0) + 1);
  return counts;
}

/** Says when a move brings back an earlier position. The third time ends the game in a draw. */
export function repetitionText(move: Move, counts: Map<string, number>): string | null {
  const seen = counts.get(positionKey(move.after)) ?? 0;
  if (seen === 0) return null;
  if (seen === 1) return "this move repeats an earlier position";
  return "this move repeats an earlier position for the third time, so the game then ends in a draw by repetition";
}

/**
 * The squares of the pieces the side to move can capture, each with the squares it can be captured from.
 * Only legal captures count, en passant included: a pinned piece or a king next to a defended piece captures nothing.
 */
function legalCaptures(game: Chess): Map<Square, Square[]> {
  const captures = new Map<Square, Square[]>();
  for (const m of game.moves({ verbose: true })) {
    if (!m.captured) continue;
    // En passant takes the pawn on the file of the target square and the rank of the capturing pawn.
    const target = (m.isEnPassant() ? m.to[0]! + m.from[1]! : m.to) as Square;
    const from = captures.get(target) ?? [];
    if (!from.includes(m.from)) from.push(m.from);
    captures.set(target, from);
  }
  return captures;
}

/**
 * The basic text plus what the move leaves attacked, defended or in danger.
 * "Can be captured by" and "in danger" use the opponent's legal captures. "Defended by" lists every piece that covers the square.
 */
export function safetyText(game: Chess, move: Move, counts?: Map<string, number>): string {
  const parts = [basicText(move)];
  const repeat = counts && repetitionText(move, counts);
  if (repeat) parts.push(repeat);
  const me = move.color;
  const them = otherColor(me);
  game.move({ from: move.from, to: move.to, promotion: move.promotion });
  const to = move.to;
  const moved = PIECE_NAME[move.promotion ?? move.piece];
  const captures = legalCaptures(game);
  if (!move.san.startsWith("O-O")) {
    // After checkmate the game is over, so nothing can be captured.
    if (!game.isCheckmate()) {
      const attackers = captures.get(to) ?? [];
      const defenders = game.attackers(to, me);
      if (attackers.length) {
        const defence = defenders.length ? ` and is defended by ${defenders.map((s) => named(game, s)).join(", ")}` : " and is not defended";
        parts.push(`afterwards the ${moved} on ${to} can be captured by ${attackers.map((s) => named(game, s)).join(", ")}${defence}`);
      } else {
        parts.push(`afterwards the ${moved} on ${to} is safe`);
      }
    }
    const threatened = squaresOf(game, them).filter((s) => game.get(s)!.type !== "k" && game.attackers(s, me).includes(to));
    if (threatened.length) parts.push(`it then attacks ${threatened.map((s) => named(game, s)).join(", ")}`);
  }
  const loose = squaresOf(game, me).filter((s) => {
    if (s === to || game.get(s)!.type === "k") return false;
    const attackers = captures.get(s) ?? [];
    if (!attackers.length) return false;
    const cheaper = attackers.some((a) => VALUE[game.get(a)!.type]! < VALUE[game.get(s)!.type]!);
    return cheaper || game.attackers(s, me).length === 0;
  });
  if (loose.length) parts.push(`it leaves these pieces in danger: ${loose.map((s) => named(game, s)).join(", ")}`);
  game.undo();
  return parts.join("; ") + ".";
}

export function lastMoveText(move: Move): string {
  return `${COLOR_NAME[move.color]} played ${basicText(move)}.`;
}

export function defaultChessInstructions(color: ChessColor): string {
  const you = COLOR_NAME[color];
  return `You play ${you} in this chess game. Which move from \`candidates\` is the strongest move for ${you}?`;
}
