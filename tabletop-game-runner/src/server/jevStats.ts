import { stat } from "node:fs/promises";
import path from "node:path";
import type { ChessPlayerSetup } from "../shared/chess/types";
import { TOP_GAMES, type ConfigSpend, type DaySpend, type GameSpend, type GameTypeSpend, type JevSpend, type JevStats } from "../shared/jevStats";
import { PUZZLE_SETS } from "../shared/chess/puzzles";
import { chessConfig, configKey, type GameName } from "../shared/matchups";
import type { PlayerSetup } from "../shared/types";
import { listDirs, parse, readText } from "./files";
import { readExperiment } from "./matchups";
import { readPuzzleRuns } from "./puzzles";
import { EXPERIMENTS_DIR, PUZZLES_DIR } from "./store";

type Config = PlayerSetup | ChessPlayerSetup;

const JEV_KINDS = new Set<string>(["jev-lookahead", "jev-direct", "jev", "jev-all"]);

/** How saved moves name the first mover: X, or White. */
const FIRST_SIDES = new Set(["X", "w"]);

/** The fields of a saved move of either game that the statistics read. */
interface SavedMoveFields {
  player?: string;
  color?: string;
  source?: string;
  decision?: { stats?: { inputTokens?: number; jevRequests?: number } };
}

interface SavedGame {
  /** Jev use of the first and the second mover. */
  sides: [JevSpend, JevSpend];
  at: string;
  finished: boolean;
  /** Every saved move of both sides. */
  allMoves: number;
}

interface ExperimentSpend {
  game: GameName;
  experimentId: string;
  first: Config;
  second: Config;
  games: Map<number, SavedGame>;
  days: Map<string, DaySpend>;
}

const empty = (): JevSpend => ({ tokens: 0, requests: 0, moves: 0 });
const noGames = () => ({ games: 0, tokens: 0, allMoves: 0 });

function addTo(target: JevSpend, spend: JevSpend): void {
  target.tokens += spend.tokens;
  target.requests += spend.requests;
  target.moves += spend.moves;
}

/** The local date of an ISO time, for example "2026-10-15". */
function dayOf(at: string): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Reading every saved move takes a while, so an experiment is read again only when its files change.
const cache = new Map<string, { stamp: string; spend: ExperimentSpend | null }>();

async function stampOf(folder: string): Promise<string> {
  const stamps = await Promise.all(
    ["moves.jsonl", "games.jsonl"].map(async (file) => {
      try {
        const s = await stat(path.join(folder, file));
        return `${s.mtimeMs}:${s.size}`;
      } catch {
        return "-";
      }
    }),
  );
  return stamps.join("/");
}

async function readExperimentSpend(dir: string, name: string): Promise<ExperimentSpend | null> {
  const folder = path.join(dir, name);
  const stamp = await stampOf(folder);
  const cached = cache.get(folder);
  if (cached?.stamp === stamp) return cached.spend;
  const spend = await readSpend(dir, name);
  cache.set(folder, { stamp, spend });
  return spend;
}

/** The Jev use of every saved game in one experiment folder, or `null` for a folder that is not an experiment. */
async function readSpend(dir: string, name: string): Promise<ExperimentSpend | null> {
  let game: GameName = "chess";
  let experiment = await readExperiment(game, dir, name);
  if (!experiment) {
    game = "tictactoe";
    experiment = await readExperiment(game, dir, name);
  }
  if (!experiment) return null;
  const finished = new Set(experiment.games.map((g) => g.gameNo));
  const games = new Map<number, SavedGame>();
  const days = new Map<string, DaySpend>();
  for (const line of (await readText(path.join(dir, name, "moves.jsonl"))).split("\n")) {
    const event = parse(line) as { gameNo?: unknown; at?: unknown; move?: SavedMoveFields } | null;
    if (typeof event?.gameNo !== "number" || !event.move) continue;
    const { move } = event;
    const tokens = move.decision?.stats?.inputTokens ?? 0;
    const requests = move.decision?.stats?.jevRequests ?? 0;
    const at = typeof event.at === "string" ? event.at : "";
    const saved = games.get(event.gameNo) ?? { sides: [empty(), empty()], at, finished: finished.has(event.gameNo), allMoves: 0 };
    saved.allMoves++;
    addTo(saved.sides[FIRST_SIDES.has(move.player ?? move.color ?? "") ? 0 : 1], { tokens, requests, moves: JEV_KINDS.has(move.source ?? "") ? 1 : 0 });
    if (at > saved.at) saved.at = at;
    games.set(event.gameNo, saved);
    if (at && (tokens || requests)) {
      const day = days.get(dayOf(at)) ?? { day: dayOf(at), tokens: 0, requests: 0 };
      day.tokens += tokens;
      day.requests += requests;
      days.set(day.day, day);
    }
  }
  return { game, experimentId: name, first: experiment.first, second: experiment.second, games, days };
}

