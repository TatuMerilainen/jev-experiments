import { useEffect, useState } from "react";
import { TOP_GAMES, type ConfigSpend, type GameSpend, type JevStats, type StatsGame } from "../shared/jevStats";
import type { GameName } from "../shared/matchups";
import { fetchJevStats } from "./api";
import { chessSetupLabel } from "./chess/chessFormat";
import { formatGameTime, formatTokens, formatUsd, PRICE_PER_TOKEN_USD, setupLabel } from "./format";

const GAME_LABELS: Record<StatsGame, string> = { tictactoe: "Tic-tac-toe", chess: "Chess", puzzles: "Chess puzzles" };
const SIDE_NAMES: Record<GameName, [string, string]> = { tictactoe: ["X", "O"], chess: ["White", "Black"] };

const cost = (tokens: number) => formatUsd(tokens * PRICE_PER_TOKEN_USD);
const whole = (n: number) => Math.round(n).toLocaleString("en-GB");
/** "–" when there is nothing to divide by. */
const ratio = (n: number, d: number, format: (value: number) => string) => (d ? format(n / d) : "–");
/** Three significant digits, so large counts stay short. */
const count = (n: number) => (n >= 100 ? Number(n.toPrecision(3)).toLocaleString("en-GB") : n >= 10 ? String(Math.round(n)) : n.toFixed(1));
/** How many games or moves $1 buys. */
const perDollar = (items: number, tokens: number) => (items ? ratio(items, tokens * PRICE_PER_TOKEN_USD, count) : "–");

// Base input prices from platform.claude.com/docs/en/about-claude/pricing on 2026-10-16.
const CLAUDE_PRICES = [
  { model: "Claude Haiku 5.5", usdPerMillion: 0.1, outputUsdPerMillion: 0.5 },
  { model: "Claude Opus 5.5", usdPerMillion: 4, outputUsdPerMillion: 20 },
];

/** The games with two players, in the order the estimate shows them. Puzzles have no opponent, so they are left out. */
const ESTIMATE_GAMES: StatsGame[] = ["tictactoe", "chess"];

/** The average moves of one player in a finished saved game. */
function gameLengths(stats: JevStats): { game: StatsGame; moves: number }[] {
  return ESTIMATE_GAMES.flatMap((game) => {
    const g = stats.games.find((s) => s.game === game);
    return g?.finished.games ? [{ game, moves: g.finished.allMoves / g.finished.games / 2 }] : [];
  });
}

const movesLabel = (n: number) => (n >= 10 ? whole(n) : n.toFixed(1));

/** A price per million tokens: "$0.042", "$0.10", "$4". */
const perMillion = (usd: number) => (usd >= 1 ? `$${usd}` : `$${usd.toFixed(3).replace(/0$/, "")}`);

const configLabel = (c: ConfigSpend) => (c.game === "tictactoe" ? setupLabel(c.config, true) : chessSetupLabel(c.config, true));

const playerLabel = (g: GameSpend, side: 0 | 1) =>
  g.game === "chess" ? chessSetupLabel(side ? g.second : g.first, true) : setupLabel(side ? g.second : g.first, true);

/** For example "Thu 15 Oct 2026". Noon keeps the date the same in every time zone. */
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

type SortKey = "gamesPerDollar" | "movesPerDollar" | "total";

const SORTS: Record<SortKey, (c: ConfigSpend) => number> = {
  gamesPerDollar: (c) => (c.finished.tokens ? c.finished.games / c.finished.tokens : -1),
  movesPerDollar: (c) => (c.tokens ? c.moves / c.tokens : -1),
  total: (c) => c.tokens,
};

