import { TypeSafeClient } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";
import { decide } from "../src/server/bots";
import { leafValue, parseJevModel } from "../src/server/jev";
import { exactLeaf, lookahead, neutralEvaluator } from "../src/server/search";
import { gradeMove, negamax, outcomeOf } from "../src/shared/solver";
import { cellIndex, cellName, emptyBoard, play, toMove } from "../src/shared/tictactoe";
import type { Cell } from "../src/shared/types";
import { parseRows } from "./helpers";

interface Sent {
  model?: string;
  state: { you_play: string; to_move: string; board: string[]; lines?: unknown; legal_moves?: string[] };
  questions: Record<string, { type: string; instructions: string; criteria: unknown }>;
}

/** A fake TypeSafe API that answers with the true game value, so the bot should play perfectly. */
function fakeClient(sent: Sent[]) {
  const fetch = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Sent;
    sent.push(body);
    let answers: unknown;
    if (body.questions.position) {
      const b: Cell[] = parseRows(body.state.board);
      const outcome = (toMove(b) === body.state.you_play ? 1 : -1) * outcomeOf(negamax(b));
      const probabilities = { "0": 0, "1": 0, "2": 0, [String(outcome + 1)]: 1 };
      answers = { position: { type: "score", score: outcome + 1, confidence: 1, legend: {}, probabilities } };
    } else {
      // Every Choice favours its first option.
      answers = Object.fromEntries(
        Object.entries(body.questions).map(([key, q]) => {
          const options = Object.keys(q.criteria as object);
          const probabilities = Object.fromEntries(options.map((o, i) => [o, i === 0 ? 0.7 : 0.3 / (options.length - 1)]));
          return [key, { type: "choice", choice: options[0], confidence: 0.6, probabilities }];
        }),
      );
    }
    return new Response(JSON.stringify({ model: "jev-test", answers, usage: { input_tokens: 100, output_tokens: 5 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return new TypeSafeClient({ apiKey: "test", fetch, logLevel: "off" });
}

describe("Jev players with a fake API", () => {
  it("jev-lookahead sends one Score request per distinct leaf and uses the answers", async () => {
    const sent: Sent[] = [];
    const client = fakeClient(sent);
    const decision = await decide(emptyBoard(), { kind: "jev-lookahead", depth: 2, lines: true, instructions: null, model: "jev-1.14.0" }, { client: () => client });

    expect(sent).toHaveLength(12);
    expect(decision.stats.jevRequests).toBe(12);
    expect(decision.stats.inputTokens).toBe(1200);
    expect(decision.model).toBe("jev-test");
    expect(decision.leaves).toHaveLength(12);
    const question = sent[0]!.questions.position!;
    expect(question.type).toBe("score");
    expect(question.criteria).toHaveLength(3);
    expect(sent[0]!.state.lines).toBeDefined();
    expect(sent[0]!.state.you_play).toBe("X");
    expect(gradeMove(emptyBoard(), decision.move).optimal).toBe(true);
  });

  it("keeps the first request together with its own answer, for the sidebar", async () => {
    const sent: Sent[] = [];
    const decision = await decide(emptyBoard(), { kind: "jev-lookahead", depth: 2, lines: true, instructions: null, model: "jev-1.14.0" }, { client: () => fakeClient(sent) });

    const example = decision.jevExample!;
    expect(example.request.state).toEqual(sent[0]!.state);
    expect(example.request.questions).toEqual(sent[0]!.questions);
    const state = example.request.state as Sent["state"];
    const b = parseRows(state.board);
    const outcome = (toMove(b) === state.you_play ? 1 : -1) * outcomeOf(negamax(b));
    expect((example.response.answers.position as { score: number }).score).toBe(outcome + 1);
    expect(example.response.model).toBe("jev-test");
    expect(example.response.usage.input_tokens).toBe(100);
  });

  it("sends each request with the player's model", async () => {
    const sent: Sent[] = [];
    await decide(emptyBoard(), { kind: "jev-lookahead", depth: 1, lines: true, instructions: null, model: "jev-1.13.0" }, { client: () => fakeClient(sent) });
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((s) => s.model === "jev-1.13.0")).toBe(true);
  });

  it("accepts only the listed Jev models", () => {
    expect(parseJevModel(undefined)).toBe("jev-1.14.0");
    expect(parseJevModel("jev-1.13.0")).toBe("jev-1.13.0");
    expect(() => parseJevModel("jev-latest")).toThrow(/player.model/);
  });

  it("leaves out the lines when the option is off", async () => {
    const sent: Sent[] = [];
    const client = fakeClient(sent);
    await decide(emptyBoard(), { kind: "jev-lookahead", depth: 1, lines: false, instructions: null, model: "jev-1.14.0" }, { client: () => client });
    expect(sent.every((s) => s.state.lines === undefined)).toBe(true);
  });

  it("jev-direct sends one request with the option order reversed in the second question, and averages", async () => {
    const sent: Sent[] = [];
    const client = fakeClient(sent);
    const board = parseRows(["X . .", ". O .", ". . ."]);
    const decision = await decide(board, { kind: "jev-direct", depth: 2, lines: true, instructions: null, model: "jev-1.14.0" }, { client: () => client });

    expect(sent).toHaveLength(1);
    expect(decision.stats.jevRequests).toBe(1);
    const { normal, reversed } = sent[0]!.questions;
    const order = Object.keys(normal!.criteria as object);
    expect(order).toEqual(sent[0]!.state.legal_moves);
    expect(Object.keys(reversed!.criteria as object)).toEqual([...order].reverse());
    expect(decision.directRuns).toHaveLength(2);
    // The fake favours the first option; reversing the order cancels that out for the two ends.
    const first = decision.candidates.find((c) => cellName(c.move) === order[0])!;
    const last = decision.candidates.find((c) => cellName(c.move) === order.at(-1))!;
    expect(first.value).toBeCloseTo(last.value!);
  });

  it("sends the player's own instructions when set", async () => {
    const sent: Sent[] = [];
    const client = fakeClient(sent);
    const custom = "How likely is `you_play` to win from here?";
    await decide(emptyBoard(), { kind: "jev-lookahead", depth: 1, lines: true, instructions: custom, model: "jev-1.14.0" }, { client: () => client });
    expect(sent.every((s) => s.questions.position!.instructions === custom)).toBe(true);

    const board = parseRows(["X . .", ". O .", ". . ."]);
    await decide(board, { kind: "jev-direct", depth: 2, lines: true, instructions: custom, model: "jev-1.14.0" }, { client: () => client });
    expect(sent.at(-1)!.questions.normal!.instructions).toBe(custom);
    expect(sent.at(-1)!.questions.reversed!.instructions).toBe(custom);
  });

  it("plays the only legal move without calling Jev", async () => {
    const sent: Sent[] = [];
    const client = fakeClient(sent);
    const board = parseRows(["X O X", "X O O", "O X ."]);
    const decision = await decide(board, { kind: "jev-lookahead", depth: 2, lines: true, instructions: null, model: "jev-1.14.0" }, { client: () => client });
    expect(decision.move).toBe(8);
    expect(sent).toHaveLength(0);
  });

  // The first request fails fast. The others answer later, unless they are aborted first.
  function failingClient() {
    const count = { calls: 0, aborted: 0 };
    const fetch = (_url: string, init?: RequestInit) => {
      const n = ++count.calls;
      return new Promise<Response>((resolve, reject) => {
        const answer = () => {
          if (n === 1) return resolve(new Response(JSON.stringify({ error: "bad request" }), { status: 400 }));
          const position = { type: "score", score: 1, confidence: 1, legend: {}, probabilities: { "0": 0, "1": 1, "2": 0 } };
          resolve(new Response(JSON.stringify({ model: "jev-test", answers: { position }, usage: { input_tokens: 100, output_tokens: 5 } })));
        };
        const timer = setTimeout(answer, n === 1 ? 5 : 50);
        init?.signal?.addEventListener("abort", () => {
          count.aborted++;
          clearTimeout(timer);
          reject(init.signal!.reason);
        });
      });
    };
    return { count, client: new TypeSafeClient({ apiKey: "test", fetch, logLevel: "off" }) };
  }
  const depth3 = { kind: "jev-lookahead", depth: 3, lines: true, instructions: null, model: "jev-1.14.0" } as const;

  it("stops sending look-ahead requests after the first one fails", async () => {
    // Depth 3 from the empty board has 38 distinct leaves. Only the first 16 start, and the other 15 of them are aborted.
    const { count, client } = failingClient();
    await expect(decide(emptyBoard(), depth3, { client: () => client })).rejects.toThrow();
    expect(count).toEqual({ calls: 16, aborted: 15 });
  });

  it("aborts the requests in flight when one fails", async () => {
    // Depth 3 after X b2 has 24 distinct leaves, and code decides 18 of them. The other 6 start together.
    const { count, client } = failingClient();
    await expect(decide(play(emptyBoard(), cellIndex("b2")), depth3, { client: () => client })).rejects.toThrow();
    expect(count).toEqual({ calls: 6, aborted: 5 });
  });

  it("turns the three level probabilities into P(win) − P(loss)", () => {
    expect(leafValue([1, 0, 0])).toBe(-1);
    expect(leafValue([0, 1, 0])).toBe(0);
    expect(leafValue([0, 0, 1])).toBe(1);
    expect(leafValue([0.2, 0.5, 0.3])).toBeCloseTo(0.1);
  });

  it("decides leaves with a known result in code, with no Jev request", async () => {
    // X to move. After X's move and O's reply, X often has two in a line with the third cell empty.
    const sent: Sent[] = [];
    const board = parseRows(["X . .", ". O .", ". . ."]);
    const decision = await decide(board, { ...depth3, depth: 2 }, { client: () => fakeClient(sent) });
    expect(decision.exactLeaves).toBeGreaterThan(0);
    expect(sent).toHaveLength(decision.leaves!.length);
    for (const s of sent) {
      const b = parseRows(s.state.board);
      expect(exactLeaf(b)).toBeNull();
    }
  });
});

describe("leaves with a known result", () => {
  it("are a win when the player to move completes a line", () => {
    // X to move, X has a1 and b1 with c1 empty.
    expect(exactLeaf(parseRows(["X X .", "O O .", ". . ."]))).toBe(1);
  });

  it("are a loss when the opponent has two different winning cells", () => {
    // O to move. O cannot complete a line. X completes a1-c1 at c1 and a1-a3 at a3.
    expect(exactLeaf(parseRows(["X X .", "X O .", ". . O"]))).toBe(-1);
  });

  it("need an estimate otherwise", () => {
    // One winning cell for the opponent can still be blocked.
    expect(exactLeaf(parseRows(["X X .", ". O .", ". . ."]))).toBeNull();
    expect(exactLeaf(emptyBoard())).toBeNull();
  });

  it("count in the search like a finished game, without the estimate weight", async () => {
    // O to move. X threatens c1 and a3, and O can block only one of them.
    const board = parseRows(["X X .", "X O .", ". . O"]);
    const values = async (exact: boolean) => (await lookahead(board, 1, neutralEvaluator, exact)).map((c) => c.value);
    expect(new Set(await values(true))).toEqual(new Set([-1]));
    expect(new Set(await values(false))).toEqual(new Set([0]));
  });
});
