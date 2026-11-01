// The live, stateful half of the game clock (DESIGN.md §3) — game-clock.mts
// is pure calendar math with no notion of "now" or persistence; this is
// the part that actually ticks, holds pause/speed state, and saves it.
// Confirmed 2026-11-01, "full working clock" scope: pausing really stops
// vehicle-simulation.ts's own animation, not just the display.
import { gameSecondsForRealMs, type SpeedMultiplier } from "./game-clock.mts";

// Read by every other module that needs "what time is it right now" for
// animation/simulation (vehicle-simulation.ts) — same shared-mutable-state
// pattern already used by routeDrawState/stopsPanelState elsewhere in this
// codebase, not a new convention.
export interface GameClockState {
  accumulatedGameSeconds: number;
  speedMultiplier: SpeedMultiplier;
  isPaused: boolean;
}

export const gameClockState: GameClockState = {
  accumulatedGameSeconds: 0,
  speedMultiplier: 1,
  isPaused: false,
};

// Debounced rather than saved on every tick (that would be a write every
// animation frame) — saved on pause/speed changes immediately (so a
// close-right-after-clicking-pause doesn't lose the click), and otherwise
// at most once every SAVE_INTERVAL_MS while running.
const SAVE_INTERVAL_MS = 5000;
let lastSavedAt = 0;
let lastFrameRealMs: number | null = null;
let rafHandle: number | null = null;

function persist(): void {
  void window.gameClock.set({
    accumulatedGameSeconds: gameClockState.accumulatedGameSeconds,
    speedMultiplier: gameClockState.speedMultiplier,
    isPaused: gameClockState.isPaused,
  });
}

function tick(nowRealMs: number): void {
  if (lastFrameRealMs === null) lastFrameRealMs = nowRealMs;
  const deltaRealMs = nowRealMs - lastFrameRealMs;
  lastFrameRealMs = nowRealMs;

  if (!gameClockState.isPaused) {
    gameClockState.accumulatedGameSeconds += gameSecondsForRealMs(deltaRealMs, gameClockState.speedMultiplier);
    if (nowRealMs - lastSavedAt > SAVE_INTERVAL_MS) {
      lastSavedAt = nowRealMs;
      persist();
    }
  }
  rafHandle = requestAnimationFrame(tick);
}

export async function startGameClock(): Promise<void> {
  const saved = await window.gameClock.get();
  gameClockState.accumulatedGameSeconds = saved.accumulatedGameSeconds;
  gameClockState.speedMultiplier = saved.speedMultiplier;
  gameClockState.isPaused = saved.isPaused;
  lastFrameRealMs = null;
  if (rafHandle !== null) cancelAnimationFrame(rafHandle);
  rafHandle = requestAnimationFrame(tick);
}

export function setPaused(paused: boolean): void {
  gameClockState.isPaused = paused;
  persist();
}

export function setSpeedMultiplier(speed: SpeedMultiplier): void {
  gameClockState.speedMultiplier = speed;
  persist();
}
