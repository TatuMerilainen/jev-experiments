import { describe, expect, it } from "vitest";
import { DEFAULT_CHESS_SETTINGS } from "../src/web/chess/chessExperiment";
import { DEFAULT_SETTINGS } from "../src/web/experiment";
import type { PlayerSetup } from "../src/shared/types";
import { normalizeChessSettings, normalizeSettings, settingsToSave, withStandIns } from "../src/web/savedSettings";

describe("saved settings", () => {
  it("keep valid settings as they are", () => {
    const settings = {
      players: {
        X: { kind: "jev-direct", depth: 3, lines: false, instructions: "Play fast.", model: "jev-1.13.0" },
        O: { kind: "perfect", depth: 1, lines: true, instructions: null, model: "jev-1.14.0" },
      },
      randomFirst: true,
      delayMs: 250,
      continuous: true,
    };
    expect(normalizeSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
    expect(normalizeChessSettings(DEFAULT_CHESS_SETTINGS)).toEqual(DEFAULT_CHESS_SETTINGS);
  });

  it("replace missing or invalid fields with their defaults", () => {
    const saved = normalizeSettings({ players: { X: { kind: "gone", depth: 9, model: "jev-0.1" } }, delayMs: "fast" });
    expect(saved).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("not settings")).toEqual(DEFAULT_SETTINGS);
  });

  it("move a delay saved before the slider to the nearest stop", () => {
    expect(normalizeSettings({ delayMs: 500 }).delayMs).toBe(250);
    expect(normalizeSettings({ delayMs: 3000 }).delayMs).toBe(2000);
    expect(normalizeSettings({ delayMs: 5000 }).delayMs).toBe(2000);
    expect(normalizeSettings({}).delayMs).toBe(1000);
  });

  it("give a setup saved before the model setting the default model", () => {
    const saved = normalizeSettings({ players: { X: { kind: "jev-lookahead", depth: 2, lines: true, instructions: null } } });
    expect(saved.players.X.model).toBe("jev-1.14.0");
  });

  it("use the player panel's default depth when a chess depth does not fit the player type", () => {
    const saved = normalizeChessSettings({ players: { w: { kind: "stockfish", depth: 2 }, b: { kind: "jev", depth: 8 } } });
    expect(saved.players.w.depth).toBe(5);
    expect(saved.players.b.depth).toBe(2);
  });
});

describe("stand-ins without an API key", () => {
  const custom: PlayerSetup = { kind: "jev-lookahead", depth: 3, lines: false, instructions: "Play fast.", model: "jev-1.13.0" };
  const settings = { ...DEFAULT_SETTINGS, players: { X: custom, O: DEFAULT_SETTINGS.players.O } };
  const replace = (p: PlayerSetup): PlayerSetup => (p.kind === "jev-lookahead" ? { ...p, kind: "code-only", instructions: null } : p);

  it("save the Jev setups they replace", () => {
    const standIns = new WeakMap<PlayerSetup, PlayerSetup>();
    const live = withStandIns(settings, standIns, replace);
    expect(live.players.X.kind).toBe("code-only");
    expect(settingsToSave(live, standIns)).toEqual(settings);
    // Other changes and a swap keep the stand-ins.
    const swapped = { ...live, delayMs: 0, players: { X: live.players.O, O: live.players.X } };
    expect(settingsToSave(swapped, standIns).players).toEqual({ X: DEFAULT_SETTINGS.players.O, O: custom });
  });

  it("save a player that the user changed", () => {
    const standIns = new WeakMap<PlayerSetup, PlayerSetup>();
    const live = withStandIns(settings, standIns, replace);
    const edited = { ...live, players: { ...live.players, X: { ...live.players.X, depth: 1 } } };
    expect(settingsToSave(edited, standIns).players.X).toMatchObject({ kind: "code-only", depth: 1 });
  });
});
