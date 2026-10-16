import { boardKey, legalMoves, play, result } from "./tictactoe";
import type { Board } from "./types";

export type Outcome = -1 | 0 | 1;

const memo = new Map<string, number>();

/**
 * Exact score for the player to move: 10 - marks for a win, -(10 - marks) for a loss, 0 for a draw.
 * The mark count makes quick wins and slow losses score better.
 */
export function negamax(board: Board): number {
  const key = boardKey(board);
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const marks = board.filter((c) => c !== null).length;
  const r = result(board);
  let value: number;
  if (r === "draw") value = 0;
  else if (r) value = -(10 - marks);
  else value = Math.max(...legalMoves(board).map((m) => -negamax(play(board, m))));

  memo.set(key, value);
  return value;
}

export const outcomeOf = (score: number): Outcome => (score > 0 ? 1 : score < 0 ? -1 : 0);

/** Exact score of each legal move, from the mover's view. */
export function moveScores(board: Board): { move: number; score: number }[] {
  return legalMoves(board).map((move) => ({ move, score: -negamax(play(board, move)) }));
}

/** Best move by exact score. Ties go to the lowest cell index. */
export function perfectMove(board: Board): number {
  const scores = moveScores(board);
  let best = scores[0]!;
  for (const s of scores) if (s.score > best.score) best = s;
  return best.move;
}

export interface Grade {
  optimal: boolean;
  /** Best outcome the mover could reach before the move. */
  best: Outcome;
  /** Outcome the move keeps, with best play after it. */
  actual: Outcome;
}

export function gradeMove(board: Board, move: number): Grade {
  const best = outcomeOf(negamax(board));
  const actual = outcomeOf(-negamax(play(board, move)));
  return { optimal: actual === best, best, actual };
}
