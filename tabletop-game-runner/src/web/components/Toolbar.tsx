import type { CSSProperties } from "react";
import type { StartKind } from "../../shared/replays";
import { Icon, type IconName } from "./Icon";

/** The stops of the delay slider. */
export const DELAYS_MS = [0, 250, 1000, 2000];

const delayLabel = (ms: number) => (ms === 0 ? "No delay" : `${ms / 1000} s delay`);

const OPENING_CHOICES: { value: StartKind; label: string }[] = [
  { value: "start", label: "Start position" },
  { value: "random-first", label: "Random first move" },
  { value: "opening-set", label: "Opening set" },
];

interface Props {
  running: boolean;
  /** The game has ended. When play has stopped, the main button starts the next game. */
  gameOver: boolean;
  stepDisabled: boolean;
  delayMs: number;
  continuous: boolean;
  /** Tic-tac-toe: the "Random first move" switch. */
  randomFirst?: { value: boolean; onChange: (randomFirst: boolean) => void };
  /** Chess: the "Openings" choice. */
  openings?: { value: StartKind; onChange: (openings: StartKind) => void };
  onReset: () => void;
  onStep: () => void;
  onPlay: () => void;
  onPause: () => void;
  onDelayChange: (delayMs: number) => void;
  onContinuousChange: (continuous: boolean) => void;
}

export function Toolbar(props: Props) {
  const { running, gameOver, stepDisabled, delayMs, continuous, randomFirst, openings, onReset, onStep, onPlay, onPause, onDelayChange, onContinuousChange } = props;
  const main: { icon: IconName; label: string; title: string; onClick: () => void } = running
    ? { icon: "pause", label: "Pause", title: "Pause after the current move", onClick: onPause }
    : gameOver
      ? { icon: "restart", label: "Restart", title: "Play the next game", onClick: onPlay }
      : { icon: "play", label: "Play", title: continuous ? "Play games one after another" : "Play to the end of the game", onClick: onPlay };
  return (
    <>
      <div className="toolbar">
        <button type="button" className="btn btn-icon" onClick={onReset} title="Reset: empty board, game 1, empty tally" aria-label="Reset">
          <Icon name="reset" />
        </button>
        <button type="button" className="btn btn-icon" onClick={onStep} disabled={stepDisabled} title="Play one move" aria-label="Step">
          <Icon name="step" />
        </button>
        <button type="button" className="btn btn-primary btn-play" onClick={main.onClick} title={main.title}>
          <Icon name={main.icon} />
          {main.label}
        </button>
        <DelayControl delayMs={delayMs} onDelayChange={onDelayChange} />
      </div>
      <div className="toolbar-switches">
        {randomFirst && (
          <label className="row row-compact" title="Play a random first move in each game. Changing this starts a new experiment.">
            <span>Random first move</span>
            <input type="checkbox" className="switch" checked={randomFirst.value} onChange={(e) => randomFirst.onChange(e.target.checked)} />
          </label>
        )}
        {openings && (
          <label className="row row-compact" title="How each game starts. Changing this starts a new experiment.">
            <span>Openings</span>
            <select className="select select-small" value={openings.value} onChange={(e) => openings.onChange(e.target.value as StartKind)}>
              {OPENING_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="row row-compact" title="Start the next game when a game ends">
          <span>Continuous play</span>
          <input type="checkbox" className="switch" checked={continuous} onChange={(e) => onContinuousChange(e.target.checked)} />
        </label>
      </div>
    </>
  );
}

/** The slider for the delay between moves, with one stop per value in DELAYS_MS. */
export function DelayControl({ delayMs, onDelayChange }: { delayMs: number; onDelayChange: (delayMs: number) => void }) {
  return (
    <label className="delay" title="Delay between moves">
      <span className="delay-label">{delayLabel(delayMs)}</span>
      <span className="delay-track">
        <span className="delay-line" />
        {DELAYS_MS.map((ms, i) => (
          <span key={ms} className={`delay-stop ${ms <= delayMs ? "delay-stop-on" : ""}`} style={{ "--i": i / (DELAYS_MS.length - 1) } as CSSProperties} />
        ))}
        <input
          type="range"
          className="delay-slider"
          aria-label="Delay between moves"
          aria-valuetext={delayLabel(delayMs)}
          min={0}
          max={DELAYS_MS.length - 1}
          step={1}
          value={Math.max(0, DELAYS_MS.indexOf(delayMs))}
          onChange={(e) => onDelayChange(DELAYS_MS[Number(e.target.value)]!)}
        />
      </span>
    </label>
  );
}
