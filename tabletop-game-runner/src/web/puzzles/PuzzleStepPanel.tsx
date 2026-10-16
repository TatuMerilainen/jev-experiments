import { solverColor, solverMoves, type Puzzle, type PuzzleStep } from "../../shared/chess/puzzles";
import { Candidates, KeyFigures } from "../chess/ChessDecisionPanel";
import { CHESS_KIND_LABELS, COLOR_LABEL, PIECE_GLYPH } from "../chess/chessFormat";
import { puzzleIdea, solutionSan } from "./puzzleFormat";

interface Props {
  puzzle: Puzzle | undefined;
  /** The solver move shown, from 0. */
  index: number;
  step: PuzzleStep | undefined;
  /** Set while an older move of the puzzle is shown. The button brings back the latest move. */
  onLatest?: () => void;
}

/** One solver move of a puzzle: what the player chose, the solution, and the player's candidates. */
export function PuzzleStepPanel({ puzzle, index, step, onLatest }: Props) {
  if (!puzzle) return null;
  const color = solverColor(puzzle);
  const total = solverMoves(puzzle).length;
  if (!step) {
    return (
      <section className="card">
        <h2 className="card-title">Puzzle move</h2>
        <p className="hint">
          Find the best move for {COLOR_LABEL[color]}. The solution has {total} {total === 1 ? "move" : "moves"}. {puzzleIdea(puzzle)}.
        </p>
      </section>
    );
  }
  const { decision } = step;
  return (
    <section className="card decision">
      <div className="card-head">
        <h2 className="card-title">
          <span className={`piece piece-${color} inline-piece`}>{PIECE_GLYPH.k}</span>
          Move {index + 1} of {total}: {COLOR_LABEL[color]} played {step.san}
        </h2>
        <div className="card-head-end">
          {onLatest && (
            <button type="button" className="btn btn-small btn-ghost" onClick={onLatest} title="Show the latest move, and follow each new move again">
              Latest move
            </button>
          )}
          <span className={`chip ${step.correct ? "chip-good" : "chip-bad"}`}>{step.correct ? "Right" : "Wrong"}</span>
        </div>
      </div>
      <p className="hint">
        {decision ? CHESS_KIND_LABELS[decision.kind] : "Human"} · Solution: {solutionSan(puzzle, index)}
        {step.correct && step.played !== step.expected ? " · Another move that gives checkmate also counts" : ""}
        {step.inCandidates === false ? " · The solution was not among the candidates" : ""}
        {decision?.note ? ` · ${decision.note}` : ""}
      </p>
      {decision && (
        <div className="decision-main">
          <KeyFigures decision={decision} roundTripMs={step.roundTripMs} />
          {decision.candidates.length > 1 && <Candidates decision={decision} solution={step.expected} />}
        </div>
      )}
      {decision?.candidates.some((c) => c.description) && (
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
