import { canonicalKey, emptyBoard, legalMoves, play, result } from "../src/shared/tictactoe";
import type { Cell } from "../src/shared/types";

/** Every unfinished position reachable from the empty board, one per rotation/reflection class. */
export function unfinishedPositions(): Cell[][] {
  const seen = new Map<string, Cell[]>();
  const visit = (board: Cell[]) => {
    const key = canonicalKey(board);
    if (seen.has(key) || result(board)) return;
    seen.set(key, board);
    for (const m of legalMoves(board)) visit(play(board, m));
  };
  visit(emptyBoard());
  return [...seen.values()];
}

export function parseRows(rows: string[]): Cell[] {
  return rows.flatMap((row) => row.split(" ").map((c) => (c === "." ? null : (c as Cell))));
}
