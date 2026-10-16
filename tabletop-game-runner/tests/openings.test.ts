import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { OPENINGS } from "../src/shared/chess/openings";
import { chessReducer, DEFAULT_CHESS_SETTINGS, endsOpeningRun, gameOpening, initialChessState, nextOpeningMove, type ChessState } from "../src/web/chess/chessExperiment";
import { newChessEvents } from "../src/web/chess/useChessLog";
import { normalizeChessSettings } from "../src/web/savedSettings";

const settings = { ...DEFAULT_CHESS_SETTINGS, openings: "opening-set" as const, continuous: true };
const playOpening = (state: ChessState) => {
  for (let uci = nextOpeningMove(state); uci; uci = nextOpeningMove(state)) {
    state = chessReducer(state, { type: "move", uci, source: "opening", opening: gameOpening(state)!.opening.name });
  }
  return state;
};
// Fool's mate: Black mates on move 2.
const FOOLS_MATE = ["f2f3", "e7e5", "g2g4", "d8h4"];
const mate = (state: ChessState) => FOOLS_MATE.reduce((s, uci) => chessReducer(s, { type: "move", uci, source: "random" }), state);

describe("opening set", () => {
  it("has about 24 legal openings of 6 to 8 plies, all different", () => {
    expect(OPENINGS.length).toBe(24);
    expect(new Set(OPENINGS.map((o) => o.moves.join(" "))).size).toBe(OPENINGS.length);
    for (const { name, moves } of OPENINGS) {
      expect(moves.length, name).toBeGreaterThanOrEqual(6);
      expect(moves.length, name).toBeLessThanOrEqual(8);
      const game = new Chess();
      for (const uci of moves) expect(() => game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }), `${name}: ${uci}`).not.toThrow();
    }
  });

  it("plays opening k in game k, as moves that do not count for the players", () => {
    let state = { ...initialChessState(settings), gameNo: 7 };
    expect(gameOpening(state)).toMatchObject({ number: 7, opening: OPENINGS[6] });
    state = playOpening(state);
    expect(state.moves.map((m) => m.uci)).toEqual(OPENINGS[6]!.moves);
    expect(state.moves.every((m) => m.source === "opening" && m.opening === OPENINGS[6]!.name)).toBe(true);
    expect(state.tally.side.w.moves + state.tally.side.b.moves).toBe(0);
    state = chessReducer(state, { type: "graded", experimentId: state.experimentId, gameNo: 7, index: 0, grade: { loss: 400, bestSan: "d4", depth: 12, judgement: "blunder" } });
    expect(state.tally.side.w).toMatchObject({ graded: 0, blunders: 0 });
    expect(nextOpeningMove(state)).toBeNull();
  });

  it("swaps the colours after the last opening and plays the set again as a new experiment", () => {
    const players = { w: { ...settings.players.w, kind: "code" as const }, b: { ...settings.players.b, kind: "random" as const } };
    const last = mate({ ...initialChessState({ ...settings, players }), gameNo: OPENINGS.length, running: true });
    expect(last.running).toBe(true);
    const next = chessReducer(last, { type: "newGame" });
    expect(next).toMatchObject({ pass: 2, gameNo: 1, running: true });
    expect(next.experimentId).not.toBe(last.experimentId);
    expect(next.settings.players).toEqual({ w: players.b, b: players.w });
  });

  it("stops after the second pass, also with continuous play", () => {
    const end = mate({ ...initialChessState(settings, 2), gameNo: OPENINGS.length, running: true });
    expect(endsOpeningRun(end)).toBe(true);
    expect(end.running).toBe(false);
    // Restart begins a new run with the colours swapped back.
    expect(chessReducer(end, { type: "newGame" })).toMatchObject({ pass: 1, gameNo: 1 });
  });

  it("is saved in the header, and each game saves its opening", () => {
    let state = playOpening(initialChessState(settings));
    state = state.moves.reduce((s, _, index) => chessReducer(s, { type: "graded", experimentId: s.experimentId, gameNo: 1, index, grade: { loss: 0, bestSan: "e4", depth: 12 } }), state);
    const events = newChessEvents({ ...state, outcome: { winner: null, reason: "test" } }, { experimentId: "", gameNo: 0, moves: 0, gameSaved: false }, new Set(), false);
    const header = events[0]!;
    expect(header.type === "experiment" && header.settings).toMatchObject({ openings: "opening-set", randomFirst: false });
    const move = events[1]!;
    expect(move.type === "move" && move.move).toMatchObject({ source: "opening", opening: OPENINGS[0]!.name });
    const game = events.at(-1)!;
    expect(game.type === "game" && game.opening).toEqual({ number: 1, name: OPENINGS[0]!.name });
  });

  it("loads old saved settings", () => {
    expect(normalizeChessSettings({ randomFirst: true }).openings).toBe("random-first");
    expect(normalizeChessSettings({ randomFirst: false }).openings).toBe("start");
    expect(normalizeChessSettings({ openings: "opening-set" }).openings).toBe("opening-set");
    expect(normalizeChessSettings({ openings: "other" }).openings).toBe("start");
  });
});
