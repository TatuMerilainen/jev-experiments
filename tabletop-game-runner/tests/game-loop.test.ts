import { describe, expect, it } from "vitest";
import type { ChessDecision } from "../src/shared/chess/types";
import {
  answersHuman as chessAnswersHuman,
  chessReducer,
  DEFAULT_CHESS_SETTINGS,
  finishedGameTokens,
  initialChessState,
  pendingGrades,
  type ChessState,
} from "../src/web/chess/chessExperiment";
import { answersHuman, DEFAULT_SETTINGS, initialState, reducer } from "../src/web/experiment";

// X takes the left column: cells 0, 3 and 6.
const TICTACTOE_WIN = [0, 1, 3, 4, 6];
// Fool's mate: Black mates on move 2.
const CHESS_MATE = ["f2f3", "e7e5", "g2g4", "d8h4"];

function playTictactoe(continuous: boolean) {
  let state = { ...initialState({ ...DEFAULT_SETTINGS, continuous }), running: true };
  for (const cell of TICTACTOE_WIN) state = reducer(state, { type: "move", cell, source: "human" });
  return state;
}

function playChess(continuous: boolean) {
  let state = { ...initialChessState({ ...DEFAULT_CHESS_SETTINGS, continuous }), running: true };
  for (const uci of CHESS_MATE) state = chessReducer(state, { type: "move", uci, source: "human" });
  return state;
}

describe("end of a game", () => {
  it("stops play without continuous play", () => {
    const ttt = playTictactoe(false);
    expect(ttt.result).toBe("X");
    expect(ttt.running).toBe(false);
    const chess = playChess(false);
    expect(chess.outcome).toEqual({ winner: "b", reason: "checkmate" });
    expect(chess.running).toBe(false);
  });

  it("keeps playing with continuous play", () => {
    expect(playTictactoe(true).running).toBe(true);
    expect(playChess(true).running).toBe(true);
  });

  it("keeps the finished position until the next game starts", () => {
    const ttt = playTictactoe(true);
    expect(ttt.moves).toHaveLength(TICTACTOE_WIN.length);
    const next = reducer(ttt, { type: "newGame" });
    expect(next).toMatchObject({ moves: [], result: null, gameNo: 2, running: true });
    expect(next.tally.games).toBe(1);
  });

  it("reset stops play and clears the tally", () => {
    const after = reducer(playTictactoe(true), { type: "reset" });
    expect(after).toMatchObject({ moves: [], gameNo: 1, running: false });
    expect(after.tally.games).toBe(0);
    expect(after.settings.continuous).toBe(true);
  });
});

describe("chess cost per game", () => {
  const decision = (uci: string, inputTokens: number) =>
    ({ uci, stats: { serverMs: 0, searchMs: 0, jevMs: 0, jevRequests: 1, inputTokens } }) as ChessDecision;
  const play = (state: ChessState, tokens: number) => {
    for (const uci of CHESS_MATE) state = chessReducer(state, { type: "move", uci, source: "jev", decision: decision(uci, tokens) });
    return state;
  };
  const gameTokens = (state: ChessState) => state.moves.reduce((sum, m) => sum + (m.decision?.stats.inputTokens ?? 0), 0);
  const perGame = (state: ChessState) => finishedGameTokens(state.tally, gameTokens(state), state.outcome !== null) / state.tally.games;

  it("counts a game once it has ended, while it is still on the board", () => {
    const first = play({ ...initialChessState(), running: true }, 100);
    expect(perGame(first)).toBe(400);
    const second = play(chessReducer(first, { type: "newGame" }), 200);
    expect(perGame(second)).toBe(600);
  });

  it("leaves out the game being played", () => {
    let state = chessReducer(play(initialChessState(), 100), { type: "newGame" });
    state = chessReducer(state, { type: "move", uci: "e2e4", source: "jev", decision: decision("e2e4", 900) });
    expect(perGame(state)).toBe(400);
  });
});

describe("a human move while paused", () => {
  it("gets an answer from the bot, and the bot's move does not start play", () => {
    let state = initialState(DEFAULT_SETTINGS);
    expect(answersHuman(state)).toBe(false);
    state = reducer(state, { type: "move", cell: 4, source: "human" });
    expect(state.running).toBe(false);
    expect(answersHuman(state)).toBe(true);
    state = reducer(state, { type: "move", cell: 0, source: "perfect" });
    expect(answersHuman(state)).toBe(false);

    let chess = chessReducer(initialChessState(), { type: "move", uci: "e2e4", source: "human" });
    expect(chessAnswersHuman(chess)).toBe(true);
    chess = chessReducer(chess, { type: "move", uci: "e7e5", source: "random" });
    expect(chessAnswersHuman(chess)).toBe(false);
  });

  it("gets no answer after the game has ended", () => {
    let state = initialState(DEFAULT_SETTINGS);
    for (const cell of TICTACTOE_WIN) state = reducer(state, { type: "move", cell, source: "human" });
    expect(answersHuman(state)).toBe(false);
  });
});

describe("a failed chess rating", () => {
  it("keeps its error for the status line and does not hold back the next game", () => {
    let state = playChess(true);
    state.moves.forEach((_, index) => {
      state = chessReducer(state, { type: "graded", experimentId: state.experimentId, gameNo: 1, index, grade: index === 1 ? "failed" : { loss: 0, bestSan: "e4", depth: 12 }, error: "Stockfish stopped (exit code 1)." });
    });
    expect(pendingGrades(state)).toBe(false);
    expect(state.gradeError).toBe("Stockfish stopped (exit code 1).");
    expect(chessReducer(state, { type: "newGame" }).gradeError).toBeNull();
  });
});
