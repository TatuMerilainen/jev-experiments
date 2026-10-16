import { cellName } from "../../shared/tictactoe";
import type { Cell, Mark } from "../../shared/types";
import type { Tone } from "../format";

export interface CellNote {
  label: string;
  tone: Tone;
}

export function MarkIcon({ mark, className = "" }: { mark: Mark; className?: string }) {
  return mark === "X" ? (
    <svg className={`mark-svg mark-X ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M27 27 L73 73 M73 27 L27 73" />
    </svg>
  ) : (
    <svg className={`mark-svg mark-O ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="25" />
    </svg>
  );
}

interface Props {
  board: Cell[];
  size?: "large" | "small" | "tiny";
  /** Cell to mark: the move just played, or the move a decision chose. */
  highlight?: number | null;
  /** Colour of the marker. Defaults to the mark in the cell. */
  highlightMark?: Mark;
  /** A dot for the last move on the live board, a ring for a chosen empty cell. */
  highlightStyle?: "dot" | "ring";
  winLine?: readonly number[] | null;
  notes?: Record<number, CellNote>;
  onCellClick?: (cell: number) => void;
}

export function Board({
  board,
  size = "large",
  highlight = null,
  highlightMark,
  highlightStyle = "ring",
  winLine = null,
  notes = {},
  onCellClick,
}: Props) {
  const winner = winLine ? board[winLine[0]!] : null;
  return (
    <div className={`board board-${size} ${winner ? "board-won" : ""}`} role="grid" aria-label="Tic-tac-toe board">
      {board.map((cell, i) => {
        const note = cell ? undefined : notes[i];
        const classes = ["cell"];
        if (highlight === i) classes.push(`${highlightStyle}-${highlightMark ?? cell ?? "none"}`);
        if (winner && winLine?.includes(i)) classes.push(`win-${winner}`);
        if (note) classes.push(`tint-${note.tone}`);
        const clickable = Boolean(onCellClick) && cell === null;
        if (clickable) classes.push("clickable");
        return (
          <button
            key={i}
            type="button"
            className={classes.join(" ")}
            disabled={!clickable}
            onClick={() => onCellClick?.(i)}
            title={size === "small" ? cellName(i) : undefined}
            aria-label={`${cellName(i)}${cell ? `: ${cell}` : ""}${note ? `, rated ${note.label}` : ""}`}
          >
            {cell ? <MarkIcon key={cell} mark={cell} /> : note && size !== "tiny" && <span className="note">{note.label}</span>}
            {size === "large" && (
              <span className="cell-name" aria-hidden="true">
                {cellName(i)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
