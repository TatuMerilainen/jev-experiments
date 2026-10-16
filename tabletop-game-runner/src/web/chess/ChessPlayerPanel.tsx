import { defaultChessInstructions } from "../../shared/chess/text";
import { SEARCH_DEPTHS, STOCKFISH_DEPTHS, type ChessColor, type ChessPlayerKind, type ChessPlayerSetup } from "../../shared/chess/types";
import { InstructionsEditor } from "../components/InstructionsEditor";
import { ModelSelect } from "../components/ModelSelect";
import { formatMs } from "../format";
import { CANDIDATE_RULE, CHESS_KIND_LABELS, COLOR_LABEL, describeChessSetup, PIECE_GLYPH, usesChessJev, usesSearch } from "./chessFormat";

export interface ChessPlayerStats {
  wins: number;
  avgLoss: number | null;
  avgMs: number | null;
}

interface Props {
  color: ChessColor;
  /** Replaces the colour name in the title and labels. The puzzle page uses it, where the colour changes per puzzle. */
  title?: string;
  setup: ChessPlayerSetup;
  /** Hidden when missing. */
  stats?: ChessPlayerStats;
  jevConfigured: boolean;
  active: boolean;
  thinking: boolean;
  onChange: (setup: ChessPlayerSetup) => void;
}

const KINDS = Object.keys(CHESS_KIND_LABELS) as ChessPlayerKind[];

/** Each player type has its own sensible depth. */
const defaultDepth = (kind: ChessPlayerKind) => (kind === "stockfish" ? 5 : 2);

export function ChessPlayerPanel({ color, title, setup, stats, jevConfigured, active, thinking, onChange }: Props) {
  const name = title ?? COLOR_LABEL[color];
  const isJev = usesChessJev(setup.kind);
  const defaultText = defaultChessInstructions(color);
  const depths: readonly number[] = setup.kind === "stockfish" ? STOCKFISH_DEPTHS : SEARCH_DEPTHS;
  return (
    <section className={`card player player-${color} ${active ? "active" : ""}`} aria-label={`${name} player`}>
      <div className="player-head">
        <span className={`player-piece piece piece-${color}`} aria-hidden="true">
          {PIECE_GLYPH.k}
        </span>
        <div className="player-title">{name}</div>
        {thinking && (
          <span className="thinking">
            Thinking<span className="dots" />
          </span>
        )}
      </div>

      <div className="field">
        <select
          className="select"
          aria-label={`${name} player type`}
          value={setup.kind}
          onChange={(e) => {
            const kind = e.target.value as ChessPlayerKind;
            onChange({ ...setup, kind, depth: defaultDepth(kind), instructions: null });
          }}
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind} disabled={usesChessJev(kind) && !jevConfigured}>
              {CHESS_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        <p className="hint">{describeChessSetup(setup)}</p>
      </div>

      {isJev && (
        <InstructionsEditor
          applied={setup.instructions ?? defaultText}
          defaultText={defaultText}
          isCustom={setup.instructions !== null}
          onApply={(instructions) => onChange({ ...setup, instructions })}
          editLabel={`Edit instructions for ${name}`}
        />
      )}

      {(isJev || usesSearch(setup.kind) || setup.kind === "stockfish") && (
        <details className="more">
          <summary>More settings</summary>
          <div className="more-body">
            {(usesSearch(setup.kind) || setup.kind === "stockfish") && (
              <label className="row">
                <span>{setup.kind === "stockfish" ? "Search depth" : "Look ahead"}</span>
                <select className="select select-small" value={setup.depth} onChange={(e) => onChange({ ...setup, depth: Number(e.target.value) })}>
                  {depths.map((d) => (
                    <option key={d} value={d}>
                      {d} {d === 1 ? "ply" : "plies"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {isJev && (
              <>
                <ModelSelect value={setup.model} onChange={(model) => onChange({ ...setup, model })} />
                <label className="row" title="Send Jev where every piece stands, as lists such as 'knight f3, pawn e4'">
                  <span>Send piece lists</span>
                  <input type="checkbox" className="switch" checked={setup.board} onChange={(e) => onChange({ ...setup, board: e.target.checked })} />
                </label>
                <label className="row" title="Describe what each move leaves attacked, defended or in danger, computed in code">
                  <span>Describe threats</span>
                  <input type="checkbox" className="switch" checked={setup.safety} onChange={(e) => onChange({ ...setup, safety: e.target.checked })} />
                </label>
              </>
            )}
            {setup.kind === "jev" && <p className="hint">{CANDIDATE_RULE}</p>}
          </div>
        </details>
      )}

      {stats && (
        <dl className="player-stats">
          <div>
            <dt>Wins</dt>
            <dd>{stats.wins}</dd>
          </div>
          <div>
            <dt>Avg loss</dt>
            <dd title="Average centipawns lost per move, rated by Stockfish">{stats.avgLoss !== null ? `${Math.round(stats.avgLoss)} cp` : "–"}</dd>
          </div>
          <div>
            <dt>Time per move</dt>
            <dd>{stats.avgMs !== null ? formatMs(stats.avgMs) : "–"}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
