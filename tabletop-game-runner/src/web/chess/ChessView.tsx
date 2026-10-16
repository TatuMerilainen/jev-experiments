import { Chess } from "chess.js";
import { useEffect, useRef } from "react";
import type { ChessColor, ChessPlayerSetup, SavedChessMove } from "../../shared/chess/types";
import { chessConfig, configKey } from "../../shared/matchups";
import type { SavedReplay } from "../../shared/replays";
import type { StatusResponse } from "../../shared/types";
import { JevSidebar } from "../components/JevSidebar";
import { MatchupPanel, type MatchupSide } from "../components/MatchupPanel";
import { ReplayBar } from "../components/ReplayBar";
import { StageHead } from "../components/StageHead";
import { formatGameTime, modelsText } from "../format";
import { Toolbar } from "../components/Toolbar";
import { ChessBoard } from "./ChessBoard";
import { ChessDecisionPanel, moveNumber } from "./ChessDecisionPanel";
import { answersHuman, endsOpeningRun, gameOpening, nextOpeningMove, type ChessMoveRecord, type ChessState } from "./chessExperiment";
import { OPENINGS } from "../../shared/chess/openings";
import { chessJevRequestAbout, chessSetupLabel, COLOR_LABEL, PIECE_GLYPH, usesChessJev } from "./chessFormat";
import { ChessMoveLog } from "./ChessMoveLog";
import { ChessPlayerPanel, type ChessPlayerStats } from "./ChessPlayerPanel";
import { ChessTallyPanel } from "./ChessTallyPanel";
import { useChessExperiment } from "./useChessExperiment";
import { useMatchups } from "../useMatchups";
import { useReplay } from "../useReplay";
import { fromSavedChessMove, useChessLog } from "./useChessLog";

const turnOf = (fen: string): ChessColor => (fen.split(" ")[1] === "b" ? "b" : "w");

