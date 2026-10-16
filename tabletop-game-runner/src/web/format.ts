import type { Outcome } from "../shared/solver";
import type { Mark, PlayerKind, PlayerSetup, ValueKind } from "../shared/types";
import type { MoveSource } from "./experiment";

/** jev-1.13 price per input token. Output tokens are free. */
export const PRICE_PER_TOKEN_USD = 0.042 / 1_000_000;

export const KIND_LABELS: Record<PlayerKind, string> = {
  "jev-lookahead": "Jev look-ahead",
  "jev-direct": "Jev direct",
  human: "Human",
  "code-only": "Search only",
  perfect: "Perfect",
  random: "Random",
};

export const usesDepth = (kind: PlayerKind): boolean => kind === "jev-lookahead" || kind === "code-only";
export const usesJev = (kind: PlayerKind): boolean => kind === "jev-lookahead" || kind === "jev-direct";

const plural = (n: number) => `${n} ${n === 1 ? "move" : "moves"}`;

export function describeSetup(setup: PlayerSetup): string {
  switch (setup.kind) {
    case "jev-lookahead":
      return `Looks ${plural(setup.depth)} ahead. Jev rates the positions at the end.`;
    case "jev-direct":
      return "Jev picks a move from the current position.";
    case "human":
      return "Click a cell on the board to move.";
    case "code-only":
      return `Looks ${plural(setup.depth)} ahead in code.`;
    case "perfect":
      return "Searches the whole game. Never loses.";
    case "random":
      return "Plays a random legal move.";
  }
}

export interface SetupDetail {
  label: string;
  value: string;
}

/** Technical terms in setup details. The UI shows the explanation when the term is hovered. */
export const TERMS: Record<string, string> = {
  "Full minimax":
    "Minimax tries every move for both players. It assumes each player picks the move that is best for them. Full means it searches until every game ends, so every result is exact.",
  "Depth-limited minimax":
    "Minimax tries every move for both players. It assumes each player picks the move that is best for them. Depth-limited means it stops after a fixed number of moves and uses an estimate there.",
  "Jev Score":
    "A Jev question type with ordered answer levels, worst first. Jev returns a probability for each level. Its answer is the expected level: a number that can fall between two levels.",
  "−0.9 to +0.9":
    "Code takes the probability of a win minus the probability of a loss, and multiplies it by 0.9. A sure loss becomes −0.9, a draw 0, and a sure win +0.9. The values stay below 1, so a proven win counts more than a likely win.",
  "known result":
    "The player to move can complete a line: a win for them. Or they cannot, and the opponent has two different cells that each complete a line: a loss for them.",
  "Rotations and reflections":
    "A turned or mirrored copy of a position is the same position for the game. Code sends only one of them to Jev.",
  Choice: "A Jev question type with a list of options. Jev returns a probability for each option.",
  "reverse order":
    "Jev can favour the first option in a list. Averaging two answers with opposite orders cancels out this bias.",
  "8 lines":
    "The 3 rows, 3 columns and 2 diagonals. For each line, code lists the marks in it, for example \"X, empty, O\". Jev reads such lists better than a grid.",
  "best average": "The average result over all of the opponent's replies.",
  "lowest cell": "The first cell in reading order: a1, b1, c1, a2, and so on.",
  "no seed":
    "A seed is the start number of a random generator. With a fixed seed, the same random moves would repeat. Without one, a game cannot be replayed.",
  "5,478 positions":
    "Every position that can come up in a game, finished ones included. The results stay in memory until the server restarts.",
};

/** The algorithms and inputs behind a player setup, shown under its one-line description. */
export function setupDetails(setup: PlayerSetup): SetupDetail[] {
  const search = { label: "Search", value: `Depth-limited minimax. Code tries every move for both players, ${plural(setup.depth)} ahead.` };
  const finished = {
    label: "Finished games",
    value: "When a move sequence ends the game, code uses the real result: win +1, draw 0, loss −1.",
  };
  const choice = {
    label: "Move choice",
    value: "Code expects the opponent's strongest reply. It plays the move with the best result after that reply. A tie goes to the best average, then to the lowest cell.",
  };
  const input = {
    label: "Jev input",
    value: setup.lines ? "The board as 3 rows of text, plus the marks in each of the 8 lines." : "The board as 3 rows of text.",
  };
  switch (setup.kind) {
    case "jev-lookahead":
      return [
        search,
        finished,
        {
          label: "Unfinished positions",
          value: "Where the search stops before the game ends, Jev rates the position with a 3-level Jev Score: loss, draw or win. Code turns the answer into a value from −0.9 to +0.9.",
        },
        {
          label: "Decided by code",
          value: "A position with a known result counts like a finished game, win +1 or loss −1. Jev gets no request for it.",
        },
        {
          label: "Jev requests",
          value: "One for each other unfinished position. Rotations and reflections of a position share one request.",
        },
        input,
        choice,
      ];
    case "jev-direct":
      return [
        {
          label: "Jev requests",
          value: "One request with two Choice questions. The legal moves are the options. The second question lists the moves in reverse order.",
        },
        { label: "Move values", value: "Each move gets the average of its probabilities from the two answers." },
        input,
        { label: "Move choice", value: "The move with the highest average. A tie goes to the lowest cell." },
      ];
    case "human":
      return [];
    case "code-only":
      return [
        search,
        finished,
        { label: "Unfinished positions", value: "Where the search stops before the game ends, code counts the position as 0, the same as a draw." },
        choice,
      ];
    case "perfect":
      return [
        { label: "Search", value: "Full minimax. Code tries every move for both players until each game ends." },
        {
          label: "Scores",
          value: "A win scores 10 minus the marks on the board. A loss scores the same number, negative. A draw scores 0. So a fast win scores higher than a slow one.",
        },
        { label: "Cache", value: "Code solves each of the 5,478 positions once and keeps the result." },
        { label: "Move choice", value: "The move with the highest score. A tie goes to the lowest cell." },
      ];
    case "random":
      return [
        { label: "Move choice", value: "A random legal move. Each legal move has the same chance." },
        { label: "Randomness", value: "Math.random, with no seed." },
      ];
  }
}

