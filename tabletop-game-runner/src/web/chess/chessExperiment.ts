import { Chess, type Move } from "chess.js";
import type { ChessColor, ChessDecision, ChessGrade, ChessPlayerKind, ChessPlayerSetup } from "../../shared/chess/types";
import { DEFAULT_JEV_MODEL } from "../../shared/types";
import { OPENINGS, type Opening } from "../../shared/chess/openings";
import { moveAccuracy } from "../../shared/chess/winPercent";
import type { StartKind } from "../../shared/replays";
import { modelTag, timeStamp } from "../experiment";

// A game that reaches this many plies is stopped as a draw, so a game always ends and its cost stays bounded.
export const MAX_PLIES = 300;
export const BLUNDER_LOSS = 300;

export interface ChessSettings {
  players: Record<ChessColor, ChessPlayerSetup>;
  /** The "Openings" setting: the start position, a random first move, or the next opening of the set. */
  openings: StartKind;
  delayMs: number;
  /** Start the next game when a game ends. */
  continuous: boolean;
}

export type ChessMoveSource = ChessPlayerKind | "random-opening" | "opening";

/** A move the player chose. The app plays a random first move and the opening moves, so they do not count for the player. */
export const playerMove = (source: ChessMoveSource): boolean => source !== "random-opening" && source !== "opening";

export interface ChessMoveRecord {
  color: ChessColor;
  san: string;
  uci: string;
  from: string;
  to: string;
  source: ChessMoveSource;
  /** The opening's name, for a move from the opening set. */
  opening?: string;
  setup: ChessPlayerSetup;
  fenBefore: string;
  decision?: ChessDecision;
  roundTripMs?: number;
  grade: ChessGrade | "pending" | "failed";
}

export interface ChessOutcome {
  winner: ChessColor | null;
  reason: string;
}

export interface ChessSideStats {
  /** Moves the player chose: random first moves are left out. */
  moves: number;
  decisions: number;
  roundTripMs: number;
  jevRequests: number;
  inputTokens: number;
  graded: number;
  lossTotal: number;
  blunders: number;
  /** Rated moves with win% data, and their totals. */
  winGraded: number;
  winLossTotal: number;
  accuracyTotal: number;
}

export interface ChessTally {
  games: number;
  wins: Record<ChessColor, number>;
  draws: number;
  plies: number;
  /** Times each move sequence was played. Its size is the number of distinct games. */
  sequences: Record<string, number>;
  side: Record<ChessColor, ChessSideStats>;
}

export interface ChessState {
  experimentId: string;
  settings: ChessSettings;
  moves: ChessMoveRecord[];
  fen: string;
  outcome: ChessOutcome | null;
  gameNo: number;
  tally: ChessTally;
  running: boolean;
  busy: boolean;
  error: string | null;
  /** Why the last rating of this game failed. Play goes on without that rating. */
  gradeError: string | null;
  /** The opening set is played twice. The second pass has the colours exchanged. */
  pass: 1 | 2;
  inspected: number | null;
}

export type ChessAction =
  | { type: "move"; uci: string; source: ChessMoveSource; opening?: string; decision?: ChessDecision; roundTripMs?: number }
  | { type: "graded"; experimentId: string; gameNo: number; index: number; grade: ChessGrade | "failed"; error?: string }
  | { type: "busy" }
  | { type: "failed"; message: string }
  | { type: "newGame" }
  | { type: "reset" }
  | { type: "setRunning"; running: boolean }
  | { type: "setSettings"; settings: ChessSettings; restart: boolean }
  | { type: "inspect"; index: number | null };

const jevPlayer = (): ChessPlayerSetup => ({ kind: "jev", depth: 2, board: true, safety: true, instructions: null, model: DEFAULT_JEV_MODEL });

export const DEFAULT_CHESS_SETTINGS: ChessSettings = {
  players: { w: jevPlayer(), b: jevPlayer() },
  openings: "start",
  delayMs: 1000,
  continuous: false,
};

const START_FEN = new Chess().fen();

const emptySide = (): ChessSideStats => ({
  moves: 0,
  decisions: 0,
  roundTripMs: 0,
  jevRequests: 0,
  inputTokens: 0,
  graded: 0,
  lossTotal: 0,
  blunders: 0,
  winGraded: 0,
  winLossTotal: 0,
  accuracyTotal: 0,
});

/** A grade with win% data uses Lichess's label. An old grade uses the centipawn rule. */
export const isBlunder = (grade: ChessGrade): boolean => (grade.judgement !== undefined ? grade.judgement === "blunder" : grade.loss >= BLUNDER_LOSS);

