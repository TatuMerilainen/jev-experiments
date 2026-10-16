import path from "node:path";
import {
  puzzleSet,
  type PuzzleAttemptSummary,
  type PuzzleLogEvent,
  type PuzzleResultEvent,
  type PuzzleRun,
  type PuzzleRunEvent,
} from "../shared/chess/puzzles";
import { listDirs, parse, readText } from "./files";
import { HttpError } from "./http-error";
import { EXPERIMENT_ID, PUZZLES_DIR } from "./store";

export function parsePuzzleEvent(body: unknown): PuzzleLogEvent {
  const event = (body ?? {}) as { type?: unknown; runId?: unknown; set?: unknown; setup?: { kind?: unknown }; puzzleId?: unknown; steps?: unknown };
  if (event.type !== "puzzle-run" && event.type !== "puzzle") throw new HttpError(400, "type must be puzzle-run or puzzle.");
  if (typeof event.runId !== "string" || !EXPERIMENT_ID.test(event.runId)) {
    throw new HttpError(400, "runId may only contain letters, digits, '-' and '_'.");
  }
  const set = typeof event.set === "string" ? puzzleSet(event.set) : undefined;
  if (!set) throw new HttpError(400, "set must name a known puzzle set.");
  if (event.type === "puzzle-run" && typeof event.setup?.kind !== "string") throw new HttpError(400, "setup must be a player setup.");
  if (event.type === "puzzle") {
    if (!set.puzzles.some((p) => p.id === event.puzzleId)) throw new HttpError(400, "puzzleId must be a puzzle of the set.");
    if (!Array.isArray(event.steps)) throw new HttpError(400, "steps must be an array.");
  }
  return event as unknown as PuzzleLogEvent;
}

export function parsePuzzleSetName(url: string): string {
  const name = new URL(url, "http://localhost").searchParams.get("set") ?? "";
  if (!puzzleSet(name)) throw new HttpError(400, "set must name a known puzzle set.");
  return name;
}

async function readRunHeader(dir: string, runId: string): Promise<PuzzleRunEvent | null> {
  const header = parse(await readText(path.join(dir, runId, "run.json"))) as Partial<PuzzleRunEvent> | null;
  return header?.type === "puzzle-run" && header.setup ? (header as PuzzleRunEvent) : null;
}

async function readResults(dir: string, runId: string): Promise<PuzzleResultEvent[]> {
  const results: PuzzleResultEvent[] = [];
  for (const line of (await readText(path.join(dir, runId, "results.jsonl"))).split("\n")) {
    const event = parse(line) as Partial<PuzzleResultEvent> | null;
    if (event?.type === "puzzle" && typeof event.puzzleId === "string" && Array.isArray(event.steps)) results.push(event as PuzzleResultEvent);
  }
  return results;
}

const summary = (r: PuzzleResultEvent): PuzzleAttemptSummary => ({
  puzzleId: r.puzzleId,
  solved: r.solved === true,
  at: r.at,
  steps: r.steps.map((s) => ({ correct: s.correct, inCandidates: s.inCandidates ?? null, roundTripMs: s.roundTripMs ?? 0 })),
  tokens: r.steps.reduce((sum, s) => sum + (s.decision?.stats.inputTokens ?? 0), 0),
  requests: r.steps.reduce((sum, s) => sum + (s.decision?.stats.jevRequests ?? 0), 0),
});

/** Every saved run of one puzzle set, with its attempts but without the decisions. */
export async function readPuzzleRuns(set: string, dir = PUZZLES_DIR): Promise<PuzzleRun[]> {
  const runs = await Promise.all(
    (await listDirs(dir)).map(async (runId): Promise<PuzzleRun | null> => {
      const header = await readRunHeader(dir, runId);
      if (!header || header.set !== set) return null;
      const attempts = (await readResults(dir, runId)).map(summary);
      return attempts.length ? { runId, at: header.at, setup: header.setup, attempts } : null;
    }),
  );
  return runs.filter((r): r is PuzzleRun => r !== null).sort((a, b) => a.at.localeCompare(b.at));
}

/** One saved attempt with all its decisions, or `null` when there is none. A run tries each puzzle once; the last line wins. */
export async function readPuzzleAttempt(runId: string, puzzleId: string, dir = PUZZLES_DIR): Promise<{ run: PuzzleRunEvent; result: PuzzleResultEvent } | null> {
  if (!EXPERIMENT_ID.test(runId)) return null;
  const run = await readRunHeader(dir, runId);
  const result = run && (await readResults(dir, runId)).findLast((r) => r.puzzleId === puzzleId);
  return run && result ? { run, result } : null;
}
