import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PuzzleLogEvent } from "../shared/chess/puzzles";
import type { ChessLogEvent } from "../shared/chess/types";
import type { LogEvent } from "../shared/types";
import { appendLine } from "./files";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const EXPERIMENTS_DIR = path.join(PROJECT_ROOT, "data", "experiments");
export const PUZZLES_DIR = path.join(PROJECT_ROOT, "data", "puzzles");

export const EXPERIMENT_ID = /^[A-Za-z0-9_-]{1,160}$/;

/**
 * One folder per experiment:
 * experiment.json (settings and prompts), moves.jsonl and games.jsonl (one JSON object per line).
 */
export async function saveEvent(event: LogEvent | ChessLogEvent, extraHeader: Record<string, unknown>): Promise<string> {
  if (!EXPERIMENT_ID.test(event.experimentId)) throw new Error(`Invalid experiment id: ${event.experimentId}`);
  const dir = path.join(EXPERIMENTS_DIR, event.experimentId);
  await mkdir(dir, { recursive: true });
  switch (event.type) {
    case "experiment":
      await writeFile(path.join(dir, "experiment.json"), JSON.stringify({ ...event, ...extraHeader }, null, 2) + "\n");
      break;
    case "move":
      await appendLine(path.join(dir, "moves.jsonl"), JSON.stringify(event));
      break;
    case "game":
      await appendLine(path.join(dir, "games.jsonl"), JSON.stringify(event));
      break;
  }
  return path.relative(PROJECT_ROOT, dir);
}

/** One folder per puzzle run: run.json (the player and the set) and results.jsonl (one attempt per line). */
export async function savePuzzleEvent(event: PuzzleLogEvent, extraHeader: Record<string, unknown>, root = PUZZLES_DIR): Promise<string> {
  if (!EXPERIMENT_ID.test(event.runId)) throw new Error(`Invalid run id: ${event.runId}`);
  const dir = path.join(root, event.runId);
  await mkdir(dir, { recursive: true });
  if (event.type === "puzzle-run") await writeFile(path.join(dir, "run.json"), JSON.stringify({ ...event, ...extraHeader }, null, 2) + "\n");
  else await appendLine(path.join(dir, "results.jsonl"), JSON.stringify(event));
  return path.relative(PROJECT_ROOT, dir);
}
