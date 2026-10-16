import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readJevStats } from "../src/server/jevStats";

const player = (kind: string, model = "jev-1.14.0") => ({ kind, depth: 2, lines: true, instructions: null, model });
const chessPlayer = (kind: string) => ({ kind, depth: 2, board: true, safety: true, instructions: null, model: "jev-1.13.0" });

const move = (gameNo: number, side: Record<string, string>, source: string, inputTokens: number, jevRequests: number, at = "2026-10-15T09:00:00Z") =>
  JSON.stringify({ type: "move", gameNo, at, move: { ...side, source, decision: { stats: { inputTokens, jevRequests } } } });

describe("Jev statistics", () => {
  let dir: string;
  const experiment = async (name: string, header: object, moves: string[], games: string[]) => {
    await mkdir(path.join(dir, name));
    await writeFile(path.join(dir, name, "experiment.json"), JSON.stringify(header));
    await writeFile(path.join(dir, name, "moves.jsonl"), moves.join("\n") + "\n");
    if (games.length) await writeFile(path.join(dir, name, "games.jsonl"), games.join("\n") + "\n");
  };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jev-stats-"));
    // Game 1 is finished. Game 2 stopped after two moves.
    await experiment(
      "ttt",
      { settings: { players: { X: player("jev-direct"), O: player("random") } } },
      [
        move(1, { player: "X" }, "jev-direct", 1000, 2),
        move(1, { player: "O" }, "random", 0, 0),
        move(1, { player: "X" }, "jev-direct", 600, 2),
        move(2, { player: "X" }, "jev-direct", 500, 1, "2026-10-16T09:00:00Z"),
        move(2, { player: "O" }, "random", 0, 0, "2026-10-16T09:00:01Z"),
      ],
      [JSON.stringify({ gameNo: 1, result: "X" })],
    );
    await experiment(
      "chess",
      { game: "chess", settings: { players: { w: chessPlayer("jev"), b: chessPlayer("jev") } } },
      [move(1, { color: "w" }, "jev", 3000, 1), move(1, { color: "b" }, "jev", 2000, 1), move(1, { color: "w" }, "jev", 0, 0)],
      [JSON.stringify({ gameNo: 1, result: "1-0" })],
    );
    // No Jev player, so it is left out.
    await experiment("no-jev", { settings: { players: { X: player("perfect"), O: player("random") } } }, [move(1, { player: "X" }, "perfect", 0, 0)], []);
  });

  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("add up the tokens, requests and Jev moves of every saved game", async () => {
    const stats = await readJevStats(dir, path.join(dir, "no-puzzles"));
    expect(stats.total).toEqual({ tokens: 7100, requests: 7, moves: 6 });
    expect(stats.games.map((g) => [g.game, g.tokens])).toEqual([
      ["chess", 5000],
      ["tictactoe", 2100],
    ]);
  });

  it("count only finished games in the cost per game", async () => {
    const ttt = (await readJevStats(dir, path.join(dir, "no-puzzles"))).games.find((g) => g.game === "tictactoe");
    expect(ttt?.finished).toEqual({ games: 1, tokens: 1600, allMoves: 3 });
  });

  it("count a configuration on both sides once per side", async () => {
    const chess = (await readJevStats(dir, path.join(dir, "no-puzzles"))).configs.find((c) => c.game === "chess");
    expect(chess).toMatchObject({ tokens: 5000, requests: 2, moves: 3, finished: { games: 2, tokens: 5000, allMoves: 6 } });
    expect(chess?.config).toMatchObject({ kind: "jev", model: "jev-1.13.0" });
  });

  it("list the most expensive games first, with unfinished ones marked", async () => {
    const { top } = await readJevStats(dir, path.join(dir, "no-puzzles"));
    expect(top.map((g) => [g.experimentId, g.gameNo, g.tokens, g.finished])).toEqual([
      ["chess", 1, 5000, true],
      ["ttt", 1, 1600, true],
      ["ttt", 2, 500, false],
    ]);
  });

  it("add up the tokens per day", async () => {
    const { days } = await readJevStats(dir, path.join(dir, "no-puzzles"));
    expect(days.map((d) => d.tokens)).toEqual([6600, 500]);
  });

  it("read a changed experiment again", async () => {
    await writeFile(path.join(dir, "ttt", "moves.jsonl"), move(1, { player: "X" }, "jev-direct", 40, 1) + "\n");
    const ttt = (await readJevStats(dir, path.join(dir, "no-puzzles"))).games.find((g) => g.game === "tictactoe");
    expect(ttt?.tokens).toBe(40);
  });
});

describe("Jev statistics with puzzles", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jev-stats-puzzles-"));
    const setup = { ...chessPlayer("jev"), version: 2 };
    await mkdir(path.join(dir, "run"));
    await writeFile(path.join(dir, "run", "run.json"), JSON.stringify({ type: "puzzle-run", runId: "run", at: "2026-10-16T09:00:00Z", set: "lichess-10", setup }));
    const step = (inputTokens: number) => ({ expected: "a1a2", played: "a1a2", san: "Ra2", correct: true, inCandidates: true, roundTripMs: 5, decision: { stats: { inputTokens, jevRequests: 1 } } });
    const result = (puzzleId: string, steps: object[]) =>
      JSON.stringify({ type: "puzzle", runId: "run", at: "2026-10-16T09:00:00Z", set: "lichess-10", puzzleId, puzzleNo: 1, solved: true, steps });
    await writeFile(path.join(dir, "run", "results.jsonl"), [result("0OZEr", [step(800)]), result("03vYY", [step(700), step(500)])].join("\n") + "\n");
  });

  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("count each puzzle attempt as one finished game of its player", async () => {
    const stats = await readJevStats(path.join(dir, "no-games"), dir);
    expect(stats.total).toEqual({ tokens: 2000, requests: 3, moves: 3 });
    expect(stats.games).toEqual([{ game: "puzzles", tokens: 2000, requests: 3, moves: 3, finished: { games: 2, tokens: 2000, allMoves: 3 } }]);
    expect(stats.configs[0]).toMatchObject({ game: "puzzles", config: { kind: "jev" }, finished: { games: 2 } });
    // The saved version number is ignored.
    expect(stats.configs[0]!.config).not.toHaveProperty("version");
  });
});
