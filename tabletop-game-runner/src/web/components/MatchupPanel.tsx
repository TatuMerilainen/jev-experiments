import { useState, type ReactNode } from "react";
import { allMatchups, scoreInOrder, scoreOf, type GameName, type KeyParts, type Matchup, type MatchupRecord, type MatchupScore } from "../../shared/matchups";
import { RECENT_GAMES, type SavedExperimentGames, type SavedGameSummary, type StartKind } from "../../shared/replays";
import { formatGameTime } from "../format";
import { useSavedGames } from "../useSavedGames";

export interface MatchupSide<S> {
  config: S;
  icon: ReactNode;
}

interface Name {
  text: string;
  icon?: ReactNode;
}

interface Props<S> {
  /** The configurations playing now: the first mover, then the second mover. */
  current: [MatchupSide<S>, MatchupSide<S>];
  /** "White" and "Black", or "X" and "O". */
  sideNames: [string, string];
  records: MatchupRecord<S>[] | null;
  error: string | null;
  /** Without the model, a Jev player gets the same key and label for every model. */
  keyOf: (config: S, parts: KeyParts) => string;
  labelOf: (config: S, parts: KeyParts) => string;
  /** The games lists load this game's saved games, and reload when `gamesSaved` changes. */
  game: GameName;
  gamesSaved: number;
  /** Words for the length of a game: ["move", "moves"], or ["ply", "plies"] in chess. */
  lengthUnit: [string, string];
  /** The saved game open in the replay, if any. */
  openGame: GameRef | null;
  onOpenGame: (game: GameRef) => void;
}

export interface GameRef {
  experimentId: string;
  gameNo: number;
}

/** What every games list needs, passed down as one value. */
interface GamesContext<S> {
  experiments: SavedExperimentGames<S>[] | null;
  error: string | null;
  onWant: () => void;
  keyOf: (config: S) => string;
  sideNames: [string, string];
  lengthUnit: [string, string];
  openGame: GameRef | null;
  onOpenGame: (game: GameRef) => void;
}

/** The pairs of the "All configurations" list. Split by opening, each start kind has its own group. */
interface Group<S> {
  /** Set when the list is split by opening. */
  start?: StartKind;
  title?: string;
  records: MatchupRecord<S>[];
  matchups: Matchup<S>[];
}

/** One bar of a configuration pair, or one block of two bars when split by who went first. */
interface Part {
  /** Names the games of the part when the panel is split by opening. */
  title?: string;
  score: MatchupScore;
  orders?: [MatchupScore, MatchupScore];
}

/** The groups of games when the panel is split by opening. Only the kinds with saved games show. */
const STARTS: { start: StartKind; title: string; games: string; note: string }[] = [
  { start: "start", title: "From the start position", games: "games from the start position", note: "" },
  { start: "random-first", title: "With a random first move", games: "games with a random first move", note: "had a random first move" },
  { start: "opening-set", title: "From the opening set", games: "games from the opening set", note: "started from the opening set" },
];

/** The switches at the start. Models and start kinds add up. */
export const DEFAULT_SPLITS = { order: false, model: false, start: false };

const EMPTY: MatchupScore = { games: 0, wins: [0, 0], draws: 0 };

const percent = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "–");

const flipped = (score: MatchupScore): MatchupScore => ({ ...score, wins: [score.wins[1], score.wins[0]] });

/** The games of `left` against `right`: first those where `left` moved first, then those where it moved second. */
function ordersOf<S>(records: MatchupRecord<S>[], left: string, right: string): [MatchupScore, MatchupScore] {
  return [scoreInOrder(records, left, right), flipped(scoreInOrder(records, right, left))];
}

