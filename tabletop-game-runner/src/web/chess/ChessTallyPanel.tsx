import type { ChessColor } from "../../shared/chess/types";
import { formatMs, formatTokens, formatUsd, PRICE_PER_TOKEN_USD } from "../format";
import type { SaveStatus } from "../useExperimentLog";
import { finishedGameTokens, startKind, type ChessSettings, type ChessSideStats, type ChessTally } from "./chessExperiment";
import { CHESS_KIND_LABELS, COLOR_LABEL } from "./chessFormat";

interface Props {
  tally: ChessTally;
  settings: ChessSettings;
  save: SaveStatus;
  experimentId: string;
  /** The Jev versions in use, as text. Empty when no player uses Jev. */
  models: string | undefined;
  /** Jev tokens in the game on the board. */
  gameTokens: number;
  gameOver: boolean;
}

export function ChessTallyPanel({ tally, settings, save, experimentId, models, gameTokens, gameOver }: Props) {
  const distinct = Object.keys(tally.sequences).length;
  const totalTokens = tally.side.w.inputTokens + tally.side.b.inputTokens;
  const finishedTokens = finishedGameTokens(tally, gameTokens, gameOver);
  return (
    <section className="card">
      <h2 className="card-title">Experiment</h2>
      <div className="figures">
        <Figure label="Games" value={String(tally.games)} />
        <Figure label="White wins" value={String(tally.wins.w)} />
        <Figure label="Black wins" value={String(tally.wins.b)} />
        <Figure label="Draws" value={String(tally.draws)} />
        <Figure label="Cost per game" value={tally.games ? formatUsd((finishedTokens * PRICE_PER_TOKEN_USD) / tally.games) : "–"} />
      </div>
      {tally.games > 1 && startKind(settings) === "start" && (
        <p className="hint">
          {distinct === 1 ? "Every game was the same move for move." : `${distinct} different games from the same setup.`}
        </p>
      )}

      <details className="more">
        <summary>Per player</summary>
        <div className="more-body">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Avg loss</th>
                <th>Accuracy</th>
                <th>Avg win chance loss</th>
                <th>Blunders</th>
                <th>Time / move</th>
                <th>Tokens / move</th>
              </tr>
            </thead>
            <tbody>
              {(["w", "b"] as ChessColor[]).map((color) => (
                <SideRow key={color} color={color} stats={tally.side[color]} label={CHESS_KIND_LABELS[settings.players[color].kind]} />
              ))}
            </tbody>
          </table>
          <p className="hint">
            Loss: centipawns a move gives away against Stockfish's best move. Win chance loss: Stockfish's win chance for the mover before the move minus after it, in
            points. Accuracy: Lichess's accuracy of each move, averaged. Blunder: a move that gives away 15 points of win chance or more, as on Lichess.
          </p>
        </div>
      </details>

      <p className="footnote">
        {models && <>{models} · </>}
        This game {formatUsd(gameTokens * PRICE_PER_TOKEN_USD)} · Total {formatUsd(totalTokens * PRICE_PER_TOKEN_USD)} ({formatTokens(totalTokens)}{" "}
        tokens) ·{" "}
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

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="figure">
      <span className="figure-value">{value}</span>
      <span className="figure-label">{label}</span>
    </div>
  );
}

function SideRow({ color, stats, label }: { color: ChessColor; stats: ChessSideStats; label: string }) {
  const per = (total: number, count: number) => (count ? total / count : 0);
  return (
    <tr>
      <td>
        {COLOR_LABEL[color]} <span className="hint">{label}</span>
      </td>
      <td>{stats.graded ? `${Math.round(per(stats.lossTotal, stats.graded))} cp` : "–"}</td>
      <td>{stats.winGraded ? `${per(stats.accuracyTotal, stats.winGraded).toFixed(1)}%` : "–"}</td>
      <td>{stats.winGraded ? `${per(stats.winLossTotal, stats.winGraded).toFixed(1)}` : "–"}</td>
      <td>{stats.graded ? stats.blunders : "–"}</td>
      <td>{stats.decisions ? formatMs(per(stats.roundTripMs, stats.decisions)) : "–"}</td>
      <td>{stats.decisions ? formatTokens(per(stats.inputTokens, stats.decisions)) : "–"}</td>
    </tr>
  );
}
