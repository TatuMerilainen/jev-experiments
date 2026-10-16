import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ChessPlayerSetup } from "../../shared/chess/types";
import { chessDecide, chessGrade } from "../api";
import { loadSettings, normalizeChessSettings, SETTINGS_KEYS, useSavedSettings, withStandIns } from "../savedSettings";
import { usesChessJev } from "./chessFormat";
import {
  answersHuman,
  chessReducer,
  DEFAULT_CHESS_SETTINGS,
  gameOpening,
  initialChessState,
  nextOpeningMove,
  pendingGrades,
  replayGame,
  type ChessSettings,
} from "./chessExperiment";

const turnOf = (fen: string) => (fen.split(" ")[1] === "b" ? "b" : "w");

export function useChessExperiment() {
  const [state, dispatch] = useReducer(chessReducer, undefined, () =>
    initialChessState(loadSettings(SETTINGS_KEYS.chess, normalizeChessSettings, DEFAULT_CHESS_SETTINGS)),
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const [standIns] = useState(() => new WeakMap<ChessPlayerSetup, ChessPlayerSetup>());
  useSavedSettings(SETTINGS_KEYS.chess, state.settings, standIns);

  // A new generation discards answers to requests sent before a reset.
  const generation = useRef(0);
  const inflight = useRef<AbortController | null>(null);
  const gradesAsked = useRef(new Set<string>());

  const cancel = useCallback(() => {
    generation.current++;
    inflight.current?.abort();
    inflight.current = null;
  }, []);
  // Switching to the other game closes this view. The server then stops the Jev calls of this move.
  useEffect(() => cancel, [cancel]);

  const botMove = useCallback(async () => {
    const s = stateRef.current;
    if (s.busy || s.outcome || inflight.current) return;
    const opening = nextOpeningMove(s);
    if (opening) {
      dispatch({ type: "move", uci: opening, source: "opening", opening: gameOpening(s)!.opening.name });
      return;
    }
    const setup = s.settings.players[turnOf(s.fen)];
    if (setup.kind === "human") return;

    if (s.settings.openings === "random-first" && s.moves.length === 0) {
      const legal = replayGame([]).moves({ verbose: true });
      const m = legal[Math.floor(Math.random() * legal.length)]!;
      dispatch({ type: "move", uci: m.from + m.to, source: "random-opening" });
      return;
    }

    const gen = generation.current;
    const controller = new AbortController();
    inflight.current = controller;
    dispatch({ type: "busy" });
    const started = performance.now();
    try {
      const decision = await chessDecide(
        s.moves.map((m) => m.uci),
        setup,
        controller.signal,
      );
      if (gen !== generation.current) return;
      dispatch({ type: "move", uci: decision.uci, source: setup.kind, decision, roundTripMs: performance.now() - started });
    } catch (error) {
      if (gen !== generation.current) return;
      dispatch({ type: "failed", message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (inflight.current === controller) inflight.current = null;
    }
  }, []);

  // Stockfish rates each move in the background.
  useEffect(() => {
    state.moves.forEach((move, index) => {
      const key = `${state.experimentId}:${state.gameNo}:${index}`;
      if (move.grade !== "pending" || gradesAsked.current.has(key)) return;
      gradesAsked.current.add(key);
      const before = state.moves.slice(0, index).map((m) => m.uci);
      const { experimentId, gameNo } = state;
      chessGrade(before, move.uci).then(
        (grade) => dispatch({ type: "graded", experimentId, gameNo, index, grade }),
        (error: unknown) =>
          dispatch({ type: "graded", experimentId, gameNo, index, grade: "failed", error: error instanceof Error ? error.message : String(error) }),
      );
    });
  }, [state.moves, state.experimentId, state.gameNo]);

  // Only true after the last move, so a rating that arrives during a game leaves the move timer alone.
  const waitingForGrades = state.outcome !== null && pendingGrades(state);
  const answering = answersHuman(state);
  const openingPending = nextOpeningMove(state) !== null;
  useEffect(() => {
    if (!(state.running || answering) || state.busy || state.error) return;
    // Play on a finished game starts the next game. It waits until every move of this one is rated,
    // so the saved data is complete. Continuous play first shows the final position for the delay.
    if (state.outcome) {
      if (waitingForGrades) return;
      const timer = setTimeout(() => dispatch({ type: "newGame" }), state.settings.continuous ? state.settings.delayMs : 0);
      return () => clearTimeout(timer);
    }
    if (state.settings.players[turnOf(state.fen)].kind === "human" && !openingPending) return;
    const timer = setTimeout(() => void botMove(), state.settings.delayMs);
    return () => clearTimeout(timer);
  }, [state.running, answering, state.busy, state.error, state.outcome, state.fen, state.settings, waitingForGrades, openingPending, botMove]);

  const actions = {
    play: () => dispatch({ type: "setRunning", running: true }),
    pause: () => dispatch({ type: "setRunning", running: false }),
    step: () => {
      dispatch({ type: "setRunning", running: false });
      const s = stateRef.current;
      if (s.busy) return;
      if (s.outcome) {
        if (!pendingGrades(s)) dispatch({ type: "newGame" });
      } else void botMove();
    },
    reset: () => {
      cancel();
      dispatch({ type: "reset" });
    },
    humanMove: (from: string, to: string) => {
      const s = stateRef.current;
      if (s.busy || s.outcome || nextOpeningMove(s)) return;
      if (s.settings.players[turnOf(s.fen)].kind !== "human") return;
      const game = replayGame(s.moves);
      const move = game.moves({ verbose: true }).find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === "q"));
      if (!move) return;
      dispatch({ type: "move", uci: move.from + move.to + (move.promotion ?? ""), source: "human" });
    },
    /** Player and opening changes start a new experiment, so the tally covers one setup. */
    changeSetup: (settings: ChessSettings) => {
      cancel();
      dispatch({ type: "setSettings", settings, restart: true });
    },
    setDelay: (delayMs: number) => dispatch({ type: "setSettings", settings: { ...stateRef.current.settings, delayMs }, restart: false }),
    setContinuous: (continuous: boolean) => {
      const s = stateRef.current;
      dispatch({ type: "setSettings", settings: { ...s.settings, continuous }, restart: false });
      // Turning it off between two games stops play at the finished game.
      if (!continuous && s.outcome) dispatch({ type: "setRunning", running: false });
    },
    inspect: (index: number | null) => dispatch({ type: "inspect", index }),
    /** Without an API key, Code players take the places of the Jev players. */
    withoutJev: () => {
      cancel();
      const replace = (setup: ChessPlayerSetup): ChessPlayerSetup => (usesChessJev(setup.kind) ? { ...setup, kind: "code", instructions: null } : setup);
      dispatch({ type: "setSettings", settings: withStandIns(stateRef.current.settings, standIns, replace), restart: true });
    },
  };

  return { state, actions };
}
