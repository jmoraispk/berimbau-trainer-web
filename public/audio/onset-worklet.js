/**
 * Onset-detection AudioWorklet (plain JS, served from public/ as-is).
 *
 * Runs on the audio thread with 128-sample quanta. Maintains a ring buffer
 * of recent audio. Per block:
 *
 *   1. Compute block RMS.
 *   2. Update a slow moving-average baseline (EMA).
 *   3. If block RMS > baseline * RATIO AND above an absolute floor AND
 *      past MIN_GAP_SEC since last onset: fire an onset, slice a ~150ms
 *      segment, postMessage it (with transfer) to the main thread.
 *
 * Feature extraction and classification run on the main thread so the
 * worklet stays small and the classifier can be swapped without reload.
 *
 * NOTE: Kept as plain .js (not .ts) in public/ so both Vite dev and prod
 * serve it verbatim. Vite's worker transform injects HMR client imports
 * that break inside the AudioWorklet's restricted global scope.
 */

const MIN_GAP_SEC = 0.08;
const ABS_FLOOR = 0.01;
const RATIO = 2.2;
const BASELINE_TAU_SEC = 0.5;
const SEGMENT_SEC = 0.15;
const PRE_SEC = 0.02;

class OnsetProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const ringSize = Math.max(Math.ceil(sampleRate * 0.4), 4096);
    this.ring = new Float32Array(ringSize);
    this.write = 0;
    this.filled = 0;
    this.baseline = 0;
    this.lastOnsetT = -Infinity;
    const blockDt = 128 / sampleRate;
    this.emaAlpha = 1 - Math.exp(-blockDt / BASELINE_TAU_SEC);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    const ring = this.ring;
    const ringSize = ring.length;
    for (let i = 0; i < channel.length; i++) {
      ring[this.write] = channel[i];
      this.write = (this.write + 1) % ringSize;
    }
    this.filled = Math.min(this.filled + channel.length, ringSize);

    let s = 0;
    for (let i = 0; i < channel.length; i++) s += channel[i] * channel[i];
    const blockRms = Math.sqrt(s / channel.length);

    if (this.baseline === 0) this.baseline = blockRms;
    else this.baseline += this.emaAlpha * (blockRms - this.baseline);

    if (blockRms < ABS_FLOOR) return true;
    if (blockRms < this.baseline * RATIO) return true;
    if (currentTime - this.lastOnsetT < MIN_GAP_SEC) return true;

    this.lastOnsetT = currentTime;

    const segLen = Math.min(Math.ceil(sampleRate * SEGMENT_SEC), this.filled);
    const segment = new Float32Array(segLen);
    const readStart = (this.write - segLen + ringSize) % ringSize;
    if (readStart + segLen <= ringSize) {
      segment.set(ring.subarray(readStart, readStart + segLen));
    } else {
      const firstPart = ringSize - readStart;
      segment.set(ring.subarray(readStart, ringSize), 0);
      segment.set(ring.subarray(0, segLen - firstPart), firstPart);
    }

    this.port.postMessage(
      {
        type: 'onset',
        timestamp: currentTime - PRE_SEC,
        segment,
        rms: blockRms,
        baseline: this.baseline,
      },
      [segment.buffer],
    );

    return true;
  }
}

registerProcessor('onset-processor', OnsetProcessor);
