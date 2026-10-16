import type { JsonValue, Questions, Usage } from "@typesafe-ai/sdk";

export const DEFAULT_JEV_MODEL = "jev-1.14.0";
export const MAX_QUESTION_LENGTH = 500;

export type Answer = "yes" | "no" | "pizza";

export interface StatusResponse {
  jevConfigured: boolean;
  model: string;
}

/** One Jev call: what was sent and what came back. */
export interface JevExample {
  request: { model: string; state: JsonValue; questions: Questions };
  response: { model: string; answers: Record<string, unknown>; usage: Usage; ms: number };
}

export interface AskResponse {
  answer: Answer;
  confidence: number;
  jev: JevExample;
}
