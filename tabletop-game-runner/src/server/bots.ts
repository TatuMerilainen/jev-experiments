import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { moveScores, outcomeOf, perfectMove } from "../shared/solver";
import { legalMoves, toMove } from "../shared/tictactoe";
import { JEV_KINDS, type Board, type BotConfig, type Candidate, type Decision, type Mark } from "../shared/types";
import { chooseDirect, jevExampleOf, judgeLeaves, newTotals } from "./jev";
import { collectLeaves, lookahead, neutralEvaluator, pickCandidate, type Leaf } from "./search";

export interface DecideDeps {
  /** Called only when the bot needs Jev. */
  client: () => TypeSafeClient;
  signal?: AbortSignal;
}

export async function decide(board: Board, config: BotConfig, deps: DecideDeps): Promise<Decision> {
  const started = performance.now();
  const player = toMove(board);
  const moves = legalMoves(board);
  if (moves.length === 0) throw new Error("The game is over.");
  const totals = newTotals();

  const finish = (move: number, valueKind: Decision["valueKind"], candidates: Candidate[], extra: Partial<Decision> = {}): Decision => ({
    player,
    config,
    move,
    valueKind,
    candidates,
    stats: {
      serverMs: performance.now() - started,
      jevRequests: totals.requests,
      inputTokens: totals.inputTokens,
      requestMs: totals.requestMs,
    },
    model: totals.model,
    jevExample: jevExampleOf(totals),
    ...extra,
  });

  if (moves.length === 1 && JEV_KINDS.includes(config.kind)) {
    return finish(moves[0]!, "none", [{ move: moves[0]!, value: null }]);
  }

  switch (config.kind) {
    case "random": {
      const move = moves[Math.floor(Math.random() * moves.length)]!;
      return finish(move, "none", moves.map((m) => ({ move: m, value: null })));
    }
    case "perfect": {
      const candidates = moveScores(board).map(({ move, score }) => ({ move, value: outcomeOf(score) }));
      return finish(perfectMove(board), "outcome", candidates);
    }
    case "code-only": {
      const candidates = await lookahead(board, config.depth, neutralEvaluator);
      return finish(pickCandidate(candidates).move, "outcome", candidates);
    }
    case "jev-lookahead": {
      const client = deps.client();
      let leaves: Decision["leaves"] = [];
      const evaluate = async (toJudge: Leaf[], you: Mark) => {
        const judged = await judgeLeaves(client, toJudge, you, totals, {
          lines: config.lines,
          instructions: config.instructions,
          model: config.model,
          signal: deps.signal,
        });
        leaves = judged.judgements;
        return judged.values;
      };
      const candidates = await lookahead(board, config.depth, evaluate, true);
      const exactLeaves = collectLeaves(board, config.depth, true).known.length;
      return finish(pickCandidate(candidates).move, "outcome", candidates, { leaves, exactLeaves });
    }
    case "jev-direct": {
      const { probabilities, runs } = await chooseDirect(deps.client(), board, totals, {
        lines: config.lines,
        instructions: config.instructions,
        model: config.model,
        signal: deps.signal,
      });
      const candidates = moves.map((m) => ({ move: m, value: probabilities.get(m) ?? 0 }));
      return finish(pickCandidate(candidates).move, "probability", candidates, { directRuns: runs });
    }
  }
}

