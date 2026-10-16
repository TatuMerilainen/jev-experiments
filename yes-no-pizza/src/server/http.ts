import type http from "node:http";
import { isIP } from "node:net";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

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
