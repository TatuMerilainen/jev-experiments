import { choice, score, type JsonValue, type Questions, type SystemOneRequest, type TypeSafeClient } from "@typesafe-ai/sdk";
import { DIRECT_INSTRUCTIONS, LOOKAHEAD_INSTRUCTIONS, positionLevels } from "../shared/prompts";
import { boardRows, cellName, legalMoves, lineContents, other, RULES, toMove } from "../shared/tictactoe";
import { DEFAULT_JEV_MODEL, JEV_MODELS, type Board, type DirectRun, type JevExample, type LeafJudgement, type Mark } from "../shared/types";
import { HttpError } from "./http-error";
import type { Leaf } from "./search";

// The rate limit is 80 requests per second; the SDK retries 429 responses with backoff.
const CONCURRENCY = 16;

export interface JevTotals {
  requests: number;
  inputTokens: number;
  requestMs: number[];
  model?: string;
  /** The first request sent, and its response once it arrives. */
  example?: { request: JevExample["request"]; response?: JevExample["response"] };
}

export const newTotals = (): JevTotals => ({ requests: 0, inputTokens: 0, requestMs: [] });

interface Options {
  lines: boolean;
  instructions: string | null;
  model: string;
  signal?: AbortSignal;
}

export function positionState(board: Board, you: Mark, lines: boolean): Record<string, JsonValue> {
  const state: Record<string, JsonValue> = {
    game: "tic-tac-toe",
    rules: RULES,
    you_play: you,
    opponent: other(you),
    to_move: toMove(board),
    board: boardRows(board),
  };
  if (lines) state.lines = lineContents(board);
  return state;
}

export function positionQuestion(you: Mark, instructions: string | null) {
  return score(instructions ?? LOOKAHEAD_INSTRUCTIONS, positionLevels(you));
}

/** The default prompt texts, saved with each experiment so old results stay tied to their wording. */
export function promptSnapshot() {
  return {
    rules: RULES,
    positionQuestion: { X: positionQuestion("X", null), O: positionQuestion("O", null) },
    directInstructions: DIRECT_INSTRUCTIONS,
  };
}

/** P(win) − P(loss), from the probabilities of the levels loss, draw and win. It equals the expected level minus 1. */
export const leafValue = (probabilities: number[]): number => (probabilities[2] ?? 0) - (probabilities[0] ?? 0);

/** One Jev request per leaf position. Returns a value per leaf key, from `you`'s view. */
export async function judgeLeaves(
  client: TypeSafeClient,
  leaves: Leaf[],
  you: Mark,
  totals: JevTotals,
  { lines, instructions, model, signal }: Options,
): Promise<{ values: Map<string, number>; judgements: LeafJudgement[] }> {
  const question = positionQuestion(you, instructions);
  const judgements = await mapLimit(leaves, CONCURRENCY, signal, async (leaf, leafSignal) => {
    const request = { model, state: positionState(leaf.board, you, lines), questions: { position: question } };
    const { answers, ms } = await send(client, request, totals, leafSignal);
    const answer = answers.position;
    const byLevel = answer.probabilities as Record<string, number>;
    const probabilities = question.criteria.map((_, i) => byLevel[String(i)] ?? 0);
    return {
      key: leaf.key,
      judgement: {
        board: leaf.board,
        score: answer.score,
        probabilities,
        confidence: answer.confidence,
        value: leafValue(probabilities),
        ms,
        uses: leaf.uses,
      } satisfies LeafJudgement,
    };
  });
  return {
    values: new Map(judgements.map((j) => [j.key, j.judgement.value])),
    judgements: judgements.map((j) => j.judgement),
  };
}

/**
 * One request with two Choice questions over the legal moves: in cell order and in reverse order.
 * Jev can lean towards the first option, so the two answers are averaged.
 * One request bills the state once. Two requests cost about 40% more.
 */
export async function chooseDirect(
  client: TypeSafeClient,
  board: Board,
  totals: JevTotals,
  { lines, instructions, model, signal }: Options,
): Promise<{ probabilities: Map<number, number>; runs: DirectRun[] }> {
  const you = toMove(board);
  const moves = legalMoves(board);
  const reversed = [...moves].reverse();
  const criteria = (order: number[]) => Object.fromEntries(order.map((m) => [cellName(m), `Place ${you} in ${cellName(m)}.`]));
  const question = instructions ?? DIRECT_INSTRUCTIONS;
  const request = {
    model,
    state: { ...positionState(board, you, lines), legal_moves: moves.map(cellName) },
    questions: { normal: choice(question, criteria(moves)), reversed: choice(question, criteria(reversed)) },
  };
  const { answers, ms } = await send(client, request, totals, signal);
  const runOf = (order: number[], answer: { probabilities: unknown }): DirectRun => {
    const byName = answer.probabilities as Record<string, number>;
    return { order, probabilities: Object.fromEntries(order.map((m) => [m, byName[cellName(m)] ?? 0])), ms };
  };
  const runs = [runOf(moves, answers.normal), runOf(reversed, answers.reversed)];
  const probabilities = new Map(moves.map((m) => [m, runs.reduce((sum, r) => sum + (r.probabilities[m] ?? 0), 0) / runs.length]));
  return { probabilities, runs };
}

/** A player's Jev version from a request. A missing value means the default version. */
export function parseJevModel(value: unknown): string {
  if (value === undefined || value === null || value === "") return DEFAULT_JEV_MODEL;
  if (typeof value !== "string" || !(JEV_MODELS as readonly string[]).includes(value)) {
    throw new HttpError(400, `player.model must be one of: ${JEV_MODELS.join(", ")}.`);
  }
  return value;
}

export function jevExampleOf(totals: JevTotals): JevExample | undefined {
  const { request, response } = totals.example ?? {};
  return request && response ? { request, response } : undefined;
}

export async function send<const Q extends Questions>(
  client: TypeSafeClient,
  request: SystemOneRequest<Q>,
  totals: JevTotals,
  signal?: AbortSignal,
) {
  // Requests run in parallel, so the call that starts first keeps the example and adds its own response.
  let example: JevTotals["example"];
  if (!totals.example) {
    example = totals.example = { request: { model: request.model ?? client.defaultModel, state: request.state, questions: request.questions } };
  }
  const started = performance.now();
  const response = await client.systemOne(request, { signal });
  const ms = performance.now() - started;
  if (example) example.response = { model: response.model, answers: response.answers, usage: response.usage, ms };
  totals.requests++;
  totals.inputTokens += response.usage.input_tokens;
  totals.requestMs.push(ms);
  totals.model = response.model;
  return { answers: response.answers, ms };
}

/**
 * Runs `fn` on every item, at most `limit` at a time. The move fails when one request fails,
 * so the first failure starts no more requests and aborts the ones in flight. Each would cost money for nothing.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  signal: AbortSignal | undefined,
  fn: (item: T, signal: AbortSignal) => Promise<R>,
): Promise<R[]> {
  const failed = new AbortController();
  const stop = signal ? AbortSignal.any([signal, failed.signal]) : failed.signal;
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length && !stop.aborted) {
      const i = next++;
      try {
        results[i] = await fn(items[i]!, stop);
      } catch (error) {
        failed.abort(error);
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  stop.throwIfAborted();
  return results;
}
