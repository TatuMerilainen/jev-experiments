import { useEffect, useState } from "react";
import type { StatusResponse } from "../shared/types";
import { fetchStatus } from "./api";
import { ChessView } from "./chess/ChessView";
import { Icon } from "./components/Icon";
import { JevStatsView } from "./JevStatsView";
import { PuzzleView } from "./puzzles/PuzzleView";
import { TicTacToeView } from "./TicTacToeView";

type Game = "tictactoe" | "chess";
type Page = Game | "puzzles" | "stats";

const PAGES: { id: Page; label: string; hash: string }[] = [
  { id: "tictactoe", label: "Tic-tac-toe", hash: "" },
  { id: "chess", label: "Chess", hash: "chess" },
  { id: "puzzles", label: "Chess puzzles", hash: "chess-puzzles" },
  { id: "stats", label: "Jev statistics", hash: "jev-stats" },
];

const isGame = (page: Page): page is Game => page === "tictactoe" || page === "chess";

const pageFromHash = (): Page => PAGES.find((p) => p.hash && `#${p.hash}` === window.location.hash)?.id ?? "tictactoe";

// Remembers whether the Jev sidebar is open. Storage can be blocked, so every access may fail.
const SIDEBAR_KEY = "jev-sidebar-open";
const readSidebarOpen = (): boolean => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
};

export function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  // The last game shown. It stays mounted under the other pages, so a running game keeps playing.
  const [game, setGame] = useState<Game>(() => (isGame(page) ? page : "tictactoe"));
  // The puzzle page stays mounted once it has been open, so a run keeps going on the other pages.
  const [puzzlesOpened, setPuzzlesOpened] = useState(page === "puzzles");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? "1" : "0");
    } catch {
      // The sidebar still works; it just opens closed next time.
    }
  }, [sidebarOpen]);

  useEffect(() => {
    fetchStatus()
      .then(setStatus)
      .catch((e: unknown) => setStatusError(e instanceof Error ? e.message : String(e)));
  }, []);

  const choose = (next: Page) => {
    window.location.hash = PAGES.find((p) => p.id === next)!.hash;
    setPage(next);
    if (isGame(next)) setGame(next);
    if (next === "puzzles") setPuzzlesOpened(true);
  };

  const onStats = page === "stats";
  const showSidebar = sidebarOpen && !onStats;

  return (
    <div className={`app ${showSidebar ? "with-sidebar" : ""}`}>
      <header className="header">
        <h1>Tabletop</h1>
        <div className="segmented" role="tablist" aria-label="Page">
          {PAGES.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={page === p.id} className={page === p.id ? "selected" : undefined} onClick={() => choose(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {!onStats && (
          <button
            type="button"
            className={`btn btn-small btn-sidebar ${sidebarOpen ? "selected" : ""}`}
            aria-pressed={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
            title="Show the state, questions and answers of a Jev request"
          >
            <Icon name="sparkle" />
            Jev request
          </button>
        )}
      </header>

      {statusError && <p className="banner banner-bad">Server not reachable: {statusError}</p>}
      {status && !status.jevConfigured && (
        <p className="banner">
          TYPESAFE_API_KEY is not set, so the Jev players are off. Add the key to <code>.env</code> and restart the server.
        </p>
      )}

      <div className="view" hidden={!isGame(page)}>
        {game === "chess" ? (
          <ChessView status={status} sidebarOpen={showSidebar && isGame(page)} onCloseSidebar={() => setSidebarOpen(false)} />
        ) : (
          <TicTacToeView status={status} sidebarOpen={showSidebar && isGame(page)} onCloseSidebar={() => setSidebarOpen(false)} />
        )}
      </div>
      {puzzlesOpened && (
        <div className="view" hidden={page !== "puzzles"}>
          <PuzzleView status={status} sidebarOpen={showSidebar && page === "puzzles"} onCloseSidebar={() => setSidebarOpen(false)} />
        </div>
      )}
      {onStats && <JevStatsView />}
    </div>
  );
}
