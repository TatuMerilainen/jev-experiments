import { TypeSafeClient } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";
import { parseChessDecide, parseChessGrade } from "../src/server/chess/api";
import { decideChess, gradeChessMove, replay } from "../src/server/chess/bots";
import { Chess } from "chess.js";
import { candidates, scoreMoves } from "../src/server/chess/engine";
import { stockfish } from "../src/server/chess/stockfish";
import { playLine } from "../src/shared/chess/line";
import { lineAt, puzzleSet, solverMoves } from "../src/shared/chess/puzzles";
import { positionCounts, repetitionText, safetyText } from "../src/shared/chess/text";
import type { ChessBotKind, ChessPlayerSetup } from "../src/shared/chess/types";

/** A position with no history before it. */
const at = (fen: string) => ({ start: fen, moves: [] });
const BACK_RANK = "2r3k1/5ppp/p3p3/1p1n4/3P4/P4N2/1P3PPP/2R3K1 w - - 0 25";

interface Sent {
  state: Record<string, unknown> & { candidates: Record<string, string> };
  questions: Record<string, { type: string; instructions: string; criteria: Record<string, null> }>;
}

/** A fake TypeSafe API. It favours `favourite` when that move is offered, otherwise the last option. */
function fakeClient(sent: Sent[], favourite?: string) {
  const fetch = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Sent;
    sent.push(body);
    const answers: Record<string, unknown> = {};
    for (const [id, q] of Object.entries(body.questions)) {
      const options = Object.keys(q.criteria);
      const pick = favourite && options.includes(favourite) ? favourite : options.at(-1)!;
      const probabilities = Object.fromEntries(options.map((o) => [o, o === pick ? 0.5 : 0.5 / (options.length - 1)]));
      answers[id] = { type: "choice", choice: pick, confidence: 0.3, probabilities };
    }
    return new Response(JSON.stringify({ model: "jev-test", answers, usage: { input_tokens: 700, output_tokens: 10 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return new TypeSafeClient({ apiKey: "test", fetch, logLevel: "off" });
}

const setup = (kind: ChessBotKind, extra: Partial<Omit<ChessPlayerSetup, "kind">> = {}) => ({
  kind,
  depth: 2,
  board: true,
  safety: true,
  instructions: null,
  model: "jev-1.14.0",
  ...extra,
});

describe("chess engine", () => {
  it("scores every legal move from the start position", () => {
    const scored = scoreMoves(at("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"), 2);
    expect(scored).toHaveLength(20);
    expect(scored.every((s) => s.exact)).toBe(true);
  });

  it("finds a mate in one", () => {
    expect(scoreMoves(at(BACK_RANK), 1)[0]!.move.san).toBe("Rxc8#");
  });

  it("takes a free queen", () => {
    const scored = scoreMoves(at("rnb1kbnr/pppp1ppp/8/4p1q1/3P4/2N5/PPP1PPPP/R1BQKBNR w KQkq - 2 3"), 2);
    expect(scored[0]!.move.san).toBe("Bxg5");
  });

  it("gives the same candidates with and without the margin cut-off", () => {
    const fen = "r2q1rk1/ppp2ppp/2np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 4 8";
    const names = (margin?: number) => candidates(scoreMoves(at(fen), 2, margin), 75, 6).map((s) => `${s.move.san}:${s.score}`);
    expect(names(75)).toEqual(names());
  });

  it("keeps a move that scores exactly at the margin, also with the cut-off on", () => {
    // Kd3 scores 85 and the best move 160: exactly 75 below.
    const fen = "rn2kb1r/p4ppp/2pp4/8/8/1pN2PP1/P1P1K2P/R1B3NR w kq - 0 18";
    const names = (margin?: number) => candidates(scoreMoves(at(fen), 2, margin), 75, 99).map((s) => `${s.move.san}:${s.score}`);
    expect(names(75)).toEqual(names());
    expect(names(75)).toContain("Kd3:85");
  });

  it("keeps the code player's top move", () => {
    const fen = "rn2kb1r/p4ppp/2pp4/8/8/1pN2PP1/P1P1K2P/R1B3NR w kq - 0 18";
    expect(scoreMoves(at(fen), 2, 75)[0]!.move.san).toBe(scoreMoves(at(fen), 2)[0]!.move.san);
  });
  it("gives the same candidates with and without the cut-off at depth 3, where the position table and the rounds work", () => {
    const fen = "r2q1rk1/ppp2ppp/2np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 4 8";
    const names = (margin?: number) => candidates(scoreMoves(at(fen), 3, margin), 75, 6).map((s) => `${s.move.san}:${s.score}`);
    expect(names(75)).toEqual(names());
  });

  it("counts the plies to a mate from the root, also for a mate found through the position table", () => {
    const puzzle = puzzleSet("lichess-10")!.puzzles.find((p) => p.themes.includes("mateIn2"))!;
    const [best] = scoreMoves(lineAt(puzzle, 0), 4, 75);
    expect(best!.move.lan).toBe(solverMoves(puzzle)[0]);
    // Mate after 3 plies. MATE is 100,000 in the engine.
    expect(best!.score).toBe(100_000 - 3);
  });

  it("gives the same result on every call", () => {
    const line = at("r2q1rk1/ppp2ppp/2np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 4 8");
    const run = () => scoreMoves(line, 3, 75).map((s) => `${s.move.san}:${s.score}:${s.exact}`);
    expect(run()).toEqual(run());
  });
});

describe("repeated positions", () => {
  // White has an extra rook. The kings and the rook shuffle, so after these moves Ra1 brings back the start position a third time.
  const start = "7k/8/8/8/8/8/8/R5K1 b - - 0 1";
  const shuffle = ["h8g8", "a1a2", "g8h8", "a2a1", "h8g8", "a1a2", "g8h8"];

  it("score 0 in the code search", () => {
    // The knights go out and back, so Ng1 now repeats the position after White's second move.
    const line = { moves: ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6"] };
    const ng1 = (l: { start?: string; moves: string[] }) => scoreMoves(l, 2).find((s) => s.move.san === "Ng1")!.score;
    expect(ng1(line)).toBe(0);
    expect(ng1({ start: playLine(line).fen(), moves: [] })).not.toBe(0);
  });

  it("are avoided by the better side", () => {
    const scored = scoreMoves({ start, moves: shuffle }, 2);
    expect(scored.find((s) => s.move.san === "Ra1")!.score).toBe(0);
    expect(scored[0]!.move.san).not.toBe("Ra1");
    expect(scoreMoves({ start: playLine({ start, moves: shuffle }).fen(), moves: [] }, 2).find((s) => s.move.san === "Ra1")!.score).toBeGreaterThan(400);
  });

  it("are seen by Stockfish through the move history", async () => {
    const { bestUci } = await stockfish.analyse({ start, moves: shuffle }, 8);
    expect(bestUci).not.toBe("a2a1");
  });

  it("are named in the move text", () => {
    const text = (moves: string[], san = "Ra1") => {
      const game = playLine({ start, moves });
      const move = game.moves({ verbose: true }).find((m) => m.san === san)!;
      return repetitionText(move, positionCounts(game.history({ verbose: true }), game.fen()));
    };
    expect(text(shuffle.slice(0, 3), "Rb2")).toBeNull();
    expect(text(shuffle.slice(0, 3))).toBe("this move repeats an earlier position");
    expect(text(shuffle)).toBe("this move repeats an earlier position for the third time, so the game then ends in a draw by repetition");
    const game = playLine({ start, moves: shuffle });
    const ra1 = game.moves({ verbose: true }).find((m) => m.san === "Ra1")!;
    expect(safetyText(game, ra1, positionCounts(game.history({ verbose: true }), game.fen()))).toContain("rook from a2 to a1; this move repeats");
  });
});

describe("chess move text", () => {
  const text = (fen: string, san: string) => {
    const game = new Chess(fen);
    return safetyText(game, game.moves({ verbose: true }).find((m) => m.san === san)!);
  };

  it("leaves out the capture part after checkmate", () => {
    // Scholar's mate: the king cannot take the defended queen.
    const mate = text("r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4", "Qxf7#");
    expect(mate).toContain("gives checkmate");
    expect(mate).not.toContain("can be captured");
    expect(mate).not.toContain("is safe");
  });

  it("does not count a pinned piece as an attacker", () => {
    // The knight on e7 covers d5, but the rook on e1 pins it to the king.
    expect(text("4k3/4n3/8/8/2B5/8/8/4R1K1 w - - 0 1", "Bd5")).toContain("afterwards the bishop on d5 is safe");
  });

  it("counts an en passant capture", () => {
    expect(text("4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1", "e4")).toContain("afterwards the pawn on e4 can be captured by black pawn d4 and is not defended");
  });

  it("does not count a king that cannot take a defended piece", () => {
    // The black king on f5 touches e5, but the white king on d4 defends it.
    const quiet = text("8/8/8/4Pk2/3K4/8/P7/8 w - - 0 1", "a3");
    expect(quiet).not.toContain("in danger");
  });
});

describe("chess players with a fake Jev API", () => {
  const opening = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"];

  it("jev sends one request with both option orders and plays Jev's pick", async () => {
    const sent: Sent[] = [];
    const decision = await decideChess({ moves: opening }, setup("jev"), { client: () => fakeClient(sent, "d3") });
    expect(sent).toHaveLength(1);
    const { state, questions } = sent[0]!;
    expect(state.you_play).toBe("White");
    expect(state.white_pieces).toContain("knight f3");
    expect(state.last_move).toBe("Black played knight from g8 to f6.");
    const normal = Object.keys(questions.normal!.criteria);
    expect(Object.keys(questions.reversed!.criteria)).toEqual([...normal].reverse());
    expect(Object.keys(state.candidates)).toEqual(normal);
    expect(normal.length).toBeGreaterThan(1);
    expect(normal.length).toBeLessThanOrEqual(6);
    expect(decision.san).toBe(normal.includes("d3") ? "d3" : decision.san);
    expect(decision.stats.inputTokens).toBe(700);
    expect(decision.candidates.every((c) => c.description && c.probability !== undefined && c.score !== undefined)).toBe(true);
  });

  it("averages the two orders, so a favourite of the first position alone does not win", async () => {
    const sent: Sent[] = [];
    // With no favourite, each question favours its own last option; the averages tie, and the code's order breaks the tie.
    const decision = await decideChess({ moves: opening }, setup("jev"), { client: () => fakeClient(sent) });
    const normal = Object.keys(sent[0]!.questions.normal!.criteria);
    expect(decision.san).toBe(normal[0]);
  });

  it("leaves out the piece lists and the safety facts when they are off", async () => {
    const sent: Sent[] = [];
    await decideChess({ moves: opening }, setup("jev", { board: false, safety: false }), { client: () => fakeClient(sent) });
    const { state } = sent[0]!;
    expect(state.white_pieces).toBeUndefined();
    expect(Object.values(state.candidates).some((text) => text.includes("afterwards"))).toBe(false);
  });

  it("uses custom instructions", async () => {
    const sent: Sent[] = [];
    const custom = "Which move from `candidates` attacks the most?";
    await decideChess({ moves: opening }, setup("jev", { instructions: custom }), { client: () => fakeClient(sent) });
    expect(sent[0]!.questions.normal!.instructions).toBe(custom);
  });

  it("jev-all offers every legal move", async () => {
    const sent: Sent[] = [];
    const decision = await decideChess({ moves: opening }, setup("jev-all"), { client: () => fakeClient(sent) });
    expect(Object.keys(sent[0]!.state.candidates)).toHaveLength(decision.legalCount);
  });

  it("plays a single candidate without calling Jev", async () => {
    const sent: Sent[] = [];
    const moves = ["f2f3", "e7e5", "g2g4"];
    const decision = await decideChess({ moves }, setup("jev", { depth: 1 }), { client: () => fakeClient(sent) });
    expect(decision.san).toBe("Qh4#");
    expect(sent).toHaveLength(0);
    expect(decision.note).toMatch(/no Jev call/);
  });

  it("code, random and Stockfish players never call Jev", async () => {
    const client = () => {
      throw new Error("no Jev");
    };
    for (const kind of ["code", "random", "stockfish"] as const) {
      const decision = await decideChess({ moves: opening }, setup(kind), { client });
      expect(replay([...opening, decision.uci]).history()).toHaveLength(opening.length + 1);
    }
  });
});

describe("chess move rating", () => {
  it("rates the best move at 0 and a blunder high", async () => {
    const moves = ["e2e4", "e7e5", "g1f3", "d7d6"];
    const good = await gradeChessMove(moves, "d2d4");
    expect(good.loss).toBeLessThan(80);
    const blunder = await gradeChessMove(["e2e4", "e7e5", "d1h5", "b8c6"], "h5h7");
    expect(blunder.loss).toBeGreaterThan(500);
  });
});

describe("chess request checks", () => {
  it("rejects bad moves and settings", () => {
    expect(() => parseChessGrade({ moves: ["e2e4"], uci: "zz" })).toThrow();
    expect(() => parseChessDecide({ moves: ["e2-e4"], player: setup("jev") })).toThrow();
    expect(() => parseChessDecide({ moves: [], player: { ...setup("jev"), depth: 9 } })).toThrow();
    expect(parseChessDecide({ moves: [], player: { ...setup("stockfish"), depth: 12 } }).player.depth).toBe(12);
  });
});
