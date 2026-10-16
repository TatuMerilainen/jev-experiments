// Lichess's move quality rules, copied from its source code on 2026-10-16:
// - scalachess core/src/main/scala/eval.scala: WinPercent.fromCentiPawns, fromMate and winningChances.
// - lila modules/analyse/src/main/AccuracyPercent.scala: fromWinPercents.
// - lila modules/tree/src/main/Advice.scala: CpAdvice and MateAdvice.

/** A Stockfish score for one side: centipawns, or moves to mate (negative: that side gets mated). */
export type EngineScore = { cp: number } | { mate: number };

export type Judgement = "inaccuracy" | "mistake" | "blunder";

// Lichess caps a score at 1000 centipawns for win%, and counts a mate as 1000.
const CEILING = 1000;

/** Winning chances from −1 to +1. */
export function winningChances(cp: number): number {
  const chances = 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
  return Math.max(-1, Math.min(1, chances));
}

/** Win% from 0 to 100. A mate gives about 97.5% or 2.5%, the same as 1000 centipawns. */
export function winPercent(score: EngineScore): number {
  const cp = "mate" in score ? (score.mate > 0 ? CEILING : -CEILING) : Math.max(-CEILING, Math.min(CEILING, score.cp));
  return 50 + 50 * winningChances(cp);
}

/** The accuracy of one move, from the mover's win% before and after it. 100 means the move gave nothing away. */
export function moveAccuracy(before: number, after: number): number {
  if (after >= before) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (before - after)) - 3.166924740191411;
  // Lichess adds 1 for the uncertainty of the analysis.
  return Math.max(0, Math.min(100, raw + 1));
}

/** Lichess's label for a move, from the mover's scores before and after it. */
export function judgement(before: EngineScore, after: EngineScore): Judgement | null {
  if ("cp" in before && "cp" in after) {
    // The drop in winning chances: 0.1, 0.2 and 0.3 are 5, 10 and 15 points of win%.
    const drop = winningChances(before.cp) - winningChances(after.cp);
    return drop >= 0.3 ? "blunder" : drop >= 0.2 ? "mistake" : drop >= 0.1 ? "inaccuracy" : null;
  }
  // The move lets the opponent force mate. Lichess judges it by how bad the position was before.
  if ("cp" in before && "mate" in after && after.mate < 0) {
    return before.cp < -999 ? "inaccuracy" : before.cp < -700 ? "mistake" : "blunder";
  }
  // The mover had a forced mate and lost it. Lichess judges it by what is left.
  if ("mate" in before && before.mate > 0 && ("cp" in after || after.mate < 0)) {
    const left = "cp" in after ? after.cp : 0;
    return left > 999 ? "inaccuracy" : left > 700 ? "mistake" : "blunder";
  }
  return null;
}
