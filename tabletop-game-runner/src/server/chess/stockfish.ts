import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import type { GameLine } from "../../shared/chess/line";

// Stockfish (GPL-3.0) runs as a separate process and speaks UCI over stdin and stdout.
const require = createRequire(import.meta.url);
const ENGINE_PATH = require.resolve("stockfish/bin/stockfish-18-lite-single.js");
// A depth-12 rating takes under 30 ms, so a wait this long means the engine is stuck.
const TIMEOUT_MS = 30_000;

export interface Analysis {
  bestUci: string;
  /** Centipawns for the side to move. Mate scores become large numbers. */
  score: number;
  /** Moves to mate when Stockfish sees one. Negative: the side to move gets mated. */
  mate?: number;
}

/** Mate in n becomes 10000 - 10n, so faster mates score higher. Same scale as the chess research pilot. */
function toCentipawns(kind: string, value: number): number {
  if (kind === "cp") return value;
  return value > 0 ? 10_000 - value * 10 : -10_000 - value * 10;
}

export class Stockfish {
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private lines: string[] = [];
  private waiter: { pattern: RegExp; resolve: (lines: string[]) => void; reject: (error: Error) => void } | null = null;
  // One command at a time: grading and the Stockfish player share the process.
  private queue: Promise<unknown> = Promise.resolve();

  /** `args` start the engine with Node. Tests pass a fake engine. */
  constructor(
    private readonly args: string[] = [ENGINE_PATH],
    private readonly timeoutMs = TIMEOUT_MS,
  ) {}

  private start(): Promise<void> {
    const proc = spawn(process.execPath, this.args);
    this.process = proc;
    this.buffer = "";
    this.lines = [];
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      if (this.process !== proc) return;
      this.buffer += chunk;
      let newline: number;
      while ((newline = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        this.lines.push(line);
        if (this.waiter?.pattern.test(line)) {
          const { resolve } = this.waiter;
          this.waiter = null;
          resolve(this.lines.splice(0));
        }
      }
    });
    proc.on("exit", (code, signal) => this.stop(proc, new Error(`Stockfish stopped (${signal ?? `exit code ${code}`}).`)));
    proc.on("error", (error) => this.stop(proc, error));
    proc.stdin.on("error", (error) => this.stop(proc, error));
    this.send("uci");
    return this.until(/^uciok/).then(() => undefined);
  }

  /** Ends `proc` and fails the task that waits for it, so the queue moves on. The next task starts a fresh engine. */
  private stop(proc: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.process !== proc) return;
    this.process = null;
    proc.kill();
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.reject(error);
  }

  private send(command: string): void {
    this.process!.stdin.write(command + "\n");
  }

  private until(pattern: RegExp): Promise<string[]> {
    const proc = this.process!;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.stop(proc, new Error(`Stockfish gave no answer within ${this.timeoutMs / 1000} s.`)), this.timeoutMs);
      this.waiter = {
        pattern,
        resolve: (lines) => {
          clearTimeout(timer);
          resolve(lines);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
    });
  }

  /** Runs `task` after every earlier task has finished. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      if (!this.process) await this.start();
      return task();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Searches the position after `line` to `depth`. With `onlyMove`, the search is limited to that one move.
   * Stockfish gets the moves too, so it sees repetitions.
   */
  analyse(line: GameLine, depth: number, onlyMove?: string): Promise<Analysis> {
    return this.enqueue(async () => {
      // An empty hash table for every search, so the same position and depth always give the same result.
      this.send("ucinewgame");
      this.send("isready");
      await this.until(/^readyok/);
      this.lines = [];
      this.send(`position ${line.start ? `fen ${line.start}` : "startpos"}${line.moves.length ? ` moves ${line.moves.join(" ")}` : ""}`);
      this.send(`go depth ${depth}${onlyMove ? ` searchmoves ${onlyMove}` : ""}`);
      const lines = await this.until(/^bestmove/);
      let score = 0;
      let mate: number | undefined;
      for (const line of lines) {
        const m = line.match(/^info depth (\d+) .*score (cp|mate) (-?\d+)/);
        if (!m) continue;
        score = toCentipawns(m[2]!, Number(m[3]));
        mate = m[2] === "mate" ? Number(m[3]) : undefined;
      }
      const bestUci = lines.at(-1)!.split(/\s+/)[1]!;
      return mate === undefined ? { bestUci, score } : { bestUci, score, mate };
    });
  }
}

export const stockfish = new Stockfish();
