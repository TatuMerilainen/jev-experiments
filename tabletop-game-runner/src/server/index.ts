import http from "node:http";
import { APIError, TypeSafeClient, TypeSafeError } from "@typesafe-ai/sdk";
import { createServer as createViteServer } from "vite";
import { DEFAULT_JEV_MODEL, type LogResponse, type StatusResponse } from "../shared/types";
import { checkRequest, MAX_DECIDE_BYTES, MAX_LOG_BYTES, parseDecideRequest, parseGame, parseLogEvent, readJson } from "./api";
import { decide } from "./bots";
import { parseChessDecide, parseChessGrade } from "./chess/api";
import { chessPromptSnapshot } from "./chess/jev";
import { decideChess, gradeChessMove } from "./chess/bots";
import { HttpError } from "./http-error";
import { promptSnapshot } from "./jev";
import { readJevStats } from "./jevStats";
import { readGames, readMatchups, readReplay } from "./matchups";
import { parsePuzzleEvent, parsePuzzleSetName, readPuzzleAttempt, readPuzzleRuns } from "./puzzles";
import { saveEvent, savePuzzleEvent } from "./store";

try {
  process.loadEnvFile();
} catch {
  // No .env file: use the shell environment.
}

const PORT = Number(process.env.PORT ?? 5173);
// Only this machine can reach the server by default, because /api/decide spends money on Jev requests.
const HOST = process.env.HOST?.trim() || "127.0.0.1";
const defaultModel = () => process.env.TYPESAFE_DEFAULT_MODEL?.trim() || DEFAULT_JEV_MODEL;

const jevConfigured = () => Boolean(process.env.TYPESAFE_API_KEY?.trim());

let client: TypeSafeClient | null = null;
const getClient = (): TypeSafeClient => {
  if (!jevConfigured()) throw new HttpError(503, "TYPESAFE_API_KEY is not set. Add it to .env and restart the server.");
  client ??= new TypeSafeClient();
  return client;
};

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res).catch((error: unknown) => sendError(res, error));
    return;
  }
  vite.middlewares(req, res);
});

// Live reload shares the app's port, so several copies can run side by side.
const vite = await createViteServer({ server: { middlewareMode: true, hmr: { server }, allowedHosts: [HOST] }, appType: "spa" });

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  checkRequest(req, [HOST]);
  if (req.method === "GET" && req.url === "/api/status") {
    const status: StatusResponse = {
      jevConfigured: jevConfigured(),
      model: defaultModel(),
    };
    return sendJson(res, 200, status);
  }
  if (req.method === "POST" && req.url === "/api/decide") {
    const { board, player } = parseDecideRequest(await readJson(req, MAX_DECIDE_BYTES));
    // Stop pending Jev calls when the browser cancels the request.
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    const decision = await decide(board, player, { client: getClient, signal: abort.signal });
    return sendJson(res, 200, decision);
  }
  if (req.method === "POST" && req.url === "/api/chess/decide") {
    const { start, moves, player } = parseChessDecide(await readJson(req, MAX_DECIDE_BYTES));
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    try {
      return sendJson(res, 200, await decideChess({ start, moves }, player, { client: getClient, signal: abort.signal }));
    } catch (error) {
      throw toBadRequest(error);
    }
  }
  if (req.method === "POST" && req.url === "/api/chess/grade") {
    const { moves, uci } = parseChessGrade(await readJson(req, MAX_DECIDE_BYTES));
    try {
      return sendJson(res, 200, await gradeChessMove(moves, uci));
    } catch (error) {
      throw toBadRequest(error);
    }
  }
  if (req.method === "GET" && req.url?.startsWith("/api/matchups?")) {
    return sendJson(res, 200, await readMatchups(parseGame(req.url)));
  }
  if (req.method === "GET" && req.url?.startsWith("/api/games?")) {
    return sendJson(res, 200, await readGames(parseGame(req.url)));
  }
  if (req.method === "GET" && req.url?.startsWith("/api/replay?")) {
    const params = new URL(req.url, "http://localhost").searchParams;
    const gameNo = Number(params.get("gameNo"));
    if (!Number.isInteger(gameNo) || gameNo < 1) throw new HttpError(400, "gameNo must be a whole number from 1.");
    const replay = await readReplay(parseGame(req.url), params.get("experiment") ?? "", gameNo);
    if (!replay) throw new HttpError(404, "No such saved game.");
    return sendJson(res, 200, replay);
  }
  if (req.method === "GET" && req.url === "/api/jev-stats") {
    return sendJson(res, 200, await readJevStats());
  }
  if (req.method === "GET" && req.url?.startsWith("/api/puzzles/runs?")) {
    return sendJson(res, 200, await readPuzzleRuns(parsePuzzleSetName(req.url)));
  }
  if (req.method === "GET" && req.url?.startsWith("/api/puzzles/attempt?")) {
    const params = new URL(req.url, "http://localhost").searchParams;
    const attempt = await readPuzzleAttempt(params.get("run") ?? "", params.get("puzzle") ?? "");
    if (!attempt) throw new HttpError(404, "No such saved attempt.");
    return sendJson(res, 200, attempt);
  }
  if (req.method === "POST" && req.url === "/api/puzzles/log") {
    const event = parsePuzzleEvent(await readJson(req, MAX_LOG_BYTES));
    const dir = await savePuzzleEvent(event, { prompts: chessPromptSnapshot(), defaultModel: defaultModel() });
    const response: LogResponse = { dir };
    return sendJson(res, 200, response);
  }
  if (req.method === "POST" && req.url === "/api/log") {
    const event = parseLogEvent(await readJson(req, MAX_LOG_BYTES));
    const prompts = "game" in event && event.game === "chess" ? chessPromptSnapshot() : promptSnapshot();
    const dir = await saveEvent(event, { prompts, defaultModel: defaultModel() });
    const response: LogResponse = { dir };
    return sendJson(res, 200, response);
  }
  throw new HttpError(404, "Not found");
}

/** chess.js throws plain errors for illegal moves; those are the client's fault. */
function toBadRequest(error: unknown): unknown {
  if (error instanceof HttpError || error instanceof TypeSafeError) return error;
  if (error instanceof Error && /Invalid move|Illegal move|game is over/i.test(error.message)) return new HttpError(400, error.message);
  return error;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  if (res.destroyed) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendError(res: http.ServerResponse, error: unknown): void {
  if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message });
  if (error instanceof APIError) {
    return sendJson(res, 502, { error: `TypeSafe API error ${error.status}: ${error.message}` });
  }
  if (error instanceof TypeSafeError) return sendJson(res, 502, { error: `TypeSafe: ${error.message}` });
  console.error(error);
  sendJson(res, 500, { error: error instanceof Error ? error.message : "Internal error" });
}

server.listen(PORT, HOST, () => {
  console.log(`Tabletop game runner: http://localhost:${PORT} (listening on ${HOST})`);
  if (!jevConfigured()) console.log("TYPESAFE_API_KEY is not set. Jev players are disabled.");
});
