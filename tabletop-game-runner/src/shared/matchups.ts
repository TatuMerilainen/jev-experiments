import type { ChessPlayerSetup } from "./chess/types";
import type { StartKind } from "./replays";
import { LEGACY_JEV_MODEL, type PlayerSetup } from "./types";

export type GameName = "tictactoe" | "chess";

/** Finished games between two configurations, in one colour order, with one start kind. */
export interface MatchupRecord<S> {
  /** The configuration that moved first: X, or White. */
  first: S;
  second: S;
  firstKey: string;
  secondKey: string;
  /** How the games started. */
  start: StartKind;
  firstWins: number;
  secondWins: number;
  draws: number;
}

export interface MatchupScore {
  games: number;
  /** Wins of the two configurations, in the order asked for. */
  wins: [number, number];
  draws: number;
}

export interface Matchup<S> {
  a: S;
  b: S;
  aKey: string;
  bKey: string;
  score: MatchupScore;
}

/** The parts of a configuration that the matchup panel keeps apart. Each one is a switch in the panel. */
export interface KeyParts {
  model: boolean;
}

// The config functions clear the settings a player type ignores, so equal players get equal keys.
// Without `model`, a Jev player gets the same key for every model, so the results of all models add up.
// Older saved setups have a `version` field. It is left out, so old and new games of a player add up.

export function tictactoeConfig(s: PlayerSetup, { model = true }: Partial<KeyParts> = {}): PlayerSetup {
  const jev = s.kind === "jev-lookahead" || s.kind === "jev-direct";
  const depth = s.kind === "jev-lookahead" || s.kind === "code-only";
  return {
    kind: s.kind,
    depth: depth ? s.depth : 0,
    lines: jev ? (s.lines ?? true) : true,
    instructions: jev ? (s.instructions ?? null) : null,
    model: jev && model ? (s.model ?? LEGACY_JEV_MODEL) : "",
  };
}

export function chessConfig(s: ChessPlayerSetup, { model = true }: Partial<KeyParts> = {}): ChessPlayerSetup {
  const jev = s.kind === "jev" || s.kind === "jev-all";
  const depth = s.kind === "jev" || s.kind === "code" || s.kind === "stockfish";
  return {
    kind: s.kind,
    depth: depth ? s.depth : 0,
    board: jev ? (s.board ?? true) : true,
    safety: jev ? (s.safety ?? true) : true,
    instructions: jev ? (s.instructions ?? null) : null,
    model: jev && model ? (s.model ?? LEGACY_JEV_MODEL) : "",
  };
}

export const configKey = (config: PlayerSetup | ChessPlayerSetup): string => JSON.stringify(config);

/**
 * Results of configuration `a` against `b`, with either colour.
 * When `a` and `b` are the same configuration, the wins are by colour: first mover, then second mover.
 */
export function scoreOf<S>(records: MatchupRecord<S>[], a: string, b: string): MatchupScore {
  const score: MatchupScore = { games: 0, wins: [0, 0], draws: 0 };
  for (const r of records) {
    let wins: [number, number];
    if (r.firstKey === a && r.secondKey === b) wins = [r.firstWins, r.secondWins];
    else if (r.firstKey === b && r.secondKey === a) wins = [r.secondWins, r.firstWins];
    else continue;
    score.wins[0] += wins[0];
    score.wins[1] += wins[1];
    score.draws += r.draws;
    score.games += r.firstWins + r.secondWins + r.draws;
  }
  return score;
}

/** Results of `first` against `second` in the games where `first` moved first. */
export function scoreInOrder<S>(records: MatchupRecord<S>[], first: string, second: string): MatchupScore {
  const score: MatchupScore = { games: 0, wins: [0, 0], draws: 0 };
  for (const r of records) {
    if (r.firstKey !== first || r.secondKey !== second) continue;
    score.wins[0] += r.firstWins;
    score.wins[1] += r.secondWins;
    score.draws += r.draws;
    score.games += r.firstWins + r.secondWins + r.draws;
  }
  return score;
}

/** Every pair of configurations with saved games, most games first. */
export function allMatchups<S>(records: MatchupRecord<S>[]): Matchup<S>[] {
  const pairs = new Map<string, Matchup<S>>();
  for (const r of records) {
    const swap = r.firstKey > r.secondKey;
    const [aKey, bKey] = swap ? [r.secondKey, r.firstKey] : [r.firstKey, r.secondKey];
    const id = `${aKey}\n${bKey}`;
    if (pairs.has(id)) continue;
    const [a, b] = swap ? [r.second, r.first] : [r.first, r.second];
    pairs.set(id, { a, b, aKey, bKey, score: scoreOf(records, aKey, bKey) });
  }
  return [...pairs.values()].sort((x, y) => y.score.games - x.score.games);
}
