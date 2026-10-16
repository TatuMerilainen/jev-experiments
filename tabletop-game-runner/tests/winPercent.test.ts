import { describe, expect, it } from "vitest";
import { gradeChessMove } from "../src/server/chess/bots";
import { judgement, moveAccuracy, winningChances, winPercent } from "../src/shared/chess/winPercent";
import { chessReducer, initialChessState } from "../src/web/chess/chessExperiment";
import { formatWinLoss, gradeLabel } from "../src/web/chess/chessFormat";

describe("win percent, as on Lichess", () => {
  it("turns centipawns into win%", () => {
    expect(winPercent({ cp: 0 })).toBe(50);
    expect(winPercent({ cp: 100 })).toBeCloseTo(59.1, 1);
    expect(winPercent({ cp: -300 })).toBeCloseTo(24.9, 1);
    // A score is capped at 1000 centipawns, and a mate counts as 1000.
    expect(winPercent({ cp: 5000 })).toBe(winPercent({ cp: 1000 }));
    expect(winPercent({ mate: 3 })).toBe(winPercent({ cp: 1000 }));
    expect(winPercent({ mate: -2 })).toBeCloseTo(2.46, 2);
  });

  it("gives Lichess's move accuracy", () => {
    expect(moveAccuracy(50, 50)).toBe(100);
    expect(moveAccuracy(40, 60)).toBe(100);
    expect(moveAccuracy(60, 40)).toBeCloseTo(41.0, 1);
    expect(moveAccuracy(100, 0)).toBe(0);
  });

  it("labels moves by the drop in winning chances: 0.1, 0.2 and 0.3", () => {
    expect(judgement({ cp: 0 }, { cp: -20 })).toBeNull();
    expect(winningChances(0) - winningChances(-100)).toBeCloseTo(0.182, 3);
    expect(judgement({ cp: 0 }, { cp: -100 })).toBe("inaccuracy");
    expect(judgement({ cp: 0 }, { cp: -130 })).toBe("mistake");
    expect(judgement({ cp: 0 }, { cp: -200 })).toBe("blunder");
    // The same 300 centipawns weigh less in a won position.
    expect(judgement({ cp: 900 }, { cp: 600 })).toBe("inaccuracy");
  });

  it("labels a mate that is allowed or lost with Lichess's mate rules", () => {
    expect(judgement({ cp: 50 }, { mate: -3 })).toBe("blunder");
    expect(judgement({ cp: -800 }, { mate: -3 })).toBe("mistake");
    expect(judgement({ cp: -1200 }, { mate: -3 })).toBe("inaccuracy");
    expect(judgement({ mate: 2 }, { cp: 500 })).toBe("blunder");
    expect(judgement({ mate: 2 }, { cp: 1500 })).toBe("inaccuracy");
    expect(judgement({ mate: 2 }, { mate: 4 })).toBeNull();
  });

  it("is saved with each new grade", async () => {
    const blunder = await gradeChessMove(["e2e4", "e7e5", "d1h5", "b8c6"], "h5h7");
    expect(blunder.judgement).toBe("blunder");
    expect(blunder.winLoss).toBeGreaterThan(15);
    expect(blunder.winBefore! - blunder.winAfter!).toBeCloseTo(blunder.winLoss!, 1);
  });
});

describe("win percent in the tally and labels", () => {
  const start = () => chessReducer(initialChessState(), { type: "move", uci: "e2e4", source: "random" });

  it("adds a new grade to the accuracy and the win chance loss", () => {
    const s = start();
    const after = chessReducer(s, { type: "graded", experimentId: s.experimentId, gameNo: 1, index: 0, grade: { loss: 40, bestSan: "d4", depth: 12, winBefore: 55, winAfter: 50, winLoss: 5, judgement: "inaccuracy" } });
    expect(after.tally.side.w).toMatchObject({ graded: 1, winGraded: 1, winLossTotal: 5, blunders: 0 });
    expect(after.tally.side.w.accuracyTotal).toBeCloseTo(moveAccuracy(55, 50));
  });

  it("leaves an old grade out of the win% averages, and labels it by centipawns", () => {
    const s = start();
    const old = { loss: 320, bestSan: "d4", depth: 12 };
    const after = chessReducer(s, { type: "graded", experimentId: s.experimentId, gameNo: 1, index: 0, grade: old });
    expect(after.tally.side.w).toMatchObject({ graded: 1, winGraded: 0, blunders: 1 });
    expect(gradeLabel(old).label).toBe("Blunder");
    expect(formatWinLoss(old)).toBe("–");
    expect(gradeLabel({ ...old, winLoss: 3, judgement: null }).label).toBe("Good");
  });
});