/** What Jev cost in all saved games: per game, per Jev player, for the most expensive games, in total and per day. */
export function JevStatsView() {
  const [stats, setStats] = useState<JevStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchJevStats()
      .then((s) => live && setStats(s))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  if (error || !stats) {
    return (
      <main className="stats">
        <section className="card">
          <p className={error ? "status-bad" : "hint"}>{error ? `Jev statistics could not be loaded: ${error}` : "Loading Jev statistics…"}</p>
        </section>
      </main>
    );
  }

  if (stats.total.requests === 0) {
    return (
      <main className="stats">
        <section className="card">
          <p className="hint">No saved Jev requests yet.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="stats">
      <div className="data-row">
        <Estimate stats={stats} />
        <PriceComparison stats={stats} />
      </div>
      <GameTable stats={stats} />
      <ConfigTable stats={stats} />
      <TopGames stats={stats} />
      <div className="data-row">
        <TotalCard stats={stats} />
        <DayTable stats={stats} />
      </div>
      <Notes />
    </main>
  );
}

/** Input tokens of an average saved Jev request. */
const tokensPerRequest = (stats: JevStats) => stats.total.tokens / stats.total.requests;

function Estimate({ stats }: { stats: JevStats }) {
  const tokens = tokensPerRequest(stats);
  return (
    <section className="card">
      <h2 className="card-title">Estimate for one request per move</h2>
      <div className="figures stats-figures">
        <Figure label="Moves per $1" value={perDollar(1, tokens)} detail={`${cost(tokens)} per move`} />
        {gameLengths(stats).map(({ game, moves }) => (
          <Figure
            key={game}
            label={`${GAME_LABELS[game]} games per $1`}
            value={perDollar(1, moves * tokens)}
            detail={`${movesLabel(moves)} moves, ${cost(moves * tokens)} per game`}
          />
        ))}
      </div>
      <p className="hint stats-hint">
        For one Jev player, with {whole(tokens)} input tokens per request, the average of all saved Jev requests. A game has the average length of the saved
        finished games, in moves of one player.
      </p>
    </section>
  );
}

function GameTable({ stats }: { stats: JevStats }) {
  return (
    <section className="card">
      <h2 className="card-title">By game</h2>
      <div className="table-scroll">
        <table className="table table-mid">
          <thead>
            <tr>
              <th>Game</th>
              <th className="num">Games per $1</th>
              <th className="num">Cost per game</th>
              <th className="num">Games</th>
              <th className="num">Moves per $1</th>
              <th className="num">Tokens per request</th>
              <th className="num">Total cost</th>
            </tr>
          </thead>
          <tbody>
            {stats.games.map((g) => (
              <tr key={g.game}>
                <td className="nowrap">{GAME_LABELS[g.game]}</td>
                <td className="num">
                  <strong>{perDollar(g.finished.games, g.finished.tokens)}</strong>
                </td>
                <td className="num">{ratio(g.finished.tokens, g.finished.games, cost)}</td>
                <td className="num">{whole(g.finished.games)}</td>
                <td className="num">
                  <strong>{perDollar(g.moves, g.tokens)}</strong>
                </td>
                <td className="num">{ratio(g.tokens, g.requests, whole)}</td>
                <td className="num">{cost(g.tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PriceComparison({ stats }: { stats: JevStats }) {
  const tokens = tokensPerRequest(stats);
  const prices = [{ model: "Jev (jev-1.13)", usdPerMillion: PRICE_PER_TOKEN_USD * 1_000_000 }, ...CLAUDE_PRICES];
  const rows = [
    { label: "One move", tokens },
    ...gameLengths(stats).map(({ game, moves }) => ({ label: `${GAME_LABELS[game]} game, ${movesLabel(moves)} moves`, tokens: moves * tokens })),
  ];
  return (
    <section className="card">
      <h2 className="card-title">Price comparison</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th />
              {prices.map((p) => (
                <th key={p.model} className="num">
                  {p.model}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="hint nowrap">Per million input tokens</td>
              {prices.map((p) => (
                <td key={p.model} className="num hint">
                  {perMillion(p.usdPerMillion)}
                </td>
              ))}
            </tr>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="nowrap">{r.label}</td>
                {prices.map((p) => (
                  <td key={p.model} className="num">
                    {formatUsd((r.tokens * p.usdPerMillion) / 1_000_000)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="nowrap">Moves per $1</td>
              {prices.map((p) => (
                <td key={p.model} className="num">
                  {count(1_000_000 / (tokens * p.usdPerMillion))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint stats-hint">One request per move. The Claude costs count input tokens only.</p>
    </section>
  );
}

function DayTable({ stats }: { stats: JevStats }) {
  return (
    <section className="card">
      <h2 className="card-title">By day</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Day</th>
              <th className="num">Cost</th>
              <th className="num">Tokens</th>
              <th className="num">Requests</th>
            </tr>
          </thead>
          <tbody>
            {[...stats.days].reverse().map((d) => (
              <tr key={d.day}>
                <td>{dayLabel(d.day)}</td>
                <td className="num">{cost(d.tokens)}</td>
                <td className="num">{formatTokens(d.tokens)}</td>
                <td className="num">{whole(d.requests)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ConfigTable({ stats }: { stats: JevStats }) {
  const [sort, setSort] = useState<SortKey>("gamesPerDollar");
  const rows = [...stats.configs].sort((a, b) => SORTS[sort](b) - SORTS[sort](a));
  const header = (key: SortKey, label: string, title?: string) => (
    <th className="num" aria-sort={sort === key ? "descending" : undefined} title={title}>
      <button type="button" className={`sort ${sort === key ? "sort-active" : ""}`} onClick={() => setSort(key)}>
        {label}
        <span className="sort-mark" aria-hidden="true">
          {sort === key ? "↓" : ""}
        </span>
      </button>
    </th>
  );
  return (
    <section className="card">
      <h2 className="card-title">By Jev player</h2>
      <div className="table-scroll">
        <table className="table table-wide">
          <thead>
            <tr>
              <th>Player</th>
              <th>Game</th>
              {header("gamesPerDollar", "Games per $1", "Finished games that $1 buys, for this player's own moves")}
              <th className="num">Cost per game</th>
              <th className="num">Games</th>
              {header("movesPerDollar", "Moves per $1")}
              <th className="num">Requests per move</th>
              <th className="num">Tokens per request</th>
              {header("total", "Total cost")}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={`${c.game}\n${JSON.stringify(c.config)}`}>
                <td className="stats-player">{configLabel(c)}</td>
                <td className="nowrap">{GAME_LABELS[c.game]}</td>
                <td className="num">
                  <strong>{perDollar(c.finished.games, c.finished.tokens)}</strong>
                </td>
                <td className="num">{ratio(c.finished.tokens, c.finished.games, cost)}</td>
                <td className="num">{whole(c.finished.games)}</td>
                <td className="num">
                  <strong>{perDollar(c.moves, c.tokens)}</strong>
                </td>
                <td className="num">{ratio(c.requests, c.moves, (n) => n.toFixed(1))}</td>
                <td className="num">{ratio(c.tokens, c.requests, whole)}</td>
                <td className="num">{cost(c.tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TopGames({ stats }: { stats: JevStats }) {
  return (
    <section className="card">
      <h2 className="card-title">Most expensive games</h2>
      <div className="table-scroll">
        <table className="table table-wide">
          <thead>
            <tr>
              <th>Time</th>
              <th>Game</th>
              <th>Players</th>
              <th className="num">Cost</th>
              <th className="num">Requests</th>
              <th className="num">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {stats.top.map((g) => (
              <tr key={`${g.experimentId}/${g.gameNo}`}>
                <td className="stats-time">
                  {formatGameTime(g.at)}
                  {!g.finished && <span className="hint"> · unfinished</span>}
                </td>
                <td className="nowrap">{GAME_LABELS[g.game]}</td>
                <td className="stats-player">
                  {SIDE_NAMES[g.game].map((side, i) => (
                    <div key={side}>
                      <span className="stats-side">{side}:</span> {playerLabel(g, i as 0 | 1)}
                    </div>
                  ))}
                </td>
                <td className="num">{cost(g.tokens)}</td>
                <td className="num">{whole(g.requests)}</td>
                <td className="num">{formatTokens(g.tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TotalCard({ stats: { total } }: { stats: JevStats }) {
  return (
    <section className="card">
      <h2 className="card-title">Total</h2>
      <div className="figures stats-figures">
        <Figure label="Cost" value={cost(total.tokens)} />
        <Figure label="Input tokens" value={formatTokens(total.tokens)} />
        <Figure label="Jev requests" value={whole(total.requests)} />
        <Figure label="Tokens per request" value={ratio(total.tokens, total.requests, whole)} />
      </div>
    </section>
  );
}

function Notes() {
  return (
    <section className="card">
      <h2 className="card-title">Notes</h2>
      <ul className="hint stats-notes">
        <li>All numbers come from the saved games and puzzle runs.</li>
        <li>The Jev cost uses $0.042 per million input tokens for every model. This is the jev-1.13 price. Jev output tokens are free.</li>
        <li>Games per $1 and cost per game count finished games with a Jev player. For chess puzzles, one game is one puzzle attempt.</li>
        <li>For one Jev player, the cost of a game is the cost of its own moves. A player on both sides of a game counts once per side.</li>
        <li>Moves per $1 counts the moves of Jev players. A move without a Jev request counts with no cost.</li>
        <li>
          The estimate and the price comparison assume one Jev request per move. A game there has the average length of the saved finished games, in moves of
          one Jev player. The players in this app send more or fewer requests per move. By Jev player shows each player's real cost.
        </li>
        <li>
          The price comparison uses the base input prices from the Claude pricing page on 16 Oct 2026. It assumes a Claude model reads the same input tokens as
          Jev. Claude also bills output tokens: {CLAUDE_PRICES.map((p) => `${perMillion(p.outputUsdPerMillion)} per million for ${p.model}`).join(" and ")}. The
          table leaves them out.
        </li>
        <li>Most expensive games lists the {TOP_GAMES} saved games with the most Jev tokens.</li>
      </ul>
    </section>
  );
}

function Figure({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="figure">
      <span className="figure-value">{value}</span>
      <span className="figure-label">{label}</span>
      {detail && <span className="figure-label">{detail}</span>}
    </div>
  );
}
