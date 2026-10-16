import http from "node:http";
import { APIError, TypeSafeClient, TypeSafeError } from "@typesafe-ai/sdk";
import { createServer as createViteServer } from "vite";
import { DEFAULT_JEV_MODEL, MAX_QUESTION_LENGTH, type StatusResponse } from "../shared/types";
import { checkRequest, HttpError, readJson } from "./http";
import { ask } from "./jev";

try {
  process.loadEnvFile();
} catch {
  // No .env file: use the shell environment.
}

const PORT = Number(process.env.PORT ?? 5174);
// Only this machine can reach the server by default, because /api/ask spends money on Jev requests.
const HOST = process.env.HOST?.trim() || "127.0.0.1";
const MODEL = process.env.TYPESAFE_MODEL?.trim() || DEFAULT_JEV_MODEL;

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

const vite = await createViteServer({ server: { middlewareMode: true, hmr: { server }, allowedHosts: [HOST] }, appType: "spa" });

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  checkRequest(req, [HOST]);
  if (req.method === "GET" && req.url === "/api/status") {
    const status: StatusResponse = { jevConfigured: jevConfigured(), model: MODEL };
    return sendJson(res, 200, status);
  }
  if (req.method === "POST" && req.url === "/api/ask") {
    const { question } = (await readJson(req, 10_000)) as { question?: unknown };
    const text = typeof question === "string" ? question.trim() : "";
    if (!text) throw new HttpError(400, "question must be a non-empty string.");
    if (text.length > MAX_QUESTION_LENGTH) throw new HttpError(400, `question can be at most ${MAX_QUESTION_LENGTH} characters.`);
    // Stop the Jev call when the browser cancels the request.
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    return sendJson(res, 200, await ask(getClient(), text, MODEL, abort.signal));
  }
  throw new HttpError(404, "Not found");
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  if (res.destroyed) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendError(res: http.ServerResponse, error: unknown): void {
  if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message });
  if (error instanceof APIError) return sendJson(res, 502, { error: `TypeSafe API error ${error.status}: ${error.message}` });
  if (error instanceof TypeSafeError) return sendJson(res, 502, { error: `TypeSafe: ${error.message}` });
  console.error(error);
  sendJson(res, 500, { error: error instanceof Error ? error.message : "Internal error" });
}

server.listen(PORT, HOST, () => {
  console.log(`Yes, no or pizza: http://localhost:${PORT} (listening on ${HOST})`);
  if (!jevConfigured()) console.log("TYPESAFE_API_KEY is not set. Asking is disabled.");
});
