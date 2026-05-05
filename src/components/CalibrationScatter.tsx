import { useRef, useState, type MouseEvent } from 'react';
import { SOUND_COLORS, SOUND_LABELS } from '@/engine/rhythms';
import type { ClassifiableSound } from '@/engine/profiles';
import type { CalibrationSample } from '@/engine/calibration';

/**
 * Feature-space scatter for the calibration review screen.
 *
 *   X = spectral centroid (Hz)
 *   Y = autocorrelation f0 (Hz)
 *
 * Symbols match the rest of the app:  × tch · ○ dong · ● ding.
 * Numbered axes, dashed grid, hover/click pick the nearest point
 * within ~20 px and play it back via the onPlay callback. Works the
 * same on touch — every tap is a "find-nearest + play" pass.
 *
 * No charting library: all SVG, ~200 lines, weighs nothing in the
 * bundle and matches the rest of the app's pixel-precise look.
 */

interface Props {
  samples: CalibrationSample[];
  onPlay?: (sample: CalibrationSample) => void;
}

const W = 480;
const H = 280;
const PAD = { top: 18, right: 18, bottom: 36, left: 46 };

const X_MIN = 0;
const X_MAX = 5000;
// Y goes up to 1200 — the upper bound of autocorrF0's search range —
// so non-pitched sounds like TCH (which the algorithm reports
// scattered between ~200–1200 Hz because it can't lock onto a real
// fundamental) stay on the chart instead of falling off the top.
const Y_MIN = 0;
const Y_MAX = 1200;
const X_TICKS = [0, 1000, 2000, 3000, 4000, 5000];
const Y_TICKS = [0, 200, 400, 600, 800, 1000, 1200];

const SOUNDS: ClassifiableSound[] = ['ch', 'dong', 'ding'];
const HOVER_RADIUS = 20;

const fx = (v: number) =>
  PAD.left + ((v - X_MIN) / (X_MAX - X_MIN)) * (W - PAD.left - PAD.right);
const fy = (v: number) =>
  H - PAD.bottom - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * (H - PAD.top - PAD.bottom);

export function CalibrationScatter({ samples, onPlay }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Translate a pointer event into the SVG's viewBox coordinate system,
  // then return the index of the closest sample within HOVER_RADIUS px
  // (or -1 if none).
  const nearest = (e: MouseEvent<SVGSVGElement>): number => {
    const svg = svgRef.current;
    if (!svg) return -1;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return -1;
    const local = pt.matrixTransform(ctm.inverse());
    let best = -1;
    let bestD2 = HOVER_RADIUS * HOVER_RADIUS;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      // Match the clamped coordinates the glyph actually rendered at,
      // so hover lands on edge-clamped outliers correctly.
      const cx = fx(Math.min(X_MAX, Math.max(X_MIN, s.centroid)));
      const cy = fy(Math.min(Y_MAX, Math.max(Y_MIN, s.f0)));
      const dx = local.x - cx;
      const dy = local.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    return best;
  };

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const i = nearest(e);
    setHoverIdx(i >= 0 ? i : null);
  };
  const onLeave = () => setHoverIdx(null);
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const i = nearest(e);
    if (i >= 0 && onPlay) onPlay(samples[i]!);
  };

  const hovered = hoverIdx != null ? samples[hoverIdx] : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="block w-full bg-bg-elev border border-border rounded-xl select-none"
      style={{ cursor: hovered ? 'pointer' : 'crosshair' }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {/* Dashed grid */}
      {X_TICKS.slice(1, -1).map((v) => (
        <line
          key={`gx${v}`}
          x1={fx(v)}
          x2={fx(v)}
          y1={PAD.top}
          y2={H - PAD.bottom}
          stroke="#1a2135"
          strokeDasharray="2 4"
        />
      ))}
      {Y_TICKS.slice(1, -1).map((v) => (
        <line
          key={`gy${v}`}
          x1={PAD.left}
          x2={W - PAD.right}
          y1={fy(v)}
          y2={fy(v)}
          stroke="#1a2135"
          strokeDasharray="2 4"
        />
      ))}

      {/* Axes */}
      <line
        x1={PAD.left}
        y1={H - PAD.bottom}
        x2={W - PAD.right}
        y2={H - PAD.bottom}
        stroke="#3a4566"
      />
      <line
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={H - PAD.bottom}
        stroke="#3a4566"
      />

      {/* X ticks + labels */}
      {X_TICKS.map((v) => (
        <g key={`xt${v}`}>
          <line
            x1={fx(v)}
            x2={fx(v)}
            y1={H - PAD.bottom}
            y2={H - PAD.bottom + 4}
            stroke="#3a4566"
          />
          <text
            x={fx(v)}
            y={H - PAD.bottom + 16}
            textAnchor="middle"
            fontSize="10"
            fill="#8a93b0"
            fontFamily="ui-monospace, monospace"
          >
            {v}
          </text>
        </g>
      ))}
      <text
        x={(PAD.left + W - PAD.right) / 2}
        y={H - 6}
        textAnchor="middle"
        fontSize="10"
        fill="#c9d0e3"
      >
        centroid (Hz)
      </text>

      {/* Y ticks + labels */}
      {Y_TICKS.map((v) => (
        <g key={`yt${v}`}>
          <line
            x1={PAD.left - 4}
            x2={PAD.left}
            y1={fy(v)}
            y2={fy(v)}
            stroke="#3a4566"
          />
          <text
            x={PAD.left - 8}
            y={fy(v) + 3}
            textAnchor="end"
            fontSize="10"
            fill="#8a93b0"
            fontFamily="ui-monospace, monospace"
          >
            {v}
          </text>
        </g>
      ))}
      <text
        x={12}
        y={(PAD.top + H - PAD.bottom) / 2}
        textAnchor="middle"
        fontSize="10"
        fill="#c9d0e3"
        transform={`rotate(-90, 12, ${(PAD.top + H - PAD.bottom) / 2})`}
      >
        f0 (Hz)
      </text>

      {/* Sample symbols. Clamp data to axis bounds so an outlier (e.g.
          a noisy TCH whose f0 estimate spikes outside 0–1200 Hz) still
          shows up at the edge instead of disappearing. */}
      {samples.map((s, i) => {
        const cx = fx(Math.min(X_MAX, Math.max(X_MIN, s.centroid)));
        const cy = fy(Math.min(Y_MAX, Math.max(Y_MIN, s.f0)));
        return (
          <Glyph
            key={s.at}
            sound={s.sound}
            x={cx}
            y={cy}
            size={i === hoverIdx ? 16 : 12}
            highlight={i === hoverIdx}
          />
        );
      })}

      {/* Legend top-right — uses the same Glyph so it doubles as a key */}
      <g transform={`translate(${W - PAD.right - 122}, ${PAD.top + 4})`}>
        <rect
          x={-6}
          y={-2}
          width={128}
          height={20}
          fill="#0e1424"
          stroke="#2a3556"
          rx={5}
        />
        {SOUNDS.map((sound, i) => (
          <g key={sound} transform={`translate(${i * 40 + 4}, 8)`}>
            <Glyph sound={sound} x={6} y={0} size={11} />
            <text
              x={14}
              y={3.5}
              fontSize="9"
              fill="#c9d0e3"
              fontFamily="ui-monospace, monospace"
            >
              {SOUND_LABELS[sound]}
            </text>
          </g>
        ))}
      </g>

      {/* Hover tooltip — SVG-native so it scales with the chart */}
      {hovered && <Tooltip sample={hovered} clickToPlay={!!onPlay} />}
    </svg>
  );
}

