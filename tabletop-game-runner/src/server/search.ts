import type { Outcome } from "../shared/solver";
import { canonicalKey, legalMoves, other, play, result, toMove, winningCells } from "../shared/tictactoe";
import { ESTIMATE_WEIGHT, type Board, type Candidate, type Cell, type Mark } from "../shared/types";

export interface Leaf {
  key: string;
  board: Cell[];
  uses: number;
}

/** Returns a value from -1 to +1 for each leaf key, from `you`'s view. */
export type LeafEvaluator = (leaves: Leaf[], you: Mark) => Promise<Map<string, number>>;

export const neutralEvaluator: LeafEvaluator = async (leaves) => new Map(leaves.map((l) => [l.key, 0]));

/**
 * The result of an unfinished position that code knows without a search, from the view of the player to move.
 * +1: that player completes a line now. −1: they cannot, and the opponent has two cells that each complete a line.
 */
export function exactLeaf(board: Board): Outcome | null {
  const mover = toMove(board);
  if (winningCells(board, mover).length > 0) return 1;
  if (winningCells(board, other(mover)).length >= 2) return -1;
  return null;
}

/**
 * Unfinished positions at the depth limit, merged across rotations and reflections.
 * With `exact`, the positions with a known result go to `known`, and only the others need an estimate.
 */
export function collectLeaves(board: Board, depth: number, exact = false): { toJudge: Leaf[]; known: Leaf[] } {
  const toJudge = new Map<string, Leaf>();
  const known = new Map<string, Leaf>();
  const visit = (b: Cell[], d: number) => {
    if (result(b)) return;
    if (d === 0) {
      const key = canonicalKey(b);
      const leaves = exact && exactLeaf(b) !== null ? known : toJudge;
      const leaf = leaves.get(key);
      if (leaf) leaf.uses++;
      else leaves.set(key, { key, board: b, uses: 1 });
      return;
    }
    for (const m of legalMoves(b)) visit(play(b, m), d - 1);
  };
  for (const m of legalMoves(board)) visit(play(board, m), depth - 1);
  return { toJudge: [...toJudge.values()], known: [...known.values()] };
}

/**
 * Depth-limited minimax. Finished games get exact values; leaves get the evaluator's values.
 * With `exact`, a leaf with a known result counts like a finished game.
 */
export async function lookahead(board: Board, depth: number, evaluate: LeafEvaluator, exact = false): Promise<Candidate[]> {
  const you = toMove(board);
  const { toJudge } = collectLeaves(board, depth, exact);
  const estimates = toJudge.length > 0 ? await evaluate(toJudge, you) : new Map<string, number>();

  const value = (b: Cell[], d: number): number => {
    const r = result(b);
    if (r) return r === "draw" ? 0 : r === you ? 1 : -1;
    if (d === 0) {
      const known = exact ? exactLeaf(b) : null;
      if (known !== null) return toMove(b) === you ? known : -known;
      const estimate = estimates.get(canonicalKey(b));
      if (estimate === undefined) throw new Error("Missing leaf estimate");
      return ESTIMATE_WEIGHT * estimate;
    }
    const values = legalMoves(b).map((m) => value(play(b, m), d - 1));
    return toMove(b) === you ? Math.max(...values) : Math.min(...values);
  };

  return legalMoves(board).map((move) => {
    const child = play(board, move);
    if (result(child) || depth === 1) {
      const v = value(child, depth - 1);
      return { move, value: v, average: v, reply: null };
    }
    const replies = legalMoves(child).map((r) => ({ r, v: value(play(child, r), depth - 2) }));
    let worst = replies[0]!;
    for (const reply of replies) if (reply.v < worst.v) worst = reply;
    const average = replies.reduce((sum, reply) => sum + reply.v, 0) / replies.length;
    return { move, value: worst.v, average, reply: worst.r };
  });
}

/** Best worst case first, then best average, then lowest cell index. */
export function pickCandidate(candidates: Candidate[]): Candidate {
  const EPS = 1e-9;
  const better = (a: Candidate, b: Candidate): boolean => {
    const byValue = (a.value ?? 0) - (b.value ?? 0);
    if (Math.abs(byValue) > EPS) return byValue > 0;
    const byAverage = (a.average ?? 0) - (b.average ?? 0);
    if (Math.abs(byAverage) > EPS) return byAverage > 0;
    return a.move < b.move;
  };
  return candidates.reduce((best, c) => (better(c, best) ? c : best));
}
