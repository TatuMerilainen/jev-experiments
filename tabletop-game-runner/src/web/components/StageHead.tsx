import type { ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  status: ReactNode;
  error: boolean;
  /** Both sides have the same configuration, so a swap would change nothing. */
  sameSides: boolean;
  /** Names the two sides in the tooltip, for example "X and O". */
  sides: string;
  onSwap: () => void;
  /** Hidden during a replay: the button changes the live players. */
  showSwap?: boolean;
}

/** The game status line, with a button that swaps the two players' configurations. */
export function StageHead({ status, error, sameSides, sides, onSwap, showSwap = true }: Props) {
  return (
    <div className="stage-head">
      <p className={`status ${error ? "status-bad" : ""}`} aria-live="polite">
        {status}
      </p>
      {showSwap && (
        <button
          type="button"
          className="btn btn-small btn-swap"
          onClick={onSwap}
          disabled={sameSides}
          title={sameSides ? "Both sides have the same configuration" : `Swap the ${sides} configurations. This starts a new experiment.`}
        >
          <Icon name="swap" />
          Swap sides
        </button>
      )}
    </div>
  );
}
