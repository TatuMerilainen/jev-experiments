import { CANDIDATE_MARGIN, MAX_CANDIDATES, type ChessColor, type ChessGrade, type ChessPlayerKind, type ChessPlayerSetup } from "../../shared/chess/types";
import { JEV_MODELS, LEGACY_JEV_MODEL } from "../../shared/types";
import type { Tone } from "../format";

/** A colour per player group. Jev players share one colour family, with one shade per model. */
export type PlayerTone = "jev-1" | "jev-2" | "jev-3" | "stockfish" | "code" | "random" | "human";

export function chessPlayerTone(setup: ChessPlayerSetup): PlayerTone {
  if (setup.kind === "jev" || setup.kind === "jev-all") {
    const index = JEV_MODELS.indexOf((setup.model || LEGACY_JEV_MODEL) as (typeof JEV_MODELS)[number]);
    return index === 0 ? "jev-1" : index === 1 ? "jev-2" : "jev-3";
  }
  return setup.kind;
}

export const CHESS_KIND_LABELS: Record<ChessPlayerKind, string> = {
  jev: "Jev",
  "jev-all": "Jev alone",
  human: "Human",
  code: "Search only",
  stockfish: "Stockfish",
  random: "Random",
};

export const COLOR_LABEL: Record<ChessColor, string> = { w: "White", b: "Black" };

export const usesChessJev = (kind: ChessPlayerKind) => kind === "jev" || kind === "jev-all";
export const usesSearch = (kind: ChessPlayerKind) => kind === "jev" || kind === "code";

const plies = (n: number) => `${n} ${n === 1 ? "move" : "moves"}`;

export function describeChessSetup(setup: ChessPlayerSetup): string {
  switch (setup.kind) {
    case "jev":
      return `Code looks ${plies(setup.depth)} ahead and keeps the best few moves. Jev picks one.`;
    case "jev-all":
      return "Jev picks from all legal moves, with no search.";
    case "human":
      return "Click a piece, then the square to move it to.";
    case "code":
      return `Plays the top move of a ${plies(setup.depth)} code search. No Jev calls.`;
    case "stockfish":
      return `A strong chess engine, searching ${setup.depth} plies deep.`;
    case "random":
      return "Plays a random legal move.";
  }
}

/** With `withModel`, a Jev player's label also names its model. */
export function chessSetupLabel(setup: ChessPlayerSetup, withModel = false): string {
  const parts = [CHESS_KIND_LABELS[setup.kind]];
  if (usesSearch(setup.kind) || setup.kind === "stockfish") parts.push(`depth ${setup.depth}`);
  if (withModel && usesChessJev(setup.kind) && setup.model) parts.push(setup.model);
  if (usesChessJev(setup.kind)) {
    if (!setup.board) parts.push("no piece lists");
    if (!setup.safety) parts.push("no threats");
    if (setup.instructions) parts.push("custom instructions");
  }
  return parts.join(", ");
}

/** One sentence on what a Jev player's request asks. `options` is the number of moves Jev chooses from. */
export function chessJevRequestAbout(setup: ChessPlayerSetup, color: ChessColor, options: number): string {
  if (setup.kind === "jev-all") return `Jev picks ${COLOR_LABEL[color]}'s move from all ${options} legal moves.`;
  return `Jev picks ${COLOR_LABEL[color]}'s move from the ${options} candidates the code search kept.`;
}

export const CANDIDATE_RULE =`Candidates: moves within ${CANDIDATE_MARGIN} centipawns of the code's best move, at most ${MAX_CANDIDATES}.`;

/**
 * Common chess terms for how much a move gives away. A grade with win% data uses Lichess's label.
 * An older grade uses the centipawn loss.
 */
export function gradeLabel(grade: ChessGrade): { label: string; tone: Tone } {
  const { loss } = grade;
  if (loss === 0) return { label: "Best move", tone: "good" };
  if (grade.judgement !== undefined) {
    if (grade.judgement === "blunder") return { label: "Blunder", tone: "bad" };
    if (grade.judgement === "mistake") return { label: "Mistake", tone: "bad" };
    if (grade.judgement === "inaccuracy") return { label: "Inaccuracy", tone: "neutral" };
    return { label: "Good", tone: "good" };
  }
  if (loss < 50) return { label: "Good", tone: "good" };
  if (loss < 100) return { label: "Inaccuracy", tone: "neutral" };
  if (loss < 300) return { label: "Mistake", tone: "bad" };
  return { label: "Blunder", tone: "bad" };
}

/** Points of win% a move gives away, for example "−11.2%". "–" for a grade saved before win%. */
export const formatWinLoss = (grade: ChessGrade): string => (grade.winLoss === undefined ? "–" : grade.winLoss === 0 ? "0%" : `−${grade.winLoss.toFixed(1)}%`);

export function formatCentipawns(cp: number): string {
  if (Math.abs(cp) >= 90_000) return cp > 0 ? "Mate" : "Mated";
  const pawns = cp / 100;
  return `${pawns > 0 ? "+" : pawns < 0 ? "−" : ""}${Math.abs(pawns).toFixed(2)}`;
}

/** Filled glyphs for both colours; CSS colours them. The variation selector keeps them as text, not emoji. */
export const PIECE_GLYPH: Record<string, string> = {
  k: "♚︎",
  q: "♛︎",
  r: "♜︎",
  b: "♝︎",
  n: "♞︎",
  p: "♟︎",
};
