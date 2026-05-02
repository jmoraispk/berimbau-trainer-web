import { SOUND_COLORS, type Sound } from '@/engine/rhythms';

/**
 * Three-glyph sound symbol used in the home sound-key chips, the pattern
 * preview, and (mirrored on canvas) the practice timeline:
 *
 *   ×  TCH  — chiado, the coin muting the string
 *   ○  DONG — open string
 *   ●  DING — closed string ("painted in the middle")
 */
export function SoundSymbol({ sound, size = 32 }: { sound: Sound; size?: number }) {
  const color = SOUND_COLORS[sound];
  const stroke = Math.max(2, size * 0.16);
  const r = size * 0.42;
  const c = size / 2;
  const filter = `drop-shadow(0 0 ${size * 0.6}px ${color}55)`;

  if (sound === 'ch') {
    const k = r * 0.78;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter }}>
        <line x1={c - k} y1={c - k} x2={c + k} y2={c + k} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        <line x1={c + k} y1={c - k} x2={c - k} y2={c + k} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      </svg>
    );
  }
  if (sound === 'dong') {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter }}>
        <circle cx={c} cy={c} r={r} stroke={color} strokeWidth={stroke} fill="none" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter }}>
      <circle cx={c} cy={c} r={r} fill={color} />
    </svg>
  );
}
