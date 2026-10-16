import https from "node:https";
import { syncBuiltinESMExports } from "node:module";

// Tests must never reach a real API: a real Jev request costs money. The fake Jev clients pass their own fetch.
const blocked = (target: string): never => {
  throw new Error(`Network access is blocked in tests: ${target}`);
};

globalThis.fetch = (async (input: RequestInfo | URL) => blocked(input instanceof Request ? input.url : String(input))) as typeof fetch;
https.request = (() => blocked("https.request")) as typeof https.request;
https.get = (() => blocked("https.get")) as typeof https.get;
syncBuiltinESMExports();
