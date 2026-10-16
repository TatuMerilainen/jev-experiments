import { defaultInstructions, positionLevels } from "../../shared/prompts";
import { MAX_DEPTH, type Mark, type PlayerKind, type PlayerSetup } from "../../shared/types";
import { describeSetup, formatMs, KIND_LABELS, setupBadges, setupDetails, usesDepth, usesJev } from "../format";
import { MarkIcon } from "./Board";
import { InstructionsEditor } from "./InstructionsEditor";
import { ModelSelect } from "./ModelSelect";
import { SetupBadges } from "./SetupBadges";
import { SetupDetails } from "./SetupDetails";

export interface PlayerStats {
  wins: number;
  optimal: number;
  moves: number;
  avgMs: number | null;
}

interface Props {
  mark: Mark;
  setup: PlayerSetup;
  stats: PlayerStats;
  jevConfigured: boolean;
  /** It is this player's turn in an unfinished game. */
  active: boolean;
  thinking: boolean;
  onChange: (setup: PlayerSetup) => void;
}

const KINDS = Object.keys(KIND_LABELS) as PlayerKind[];

export function PlayerPanel({ mark, setup, stats, jevConfigured, active, thinking, onChange }: Props) {
  const isJev = usesJev(setup.kind);
  return (
    <section className={`card player player-${mark} ${active ? "active" : ""}`} aria-label={`Player ${mark}`}>
      <div className="player-head">
        <MarkIcon mark={mark} className="player-icon" />
        <div className="player-title">Player {mark}</div>
        {thinking && (
          <span className="thinking">
            Thinking<span className="dots" />
          </span>
        )}
      </div>

      <div className="field">
        <select
          className="select"
          aria-label={`Player ${mark} type`}
          value={setup.kind}
          onChange={(e) => onChange({ ...setup, kind: e.target.value as PlayerKind, instructions: null })}
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind} disabled={usesJev(kind) && !jevConfigured}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        <SetupBadges badges={setupBadges(setup)} />
        <p className="hint">{describeSetup(setup)}</p>
      </div>

      <SetupDetails details={setupDetails(setup)} />

      {isJev && (
        <InstructionsEditor
          applied={setup.instructions ?? defaultInstructions(setup.kind) ?? ""}
          defaultText={defaultInstructions(setup.kind) ?? ""}
          isCustom={setup.instructions !== null}
          onApply={(instructions) => onChange({ ...setup, instructions })}
          editLabel={`Edit instructions for player ${mark}`}
        />
      )}

      {(isJev || usesDepth(setup.kind)) && (
        <details className="more">
          <summary>More settings</summary>
          <div className="more-body">
            {isJev && <ModelSelect value={setup.model} onChange={(model) => onChange({ ...setup, model })} />}
            {usesDepth(setup.kind) && (
              <label className="row">
                <span>Look ahead</span>
                <select className="select select-small" value={setup.depth} onChange={(e) => onChange({ ...setup, depth: Number(e.target.value) })}>
                  {Array.from({ length: MAX_DEPTH }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d} {d === 1 ? "move" : "moves"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {isJev && (
              <label className="row" title="Also send Jev the contents of all 8 lines, computed in code">
                <span>Send line contents</span>
                <input
                  type="checkbox"
                  className="switch"
                  checked={setup.lines}
                  onChange={(e) => onChange({ ...setup, lines: e.target.checked })}
                />
              </label>
            )}
            {setup.kind === "jev-lookahead" && (
              <div>
                <span className="label">Answer levels, worst first</span>
                <ol className="levels" start={0}>
                  {positionLevels(mark).map((level) => (
                    <li key={level}>{level}</li>
                  ))}
                </ol>
              </div>
            )}
            {setup.kind === "jev-direct" && <p className="hint">Options: one per legal move, for example "Place {mark} in b2."</p>}
          </div>
        </details>
      )}

      <dl className="player-stats">
        <div>
          <dt>Wins</dt>
          <dd>{stats.wins}</dd>
        </div>
        <div>
          <dt>Optimal moves</dt>
          <dd>{stats.moves ? `${stats.optimal}/${stats.moves}` : "–"}</dd>
        </div>
        <div>
          <dt>Time per move</dt>
          <dd>{stats.avgMs !== null ? formatMs(stats.avgMs) : "–"}</dd>
        </div>
      </dl>
    </section>
  );
}
