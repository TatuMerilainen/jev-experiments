import { useEffect, useRef, useState } from "react";
import type { ChessLogEvent, SavedChessMove } from "../../shared/chess/types";
import { saveLog } from "../api";
import { SaveQueue, type SaveStatus } from "../saveQueue";
import { gameOpening, startKind, type ChessMoveRecord, type ChessState } from "./chessExperiment";

interface Sent {
  experimentId: string;
  gameNo: number;
  moves: number;
  gameSaved: boolean;
}

/**
 * Sends each move and each finished game to the server, one request at a time, in order.
 * A move is sent once Stockfish has rated it, so the saved line includes the rating.
 */
export function useChessLog(state: ChessState): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>({ dir: null, error: null, gamesSaved: 0 });
  const [queue] = useState(() => new SaveQueue<ChessLogEvent>(saveLog, setStatus));
  const sent = useRef<Sent>({ experimentId: "", gameNo: 0, moves: 0, gameSaved: false });
  const headersSent = useRef(new Set<string>());
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => queue.push(newChessEvents(state, sent.current, headersSent.current, false)), [state]);
  // The ratings still running when the view closes never arrive, so those moves are saved without them.
  useEffect(() => () => queue.push(newChessEvents(stateRef.current, sent.current, headersSent.current, true)), [queue]);

  return status;
}

/** The events not sent yet. `flush` also sends the moves that wait for a rating, and the finished game after them. */
export function newChessEvents(state: ChessState, s: Sent, headersSent: Set<string>, flush: boolean): ChessLogEvent[] {
  if (s.experimentId !== state.experimentId || s.gameNo !== state.gameNo) {
    Object.assign(s, { experimentId: state.experimentId, gameNo: state.gameNo, moves: 0, gameSaved: false });
  }
  const { experimentId, gameNo } = state;
  const at = new Date().toISOString();
  const events: ChessLogEvent[] = [];

  let ready = s.moves;
  while (ready < state.moves.length && (flush || state.moves[ready]!.grade !== "pending")) ready++;

  if (ready > s.moves && !headersSent.has(experimentId)) {
    headersSent.add(experimentId);
    const { players } = state.settings;
    const openings = startKind(state.settings);
    events.push({ type: "experiment", game: "chess", experimentId, at, settings: { players, randomFirst: openings === "random-first", openings } });
  }
  for (let i = s.moves; i < ready; i++) {
    events.push({ type: "move", game: "chess", experimentId, at, gameNo, moveNo: i + 1, move: toSaved(state.moves[i]!) });
  }
  s.moves = ready;

  if (state.outcome && ready === state.moves.length && !s.gameSaved) {
    s.gameSaved = true;
    const { winner, reason } = state.outcome;
    const opening = gameOpening(state);
    events.push({
      type: "game",
      game: "chess",
      experimentId,
      at,
      gameNo,
      result: winner === "w" ? "1-0" : winner === "b" ? "0-1" : "1/2-1/2",
      reason,
      plies: state.moves.length,
      inputTokens: state.moves.reduce((sum, m) => sum + (m.decision?.stats.inputTokens ?? 0), 0),
      sequence: state.moves.map((m) => m.san),
      ...(opening ? { opening: { number: opening.number, name: opening.opening.name } } : {}),
    });
  }
  return events;
}

function toSaved(record: ChessMoveRecord): SavedChessMove {
  return {
    color: record.color,
    san: record.san,
    uci: record.uci,
    source: record.source,
    ...(record.opening ? { opening: record.opening } : {}),
    setup: record.setup,
    fenBefore: record.fenBefore,
    roundTripMs: record.roundTripMs,
    grade: record.grade === "pending" || record.grade === "failed" ? null : record.grade,
    decision: record.decision,
  };
}

/** A saved move as a move record again, for a replay. */
export function fromSavedChessMove(saved: SavedChessMove): ChessMoveRecord {
  return {
    color: saved.color,
    san: saved.san,
    uci: saved.uci,
    from: saved.uci.slice(0, 2),
    to: saved.uci.slice(2, 4),
    source: saved.source,
    ...(saved.opening ? { opening: saved.opening } : {}),
    setup: saved.setup,
    fenBefore: saved.fenBefore,
    roundTripMs: saved.roundTripMs,
    grade: saved.grade ?? "failed",
    decision: saved.decision,
  };
}
