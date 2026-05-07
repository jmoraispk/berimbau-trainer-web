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

export type OnsetParamKey =
  | 'minGapSec'
  | 'absFloor'
  | 'ratio'
  | 'baselineTauSec'
  | 'minSustainSec';

export interface AudioInputOptions {
  /** Override the calibration profiles fed to the classifier. */
  profiles?: Profiles;
}

export class AudioInput {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  /** Mic source node — exposed as a field so playClip() can swap it
   *  out for a BufferSource and put it back when playback ends. */
  private micSource: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private clipResolver: ((clip: { samples: Float32Array; sampleRate: number }) => void) | null = null;
  private analyserBuf: Float32Array<ArrayBuffer> | null = null;
  private spectrumBuf: Float32Array<ArrayBuffer> | null = null;
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
    this.micSource = source;
    this.workletNode = new AudioWorkletNode(this.context, 'onset-processor');
    this.workletNode.port.onmessage = (ev: MessageEvent) => {
      const msg = ev.data;
      if (msg?.type === 'onsetQuick') {
        this.handleOnset(msg);
      } else if (msg?.type === 'onsetFull' && audioBus.hasRawListeners()) {
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
      } else if (msg?.type === 'clip' && this.clipResolver) {
        const cb = this.clipResolver;
        this.clipResolver = null;
        cb({ samples: msg.samples as Float32Array, sampleRate: msg.sampleRate as number });
      }
    };
    source.connect(this.workletNode);
    // Worklet doesn't need to reach the destination — we only want its
    // messages. Connecting to destination would route mic to speakers.

    // Parallel analyser used by Calibrate's level meter. Cheap; doesn't
    // route audio anywhere, just exposes a recent-time-domain view.
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyserBuf = new Float32Array(this.analyser.fftSize);
    this.spectrumBuf = new Float32Array(this.analyser.frequencyBinCount);
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
    this.micSource?.disconnect();
    this.micSource = null;
    this.clipResolver = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.analyserBuf = null;
    this.spectrumBuf = null;
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

  /**
   * Snapshot the analyser's frequency-domain bins (dBFS per bin). Returns
   * null when the analyser isn't attached. Used by the /lab dev surface
   * to render a live spectrum at ~30 fps.
   */
  getSpectrum(): Float32Array | null {
    if (!this.analyser || !this.spectrumBuf) return null;
    this.analyser.getFloatFrequencyData(this.spectrumBuf);
    return this.spectrumBuf;
  }

  /** Sample rate the AudioContext is running at. Worklet shares this. */
  getSampleRate(): number {
    return this.context?.sampleRate ?? 0;
  }

  /** Current FFT size on the analyser node. */
  getFftSize(): number {
    return this.analyser?.fftSize ?? 0;
  }

  /**
   * Resize the analyser's FFT window. Valid sizes are powers of two
   * 32–32768; the browser throws on anything else. Buffers are re-
   * allocated to match. No-op when the analyser isn't running.
   */
  setFftSize(size: number): void {
    if (!this.analyser) return;
    this.analyser.fftSize = size;
    this.analyserBuf = new Float32Array(this.analyser.fftSize);
    this.spectrumBuf = new Float32Array(this.analyser.frequencyBinCount);
  }

  /**
   * Update one of the worklet's onset-detection parameters. The
   * worklet's port handler validates the key and ignores anything it
   * doesn't recognise, so an unknown key is a silent no-op.
   *
   * Supported keys: 'minGapSec' | 'absFloor' | 'ratio' | 'baselineTauSec'.
   */
  setOnsetParam(key: OnsetParamKey, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setParam', key, value });
  }

  /** Reset every tunable onset param back to its module default. */
  resetOnsetParams(): void {
    this.workletNode?.port.postMessage({ type: 'reset' });
  }

  /**
   * Capture `durationSec` of raw mic audio via the worklet and resolve
   * with the resulting Float32Array + sampleRate. The recording is
   * exactly what the worklet sees on its input — no filtering, no
   * onset gating. Concurrent recordings are not supported; the second
   * call rejects until the first resolves or `cancelRecording()` runs.
   */
  recordClip(durationSec: number): Promise<{ samples: Float32Array; sampleRate: number }> {
    if (!this.workletNode || !this.context) {
      return Promise.reject(new Error('Mic not running'));
    }
    if (this.clipResolver) {
      return Promise.reject(new Error('Already recording'));
    }
    const samples = Math.ceil(durationSec * this.context.sampleRate);
    return new Promise((resolve) => {
      this.clipResolver = resolve;
      this.workletNode!.port.postMessage({ type: 'startRecord', samples });
    });
  }

  /** Abort an in-flight recording without waiting for the duration. */
  cancelRecording(): void {
    if (!this.clipResolver) return;
    this.workletNode?.port.postMessage({ type: 'stopRecord' });
    this.clipResolver = null;
  }

  /**
   * Play a recorded clip through the same onset pipeline the mic
   * normally feeds. Disconnects the mic source from the worklet for
   * the duration of the clip, then reconnects on `ended`. Captures
   * fired by the playback flow into audioBus exactly as if the user
   * had played the audio live.
   */
  playClip(samples: Float32Array, sampleRate: number): Promise<void> {
    if (!this.context || !this.workletNode || !this.micSource) {
      return Promise.reject(new Error('Mic not running'));
    }
    const ctx = this.context;
    const worklet = this.workletNode;
    const mic = this.micSource;
    try {
      mic.disconnect(worklet);
    } catch {
      // Already disconnected — fine, we'll still play.
    }
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(worklet);
    return new Promise((resolve) => {
      src.onended = () => {
        try { src.disconnect(); } catch { /* fine */ }
        try { mic.connect(worklet); } catch { /* fine */ }
        resolve();
      };
      src.start();
    });
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
