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
import type { ClassifiableSound, Profiles } from '@/engine/profiles';
import type { DetectedNote } from '@/engine/scoring';
import { audioBus } from './AudioBus';
import { getActiveProfiles } from './active-profiles';
import { DEFAULT_PROFILES } from '@/engine/profiles';
import { getMicDeviceId, setMicDeviceId } from './mic-device';

// The worklet lives in public/audio/ as plain JS so both dev and prod
// serve it verbatim (Vite's worker transform injects HMR client code
// that breaks the AudioWorklet's restricted global scope).
const workletUrl = '/audio/onset-worklet.js';

interface OnsetMessage {
  type: 'onsetQuick' | 'onsetFull';
  timestamp: number;
  /** Seconds of pre-onset audio at the start of `segment`. */
  preSec: number;
  segment: Float32Array;
  sampleRate: number;
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
  private analyser: AnalyserNode | null = null;
  private analyserBuf: Float32Array<ArrayBuffer> | null = null;
  private lastOnsetAt = -Infinity;
  private profiles: Profiles | undefined;
  private onVisibility = () => this.handleVisibility();

  constructor(options: AudioInputOptions = {}) {
    // Prefer an explicit profiles override; fall back to the saved
    // calibration (if any) so the classifier is personalised by default.
    this.profiles = options.profiles ?? getActiveProfiles()?.profiles;
  }

  get isRunning(): boolean {
    return this.context?.state === 'running';
  }

  /** Shared AudioContext — exposed so siblings (e.g. Metronome) can piggy-back
   *  on the same clock and audio graph. Callers must not close it. */
  get audioContext(): AudioContext | null {
    return this.context;
  }

  /** Must be called from a user gesture (tap / click / key). */
  async start(): Promise<void> {
    if (this.isRunning) return;

    // The AudioBus is a module-level singleton; its recentNotes buffer
    // would otherwise carry over notes whose timestamps belong to the
    // *previous* AudioContext's clock and plot at random angles inside
    // the new cycle.
    audioBus.clearRecentNotes();

    // Browsers only expose navigator.mediaDevices on secure origins
    // (HTTPS or localhost). On HTTP / LAN IP, the property itself is
    // undefined — calling getUserMedia on it would throw a useless
    // 'Cannot read properties of undefined' error. Detect that case
    // and surface a precise message the UI can show.
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const insecure = typeof window !== 'undefined' && !window.isSecureContext;
      throw new Error(
        insecure
          ? 'Microphone access requires a secure origin (HTTPS). Open the site over HTTPS — current page is HTTP.'
          : 'This browser does not expose getUserMedia. Try a recent Chrome, Edge, or Safari.',
      );
    }

