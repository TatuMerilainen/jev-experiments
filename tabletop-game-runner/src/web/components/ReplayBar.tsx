import { Icon } from "./Icon";

interface Props {
  title: string;
  detail: string;
  /** The selected move, from 0. */
  index: number;
  count: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  /** The puzzle page goes back to its live run. */
  closeLabel?: string;
}

/** Takes the toolbar's place while a saved game is open: step through its moves, or go back to the live game. */
export function ReplayBar({ title, detail, index, count, onSelect, onClose, closeLabel = "Back to live game" }: Props) {
  return (
    <>
      <div className="toolbar">
        <button type="button" className="btn btn-icon" onClick={() => onSelect(index - 1)} disabled={index <= 0} aria-label="Previous move" title="Previous move">
          <Icon name="prev" />
        </button>
        <span className="replay-position">
          Move {index + 1} of {count}
        </span>
        <button type="button" className="btn btn-icon" onClick={() => onSelect(index + 1)} disabled={index >= count - 1} aria-label="Next move" title="Next move">
          <Icon name="next" />
        </button>
        <button type="button" className="btn btn-primary btn-play" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
      <p className="replay-caption">
        <span className="replay-title">{title}</span>
        <span className="hint">{detail}</span>
      </p>
    </>
  );
}
