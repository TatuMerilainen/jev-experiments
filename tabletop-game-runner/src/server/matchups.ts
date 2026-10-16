import path from "node:path";
import type { ChessPlayerSetup } from "../shared/chess/types";
import { chessConfig, configKey, tictactoeConfig, type GameName, type MatchupRecord } from "../shared/matchups";
import { RECENT_GAMES, START_KINDS, type SavedExperimentGames, type SavedGameSummary, type SavedReplay, type StartKind, type Winner } from "../shared/replays";
import type { PlayerSetup } from "../shared/types";
import { listDirs, parse, readText } from "./files";
import { EXPERIMENT_ID, EXPERIMENTS_DIR } from "./store";

type Config = PlayerSetup | ChessPlayerSetup;

interface Reader {
  /** Chess headers say `game: "chess"`. Tic-tac-toe headers have no `game` field. */
  game: string | undefined;
  /** The configurations of the first and the second mover. */
  players: (players: Record<string, unknown>) => [Config, Config] | null;
  winner: (result: unknown) => Winner | null;
}

const READERS: Record<GameName, Reader> = {
  tictactoe: {
    game: undefined,
    players: ({ X, O }) => (X && O ? [tictactoeConfig(X as PlayerSetup), tictactoeConfig(O as PlayerSetup)] : null),
    winner: (r) => (r === "X" ? "first" : r === "O" ? "second" : r === "draw" ? "draw" : null),
  },
  chess: {
    game: "chess",
    players: ({ w, b }) => (w && b ? [chessConfig(w as ChessPlayerSetup), chessConfig(b as ChessPlayerSetup)] : null),
    winner: (r) => (r === "1-0" ? "first" : r === "0-1" ? "second" : r === "1/2-1/2" ? "draw" : null),
  },
};

interface Header {
  game?: string;
  settings?: { players?: Record<string, unknown>; randomFirst?: unknown; openings?: unknown };
}

/** Headers saved before the opening set have only `randomFirst`. */
const startOf = (settings: NonNullable<Header["settings"]>): StartKind =>
  START_KINDS.includes(settings.openings as StartKind) ? (settings.openings as StartKind) : settings.randomFirst === true ? "random-first" : "start";

/** The settings and finished games of one saved experiment folder, or `null` for a folder of another game. */
export async function readExperiment(game: GameName, dir: string, name: string): Promise<SavedExperimentGames<Config> | null> {
  const reader = READERS[game];
  const header = parse(await readText(path.join(dir, name, "experiment.json"))) as Header | null;
  if (!header || header.game !== reader.game || !header.settings?.players) return null;
  const players = reader.players(header.settings.players);
  if (!players) return null;
  const games: SavedGameSummary[] = [];
  for (const line of (await readText(path.join(dir, name, "games.jsonl"))).split("\n")) {
    const event = parse(line) as { gameNo?: unknown; result?: unknown; at?: unknown; sequence?: unknown; reason?: unknown; opening?: { name?: unknown } } | null;
    const winner = reader.winner(event?.result);
    if (!event || !winner) continue;
    games.push({
      // Saved games carry their number. Counting lines keeps the totals right for a line without one.
      gameNo: typeof event.gameNo === "number" ? event.gameNo : games.length + 1,
      winner,
      moves: Array.isArray(event.sequence) ? event.sequence.length : 0,
      at: typeof event.at === "string" ? event.at : "",
      ...(typeof event.reason === "string" ? { reason: event.reason } : {}),
      ...(typeof event.opening?.name === "string" ? { opening: event.opening.name } : {}),
    });
  }
  return { experimentId: name, first: players[0], second: players[1], start: startOf(header.settings), games };
}

async function readExperiments(game: GameName, dir: string): Promise<SavedExperimentGames<Config>[]> {
  const all = await Promise.all((await listDirs(dir)).map((name) => readExperiment(game, dir, name)));
  return all.filter((e): e is SavedExperimentGames<Config> => e !== null && e.games.length > 0);
}

/** Adds up the finished games of every saved experiment of one game, per pair of configurations, colour order and start kind. */
export async function readMatchups(game: GameName, dir = EXPERIMENTS_DIR): Promise<MatchupRecord<Config>[]> {
  const records = new Map<string, MatchupRecord<Config>>();
  for (const { first, second, start, games } of await readExperiments(game, dir)) {
    const firstKey = configKey(first);
    const secondKey = configKey(second);
    const id = `${firstKey}\n${secondKey}\n${start}`;
    const record = records.get(id) ?? { first, second, firstKey, secondKey, start, firstWins: 0, secondWins: 0, draws: 0 };
    for (const { winner } of games) {
      if (winner === "first") record.firstWins++;
      else if (winner === "second") record.secondWins++;
      else record.draws++;
    }
    records.set(id, record);
  }
  return [...records.values()];
}

/**
 * The newest finished games of every saved experiment of one game, for the games list.
 * Games are saved in time order, so the newest games of a configuration pair are always among
 * the newest of each experiment. The reply stays small after thousands of games.
 */
export async function readGames(game: GameName, dir = EXPERIMENTS_DIR): Promise<SavedExperimentGames<Config>[]> {
  return (await readExperiments(game, dir)).map((e) => ({ ...e, games: e.games.slice(-RECENT_GAMES) }));
}

/** One finished game with all its saved moves, or `null` when there is no such game. */
export async function readReplay(game: GameName, experimentId: string, gameNo: number, dir = EXPERIMENTS_DIR): Promise<SavedReplay<Config, unknown> | null> {
  if (!EXPERIMENT_ID.test(experimentId)) return null;
  const experiment = await readExperiment(game, dir, experimentId);
  const summary = experiment?.games.find((g) => g.gameNo === gameNo);
  if (!experiment || !summary) return null;
  const moves: unknown[] = [];
  for (const line of (await readText(path.join(dir, experimentId, "moves.jsonl"))).split("\n")) {
    const event = parse(line) as { gameNo?: unknown; moveNo?: unknown; move?: unknown } | null;
    if (event?.gameNo === gameNo && event.move) moves[Number(event.moveNo) - 1] = event.move;
  }
  // A move line can be missing after a failed save. The replay stops before the gap, so every move keeps its number.
  const gap = moves.findIndex((m) => m === undefined);
  return { experimentId, gameNo, first: experiment.first, second: experiment.second, summary, moves: gap < 0 ? moves : moves.slice(0, gap) };
}
