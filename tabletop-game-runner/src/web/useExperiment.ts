import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toMove } from "../shared/tictactoe";
import { decide } from "./api";
import type { PlayerSetup } from "../shared/types";
import { answersHuman, DEFAULT_SETTINGS, initialState, reducer, type Settings } from "./experiment";
import { usesJev } from "./format";
import { loadSettings, normalizeSettings, SETTINGS_KEYS, useSavedSettings, withStandIns } from "./savedSettings";

export function useExperiment() {
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialState(loadSettings(SETTINGS_KEYS.tictactoe, normalizeSettings, DEFAULT_SETTINGS)),
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const [standIns] = useState(() => new WeakMap<PlayerSetup, PlayerSetup>());
  useSavedSettings(SETTINGS_KEYS.tictactoe, state.settings, standIns);

  // A new generation discards answers to requests sent before a reset.
  const generation = useRef(0);
  const inflight = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    generation.current++;
    inflight.current?.abort();
    inflight.current = null;
  }, []);
  // Switching to the other game closes this view. The server then stops the Jev calls of this move.
  useEffect(() => cancel, [cancel]);

  const botMove = useCallback(async () => {
    const s = stateRef.current;
    if (s.busy || s.result || inflight.current) return;
    const setup = s.settings.players[toMove(s.board)];
    if (setup.kind === "human") return;

    if (s.settings.randomFirst && s.moves.length === 0) {
      dispatch({ type: "move", cell: Math.floor(Math.random() * 9), source: "random-opening" });
      return;
    }

    const gen = generation.current;
    const controller = new AbortController();
    inflight.current = controller;
    dispatch({ type: "busy" });
    const started = performance.now();
    try {
      const config = { kind: setup.kind, depth: setup.depth, lines: setup.lines, instructions: setup.instructions, model: setup.model };
      const decision = await decide(s.board, config, controller.signal);
      if (gen !== generation.current) return;
      dispatch({ type: "move", cell: decision.move, source: setup.kind, decision, roundTripMs: performance.now() - started });
    } catch (error) {
      if (gen !== generation.current) return;
      dispatch({ type: "failed", message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (inflight.current === controller) inflight.current = null;
    }
  }, []);

  const answering = answersHuman(state);
  useEffect(() => {
    if (!(state.running || answering) || state.busy || state.error) return;
    // Play on a finished game starts the next game. Continuous play first shows the final position for the delay.
    if (state.result) {
      const timer = setTimeout(() => dispatch({ type: "newGame" }), state.settings.continuous ? state.settings.delayMs : 0);
      return () => clearTimeout(timer);
    }
    if (state.settings.players[toMove(state.board)].kind === "human") return;
    const timer = setTimeout(() => void botMove(), state.settings.delayMs);
    return () => clearTimeout(timer);
  }, [state.running, answering, state.busy, state.error, state.result, state.board, state.settings, botMove]);

  const actions = {
    play: () => dispatch({ type: "setRunning", running: true }),
    pause: () => dispatch({ type: "setRunning", running: false }),
    step: () => {
      dispatch({ type: "setRunning", running: false });
      const s = stateRef.current;
      if (s.busy) return;
      if (s.result) dispatch({ type: "newGame" });
      else void botMove();
    },
    reset: () => {
      cancel();
      dispatch({ type: "reset" });
    },
    clickCell: (cell: number) => {
      const s = stateRef.current;
      if (s.busy || s.result || s.board[cell] !== null) return;
      if (s.settings.players[toMove(s.board)].kind !== "human") return;
      dispatch({ type: "move", cell, source: "human" });
    },
    /** Player and opening changes start a new experiment, so the tally covers one setup. */
    changeSetup: (settings: Settings) => {
      cancel();
      dispatch({ type: "setSettings", settings, restart: true });
    },
    setDelay: (delayMs: number) =>
      dispatch({ type: "setSettings", settings: { ...stateRef.current.settings, delayMs }, restart: false }),
    setContinuous: (continuous: boolean) => {
      const s = stateRef.current;
      dispatch({ type: "setSettings", settings: { ...s.settings, continuous }, restart: false });
      // Turning it off between two games stops play at the finished game.
      if (!continuous && s.result) dispatch({ type: "setRunning", running: false });
    },
    inspect: (index: number | null) => dispatch({ type: "inspect", index }),
    /** Without an API key, Search only players take the places of the Jev players. */
    withoutJev: () => {
      cancel();
      const replace = (setup: PlayerSetup): PlayerSetup => (usesJev(setup.kind) ? { ...setup, kind: "code-only", instructions: null } : setup);
      dispatch({ type: "setSettings", settings: withStandIns(stateRef.current.settings, standIns, replace), restart: true });
    },
  };

  return { state, actions };
}
