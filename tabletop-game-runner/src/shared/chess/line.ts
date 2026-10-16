import { Chess } from "chess.js";

/**
 * A game as a start position plus the moves played from it, in UCI notation such as "e2e4".
 * Without `start`, the game begins at the normal start position. A puzzle can start from its own FEN.
 */
export interface GameLine {
  start?: string;
  moves: string[];
}

/** Replays the moves, so chess.js knows the history that the draw rules need. Throws on an illegal move. */
export function playLine({ start, moves }: GameLine): Chess {
  const game = start ? new Chess(start) : new Chess();
  for (const uci of moves) game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return game;
}
