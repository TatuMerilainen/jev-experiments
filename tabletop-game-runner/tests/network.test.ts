import { TypeSafeClient } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";

describe("network guard", () => {
  it("blocks fetch, so a client without a fake cannot reach the real API", async () => {
    await expect(fetch("https://example.com")).rejects.toThrow(/blocked in tests/);
    const client = new TypeSafeClient({ apiKey: "test", logLevel: "off" });
    const questions = { move: { type: "choice", criteria: { a: "the first", b: "the second" } } } as const;
    await expect(client.systemOne({ model: "jev-1.14.0", state: "x", questions })).rejects.toThrow(/blocked in tests/);
  });
});
