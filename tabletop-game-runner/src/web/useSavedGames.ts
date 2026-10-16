import { useEffect, useRef, useState } from "react";
import type { GameName } from "../shared/matchups";
import type { SavedExperimentGames } from "../shared/replays";
import { fetchGames } from "./api";

export interface SavedGames<S> {
  experiments: SavedExperimentGames<S>[] | null;
  error: string | null;
}

/**
 * The finished games of every saved experiment. Loads only once `wanted` turns true, because the list is large.
 * After that it reloads when `gamesSaved` changes, at most once a second, so fast continuous play stays light.
 */
export function useSavedGames<S>(game: GameName, gamesSaved: number, wanted: boolean): SavedGames<S> {
  const [games, setGames] = useState<SavedGames<S>>({ experiments: null, error: null });
  const lastLoad = useRef(0);
  // During fast play a newer load can start before an older one answers. Only a newer answer replaces the list.
  const started = useRef(0);
  const shown = useRef(0);

  useEffect(() => {
    if (!wanted) return;
    const load = () => {
      const id = ++started.current;
      lastLoad.current = Date.now();
      fetchGames<S>(game).then(
        (experiments) => {
          if (id < shown.current) return;
          shown.current = id;
          setGames({ experiments, error: null });
        },
        (error: unknown) => id > shown.current && setGames((prev) => ({ ...prev, error: error instanceof Error ? error.message : String(error) })),
      );
    };
    // The wait ends one second after the last load, so a new saved game does not push the reload further back.
    const timer = setTimeout(load, Math.max(0, lastLoad.current + 1000 - Date.now()));
    return () => clearTimeout(timer);
  }, [game, gamesSaved, wanted]);

  return games;
}
