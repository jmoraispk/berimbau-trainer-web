/**
 * Onset-detection AudioWorklet (plain JS, served from public/ as-is).
 *
 * Two-message protocol per onset:
 *
 *   - 'onsetQuick' fires ~80ms after the strike. Includes 20ms pre + 80ms
 *     post-onset audio. The main thread classifies on this short window
 *     (attack + early sustain) so live scoring stays responsive.
 *
 *   - 'onsetFull' fires ~450ms after the same strike. Includes 50ms pre +
 *     450ms post-onset audio. Used by Calibrate for waveform thumbnails
 *     and playback. Practice mode ignores it.
 *
 * Both messages share the same `timestamp` (the onset moment), so the
 * main thread can correlate them if it ever needs to. Multiple captures
 * can be pending simultaneously — a fast tch_tch fires two onsets within
 * 200ms, both of which need to be reported.
 *
 * NOTE: Kept as plain .js (not .ts) in public/ so both Vite dev and prod
 * serve it verbatim. Vite's worker transform injects HMR client imports
 * that break inside the AudioWorklet's restricted global scope.
 */

// Default values for the tunable detection parameters. The worklet
// initialises its instance fields from these and accepts live updates
// via port messages of the shape { type: 'setParam', key, value }
// or { type: 'reset' } to restore the defaults. The Lab dev surface is
// the only consumer today.
const MIN_GAP_SEC = 0.08;
const ABS_FLOOR = 0.01;
const RATIO = 2.2;
const BASELINE_TAU_SEC = 0.5;
// Default 0 = off. When > 0, the worklet treats a threshold-crossing
// as a "candidate" and only confirms it as a real onset if RMS stays
// above ABS_FLOOR for this long. Rejects single-block clicks (mouse
// taps, knocks on the wood) without rejecting real strikes.
const MIN_SUSTAIN_SEC = 0;

// Quick capture: low-latency, used by Practice for live scoring AND for
// calibration's classifier window (so the profile measures exactly what
// Practice will see). 150 ms total = 20 ms pre + 130 ms post-onset —
// long enough for stable autocorrelation f0 across the whole berimbau
// range (80–250 Hz) and a meaningful spectral centroid.
const QUICK_PRE_SEC = 0.02;
const QUICK_POST_SEC = 0.13;
const QUICK_TOTAL_SEC = QUICK_PRE_SEC + QUICK_POST_SEC;

// Full capture: longer, used by Calibrate for thumbnails + playback.
const FULL_PRE_SEC = 0.05;
const FULL_POST_SEC = 0.45;
const FULL_TOTAL_SEC = FULL_PRE_SEC + FULL_POST_SEC;

// Ring sized to hold the longest-pending capture's full span plus a
// little headroom. 1 second is plenty.
const RING_SEC = 1.0;
const MAX_PENDING = 4;

class OnsetProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const ringSize = Math.max(Math.ceil(sampleRate * RING_SEC), 4096);
    this.ring = new Float32Array(ringSize);
    this.write = 0;
    this.filled = 0;
    this.baseline = 0;
    this.lastOnsetT = -Infinity;
    /** @type {Array<{kind:'quick'|'full', onsetTime:number, sampleCount:number, samplesNeeded:number, rms:number, baseline:number}>} */
    this.pending = [];

    // Tunable params — initialised from the module defaults, override
    // via port messages from the main thread (Lab dev surface).
    this.minGapSec = MIN_GAP_SEC;
    this.absFloor = ABS_FLOOR;
    this.ratio = RATIO;
    this.baselineTauSec = BASELINE_TAU_SEC;
    this.minSustainSec = MIN_SUSTAIN_SEC;
    /**
     * @type {{onsetTime:number, rms:number, baseline:number} | null}
     * Holds a candidate onset while we wait for it to sustain. null
     * when no candidate is pending (the common case once minSustainSec=0).
     */
    this.pendingOnset = null;
    this.recomputeAlpha();

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'setParam') {
        const v = +msg.value;
        if (!Number.isFinite(v)) return;
        switch (msg.key) {
          case 'minGapSec':       this.minGapSec = v; break;
          case 'absFloor':        this.absFloor = v; break;
          case 'ratio':           this.ratio = v; break;
          case 'baselineTauSec':  this.baselineTauSec = v; this.recomputeAlpha(); break;
          case 'minSustainSec':   this.minSustainSec = v; break;
        }
      } else if (msg.type === 'reset') {
        this.minGapSec = MIN_GAP_SEC;
        this.absFloor = ABS_FLOOR;
        this.ratio = RATIO;
        this.baselineTauSec = BASELINE_TAU_SEC;
        this.minSustainSec = MIN_SUSTAIN_SEC;
        this.recomputeAlpha();
      }
    };
  }

  recomputeAlpha() {
    const blockDt = 128 / sampleRate;
    this.emaAlpha = 1 - Math.exp(-blockDt / this.baselineTauSec);
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

    // Tick every pending capture; ship and remove ones whose post-onset
    // window has elapsed.
    if (this.pending.length > 0) {
      const next = [];
      for (const p of this.pending) {
        p.sampleCount += channel.length;
        if (p.sampleCount >= p.samplesNeeded) {
          this.shipCapture(p);
        } else {
          next.push(p);
        }
      }
      this.pending = next;
    }

    // Block RMS + baseline.
    let s = 0;
    for (let i = 0; i < channel.length; i++) s += channel[i] * channel[i];
    const blockRms = Math.sqrt(s / channel.length);

    if (this.baseline === 0) this.baseline = blockRms;
    else this.baseline += this.emaAlpha * (blockRms - this.baseline);

    // Sustain check: while a candidate onset is pending, watch its
    // RMS evolve. If the block drops below the absolute floor, the
    // sound was a click — drop the candidate. If we've sustained for
    // ≥ minSustainSec, promote it to a real onset and ship captures
    // backdated to the original threshold-cross moment.
    if (this.pendingOnset) {
      if (blockRms < this.absFloor) {
        this.pendingOnset = null;
      } else {
        const elapsed = currentTime - this.pendingOnset.onsetTime;
        if (elapsed >= this.minSustainSec) {
          this.confirmOnset(this.pendingOnset, elapsed);
          this.pendingOnset = null;
        }
      }
      return true; // skip new-onset detection while still evaluating the candidate
    }

    // Onset detection.
    if (blockRms < this.absFloor) return true;
    if (blockRms < this.baseline * this.ratio) return true;
    if (currentTime - this.lastOnsetT < this.minGapSec) return true;
    if (this.pending.length >= MAX_PENDING * 2) return true; // safety valve

    if (this.minSustainSec > 0) {
      // Defer the actual onset until the candidate sustains. This
      // doesn't ship anything yet — confirmOnset() does that.
      this.pendingOnset = { onsetTime: currentTime, rms: blockRms, baseline: this.baseline };
    } else {
      this.confirmOnset({ onsetTime: currentTime, rms: blockRms, baseline: this.baseline }, 0);
    }

    return true;
  }

  /**
   * Promote a candidate onset to a real one: lock in lastOnsetT and
   * push the quick + full pending captures. `elapsed` is how long the
   * sustain check ran for; it pre-credits the capture's sampleCount
   * so the eventual segment ends `samplesNeeded` after the original
   * onsetTime, not after the confirmation. Without this offset the
   * post-roll would be shifted by `elapsed` and cut off the attack.
   */
  confirmOnset(cand, elapsed) {
    this.lastOnsetT = cand.onsetTime;
    const elapsedSamples = Math.max(0, Math.floor(elapsed * sampleRate));
    this.pending.push({
      kind: 'quick',
      onsetTime: cand.onsetTime,
      sampleCount: elapsedSamples,
      samplesNeeded: Math.ceil(QUICK_POST_SEC * sampleRate),
      rms: cand.rms,
      baseline: cand.baseline,
    });
    this.pending.push({
      kind: 'full',
      onsetTime: cand.onsetTime,
      sampleCount: elapsedSamples,
      samplesNeeded: Math.ceil(FULL_POST_SEC * sampleRate),
      rms: cand.rms,
      baseline: cand.baseline,
    });
  }

  shipCapture(p) {
    const totalSec = p.kind === 'quick' ? QUICK_TOTAL_SEC : FULL_TOTAL_SEC;
    const preSec = p.kind === 'quick' ? QUICK_PRE_SEC : FULL_PRE_SEC;
    const segLen = Math.min(Math.ceil(sampleRate * totalSec), this.filled);
    const segment = new Float32Array(segLen);
    const ring = this.ring;
    const ringSize = ring.length;
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
        type: p.kind === 'quick' ? 'onsetQuick' : 'onsetFull',
        timestamp: p.onsetTime,
        preSec,
        segment,
        sampleRate,
        rms: p.rms,
        baseline: p.baseline,
      },
      [segment.buffer],
    );
  }
}

registerProcessor('onset-processor', OnsetProcessor);
