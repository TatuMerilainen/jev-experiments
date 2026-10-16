import { useEffect, useMemo, useRef, useState } from "react";
import { playLine } from "../../shared/chess/line";
import {
  lineAt,
  PUZZLE_SETS,
  puzzleSet,
  solverColor,
  solverMoves,
  type Puzzle,
  type PuzzleResultEvent,
  type PuzzleRun,
  type PuzzleRunEvent,
} from "../../shared/chess/puzzles";
import { chessConfig, configKey } from "../../shared/matchups";
import type { StatusResponse } from "../../shared/types";
import { fetchPuzzleAttempt, fetchPuzzleRuns } from "../api";
import { ChessBoard } from "../chess/ChessBoard";
import { chessJevRequestAbout, chessSetupLabel, COLOR_LABEL } from "../chess/chessFormat";
import { ChessPlayerPanel } from "../chess/ChessPlayerPanel";
import { Icon, type IconName } from "../components/Icon";
import { JevSidebar } from "../components/JevSidebar";
import { ReplayBar } from "../components/ReplayBar";
import { StageHead } from "../components/StageHead";
import { DelayControl } from "../components/Toolbar";
import { formatGameTime, formatUsd, PRICE_PER_TOKEN_USD } from "../format";
import { boardOf, currentPuzzle, puzzlesOf, runDone, type PuzzleRunState } from "./puzzleRun";
import { lichessPuzzleUrl, puzzleIdea, solutionSan } from "./puzzleFormat";
import { PuzzleScoreboard } from "./PuzzleScoreboard";
import { PuzzleStepPanel } from "./PuzzleStepPanel";
import { scorePlayers } from "./scoreboard";
import { usePuzzleRun } from "./usePuzzleRun";

