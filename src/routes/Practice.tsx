import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { AudioInput } from '@/audio/AudioInput';
import { audioBus } from '@/audio/AudioBus';
import { SOUND_COLORS, SOUND_LABELS, type Sound } from '@/engine/rhythms';
import type { DetectedNote } from '@/engine/scoring';

/**
 * Practice screen — mic pipeline wired end-to-end.
 *
 * The canvas render loop reads recent notes directly from `audioBus`
 * (via ref, not state) so the audio pipeline never triggers React
 * re-renders. React only flips between "idle" and "running" modes.
 */
export function Practice() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<AudioInput | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: w, clientHeight: h } = canvas;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let lastT = performance.now();
    let frames = 0;
    let fps = 0;
    let fpsAccum = 0;

    const draw = (t: number) => {
      const dt = t - lastT;
      lastT = t;
      frames += 1;
      fpsAccum += dt;
      if (fpsAccum >= 500) {
        fps = Math.round((frames * 1000) / fpsAccum);
        frames = 0;
        fpsAccum = 0;
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      ctx.fillStyle = '#0b0f1a';
      ctx.fillRect(0, 0, w, h);

      const hitX = Math.round(w * 0.25);
      ctx.strokeStyle = '#ff8a3d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hitX, 0);
      ctx.lineTo(hitX, h);
      ctx.stroke();

      // Live detected notes — sweeping right across a 3-second window.
      const input = inputRef.current;
      const nowAudio = input ? input.now() : performance.now() / 1000;
      const sweepPxPerSec = (w - hitX) / 3;

      for (let i = audioBus.recentNotes.length - 1; i >= 0; i--) {
        const note = audioBus.recentNotes[i]!;
        const age = nowAudio - note.timestamp;
        if (age < 0 || age > 3) continue;
        const x = hitX + age * sweepPxPerSec;
        if (x > w + 20) continue;
        drawNote(ctx, note, x, h / 2);
      }

      ctx.fillStyle = '#8a93b0';
      ctx.font = '12px ui-monospace, Consolas, monospace';
      ctx.fillText(`fps ${fps}`, 12, 20);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      void inputRef.current?.stop();
      inputRef.current = null;
    };
  }, []);

  const handleStart = async () => {
    if (status === 'starting' || status === 'running') return;
    setStatus('starting');
    setErrorMsg(null);
    try {
      const input = new AudioInput();
      await input.start();
      inputRef.current = input;
      setStatus('running');
    } catch (err) {
      console.error('[Practice] mic start failed', err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  return (
    <main className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" />

      <Link
        href="/"
        className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-bg-elev/80 backdrop-blur text-text-dim text-sm border border-border"
      >
        ← Back
      </Link>

      {status !== 'running' && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-bg-elev border border-border max-w-sm">
            <h2 className="text-xl font-semibold">Tap to start the mic</h2>
            <p className="text-text-dim text-sm text-center">
              Play DONG, TCH, or DING into your microphone. Browsers require a
              tap before opening the mic, so nothing is listening yet.
            </p>
            <button
              type="button"
              onClick={handleStart}
              disabled={status === 'starting'}
              className="px-6 py-2 rounded-full bg-accent text-bg font-semibold disabled:opacity-60"
            >
              {status === 'starting' ? 'Starting…' : 'Start microphone'}
            </button>
            {errorMsg && (
              <p className="text-sm text-red-400 text-center">{errorMsg}</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function drawNote(ctx: CanvasRenderingContext2D, note: DetectedNote, x: number, y: number) {
  const sound = note.soundClass;
  const color = sound === 'unknown' ? '#8a93b0' : SOUND_COLORS[sound as Sound];
  const r = 6 + note.amplitude * 14;

  ctx.globalAlpha = note.isMistake ? 0.5 : 0.9;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (sound !== 'unknown') {
    ctx.fillStyle = '#0b0f1a';
    ctx.font = 'bold 11px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(SOUND_LABELS[sound as Sound], x, y);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}
