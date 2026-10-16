import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decideChess } from "../src/server/chess/bots";
import { HttpError } from "../src/server/http-error";
import { parsePuzzleEvent, readPuzzleAttempt, readPuzzleRuns } from "../src/server/puzzles";
import { savePuzzleEvent } from "../src/server/store";
import { endsPuzzle, isCorrect, lineAt, puzzleSet, solverColor, solverMoves, type Puzzle, type PuzzleResultEvent, type PuzzleRun } from "../src/shared/chess/puzzles";
import type { ChessPlayerSetup } from "../src/shared/chess/types";
import { initialPuzzleState, puzzleReducer, runDone, type PuzzleRunState } from "../src/web/puzzles/puzzleRun";
import { scorePlayers } from "../src/web/puzzles/scoreboard";

const set = puzzleSet("lichess-10")!;
const code: ChessPlayerSetup & { kind: "code" } = { kind: "code", depth: 2, board: true, safety: true, instructions: null, model: "jev-1.14.0" };
// Two rooks on the open back rank: Rc8 and Rd8 both give checkmate.
const twoMates: Puzzle = { ...set.puzzles[0]!, id: "test", fen: "7k/p5pp/8/8/8/8/5PPP/2RR2K1 b - - 0 1", moves: ["a7a6", "c1c8"] };

describe("puzzle rules", () => {
  it("accept the full solution of every puzzle in the set", () => {
    for (const p of set.puzzles) {
      const moves = solverMoves(p);
      moves.forEach((uci, step) => {
        expect(isCorrect(p, step, uci)).toBe(true);
        expect(endsPuzzle(p, step, uci)).toBe(step === moves.length - 1);
      });
    }
  });

  it("give the solver the colour that does not move in the FEN", () => {
    expect(solverColor(twoMates)).toBe("w");
    expect(lineAt(twoMates, 0)).toEqual({ start: twoMates.fen, moves: ["a7a6"] });
  });

  it("accept another move that gives checkmate, and reject other moves", () => {
    expect(isCorrect(twoMates, 0, "d1d8")).toBe(true);
    expect(endsPuzzle(twoMates, 0, "d1d8")).toBe(true);
    expect(isCorrect(twoMates, 0, "g2g3")).toBe(false);
    expect(isCorrect(twoMates, 0, "a1a8")).toBe(false);
  });
});

describe("puzzle run", () => {
  const solve = (state: PuzzleRunState, uci: string) => puzzleReducer(state, { type: "move", uci, san: uci, roundTripMs: 10 });
  const advance = (state: PuzzleRunState) => puzzleReducer(state, { type: "advance" });

  it("records an attempt when the last solution move is played, then opens the next puzzle", () => {
    let state = initialPuzzleState({ set: "lichess-10", player: code, delayMs: 0, continuous: false });
    const first = set.puzzles[0]!;
    state = solve(state, solverMoves(first)[0]!);
    expect(state.showingMove).toBe(true);
    expect(state.results).toHaveLength(solverMoves(first).length === 1 ? 1 : 0);
    for (let step = 1; step < solverMoves(first).length; step++) state = solve(advance(state), solverMoves(first)[step]!);
    expect(state.results.at(-1)).toMatchObject({ puzzleId: first.id, solved: true, puzzleNo: 1 });
    state = advance(state);
    expect(state).toMatchObject({ index: 1, step: 0, steps: [], showingMove: false });
  });

  it("plays the opponent's reply after a right move that is not the last one", () => {
    const index = set.puzzles.findIndex((p) => solverMoves(p).length > 1);
    let state: PuzzleRunState = { ...initialPuzzleState({ set: "lichess-10", player: code, delayMs: 0, continuous: false }), index };
    state = advance(solve(state, solverMoves(set.puzzles[index]!)[0]!));
    expect(state).toMatchObject({ index, step: 1, showingMove: false });
    expect(state.results).toHaveLength(0);
  });

  it("ends a puzzle at the first wrong move, and the run after the last puzzle", () => {
    let state: PuzzleRunState = { ...initialPuzzleState({ set: "lichess-10", player: code, delayMs: 0, continuous: false }), index: set.puzzles.length - 1, running: true };
    const last = set.puzzles.at(-1)!;
    // Not the solution, and no checkmate.
    const wrong = "a1a2";
    state = solve(state, wrong);
    expect(state.results.at(-1)).toMatchObject({ puzzleId: last.id, solved: false });
    expect(state.results.at(-1)!.steps[0]).toMatchObject({ played: wrong, correct: false });
    state = advance(state);
    expect(runDone(state)).toBe(true);
    expect(state.running).toBe(false);
  });

  it("starts a new run after the last puzzle with continuous play", () => {
    const settings = { set: "lichess-10", player: code, delayMs: 0, continuous: true };
    let state: PuzzleRunState = { ...initialPuzzleState(settings), index: set.puzzles.length - 1, running: true };
    const runId = state.runId;
    state = advance(solve(state, "a1a2"));
    expect(state).toMatchObject({ index: 0, step: 0, results: [], running: true });
    expect(state.runId).not.toBe(runId);
    // Paused at the end, the run stays done.
    state = { ...initialPuzzleState(settings), index: set.puzzles.length - 1, running: false };
    expect(runDone(advance(solve(state, "a1a2")))).toBe(true);
  });
});

