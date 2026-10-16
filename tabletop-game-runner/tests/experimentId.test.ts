import { describe, expect, it } from "vitest";
import { EXPERIMENT_ID } from "../src/server/store";
import { CHESS_BOT_KINDS } from "../src/shared/chess/types";
import { BOT_KINDS, JEV_MODELS } from "../src/shared/types";
import { initialChessState, startKind } from "../src/web/chess/chessExperiment";
import { initialState, playsRandomFirst } from "../src/web/experiment";

// The server saves an experiment only when its id passes EXPERIMENT_ID, so every setup must produce a valid id.
describe("experiment ids", () => {
  it("pass the server's rule for every tic-tac-toe setup", () => {
    for (const kind of [...BOT_KINDS, "human" as const])
      for (const model of JEV_MODELS) {
        const player = { kind, depth: 3, lines: false, instructions: "custom", model };
        const id = initialState({ players: { X: player, O: player }, randomFirst: true, delayMs: 0, continuous: false }).experimentId;
        expect(id, id).toMatch(EXPERIMENT_ID);
      }
  });

  it("pass the server's rule for every chess setup", () => {
    for (const kind of [...CHESS_BOT_KINDS, "human" as const])
      for (const model of JEV_MODELS) {
        const player = { kind, depth: kind === "stockfish" ? 12 : 3, board: false, safety: false, instructions: "custom", model };
        const id = initialChessState({ players: { w: player, b: player }, openings: "opening-set", delayMs: 0, continuous: false }).experimentId;
        expect(id, id).toMatch(EXPERIMENT_ID);
      }
  });

  it("name the model of each Jev player", () => {
    const player = (model: string) => ({ kind: "jev-direct" as const, depth: 2, lines: false, instructions: null, model });
    const id = initialState({ players: { X: player("jev-1.13.0"), O: player("jev-1.14.0") }, randomFirst: false, delayMs: 0, continuous: false }).experimentId;
    expect(id).toContain("_X-jev-direct-v1-13-0-grid_O-jev-direct-v1-14-0-grid_");
  });

  it("leave out the random first move when a human moves first", () => {
    const player = (kind: "human" | "perfect") => ({ kind, depth: 2, lines: true, instructions: null, model: "jev-1.14.0" });
    const settings = (first: "human" | "perfect") => ({ players: { X: player(first), O: player("perfect") }, randomFirst: true, delayMs: 0, continuous: false });
    expect(initialState(settings("perfect")).experimentId).toContain("_random-first_");
    expect(initialState(settings("human")).experimentId).not.toContain("random-first");
    expect(playsRandomFirst(settings("human"))).toBe(false);
    const chess = (kind: "human" | "random") => ({ kind, depth: 2, board: true, safety: true, instructions: null, model: "jev-1.14.0" });
    const chessSettings = { players: { w: chess("human"), b: chess("random") }, openings: "random-first" as const, delayMs: 0, continuous: false };
    expect(initialChessState(chessSettings).experimentId).not.toContain("random-first");
    expect(startKind(chessSettings)).toBe("start");
  });

  it("tag the opening set in the chess folder name", () => {
    const chess = (kind: "human" | "random") => ({ kind, depth: 2, board: true, safety: true, instructions: null, model: "jev-1.14.0" });
    const settings = { players: { w: chess("human"), b: chess("random") }, openings: "opening-set" as const, delayMs: 0, continuous: false };
    expect(initialChessState(settings).experimentId).toContain("_openings_");
    expect(startKind(settings)).toBe("opening-set");
  });
});