/** Win percentages of the current configurations against each other, from every saved experiment. */
export function MatchupPanel<S>({
  current,
  sideNames,
  records,
  error,
  keyOf,
  labelOf,
  game,
  gamesSaved,
  lengthUnit,
  openGame,
  onOpenGame,
}: Props<S>) {
  const [split, setSplit] = useState(DEFAULT_SPLITS.order);
  const [byModel, setByModel] = useState(DEFAULT_SPLITS.model);
  const [byStart, setByStart] = useState(DEFAULT_SPLITS.start);
  const keyParts: KeyParts = { model: byModel };
  const keyed = (parts: KeyParts) => records?.map((r) => ({ ...r, firstKey: keyOf(r.first, parts), secondKey: keyOf(r.second, parts) })) ?? null;
  const shown = keyed(keyParts);
  const keys = current.map((side) => keyOf(side.config, keyParts)) as [string, string];
  const label = (config: S) => labelOf(config, keyParts);
  const [first, second] = current;
  const mirror = keys[0] === keys[1];
  const withModel = { ...keyParts, model: true };
  const modelsDiffer = mirror && keyOf(first.config, withModel) !== keyOf(second.config, withModel);
  const usesModel = current.some((side) => keyOf(side.config, withModel) !== keyOf(side.config, { ...keyParts, model: false }));
  const score = shown ? scoreOf(shown, keys[0], keys[1]) : EMPTY;
  const ordersIn = (records: MatchupRecord<S>[]) => (split && !mirror ? ordersOf(records, keys[0], keys[1]) : undefined);
  const starts = STARTS.filter((start) => shown?.some((r) => r.start === start.start)).map((start) => {
    const records = shown?.filter((r) => r.start === start.start) ?? [];
    return { ...start, records, score: scoreOf(records, keys[0], keys[1]) };
  });
  const parts: Part[] =
    byStart && starts.length > 0
      ? starts.map((start) => ({ title: start.title, score: start.score, orders: ordersIn(start.records) }))
      : [{ score, orders: shown ? ordersIn(shown) : undefined }];
  const groups: Group<S>[] = !shown
    ? []
    : byStart
      ? starts.map(({ start, title, records }) => ({ start, title, records, matchups: allMatchups(records) }))
      : [{ records: shown, matchups: allMatchups(shown) }];
  const pairs = groups.reduce((n, g) => n + g.matchups.length, 0);
  const [gamesWanted, setGamesWanted] = useState(false);
  const saved = useSavedGames<S>(game, gamesSaved, gamesWanted);
  const games: GamesContext<S> = {
    ...saved,
    onWant: () => setGamesWanted(true),
    keyOf: (config) => keyOf(config, keyParts),
    sideNames,
    lengthUnit,
    openGame,
    onOpenGame,
  };

  let note: string;
  if (error) note = `Saved results could not be loaded: ${error}`;
  else if (!shown) note = "Loading saved results…";
  else if (score.games === 0) note = "No finished games between these configurations yet.";
  else if (modelsDiffer) note = `The two sides differ only in their model, so the bar compares ${sideNames[0]} and ${sideNames[1]}. Turn on "Split by model" to compare the models.`;
  else if (mirror) note = `Both sides have the same configuration, so the bar compares ${sideNames[0]} and ${sideNames[1]}.`;
  else if (split) note = `All saved games between these two configurations, split by who went first. ${sideNames[0]} always goes first.`;
  else note = "All saved games between these two configurations, on either side.";
  if (shown && usesModel && !modelsDiffer) note += byModel ? " Only games with these Jev models count." : " Games of all Jev models count together.";
  if (!byStart) {
    for (const start of starts) if (start.note && start.score.games > 0) note += ` ${start.score.games} of these ${score.games} games ${start.note}.`;
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Configuration vs configuration</h2>
        <div className="matchup-switches">
          <label className="row row-compact" title="Count each Jev model as its own configuration. Games of other models are left out.">
            <span>Split by model</span>
            <input type="checkbox" className="switch" checked={byModel} onChange={(e) => setByModel(e.target.checked)} />
          </label>
          <label className="row row-compact" title="Show separate results for each way the games start: the start position, a random first move or the opening set.">
            <span>Split by opening</span>
            <input type="checkbox" className="switch" checked={byStart} onChange={(e) => setByStart(e.target.checked)} />
          </label>
          <label className="row row-compact">
            <span>Split by who went first</span>
            <input type="checkbox" className="switch" checked={split} onChange={(e) => setSplit(e.target.checked)} />
          </label>
        </div>
      </div>
      <ScoreBar names={[{ text: label(first.config), icon: first.icon }, { text: label(second.config), icon: second.icon }]} parts={parts} />
      <p className="hint">{note}</p>
      {byStart && starts.length > 0 ? (
        starts.map((start) => (
          <GamesList
            key={start.title}
            games={games}
            keys={keys}
            names={[label(first.config), label(second.config)]}
            total={start.score.games}
            start={start.start}
            what={start.games}
          />
        ))
      ) : (
        <GamesList games={games} keys={keys} names={[label(first.config), label(second.config)]} total={score.games} />
      )}
      {pairs > 0 && (
        <details className="more">
          <summary>All configurations ({pairs})</summary>
          <div className="more-body">
            {groups.map(
              (g) =>
                g.matchups.length > 0 && (
                  <div key={g.start ?? "all"} className="matchup-list">
                    {g.title && <h3 className="label">{g.title}</h3>}
                    {g.matchups.map((m) => (
                      <MatchupRow
                        key={`${m.aKey}\n${m.bKey}`}
                        matchup={m}
                        records={g.records}
                        start={g.start}
                        split={split}
                        keys={keys}
                        sideNames={sideNames}
                        label={label}
                        games={games}
                      />
                    ))}
                  </div>
                ),
            )}
          </div>
        </details>
      )}
    </section>
  );
}

