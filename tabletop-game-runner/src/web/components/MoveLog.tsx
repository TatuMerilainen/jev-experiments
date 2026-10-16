import { cellName } from "../../shared/tictactoe";
import type { MoveRecord } from "../experiment";
import { formatMs, KIND_LABELS } from "../format";
import { MarkIcon } from "./Board";

interface Props {
  moves: MoveRecord[];
  selected: number;
  onSelect: (index: number) => void;
}

export function MoveLog({ moves, selected, onSelect }: Props) {
  return (
    <section className="card">
      <h2 className="card-title">Moves</h2>
      {moves.length === 0 ? (
        <p className="hint">No moves in this game yet.</p>
      ) : (
        <ol className="move-log">
          {moves.map((m, i) => (
            <li key={i}>
              <button type="button" className={i === selected ? "selected" : undefined} onClick={() => onSelect(i)}>
                <span className="move-no">{i + 1}</span>
                <MarkIcon mark={m.player} className="inline-mark" />
                <span className="move-cell">{cellName(m.cell)}</span>
                <span className="hint">{m.source === "random-opening" ? "Random first move" : KIND_LABELS[m.source]}</span>
                <span className="hint">{m.roundTripMs !== undefined ? formatMs(m.roundTripMs) : ""}</span>
                <span className={m.grade.optimal ? "tone-good" : "tone-bad"} title={m.grade.optimal ? "Optimal" : "Mistake"}>
                  {m.grade.optimal ? "✓" : "✗"}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
