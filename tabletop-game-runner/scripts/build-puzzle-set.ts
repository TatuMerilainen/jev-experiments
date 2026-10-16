/**
 * Builds a fixed chess puzzle set from the Lichess puzzle database (CC0): https://database.lichess.org/
 * Usage: npx tsx scripts/build-puzzle-set.ts 10
 *
 * The file is sorted by puzzle id, and the ids are random, so its first rows are a random sample.
 * The script reads only those rows and stops the download early.
 * It needs the zstd command (`brew install zstd`). Node's own zstd stream stops at the start of this file.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { Chess } from "chess.js";

const SOURCE = "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const ROWS_TO_READ = 200_000;
const RATINGS = { min: 700, max: 2500, window: 60 };
const FILTERS = { minPopularity: 80, minPlays: 500, maxRatingDeviation: 90, maxSolverMoves: 4 };
const SEED = 20261016;
const OUT_DIR = path.join(import.meta.dirname, "..", "src", "shared", "chess", "puzzles");

/** The themes that name the idea of a puzzle. The set takes each one once, while it can. */
const IDEAS = [
  "mateIn1", "mateIn2", "mateIn3", "fork", "pin", "skewer", "discoveredAttack", "hangingPiece", "sacrifice",
  "deflection", "attraction", "trappedPiece", "promotion", "zugzwang", "quietMove", "defensiveMove",
];

interface Puzzle {
  id: string;
  /** The position before the opponent's first move. */
  fen: string;
  /** UCI moves: the opponent's move, then the solution with the opponent's replies. */
  moves: string[];
  rating: number;
  ratingDeviation: number;
  popularity: number;
  plays: number;
  themes: string[];
  gameUrl: string;
}

const size = Number(process.argv[2] ?? 10);
if (!Number.isInteger(size) || size < 2) throw new Error("Give the set size as a whole number from 2.");

const random = mulberry32(SEED);
const pool = await readPool();
const chosen: Puzzle[] = [];
const ideasUsed = new Set<string>();
for (let i = 0; i < size; i++) {
  const target = RATINGS.min + ((RATINGS.max - RATINGS.min) * i) / (size - 1);
  const near = pool.filter((p) => Math.abs(p.rating - target) <= RATINGS.window && !chosen.includes(p));
  const fresh = near.filter((p) => p.themes.some((t) => IDEAS.includes(t) && !ideasUsed.has(t)));
  const options = fresh.length ? fresh : near;
  if (!options.length) throw new Error(`No puzzle near rating ${Math.round(target)}. Read more rows.`);
  const puzzle = options[Math.floor(random() * options.length)]!;
  chosen.push(puzzle);
  for (const t of puzzle.themes) if (IDEAS.includes(t)) ideasUsed.add(t);
}

const name = `lichess-${size}`;
await mkdir(OUT_DIR, { recursive: true });
const set = {
  name,
  source: `Lichess puzzle database, ${SOURCE}, CC0`,
  built: new Date().toISOString().slice(0, 10),
  rule: { ...FILTERS, ratings: `${RATINGS.min} to ${RATINGS.max}`, rowsRead: ROWS_TO_READ, seed: SEED },
  puzzles: chosen,
};
await writeFile(path.join(OUT_DIR, `${name}.json`), JSON.stringify(set, null, 2) + "\n");
for (const p of chosen) console.log(p.id, p.rating, p.moves.length / 2, "solver moves", p.themes.join(" "));

/** The puzzles among the first rows that pass the filters and replay legally. */
async function readPool(): Promise<Puzzle[]> {
  const abort = new AbortController();
  const response = await fetch(SOURCE, { signal: abort.signal });
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
  const zstd = spawn("zstd", ["-dc"], { stdio: ["pipe", "pipe", "ignore"] });
  const download = Readable.fromWeb(response.body as ReadableStream);
  // Stopping early aborts the download and closes the pipe, which is expected.
  download.on("error", () => undefined);
  zstd.stdin.on("error", () => undefined);
  download.pipe(zstd.stdin);
  const lines = createInterface({ input: zstd.stdout });
  const puzzles: Puzzle[] = [];
  let rows = 0;
  for await (const line of lines) {
    if (rows++ === 0) continue;
    if (rows > ROWS_TO_READ) break;
    const [id, fen, moves, rating, deviation, popularity, plays, themes, gameUrl] = line.split(",");
    const puzzle: Puzzle = {
      id: id!,
      fen: fen!,
      moves: moves!.split(" "),
      rating: Number(rating),
      ratingDeviation: Number(deviation),
      popularity: Number(popularity),
      plays: Number(plays),
      themes: themes!.split(" "),
      gameUrl: gameUrl!,
    };
    if (passes(puzzle)) puzzles.push(puzzle);
  }
  zstd.kill();
  abort.abort();
  return puzzles;
}

function passes(p: Puzzle): boolean {
  if (p.popularity < FILTERS.minPopularity || p.plays < FILTERS.minPlays || p.ratingDeviation > FILTERS.maxRatingDeviation) return false;
  if (p.moves.length % 2 !== 0 || p.moves.length / 2 > FILTERS.maxSolverMoves) return false;
  try {
    const game = new Chess(p.fen);
    for (const uci of p.moves) game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return true;
  } catch {
    return false;
  }
}

/** A small seeded random generator, so the same seed picks the same puzzles. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
