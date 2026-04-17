/**
 * Audio feature extraction — pure DSP functions.
 *
 *   - autocorrF0: fundamental frequency via autocorrelation peak picking
 *   - spectralCentroid: "brightness" — FFT magnitude-weighted mean frequency
 *   - extractFeatures: returns both, plus an RMS amplitude
 *
 * These run on the main thread after the AudioWorklet posts a segment around
 * a detected onset. Ported from AudioEngine._autocorr_f0 and
 * _extract_features in engine/audio_engine.py.
 */

export interface Features {
  f0: number;
  centroid: number;
  rms: number;
}

/** Hanning window in place. */
function hann(buf: Float32Array): Float32Array {
  const n = buf.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    out[i] = buf[i]! * w;
  }
  return out;
}

export function rms(segment: Float32Array): number {
  if (segment.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < segment.length; i++) s += segment[i]! * segment[i]!;
  return Math.sqrt(s / segment.length);
}

/**
 * Estimate the fundamental via autocorrelation. Returns 0 if no plausible
 * peak is found (percussive / noisy input).
 */
export function autocorrF0(
  segment: Float32Array,
  sampleRate: number,
  fMin = 80,
  fMax = 1200,
): number {
  const n = segment.length;
  if (n < 64) return 0;

  const w = hann(segment);

  const lagMin = Math.max(1, Math.floor(sampleRate / fMax));
  const lagMax = Math.min(n - 1, Math.floor(sampleRate / fMin));
  if (lagMin >= lagMax) return 0;

  let bestLag = 0;
  let bestCorr = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let sum = 0;
    const limit = n - lag;
    for (let i = 0; i < limit; i++) sum += w[i]! * w[i + lag]!;
    if (sum > bestCorr) {
      bestCorr = sum;
      bestLag = lag;
    }
  }

  if (bestLag === 0 || bestCorr <= 0) return 0;
  return sampleRate / bestLag;
}

/**
 * Real FFT via radix-2 Cooley–Tukey. Pads to the next power of two.
 * Returns interleaved [re0, im0, re1, im1, ...] of length 2 * nfft.
 */
function fftReal(input: Float32Array): { re: Float32Array; im: Float32Array; nfft: number } {
  let nfft = 1;
  while (nfft < input.length) nfft *= 2;
  const re = new Float32Array(nfft);
  const im = new Float32Array(nfft);
  for (let i = 0; i < input.length; i++) re[i] = input[i]!;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < nfft; i++) {
    let bit = nfft >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  for (let size = 2; size <= nfft; size *= 2) {
    const half = size / 2;
    const angleStep = (-2 * Math.PI) / size;
    for (let start = 0; start < nfft; start += size) {
      for (let k = 0; k < half; k++) {
        const angle = angleStep * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const iEven = start + k;
        const iOdd = start + k + half;
        const tr = re[iOdd]! * wr - im[iOdd]! * wi;
        const ti = re[iOdd]! * wi + im[iOdd]! * wr;
        re[iOdd] = re[iEven]! - tr;
        im[iOdd] = im[iEven]! - ti;
        re[iEven] = re[iEven]! + tr;
        im[iEven] = im[iEven]! + ti;
      }
    }
  }

  return { re, im, nfft };
}

/**
 * Spectral centroid in Hz: magnitude-weighted mean frequency over
 * [0, sampleRate/2]. 0 if the signal is silent.
 */
export function spectralCentroid(segment: Float32Array, sampleRate: number): number {
  if (segment.length < 64) return 0;
  const windowed = hann(segment);
  const { re, im, nfft } = fftReal(windowed);
  const bins = nfft / 2;

  let magSum = 0;
  let freqMagSum = 0;
  for (let k = 0; k <= bins; k++) {
    const mag = Math.hypot(re[k]!, im[k]!);
    const freq = (k * sampleRate) / nfft;
    magSum += mag;
    freqMagSum += freq * mag;
  }
  return magSum > 0 ? freqMagSum / magSum : 0;
}

export function extractFeatures(segment: Float32Array, sampleRate: number): Features {
  return {
    f0: autocorrF0(segment, sampleRate),
    centroid: spectralCentroid(segment, sampleRate),
    rms: rms(segment),
  };
}
