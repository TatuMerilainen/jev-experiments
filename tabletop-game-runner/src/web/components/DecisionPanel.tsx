import { moveScores, outcomeOf, type Outcome } from "../../shared/solver";
import { cellName } from "../../shared/tictactoe";
import { ESTIMATE_WEIGHT, type Board as BoardCells, type Decision, type LeafJudgement } from "../../shared/types";
import type { MoveRecord } from "../experiment";
import { formatMs, formatTokens, formatValue, leafLevelNames, outcomeWord, sourceLabel, valueTone } from "../format";
import { Board, MarkIcon, type CellNote } from "./Board";

/** The result of each legal move with best play afterwards, from the mover's view. */
function trueResults(board: BoardCells): Map<number, Outcome> {
  return new Map(moveScores(board).map(({ move, score }) => [move, outcomeOf(score)]));
}

/**
 * Board labels for the small board. The number is the bot's own value for the move.
 * The colour is the true result: green keeps the best result the mover could still reach, red gives part of it away.
 */
function moveNotes(truth: Map<number, Outcome>, best: Outcome, decision: Decision | undefined): Record<number, CellNote> {
  const notes: Record<number, CellNote> = {};
  for (const [move, outcome] of truth) {
    const candidate = decision?.candidates.find((c) => c.move === move);
    const label = candidate && decision ? formatValue(candidate.value, decision.valueKind, decision.config.kind, 2) : "";
    notes[move] = { label, tone: outcome === best ? "good" : "bad" };
  }
  return notes;
}

/** What the numbers on the small board mean, for the legend. */
function numbersMeaning(decision: Decision | undefined): string | null {
  if (!decision || decision.valueKind === "none") return null;
  if (decision.valueKind === "probability") return "Numbers: Jev's probability for each move.";
  if (decision.config.kind === "perfect") return "Words: the exact result of each move.";
  return "Numbers: the bot's own value for each move, from −1 to +1.";
}

interface Props {
  record: MoveRecord | undefined;
  index: number;
  /** Set while an older move is shown. The button brings back the latest move. */
  onLatest?: () => void;
}

export function DecisionPanel({ record, index, onLatest }: Props) {
  if (!record) {
    return (
      <section className="card">
        <h2 className="card-title">Last move</h2>
        <p className="hint">No moves yet. Press Play or Step.</p>
      </section>
    );
  }
  const { decision, grade } = record;
  const truth = trueResults(record.before);
  const best = grade.best as Outcome;
  const keeping = [...truth].filter(([, outcome]) => outcome === best).map(([move]) => cellName(move));
  const played = cellName(record.cell);
  const verdict = grade.optimal
    ? `${played} keeps the best result ${record.player} could still reach: a ${outcomeWord(best)}.`
    : `With best play, ${record.player} could still reach a ${outcomeWord(best)}. ${played} leads to a ${outcomeWord(grade.actual as Outcome)}. Moves that keep the ${outcomeWord(best)}: ${keeping.join(", ")}.`;
  const meaning = numbersMeaning(decision);
  return (
    <section className="card decision">
      <div className="card-head">
        <h2 className="card-title">
          <MarkIcon mark={record.player} className="inline-mark" />
          Move {index + 1}: {record.player} played {cellName(record.cell)}
        </h2>
        <div className="card-head-end">
          {onLatest && (
            <button type="button" className="btn btn-small btn-ghost" onClick={onLatest} title="Show the latest move, and follow each new move again">
              Latest move
            </button>
          )}
          <span className={`chip ${grade.optimal ? "chip-good" : "chip-bad"}`}>
            {grade.optimal ? "Optimal" : `Mistake: ${outcomeWord(grade.best)} → ${outcomeWord(grade.actual)}`}
          </span>
        </div>
      </div>
      <p className="hint">
        {sourceLabel(record.source, record.setup)}
        {decision ? summary(decision) : ""}
      </p>

      <div className="decision-main">
        <Board
          board={record.before}
          size="small"
          highlight={record.cell}
          highlightMark={record.player}
          notes={moveNotes(truth, best, decision)}
        />
        {decision && <KeyFigures decision={decision} roundTripMs={record.roundTripMs} />}
      </div>
      <p className="decision-verdict">{verdict}</p>
      <p className="hint">
        {meaning ? `${meaning} ` : ""}Colours: the true result with best play. Green keeps the best result, red gives part of it away.
      </p>

      {decision && decision.valueKind !== "none" && (
        <details className="more">
          <summary>Details</summary>
          <div className="more-body">
            <Candidates decision={decision} truth={truth} best={best} />
            {decision.exactLeaves ? <p className="hint">Positions decided by code: {decision.exactLeaves}. Jev got no request for them.</p> : null}
            {decision.leaves && decision.leaves.length > 0 && <Leaves leaves={decision.leaves} />}
            {decision.directRuns && (
              <div>
                <span className="label">Jev answers, in normal and reversed option order</span>
                {decision.directRuns.map((run, i) => (
                  <p key={i} className="hint">
                    {run.order.map((m) => `${cellName(m)} ${Math.round((run.probabilities[m] ?? 0) * 100)}%`).join(" · ")}
                  </p>
                ))}
              </div>
            )}
          </div>
        </details>
      )}
    </section>
  );
}

