import { playLine, type GameLine } from "./line";
import lichess10 from "./puzzles/lichess-10.json";
import type { ChessColor, ChessDecision, ChessPlayerSetup } from "./types";

/** One Lichess puzzle. scripts/build-puzzle-set.ts makes the sets. */
export interface Puzzle {
  id: string;
  /** The position before the opponent's first move. */
  fen: string;
  /** UCI moves: the opponent's first move, then the solution, with the opponent's replies in between. */
  moves: string[];
  rating: number;
  ratingDeviation: number;
  popularity: number;
  plays: number;
  themes: string[];
  gameUrl: string;
}

export interface PuzzleSet {
  name: string;
  source: string;
  built: string;
  puzzles: Puzzle[];
}

export const PUZZLE_SETS: PuzzleSet[] = [lichess10];

export const puzzleSet = (name: string): PuzzleSet | undefined => PUZZLE_SETS.find((s) => s.name === name);

/** The moves the solver must find: every second move, from the second one. */
export const solverMoves = (p: Puzzle): string[] => p.moves.filter((_, i) => i % 2 === 1);

/** The FEN names the opponent as the side to move, so the solver has the other colour. */
export const solverColor = (p: Puzzle): ChessColor => (p.fen.split(" ")[1] === "w" ? "b" : "w");

/** The game before solver move `step`: the puzzle FEN, the opponent's first move, then the solution and the replies so far. */
export const lineAt = (p: Puzzle, step: number): GameLine => ({ start: p.fen, moves: p.moves.slice(0, 1 + 2 * step) });

/** Lichess rules: the solution move is right, and any move that gives checkmate is right too. */
export function isCorrect(p: Puzzle, step: number, uci: string): boolean {
  if (uci === p.moves[1 + 2 * step]) return true;
  return givesMate(p, step, uci);
}

/** A right move ends the puzzle when it is the last solution move, or when it gives checkmate. */
export const endsPuzzle = (p: Puzzle, step: number, uci: string): boolean => step === solverMoves(p).length - 1 || givesMate(p, step, uci);

function givesMate(p: Puzzle, step: number, uci: string): boolean {
  const game = playLine(lineAt(p, step));
  try {
    game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return false;
  }
  return game.isCheckmate();
}

/** One solver move in a puzzle attempt. */
export interface PuzzleStep {
  /** The solution move at this step, in UCI notation. */
  expected: string;
  played: string;
  san: string;
  correct: boolean;
  /** Whether the solution was among the moves the player chose between. `null` when the player has no candidate list. */
  inCandidates: boolean | null;
  roundTripMs: number;
  /** Missing for a human move. */
  decision?: ChessDecision;
}

export interface PuzzleRunEvent {
  type: "puzzle-run";
  runId: string;
  at: string;
  set: string;
  setup: ChessPlayerSetup;
}

export interface PuzzleResultEvent {
  type: "puzzle";
  runId: string;
  at: string;
  set: string;
  puzzleId: string;
  /** The puzzle's place in the set, from 1. */
  puzzleNo: number;
  solved: boolean;
  steps: PuzzleStep[];
}

export type PuzzleLogEvent = PuzzleRunEvent | PuzzleResultEvent;

/** One finished attempt, without the decisions, for the scoreboard. */
export interface PuzzleAttemptSummary {
  puzzleId: string;
  solved: boolean;
  at: string;
  steps: { correct: boolean; inCandidates: boolean | null; roundTripMs: number }[];
  tokens: number;
  requests: number;
}

/** One saved run of a puzzle set, for the scoreboard. */
export interface PuzzleRun {
  runId: string;
  at: string;
  setup: ChessPlayerSetup;
  attempts: PuzzleAttemptSummary[];
}
