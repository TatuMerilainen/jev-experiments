import { other } from "./tictactoe";
import type { Mark, PlayerKind } from "./types";

export const LOOKAHEAD_INSTRUCTIONS =
  "It is `to_move`'s turn. If both players play their best from here, how does this game end for `you_play`?";

export const DIRECT_INSTRUCTIONS = "Which move should `you_play` make now to win, or at least not lose?";

export const MAX_INSTRUCTIONS_LENGTH = 2000;

/** Instructions a Jev player uses when the user has not changed them. */
export function defaultInstructions(kind: PlayerKind): string | null {
  if (kind === "jev-lookahead") return LOOKAHEAD_INSTRUCTIONS;
  if (kind === "jev-direct") return DIRECT_INSTRUCTIONS;
  return null;
}

/**
 * Score levels for the look-ahead question, worst first. They are the three results with best play.
 * An older question had five levels: will lose, worse, even, better, will win. Older saved moves hold those.
 */
export function positionLevels(you: Mark): [string, string, ...string[]] {
  const them = other(you);
  return [
    `${you} will lose: ${them} gets three in a row whatever ${you} does. Examples: it is ${them}'s turn and ${them} can complete a line. Or: it is ${you}'s turn, ${you} cannot complete a line, and ${them} has two lines that each need one more ${them} in different cells.`,
    "Draw: with best play by both players, nobody gets three in a row.",
    `${you} will win: ${you} gets three in a row whatever ${them} does. Examples: it is ${you}'s turn and ${you} can complete a line. Or: it is ${them}'s turn, ${them} cannot complete a line, and ${you} has two lines that each need one more ${you} in different cells.`,
  ];
}
