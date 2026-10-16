import type { StartKind } from "../replays";
import type { JevExample } from "../types";
import type { Judgement } from "./winPercent";

export type ChessColor = "w" | "b";

export type ChessBotKind = "jev" | "jev-all" | "code" | "stockfish" | "random";
export type ChessPlayerKind = "human" | ChessBotKind;

export const CHESS_BOT_KINDS: readonly ChessBotKind[] = ["jev", "jev-all", "code", "stockfish", "random"];
export const CHESS_JEV_KINDS: readonly ChessPlayerKind[] = ["jev", "jev-all"];

/** Code search depth in plies for "jev" and "code". */
export const SEARCH_DEPTHS = [1, 2, 3, 4, 5] as const;
/** Stockfish search depth when it plays. */
export const STOCKFISH_DEPTHS = [1, 3, 5, 8, 12] as const;

/** Candidates are moves within this many centipawns of the code's best move. */
export const CANDIDATE_MARGIN = 75;
export const MAX_CANDIDATES = 6;

export interface ChessPlayerSetup {
  kind: ChessPlayerKind;
  /** Code search depth, or Stockfish depth for the Stockfish player. */
  depth: number;
  /** Send Jev the piece lists of both sides. */
  board: boolean;
  /** Describe what each candidate leaves attacked or defended, computed in code. */
  safety: boolean;
  /** Choice instructions for Jev. `null` uses the default text. */
  instructions: string | null;
  /** Jev version for a Jev player. Saved setups from before this setting have none. */
  model: string;
}

export interface ChessDecideRequest {
  /** A puzzle's FEN. Without it, the moves start at the normal start position. */
  start?: string;
  /** Moves from the start, in UCI notation such as "e2e4" or "e7e8q". */
  moves: string[];
  player: ChessPlayerSetup;
}

export interface ChessCandidate {
  san: string;
  uci: string;
  /** Code search score in centipawns for the mover. Not set for Random, Stockfish and Jev alone. */
  score?: number;
  /** The text Jev saw for this move. */
  description?: string;
  /** Jev's probability, averaged over both option orders. */
  probability?: number;
}

export interface ChessDecision {
  player: ChessColor;
  kind: ChessBotKind;
  san: string;
  uci: string;
  legalCount: number;
  candidates: ChessCandidate[];
  /** Why no Jev call was made, for example a single candidate. */
  note?: string;
  stats: {
    serverMs: number;
    searchMs: number;
    jevMs: number;
    jevRequests: number;
    inputTokens: number;
  };
  model?: string;
  jevExample?: JevExample;
}

export interface ChessGradeRequest {
  moves: string[];
  /** The move to rate, played after `moves`. */
  uci: string;
}

export interface ChessGrade {
  /** Centipawns the move gives away against Stockfish's best move, capped at 1000. */
  loss: number;
  bestSan: string;
  depth: number;
  /** The mover's win% with the best move and with the played move, and the difference. Grades saved before win% have none. */
  winBefore?: number;
  winAfter?: number;
  winLoss?: number;
  /** Lichess's label. `null`: no label. Grades saved before win% have none. */
  judgement?: Judgement | null;
}

export interface ChessSavedSettings {
  players: Record<ChessColor, ChessPlayerSetup>;
  /** True when the games start with a random first move. Older readers know only this field. */
  randomFirst: boolean;
  /** The "Openings" setting. Headers saved before it have none. */
  openings: StartKind;
}

export interface SavedChessMove {
  color: ChessColor;
  san: string;
  uci: string;
  source: ChessPlayerKind | "random-opening" | "opening";
  /** The opening's name, for a move from the opening set. */
  opening?: string;
  setup: ChessPlayerSetup;
  fenBefore: string;
  roundTripMs?: number;
  /** `null` when Stockfish could not rate the move. */
  grade: ChessGrade | null;
  /** The bot's decision. Moves saved before replays existed have no `jevExample`. */
  decision?: ChessDecision;
}

export type ChessLogEvent =
  | { type: "experiment"; game: "chess"; experimentId: string; at: string; settings: ChessSavedSettings }
  | { type: "move"; game: "chess"; experimentId: string; at: string; gameNo: number; moveNo: number; move: SavedChessMove }
  | {
      type: "game";
      game: "chess";
      experimentId: string;
      at: string;
      gameNo: number;
      /** "1-0", "0-1" or "1/2-1/2". */
      result: string;
      reason: string;
      plies: number;
      inputTokens: number;
      sequence: string[];
      /** The game's opening from the opening set: its number in the set, from 1, and its name. */
      opening?: { number: number; name: string };
    };
