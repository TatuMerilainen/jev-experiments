import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendLine, parse } from "../src/server/files";

describe("appending lines", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "files-"));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("keeps the next line whole after a line that was cut off", async () => {
    const file = path.join(dir, "moves.jsonl");
    await writeFile(file, '{"moveNo":1}\n{"moveNo":2,"mo');
    await appendLine(file, '{"moveNo":3}');
    await appendLine(file, '{"moveNo":4}');
    const lines = (await readFile(file, "utf8")).split("\n").map(parse);
    expect(lines).toEqual([{ moveNo: 1 }, null, { moveNo: 3 }, { moveNo: 4 }, null]);
  });

  it("creates a missing file", async () => {
    const file = path.join(dir, "games.jsonl");
    await appendLine(file, '{"gameNo":1}');
    expect(await readFile(file, "utf8")).toBe('{"gameNo":1}\n');
  });
});
