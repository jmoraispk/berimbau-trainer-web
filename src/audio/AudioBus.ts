/**
 * AudioBus — the boundary between the audio pipeline and the UI.
 *
 *   AudioWorklet ──postMessage──▶ AudioBus ──▶ Canvas draw loop (via refs)
 *                                         └─▶ React (coarse events only)
 *
 * This module is deliberately empty today. Its job is to make the
 * architectural rule visible: the Canvas render loop reads from the bus
 * imperatively (no React re-renders per audio frame), and React only
 * subscribes to *coarse* events — session start, calibration done, etc.
 *
 * Implementation arrives with the AudioWorklet port.
 */

import type { DetectedNote } from '@/engine/scoring';

export type AudioBusEvent =
  | { type: 'note'; note: DetectedNote }
  | { type: 'level'; rms: number; t: number }
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'error'; message: string };

export type AudioBusListener = (event: AudioBusEvent) => void;

/**
 * A 'full' onset capture sent only when something subscribes via
 * subscribeRawCapture — the calibration UI uses this for waveform
 * thumbnails + playback. Practice never reads it.
 */
export interface RawCapture {
  /** AudioContext time when the strike was detected. */
  timestamp: number;
  /** Seconds of pre-onset audio at the start of `segment`. */
  preSec: number;
  /** Mono PCM, sampled at `sampleRate`. */
  segment: Float32Array;
  sampleRate: number;
  rms: number;
}

export type RawCaptureListener = (capture: RawCapture) => void;

export class AudioBus {
  /** Ring buffer of recently detected notes, read imperatively by the canvas loop. */
  readonly recentNotes: DetectedNote[] = [];
  private readonly maxNotes = 256;
  private readonly listeners = new Set<AudioBusListener>();
  private readonly rawListeners = new Set<RawCaptureListener>();

  /** Subscribe to coarse events. Use sparingly — never per-frame data. */
  subscribe(listener: AudioBusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribe to raw 'full' captures (50ms pre + 450ms post-onset audio).
   * Returns whether anyone is listening so AudioInput can skip emitting
   * when nothing cares — keeps the audio→main hop cheap during normal
   * Practice. The Calibrate route is the only current consumer.
   */
  subscribeRawCapture(listener: RawCaptureListener): () => void {
    this.rawListeners.add(listener);
    return () => this.rawListeners.delete(listener);
  }

  hasRawListeners(): boolean {
    return this.rawListeners.size > 0;
  }

  /** Called by the worklet adapter when a note is detected. */
  pushNote(note: DetectedNote): void {
    this.recentNotes.push(note);
    if (this.recentNotes.length > this.maxNotes) this.recentNotes.shift();
    this.emit({ type: 'note', note });
  }

  pushRawCapture(capture: RawCapture): void {
    for (const l of this.rawListeners) l(capture);
  }

  emit(event: AudioBusEvent): void {
    for (const l of this.listeners) l(event);
  }
}

/** Singleton — there is exactly one audio pipeline per page. */
export const audioBus = new AudioBus();
