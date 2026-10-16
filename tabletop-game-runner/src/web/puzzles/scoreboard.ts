import type { Puzzle, PuzzleRun } from "../../shared/chess/puzzles";
import type { ChessPlayerSetup } from "../../shared/chess/types";
import { chessConfig, configKey } from "../../shared/matchups";

/** One player's attempts at one puzzle, over all runs. */
export interface PuzzleCell {
  attempts: number;
  solved: number;
  /** The run with the newest attempt, to open it. */
  latestRunId: string;
}

/** One player configuration on the scoreboard. Every run counts. */
export interface PlayerScore {
  key: string;
  setup: ChessPlayerSetup;
  runs: number;
  cells: Map<string, PuzzleCell>;
  /** Puzzles solved in at least one run. */
  solved: number;
  attempts: number;
  attemptsSolved: number;
  /** Attempts whose first solver move was right. */
  firstMoveRight: number;
  /** Solver moves where the player had a candidate list, and those where the solution was in it. */
  candidateMoves: number;
  solutionInCandidates: number;
  /** Of the moves with the solution among the candidates, those where the player picked a right move. */
  pickedWhenThere: number;
  moves: number;
  tokens: number;
  ms: number;
}

/**
 * Adds up every run per player configuration, with the model. Attempts at puzzles outside `puzzles` are left out.
 * The best share of attempts solved comes first. Puzzles solved at least once grow with the number of runs, so they only break ties.
 */
export function scorePlayers(runs: PuzzleRun[], puzzles: Puzzle[]): PlayerScore[] {
  const ids = new Set(puzzles.map((p) => p.id));
  const players = new Map<string, PlayerScore>();
  for (const run of runs) {
    const key = configKey(chessConfig(run.setup));
    const score = players.get(key) ?? {
      key,
      setup: run.setup,
      runs: 0,
      cells: new Map<string, PuzzleCell>(),
      solved: 0,
      attempts: 0,
      attemptsSolved: 0,
      firstMoveRight: 0,
      candidateMoves: 0,
      solutionInCandidates: 0,
      pickedWhenThere: 0,
      moves: 0,
      tokens: 0,
      ms: 0,
    };
    players.set(key, score);
    score.runs++;
    for (const attempt of run.attempts) {
      if (!ids.has(attempt.puzzleId)) continue;
      const cell = score.cells.get(attempt.puzzleId) ?? { attempts: 0, solved: 0, latestRunId: run.runId };
      cell.attempts++;
      if (attempt.solved) cell.solved++;
      // Runs come oldest first, so the last one seen is the newest.
      cell.latestRunId = run.runId;
      score.cells.set(attempt.puzzleId, cell);
      score.attempts++;
      if (attempt.solved) score.attemptsSolved++;
      if (attempt.steps[0]?.correct) score.firstMoveRight++;
      for (const step of attempt.steps) {
        score.moves++;
        score.ms += step.roundTripMs;
        if (step.inCandidates === null) continue;
        score.candidateMoves++;
        if (!step.inCandidates) continue;
        score.solutionInCandidates++;
        if (step.correct) score.pickedWhenThere++;
      }
      score.tokens += attempt.tokens;
    }
  }
  for (const score of players.values()) score.solved = [...score.cells.values()].filter((c) => c.solved > 0).length;
  return [...players.values()]
    .filter((s) => s.attempts > 0)
    .sort((a, b) => b.attemptsSolved / b.attempts - a.attemptsSolved / a.attempts || b.solved - a.solved);
}
