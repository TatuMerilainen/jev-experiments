import { choice, type TypeSafeClient } from "@typesafe-ai/sdk";
import type { AskResponse } from "../shared/types";

const QUESTION = choice("Answer the question in `question` with yes, no or pizza.", {
  yes: "The answer to the question is yes.",
  no: "The answer to the question is no.",
  pizza: "The question has no yes-or-no answer, or the best answer is pizza.",
});

/** One Jev request with one Choice question. */
export async function ask(client: TypeSafeClient, question: string, model: string, signal: AbortSignal): Promise<AskResponse> {
  const request = { model, state: { question }, questions: { answer: QUESTION } };
  const started = performance.now();
  const response = await client.systemOne(request, { signal });
  const ms = performance.now() - started;
  const { choice: answer, confidence } = response.answers.answer;
  return {
    answer,
    confidence,
    jev: { request, response: { model: response.model, answers: response.answers, usage: response.usage, ms } },
  };
}