function MatchupRow<S>({
  matchup,
  records,
  start,
  split,
  keys,
  sideNames,
  label,
  games,
}: {
  matchup: Matchup<S>;
  records: MatchupRecord<S>[];
  /** The group's start kind, when the list is split by opening. */
  start?: StartKind;
  games: GamesContext<S>;
  split: boolean;
  /** The keys of the configurations playing now. */
  keys: [string, string];
  sideNames: [string, string];
  label: (config: S) => string;
}) {
  const { a, b, aKey, bKey, score } = matchup;
  const same = aKey === keys[0] && bKey === keys[1];
  // The current matchup keeps the order of the bar above.
  const flip = aKey !== bKey && aKey === keys[1] && bKey === keys[0];
  const names: [Name, Name] =
    aKey === bKey
      ? [{ text: `${sideNames[0]}: ${label(a)}` }, { text: `${sideNames[1]}: ${label(b)}` }]
      : flip
        ? [{ text: label(b) }, { text: label(a) }]
        : [{ text: label(a) }, { text: label(b) }];
  const shown = flip ? flipped(score) : score;
  const orders = split && aKey !== bKey ? (flip ? ordersOf(records, bKey, aKey) : ordersOf(records, aKey, bKey)) : undefined;
  return (
    <div className={`matchup-row ${same || flip ? "matchup-row-current" : ""}`}>
      <ScoreBar names={names} parts={[{ score: shown, orders }]} compact />
      <GamesList
        games={games}
        keys={flip ? [bKey, aKey] : [aKey, bKey]}
        names={flip ? [label(b), label(a)] : [label(a), label(b)]}
        total={score.games}
        start={start}
      />
    </div>
  );
}

const FIRST_ORDER: [string, string] = ["went first", "went second"];
const SECOND_ORDER: [string, string] = ["went second", "went first"];

/** One configuration pair: the names, then one bar for each part, under its title. */
function ScoreBar({ names, parts, compact = false }: { names: [Name, Name]; parts: Part[]; compact?: boolean }) {
  return (
    <div className={`matchup ${compact ? "matchup-compact" : ""}`}>
      <div className="matchup-ends">
        <span className="matchup-name">
          {names[0].icon}
          {names[0].text}
        </span>
        <span className="matchup-name matchup-name-end">
          {names[1].text}
          {names[1].icon}
        </span>
      </div>
      {parts.map((part) =>
        part.title ? (
          <div key={part.title} className="matchup-part">
            <h3 className="label">{part.title}</h3>
            <PartBars names={names} part={part} />
          </div>
        ) : (
          <PartBars key="" names={names} part={part} />
        ),
      )}
    </div>
  );
}

/**
 * One bar with its figures. With `orders`, two bars stacked as one block: the games where the left configuration
 * went first, then those where it went second. Their figures sit above and below the block.
 */
function PartBars({ names, part: { score, orders } }: { names: [Name, Name]; part: Part }) {
  return orders ? (
    <div className="matchup-split">
      <OrderFigures score={orders[0]} order={FIRST_ORDER} />
      <div className="matchup-split-bars">
        <Track names={names} score={orders[0]} order={FIRST_ORDER} />
        <Track names={names} score={orders[1]} order={SECOND_ORDER} />
      </div>
      <OrderFigures score={orders[1]} order={SECOND_ORDER} />
    </div>
  ) : (
    <>
      <Track names={names} score={score} />
      {score.games > 0 ? (
        <div className="matchup-ends matchup-figures">
          <span>
            <strong className="matchup-first">{percent(score.wins[0], score.games)}</strong> wins
          </span>
          <GamesText score={score} />
          <span>
            <strong className="matchup-second">{percent(score.wins[1], score.games)}</strong> wins
          </span>
        </div>
      ) : (
        <p className="matchup-figures matchup-none">No games yet</p>
      )}
    </>
  );
}

function Track({ names, score, order }: { names: [Name, Name]; score: MatchupScore; order?: [string, string] }) {
  const { games, wins, draws } = score;
  const width = (n: number) => `${games ? (n / games) * 100 : 0}%`;
  const who = order ? `${names[0].text} ${order[0]}. ` : "";
  const label = games
    ? `${who}${names[0].text} wins ${percent(wins[0], games)}, draws ${percent(draws, games)}, ${names[1].text} wins ${percent(wins[1], games)}, over ${games} games`
    : `${who}No games yet`;
  return (
    <div className={`score-bar ${games ? "" : "score-bar-empty"}`} role="img" aria-label={label}>
      <span className="score-first" style={{ width: width(wins[0]) }} />
      <span className="score-draw" style={{ width: width(draws) }} />
      <span className="score-second" style={{ width: width(wins[1]) }} />
    </div>
  );
}