/** One sentence on what a Jev player's request asks. `options` is the number of moves Jev chooses from. */
export function jevRequestAbout(setup: PlayerSetup, player: Mark, options: number): string {
  if (setup.kind === "jev-direct") return `Jev picks ${player}'s move from the ${options} legal moves.`;
  return `Jev rates a position ${plural(setup.depth)} ahead: how does the game end for ${player}?`;
}

/**
 * The Jev versions in use, for an Experiment panel footer: "Model jev-1.14.0",
 * or "Models: X jev-1.13.0, O jev-1.14.0" when the two players use different versions.
 * Each entry is a side name and its model, `null` for a player without Jev.
 */
export function modelsText(players: [string, string | null][]): string | undefined {
  const used = players.filter((p): p is [string, string] => p[1] !== null);
  if (used.length === 0) return undefined;
  if (new Set(used.map(([, model]) => model)).size === 1) return `Model ${used[0]![1]}`;
  return `Models: ${used.map(([side, model]) => `${side} ${model}`).join(", ")}`;
}

export interface SetupBadge {
  /** ai: a model takes part in the decision. code: an algorithm in code does. */
  kind: "ai" | "code";
  text: string;
}

/** Shows at a glance whether a setup decides with AI, with code, or with both. */
export function setupBadges(setup: PlayerSetup): SetupBadge[] {
  const ai: SetupBadge = { kind: "ai", text: setup.model };
  switch (setup.kind) {
    case "jev-lookahead":
      return [ai, { kind: "code", text: "Minimax" }];
    case "jev-direct":
      return [ai];
    case "human":
      return [];
    case "code-only":
      return [{ kind: "code", text: "Minimax" }];
    case "perfect":
      return [{ kind: "code", text: "Minimax" }];
    case "random":
      return [{ kind: "code", text: "Math.random" }];
  }
}

/** Short names of the look-ahead Score levels, worst first. Older saved moves have five levels. */
export const leafLevelNames = (levels: number): string[] =>
  levels === 3 ? ["will lose", "draw", "will win"] : ["will lose", "worse", "even", "better", "will win"];

/** With `withModel`, a Jev player's label also names its model. */
export function setupLabel(setup: PlayerSetup, withModel = false): string {
  const parts = [KIND_LABELS[setup.kind]];
  if (usesDepth(setup.kind)) parts.push(`depth ${setup.depth}`);
  if (withModel && usesJev(setup.kind) && setup.model) parts.push(setup.model);
  if (usesJev(setup.kind) && !setup.lines) parts.push("grid only");
  if (usesJev(setup.kind) && setup.instructions) parts.push("custom instructions");
  return parts.join(", ");
}

export function sourceLabel(source: MoveSource, setup: PlayerSetup): string {
  if (source === "random-opening") return "Random first move";
  if (source === "human") return "Human";
  return setupLabel(setup);
}

/** When a saved game ended, for example "15 Oct, 09:41". */
export const formatGameTime = (at: string): string =>
  at ? new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export const outcomeWord = (o: Outcome): string => (o > 0 ? "win" : o < 0 ? "loss" : "draw");

export function formatValue(value: number | null, valueKind: ValueKind, kind: PlayerKind, digits = 2): string {
  if (value === null || valueKind === "none") return "";
  if (valueKind === "probability") return `${Math.round(value * 100)}%`;
  if (kind === "perfect") return outcomeWord(Math.sign(value) as Outcome);
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}`;
}

export type Tone = "good" | "bad" | "neutral";

export function valueTone(value: number | null, valueKind: ValueKind): Tone {
  if (value === null || valueKind !== "outcome") return "neutral";
  return value > 0.05 ? "good" : value < -0.05 ? "bad" : "neutral";
}

export function formatMs(ms: number): string {
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(Math.round(tokens));
  return tokens < 1_000_000 ? `${(tokens / 1000).toFixed(1)}k` : `${(tokens / 1_000_000).toFixed(2)}M`;
}

/** Two significant digits below one cent, so a single Jev call ($0.00003) does not show as zero. */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  return usd < 0.01 ? `$${Number(usd.toPrecision(2))}` : `$${usd.toFixed(2)}`;
}
