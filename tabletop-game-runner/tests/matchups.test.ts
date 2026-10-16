import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readGames, readMatchups, readReplay } from "../src/server/matchups";
import type { ChessPlayerSetup } from "../src/shared/chess/types";
import type { PlayerSetup } from "../src/shared/types";
import { RECENT_GAMES } from "../src/shared/replays";
import { allMatchups, chessConfig, configKey, scoreInOrder, scoreOf, tictactoeConfig, type MatchupRecord } from "../src/shared/matchups";
import { chessSetupLabel } from "../src/web/chess/chessFormat";
import { DEFAULT_SPLITS } from "../src/web/components/MatchupPanel";
import { setupLabel } from "../src/web/format";

const chess = (kind: ChessPlayerSetup["kind"], depth = 2, extra: Partial<ChessPlayerSetup> = {}): ChessPlayerSetup => ({
  kind,
  depth,
  board: true,
  safety: true,
  instructions: null,
  model: "jev-1.14.0",
  ...extra,
});
const key = (s: ChessPlayerSetup) => configKey(chessConfig(s));

describe("configuration keys", () => {
  it("ignore the settings a player type does not use", () => {
    expect(key(chess("random", 1))).toBe(key(chess("random", 3, { board: false, instructions: "x" })));
    expect(key(chess("jev-all", 1))).toBe(key(chess("jev-all", 3)));
    expect(key(chess("stockfish", 5, { safety: false }))).toBe(key(chess("stockfish", 5)));
    expect(configKey(tictactoeConfig(({ kind: "perfect", depth: 2, lines: false, instructions: "x", model: "jev-1.13.0" })))).toBe(
      configKey(tictactoeConfig(({ kind: "perfect", depth: 4, lines: true, instructions: null, model: "jev-1.14.0" }))),
    );
  });

  it("keep the settings that change how a player plays", () => {
    expect(key(chess("jev", 2))).not.toBe(key(chess("jev", 3)));
    expect(key(chess("jev", 2))).not.toBe(key(chess("jev", 2, { safety: false })));
    expect(key(chess("jev", 2))).not.toBe(key(chess("jev", 2, { instructions: "Play fast." })));
    expect(key(chess("stockfish", 5))).not.toBe(key(chess("stockfish", 8)));
  });
});

describe("saved player versions", () => {
  const lookahead: PlayerSetup = { kind: "jev-lookahead", depth: 2, lines: true, instructions: null, model: "jev-1.14.0" };

  it("are ignored, so old and new games of a player count together", () => {
    // Older saved setups can hold a version number.
    const saved = (s: object, version: number) => ({ ...s, version }) as never;
    expect(configKey(tictactoeConfig(saved(lookahead, 1)))).toBe(configKey(tictactoeConfig(lookahead)));
    expect(key(saved(chess("jev"), 2))).toBe(key(chess("jev")));
    expect(setupLabel(tictactoeConfig(saved(lookahead, 1)), true)).toBe("Jev look-ahead, depth 2, jev-1.14.0");
    expect(chessSetupLabel(chessConfig(saved(chess("jev"), 1), { model: false }), true)).toBe("Jev, depth 2");
    expect(DEFAULT_SPLITS.model).toBe(false);
  });
});

describe("models in configuration keys", () => {
  it("keep Jev models apart, and merge them when the model is left out", () => {
    const older = chess("jev", 2, { model: "jev-1.13.0" });
    const newer = chess("jev", 2, { model: "jev-1.14.0" });
    expect(key(older)).not.toBe(key(newer));
    expect(configKey(chessConfig(older, { model: false }))).toBe(configKey(chessConfig(newer, { model: false })));
    const ttt = (model: string) => tictactoeConfig(({ kind: "jev-direct", depth: 2, lines: true, instructions: null, model }), { model: false });
    expect(configKey(ttt("jev-1.13.0"))).toBe(configKey(ttt("jev-1.14.0")));
  });

  it("count a saved Jev setup without a model as jev-1.13.0, the only version used before the setting", () => {
    const { model: _, ...saved } = chess("jev", 2);
    expect(key(saved as ChessPlayerSetup)).toBe(key(chess("jev", 2, { model: "jev-1.13.0" })));
  });

  it("ignore the model of players without Jev", () => {
    expect(key(chess("stockfish", 5, { model: "jev-1.13.0" }))).toBe(key(chess("stockfish", 5)));
  });
});

