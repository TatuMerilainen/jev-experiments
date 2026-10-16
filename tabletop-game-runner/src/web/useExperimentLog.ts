import { useEffect, useRef, useState } from "react";
import type { Grade } from "../shared/solver";
import { cellIndex, cellName } from "../shared/tictactoe";
import type { LogEvent, SavedMove } from "../shared/types";
import { saveLog } from "./api";
import { playsRandomFirst, type ExperimentState, type MoveRecord } from "./experiment";
import { SaveQueue, type SaveStatus } from "./saveQueue";

export type { SaveStatus } from "./saveQueue";

/** Sends each new move and each finished game to the server, one request at a time, in order. */
export function useExperimentLog(state: ExperimentState): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>({ dir: null, error: null, gamesSaved: 0 });
  const [queue] = useState(() => new SaveQueue<LogEvent>(saveLog, setStatus));
  const sent = useRef({ experimentId: "", gameNo: 0, moves: 0, gameSaved: false });
  const headersSent = useRef(new Set<string>());

  useEffect(() => {
    const s = sent.current;
    if (s.experimentId !== state.experimentId || s.gameNo !== state.gameNo) {
      Object.assign(s, { experimentId: state.experimentId, gameNo: state.gameNo, moves: 0, gameSaved: false });
    }
    const { experimentId, gameNo } = state;
    const at = new Date().toISOString();
    const events: LogEvent[] = [];

    // The header waits for the first move, so experiments with no moves leave no folder.
    if (state.moves.length > s.moves && !headersSent.current.has(experimentId)) {
      headersSent.current.add(experimentId);
      const { players } = state.settings;
      events.push({ type: "experiment", experimentId, at, settings: { players, randomFirst: playsRandomFirst(state.settings) } });
    }
    for (let i = s.moves; i < state.moves.length; i++) {
      events.push({ type: "move", experimentId, at, gameNo, moveNo: i + 1, move: toSavedMove(state.moves[i]!) });
    }
    s.moves = state.moves.length;
    if (state.result && !s.gameSaved) {
      s.gameSaved = true;
      events.push({ type: "game", experimentId, at, gameNo, result: state.result, sequence: state.moves.map((m) => cellName(m.cell)) });
    }

    queue.push(events);
  }, [state]);

  return status;
}

function toSavedMove(record: MoveRecord): SavedMove {
  return {
    player: record.player,
    cell: cellName(record.cell),
    source: record.source,
    setup: record.setup,
    before: record.before,
    grade: record.grade,
    roundTripMs: record.roundTripMs,
    decision: record.decision,
  };
}

/** A saved move as a move record again, for a replay. */
export function fromSavedMove(saved: SavedMove): MoveRecord {
  return {
    player: saved.player,
    cell: cellIndex(saved.cell),
    source: saved.source,
    setup: saved.setup,
    before: saved.before,
    grade: saved.grade as Grade,
    roundTripMs: saved.roundTripMs,
    decision: saved.decision,
  };
}
