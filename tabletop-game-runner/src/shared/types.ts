export type Mark = "X" | "O";
export type Cell = Mark | null;
export type Board = readonly Cell[];
export type Result = Mark | "draw";

export type BotKind = "jev-lookahead" | "jev-direct" | "code-only" | "perfect" | "random";
export type PlayerKind = "human" | BotKind;

export const BOT_KINDS: readonly BotKind[] = ["jev-lookahead", "jev-direct", "code-only", "perfect", "random"];
export const JEV_KINDS: readonly BotKind[] = ["jev-lookahead", "jev-direct"];
export const MAX_DEPTH = 3;

/** Jev versions a player can use, newest first. Fixed versions keep each result tied to one model. */
export const JEV_MODELS = ["jev-1.14.0", "jev-1.13.0"] as const;
export const DEFAULT_JEV_MODEL: string = JEV_MODELS[0];
/** Games saved before players had a model setting all ran on this version. */
export const LEGACY_JEV_MODEL = "jev-1.13.0";

export interface PlayerSetup {
  kind: PlayerKind;
  depth: number;
  lines: boolean;
  /** Question instructions for a Jev player. `null` uses the default text. */
  instructions: string | null;
  /** Jev version for a Jev player. Saved setups from before this setting have none. */
  model: string;
}

export interface BotConfig {
  kind: BotKind;
  /** Plies to search. Used by jev-lookahead and code-only. */
  depth: number;
  /** Send Jev the contents of all 8 lines next to the grid. */
  lines: boolean;
  /** Question instructions for Jev. `null` uses the default text. */
  instructions: string | null;
  /** Jev version. Used by Jev players. */
  model: string;
}

/**
 * outcome: -1 (loss) to +1 (win) for the player who moves.
 * probability: Jev Choice probability, 0 to 1.
 */
export type ValueKind = "outcome" | "probability" | "none";

export interface Candidate {
  move: number;
  value: number | null;
  /** Look-ahead only: average over the opponent's replies. */
  average?: number;
  /** Look-ahead only: the opponent reply that gives the worst case. */
  reply?: number | null;
}

/** The search multiplies each Jev estimate by this weight, so a proven result outranks an estimate of the same sign. */
export const ESTIMATE_WEIGHT = 0.9;

export interface LeafJudgement {
  board: Cell[];
  score: number;
  /** Probability of each Score level, level 0 first. */
  probabilities: number[];
  confidence: number;
  /** Jev's value from −1 to +1, from the deciding player's view. The search uses ESTIMATE_WEIGHT times this value. */
  value: number;
  ms: number;
  /** Number of tree leaves that share this position (after rotation and reflection). */
  uses: number;
}

export interface DirectRun {
  /** Option order sent to Jev, as cell indexes. */
  order: number[];
  probabilities: Record<number, number>;
  ms: number;
}

export interface DecisionStats {
  serverMs: number;
  jevRequests: number;
  inputTokens: number;
  requestMs: number[];
}

/** The first Jev call of a decision, as sent and as answered. Shown in the Jev sidebar, also in replays. */
export interface JevExample {
  /** The state can be text, a JSON object or an array. */
  request: { model: string; state: unknown; questions: Record<string, unknown> };
  response: {
    model: string;
    answers: Record<string, unknown>;
    usage: { input_tokens: number; output_tokens: number };
    ms: number;
  };
}

export interface Decision {
  player: Mark;
  config: BotConfig;
  move: number;
  valueKind: ValueKind;
  candidates: Candidate[];
  leaves?: LeafJudgement[];
  directRuns?: DirectRun[];
  stats: DecisionStats;
  model?: string;
  jevExample?: JevExample;
  /** Look-ahead: distinct leaf positions with a known result, decided in code without Jev. */
  exactLeaves?: number;
}

export interface DecideRequest {
  board: Cell[];
  player: BotConfig;
}

export interface StatusResponse {
  jevConfigured: boolean;
  model: string;
}

/** Experiment settings that affect results. The delay is left out. */
export interface SavedSettings {
  players: Record<Mark, PlayerSetup>;
  randomFirst: boolean;
}

export type LogEvent =
  | { type: "experiment"; experimentId: string; at: string; settings: SavedSettings }
  | { type: "move"; experimentId: string; at: string; gameNo: number; moveNo: number; move: SavedMove }
  | { type: "game"; experimentId: string; at: string; gameNo: number; result: Result; sequence: string[] };

export interface SavedMove {
  player: Mark;
  cell: string;
  source: PlayerKind | "random-opening";
  setup: PlayerSetup;
  before: Cell[];
  grade: { optimal: boolean; best: number; actual: number };
  roundTripMs?: number;
  /** The bot's decision. Moves saved before replays existed have no `jevExample`. */
  decision?: Decision;
}

export interface LogResponse {
  /** Experiment folder, relative to the project root. */
  dir: string;
}
