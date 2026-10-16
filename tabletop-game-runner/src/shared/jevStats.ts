import type { ChessPlayerSetup } from "./chess/types";
import type { GameName } from "./matchups";
import type { PlayerSetup } from "./types";

/** The most expensive games list shows this many games. */
export const TOP_GAMES = 10;

/** Jev use. Only input tokens are billed. */
export interface JevSpend {
  tokens: number;
  requests: number;
  /** Moves made by Jev players. */
  moves: number;
}

/** Finished games and their tokens. The cost per game uses these, so a stopped game does not lower it. */
export interface FinishedSpend {
  games: number;
  tokens: number;
  /** All moves of the finished games, of both sides and with or without Jev. For puzzles, the player's moves. */
  allMoves: number;
}

/** The two games, and chess puzzles. */
export type StatsGame = GameName | "puzzles";

export interface GameTypeSpend extends JevSpend {
  game: StatsGame;
  /** Finished games with at least one Jev player. For puzzles, each attempt counts as a game. */
  finished: FinishedSpend;
}

export type ConfigSpend = ({ game: "tictactoe"; config: PlayerSetup } | { game: "chess" | "puzzles"; config: ChessPlayerSetup }) &
  JevSpend & {
    /** Finished games of this configuration, counted once per side it played. */
    finished: FinishedSpend;
  };

/** The Jev use of one saved game. */
export type GameSpend = ({ game: "tictactoe"; first: PlayerSetup; second: PlayerSetup } | { game: "chess"; first: ChessPlayerSetup; second: ChessPlayerSetup }) &
  JevSpend & {
    experimentId: string;
    gameNo: number;
    /** The time of the game's last saved move, as an ISO time. */
    at: string;
    finished: boolean;
  };

export interface DaySpend {
  /** A local date, for example "2026-10-15". */
  day: string;
  tokens: number;
  requests: number;
}

/** Jev use in every saved game of both games. */
export interface JevStats {
  total: JevSpend;
  games: GameTypeSpend[];
  /** One entry per Jev player configuration, with the model. */
  configs: ConfigSpend[];
  /** The games with the most tokens, most first. */
  top: GameSpend[];
  /** Oldest day first. */
  days: DaySpend[];
}
