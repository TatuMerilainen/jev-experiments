import { useRef, useState } from "react";
import type { GameName } from "../shared/matchups";
import type { SavedReplay } from "../shared/replays";
import { fetchReplay } from "./api";
import type { GameRef } from "./components/MatchupPanel";

/** A saved game open for viewing. `R` is the game's move record type, the same one the live game uses. */
export interface Replay<R> {
  ref: GameRef;
  /** For example "Game 3: Perfect (X) vs Random (O)". */
  title: string;
  /** For example "X won · 7 moves · 15 Oct, 09:41". */
  detail: string;
  moves: R[];
  selected: number;
}

/**
 * Opens saved games for viewing. `toRecord` turns a saved move back into a move record,
 * so the board, the Move panel and the Moves list work the same as for a live game.
 */
export function useReplay<S, M, R>(
  game: GameName,
  toRecord: (saved: M) => R,
  describe: (data: SavedReplay<S, M>) => { title: string; detail: string },
) {
  const [replay, setReplay] = useState<Replay<R> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the latest click counts when two games are opened quickly.
  const request = useRef(0);

  /** Resolves to true when the game is open. */
  const open = async (ref: GameRef): Promise<boolean> => {
    const id = ++request.current;
    setError(null);
    try {
      const data = await fetchReplay<S, M>(game, ref.experimentId, ref.gameNo);
      if (id !== request.current) return false;
      const moves = data.moves.map(toRecord);
      setReplay({ ref, ...describe(data), moves, selected: moves.length - 1 });
      return true;
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const select = (index: number) => setReplay((r) => r && { ...r, selected: Math.max(0, Math.min(index, r.moves.length - 1)) });

  const close = () => {
    request.current++;
    setReplay(null);
    setError(null);
  };

  return { replay, error, open, select, close };
}
