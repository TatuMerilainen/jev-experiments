import type { Chess } from "chess.js";
import { playLine } from "../../shared/chess/line";
import {
  endsPuzzle,
  isCorrect,
  lineAt,
  PUZZLE_SETS,
  puzzleSet,
  solverMoves,
  type Puzzle,
  type PuzzleResultEvent,
  type PuzzleStep,
} from "../../shared/chess/puzzles";
import type { ChessDecision, ChessPlayerSetup } from "../../shared/chess/types";
import { DEFAULT_JEV_MODEL } from "../../shared/types";
import { chessPlayerTag } from "../chess/chessExperiment";
import { timeStamp } from "../experiment";

export interface PuzzleSettings {
  set: string;
  player: ChessPlayerSetup;
  delayMs: number;
  /** Start a new run of the set when a run ends. */
  continuous: boolean;
}

export const DEFAULT_PUZZLE_SETTINGS: PuzzleSettings = {
  set: PUZZLE_SETS[0]!.name,
  player: { kind: "jev", depth: 2, board: true, safety: true, instructions: null, model: DEFAULT_JEV_MODEL },
  delayMs: 1000,
  continuous: false,
};

/** One pass of a player through a puzzle set. */
export interface PuzzleRunState {
  settings: PuzzleSettings;
  runId: string;
  /** The puzzle being solved, from 0. Equal to the set size when the run is done. */
  index: number;
  /** The solver move being asked for, from 0. */
  step: number;
  /** The solver moves of this puzzle so far. */
  steps: PuzzleStep[];
  /** The last solver move is on the board. The next tick plays the opponent's reply or opens the next puzzle. */
  showingMove: boolean;
  /** The finished attempts of this run. */
  results: PuzzleResultEvent[];
  running: boolean;
  busy: boolean;
  error: string | null;
  /** The step shown in the Move panel. `null` follows the latest step. */
  inspected: number | null;
}

export type PuzzleAction =
  | { type: "busy" }
  | { type: "move"; uci: string; san: string; decision?: ChessDecision; roundTripMs: number }
  | { type: "advance" }
  | { type: "failed"; message: string }
  | { type: "setRunning"; running: boolean }
  | { type: "reset" }
  | { type: "setSettings"; settings: PuzzleSettings }
  | { type: "setDelay"; delayMs: number }
  | { type: "setContinuous"; continuous: boolean }
  | { type: "inspect"; index: number | null };

export const puzzlesOf = (state: PuzzleRunState): Puzzle[] => puzzleSet(state.settings.set)?.puzzles ?? [];

export const currentPuzzle = (state: PuzzleRunState): Puzzle | undefined => puzzlesOf(state)[state.index];

export const runDone = (state: PuzzleRunState): boolean => state.index >= puzzlesOf(state).length;

/** The board now: the position before the current solver move, plus that move while it is shown. */
export function boardOf(state: PuzzleRunState): Chess | null {
  const puzzle = currentPuzzle(state);
  if (!puzzle) return null;
  const game = playLine(lineAt(puzzle, state.step));
  const shown = state.showingMove ? state.steps.at(-1) : undefined;
  if (shown) game.move({ from: shown.played.slice(0, 2), to: shown.played.slice(2, 4), promotion: shown.played[4] });
  return game;
}

/** For example "puzzles_2026-10-16_10-05-12_jev-d2-v1-14-0_lichess-10_k3f9". */
export function newRunId(settings: PuzzleSettings): string {
  return `puzzles_${timeStamp()}_${chessPlayerTag(settings.player)}_${settings.set}_${Math.random().toString(36).slice(2, 6)}`;
}

export function initialPuzzleState(settings: PuzzleSettings = DEFAULT_PUZZLE_SETTINGS): PuzzleRunState {
  return {
    settings,
    runId: newRunId(settings),
    index: 0,
    step: 0,
    steps: [],
    showingMove: false,
    results: [],
    running: false,
    busy: false,
    error: null,
    inspected: null,
  };
}

export function puzzleReducer(state: PuzzleRunState, action: PuzzleAction): PuzzleRunState {
  switch (action.type) {
    case "busy":
      return { ...state, busy: true, error: null };
    case "move":
      return applyMove(state, action);
    case "advance": {
      if (!state.showingMove) return state;
      const last = state.steps.at(-1)!;
      const puzzle = currentPuzzle(state)!;
      if (last.correct && !endsPuzzle(puzzle, state.step, last.played)) {
        return { ...state, step: state.step + 1, showingMove: false };
      }
      const next = { ...state, index: state.index + 1, step: 0, steps: [], showingMove: false, inspected: null };
      if (!runDone(next)) return next;
      return state.running && state.settings.continuous ? { ...initialPuzzleState(state.settings), running: true } : { ...next, running: false };
    }
    case "failed":
      return { ...state, busy: false, running: false, error: action.message };
    case "setRunning":
      return runDone(state) && action.running ? { ...initialPuzzleState(state.settings), running: true } : { ...state, running: action.running, error: action.running ? null : state.error };
    case "reset":
      return initialPuzzleState(state.settings);
    case "setSettings":
      return { ...initialPuzzleState(action.settings), running: state.running && !runDone(state) };
    case "setDelay":
      return { ...state, settings: { ...state.settings, delayMs: action.delayMs } };
    case "setContinuous":
      return { ...state, settings: { ...state.settings, continuous: action.continuous } };
    case "inspect":
      return { ...state, inspected: action.index };
  }
}

function applyMove(state: PuzzleRunState, action: Extract<PuzzleAction, { type: "move" }>): PuzzleRunState {
  const puzzle = currentPuzzle(state);
  if (!puzzle || state.showingMove) return { ...state, busy: false };
  const expected = solverMoves(puzzle)[state.step]!;
  const candidates = action.decision?.candidates ?? [];
  const step: PuzzleStep = {
    expected,
    played: action.uci,
    san: action.san,
    correct: isCorrect(puzzle, state.step, action.uci),
    inCandidates: candidates.length ? candidates.some((c) => c.uci === expected) : null,
    roundTripMs: action.roundTripMs,
    ...(action.decision ? { decision: action.decision } : {}),
  };
  const steps = [...state.steps, step];
  const ends = !step.correct || endsPuzzle(puzzle, state.step, action.uci);
  const results = ends
    ? [
        ...state.results,
        {
          type: "puzzle" as const,
          runId: state.runId,
          at: new Date().toISOString(),
          set: state.settings.set,
          puzzleId: puzzle.id,
          puzzleNo: state.index + 1,
          solved: step.correct,
          steps,
        },
      ]
    : state.results;
  return { ...state, busy: false, steps, showingMove: true, results };
}
