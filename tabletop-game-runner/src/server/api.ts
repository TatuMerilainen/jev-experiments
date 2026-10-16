import type http from "node:http";
import { isIP } from "node:net";
import type { ChessLogEvent } from "../shared/chess/types";
import type { GameName } from "../shared/matchups";
import { MAX_INSTRUCTIONS_LENGTH } from "../shared/prompts";
import { result } from "../shared/tictactoe";
import { BOT_KINDS, MAX_DEPTH, type BotConfig, type Cell, type DecideRequest, type LogEvent } from "../shared/types";
import { HttpError } from "./http-error";
import { parseJevModel } from "./jev";
import { EXPERIMENT_ID } from "./store";

export const MAX_DECIDE_BYTES = 10_000;
// A move event carries the full decision, including every judged position.
export const MAX_LOG_BYTES = 2_000_000;

/**
 * Blocks requests from other web pages. A page on another site can send a plain-text POST
 * without a CORS check, so a POST must be JSON and must come from this server's own page.
 * With DNS rebinding a foreign page reaches this server under its own host name, so the host name must be local too.
 */
export function checkRequest(req: Pick<http.IncomingMessage, "method" | "headers">, allowedHosts: readonly string[]): void {
  const host = req.headers.host ?? "";
  if (!hostAllowed(host, allowedHosts)) throw new HttpError(403, `The host name ${host} is not allowed.`);
  if (req.method !== "POST") return;
  const { origin } = req.headers;
  if (origin !== undefined && origin !== `http://${host}`) throw new HttpError(403, "Requests from other web pages are not allowed.");
  const type = req.headers["content-type"]?.split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") throw new HttpError(415, "Content-Type must be application/json.");
}

/** The same rule as Vite's host check: IP addresses, localhost and the names in `allowedHosts`. */
function hostAllowed(host: string, allowedHosts: readonly string[]): boolean {
  const name = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.replace(/:\d+$/, "");
  return isIP(name) !== 0 || name === "localhost" || name.endsWith(".localhost") || allowedHosts.includes(name);
}

export async function readJson(req: AsyncIterable<Buffer>, maxBytes: number): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body is not valid JSON.");
  }
}

export function parseGame(url: string): GameName {
  const game = new URL(url, "http://localhost").searchParams.get("game");
  if (game !== "tictactoe" && game !== "chess") throw new HttpError(400, "game must be tictactoe or chess.");
  return game;
}

export function parseLogEvent(body: unknown): LogEvent | ChessLogEvent {
  const event = (body ?? {}) as Partial<LogEvent>;
  if (event.type !== "experiment" && event.type !== "move" && event.type !== "game") {
    throw new HttpError(400, "type must be experiment, move or game.");
  }
  if (typeof event.experimentId !== "string" || !EXPERIMENT_ID.test(event.experimentId)) {
    throw new HttpError(400, "experimentId may only contain letters, digits, '-' and '_'.");
  }
  return event as LogEvent | ChessLogEvent;
}

export function parseDecideRequest(body: unknown): DecideRequest {
  const { board, player } = (body ?? {}) as Partial<DecideRequest>;
  const validCell = (c: unknown): c is Cell => c === "X" || c === "O" || c === null;
  if (!Array.isArray(board) || board.length !== 9 || !board.every(validCell)) {
    throw new HttpError(400, "board must be an array of 9 cells: 'X', 'O' or null.");
  }
  if (result(board)) throw new HttpError(400, "The game is over.");
  const config = player as Partial<BotConfig> | undefined;
  if (!config || !BOT_KINDS.includes(config.kind as BotConfig["kind"])) {
    throw new HttpError(400, `player.kind must be one of: ${BOT_KINDS.join(", ")}.`);
  }
  const depth = Number(config.depth ?? 2);
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_DEPTH) {
    throw new HttpError(400, `player.depth must be an integer from 1 to ${MAX_DEPTH}.`);
  }
  const instructions = typeof config.instructions === "string" ? config.instructions.trim() : "";
  if (instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    throw new HttpError(400, `player.instructions can be at most ${MAX_INSTRUCTIONS_LENGTH} characters.`);
  }
  return {
    board,
    player: {
      kind: config.kind as BotConfig["kind"],
      depth,
      lines: config.lines !== false,
      instructions: instructions || null,
      model: parseJevModel(config.model),
    },
  };
}
