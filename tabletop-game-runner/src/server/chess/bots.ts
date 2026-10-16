import type { TypeSafeClient } from "@typesafe-ai/sdk";
import type { Chess, Move } from "chess.js";
import { playLine, type GameLine } from "../../shared/chess/line";
import {
  CANDIDATE_MARGIN,
  MAX_CANDIDATES,
  type ChessBotKind,
  type ChessCandidate,
  type ChessDecision,
  type ChessGrade,
  type ChessPlayerSetup,
} from "../../shared/chess/types";
import { jevExampleOf, newTotals } from "../jev";
import { candidates, scoreMoves } from "./engine";
import { pickWithJev } from "./jev";
import { judgement, winPercent, type EngineScore } from "../../shared/chess/winPercent";
import { stockfish, type Analysis } from "./stockfish";

const GRADE_DEPTH = 12;
const LOSS_CAP = 1000;

export interface ChessDeps {
  client: () => TypeSafeClient;
  signal?: AbortSignal;
}

/** Replays UCI moves from the start position. Throws on an illegal move. */
export const replay = (moves: string[]): Chess => playLine({ moves });

const toUci = (m: Move) => m.from + m.to + (m.promotion ?? "");

/** The player's move after `line`. A game starts at the normal start position; a puzzle starts from its own FEN. */
export async function decideChess(line: GameLine, setup: ChessPlayerSetup & { kind: ChessBotKind }, deps: ChessDeps): Promise<ChessDecision> {
  const started = performance.now();
  const game = playLine(line);
  const legal = game.moves({ verbose: true });
  if (legal.length === 0 || game.isGameOver()) throw new Error("The game is over.");
  const totals = newTotals();
  let searchMs = 0;
  let jevMs = 0;

  const finish = (move: Move, list: ChessCandidate[], note?: string): ChessDecision => ({
    player: game.turn(),
    kind: setup.kind,
    san: move.san,
    uci: toUci(move),
    legalCount: legal.length,
    candidates: list,
    note,
    stats: {
      serverMs: performance.now() - started,
      searchMs,
      jevMs,
      jevRequests: totals.requests,
      inputTokens: totals.inputTokens,
    },
    model: totals.model,
    jevExample: jevExampleOf(totals),
  });

  const timed = <T>(work: () => T): T => {
    const t = performance.now();
    const value = work();
    searchMs += performance.now() - t;
    return value;
  };

  switch (setup.kind) {
    case "random": {
      const move = legal[Math.floor(Math.random() * legal.length)]!;
      return finish(move, []);
    }
    case "stockfish": {
      const t = performance.now();
      const { bestUci } = await stockfish.analyse(line, setup.depth);
      searchMs = performance.now() - t;
      const move = legal.find((m) => toUci(m) === bestUci) ?? legal[0]!;
      return finish(move, []);
    }
    case "code": {
      const scored = timed(() => scoreMoves(line, setup.depth, CANDIDATE_MARGIN));
      const list = candidates(scored, CANDIDATE_MARGIN, MAX_CANDIDATES).map((s) => ({ san: s.move.san, uci: toUci(s.move), score: s.score }));
      return finish(scored[0]!.move, list);
    }
    case "jev":
    case "jev-all": {
      let options: Move[];
      let scores = new Map<string, number>();
      if (setup.kind === "jev") {
        const scored = timed(() => scoreMoves(line, setup.depth, CANDIDATE_MARGIN));
        const top = candidates(scored, CANDIDATE_MARGIN, MAX_CANDIDATES);
        options = top.map((s) => s.move);
        scores = new Map(top.map((s) => [s.move.san, s.score]));
      } else {
        options = legal;
      }
      if (options.length === 1) {
        const only = options[0]!;
        return finish(only, [{ san: only.san, uci: toUci(only), score: scores.get(only.san) }], "Only one candidate, so no Jev call.");
      }
      const t = performance.now();
      const pick = await pickWithJev(deps.client(), game, options, totals, {
        board: setup.board,
        safety: setup.safety,
        instructions: setup.instructions,
        model: setup.model,
        signal: deps.signal,
      });
      jevMs = performance.now() - t;
      // Highest probability wins; ties go to the code's order.
      const chosen = options.reduce((best, m) => ((pick.probabilities.get(m.san) ?? 0) > (pick.probabilities.get(best.san) ?? 0) ? m : best));
      const list = options.map((m) => ({
        san: m.san,
        uci: toUci(m),
        score: scores.get(m.san),
        description: pick.descriptions.get(m.san),
        probability: pick.probabilities.get(m.san),
      }));
      return finish(chosen, list);
    }
  }
}

const engineScore = (a: Analysis): EngineScore => (a.mate !== undefined ? { mate: a.mate } : { cp: a.score });
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Centipawns and win% the move gives away against Stockfish's best move, and Lichess's label. */
export async function gradeChessMove(moves: string[], uci: string): Promise<ChessGrade> {
  const game = replay(moves);
  const legal = game.moves({ verbose: true });
  const played = legal.find((m) => toUci(m) === uci);
  if (!played) throw new Error(`Illegal move: ${uci}`);
  const best = await stockfish.analyse({ moves }, GRADE_DEPTH);
  const bestSan = legal.find((m) => toUci(m) === best.bestUci)?.san ?? best.bestUci;
  const before = engineScore(best);
  const winBefore = round2(winPercent(before));
  if (best.bestUci === uci) return { loss: 0, bestSan, depth: GRADE_DEPTH, winBefore, winAfter: winBefore, winLoss: 0, judgement: null };
  const mine = await stockfish.analyse({ moves }, GRADE_DEPTH, uci);
  const after = engineScore(mine);
  const winAfter = round2(winPercent(after));
  return {
    loss: Math.min(LOSS_CAP, Math.max(0, best.score - mine.score)),
    bestSan,
    depth: GRADE_DEPTH,
    winBefore,
    winAfter,
    winLoss: round2(Math.max(0, winBefore - winAfter)),
    judgement: judgement(before, after),
  };
}
