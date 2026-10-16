import type { ChessDecision } from "../../shared/chess/types";
import { formatMs, formatTokens, formatUsd, PRICE_PER_TOKEN_USD } from "../format";
import { ChessBoard } from "./ChessBoard";
import type { ChessMoveRecord } from "./chessExperiment";
import { CHESS_KIND_LABELS, COLOR_LABEL, formatCentipawns, formatWinLoss, gradeLabel, PIECE_GLYPH } from "./chessFormat";

/** Short label for a move number: "12." for White, "12…" for Black. */
export const moveNumber = (index: number) => `${Math.floor(index / 2) + 1}${index % 2 === 0 ? "." : "…"}`;

export function GradeChip({ record }: { record: ChessMoveRecord }) {
  if (record.grade === "pending") return <span className="chip">Rating…</span>;
  if (record.grade === "failed") return <span className="chip">Not rated</span>;
  const { label, tone } = gradeLabel(record.grade);
  const loss = record.grade.loss > 0 ? ` · −${record.grade.loss} cp · win chance ${formatWinLoss(record.grade)}` : "";
  return (
    <span className={`chip ${tone === "good" ? "chip-good" : tone === "bad" ? "chip-bad" : ""}`} title="Centipawns and points of win chance the move gives away">
      {label + loss}
    </span>
  );
}

interface Props {
  record: ChessMoveRecord | undefined;
  index: number;
  /** Set while an older move is shown. The button brings back the latest move. */
  onLatest?: () => void;
}

export function ChessDecisionPanel({ record, index, onLatest }: Props) {
  if (!record) {
    return (
      <section className="card">
        <h2 className="card-title">Last move</h2>
        <p className="hint">No moves yet. Press Play or Step.</p>
      </section>
    );
  }
  const { decision, grade } = record;
  const source =
    record.source === "random-opening" ? "Random first move" : record.source === "opening" ? `Opening: ${record.opening ?? "from the opening set"}` : CHESS_KIND_LABELS[record.source];
  const best = grade !== "pending" && grade !== "failed" && grade.loss > 0 ? ` · Stockfish preferred ${grade.bestSan}` : "";
  return (
    <section className="card decision">
      <div className="card-head">
        <h2 className="card-title">
          <span className={`piece piece-${record.color} inline-piece`}>{PIECE_GLYPH.k}</span>
          {moveNumber(index)} {COLOR_LABEL[record.color]} played {record.san}
        </h2>
        <div className="card-head-end">
          {onLatest && (
            <button type="button" className="btn btn-small btn-ghost" onClick={onLatest} title="Show the latest move, and follow each new move again">
              Latest move
            </button>
          )}
          <GradeChip record={record} />
        </div>
      </div>
      <p className="hint">
        {source}
        {decision?.note ? ` · ${decision.note}` : ""}
        {best}
      </p>

      <div className="decision-main">
        <ChessBoard fen={record.fenBefore} size="small" from={record.from} to={record.to} />
        {decision && <KeyFigures decision={decision} roundTripMs={record.roundTripMs} />}
        {decision && decision.candidates.length > 1 && <Candidates decision={decision} />}
      </div>

      {decision && decision.candidates.some((c) => c.description) && (
        <details className="more">
          <summary>Details</summary>
          <div className="more-body">
            <div>
              <span className="label">What Jev read about each move</span>
              <ul className="descriptions">
                {decision.candidates.map((c) => (
                  <li key={c.uci}>
                    <strong>{c.san}</strong> {c.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      )}
    </section>
  );
}

export function KeyFigures({ decision, roundTripMs }: { decision: ChessDecision; roundTripMs?: number }) {
  const { stats } = decision;
  return (
    <dl className="key-figures">
      <div>
        <dt>Time</dt>
        <dd>{formatMs(roundTripMs ?? stats.serverMs)}</dd>
      </div>
      <div>
        <dt>Legal moves</dt>
        <dd>{decision.legalCount}</dd>
      </div>
      <div>
        <dt>Jev tokens</dt>
        <dd>{stats.inputTokens ? formatTokens(stats.inputTokens) : "–"}</dd>
      </div>
      <div>
        <dt>Cost</dt>
        <dd>{stats.inputTokens ? formatUsd(stats.inputTokens * PRICE_PER_TOKEN_USD) : "–"}</dd>
      </div>
    </dl>
  );
}

/** The moves the player chose between, with the code's score and Jev's probability. `solution` marks a puzzle's solution move. */
export function Candidates({ decision, solution }: { decision: ChessDecision; solution?: string }) {
  const hasJev = decision.candidates.some((c) => c.probability !== undefined);
  const rows = [...decision.candidates].sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0) || (b.score ?? 0) - (a.score ?? 0));
  const shown = rows.slice(0, 8);
  const top = Math.max(...rows.map((c) => c.probability ?? 0), 0.0001);
  return (
    <div className="candidates">
      <span className="label">{hasJev ? "Jev's choice" : "Candidates"}</span>
      {shown.map((c) => (
        <div key={c.uci} className={`candidate ${c.uci === decision.uci ? "chosen" : ""}`}>
          <span className="candidate-san">
            {c.san}
            {c.uci === solution && (
              <span className="candidate-solution" title="The puzzle's solution move">
                {" "}
                ✓
              </span>
            )}
          </span>
          {hasJev && (
            <span className="candidate-bar">
              <span style={{ width: `${((c.probability ?? 0) / top) * 100}%` }} />
            </span>
          )}
          <span className="candidate-value">{hasJev ? `${Math.round((c.probability ?? 0) * 100)}%` : ""}</span>
          <span className="candidate-score" title="Code search score, in pawns">
            {c.score !== undefined ? formatCentipawns(c.score) : ""}
          </span>
        </div>
      ))}
      {rows.length > shown.length && <p className="hint">and {rows.length - shown.length} more</p>}
    </div>
  );
}
