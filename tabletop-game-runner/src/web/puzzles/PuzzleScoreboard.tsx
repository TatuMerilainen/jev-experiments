import type { PuzzleSet } from "../../shared/chess/puzzles";
import { chessPlayerTone, chessSetupLabel, type PlayerTone } from "../chess/chessFormat";
import { chessConfig } from "../../shared/matchups";
import { JEV_MODELS } from "../../shared/types";
import { formatMs, formatUsd, PRICE_PER_TOKEN_USD } from "../format";
import { cellText, puzzleIdea } from "./puzzleFormat";
import type { PlayerScore } from "./scoreboard";

interface Props {
  set: PuzzleSet;
  scores: PlayerScore[] | null;
  error: string | null;
  /** The key of the player on the page now, to mark its rows. */
  currentKey: string;
  onOpen: (runId: string, puzzleId: string) => void;
}

const TONE_NAMES: Record<PlayerTone, string> = {
  "jev-1": `Jev, ${JEV_MODELS[0]}`,
  "jev-2": `Jev, ${JEV_MODELS[1]}`,
  "jev-3": "Jev, other model",
  stockfish: "Stockfish",
  code: "Search only",
  random: "Random",
  human: "Human",
};

const percent = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "–");
const ratio = (n: number, total: number) => (total ? `${n} of ${total}` : "–");

/** Every saved run of the set, per player configuration, and a grid of players by puzzles. */
export function PuzzleScoreboard({ set, scores, error, currentKey, onOpen }: Props) {
  const puzzles = [...set.puzzles].sort((a, b) => a.rating - b.rating);
  const ratings = puzzles.map((p) => p.rating);
  const label = (s: PlayerScore) => <PlayerName tone={chessPlayerTone(s.setup)} text={chessSetupLabel(chessConfig(s.setup), true)} />;
  const tones = (Object.keys(TONE_NAMES) as PlayerTone[]).filter((t) => scores?.some((s) => chessPlayerTone(s.setup) === t));
  return (
    <section className="card">
      <h2 className="card-title">Puzzle scoreboard</h2>
      <p className="hint">
        {set.name}: {set.puzzles.length} puzzles, ratings {Math.min(...ratings)} to {Math.max(...ratings)}. Every run counts. "Solved" counts a puzzle that
        was solved in at least one run. "Attempts solved" counts every run. The rows are sorted by the share of attempts solved.
      </p>
      {error ? (
        <p className="hint status-bad">Saved runs could not be loaded: {error}</p>
      ) : !scores ? (
        <p className="hint">Loading saved runs…</p>
      ) : scores.length === 0 ? (
        <p className="hint">No saved runs yet. Press Play to run the set.</p>
      ) : (
        <>
          <p className="player-legend">
            {tones.map((t) => (
              <PlayerName key={t} tone={t} text={TONE_NAMES[t]} />
            ))}
          </p>
          <h3 className="label puzzle-section-title">By puzzle, easiest first</h3>
          <div className="table-scroll">
            <table className="table puzzle-grid">
              <thead>
                <tr>
                  <th>Player</th>
                  {puzzles.map((p) => (
                    <th key={p.id} className="puzzle-grid-head" title={`${p.id}: ${p.themes.join(", ")}`}>
                      <span className="puzzle-grid-rating">{p.rating}</span>
                      <span className="hint">{puzzleIdea(p)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.key} className={s.key === currentKey ? "current" : undefined}>
                    <td className="stats-player">{label(s)}</td>
                    {puzzles.map((p) => {
                      const cell = s.cells.get(p.id);
                      if (!cell) return <td key={p.id} className="puzzle-cell puzzle-cell-none">–</td>;
                      const tone = cell.solved === cell.attempts ? "good" : cell.solved === 0 ? "bad" : "mixed";
                      return (
                        <td key={p.id} className="puzzle-cell">
                          <button
                            type="button"
                            className={`puzzle-cell-button puzzle-cell-${tone}`}
                            onClick={() => onOpen(cell.latestRunId, p.id)}
                            title={`Solved in ${cell.solved} of ${cell.attempts} ${cell.attempts === 1 ? "run" : "runs"}. Click to open the newest attempt.`}
                          >
                            {cellText(cell.attempts, cell.solved)}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="label puzzle-section-title puzzle-section-next">By player</h3>
          <div className="table-scroll">
            <table className="table table-wide">
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="num">Solved</th>
                  <th className="num">Attempts solved</th>
                  <th className="num">First move right</th>
                  <th className="num" title="Solver moves where the solution was among the moves the player chose between">
                    Solution among candidates
                  </th>
                  <th className="num" title="Of the moves with the solution among the candidates, the share where the player picked a right move">
                    Picked when there
                  </th>
                  <th className="num">Runs</th>
                  <th className="num">Cost per puzzle</th>
                  <th className="num">Time per move</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.key} className={s.key === currentKey ? "current" : undefined}>
                    <td className="stats-player">{label(s)}</td>
                    <td className="num">
                      <strong>{s.solved}</strong> of {set.puzzles.length}
                    </td>
                    <td className="num">{ratio(s.attemptsSolved, s.attempts)}</td>
                    <td className="num">{percent(s.firstMoveRight, s.attempts)}</td>
                    <td className="num">{s.candidateMoves ? ratio(s.solutionInCandidates, s.candidateMoves) : "–"}</td>
                    <td className="num">{s.solutionInCandidates ? percent(s.pickedWhenThere, s.solutionInCandidates) : "–"}</td>
                    <td className="num">{s.runs}</td>
                    <td className="num">{s.tokens ? formatUsd((s.tokens * PRICE_PER_TOKEN_USD) / s.attempts) : "–"}</td>
                    <td className="num">{s.moves ? formatMs(s.ms / s.moves) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </>
      )}
    </section>
  );
}

function PlayerName({ tone, text }: { tone: PlayerTone; text: string }) {
  return (
    <span className={`player-name player-${tone}`}>
      <span className="player-swatch" aria-hidden="true" />
      {text}
    </span>
  );
}
