import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { lineAt, type PuzzleLogEvent } from "../../shared/chess/puzzles";
import { playLine } from "../../shared/chess/line";
import { chessDecide, savePuzzleLog } from "../api";
import { usesChessJev } from "../chess/chessFormat";
import { loadSettings, normalizePuzzleSettings, SETTINGS_KEYS } from "../savedSettings";
import { SaveQueue, type SaveStatus } from "../saveQueue";
import { currentPuzzle, DEFAULT_PUZZLE_SETTINGS, initialPuzzleState, puzzleReducer, runDone, type PuzzleRunState, type PuzzleSettings } from "./puzzleRun";

/** Runs one player through a puzzle set, move by move, with the same controls as a game. */
export function usePuzzleRun(jevConfigured: boolean) {
  const [state, dispatch] = useReducer(puzzleReducer, undefined, () =>
    initialPuzzleState(loadSettings(SETTINGS_KEYS.puzzles, normalizePuzzleSettings, DEFAULT_PUZZLE_SETTINGS)),
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEYS.puzzles, JSON.stringify(state.settings));
    } catch {
      // Storage is blocked. The settings then start from the defaults after a reload.
    }
  }, [state.settings]);

  // A new generation discards answers to requests sent before a reset.
  const generation = useRef(0);
  const inflight = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    generation.current++;
    inflight.current?.abort();
    inflight.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const botMove = useCallback(async () => {
    const s = stateRef.current;
    const puzzle = currentPuzzle(s);
    if (!puzzle || s.busy || s.showingMove || inflight.current || s.settings.player.kind === "human") return;
    const gen = generation.current;
    const controller = new AbortController();
    inflight.current = controller;
    dispatch({ type: "busy" });
    const started = performance.now();
    try {
      const line = lineAt(puzzle, s.step);
      const decision = await chessDecide(line.moves, s.settings.player, controller.signal, line.start);
      if (gen !== generation.current) return;
      dispatch({ type: "move", uci: decision.uci, san: decision.san, decision, roundTripMs: performance.now() - started });
    } catch (error) {
      if (gen !== generation.current) return;
      dispatch({ type: "failed", message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (inflight.current === controller) inflight.current = null;
    }
  }, []);

  const blocked = !jevConfigured && usesChessJev(state.settings.player.kind);
  const human = state.settings.player.kind === "human";
  // After a human move, the opponent's reply comes by itself, also while paused.
  const answering = human && state.showingMove;
  useEffect(() => {
    if (!(state.running || answering) || state.busy || state.error || blocked || runDone(state)) return;
    if (!state.showingMove && human) return;
    const timer = setTimeout(() => (state.showingMove ? dispatch({ type: "advance" }) : void botMove()), state.settings.delayMs);
    return () => clearTimeout(timer);
  }, [state.running, answering, state.busy, state.error, state.showingMove, state.index, state.step, state.settings, blocked, human, botMove]);

  const actions = {
    play: () => dispatch({ type: "setRunning", running: true }),
    pause: () => dispatch({ type: "setRunning", running: false }),
    /** One move: the player's move, or the opponent's reply, or the next puzzle. */
    step: () => {
      dispatch({ type: "setRunning", running: false });
      const s = stateRef.current;
      if (s.busy || runDone(s)) return;
      if (s.showingMove) dispatch({ type: "advance" });
      else void botMove();
    },
    reset: () => {
      cancel();
      dispatch({ type: "reset" });
    },
    /** A changed player or set starts a new run, so a run always covers one setup. */
    changeSettings: (settings: PuzzleSettings) => {
      cancel();
      dispatch({ type: "setSettings", settings });
    },
    setDelay: (delayMs: number) => dispatch({ type: "setDelay", delayMs }),
    setContinuous: (continuous: boolean) => dispatch({ type: "setContinuous", continuous }),
    inspect: (index: number | null) => dispatch({ type: "inspect", index }),
    humanMove: (from: string, to: string) => {
      const s = stateRef.current;
      const puzzle = currentPuzzle(s);
      if (!puzzle || s.busy || s.showingMove || s.settings.player.kind !== "human") return;
      const game = playLine(lineAt(puzzle, s.step));
      const move = game.moves({ verbose: true }).find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === "q"));
      if (move) dispatch({ type: "move", uci: move.from + move.to + (move.promotion ?? ""), san: move.san, roundTripMs: 0 });
    },
  };

  return { state, actions, blocked, save: usePuzzleLog(state) };
}

/** Saves the run header before the first attempt, then each finished attempt, in order. */
function usePuzzleLog(state: PuzzleRunState): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>({ dir: null, error: null, gamesSaved: 0 });
  const [queue] = useState(() => new SaveQueue<PuzzleLogEvent>(savePuzzleLog, setStatus, undefined, "puzzle"));
  const sent = useRef({ runId: "", results: 0 });

  useEffect(() => {
    const s = sent.current;
    if (s.runId !== state.runId) Object.assign(s, { runId: state.runId, results: 0 });
    if (state.results.length <= s.results) return;
    const events: PuzzleLogEvent[] = [];
    if (s.results === 0) {
      const { runId, settings } = state;
      events.push({ type: "puzzle-run", runId, at: new Date().toISOString(), set: settings.set, setup: settings.player });
    }
    events.push(...state.results.slice(s.results));
    s.results = state.results.length;
    queue.push(events);
  }, [state.results, state.runId]);

  return status;
}
