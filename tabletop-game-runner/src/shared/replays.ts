/** The games list shows this many of the newest games per configuration pair. */
export const RECENT_GAMES = 20;

/**
 * How the games of an experiment start: from the start position, with a random first move, or with an opening from the set.
 * Tic-tac-toe has only the first two. Data saved before the opening set has only `randomFirst`.
 */
export type StartKind = "start" | "random-first" | "opening-set";

export const START_KINDS: readonly StartKind[] = ["start", "random-first", "opening-set"];

/** Who won a saved game, by move order. The first mover is X, or White. */
export type Winner = "first" | "second" | "draw";

/** One finished game in a saved experiment, for the games list. */
export interface SavedGameSummary {
  gameNo: number;
  winner: Winner;
  /** Moves of both players together. */
  moves: number;
  /** When the game ended, as an ISO time. */
  at: string;
  /** Chess only: why the game ended, for example "checkmate". */
  reason?: string;
  /** Chess with the opening set: the name of the game's opening. */
  opening?: string;
}

/** The finished games of one saved experiment, with the configurations of the first and the second mover. */
export interface SavedExperimentGames<S> {
  experimentId: string;
  first: S;
  second: S;
  /** How the experiment's games start. */
  start: StartKind;
  games: SavedGameSummary[];
}

/** One saved game with all its moves, for a replay. `M` is the saved move type of the game. */
export interface SavedReplay<S, M> {
  experimentId: string;
  gameNo: number;
  first: S;
  second: S;
  summary: SavedGameSummary;
  moves: M[];
}
