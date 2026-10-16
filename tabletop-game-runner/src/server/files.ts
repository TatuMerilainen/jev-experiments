import { open, readdir, readFile } from "node:fs/promises";

export async function listDirs(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** A missing file reads as empty: an experiment with no finished game has no games.jsonl. */
export async function readText(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

/** A line cut short by a server stop during a write reads as `null` and is skipped. */
export function parse(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Appends one line. A line cut short by a server stop has no newline, so it gets one first, and the new line stays whole. */
export async function appendLine(file: string, line: string): Promise<void> {
  const handle = await open(file, "a+");
  try {
    const { size } = await handle.stat();
    const last = Buffer.alloc(1);
    if (size > 0) await handle.read(last, 0, 1, size - 1);
    await handle.write((size > 0 && last[0] !== 0x0a ? "\n" : "") + line + "\n");
  } finally {
    await handle.close();
  }
}