/** Adds up the Jev use of every saved game of both games and of every puzzle run: per game, per Jev configuration, per game played and per day. */
export async function readJevStats(dir = EXPERIMENTS_DIR, puzzlesDir = PUZZLES_DIR): Promise<JevStats> {
  const experiments = await Promise.all((await listDirs(dir)).map((name) => readExperimentSpend(dir, name)));
  const total = empty();
  const games = new Map<GameTypeSpend["game"], GameTypeSpend>();
  const configs = new Map<string, ConfigSpend>();
  const played: GameSpend[] = [];
  const days = new Map<string, DaySpend>();
  for (const e of experiments) {
    if (!e) continue;
    const sides = [e.first, e.second];
    const jev = sides.map((config) => JEV_KINDS.has(config.kind));
    if (!jev.some(Boolean)) continue;
    const gameType = games.get(e.game) ?? { game: e.game, ...empty(), finished: noGames() };
    games.set(e.game, gameType);
    for (const [gameNo, saved] of e.games) {
      const spend = empty();
      saved.sides.forEach((side) => addTo(spend, side));
      addTo(total, spend);
      addTo(gameType, spend);
      if (saved.finished) {
        gameType.finished.games++;
        gameType.finished.tokens += spend.tokens;
        gameType.finished.allMoves += saved.allMoves;
      }
      sides.forEach((config, i) => {
        if (!jev[i]) return;
        const key = `${e.game}\n${configKey(config)}`;
        const entry = configs.get(key) ?? ({ game: e.game, config, ...empty(), finished: noGames() } as ConfigSpend);
        configs.set(key, entry);
        addTo(entry, saved.sides[i]!);
        if (saved.finished) {
          entry.finished.games++;
          entry.finished.tokens += saved.sides[i]!.tokens;
          entry.finished.allMoves += saved.allMoves;
        }
      });
      played.push({ game: e.game, first: e.first, second: e.second, experimentId: e.experimentId, gameNo, at: saved.at, finished: saved.finished, ...spend } as GameSpend);
    }
    for (const day of e.days.values()) {
      const entry = days.get(day.day) ?? { day: day.day, tokens: 0, requests: 0 };
      entry.tokens += day.tokens;
      entry.requests += day.requests;
      days.set(day.day, entry);
    }
  }
  const addDay = (at: string, tokens: number, requests: number) => {
    if (!at || !(tokens || requests)) return;
    const entry = days.get(dayOf(at)) ?? { day: dayOf(at), tokens: 0, requests: 0 };
    entry.tokens += tokens;
    entry.requests += requests;
    days.set(entry.day, entry);
  };
  // Each puzzle attempt counts as one finished game of its player.
  for (const set of PUZZLE_SETS) {
    for (const run of await readPuzzleRuns(set.name, puzzlesDir)) {
      if (!JEV_KINDS.has(run.setup.kind)) continue;
      const config = chessConfig(run.setup);
      const key = `puzzles\n${configKey(config)}`;
      const entry = configs.get(key) ?? ({ game: "puzzles", config, ...empty(), finished: noGames() } as ConfigSpend);
      configs.set(key, entry);
      const gameType = games.get("puzzles") ?? { game: "puzzles", ...empty(), finished: noGames() };
      games.set("puzzles", gameType);
      for (const attempt of run.attempts) {
        const spend = { tokens: attempt.tokens, requests: attempt.requests, moves: attempt.steps.length };
        for (const target of [total, gameType, entry]) addTo(target, spend);
        for (const target of [gameType.finished, entry.finished]) {
          target.games++;
          target.tokens += attempt.tokens;
          target.allMoves += attempt.steps.length;
        }
        addDay(attempt.at, attempt.tokens, attempt.requests);
      }
    }
  }
  return {
    total,
    games: [...games.values()].sort((a, b) => b.tokens - a.tokens),
    configs: [...configs.values()].sort((a, b) => b.tokens - a.tokens),
    top: played
      .filter((g) => g.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, TOP_GAMES),
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}
