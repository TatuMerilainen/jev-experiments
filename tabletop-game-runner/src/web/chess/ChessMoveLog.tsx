import { useEffect, useRef } from "react";
import { formatMs } from "../format";
import type { ChessMoveRecord } from "./chessExperiment";
import { gradeLabel, PIECE_GLYPH } from "./chessFormat";
import { moveNumber } from "./ChessDecisionPanel";

interface Props {
  moves: ChessMoveRecord[];
  selected: number;
  onSelect: (index: number) => void;
}

export function ChessMoveLog({ moves, selected, onSelect }: Props) {
  const list = useRef<HTMLOListElement>(null);
  // Keep the newest move in view while a game runs.
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [moves.length]);

  return (
    <section className="card">
      <h2 className="card-title">Moves</h2>
      {moves.length === 0 ? (
        <p className="hint">No moves in this game yet.</p>
      ) : (
        <ol className="move-log chess-log" ref={list}>
          {moves.map((m, i) => (
            <li key={i}>
              <button type="button" className={i === selected ? "selected" : undefined} onClick={() => onSelect(i)}>
                <span className="move-no">{moveNumber(i)}</span>
                <span className={`piece piece-${m.color} inline-piece`}>{PIECE_GLYPH.k}</span>
                <span className="move-cell">{m.san}</span>
                {m.source === "opening" ? (
                  // The first move names the opening. The app played these moves, so they have no time.
                  <span className="hint move-opening" title={m.opening}>
                    {i === 0 || moves[i - 1]?.source !== "opening" ? m.opening : "opening"}
                  </span>
                ) : (
                  <span className="hint">{m.roundTripMs !== undefined ? formatMs(m.roundTripMs) : ""}</span>
                )}
                <LossMark record={m} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LossMark({ record }: { record: ChessMoveRecord }) {
  if (record.grade === "pending") return <span className="hint">…</span>;
  if (record.grade === "failed") return <span className="hint">–</span>;
  const { label, tone } = gradeLabel(record.grade);
  return (
    <span className={`tone-${tone} loss`} title={label}>
      {record.grade.loss === 0 ? "✓" : `−${record.grade.loss}`}
    </span>
  );
}
