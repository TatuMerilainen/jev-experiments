import { choice, type JsonValue, type TypeSafeClient } from "@typesafe-ai/sdk";
import type { Chess, Move } from "chess.js";
import {
  basicText,
  COLOR_NAME,
  defaultChessInstructions,
  lastMoveText,
  materialText,
  pieceLists,
  positionCounts,
  repetitionText,
  safetyText,
} from "../../shared/chess/text";
import { CANDIDATE_MARGIN, MAX_CANDIDATES } from "../../shared/chess/types";
import { send, type JevTotals } from "../jev";

/** The default prompt texts and limits, saved with each chess experiment. */
export function chessPromptSnapshot() {
  return {
    defaultInstructions: { White: defaultChessInstructions("w"), Black: defaultChessInstructions("b") },
    stateFields: ["you_play", "white_pieces", "black_pieces", "material", "last_move", "check", "candidates"],
    questions: "Two Choice questions over the candidates: normal order and reversed order, averaged.",
    candidateMargin: CANDIDATE_MARGIN,
    maxCandidates: MAX_CANDIDATES,
  };
}

export interface PickOptions {
  board: boolean;
  safety: boolean;
  instructions: string | null;
  model: string;
  signal?: AbortSignal;
}

export interface JevPick {
  /** Average probability over both option orders, per SAN. */
  probabilities: Map<string, number>;
  descriptions: Map<string, string>;
}

/**
 * One request per move, as measured in the chess research: the state holds the side to move, the piece lists,
 * the material, the last move and the candidates with plain-language descriptions. Two Choice questions ask the
 * same thing in normal and reversed option order, because Jev can lean towards the first option.
 */
export async function pickWithJev(client: TypeSafeClient, game: Chess, moves: Move[], totals: JevTotals, options: PickOptions): Promise<JevPick> {
  const color = game.turn();
  const history = game.history({ verbose: true });
  const counts = positionCounts(history, game.fen());
  const describe = (m: Move) => (options.safety ? safetyText(game, m, counts) : [basicText(m), repetitionText(m, counts)].filter(Boolean).join("; "));
  const descriptions = new Map(moves.map((m) => [m.san, describe(m)]));
  const last = history.at(-1);

  const state: Record<string, JsonValue> = {
    you_play: COLOR_NAME[color],
    ...(options.board ? pieceLists(game) : {}),
    material: materialText(game),
    ...(last ? { last_move: lastMoveText(last) } : {}),
    ...(game.inCheck() ? { check: `${COLOR_NAME[color]} is in check.` } : {}),
    candidates: Object.fromEntries(descriptions),
  };
  const instructions = options.instructions ?? defaultChessInstructions(color);
  const keys = moves.map((m) => m.san);
  const asOptions = (order: string[]) => Object.fromEntries(order.map((k) => [k, null]));

  const { answers } = await send(
    client,
    {
      model: options.model,
      state,
      questions: {
        normal: choice(instructions, asOptions(keys)),
        reversed: choice(instructions, asOptions([...keys].reverse())),
      },
    },
    totals,
    options.signal,
  );
  const normal = answers.normal.probabilities as Record<string, number>;
  const reversed = answers.reversed.probabilities as Record<string, number>;
  const probabilities = new Map(keys.map((k) => [k, ((normal[k] ?? 0) + (reversed[k] ?? 0)) / 2]));
  return { probabilities, descriptions };
}