    // Honour the user's saved mic preference. Fall back to the system
    // default if the saved device is gone (e.g. unplugged headset) —
    // catching OverconstrainedError / NotFoundError keeps the worklet
    // working instead of erroring the whole session.
    const baseAudio: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    const savedId = getMicDeviceId();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: savedId ? { ...baseAudio, deviceId: { exact: savedId } } : baseAudio,
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (savedId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
        // Saved device disappeared — clear the stale preference and
        // retry with the OS default so the user isn't stuck.
        setMicDeviceId(null);
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: baseAudio });
      } else {
        throw err;
      }
    }

    this.context = new AudioContext({ latencyHint: 'interactive' });
    await this.context.audioWorklet.addModule(workletUrl);

    const source = this.context.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.context, 'onset-processor');
    this.workletNode.port.onmessage = (ev: MessageEvent<OnsetMessage>) => {
      const msg = ev.data;
      if (msg.type === 'onsetQuick') {
        this.handleOnset(msg);
      } else if (msg.type === 'onsetFull' && audioBus.hasRawListeners()) {
        // Only ship the full segment when something is listening — keeps
        // the per-frame transfer cost zero during ordinary practice.
        audioBus.pushRawCapture({
          kind: 'full',
          timestamp: msg.timestamp,
          preSec: msg.preSec,
          segment: msg.segment,
          sampleRate: msg.sampleRate,
          rms: msg.rms,
        });
      }
    };
    source.connect(this.workletNode);
    // Worklet doesn't need to reach the destination — we only want its
    // messages. Connecting to destination would route mic to speakers.

    // Parallel analyser used by Calibrate's level meter. Cheap; doesn't
    // route audio anywhere, just exposes a recent-time-domain view.
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyserBuf = new Float32Array(this.analyser.fftSize);
    source.connect(this.analyser);

    if (this.context.state === 'suspended') await this.context.resume();

    document.addEventListener('visibilitychange', this.onVisibility);
    audioBus.emit({ type: 'started' });
  }

  /**
   * Keyboard mode — create the AudioContext (so .now() returns a real
   * monotonic clock) but skip mic permission and the worklet. Only
   * inject()-driven notes reach audioBus. Useful for demos, testing
   * without a berimbau, and phones that don't have the mic gesture.
   */
  async startKeyboardMode(): Promise<void> {
    if (this.isRunning) return;
    audioBus.clearRecentNotes();
    this.context = new AudioContext({ latencyHint: 'interactive' });
    if (this.context.state === 'suspended') await this.context.resume();
    document.addEventListener('visibilitychange', this.onVisibility);
    audioBus.emit({ type: 'started' });
  }

  /**
   * Push a synthetic note onto audioBus as if the user had played it. The
   * timestamp is the current audio clock (so scoring matches whichever
   * beat is at the hit line) and f0 / centroid are pulled from the active
   * profiles so the note fields look realistic for any downstream display.
   */
  inject(sound: ClassifiableSound): DetectedNote {
    const prof = (this.profiles ?? DEFAULT_PROFILES)[sound];
    const note: DetectedNote = {
      timestamp: this.now(),
      soundClass: sound,
      confidence: 1,
      f0: prof.f0Mean,
      centroid: prof.centroidMean,
      amplitude: 0.8,
    };
    audioBus.pushNote(note);
    return note;
  }

  async stop(): Promise<void> {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.workletNode?.disconnect();
    this.workletNode = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.analyserBuf = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    audioBus.emit({ type: 'stopped' });
  }

  /**
   * Snapshot RMS of the most recent ~22 ms (1024 samples at 48 kHz) of
   * mic input. Returns 0 when no analyser is attached (keyboard mode,
   * stopped, or pre-start). Cheap enough to call every animation frame.
   */
  getLevel(): number {
    if (!this.analyser || !this.analyserBuf) return 0;
    this.analyser.getFloatTimeDomainData(this.analyserBuf);
    let sum = 0;
    for (let i = 0; i < this.analyserBuf.length; i++) {
      const v = this.analyserBuf[i]!;
      sum += v * v;
    }
    return Math.sqrt(sum / this.analyserBuf.length);
  }

  setProfiles(profiles: Profiles | undefined): void {
    this.profiles = profiles;
  }

  /** Seconds since the AudioContext was created. Shared clock for scoring. */
  now(): number {
    return this.context?.currentTime ?? performance.now() / 1000;
  }

  private handleOnset(msg: OnsetMessage): void {
    const features = extractFeatures(msg.segment, msg.sampleRate);
    const classification = classify(features.f0, features.centroid, this.profiles);

    const bleed = msg.timestamp - this.lastOnsetAt < BLEED_GAP_SEC;
    this.lastOnsetAt = msg.timestamp;

    // Forward the quick segment so Calibrate gets a thumbnail ~3× sooner
    // than waiting for the full window. Gated on listeners so Practice
    // doesn't pay for the extra fan-out.
    if (audioBus.hasRawListeners()) {
      audioBus.pushRawCapture({
        kind: 'quick',
        timestamp: msg.timestamp,
        preSec: msg.preSec,
        segment: msg.segment,
        sampleRate: msg.sampleRate,
        rms: msg.rms,
      });
    }

    const note: DetectedNote = {
      timestamp: msg.timestamp,
      soundClass: classification.sound,
      confidence: classification.confidence,
      f0: features.f0,
      centroid: features.centroid,
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
