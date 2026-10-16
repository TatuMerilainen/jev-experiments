import { describe, expect, it } from "vitest";
import { lookahead, neutralEvaluator, pickCandidate, type LeafEvaluator } from "../src/server/search";
import { gradeMove, negamax, outcomeOf } from "../src/shared/solver";
import { toMove } from "../src/shared/tictactoe";
import type { Cell } from "../src/shared/types";
import { parseRows, unfinishedPositions } from "./helpers";

const board = (rows: string): Cell[] => parseRows(rows.split("/"));

// Exact outcome of each leaf from the deciding player's view.
const exactEvaluator: LeafEvaluator = async (leaves, you) =>
  new Map(leaves.map((l) => [l.key, (toMove(l.board) === you ? 1 : -1) * outcomeOf(negamax(l.board))]));

describe("look-ahead search", () => {
  it("takes an immediate win at depth 1 without any estimate", async () => {
    const move = pickCandidate(await lookahead(board("X X ./O O ./. . ."), 1, neutralEvaluator)).move;
    expect(move).toBe(2);
  });

  it("blocks an immediate loss at depth 2", async () => {
    const candidates = await lookahead(board("X . ./O O ./X . ."), 2, neutralEvaluator);
    expect(pickCandidate(candidates).move).toBe(5);
    const allowsLoss = candidates.find((c) => c.move === 1)!;
    expect(allowsLoss.value).toBe(-1);
    expect(allowsLoss.reply).toBe(5);
  });

  it("plays optimally in every position when leaf values are exact", async () => {
    for (const depth of [1, 2, 3]) {
      for (const b of unfinishedPositions()) {
        const move = pickCandidate(await lookahead(b, depth, exactEvaluator)).move;
        expect(gradeMove(b, move).optimal, `depth ${depth}, board ${b.map((c) => c ?? ".").join("")}`).toBe(true);
      }
    }
  });

  it("asks the evaluator once per distinct leaf position", async () => {
    let asked = 0;
    const counting: LeafEvaluator = async (leaves, you) => {
      asked += leaves.length;
      return neutralEvaluator(leaves, you);
    };
    await lookahead(Array<Cell>(9).fill(null), 2, counting);
    expect(asked).toBe(12);
  });
});
