import { describe, expect, it } from "vitest";
import { gradeMove, negamax, outcomeOf, perfectMove } from "../src/shared/solver";
import { emptyBoard, legalMoves, play } from "../src/shared/tictactoe";
import type { Cell } from "../src/shared/types";
import { parseRows, unfinishedPositions } from "./helpers";

const board = (rows: string): Cell[] => parseRows(rows.split("/"));

describe("perfect solver", () => {
  it("knows tic-tac-toe is a draw", () => {
    expect(outcomeOf(negamax(emptyBoard()))).toBe(0);
  });

  it("matches the known position counts", () => {
    const positions = unfinishedPositions();
    expect(positions).toHaveLength(627);
    const withMistakes = positions.filter((b) => legalMoves(b).some((m) => !gradeMove(b, m).optimal));
    expect(withMistakes).toHaveLength(431);
  });

  it("takes a win and blocks a loss", () => {
    expect(perfectMove(board("X X ./O O ./. . ."))).toBe(2);
    expect(perfectMove(board("X . ./O O ./X . ."))).toBe(5);
  });

  it("grades moves against the best reachable result", () => {
    const b = board("X X ./O O ./. . .");
    expect(gradeMove(b, 2)).toEqual({ optimal: true, best: 1, actual: 1 });
    expect(gradeMove(b, 6).optimal).toBe(false);
    expect(gradeMove(play(emptyBoard(), 4), 1)).toEqual({ optimal: false, best: 0, actual: -1 });
  });
});
