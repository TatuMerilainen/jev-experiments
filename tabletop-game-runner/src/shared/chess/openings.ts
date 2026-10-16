// The opening set for chess experiments. Names and moves come from the lichess-org/chess-openings list
// (https://github.com/lichess-org/chess-openings, CC0-1.0), converted from SAN to UCI.
// Main lines of 6 to 8 plies. Stockfish at depth 12 rates each final position between +0.14 and +0.84 for White.

export interface Opening {
  name: string;
  /** UCI moves from the start position. */
  moves: string[];
}

export const OPENINGS: readonly Opening[] = [
  { name: "Italian Game: Giuoco Piano", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5"] },
  { name: "Ruy Lopez: Morphy Defense", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"] },
  { name: "Ruy Lopez: Berlin Defense", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "g8f6"] },
  { name: "Scotch Game", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "d2d4", "e5d4", "f3d4"] },
  { name: "Petrov's Defense", moves: ["e2e4", "e7e5", "g1f3", "g8f6", "f3e5", "d7d6", "e5f3", "f6e4"] },
  { name: "Sicilian Defense: Modern Variations, Main Line", moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6"] },
  { name: "Sicilian Defense: Taimanov Variation", moves: ["e2e4", "c7c5", "g1f3", "e7e6", "d2d4", "c5d4", "f3d4", "b8c6"] },
  { name: "Sicilian Defense: Alapin Variation, Smith-Morra Declined", moves: ["e2e4", "c7c5", "c2c3", "g8f6", "e4e5", "f6d5", "d2d4", "c5d4"] },
  { name: "French Defense: Classical Variation", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "b1c3", "g8f6"] },
  { name: "French Defense: Winawer Variation", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "b1c3", "f8b4"] },
  { name: "French Defense: Advance Variation", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "e4e5", "c7c5", "c2c3", "b8c6"] },
  { name: "Caro-Kann Defense: Classical Variation", moves: ["e2e4", "c7c6", "d2d4", "d7d5", "b1d2", "d5e4", "d2e4", "c8f5"] },
  { name: "Caro-Kann Defense: Advance Variation, Short Variation", moves: ["e2e4", "c7c6", "d2d4", "d7d5", "e4e5", "c8f5", "g1f3"] },
  { name: "Queen's Gambit Declined", moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5", "f8e7"] },
  { name: "Queen's Gambit Accepted: Normal Variation", moves: ["d2d4", "d7d5", "c2c4", "d5c4", "g1f3", "g8f6", "e2e3"] },
  { name: "Slav Defense: Three Knights Variation", moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "b1c3"] },
  { name: "Nimzo-Indian Defense: Classical Variation", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4", "d1c2"] },
  { name: "Queen's Indian Defense: Fianchetto Variation", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "g1f3", "b7b6", "g2g3"] },
  { name: "King's Indian Defense: Normal Variation", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6"] },
  { name: "Grünfeld Defense: Exchange Variation", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "d7d5", "c4d5", "f6d5"] },
  { name: "Catalan Opening: Open Defense", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "g2g3", "d7d5", "f1g2", "d5c4"] },
  { name: "Queen's Pawn Game: London System", moves: ["d2d4", "d7d5", "g1f3", "g8f6", "c1f4", "c7c5", "e2e3"] },
  { name: "English Opening: King's English Variation, Four Knights Variation", moves: ["c2c4", "e7e5", "b1c3", "g8f6", "g1f3", "b8c6"] },
  { name: "English Opening: Symmetrical Variation, Four Knights Variation", moves: ["c2c4", "c7c5", "g1f3", "g8f6", "b1c3", "b8c6"] },
];
