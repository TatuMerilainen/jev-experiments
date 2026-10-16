import { Chess, type Square } from "chess.js";
import { useMemo, useState } from "react";
import type { ChessColor } from "../../shared/chess/types";
import { PIECE_GLYPH } from "./chessFormat";

interface Props {
  fen: string;
  orientation?: ChessColor;
  size?: "large" | "small";
  /** Squares of the last move, or of the move a decision chose. */
  from?: string | null;
  to?: string | null;
  /** Lets the player to move pick a piece and a target square. */
  onMove?: (from: string, to: string) => void;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function ChessBoard({ fen, orientation = "w", size = "large", from = null, to = null, onMove }: Props) {
  const game = useMemo(() => new Chess(fen), [fen]);
  const [selected, setSelected] = useState<Square | null>(null);
  const targets = useMemo(
    () => (selected && onMove ? new Set(game.moves({ square: selected, verbose: true }).map((m) => m.to as string)) : new Set<string>()),
    [game, selected, onMove],
  );
  const checkSquare = game.inCheck() ? game.findPiece({ type: "k", color: game.turn() })[0] : null;

  const ranks = orientation === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === "w" ? FILES : [...FILES].reverse();

  const click = (square: Square) => {
    if (!onMove) return;
    const piece = game.get(square);
    if (selected && targets.has(square)) {
      onMove(selected, square);
      setSelected(null);
    } else if (piece && piece.color === game.turn()) {
      setSelected(square === selected ? null : square);
    } else {
      setSelected(null);
    }
  };

  return (
    <div className={`chessboard chessboard-${size}`} role="grid" aria-label="Chess board">
      {ranks.map((rank, r) =>
        files.map((file, f) => {
          const square = `${file}${rank}` as Square;
          const piece = game.get(square);
          const dark = (FILES.indexOf(file) + rank) % 2 === 1;
          const classes = ["sq", dark ? "sq-dark" : "sq-light"];
          if (square === from || square === to) classes.push("sq-moved");
          if (square === checkSquare) classes.push("sq-check");
          if (square === selected) classes.push("sq-selected");
          if (onMove) classes.push("sq-clickable");
          return (
            <button key={square} type="button" className={classes.join(" ")} onClick={() => click(square)} disabled={!onMove} aria-label={`${square}${piece ? `: ${piece.color === "w" ? "white" : "black"} ${piece.type}` : ""}`}>
              {piece && <span className={`piece piece-${piece.color}`}>{PIECE_GLYPH[piece.type]}</span>}
              {targets.has(square) && <span className={piece ? "target-capture" : "target-dot"} />}
              {size === "large" && f === 0 && <span className="coord-rank">{rank}</span>}
              {size === "large" && r === 7 && <span className="coord-file">{file}</span>}
            </button>
          );
        }),
      )}
    </div>
  );
}
