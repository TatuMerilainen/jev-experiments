import type { PuzzleLogEvent, PuzzleResultEvent, PuzzleRun, PuzzleRunEvent } from "../shared/chess/puzzles";
import type { ChessDecision, ChessGrade, ChessLogEvent, ChessPlayerSetup } from "../shared/chess/types";
import type { JevStats } from "../shared/jevStats";
import type { GameName, MatchupRecord } from "../shared/matchups";
import type { SavedExperimentGames, SavedReplay } from "../shared/replays";
import type { BotConfig, Cell, Decision, LogEvent, LogResponse, StatusResponse } from "../shared/types";

export async function fetchStatus(): Promise<StatusResponse> {
  return request<StatusResponse>("/api/status");
}

export async function decide(board: Cell[], player: BotConfig, signal: AbortSignal): Promise<Decision> {
  return request<Decision>("/api/decide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ board, player }),
    signal,
  });
}

/** `start` is a puzzle's FEN. Without it, the moves start at the normal start position. */
export async function chessDecide(moves: string[], player: ChessPlayerSetup, signal: AbortSignal, start?: string): Promise<ChessDecision> {
  return post<ChessDecision>("/api/chess/decide", { ...(start ? { start } : {}), moves, player }, signal);
}

// The server gives up on a stuck engine after 30 s per wait. This limit covers a server that gives no answer at all.
const GRADE_TIMEOUT_MS = 90_000;

export async function chessGrade(moves: string[], uci: string): Promise<ChessGrade> {
  try {
    return await post<ChessGrade>("/api/chess/grade", { moves, uci }, AbortSignal.timeout(GRADE_TIMEOUT_MS));
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new Error(`No rating after ${GRADE_TIMEOUT_MS / 1000} s.`);
    throw error;
  }
}

function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
}

export async function savePuzzleLog(event: PuzzleLogEvent): Promise<LogResponse> {
  return post<LogResponse>("/api/puzzles/log", event);
}

export async function fetchPuzzleRuns(set: string): Promise<PuzzleRun[]> {
  return request<PuzzleRun[]>(`/api/puzzles/runs?set=${encodeURIComponent(set)}`);
}

export async function fetchPuzzleAttempt(runId: string, puzzleId: string): Promise<{ run: PuzzleRunEvent; result: PuzzleResultEvent }> {
  const params = new URLSearchParams({ run: runId, puzzle: puzzleId });
  return request<{ run: PuzzleRunEvent; result: PuzzleResultEvent }>(`/api/puzzles/attempt?${params}`);
}

export async function saveLog(event: LogEvent | ChessLogEvent): Promise<LogResponse> {
  return request<LogResponse>("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
}

export async function fetchMatchups<S>(game: GameName): Promise<MatchupRecord<S>[]> {
  return request<MatchupRecord<S>[]>(`/api/matchups?game=${game}`);
}

export async function fetchJevStats(): Promise<JevStats> {
  return request<JevStats>("/api/jev-stats");
}

export async function fetchGames<S>(game: GameName): Promise<SavedExperimentGames<S>[]> {
  return request<SavedExperimentGames<S>[]>(`/api/games?game=${game}`);
}

export async function fetchReplay<S, M>(game: GameName, experimentId: string, gameNo: number): Promise<SavedReplay<S, M>> {
  const params = new URLSearchParams({ game, experiment: experimentId, gameNo: String(gameNo) });
  return request<SavedReplay<S, M>>(`/api/replay?${params}`);
}

/** An error answer from the server. The status tells whether a retry can help. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new ApiError(response.status, body?.error ?? `HTTP ${response.status}`);
  return body as T;
}
