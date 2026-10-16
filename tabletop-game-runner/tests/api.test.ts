import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { checkRequest, MAX_DECIDE_BYTES, parseDecideRequest, parseGame, parseLogEvent, readJson } from "../src/server/api";
import { emptyBoard } from "../src/shared/tictactoe";

const post = (headers: Record<string, string>) => ({ method: "POST", headers: { host: "localhost:5173", "content-type": "application/json", ...headers } });
const status = (check: () => unknown): number | undefined => {
  try {
    check();
  } catch (error) {
    return (error as { status?: number }).status;
  }
  return undefined;
};

describe("request checks", () => {
  it("accept JSON posts from this server's own page and from tools without an origin", () => {
    expect(status(() => checkRequest(post({ origin: "http://localhost:5173" }), []))).toBeUndefined();
    expect(status(() => checkRequest(post({ "content-type": "application/json; charset=utf-8" }), []))).toBeUndefined();
    expect(status(() => checkRequest(post({ host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173" }), []))).toBeUndefined();
    expect(status(() => checkRequest(post({ host: "[::1]:5173" }), []))).toBeUndefined();
  });

  it("reject posts from other web pages", () => {
    expect(status(() => checkRequest(post({ origin: "http://evil.example" }), []))).toBe(403);
    expect(status(() => checkRequest(post({ origin: "null" }), []))).toBe(403);
    // A plain-text post needs no CORS check in the browser, so the server must refuse it.
    expect(status(() => checkRequest(post({ "content-type": "text/plain" }), []))).toBe(415);
    expect(status(() => checkRequest({ method: "POST", headers: { host: "localhost:5173" } }, []))).toBe(415);
  });

  it("reject a foreign host name, which DNS rebinding would send", () => {
    expect(status(() => checkRequest(post({ host: "evil.example:5173", origin: "http://evil.example:5173" }), []))).toBe(403);
    expect(status(() => checkRequest({ method: "GET", headers: { host: "evil.example:5173" } }, []))).toBe(403);
    expect(status(() => checkRequest(post({ host: "studio.lan:5173" }), ["studio.lan"]))).toBeUndefined();
  });
});

describe("request bodies", () => {
  it("read JSON up to the size limit", async () => {
    const body = (text: string) => Readable.from([Buffer.from(text)]);
    expect(await readJson(body('{"a":1}'), MAX_DECIDE_BYTES)).toEqual({ a: 1 });
    await expect(readJson(body("x".repeat(MAX_DECIDE_BYTES + 1)), MAX_DECIDE_BYTES)).rejects.toMatchObject({ status: 413 });
    await expect(readJson(body("{not json"), MAX_DECIDE_BYTES)).rejects.toMatchObject({ status: 400 });
  });

  it("check log events", () => {
    const event = { type: "move", experimentId: "2026-10-15_10-00-00_X-perfect_O-random_ab12" };
    expect(parseLogEvent(event)).toBe(event);
    expect(status(() => parseLogEvent({ ...event, type: "other" }))).toBe(400);
    expect(status(() => parseLogEvent({ ...event, experimentId: "../outside" }))).toBe(400);
    expect(status(() => parseLogEvent(null))).toBe(400);
  });

  it("check decide requests and fill in the defaults", () => {
    const { player } = parseDecideRequest({ board: emptyBoard(), player: { kind: "perfect" } });
    expect(player).toEqual({ kind: "perfect", depth: 2, lines: true, instructions: null, model: "jev-1.14.0" });
    expect(status(() => parseDecideRequest({ board: [], player: { kind: "perfect" } }))).toBe(400);
    expect(status(() => parseDecideRequest({ board: emptyBoard(), player: { kind: "human" } }))).toBe(400);
    expect(status(() => parseDecideRequest({ board: emptyBoard(), player: { kind: "perfect", depth: 9 } }))).toBe(400);
    const won = ["X", "X", "X", "O", "O", null, null, null, null];
    expect(status(() => parseDecideRequest({ board: won, player: { kind: "perfect" } }))).toBe(400);
  });

  it("read the game from a query", () => {
    expect(parseGame("/api/games?game=chess")).toBe("chess");
    expect(status(() => parseGame("/api/games?game=checkers"))).toBe(400);
  });
});
