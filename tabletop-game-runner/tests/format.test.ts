import { describe, expect, it } from "vitest";
import { jevRequestAbout, leafLevelNames, setupBadges, setupDetails, setupLabel, TERMS, usesJev } from "../src/web/format";
import { BOT_KINDS } from "../src/shared/types";

describe("setup details", () => {
  it("uses every tooltip term in some detail, with the same spelling", () => {
    const text = BOT_KINDS.flatMap((kind) => setupDetails({ kind, depth: 2, lines: true, instructions: null, model: "jev-1.14.0" }))
      .map((d) => d.value)
      .join("\n");
    for (const term of Object.keys(TERMS)) expect(text, term).toContain(term);
  });

  it("shows the AI badge exactly for the Jev players", () => {
    for (const kind of BOT_KINDS) {
      const badges = setupBadges({ kind, depth: 2, lines: true, instructions: null, model: "jev-1.14.0" });
      expect(badges.some((b) => b.kind === "ai" && b.text === "jev-1.14.0"), kind).toBe(usesJev(kind));
    }
  });

  it("says what a Jev request asks, in one sentence", () => {
    const setup = (kind: "jev-lookahead" | "jev-direct", depth: number) => ({ kind, depth, lines: true, instructions: null, model: "jev-1.14.0" });
    expect(jevRequestAbout(setup("jev-lookahead", 1), "O", 8)).toBe("Jev rates a position 1 move ahead: how does the game end for O?");
    expect(jevRequestAbout(setup("jev-direct", 2), "X", 7)).toBe("Jev picks X's move from the 7 legal moves.");
  });
});

describe("look-ahead levels in the UI", () => {
  it("show five levels for an older saved decision and three for a new one", () => {
    expect(leafLevelNames(5)).toEqual(["will lose", "worse", "even", "better", "will win"]);
    expect(leafLevelNames(3)).toEqual(["will lose", "draw", "will win"]);
  });
});