function Glyph({
  sound,
  x,
  y,
  size = 12,
  highlight = false,
}: {
  sound: ClassifiableSound;
  x: number;
  y: number;
  size?: number;
  highlight?: boolean;
}) {
  const color = SOUND_COLORS[sound];
  const r = size / 2;
  const stroke = highlight ? 2.4 : 1.7;
  if (sound === 'ch') {
    const k = r * 0.78;
    return (
      <g transform={`translate(${x}, ${y})`}>
        <line
          x1={-k}
          y1={-k}
          x2={k}
          y2={k}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <line
          x1={k}
          y1={-k}
          x2={-k}
          y2={k}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (sound === 'dong') {
    return (
      <circle
        cx={x}
        cy={y}
        r={r * 0.85}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
      />
    );
  }
  return <circle cx={x} cy={y} r={r * 0.85} fill={color} />;
}

function Tooltip({
  sample,
  clickToPlay,
}: {
  sample: CalibrationSample;
  clickToPlay: boolean;
}) {
  const x = fx(sample.centroid);
  const y = fy(sample.f0);
  const tipW = 132;
  const tipH = clickToPlay ? 46 : 32;
  // Flip the tooltip to the left if it would overflow the right edge.
  const flipX = x + 12 + tipW > W - 6;
  const tx = flipX ? x - 12 - tipW : x + 12;
  const ty = Math.max(PAD.top + 2, y - tipH - 4);
  return (
    <g transform={`translate(${tx}, ${ty})`} pointerEvents="none">
      <rect
        x={0}
        y={0}
        width={tipW}
        height={tipH}
        fill="#0e1424"
        stroke="#3a4566"
        rx={5}
      />
      <text
        x={8}
        y={13}
        fontSize="10"
        fill="#c9d0e3"
        fontFamily="ui-monospace, monospace"
      >
        {SOUND_LABELS[sample.sound]}
      </text>
      <text
        x={8}
        y={26}
        fontSize="9"
        fill="#8a93b0"
        fontFamily="ui-monospace, monospace"
      >
        f0 {sample.f0.toFixed(0)} · centroid {sample.centroid.toFixed(0)}
      </text>
      {clickToPlay && (
        <text
          x={8}
          y={39}
          fontSize="9"
          fill="#5a6480"
          fontFamily="ui-monospace, monospace"
        >
          click to play
        </text>
      )}
    </g>
  );
}