interface Props {
  status: StatusResponse | null;
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

/** A saved attempt open for viewing, in the same board and Move panel as the live run. */
interface Viewing {
  run: PuzzleRunEvent;
  result: PuzzleResultEvent;
  puzzle: Puzzle;
  selected: number;
}

export function PuzzleView({ status, sidebarOpen, onCloseSidebar }: Props) {
  const { state, actions, blocked, save } = usePuzzleRun(status?.jevConfigured ?? true);
  const set = puzzleSet(state.settings.set)!;
  const [runs, setRuns] = useState<PuzzleRun[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const stage = useRef<HTMLElement>(null);

  // The scoreboard reloads after each saved attempt.
  useEffect(() => {
    let live = true;
    fetchPuzzleRuns(set.name).then(
      (r) => live && (setRuns(r), setRunsError(null)),
      (e: unknown) => live && setRunsError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [set.name, save.gamesSaved]);
  const scores = useMemo(() => (runs ? scorePlayers(runs, set.puzzles) : null), [runs, set]);

  const open = async (runId: string, puzzleId: string) => {
    setViewError(null);
    try {
      const { run, result } = await fetchPuzzleAttempt(runId, puzzleId);
      const puzzle = set.puzzles.find((p) => p.id === puzzleId)!;
      actions.pause();
      setViewing({ run, result, puzzle, selected: 0 });
      stage.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {
      setViewError(e instanceof Error ? e.message : String(e));
    }
  };

  const puzzle = viewing ? viewing.puzzle : currentPuzzle(state);
  const steps = viewing ? viewing.result.steps : state.steps;
  const latestIndex = steps.length - 1;
  const shownIndex = viewing ? viewing.selected : (state.inspected ?? latestIndex);
  const shownStep = steps[shownIndex];
  const board = viewing ? attemptBoard(viewing) : boardOf(state);
  const lastMove = board?.history({ verbose: true }).at(-1);
  const color = puzzle ? solverColor(puzzle) : "w";
  const human = state.settings.player.kind === "human";
  const jevStep = shownStep?.decision?.jevExample ? shownStep : steps.findLast((s) => s.decision?.jevExample);
  const currentKey = configKey(chessConfig(state.settings.player));

  return (
    <>
      <main className="arena">
        <div className="arena-x">
          <ChessPlayerPanel
            color={color}
            title="Puzzle player"
            setup={state.settings.player}
            jevConfigured={status?.jevConfigured ?? true}
            active={!runDone(state)}
            thinking={state.busy}
            onChange={(player) => actions.changeSettings({ ...state.settings, player })}
          />
        </div>

        <section className="stage" ref={stage}>
          <StageHead
            status={viewing ? "Saved attempt" : statusText(state, blocked, viewError)}
            error={!viewing && (state.error !== null || blocked || viewError !== null)}
            showSwap={false}
            sameSides
            sides=""
            onSwap={() => undefined}
          />
          {board ? (
            <ChessBoard
              fen={board.fen()}
              orientation={color}
              from={lastMove?.from}
              to={lastMove?.to}
              onMove={!viewing && human && !state.showingMove && !state.busy ? actions.humanMove : undefined}
            />
          ) : (
            <div className="puzzle-done card">
              <p>The run is done. Press Run again to try the set once more.</p>
            </div>
          )}
          {viewing ? (
            <ReplayBar
              title={`Puzzle ${viewing.result.puzzleNo}, rating ${viewing.puzzle.rating}: ${chessSetupLabel(chessConfig(viewing.run.setup), true)}`}
              detail={[viewing.result.solved ? "Solved" : "Not solved", `${viewing.result.steps.length} of ${solverMoves(viewing.puzzle).length} moves`, formatGameTime(viewing.result.at)].join(" · ")}
              index={viewing.selected}
              count={viewing.result.steps.length}
              onSelect={(i) => setViewing((v) => v && { ...v, selected: Math.max(0, Math.min(i, v.result.steps.length - 1)) })}
              onClose={() => setViewing(null)}
              closeLabel="Back to live run"
            />
          ) : (
            <PuzzleToolbar state={state} blocked={blocked} actions={actions} />
          )}
        </section>

        <div className="arena-o puzzle-side">
          <PuzzleCard puzzle={puzzle} number={viewing ? viewing.result.puzzleNo : state.index + 1} total={set.puzzles.length} />
          {!viewing && <RunCard state={state} saveError={save.error} saveDir={save.dir} />}
        </div>
      </main>

      <section className="data">
        <PuzzleStepPanel
          puzzle={puzzle}
          index={shownIndex}
          step={shownStep}
          onLatest={!viewing && state.inspected !== null && state.inspected < latestIndex ? () => actions.inspect(null) : undefined}
        />
        {steps.length > 1 && (
          <div className="puzzle-steps">
            {steps.map((s, i) => (
              <button
                key={i}
                type="button"
                className={`btn btn-small ${i === shownIndex ? "selected" : ""}`}
                onClick={() => (viewing ? setViewing({ ...viewing, selected: i }) : actions.inspect(i))}
              >
                Move {i + 1} {s.correct ? "✓" : "✗"}
              </button>
            ))}
          </div>
        )}
        <PuzzleScoreboard set={set} scores={scores} error={runsError} currentKey={currentKey} onOpen={(runId, puzzleId) => void open(runId, puzzleId)} />
      </section>

      {sidebarOpen && (
        <JevSidebar
          example={jevStep?.decision?.jevExample}
          about={jevStep?.decision ? chessJevRequestAbout(state.settings.player, color, jevStep.decision.candidates.length) : ""}
          source={jevStep && puzzle ? `Puzzle ${puzzle.id} · ${COLOR_LABEL[color]} played ${jevStep.san}` : ""}
          requests={jevStep?.decision?.stats.jevRequests ?? 0}
          onClose={onCloseSidebar}
        />
      )}
    </>
  );
}

/** The position of a saved attempt at the selected move, with that move played. */
function attemptBoard({ puzzle, result, selected }: Viewing) {
  const game = playLine(lineAt(puzzle, selected));
  const played = result.steps[selected]?.played;
  if (played) game.move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] });
  return game;
}

function statusText(state: PuzzleRunState, blocked: boolean, viewError: string | null): string {
  const total = puzzlesOf(state).length;
  const extra = viewError ? ` · Opening the attempt failed: ${viewError}` : "";
  if (runDone(state)) return `Run done: ${state.results.filter((r) => r.solved).length} of ${total} solved${extra}`;
  if (blocked) return "Jev players are off without an API key. Pick another player.";
  if (state.error) return `Stopped: ${state.error}${extra}`;
  const puzzle = currentPuzzle(state)!;
  const head = `Puzzle ${state.index + 1} of ${total} · rating ${puzzle.rating}`;
  const last = state.steps.at(-1);
  if (state.busy) return `${head} · Thinking…${extra}`;
  if (state.showingMove && last) {
    if (!last.correct) return `${head} · Wrong move. The solution was ${solutionSan(puzzle, state.step)}${extra}`;
    const solved = state.results.at(-1)?.puzzleId === puzzle.id;
    return `${head} · ${solved ? "Solved" : "Right move"}${extra}`;
  }
  if (state.settings.player.kind === "human") return `${head} · Your move as ${COLOR_LABEL[solverColor(puzzle)]}${extra}`;
  return `${head} · ${state.running ? "Playing" : "Paused"}${extra}`;
}

type Actions = ReturnType<typeof usePuzzleRun>["actions"];

function PuzzleToolbar({ state, blocked, actions }: { state: PuzzleRunState; blocked: boolean; actions: Actions }) {
  const done = runDone(state);
  const main: { icon: IconName; label: string; title: string; onClick: () => void } = state.running
    ? { icon: "pause", label: "Pause", title: "Pause after the current move", onClick: actions.pause }
    : done
      ? { icon: "restart", label: "Run again", title: "Start a new run of the set", onClick: actions.play }
      : { icon: "play", label: "Play", title: state.settings.continuous ? "Play runs of the set one after another" : "Play through the set", onClick: actions.play };
  return (
    <>
      <div className="toolbar">
        <button type="button" className="btn btn-icon" onClick={actions.reset} title="Reset: a new run from the first puzzle" aria-label="Reset">
          <Icon name="reset" />
        </button>
        <button type="button" className="btn btn-icon" onClick={actions.step} disabled={state.busy || done || blocked} title="Play one move" aria-label="Step">
          <Icon name="step" />
        </button>
        <button type="button" className="btn btn-primary btn-play" onClick={main.onClick} disabled={blocked} title={main.title}>
          <Icon name={main.icon} />
          {main.label}
        </button>
        <DelayControl delayMs={state.settings.delayMs} onDelayChange={actions.setDelay} />
      </div>
      <div className="toolbar-switches">
        <label className="row row-compact" title="Changing the set starts a new run">
          <span>Puzzle set</span>
          <select className="select select-small" value={state.settings.set} onChange={(e) => actions.changeSettings({ ...state.settings, set: e.target.value })}>
            {PUZZLE_SETS.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.puzzles.length})
              </option>
            ))}
          </select>
        </label>
        <label className="row row-compact" title="Start a new run of the set when a run ends">
          <span>Continuous play</span>
          <input type="checkbox" className="switch" checked={state.settings.continuous} onChange={(e) => actions.setContinuous(e.target.checked)} />
        </label>
      </div>
    </>
  );
}

