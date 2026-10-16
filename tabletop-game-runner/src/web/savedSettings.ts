import { useEffect } from "react";
import { CHESS_BOT_KINDS, SEARCH_DEPTHS, STOCKFISH_DEPTHS, type ChessColor, type ChessPlayerKind, type ChessPlayerSetup } from "../shared/chess/types";
import { START_KINDS, type StartKind } from "../shared/replays";
import { MAX_INSTRUCTIONS_LENGTH } from "../shared/prompts";
import { BOT_KINDS, DEFAULT_JEV_MODEL, JEV_MODELS, MAX_DEPTH, type Mark, type PlayerKind, type PlayerSetup } from "../shared/types";
import { DEFAULT_CHESS_SETTINGS, type ChessSettings } from "./chess/chessExperiment";
import { DELAYS_MS } from "./components/Toolbar";
import { DEFAULT_SETTINGS, type Settings } from "./experiment";
import { DEFAULT_PUZZLE_SETTINGS, type PuzzleSettings } from "./puzzles/puzzleRun";
import { PUZZLE_SETS } from "../shared/chess/puzzles";

export const SETTINGS_KEYS = { tictactoe: "tabletop-tictactoe-settings", chess: "tabletop-chess-settings", puzzles: "tabletop-puzzle-settings" } as const;

/**
 * Settings saved by an earlier visit, or `fallback` when there are none.
 * Storage can be blocked or hold settings from an older version of the app, so `normalize` checks every field.
 */
export function loadSettings<T>(key: string, normalize: (raw: unknown) => T, fallback: T): T {
  try {
    const text = localStorage.getItem(key);
    return text ? normalize(JSON.parse(text)) : fallback;
  } catch {
    return fallback;
  }
}

type WithPlayers<P> = { players: Record<string, P> };

/** Saves the settings each time they change, so they survive a page reload. */
export function useSavedSettings<P extends object>(key: string, settings: WithPlayers<P>, standIns: WeakMap<P, P>): void {
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(settingsToSave(settings, standIns)));
    } catch {
      // Storage is blocked. The settings then start from the defaults after a reload.
    }
  }, [key, settings, standIns]);
}

/**
 * Replaces each player that `replace` changes, and remembers the player it stands in for.
 * Without an API key, code players stand in for the Jev players.
 */
export function withStandIns<S extends WithPlayers<P>, P extends object>(settings: S, standIns: WeakMap<P, P>, replace: (player: P) => P): S {
  const players = Object.fromEntries(
    Object.entries(settings.players).map(([side, player]) => {
      const standIn = replace(player);
      if (standIn !== player) standIns.set(standIn, standIns.get(player) ?? player);
      return [side, standIn];
    }),
  );
  return { ...settings, players };
}

/** A stand-in is saved as the player it replaces, so the saved Jev setups come back once the key is set. */
export function settingsToSave<S extends WithPlayers<P>, P extends object>(settings: S, standIns: WeakMap<P, P>): S {
  const players = Object.fromEntries(Object.entries(settings.players).map(([side, player]) => [side, standIns.get(player) ?? player]));
  return { ...settings, players };
}

type Raw<T> = Partial<Record<keyof T, unknown>>;

const oneOf = <T>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
/** A delay saved before the slider had fewer stops moves to the nearest stop. */
const delayOf = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value)
    ? DELAYS_MS.reduce((best, ms) => (Math.abs(ms - value) < Math.abs(best - value) ? ms : best))
    : fallback;
const instructionsOf = (value: unknown): string | null =>
  typeof value === "string" && value.trim() && value.length <= MAX_INSTRUCTIONS_LENGTH ? value : null;

/** Settings shared by both games: the move delay and continuous play. */
function common(raw: Raw<Settings>, fallback: Settings | ChessSettings) {
  return {
    delayMs: delayOf(raw.delayMs, fallback.delayMs),
    continuous: bool(raw.continuous, fallback.continuous),
  };
}

/** Tic-tac-toe settings from storage. Every missing or invalid field gets its default. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Raw<Settings>;
  const players = (r.players ?? {}) as Partial<Record<Mark, unknown>>;
  const player = (value: unknown, fallback: PlayerSetup): PlayerSetup => {
    const p = (value ?? {}) as Raw<PlayerSetup>;
    const depth = Number.isInteger(p.depth) && (p.depth as number) >= 1 && (p.depth as number) <= MAX_DEPTH ? (p.depth as number) : fallback.depth;
    return {
      kind: oneOf<PlayerKind>(p.kind, [...BOT_KINDS, "human"], fallback.kind),
      depth,
      lines: bool(p.lines, fallback.lines),
      instructions: instructionsOf(p.instructions),
      model: oneOf<string>(p.model, JEV_MODELS, DEFAULT_JEV_MODEL),
    };
  };
  return {
    players: { X: player(players.X, DEFAULT_SETTINGS.players.X), O: player(players.O, DEFAULT_SETTINGS.players.O) },
    randomFirst: bool(r.randomFirst, DEFAULT_SETTINGS.randomFirst),
    ...common(r, DEFAULT_SETTINGS),
  };
}

/** Chess settings from storage. Every missing or invalid field gets its default. */
export function normalizeChessSettings(raw: unknown): ChessSettings {
  const r = (raw ?? {}) as Raw<ChessSettings> & { randomFirst?: unknown };
  const players = (r.players ?? {}) as Partial<Record<ChessColor, unknown>>;
  return {
    players: { w: normalizeChessPlayer(players.w, DEFAULT_CHESS_SETTINGS.players.w), b: normalizeChessPlayer(players.b, DEFAULT_CHESS_SETTINGS.players.b) },
    // Settings saved before the "Openings" choice have the "Random first move" switch.
    openings: oneOf<StartKind>(r.openings, START_KINDS, r.randomFirst === true ? "random-first" : DEFAULT_CHESS_SETTINGS.openings),
    ...common(r, DEFAULT_CHESS_SETTINGS),
  };
}

/** One chess player from storage. Every missing or invalid field gets its default. */
function normalizeChessPlayer(value: unknown, fallback: ChessPlayerSetup): ChessPlayerSetup {
  const p = (value ?? {}) as Raw<ChessPlayerSetup>;
  const kind = oneOf<ChessPlayerKind>(p.kind, [...CHESS_BOT_KINDS, "human"], fallback.kind);
  // The same defaults the player panel uses when the player type changes.
  const depth = kind === "stockfish" ? oneOf<number>(p.depth, STOCKFISH_DEPTHS, 5) : oneOf<number>(p.depth, SEARCH_DEPTHS, 2);
  return {
    kind,
    depth,
    board: bool(p.board, fallback.board),
    safety: bool(p.safety, fallback.safety),
    instructions: instructionsOf(p.instructions),
    model: oneOf<string>(p.model, JEV_MODELS, DEFAULT_JEV_MODEL),
  };
}

/** Puzzle page settings from storage. Every missing or invalid field gets its default. */
export function normalizePuzzleSettings(raw: unknown): PuzzleSettings {
  const r = (raw ?? {}) as Raw<PuzzleSettings>;
  return {
    set: oneOf<string>(r.set, PUZZLE_SETS.map((s) => s.name), DEFAULT_PUZZLE_SETTINGS.set),
    player: normalizeChessPlayer(r.player, DEFAULT_PUZZLE_SETTINGS.player),
    delayMs: delayOf(r.delayMs, DEFAULT_PUZZLE_SETTINGS.delayMs),
    continuous: bool(r.continuous, DEFAULT_PUZZLE_SETTINGS.continuous),
  };
}