/** The figures of one order, with the order named next to each win percentage. */
function OrderFigures({ score, order }: { score: MatchupScore; order: [string, string] }) {
  const { games, wins } = score;
  return (
    <div className="matchup-figures matchup-order-figures">
      <span>
        {games > 0 && (
          <>
            <strong className="matchup-first">{percent(wins[0], games)}</strong> wins ·{" "}
          </>
        )}
        <span className="matchup-order-label">{order[0]}</span>
      </span>
      {games > 0 ? <GamesText score={score} /> : <span>No games yet</span>}
      <span>
        <span className="matchup-order-label">{order[1]}</span>
        {games > 0 && (
          <>
            {" "}
            · <strong className="matchup-second">{percent(wins[1], games)}</strong> wins
          </>
        )}
      </span>
    </div>
  );
}

function GamesText({ score }: { score: MatchupScore }) {
  return (
    <span>
      {score.games} {score.games === 1 ? "game" : "games"} · {percent(score.draws, score.games)} draws
    </span>
  );
}

/**
 * The games of one configuration pair, newest first. `leftFirst` says whether the left configuration moved first.
 * With `start` set, only games with that start kind count.
 */
function gamesOf<S>(games: GamesContext<S>, [left, right]: [string, string], start?: StartKind) {
  const rows: { experimentId: string; game: SavedGameSummary; leftFirst: boolean; start: StartKind }[] = [];
  for (const e of games.experiments ?? []) {
    if (start !== undefined && e.start !== start) continue;
    const firstKey = games.keyOf(e.first);
    const secondKey = games.keyOf(e.second);
    const leftFirst = firstKey === left && secondKey === right;
    if (!leftFirst && !(firstKey === right && secondKey === left)) continue;
    for (const game of e.games) rows.push({ experimentId: e.experimentId, game, leftFirst, start: e.start });
  }
  return rows.sort((a, b) => b.game.at.localeCompare(a.game.at) || b.game.gameNo - a.game.gameNo);
}

/** A collapsed list of one pair's newest saved games. Clicking a game opens it as a replay. */
function GamesList<S>({
  games,
  keys,
  names,
  total,
  start,
  what = "games",
}: {
  games: GamesContext<S>;
  keys: [string, string];
  names: [string, string];
  total: number;
  /** Lists only games with this start kind. Unset lists all games and marks those with a random first move. */
  start?: StartKind;
  /** Names the games in the summary, for example "games with a random first move". */
  what?: string;
}) {
  const [open, setOpen] = useState(false);
  if (total === 0) return null;
  const mirror = keys[0] === keys[1];
  const rows = open ? gamesOf(games, keys, start).slice(0, RECENT_GAMES) : [];
  const [one, many] = games.lengthUnit;
  return (
    <details
      className="more games"
      onToggle={(e) => {
        setOpen(e.currentTarget.open);
        if (e.currentTarget.open) games.onWant();
      }}
    >
      <summary>{total > RECENT_GAMES ? `Last ${RECENT_GAMES} of ${total} ${what}` : `${what[0]!.toUpperCase()}${what.slice(1)} (${total})`}</summary>
      {open &&
        (games.error && !games.experiments ? (
          <p className="hint">Saved games could not be loaded: {games.error}</p>
        ) : !games.experiments ? (
          <p className="hint">Loading games…</p>
        ) : (
          <ol className="games-list">
            {rows.map(({ experimentId, game, leftFirst, start: gameStart }) => {
              // The winner as the left (0) or right (1) configuration, or as the side when both sides have the same configuration.
              const winnerSide = game.winner === "draw" ? null : (game.winner === "first") === leftFirst ? 0 : 1;
              const result =
                game.winner === "draw"
                  ? "Draw"
                  : mirror
                    ? `${games.sideNames[game.winner === "first" ? 0 : 1]} won`
                    : `${names[winnerSide!]} won`;
              const selected = games.openGame?.experimentId === experimentId && games.openGame.gameNo === game.gameNo;
              return (
                <li key={`${experimentId}/${game.gameNo}`}>
                  <button
                    type="button"
                    className={selected ? "selected" : undefined}
                    onClick={() => games.onOpenGame({ experimentId, gameNo: game.gameNo })}
                    title="Open this game as a replay"
                  >
                    <span className="games-time">{formatGameTime(game.at)}</span>
                    <span className="games-first">
                      {mirror ? `Game ${game.gameNo}` : `${names[leftFirst ? 0 : 1]} went first`}
                      {gameStart === "random-first" && start === undefined && <span className="games-note"> · random first move</span>}
                      {game.opening && <span className="games-note"> · {game.opening}</span>}
                    </span>
                    <span className={winnerSide === null || mirror ? "games-result" : `games-result ${winnerSide === 0 ? "matchup-first" : "matchup-second"}`}>
                      {result}
                    </span>
                    <span className="hint">
                      {game.moves} {game.moves === 1 ? one : many}
                      {game.reason ? ` · ${game.reason}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ))}
    </details>
  );
}