function summary(decision: Decision): string {
  const chosen = decision.candidates.find((c) => c.move === decision.move);
  if (!chosen || chosen.value === null || decision.valueKind === "none") return "";
  const value = formatValue(chosen.value, decision.valueKind, decision.config.kind);
  const even = decision.valueKind === "outcome" && valueTone(chosen.value, "outcome") === "neutral";
  return ` · rated ${even ? "even" : value} · ${decision.candidates.length} options`;
}

function KeyFigures({ decision, roundTripMs }: { decision: Decision; roundTripMs?: number }) {
  const { stats } = decision;
  return (
    <dl className="key-figures">
      <div>
        <dt>Time</dt>
        <dd>{formatMs(roundTripMs ?? stats.serverMs)}</dd>
      </div>
      <div>
        <dt>Jev requests</dt>
        <dd>{stats.jevRequests}</dd>
      </div>
      <div>
        <dt>Tokens</dt>
        <dd>{formatTokens(stats.inputTokens)}</dd>
      </div>
      {decision.model && (
        <div>
          <dt>Model</dt>
          <dd className="small">{decision.model}</dd>
        </div>
      )}
    </dl>
  );
}

function Candidates({ decision, truth, best }: { decision: Decision; truth: Map<number, Outcome>; best: Outcome }) {
  const rows = [...decision.candidates].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const showReplies = rows.some((c) => c.reply != null);
  const showTruth = decision.config.kind !== "perfect";
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Move</th>
          <th>{decision.valueKind === "probability" ? "Probability" : "Value"}</th>
          {showReplies && <th>Worst reply</th>}
          {showReplies && <th>Average</th>}
          {showTruth && <th>With best play</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.move} className={c.move === decision.move ? "chosen" : undefined}>
            <td>{cellName(c.move)}</td>
            <td className={`tone-${valueTone(c.value, decision.valueKind)}`}>{formatValue(c.value, decision.valueKind, decision.config.kind)}</td>
            {showReplies && <td>{c.reply != null ? cellName(c.reply) : "–"}</td>}
            {showReplies && <td>{c.average !== undefined ? formatValue(c.average, "outcome", decision.config.kind) : ""}</td>}
            {showTruth && <td className={truth.get(c.move) === best ? "tone-good" : "tone-bad"}>{outcomeWord(truth.get(c.move) ?? 0)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Leaves({ leaves }: { leaves: LeafJudgement[] }) {
  const names = leafLevelNames(leaves[0]!.probabilities.length);
  // The bar colours run from loss to win, so three levels take the outer and middle colours of five.
  const colour = (level: number) => `level-${Math.round((level * 4) / (names.length - 1))}`;
  return (
    <div>
      <span className="label">Positions Jev rated ({leaves.length} requests)</span>
      <p className="hint">Bar: probability of each answer level, from "will lose" (left) to "will win" (right).</p>
      <div className="leaves">
        {leaves.map((leaf, i) => (
          <div key={i} className="leaf">
            <Board board={leaf.board} size="tiny" />
            <div className="leaf-text">
              <span className={`leaf-value tone-${valueTone(ESTIMATE_WEIGHT * leaf.value, "outcome")}`}>
                {formatValue(ESTIMATE_WEIGHT * leaf.value, "outcome", "jev-lookahead")}
              </span>
              <span className="hint">
                {names[Math.round(leaf.score)]} · {formatMs(leaf.ms)}
              </span>
              <div className="prob-bar">
                {leaf.probabilities.map((p, level) => (
                  <span key={level} className={colour(level)} style={{ width: `${p * 100}%` }} title={`${names[level]}: ${Math.round(p * 100)}%`} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