interface Props {
  status: StatusResponse | null;
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

export function ChessView({ status, sidebarOpen, onCloseSidebar }: Props) {
  const { state, actions } = useChessExperiment();
  const save = useChessLog(state);
  const matchups = useMatchups<ChessPlayerSetup>("chess", save.gamesSaved);
  const replays = useReplay<ChessPlayerSetup, SavedChessMove, ChessMoveRecord>("chess", fromSavedChessMove, describeReplay);
  const { replay } = replays;
  const stage = useRef<HTMLElement>(null);

  useEffect(() => {
    if (status && !status.jevConfigured) actions.withoutJev();
    // Only the first status matters: it decides whether Jev players are available.
  }, [status?.jevConfigured]);

  const latest = state.moves.at(-1);
  // A replay shows a saved game in the same board, Move panel, Moves list and sidebar as the live game.
  const moves = replay ? replay.moves : state.moves;
  const inspectedIndex = replay ? replay.selected : (state.inspected ?? state.moves.length - 1);
  const replayed = replay ? moves[inspectedIndex] : undefined;
  const shownMove = replayed ?? latest;
  // The sidebar follows the selected move. When that move made no Jev request, it shows the latest move that did.
  const jevIndex = moves[inspectedIndex]?.decision?.jevExample ? inspectedIndex : moves.findLastIndex((m) => m.decision?.jevExample);
  const jevRecord = moves[jevIndex];
  const mover = turnOf(state.fen);
  // The app plays the opening moves, also for a human.
  const humanTurn = !state.outcome && state.settings.players[mover].kind === "human" && !nextOpeningMove(state);
  const { w, b } = state.settings.players;
  const orientation: ChessColor = b.kind === "human" && w.kind !== "human" ? "b" : "w";
  const models = modelsText([
    ["White", usesChessJev(w.kind) ? w.model : null],
    ["Black", usesChessJev(b.kind) ? b.model : null],
  ]);
  const gameTokens = state.moves.reduce((sum, m) => sum + (m.decision?.stats.inputTokens ?? 0), 0);

  const matchupSide = (color: ChessColor): MatchupSide<ChessPlayerSetup> => ({
    config: state.settings.players[color],
    icon: <span className={`piece piece-${color} inline-piece`}>{PIECE_GLYPH.k}</span>,
  });
  const sameSides = configKey(chessConfig(matchupSide("w").config)) === configKey(chessConfig(matchupSide("b").config));

  const panel = (color: ChessColor) => (
    <ChessPlayerPanel
      color={color}
      setup={state.settings.players[color]}
      stats={playerStats(state, color)}
      jevConfigured={status?.jevConfigured ?? true}
      active={!state.outcome && mover === color}
      thinking={state.busy && mover === color}
      onChange={(setup: ChessPlayerSetup) => actions.changeSetup({ ...state.settings, players: { ...state.settings.players, [color]: setup } })}
    />
  );

  return (
    <>
      <main className="arena">
        <div className="arena-x">{panel("w")}</div>

        <section className="stage" ref={stage}>
          <StageHead
            status={
              replay
                ? "Replay of a saved game"
                : `Game ${state.gameNo}${openingText(state)} · ${statusText(state)}${gradeText(state)}${replays.error ? ` · Replay failed: ${replays.error}` : ""}`
            }
            error={!replay && (state.error !== null || state.gradeError !== null || replays.error !== null)}
            showSwap={!replay}
            sameSides={sameSides}
            sides="White and Black"
            onSwap={() => actions.changeSetup({ ...state.settings, players: { w: state.settings.players.b, b: state.settings.players.w } })}
          />
          <ChessBoard
            fen={replayed ? fenAfter(replayed) : state.fen}
            orientation={orientation}
            from={shownMove?.from}
            to={shownMove?.to}
            onMove={!replay && humanTurn && !state.busy ? actions.humanMove : undefined}
          />
          {replay ? (
            <ReplayBar
              title={replay.title}
              detail={replay.detail}
              index={replay.selected}
              count={replay.moves.length}
              onSelect={replays.select}
              onClose={replays.close}
            />
          ) : (
            <Toolbar
              running={state.running}
              gameOver={state.outcome !== null}
              stepDisabled={state.busy || humanTurn}
              delayMs={state.settings.delayMs}
              continuous={state.settings.continuous}
              openings={{ value: state.settings.openings, onChange: (openings) => actions.changeSetup({ ...state.settings, openings }) }}
              onReset={actions.reset}
              onStep={actions.step}
              onPlay={actions.play}
              onPause={actions.pause}
              onDelayChange={actions.setDelay}
              onContinuousChange={actions.setContinuous}
            />
          )}
        </section>

        <div className="arena-o">{panel("b")}</div>
      </main>

      <section className="data">
        <MatchupPanel
          current={[matchupSide("w"), matchupSide("b")]}
          sideNames={["White", "Black"]}
          records={matchups.records}
          error={matchups.error}
          keyOf={(config, parts) => configKey(chessConfig(config, parts))}
          labelOf={(config, parts) => chessSetupLabel(chessConfig(config, parts), true)}
          game="chess"
          gamesSaved={save.gamesSaved}
          lengthUnit={["ply", "plies"]}
          openGame={replay?.ref ?? null}
          onOpenGame={(ref) => {
            actions.pause();
            // The games list sits below the board, so bring the board into view.
            void replays.open(ref).then((opened) => opened && stage.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
          }}
        />
        <ChessDecisionPanel record={moves[inspectedIndex]} index={inspectedIndex} onLatest={!replay && showsOlderMove(state) ? () => actions.inspect(null) : undefined} />
        <div className="data-row">
          <ChessTallyPanel
            tally={state.tally}
            settings={state.settings}
            save={save}
            experimentId={state.experimentId}
            models={models}
            gameTokens={gameTokens}
            gameOver={state.outcome !== null}
          />
          <ChessMoveLog moves={moves} selected={inspectedIndex} onSelect={replay ? replays.select : actions.inspect} />
        </div>
      </section>

      {sidebarOpen && (
        <JevSidebar
          example={jevRecord?.decision?.jevExample}
          about={jevRecord?.decision ? chessJevRequestAbout(jevRecord.setup, jevRecord.color, jevRecord.decision.candidates.length) : ""}
          source={jevRecord ? `${moveNumber(jevIndex)} ${COLOR_LABEL[jevRecord.color]} played ${jevRecord.san} · ${chessSetupLabel(jevRecord.setup)}` : ""}
          requests={jevRecord?.decision?.stats.jevRequests ?? 0}
          onClose={onCloseSidebar}
        />
      )}
    </>
  );
}

function describeReplay(data: SavedReplay<ChessPlayerSetup, SavedChessMove>) {
  const { winner, moves, at, reason } = data.summary;
  const result = winner === "draw" ? "Draw" : `${winner === "first" ? "White" : "Black"} won`;
  const saved = data.moves.length < moves ? ` (${data.moves.length} saved)` : "";
  return {
    title: `Game ${data.gameNo}: ${chessSetupLabel(data.first, true)} (White) vs ${chessSetupLabel(data.second, true)} (Black)`,
    detail: [result, reason, `${moves} plies${saved}`, formatGameTime(at)].filter(Boolean).join(" · "),
  };
}

/** The position after a move, for the replay board. */
function fenAfter(record: ChessMoveRecord): string {
  const game = new Chess(record.fenBefore);
  const promotion = record.uci[4];
  game.move({ from: record.from, to: record.to, ...(promotion ? { promotion } : {}) });
  return game.fen();
}

/** A click in the Moves list keeps that move in the Move panel while new moves arrive. */
const showsOlderMove = (state: ChessState) => state.inspected !== null && state.inspected < state.moves.length - 1;

/** For example " · Italian Game: Giuoco Piano · 7 of 24, pass 1 of 2". */
function openingText(state: ChessState): string {
  const opening = gameOpening(state);
  return opening ? ` · ${opening.opening.name} · ${opening.number} of ${OPENINGS.length}, pass ${state.pass} of 2` : "";
}

/** Failed ratings do not stop play, so the status line says how many moves of this game have none. */
function gradeText(state: ChessState): string {
  if (!state.gradeError) return "";
  const failed = state.moves.filter((m) => m.grade === "failed").length;
  return ` · ${failed} ${failed === 1 ? "move" : "moves"} not rated: ${state.gradeError}`;
}

function statusText(state: ChessState): string {
  if (state.error) return `Stopped: ${state.error}`;
  if (state.outcome) {
    const { winner, reason } = state.outcome;
    const end = winner ? `${COLOR_LABEL[winner]} wins by ${reason}` : `Draw by ${reason}`;
    return endsOpeningRun(state) ? `${end} · Both passes of the opening set are done` : end;
  }
  const mover = turnOf(state.fen);
  if (state.busy) return `${COLOR_LABEL[mover]} is thinking…`;
  if (state.settings.players[mover].kind === "human") return `Your move as ${COLOR_LABEL[mover]}`;
  return state.running || answersHuman(state) ? "Playing" : "Paused";
}

function playerStats(state: ChessState, color: ChessColor): ChessPlayerStats {
  const side = state.tally.side[color];
  return {
    wins: state.tally.wins[color],
    avgLoss: side.graded ? side.lossTotal / side.graded : null,
    avgMs: side.decisions ? side.roundTripMs / side.decisions : null,
  };
}

