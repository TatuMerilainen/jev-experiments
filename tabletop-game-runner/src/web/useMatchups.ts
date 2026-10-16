import { useEffect, useState } from "react";
import type { GameName, MatchupRecord } from "../shared/matchups";
import { fetchMatchups } from "./api";

export interface Matchups<S> {
  records: MatchupRecord<S>[] | null;
  error: string | null;
}

/** Saved results of every experiment. Reloads when `gamesSaved` changes. */
export function useMatchups<S>(game: GameName, gamesSaved: number): Matchups<S> {
  const [matchups, setMatchups] = useState<Matchups<S>>({ records: null, error: null });
  useEffect(() => {
    let current = true;
    fetchMatchups<S>(game).then(
      (records) => current && setMatchups({ records, error: null }),
      (error: unknown) => current && setMatchups((prev) => ({ ...prev, error: error instanceof Error ? error.message : String(error) })),
    );
    return () => {
      current = false;
    };
  }, [game, gamesSaved]);
  return matchups;
}
