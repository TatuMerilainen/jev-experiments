import { useEffect, useRef } from "react";
import { configKey, tictactoeConfig } from "../shared/matchups";
import type { SavedReplay } from "../shared/replays";
import { cellName, play, toMove, winningLine } from "../shared/tictactoe";
import type { Mark, PlayerSetup, SavedMove, StatusResponse } from "../shared/types";
import { Board, MarkIcon } from "./components/Board";
import { DecisionPanel } from "./components/DecisionPanel";
import { JevSidebar } from "./components/JevSidebar";
import { MatchupPanel, type MatchupSide } from "./components/MatchupPanel";
import { MoveLog } from "./components/MoveLog";
import { PlayerPanel, type PlayerStats } from "./components/PlayerPanel";
import { ReplayBar } from "./components/ReplayBar";
import { StageHead } from "./components/StageHead";
import { TallyPanel } from "./components/TallyPanel";
import { Toolbar } from "./components/Toolbar";
import { answersHuman, type ExperimentState, type MoveRecord } from "./experiment";
import { formatGameTime, jevRequestAbout, modelsText, setupLabel, sourceLabel, usesJev } from "./format";
import { useExperiment } from "./useExperiment";
import { fromSavedMove, useExperimentLog } from "./useExperimentLog";
import { useMatchups } from "./useMatchups";
import { useReplay } from "./useReplay";

interface Props {
  status: StatusResponse | null;
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

export function TicTacToeView({ status, sidebarOpen, onCloseSidebar }: Props) {
  const { state, actions } = useExperiment();
  const save = useExperimentLog(state);
  const matchups = useMatchups<PlayerSetup>("tictactoe", save.gamesSaved);
  const replays = useReplay<PlayerSetup, SavedMove, MoveRecord>("tictactoe", fromSavedMove, describeReplay);
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
  const board = replayed ? play(replayed.before, replayed.cell) : state.board;
  // The sidebar follows the selected move. When that move made no Jev request, it shows the latest move that did.
  const jevIndex = moves[inspectedIndex]?.decision?.jevExample ? inspectedIndex : moves.findLastIndex((m) => m.decision?.jevExample);
  const jevRecord = moves[jevIndex];
  const mover = toMove(state.board);
  const humanTurn = !state.result && state.settings.players[mover].kind === "human";
  const { X, O } = state.settings.players;
  const models = modelsText([
    ["X", usesJev(X.kind) ? X.model : null],
    ["O", usesJev(O.kind) ? O.model : null],
  ]);

  const matchupSide = (mark: Mark): MatchupSide<PlayerSetup> => ({
    config: state.settings.players[mark],
    icon: <MarkIcon mark={mark} className="inline-mark" />,
  });
  const sameSides = configKey(tictactoeConfig(matchupSide("X").config)) === configKey(tictactoeConfig(matchupSide("O").config));

  const playerPanel = (mark: Mark) => (
    <PlayerPanel
      mark={mark}
      setup={state.settings.players[mark]}
      stats={playerStats(state, mark)}
      jevConfigured={status?.jevConfigured ?? true}
      active={!state.result && mover === mark}
      thinking={state.busy && mover === mark}
      onChange={(setup: PlayerSetup) =>
        actions.changeSetup({ ...state.settings, players: { ...state.settings.players, [mark]: setup } })
      }
    />
  );

  return (
    <>
      <main className="arena">
        <div className="arena-x">{playerPanel("X")}</div>

        <section className="stage" ref={stage}>
          <StageHead
            status={replay ? "Replay of a saved game" : `Game ${state.gameNo} · ${statusText(state)}${replays.error ? ` · Replay failed: ${replays.error}` : ""}`}
            error={!replay && (state.error !== null || replays.error !== null)}
            showSwap={!replay}
            sameSides={sameSides}
            sides="X and O"
            onSwap={() => actions.changeSetup({ ...state.settings, players: { X: state.settings.players.O, O: state.settings.players.X } })}
          />
          <Board
            board={board}
            highlight={(replayed ?? latest)?.cell ?? null}
            highlightStyle="dot"
            winLine={winningLine(board)}
            onCellClick={!replay && humanTurn && !state.busy ? actions.clickCell : undefined}
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
              gameOver={state.result !== null}
              stepDisabled={state.busy || humanTurn}
              delayMs={state.settings.delayMs}
              continuous={state.settings.continuous}
              randomFirst={{ value: state.settings.randomFirst, onChange: (randomFirst) => actions.changeSetup({ ...state.settings, randomFirst }) }}
              onReset={actions.reset}
              onStep={actions.step}
              onPlay={actions.play}
              onPause={actions.pause}
              onDelayChange={actions.setDelay}
              onContinuousChange={actions.setContinuous}
            />
          )}
        </section>

