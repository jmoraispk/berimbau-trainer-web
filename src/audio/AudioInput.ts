/**
 * AudioInput — main-thread adapter for the mic pipeline.
 *
 *   mic → MediaStreamSource → onset-worklet
 *                                   │
 *                                   ▼  postMessage({segment, t, rms})
 *                          extractFeatures + classify
 *                                   │
 *                                   ▼
 *                              audioBus.pushNote(...)
 *
 * Responsibilities:
 *   - Request mic permission (must be called from a user gesture — iOS
 *     Safari and Chrome autoplay policies).
 *   - Create & resume the AudioContext; handle visibilitychange so
 *     Safari's tab-suspend doesn't leave us stuck in a suspended state.
 *   - Load the onset-detection worklet, consume its messages, run feature
 *     extraction + classification, and apply simple bleed detection before
 *     pushing the note to AudioBus.
 *
 * Keeps the audio pipeline out of React — the Practice screen just
 * subscribes to audioBus for coarse events and reads live notes directly
 * in the render loop.
 */

import { extractFeatures } from '@/engine/features';
import { classify } from '@/engine/classifier';
import type { Profiles } from '@/engine/profiles';
import type { DetectedNote } from '@/engine/scoring';
import { audioBus } from './AudioBus';

// The worklet lives in public/audio/ as plain JS so both dev and prod
// serve it verbatim (Vite's worker transform injects HMR client code
// that breaks the AudioWorklet's restricted global scope).
const workletUrl = '/audio/onset-worklet.js';

interface OnsetMessage {
  type: 'onset';
  timestamp: number;
  segment: Float32Array;
  rms: number;
  baseline: number;
}

const BLEED_GAP_SEC = 0.06;

export interface AudioInputOptions {
  /** Override the calibration profiles fed to the classifier. */
  profiles?: Profiles;
}

export class AudioInput {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private lastOnsetAt = -Infinity;
  private profiles: Profiles | undefined;
  private onVisibility = () => this.handleVisibility();

  constructor(options: AudioInputOptions = {}) {
    this.profiles = options.profiles;
  }

  get isRunning(): boolean {
    return this.context?.state === 'running';
  }

  /** Must be called from a user gesture (tap / click / key). */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    this.context = new AudioContext({ latencyHint: 'interactive' });
    await this.context.audioWorklet.addModule(workletUrl);

    const source = this.context.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.context, 'onset-processor');
    this.workletNode.port.onmessage = (ev: MessageEvent<OnsetMessage>) => {
      this.handleOnset(ev.data);
    };
    source.connect(this.workletNode);
    // Worklet doesn't need to reach the destination — we only want its
    // messages. Connecting to destination would route mic to speakers.

    if (this.context.state === 'suspended') await this.context.resume();

    document.addEventListener('visibilitychange', this.onVisibility);
    audioBus.emit({ type: 'started' });
  }

  async stop(): Promise<void> {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.workletNode?.disconnect();
    this.workletNode = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    audioBus.emit({ type: 'stopped' });
  }

  setProfiles(profiles: Profiles | undefined): void {
    this.profiles = profiles;
  }

  /** Seconds since the AudioContext was created. Shared clock for scoring. */
  now(): number {
    return this.context?.currentTime ?? performance.now() / 1000;
  }

  private handleOnset(msg: OnsetMessage): void {
    if (msg.type !== 'onset') return;
    const sampleRate = this.context?.sampleRate ?? 44100;
    const features = extractFeatures(msg.segment, sampleRate);
    const classification = classify(features.f0, features.centroid, this.profiles);

    const bleed = msg.timestamp - this.lastOnsetAt < BLEED_GAP_SEC;
    this.lastOnsetAt = msg.timestamp;

    const note: DetectedNote = {
      timestamp: msg.timestamp,
      soundClass: classification.sound,
      confidence: classification.confidence,
      f0: features.f0,
      amplitude: Math.min(1, msg.rms * 10),
      isMistake: bleed,
      mistakeType: bleed ? 'note_bleed' : undefined,
    };
    audioBus.pushNote(note);
  }

  private async handleVisibility(): Promise<void> {
    if (!this.context) return;
    if (document.visibilityState === 'hidden') {
      // Safari suspends AudioContext automatically; other browsers don't
      // but we do it ourselves so the pipeline is paused uniformly.
      if (this.context.state === 'running') await this.context.suspend();
    } else {
      if (this.context.state === 'suspended') await this.context.resume();
    }
  }
}
