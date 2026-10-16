import { describe, expect, it } from "vitest";
import { ApiError } from "../src/web/api";
import { chessReducer, DEFAULT_CHESS_SETTINGS, initialChessState } from "../src/web/chess/chessExperiment";
import { newChessEvents } from "../src/web/chess/useChessLog";
import { SaveQueue, type SaveStatus } from "../src/web/saveQueue";

type Event = { type: string; id: string };

/** Fails the listed events once each, in the given way, and records every saved event. */
function fakeServer(failOnce: Record<string, Error>) {
  const saved: string[] = [];
  const save = async (event: Event) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    const error = failOnce[event.id];
    if (error) {
      delete failOnce[event.id];
      throw error;
    }
    saved.push(event.id);
    return { dir: "data/experiments/test" };
  };
  return { saved, save };
}

/** Pushes the events and waits until the queue reports every one of them as handled. */
async function run(queue: SaveQueue<Event>, statuses: SaveStatus[], events: Event[], handled: (s: SaveStatus) => boolean) {
  queue.push(events);
  while (!statuses.length || !handled(statuses.at(-1)!)) await new Promise((resolve) => setTimeout(resolve, 2));
}

describe("save queue", () => {
  it("retries a failed save and keeps the order", async () => {
    const { saved, save } = fakeServer({ header: new TypeError("Failed to fetch"), m2: new ApiError(500, "disk full") });
    const statuses: SaveStatus[] = [];
    const queue = new SaveQueue<Event>(save, (s) => statuses.push(s), [5]);
    const events = [
      { type: "experiment", id: "header" },
      { type: "move", id: "m1" },
      { type: "move", id: "m2" },
      { type: "game", id: "g1" },
    ];
    await run(queue, statuses, events, (s) => s.gamesSaved === 1);
    expect(saved).toEqual(["header", "m1", "m2", "g1"]);
    // An error shows until the queue is empty. Saving m1 does not hide it.
    expect(statuses.map((s) => s.error)).toEqual(["Failed to fetch", "Failed to fetch", "Failed to fetch", "disk full", "disk full", null]);
    expect(statuses.at(-1)).toEqual({ dir: "data/experiments/test", error: null, gamesSaved: 1 });
  });

  it("saves nothing after a failed header until the header is saved", async () => {
    const { saved, save } = fakeServer({ header: new ApiError(503, "restarting") });
    const statuses: SaveStatus[] = [];
    const queue = new SaveQueue<Event>(save, (s) => statuses.push(s), [5]);
    queue.push([{ type: "experiment", id: "header" }]);
    await run(queue, statuses, [{ type: "move", id: "m1" }], (s) => s.dir !== null && s.error === null);
    expect(saved).toEqual(["header", "m1"]);
    expect(statuses[0]).toEqual({ dir: null, error: "restarting", gamesSaved: 0 });
  });

  it("drops an event that the server rejects, because it would fail every time", async () => {
    const { saved, save } = fakeServer({ m1: new ApiError(400, "type must be experiment, move or game.") });
    const statuses: SaveStatus[] = [];
    const queue = new SaveQueue<Event>(save, (s) => statuses.push(s), [5]);
    await run(queue, statuses, [{ type: "move", id: "m1" }, { type: "move", id: "m2" }], (s) => s.dir !== null);
    expect(saved).toEqual(["m2"]);
  });
});

describe("chess log", () => {
  // Fool's mate: Black mates on move 2.
  const finished = () => {
    let state = initialChessState({ ...DEFAULT_CHESS_SETTINGS, continuous: true });
    for (const uci of ["f2f3", "e7e5", "g2g4", "d8h4"]) state = chessReducer(state, { type: "move", uci, source: "human" });
    return chessReducer(state, { type: "graded", experimentId: state.experimentId, gameNo: 1, index: 0, grade: { loss: 30, bestSan: "e4", depth: 12 } });
  };
  const sent = () => ({ experimentId: "", gameNo: 0, moves: 0, gameSaved: false });

  it("waits for the ratings before it sends a move", () => {
    const events = newChessEvents(finished(), sent(), new Set(), false);
    expect(events.map((e) => e.type)).toEqual(["experiment", "move"]);
  });

  it("sends the moves without their ratings and the finished game when the view closes", () => {
    const state = finished();
    const s = sent();
    const headers = new Set<string>();
    newChessEvents(state, s, headers, false);
    const events = newChessEvents(state, s, headers, true);
    expect(events.map((e) => e.type)).toEqual(["move", "move", "move", "game"]);
    expect(events.slice(0, 3).map((e) => e.type === "move" && e.move.grade)).toEqual([null, null, null]);
  });
});
