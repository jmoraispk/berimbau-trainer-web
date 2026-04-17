import { useEffect, useRef } from 'react';
import { Link } from 'wouter';

/**
 * Practice screen placeholder.
 *
 * The only goal today is to prove the canvas render loop runs at 60 fps
 * without React re-rendering per frame. The FPS counter is drawn onto
 * the canvas itself — no React state updates in the animation loop.
 */
export function Practice() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Hi-DPI backing store.
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

      // Background.
      ctx.fillStyle = '#0b0f1a';
      ctx.fillRect(0, 0, w, h);

      // Hit line (where beats will land).
      const hitX = Math.round(w * 0.25);
      ctx.strokeStyle = '#ff8a3d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hitX, 0);
      ctx.lineTo(hitX, h);
      ctx.stroke();

      // Moving marker — proves the frame loop is live.
      const x = hitX + ((t / 10) % (w - hitX - 40));
      ctx.fillStyle = '#64b4f0';
      ctx.beginPath();
      ctx.arc(x, h / 2, 10, 0, Math.PI * 2);
      ctx.fill();

      // FPS readout, drawn onto the canvas (no React re-render).
      ctx.fillStyle = '#8a93b0';
      ctx.font = '14px ui-monospace, Consolas, monospace';
      ctx.fillText(`fps ${fps}`, 12, 20);
      ctx.fillText('practice · placeholder', 12, 38);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <main className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" />
      <Link
        href="/"
        className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-bg-elev/80 backdrop-blur text-text-dim text-sm border border-border"
      >
        ← Back
      </Link>
    </main>
  );
}
