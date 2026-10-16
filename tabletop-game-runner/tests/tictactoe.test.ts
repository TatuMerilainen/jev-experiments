import { describe, expect, it } from "vitest";
import { boardRows, canonicalKey, cellName, emptyBoard, legalMoves, lineContents, play, result, toMove } from "../src/shared/tictactoe";
import type { Cell } from "../src/shared/types";
import { parseRows } from "./helpers";

const board = (rows: string): Cell[] => parseRows(rows.split("/"));

describe("tic-tac-toe rules", () => {
  it("names cells by column letter and row number from the top left", () => {
    expect([0, 2, 4, 6, 8].map(cellName)).toEqual(["a1", "c1", "b2", "a3", "c3"]);
  });

  it("alternates players, X first", () => {
    const b = play(play(emptyBoard(), 4), 0);
    expect(toMove(emptyBoard())).toBe("X");
    expect(b[4]).toBe("X");
    expect(b[0]).toBe("O");
    expect(toMove(b)).toBe("X");
  });

  it("detects wins, draws and unfinished games", () => {
    expect(result(board("X X X/O O ./. . ."))).toBe("X");
    expect(result(board("O X X/X O ./X . O"))).toBe("O");
    expect(result(board("X O X/X O O/O X X"))).toBe("draw");
    expect(result(board("X O ./. . ./. . ."))).toBeNull();
  });

  it("has no legal moves after a win and rejects illegal moves", () => {
    const won = board("X X X/O O ./. . .");
    expect(legalMoves(won)).toEqual([]);
    expect(() => play(board("X . ./. . ./. . ."), 0)).toThrow();
  });

  it("gives all rotations and reflections the same canonical key", () => {
    const corner = board("X . ./. O ./. . .");
    const rotated = board(". . X/. O ./. . .");
    const reflected = board(". . ./. O ./X . .");
    expect(canonicalKey(rotated)).toBe(canonicalKey(corner));
    expect(canonicalKey(reflected)).toBe(canonicalKey(corner));
    expect(canonicalKey(board(". X ./. O ./. . ."))).not.toBe(canonicalKey(corner));
  });

  it("renders rows and lines for Jev", () => {
    const b = board("X . O/. X ./. . O");
    expect(boardRows(b)).toEqual(["X . O", ". X .", ". . O"]);
    const lines = lineContents(b);
    expect(Object.keys(lines)).toHaveLength(8);
    expect(lines["row 1 (a1 b1 c1)"]).toBe("X, empty, O");
    expect(lines["column c (c1 c2 c3)"]).toBe("O, empty, O");
    expect(lines["diagonal a1-c3 (a1 b2 c3)"]).toBe("X, X, O");
    expect(lines["diagonal c1-a3 (c1 b2 a3)"]).toBe("O, X, empty");
  });
});
