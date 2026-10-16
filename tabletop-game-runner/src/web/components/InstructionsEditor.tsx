import { useEffect, useId, useState } from "react";
import { MAX_INSTRUCTIONS_LENGTH } from "../../shared/prompts";

interface Props {
  /** The text in use now. */
  applied: string;
  defaultText: string;
  isCustom: boolean;
  /** Called with the new text, or `null` to go back to the default. */
  onApply: (instructions: string | null) => void;
  editLabel: string;
}

/** Shows the instructions as text; Edit opens a textarea with Apply and Cancel. */
export function InstructionsEditor({ applied, defaultText, isCustom, onApply, editLabel }: Props) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(applied);
  useEffect(() => {
    setDraft(applied);
    setEditing(false);
  }, [applied]);

  const apply = () => {
    const text = draft.trim();
    onApply(text === defaultText ? null : text);
  };

  return (
    <div className="field">
      <div className="label-row">
        <label className="label" htmlFor={`${id}-instructions`}>
          Instructions{isCustom && <span className="tag">Custom</span>}
        </label>
        {!editing && (
          <button type="button" className="link" onClick={() => setEditing(true)} aria-label={editLabel}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            id={`${id}-instructions`}
            className="textarea"
            rows={4}
            autoFocus
            maxLength={MAX_INSTRUCTIONS_LENGTH}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="instructions-actions">
            <button type="button" className="btn btn-small btn-primary" onClick={apply} disabled={!draft.trim() || draft.trim() === applied}>
              Apply
            </button>
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => {
                setDraft(applied);
                setEditing(false);
              }}
            >
              Cancel
            </button>
            {isCustom && (
              <button type="button" className="link" onClick={() => onApply(null)}>
                Reset to default
              </button>
            )}
          </div>
          <p className="hint">Applying starts a new experiment.</p>
        </>
      ) : (
        <p className="instructions-text">{withPathChips(applied)}</p>
      )}
    </div>
  );
}

/** Shows backticked state paths such as `to_move` as small chips. */
function withPathChips(text: string) {
  return text.split("`").map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="path">
        {part}
      </code>
    ) : (
      part
    ),
  );
}
