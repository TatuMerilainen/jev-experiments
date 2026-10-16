import type { Mark } from "../../shared/types";
import { playsRandomFirst, type Settings, type SideStats, type Tally } from "../experiment";
import { formatMs, formatTokens, formatUsd, PRICE_PER_TOKEN_USD, setupLabel } from "../format";
import type { SaveStatus } from "../useExperimentLog";
import { MarkIcon } from "./Board";

interface Props {
  tally: Tally;
  settings: Settings;
  save: SaveStatus;
  experimentId: string;
  /** The Jev versions in use, as text. Empty when no player uses Jev. */
  models: string | undefined;
}

export function TallyPanel({ tally, settings, save, experimentId, models }: Props) {
  const distinct = Object.keys(tally.sequences).length;
  const totalTokens = tally.side.X.inputTokens + tally.side.O.inputTokens;
  return (
    <section className="card">
      <h2 className="card-title">Experiment</h2>
      <div className="figures">
        <Figure label="Games" value={tally.games} />
        <Figure label="X wins" value={tally.wins.X} mark="X" />
        <Figure label="O wins" value={tally.wins.O} mark="O" />
        <Figure label="Draws" value={tally.draws} />
        <Figure label="Distinct games" value={distinct} />
      </div>
      {tally.games > 1 && !playsRandomFirst(settings) && (
        <p className="hint">
          {distinct === 1
            ? "Every game was the same: the players gave the same answers each time."
            : `${distinct} different games from the same setup.`}
        </p>
      )}

      <details className="more">
        <summary>Per player</summary>
        <div className="more-body">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Optimal</th>
                <th>Time / move</th>
                <th>Requests / move</th>
                <th>Tokens / move</th>
              </tr>
            </thead>
            <tbody>
              {(["X", "O"] as Mark[]).map((mark) => (
                <SideRow key={mark} mark={mark} stats={tally.side[mark]} label={setupLabel(settings.players[mark])} />
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="footnote">
        {models && <>{models} · </>}
        Jev cost {formatUsd(totalTokens * PRICE_PER_TOKEN_USD)} · {formatTokens(totalTokens)} tokens ·{" "}
        {save.error ? (
          <span className="tone-bad">Saving failed: {save.error}</span>
        ) : save.dir?.endsWith(experimentId) ? (
          <span title={save.dir}>Saved to data/experiments</span>
        ) : (
          "Saved to disk from the first move"
        )}
      </p>
    </section>
  );
}

function Figure({ label, value, mark }: { label: string; value: number; mark?: Mark }) {
  return (
    <div className="figure">
      <span className={`figure-value ${mark ? `text-${mark}` : ""}`}>{value}</span>
      <span className="figure-label">{label}</span>
    </div>
  );
}

function SideRow({ mark, stats, label }: { mark: Mark; stats: SideStats; label: string }) {
  const per = (total: number) => (stats.decisions ? total / stats.decisions : 0);
  return (
    <tr>
      <td>
        <MarkIcon mark={mark} className="inline-mark" /> {label}
      </td>
      <td>{stats.moves ? `${stats.optimal} / ${stats.moves}` : "–"}</td>
      <td>{stats.decisions ? formatMs(per(stats.roundTripMs)) : "–"}</td>
      <td>{stats.decisions ? per(stats.jevRequests).toFixed(1) : "–"}</td>
      <td>{stats.decisions ? formatTokens(per(stats.inputTokens)) : "–"}</td>
    </tr>
  );
}
