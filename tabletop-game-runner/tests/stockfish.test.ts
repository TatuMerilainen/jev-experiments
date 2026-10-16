import { describe, expect, it } from "vitest";
import { Stockfish } from "../src/server/chess/stockfish";

// A fake UCI engine. It stops on a position that contains "crash", and it never answers one that contains "hang".
const FAKE_ENGINE = `
let position = "";
require("node:readline").createInterface({ input: process.stdin }).on("line", (line) => {
  if (line === "uci") console.log("uciok");
  else if (line === "isready") console.log("readyok");
  else if (line.startsWith("position")) position = line;
  else if (line.startsWith("go")) {
    if (position.includes("crash")) process.exit(1);
    if (!position.includes("hang")) console.log("info depth 1 score cp 10 pv e2e4\\nbestmove e2e4");
  }
});
`;

describe("Stockfish process", () => {
  it("fails the search when the engine stops, and starts a fresh engine for the next search", async () => {
    const engine = new Stockfish(["-e", FAKE_ENGINE]);
    const crashed = engine.analyse({ start: "crash", moves: [] }, 5);
    const next = engine.analyse({ moves: [] }, 5);
    await expect(crashed).rejects.toThrow(/Stockfish stopped/);
    await expect(next).resolves.toEqual({ bestUci: "e2e4", score: 10 });
  });

  it("restarts an engine that gives no answer", async () => {
    const engine = new Stockfish(["-e", FAKE_ENGINE], 300);
    const hung = engine.analyse({ start: "hang", moves: [] }, 5);
    const next = engine.analyse({ moves: [] }, 5);
    await expect(hung).rejects.toThrow(/no answer/);
    await expect(next).resolves.toEqual({ bestUci: "e2e4", score: 10 });
  });
});