const record = (first: string, second: string, firstWins: number, secondWins: number, draws: number): MatchupRecord<string> => ({
  first,
  second,
  firstKey: first,
  secondKey: second,
  start: "start",
  firstWins,
  secondWins,
  draws,
});

describe("matchup scores", () => {
  const records = [record("jev", "code", 3, 1, 1), record("code", "jev", 2, 0, 2), record("jev", "jev", 4, 1, 5), record("code", "random", 1, 0, 0)];

  it("add up both colour orders for each configuration", () => {
    expect(scoreOf(records, "jev", "code")).toEqual({ games: 9, wins: [3, 3], draws: 3 });
    expect(scoreOf(records, "code", "jev")).toEqual({ games: 9, wins: [3, 3], draws: 3 });
  });

  it("keep the two orders apart when asked", () => {
    expect(scoreInOrder(records, "jev", "code")).toEqual({ games: 5, wins: [3, 1], draws: 1 });
    expect(scoreInOrder(records, "code", "jev")).toEqual({ games: 4, wins: [2, 0], draws: 2 });
    expect(scoreInOrder(records, "random", "code")).toEqual({ games: 0, wins: [0, 0], draws: 0 });
  });

  it("count one configuration against itself once, with wins by colour", () => {
    expect(scoreOf(records, "jev", "jev")).toEqual({ games: 10, wins: [4, 1], draws: 5 });
  });

  it("return zero games for a pair with no records", () => {
    expect(scoreOf(records, "jev", "random")).toEqual({ games: 0, wins: [0, 0], draws: 0 });
  });

  it("list each pair once, most games first", () => {
    const list = allMatchups(records);
    expect(list.map((m) => [m.aKey, m.bKey, m.score.games])).toEqual([
      ["jev", "jev", 10],
      ["code", "jev", 9],
      ["code", "random", 1],
    ]);
  });
});

describe("reading saved experiments", () => {
  let dir: string;
  const experiment = async (name: string, header: object, games: string[]) => {
    await mkdir(path.join(dir, name));
    await writeFile(path.join(dir, name, "experiment.json"), JSON.stringify(header));
    if (games.length) await writeFile(path.join(dir, name, "games.jsonl"), games.join("\n") + "\n");
  };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "matchups-"));
    const players = (w: ChessPlayerSetup, b: ChessPlayerSetup) => ({ game: "chess", settings: { players: { w, b } } });
    const result = (r: string) => JSON.stringify({ type: "game", result: r });
    await experiment("chess_a", players(chess("jev", 2), chess("stockfish", 5)), [result("1-0"), result("1/2-1/2"), result("0-1")]);
    // The same pair with colours swapped, plus a line cut short.
    await experiment("chess_b", players(chess("stockfish", 5), chess("jev", 2)), [result("0-1"), '{"type":"ga']);
    // No finished games, so no record.
    await experiment("chess_c", players(chess("code", 2), chess("random", 4)), []);
    const tttPlayers = { X: { kind: "perfect", depth: 2, lines: true, instructions: null }, O: { kind: "random", depth: 2, lines: true, instructions: null } };
    await experiment("ttt", { settings: { players: tttPlayers } }, [JSON.stringify({ result: "draw" })]);
    await experiment("ttt_random", { settings: { players: tttPlayers, randomFirst: true } }, [JSON.stringify({ result: "X" }), JSON.stringify({ result: "X" })]);
    const opening = (number: number, name: string) => JSON.stringify({ type: "game", result: "1-0", opening: { number, name } });
    const openingPlayers = { ...players(chess("code", 2), chess("random", 4)), settings: { players: { w: chess("code", 2), b: chess("random", 4) }, randomFirst: false, openings: "opening-set" } };
    await experiment("chess_openings", openingPlayers, [opening(1, "Italian Game: Giuoco Piano"), opening(2, "Ruy Lopez: Morphy Defense")]);
  });

  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("adds up the finished chess games per configuration pair", async () => {
    const records = (await readMatchups("chess", dir)).filter((r) => r.start === "start");
    expect(records).toHaveLength(2);
    expect(scoreOf(records, key(chess("jev", 2)), key(chess("stockfish", 5)))).toEqual({ games: 4, wins: [2, 1], draws: 1 });
  });

  it("keeps the games apart", async () => {
    const records = await readMatchups("tictactoe", dir);
    expect(records.every((r) => "lines" in r.first)).toBe(true);
  });

  it("keeps games with a random first move in their own record, read from the old randomFirst field", async () => {
    const records = await readMatchups("tictactoe", dir);
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.start === "start")).toMatchObject({ firstWins: 0, secondWins: 0, draws: 1 });
    expect(records.find((r) => r.start === "random-first")).toMatchObject({ firstWins: 2, secondWins: 0, draws: 0 });
    const games = await readGames("tictactoe", dir);
    expect(games.map((e) => [e.experimentId, e.start]).sort()).toEqual([
      ["ttt", "start"],
      ["ttt_random", "random-first"],
    ]);
  });

  it("keeps opening set games in their own record, with each game's opening", async () => {
    const records = await readMatchups("chess", dir);
    expect(records.find((r) => r.start === "opening-set")).toMatchObject({ firstWins: 2, secondWins: 0, draws: 0 });
    const games = (await readGames("chess", dir)).find((e) => e.experimentId === "chess_openings")!;
    expect(games.start).toBe("opening-set");
    expect(games.games.map((g) => g.opening)).toEqual(["Italian Game: Giuoco Piano", "Ruy Lopez: Morphy Defense"]);
  });

  it("returns nothing for a missing folder", async () => {
    expect(await readMatchups("chess", path.join(dir, "missing"))).toEqual([]);
  });
});