function PuzzleCard({ puzzle, number, total }: { puzzle: Puzzle | undefined; number: number; total: number }) {
  if (!puzzle) return null;
  const moves = solverMoves(puzzle).length;
  return (
    <section className="card puzzle-card">
      <h2 className="card-title">
        Puzzle {number} of {total}
      </h2>
      <dl className="puzzle-facts">
        <div>
          <dt>Rating</dt>
          <dd>{puzzle.rating}</dd>
        </div>
        <div>
          <dt>Idea</dt>
          <dd>{puzzleIdea(puzzle)}</dd>
        </div>
        <div>
          <dt>Solver</dt>
          <dd>{COLOR_LABEL[solverColor(puzzle)]}</dd>
        </div>
        <div>
          <dt>Moves to find</dt>
          <dd>{moves}</dd>
        </div>
      </dl>
      <p className="hint">
        Themes: {puzzle.themes.map(themeName).join(", ")}.{" "}
        <a href={lichessPuzzleUrl(puzzle)} target="_blank" rel="noreferrer">
          Open on Lichess
        </a>
      </p>
    </section>
  );
}

function RunCard({ state, saveError, saveDir }: { state: PuzzleRunState; saveError: string | null; saveDir: string | null }) {
  const total = puzzlesOf(state).length;
  const { results } = state;
  const tokens = results.reduce((sum, r) => sum + r.steps.reduce((t, s) => t + (s.decision?.stats.inputTokens ?? 0), 0), 0);
  return (
    <section className="card">
      <h2 className="card-title">This run</h2>
      <dl className="puzzle-facts">
        <div>
          <dt>Done</dt>
          <dd>
            {results.length} of {total}
          </dd>
        </div>
        <div>
          <dt>Solved</dt>
          <dd>{results.filter((r) => r.solved).length}</dd>
        </div>
        <div>
          <dt>First move right</dt>
          <dd>{results.filter((r) => r.steps[0]?.correct).length}</dd>
        </div>
        <div>
          <dt>Jev cost</dt>
          <dd>{formatUsd(tokens * PRICE_PER_TOKEN_USD)}</dd>
        </div>
      </dl>
      <p className="footnote">
        {saveError ? (
          <span className="tone-bad">Saving failed: {saveError}</span>
        ) : saveDir?.endsWith(state.runId) ? (
          <span title={saveDir}>Saved to data/puzzles</span>
        ) : (
          "Saved to disk after each puzzle"
        )}
      </p>
    </section>
  );
}

/** "backRankMate" becomes "back rank mate". */
const themeName = (theme: string) => theme.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase();