const emptyTally = (): ChessTally => ({
  games: 0,
  wins: { w: 0, b: 0 },
  draws: 0,
  plies: 0,
  sequences: {},
  side: { w: emptySide(), b: emptySide() },
});

export function initialChessState(settings: ChessSettings = DEFAULT_CHESS_SETTINGS, pass: 1 | 2 = 1): ChessState {
  return {
    experimentId: newExperimentId(settings),
    settings,
    moves: [],
    fen: START_FEN,
    outcome: null,
    gameNo: 1,
    tally: emptyTally(),
    running: false,
    busy: false,
    error: null,
    gradeError: null,
    pass,
    inspected: null,
  };
}

/** For example chess_2026-10-14_10-05-12_W-jev-d2-v1-14-0_B-stockfish-d5_k3f9. */
/** A chess player for a folder name, for example "jev-d2-v1-14-0-noboard". */
export function chessPlayerTag({ kind, depth, board, safety, instructions, model }: ChessPlayerSetup): string {
  let label: string = kind;
  if (kind === "jev" || kind === "code" || kind === "stockfish") label += `-d${depth}`;
  if (kind === "jev" || kind === "jev-all") {
    label += modelTag(model);
    if (!board) label += "-noboard";
    if (!safety) label += "-basic";
    if (instructions) label += "-custom";
  }
  return label;
}