describe("saved puzzle runs", () => {
  let dir: string;
  const setup = code;
  const result = (runId: string, puzzleId: string, solved: boolean, tokens = 0): PuzzleResultEvent => ({
    type: "puzzle",
    runId,
    at: "2026-10-16T09:00:00Z",
    set: "lichess-10",
    puzzleId,
    puzzleNo: 1,
    solved,
    steps: [{ expected: "a1a2", played: solved ? "a1a2" : "b1b2", san: "x", correct: solved, inCandidates: true, roundTripMs: 20 }].map((s) => ({
      ...s,
      ...(tokens ? { decision: { stats: { inputTokens: tokens, jevRequests: 1 } } as never } : {}),
    })),
  });

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "puzzles-"));
    for (const [runId, at] of [
      ["run-a", "2026-10-16T09:00:00Z"],
      ["run-b", "2026-10-16T10:00:00Z"],
    ] as const) {
      await savePuzzleEvent({ type: "puzzle-run", runId, at, set: "lichess-10", setup }, {}, dir);
    }
    await savePuzzleEvent(result("run-a", "0OZEr", true, 700), {}, dir);
    await savePuzzleEvent(result("run-a", "03vYY", false, 900), {}, dir);
    await savePuzzleEvent(result("run-b", "0OZEr", false, 700), {}, dir);
  });

  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("read every run of the set with its attempts", async () => {
    const runs = await readPuzzleRuns("lichess-10", dir);
    expect(runs.map((r) => [r.runId, r.attempts.length])).toEqual([
      ["run-a", 2],
      ["run-b", 1],
    ]);
    expect(runs[0]!.attempts[0]).toMatchObject({ puzzleId: "0OZEr", solved: true, tokens: 700, requests: 1 });
    expect(await readPuzzleRuns("other-set", dir)).toEqual([]);
  });

  it("open one attempt with its steps", async () => {
    const attempt = await readPuzzleAttempt("run-a", "03vYY", dir);
    expect(attempt?.result).toMatchObject({ puzzleId: "03vYY", solved: false });
    expect(await readPuzzleAttempt("run-a", "missing", dir)).toBeNull();
    expect(await readPuzzleAttempt("../x", "03vYY", dir)).toBeNull();
  });

  it("count every run on the scoreboard, and a puzzle once when any run solved it", async () => {
    const runs: PuzzleRun[] = await readPuzzleRuns("lichess-10", dir);
    const [score] = scorePlayers(runs, set.puzzles);
    expect(score).toMatchObject({ runs: 2, solved: 1, attempts: 3, attemptsSolved: 1, firstMoveRight: 1, tokens: 2300 });
    expect(score!.cells.get("0OZEr")).toEqual({ attempts: 2, solved: 1, latestRunId: "run-b" });
  });

  it("rank by the share of attempts solved, so many runs do not lift a weak player", () => {
    const run = (runId: string, kind: "random" | "code", solved: string[]): PuzzleRun => ({
      runId,
      at: "2026-10-16T09:00:00Z",
      setup: { ...code, kind },
      attempts: set.puzzles.map((p) => ({ puzzleId: p.id, solved: solved.includes(p.id), at: "", steps: [], tokens: 0, requests: 0 })),
    });
    const [a, b, c] = set.puzzles.map((p) => p.id);
    // Random solves 3 puzzles at least once in 20 runs. Code solves 2 in its only run.
    const randomRuns = Array.from({ length: 20 }, (_, i) => run(`random-${i}`, "random", i === 0 ? [a!] : i === 1 ? [b!] : i === 2 ? [c!] : []));
    const scores = scorePlayers([...randomRuns, run("code-0", "code", [a!, b!])], set.puzzles);
    expect(scores.map((s) => [s.setup.kind, s.solved])).toEqual([
      ["code", 2],
      ["random", 3],
    ]);
  });

  it("reject events with a bad run id, set or puzzle", () => {
    const status = (body: object) => {
      try {
        parsePuzzleEvent(body);
        return 200;
      } catch (e) {
        return e instanceof HttpError ? e.status : 500;
      }
    };
    expect(status(result("run-a", "0OZEr", true))).toBe(200);
    expect(status({ ...result("run-a", "0OZEr", true), runId: "../x" })).toBe(400);
    expect(status({ ...result("run-a", "0OZEr", true), set: "nope" })).toBe(400);
    expect(status(result("run-a", "not-in-set", true))).toBe(400);
  });
});

describe("a puzzle move from the code search", () => {
  it("starts from the puzzle FEN after the opponent's first move", async () => {
    const mateInOne = set.puzzles.find((p) => p.themes.includes("mateIn1"))!;
    const decision = await decideChess(lineAt(mateInOne, 0), code, {
      client: () => {
        throw new Error("No Jev client in this test");
      },
    });
    expect(isCorrect(mateInOne, 0, decision.uci)).toBe(true);
  });
});