        <div className="arena-o">{playerPanel("O")}</div>
      </main>

      <section className="data">
        <MatchupPanel
          current={[matchupSide("X"), matchupSide("O")]}
          sideNames={["X", "O"]}
          records={matchups.records}
          error={matchups.error}
          keyOf={(config, parts) => configKey(tictactoeConfig(config, parts))}
          labelOf={(config, parts) => setupLabel(tictactoeConfig(config, parts), true)}
          game="tictactoe"
          gamesSaved={save.gamesSaved}
          lengthUnit={["move", "moves"]}
          openGame={replay?.ref ?? null}
          onOpenGame={(ref) => {
            actions.pause();
            // The games list sits below the board, so bring the board into view.
            void replays.open(ref).then((opened) => opened && stage.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
          }}
        />
        <DecisionPanel record={moves[inspectedIndex]} index={inspectedIndex} onLatest={!replay && showsOlderMove(state) ? () => actions.inspect(null) : undefined} />
        <div className="data-row">
          <TallyPanel
            tally={state.tally}
            settings={state.settings}
            save={save}
            experimentId={state.experimentId}
            models={models}
          />
          <MoveLog moves={moves} selected={inspectedIndex} onSelect={replay ? replays.select : actions.inspect} />
        </div>
      </section>

      {sidebarOpen && (
        <JevSidebar
          example={jevRecord?.decision?.jevExample}
          about={jevRecord?.decision ? jevRequestAbout(jevRecord.setup, jevRecord.player, jevRecord.decision.candidates.length) : ""}
          source={jevRecord ? `Move ${jevIndex + 1}: ${jevRecord.player} played ${cellName(jevRecord.cell)} · ${sourceLabel(jevRecord.source, jevRecord.setup)}` : ""}
          requests={jevRecord?.decision?.stats.jevRequests ?? 0}
          onClose={onCloseSidebar}
        />
      )}
    </>
  );
}

function describeReplay(data: SavedReplay<PlayerSetup, SavedMove>) {
  const { winner, moves, at } = data.summary;
  const result = winner === "draw" ? "Draw" : `${winner === "first" ? "X" : "O"} won`;
  const saved = data.moves.length < moves ? ` (${data.moves.length} saved)` : "";
  return {
    title: `Game ${data.gameNo}: ${setupLabel(data.first, true)} (X) vs ${setupLabel(data.second, true)} (O)`,
    detail: `${result} · ${moves} moves${saved} · ${formatGameTime(at)}`,
  };
}

/** A click in the Moves list keeps that move in the Move panel while new moves arrive. */
const showsOlderMove = (state: ExperimentState) => state.inspected !== null && state.inspected < state.moves.length - 1;

function statusText(state: ExperimentState): string {
  if (state.error) return `Stopped: ${state.error}`;
  const mark = toMove(state.board);
  if (state.result) return state.result === "draw" ? "Draw" : `${state.result} wins`;
  if (state.busy) return `${mark} is thinking…`;
  if (state.settings.players[mark].kind === "human") return `Your move as ${mark}`;
  return state.running || answersHuman(state) ? "Playing" : "Paused";
}

function playerStats(state: ExperimentState, mark: Mark): PlayerStats {
  const side = state.tally.side[mark];
  return {
    wins: state.tally.wins[mark],
    optimal: side.optimal,
    moves: side.moves,
    avgMs: side.decisions ? side.roundTripMs / side.decisions : null,
  };
}