function newExperimentId(settings: ChessSettings): string {
  const stamp = timeStamp();
  const side = (color: ChessColor) => `${color.toUpperCase()}-${chessPlayerTag(settings.players[color])}`;
  const start = startKind(settings);
  const opening = start === "random-first" ? "_random-first" : start === "opening-set" ? "_openings" : "";
  return `chess_${stamp}_${side("w")}_${side("b")}${opening}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * How the games start. A human who plays White makes the first move, so a game has no random first move then.
 * The experiment is saved that way. The app plays the opening set for humans too.
 */
export const startKind = (settings: ChessSettings): StartKind =>
  settings.openings === "random-first" && settings.players.w.kind === "human" ? "start" : settings.openings;

/** The opening of the game on the board, with its number in the set from 1. */
export function gameOpening(state: ChessState): { opening: Opening; number: number } | null {
  if (state.settings.openings !== "opening-set") return null;
  const index = (state.gameNo - 1) % OPENINGS.length;
  return { opening: OPENINGS[index]!, number: index + 1 };
}

/** The next move of the game's opening, until the opening is complete. */
export function nextOpeningMove(state: ChessState): string | null {
  const opening = gameOpening(state)?.opening;
  return opening && state.moves.length < opening.moves.length ? opening.moves[state.moves.length]! : null;
}

/** The last game of the second pass through the opening set. Play stops after it. */
export const endsOpeningRun = (state: ChessState): boolean =>
  state.settings.openings === "opening-set" && state.pass === 2 && state.gameNo >= OPENINGS.length;

/** After a human move, the bot answers by itself, also while play is paused. */
export const answersHuman = (state: ChessState): boolean => state.outcome === null && state.moves.at(-1)?.source === "human";

/** Replays the game so chess.js knows the history, which the draw rules need. */
export function replayGame(moves: { uci: string }[]): Chess {
  const game = new Chess();
  for (const m of moves) game.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
  return game;
}

export const pendingGrades = (state: ChessState) => state.moves.some((m) => m.grade === "pending");

/** Jev tokens of the finished games. A game that has ended stays on the board, and the tally already counts it. */
export function finishedGameTokens(tally: ChessTally, gameTokens: number, gameOver: boolean): number {
  return tally.side.w.inputTokens + tally.side.b.inputTokens - (gameOver ? 0 : gameTokens);
}

export function chessReducer(state: ChessState, action: ChessAction): ChessState {
  switch (action.type) {
    case "move":
      return applyMove(state, action);
    case "graded":
      return applyGrade(state, action);
    case "busy":
      return { ...state, busy: true, error: null };
    case "failed":
      return { ...state, busy: false, running: false, error: action.message };
    case "newGame": {
      // After the last opening of the set, the colours swap as with "Swap sides", and the set starts again as a new experiment.
      if (state.settings.openings === "opening-set" && state.gameNo >= OPENINGS.length) {
        const { w, b } = state.settings.players;
        return { ...initialChessState({ ...state.settings, players: { w: b, b: w } }, state.pass === 1 ? 2 : 1), running: state.running };
      }
      return { ...state, moves: [], fen: START_FEN, outcome: null, gameNo: state.gameNo + 1, busy: false, gradeError: null, inspected: null };
    }
    case "reset":
      return initialChessState(state.settings);
    case "setRunning":
      return { ...state, running: action.running, error: action.running ? null : state.error };
    case "setSettings":
      return action.restart ? { ...initialChessState(action.settings), running: state.running } : { ...state, settings: action.settings };
    case "inspect":
      return { ...state, inspected: action.index };
  }
}

function outcomeOf(game: Chess, plies: number): ChessOutcome | null {
  if (game.isCheckmate()) return { winner: game.turn() === "w" ? "b" : "w", reason: "checkmate" };
  if (game.isStalemate()) return { winner: null, reason: "stalemate" };
  if (game.isInsufficientMaterial()) return { winner: null, reason: "insufficient material" };
  if (game.isThreefoldRepetition()) return { winner: null, reason: "threefold repetition" };
  if (game.isDrawByFiftyMoves()) return { winner: null, reason: "fifty-move rule" };
  if (plies >= MAX_PLIES) return { winner: null, reason: `${MAX_PLIES}-ply limit` };
  return null;
}

function applyMove(state: ChessState, action: Extract<ChessAction, { type: "move" }>): ChessState {
  const game = replayGame(state.moves);
  const fenBefore = game.fen();
  const color = game.turn();
  const move: Move = game.move({ from: action.uci.slice(0, 2), to: action.uci.slice(2, 4), promotion: action.uci[4] });
  const record: ChessMoveRecord = {
    color,
    san: move.san,
    uci: action.uci,
    from: move.from,
    to: move.to,
    source: action.source,
    ...(action.opening ? { opening: action.opening } : {}),
    setup: state.settings.players[color],
    fenBefore,
    decision: action.decision,
    roundTripMs: action.roundTripMs,
    grade: "pending",
  };
  const moves = [...state.moves, record];
  const outcome = outcomeOf(game, moves.length);

  const side = { ...state.tally.side };
  if (playerMove(action.source)) {
    const s = { ...side[color] };
    s.moves++;
    if (action.decision) {
      s.decisions++;
      s.roundTripMs += action.roundTripMs ?? 0;
      s.jevRequests += action.decision.stats.jevRequests;
      s.inputTokens += action.decision.stats.inputTokens;
    }
    side[color] = s;
  }

  let tally: ChessTally = { ...state.tally, side };
  if (outcome) {
    const sequence = moves.map((m) => m.san).join(" ");
    tally = {
      ...tally,
      games: tally.games + 1,
      wins: outcome.winner ? { ...tally.wins, [outcome.winner]: tally.wins[outcome.winner] + 1 } : tally.wins,
      draws: tally.draws + (outcome.winner ? 0 : 1),
      plies: tally.plies + moves.length,
      sequences: { ...tally.sequences, [sequence]: (tally.sequences[sequence] ?? 0) + 1 },
    };
  }

  // Without continuous play, play stops at the end of a game, so the last move stays on the board.
  // It also stops after both passes through the opening set.
  const running = outcome && (!state.settings.continuous || endsOpeningRun(state)) ? false : state.running;
  return { ...state, moves, fen: game.fen(), outcome, tally, busy: false, error: null, running };
}

function applyGrade(state: ChessState, action: Extract<ChessAction, { type: "graded" }>): ChessState {
  if (action.experimentId !== state.experimentId || action.gameNo !== state.gameNo) return state;
  const record = state.moves[action.index];
  if (!record || record.grade !== "pending") return state;
  const moves = state.moves.map((m, i) => (i === action.index ? { ...m, grade: action.grade } : m));
  if (action.grade === "failed") return { ...state, moves, gradeError: action.error ?? "unknown error" };
  if (!playerMove(record.source)) return { ...state, moves };
  const s = { ...state.tally.side[record.color] };
  s.graded++;
  s.lossTotal += action.grade.loss;
  if (isBlunder(action.grade)) s.blunders++;
  const { winBefore, winAfter, winLoss } = action.grade;
  if (winBefore !== undefined && winAfter !== undefined && winLoss !== undefined) {
    s.winGraded++;
    s.winLossTotal += winLoss;
    s.accuracyTotal += moveAccuracy(winBefore, winAfter);
  }
  return { ...state, moves, tally: { ...state.tally, side: { ...state.tally.side, [record.color]: s } } };
}
