import { playLine } from "../../shared/chess/line";
import { lineAt, type Puzzle } from "../../shared/chess/puzzles";

/** The Lichess themes that name a puzzle's idea, most telling first. */
const IDEA_LABELS: [string, string][] = [
  ["mateIn1", "Mate in 1"],
  ["mateIn2", "Mate in 2"],
  ["mateIn3", "Mate in 3"],
  ["mateIn4", "Mate in 4"],
  ["mateIn5", "Mate in 5"],
  ["fork", "Fork"],
  ["pin", "Pin"],
  ["skewer", "Skewer"],
  ["discoveredAttack", "Discovered attack"],
  ["doubleCheck", "Double check"],
  ["hangingPiece", "Hanging piece"],
  ["trappedPiece", "Trapped piece"],
  ["deflection", "Deflection"],
  ["attraction", "Attraction"],
  ["clearance", "Clearance"],
  ["interference", "Interference"],
  ["intermezzo", "In-between move"],
  ["sacrifice", "Sacrifice"],
  ["promotion", "Promotion"],
  ["zugzwang", "Zugzwang"],
  ["quietMove", "Quiet move"],
  ["defensiveMove", "Defensive move"],
  ["capturingDefender", "Capturing the defender"],
  ["exposedKing", "Exposed king"],
];

export const puzzleIdea = (p: Puzzle): string => IDEA_LABELS.find(([theme]) => p.themes.includes(theme))?.[1] ?? "Tactic";

export const lichessPuzzleUrl = (p: Puzzle): string => `https://lichess.org/training/${p.id}`;

/** A solver move of the puzzle in SAN, for example "Rd8+". */
export function solutionSan(p: Puzzle, step: number): string {
  const uci = p.moves[1 + 2 * step]!;
  return playLine(lineAt(p, step)).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
}

/** "1 of 2" or "✓" and "✗" for a puzzle cell. */
export function cellText(attempts: number, solved: number): string {
  if (attempts === 1) return solved ? "✓" : "✗";
  return `${solved}/${attempts}`;
}