describe("saved games and replays", () => {
  let dir: string;
  const id = "2026-10-15_10-00-00_X-perfect_O-random_test";

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "replays-"));
    await mkdir(path.join(dir, id));
    const player = (kind: string) => ({ kind, depth: 2, lines: true, instructions: null, model: "jev-1.14.0" });
    await writeFile(path.join(dir, id, "experiment.json"), JSON.stringify({ settings: { players: { X: player("perfect"), O: player("random") } } }));
    // 25 games, so the list has to drop the 5 oldest.
    const games = Array.from({ length: 25 }, (_, i) =>
      JSON.stringify({ type: "game", gameNo: i + 1, at: `2026-10-15T10:00:${String(i).padStart(2, "0")}Z`, result: i % 2 ? "X" : "draw", sequence: ["b2", "a1", "c3"] }),
    );
    await writeFile(path.join(dir, id, "games.jsonl"), games.join("\n") + "\n");
    // Moves of game 2 saved out of order, plus a move of another game. Game 4 lost its second move.
    const move = (gameNo: number, moveNo: number, cell: string) => JSON.stringify({ type: "move", gameNo, moveNo, move: { cell } });
    const lines = [move(2, 2, "a1"), move(2, 1, "b2"), move(3, 1, "c3"), move(2, 3, "c3"), move(4, 1, "b2"), move(4, 3, "c3")];
    await writeFile(path.join(dir, id, "moves.jsonl"), lines.join("\n") + "\n");
  });

  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("list only the newest games of each experiment", async () => {
    const [experiment] = await readGames("tictactoe", dir);
    expect(experiment!.games).toHaveLength(RECENT_GAMES);
    expect(experiment!.games[0]).toMatchObject({ gameNo: 6, winner: "first", moves: 3 });
    expect(experiment!.games.at(-1)).toMatchObject({ gameNo: 25, winner: "draw" });
  });

  it("still count every game in the totals", async () => {
    const [record] = await readMatchups("tictactoe", dir);
    expect(record!.firstWins + record!.draws).toBe(25);
  });

  it("return one game's moves in move order", async () => {
    const replay = await readReplay("tictactoe", id, 2, dir);
    expect(replay?.moves).toEqual([{ cell: "b2" }, { cell: "a1" }, { cell: "c3" }]);
    expect(replay?.summary).toMatchObject({ gameNo: 2, winner: "first" });
  });

  it("stop a replay before a missing move, so the moves keep their numbers", async () => {
    const replay = await readReplay("tictactoe", id, 4, dir);
    expect(replay?.moves).toEqual([{ cell: "b2" }]);
    expect(replay?.summary.moves).toBe(3);
  });

  it("find nothing for an unknown game or a bad folder name", async () => {
    expect(await readReplay("tictactoe", id, 99, dir)).toBeNull();
    expect(await readReplay("tictactoe", "../secret", 1, dir)).toBeNull();
    expect(await readReplay("chess", id, 1, dir)).toBeNull();
  });
});
