import type { Board, Cell, Mark, Result } from "./types";

// Cells are indexed 0-8, row by row from the top left.
// Names use a column letter (a-c, left to right) and a row number (1-3, top to bottom).
export const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const RULES =
  "Two players, X and O, take turns placing their mark in an empty cell of a 3x3 grid. X goes first. " +
  "A player who gets three of their marks in a row, column or diagonal wins. " +
  "If all nine cells are full and nobody has three in a row, the game is a draw. " +
  "Cells are named by column (a, b, c from left to right) and row (1, 2, 3 from top to bottom). " +
  "In `board`, each string is one row from top to bottom, and '.' marks an empty cell. " +
  "A line is open for a player when it holds none of the other player's marks.";

export const emptyBoard = (): Cell[] => Array<Cell>(9).fill(null);

export const other = (mark: Mark): Mark => (mark === "X" ? "O" : "X");

export function cellName(index: number): string {
  return "abc"[index % 3]! + String(Math.floor(index / 3) + 1);
}

/** The index of a cell name such as "b2". */
export function cellIndex(name: string): number {
  return "abc".indexOf(name[0]!) + (Number(name[1]) - 1) * 3;
}

export function toMove(board: Board): Mark {
  const xs = board.filter((c) => c === "X").length;
  const os = board.filter((c) => c === "O").length;
  return xs === os ? "X" : "O";
}

export function winningLine(board: Board): readonly [number, number, number] | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
  }
  return null;
}

export function result(board: Board): Result | null {
  const line = winningLine(board);
  if (line) return board[line[0]] as Mark;
  return board.every((c) => c !== null) ? "draw" : null;
}

/** The empty cells where `mark` completes a line. */
export function winningCells(board: Board, mark: Mark): number[] {
  const cells = new Set<number>();
  for (const line of LINES) {
    const empty = line.filter((i) => board[i] === null);
    if (empty.length === 1 && line.filter((i) => board[i] === mark).length === 2) cells.add(empty[0]!);
  }
  return [...cells];
}

export function legalMoves(board: Board): number[] {
  if (result(board)) return [];
  const moves: number[] = [];
  board.forEach((c, i) => {
    if (c === null) moves.push(i);
  });
  return moves;
}

export function play(board: Board, index: number): Cell[] {
  if (board[index] !== null || result(board)) throw new Error(`Illegal move: ${cellName(index)}`);
  const next = [...board];
  next[index] = toMove(board);
  return next;
}

export function boardKey(board: Board): string {
  return board.map((c) => c ?? ".").join("");
}

const ROTATE = [6, 3, 0, 7, 4, 1, 8, 5, 2];
const REFLECT = [2, 1, 0, 5, 4, 3, 8, 7, 6];

const SYMMETRIES: number[][] = (() => {
  const perms: number[][] = [];
  let current = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = 0; i < 4; i++) {
    perms.push(current, REFLECT.map((j) => current[j]!));
    current = ROTATE.map((j) => current[j]!);
  }
  return perms;
})();

/** The same key for all 8 rotations and reflections of a board. */
export function canonicalKey(board: Board): string {
  let best: string | null = null;
  for (const perm of SYMMETRIES) {
    const key = perm.map((j) => board[j] ?? ".").join("");
    if (best === null || key < best) best = key;
  }
  return best!;
}

export function boardRows(board: Board): string[] {
  return [0, 3, 6].map((start) => [0, 1, 2].map((k) => board[start + k] ?? ".").join(" "));
}

export function lineContents(board: Board): Record<string, string> {
  const contents: Record<string, string> = {};
  for (const line of LINES) {
    const names = line.map(cellName).join(" ");
    const label = lineLabel(line);
    contents[`${label} (${names})`] = line.map((i) => board[i] ?? "empty").join(", ");
  }
  return contents;
}

function lineLabel([a, b, c]: readonly [number, number, number]): string {
  if (b - a === 1) return `row ${a / 3 + 1}`;
  if (b - a === 3) return `column ${"abc"[a]}`;
  return `diagonal ${cellName(a)}-${cellName(c)}`;
}
