import { validateFen } from "chess.js";
import { MAX_INSTRUCTIONS_LENGTH } from "../../shared/prompts";
import {
  CHESS_BOT_KINDS,
  SEARCH_DEPTHS,
  type ChessBotKind,
  type ChessDecideRequest,
  type ChessGradeRequest,
  type ChessPlayerSetup,
} from "../../shared/chess/types";
import { HttpError } from "../http-error";
import { parseJevModel } from "../jev";

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MAX_MOVES = 600;
const MAX_STOCKFISH_DEPTH = 20;

function parseMoves(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_MOVES || !value.every((m) => typeof m === "string" && UCI.test(m))) {
    throw new HttpError(400, `moves must be an array of at most ${MAX_MOVES} UCI moves, such as "e2e4".`);
  }
  return value as string[];
}

export function parseChessDecide(body: unknown): ChessDecideRequest & { player: ChessPlayerSetup & { kind: ChessBotKind } } {
  const { start, moves, player } = (body ?? {}) as Partial<ChessDecideRequest>;
  if (start !== undefined && (typeof start !== "string" || !validateFen(start).ok)) throw new HttpError(400, "start must be a valid FEN.");
  const setup = (player ?? {}) as Partial<ChessPlayerSetup>;
  if (!CHESS_BOT_KINDS.includes(setup.kind as ChessBotKind)) {
    throw new HttpError(400, `player.kind must be one of: ${CHESS_BOT_KINDS.join(", ")}.`);
  }
  const kind = setup.kind as ChessBotKind;
  const depth = Number(setup.depth ?? 2);
  const validDepth =
    kind === "stockfish" ? Number.isInteger(depth) && depth >= 1 && depth <= MAX_STOCKFISH_DEPTH : (SEARCH_DEPTHS as readonly number[]).includes(depth);
  if (!validDepth) throw new HttpError(400, "player.depth is out of range.");
  const instructions = typeof setup.instructions === "string" ? setup.instructions.trim() : "";
  if (instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    throw new HttpError(400, `player.instructions can be at most ${MAX_INSTRUCTIONS_LENGTH} characters.`);
  }
  return {
    ...(start !== undefined ? { start } : {}),
    moves: parseMoves(moves),
    player: { kind, depth, board: setup.board !== false, safety: setup.safety !== false, instructions: instructions || null, model: parseJevModel(setup.model) },
  };
}

export function parseChessGrade(body: unknown): ChessGradeRequest {
  const { moves, uci } = (body ?? {}) as Partial<ChessGradeRequest>;
  if (typeof uci !== "string" || !UCI.test(uci)) throw new HttpError(400, "uci must be a move such as \"e2e4\".");
  return { moves: parseMoves(moves), uci };
}
