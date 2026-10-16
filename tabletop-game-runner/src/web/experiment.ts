import { gradeMove, type Grade } from "../shared/solver";
import { emptyBoard, play, result, toMove } from "../shared/tictactoe";
import { DEFAULT_JEV_MODEL, type Cell, type Decision, type Mark, type PlayerKind, type PlayerSetup, type Result } from "../shared/types";

export interface Settings {
  players: Record<Mark, PlayerSetup>;
  randomFirst: boolean;
  delayMs: number;
  /** Start the next game when a game ends. */
  continuous: boolean;
}

export type MoveSource = PlayerKind | "random-opening";

export interface MoveRecord {
  player: Mark;
  cell: number;
  source: MoveSource;
  setup: PlayerSetup;
  before: Cell[];
  grade: Grade;
  decision?: Decision;
  roundTripMs?: number;
}

export interface SideStats {
  /** Moves the player chose: random opening moves are left out. */
  moves: number;
  optimal: number;
  decisions: number;
  serverMs: number;
  roundTripMs: number;
  jevRequests: number;
  inputTokens: number;
}

export interface Tally {
  games: number;
  wins: Record<Mark, number>;
  draws: number;
  /** Times each move sequence was played. Its size is the number of distinct games. */
  sequences: Record<string, number>;
  side: Record<Mark, SideStats>;
}

export interface ExperimentState {
  /** Also the name of the folder the server saves this experiment in. */
  experimentId: string;
  settings: Settings;
  board: Cell[];
  moves: MoveRecord[];
  result: Result | null;
  gameNo: number;
  tally: Tally;
  running: boolean;
  busy: boolean;
  error: string | null;
  /** Move shown in the decision panel. `null` follows the latest move. */
  inspected: number | null;
}

export type Action =
  | { type: "move"; cell: number; source: MoveSource; decision?: Decision; roundTripMs?: number }
  | { type: "busy" }
  | { type: "failed"; message: string }
  | { type: "newGame" }
  | { type: "reset" }
  | { type: "setRunning"; running: boolean }
  | { type: "setSettings"; settings: Settings; restart: boolean }
  | { type: "inspect"; index: number | null };

export const DEFAULT_SETTINGS: Settings = {
  players: {
    X: { kind: "jev-lookahead", depth: 2, lines: true, instructions: null, model: DEFAULT_JEV_MODEL },
    O: { kind: "jev-lookahead", depth: 2, lines: true, instructions: null, model: DEFAULT_JEV_MODEL },
  },
  randomFirst: false,
  delayMs: 1000,
  continuous: false,
};

const emptySide = (): SideStats => ({
  moves: 0,
  optimal: 0,
  decisions: 0,
  serverMs: 0,
  roundTripMs: 0,
  jevRequests: 0,
  inputTokens: 0,
});

const emptyTally = (): Tally => ({
  games: 0,
  wins: { X: 0, O: 0 },
  draws: 0,
  sequences: {},
  side: { X: emptySide(), O: emptySide() },
});

export function initialState(settings: Settings = DEFAULT_SETTINGS): ExperimentState {
  return {
    experimentId: newExperimentId(settings),
    settings,
    board: emptyBoard(),
    moves: [],
    result: null,
    gameNo: 1,
    tally: emptyTally(),
    running: false,
    busy: false,
    error: null,
    inspected: null,
  };
}

/** A human who moves first makes that move, so the game has no random first move. The experiment is then saved without one. */
export const playsRandomFirst = (settings: Settings): boolean => settings.randomFirst && settings.players.X.kind !== "human";

/** After a human move, the bot answers by itself, also while play is paused. */
export const answersHuman = (state: ExperimentState): boolean => state.result === null && state.moves.at(-1)?.source === "human";

/** A model for a folder name: "jev-1.14.0" becomes "-v1-14-0". Folder names allow only letters, digits, '-' and '_'. */
export const modelTag = (model: string) => `-v${model.replace(/^jev-/, "").replace(/[^A-Za-z0-9]/g, "-")}`;

/** Local time for a folder name, for example 2026-10-14_10-05-12. */
export function timeStamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/** Local start time plus the setup, for example 2026-10-14_10-05-12_X-jev-lookahead-d2-v1-14-0_O-perfect_k3f9. */
function newExperimentId(settings: Settings): string {
  const stamp = timeStamp();
  const side = (mark: Mark) => {
    const { kind, depth, lines, instructions, model } = settings.players[mark];
    const jev = kind === "jev-lookahead" || kind === "jev-direct";
    let label = `${mark}-${kind}`;
    if (kind === "jev-lookahead" || kind === "code-only") label += `-d${depth}`;
    if (jev) label += modelTag(model);
    if (jev && !lines) label += "-grid";
    if (jev && instructions) label += "-custom";
    return label;
  };
  const opening = playsRandomFirst(settings) ? "_random-first" : "";
  return `${stamp}_${side("X")}_${side("O")}${opening}_${Math.random().toString(36).slice(2, 6)}`;
}

export function reducer(state: ExperimentState, action: Action): ExperimentState {
  switch (action.type) {
    case "move":
      return applyMove(state, action);
    case "busy":
      return { ...state, busy: true, error: null };
    case "failed":
      return { ...state, busy: false, running: false, error: action.message };
    case "newGame":
      return { ...state, board: emptyBoard(), moves: [], result: null, gameNo: state.gameNo + 1, busy: false, inspected: null };
    case "reset":
      return initialState(state.settings);
    case "setRunning":
      return { ...state, running: action.running, error: action.running ? null : state.error };
    case "setSettings":
      return action.restart
        ? { ...initialState(action.settings), running: state.running }
        : { ...state, settings: action.settings };
    case "inspect":
      return { ...state, inspected: action.index };
  }
}

function applyMove(state: ExperimentState, action: Extract<Action, { type: "move" }>): ExperimentState {
  const player = toMove(state.board);
  const before = state.board;
  const board = play(before, action.cell);
  const record: MoveRecord = {
    player,
    cell: action.cell,
    source: action.source,
    setup: state.settings.players[player],
    before,
    grade: gradeMove(before, action.cell),
    decision: action.decision,
    roundTripMs: action.roundTripMs,
  };
  const moves = [...state.moves, record];
  const outcome = result(board);

  const side = { ...state.tally.side };
  if (action.source !== "random-opening") {
    const s = { ...side[player] };
    s.moves++;
    if (record.grade.optimal) s.optimal++;
    if (action.decision) {
      s.decisions++;
      s.serverMs += action.decision.stats.serverMs;
      s.roundTripMs += action.roundTripMs ?? 0;
      s.jevRequests += action.decision.stats.jevRequests;
      s.inputTokens += action.decision.stats.inputTokens;
    }
    side[player] = s;
  }

  let tally: Tally = { ...state.tally, side };
  if (outcome) {
    const sequence = moves.map((m) => m.cell).join("");
    tally = {
      ...tally,
      games: tally.games + 1,
      wins: outcome === "draw" ? tally.wins : { ...tally.wins, [outcome]: tally.wins[outcome] + 1 },
      draws: tally.draws + (outcome === "draw" ? 1 : 0),
      sequences: { ...tally.sequences, [sequence]: (tally.sequences[sequence] ?? 0) + 1 },
    };
  }

  // Without continuous play, play stops at the end of a game, so the last move stays on the board.
  const running = outcome && !state.settings.continuous ? false : state.running;
  return { ...state, board, moves, result: outcome, tally, busy: false, error: null, running };
}
