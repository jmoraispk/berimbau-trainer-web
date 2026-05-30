/**
 * Mic-feedback classification — decide what the Practice screen should tell
 * the user about their live microphone signal.
 *
 * Practice silently falls back to keyboard mode when the mic can't start,
 * and even when the mic *does* start it can be muted, set to the wrong
 * OS input, or have its gain at zero. In all those cases the user plays
 * their berimbau and every beat scores a miss with no explanation —
 * which reads as "the app is broken." This helper turns the raw RMS level
 * into a coarse state the UI can surface honestly.
 *
 * Pure + framework-free so it's unit-testable without a DOM or AudioContext.
 */

export type MicLevelState =
  | 'listening' // mic is alive; waiting for (or between) strikes
  | 'hearing'   // a strike-level signal is coming through right now
  | 'silent';   // running a while with no signal at all — likely a dead mic

/**
 * RMS at/above which we treat the input as an actual berimbau strike
 * (vs. room tone). A strike typically reads 0.1–0.3; ambient noise sits
 * well below 0.01. Matches the spirit of the worklet's ABS_FLOOR.
 */
export const STRIKE_RMS = 0.02;

/**
 * RMS below which the input is effectively digital silence. A working mic
 * in a quiet room still floats above this on room tone; a muted, missing,
 * or wrong-input device sits at ~0. Used to distinguish "you haven't
 * played yet" from "we can't hear anything at all."
 */
export const SILENCE_FLOOR_RMS = 0.001;

/**
 * Seconds of running with no detectable signal before we warn. Long
 * enough to cover the count-in plus a few beats of a slow starter, short
 * enough that a genuinely broken mic is flagged before the user gives up.
 */
export const SILENCE_GRACE_SEC = 6;

export interface MicLevelInput {
  /** Instantaneous RMS from AudioInput.getLevel(). */
  level: number;
  /** Peak RMS observed since the session (or this indicator) started. */
  peakLevel: number;
  /** Seconds the mic has been live. */
  elapsedSec: number;
  strikeThreshold?: number;
  silenceFloor?: number;
  graceSec?: number;
}

/**
 * Map a live mic reading onto a {@link MicLevelState}. Order matters: a
 * current strike always reads as 'hearing' (even right after a warning),
 * so the indicator recovers the instant real audio arrives.
 */
export function classifyMicLevel(input: MicLevelInput): MicLevelState {
  const strikeThreshold = input.strikeThreshold ?? STRIKE_RMS;
  const silenceFloor = input.silenceFloor ?? SILENCE_FLOOR_RMS;
  const graceSec = input.graceSec ?? SILENCE_GRACE_SEC;

  if (input.level >= strikeThreshold) return 'hearing';
  if (input.elapsedSec >= graceSec && input.peakLevel < silenceFloor) return 'silent';
  return 'listening';
}
