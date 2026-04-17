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

export class AudioBus {
  /** Ring buffer of recently detected notes, read imperatively by the canvas loop. */
  readonly recentNotes: DetectedNote[] = [];
  private readonly maxNotes = 256;
  private readonly listeners = new Set<AudioBusListener>();

  /** Subscribe to coarse events. Use sparingly — never per-frame data. */
  subscribe(listener: AudioBusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called by the worklet adapter when a note is detected. */
  pushNote(note: DetectedNote): void {
    this.recentNotes.push(note);
    if (this.recentNotes.length > this.maxNotes) this.recentNotes.shift();
    this.emit({ type: 'note', note });
  }

  emit(event: AudioBusEvent): void {
    for (const l of this.listeners) l(event);
  }
}

/** Singleton — there is exactly one audio pipeline per page. */
export const audioBus = new AudioBus();
