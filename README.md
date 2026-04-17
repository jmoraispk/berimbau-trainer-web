# Berimbau Trainer — Web

Rhythm-accuracy trainer for the berimbau (capoeira instrument), as an
installable PWA. This is **v2**, a ground-up TypeScript rewrite of the
[Python + Kivy v1](https://github.com/jmoraispk/berimbau-trainer).

## Stack

- **Vite + React 19 + TypeScript + Tailwind v4** for the shell
- **Canvas 2D** for the practice timeline (outside React's render tree)
- **Web Audio API + AudioWorklet** for mic capture and DSP
  (onset detection, autocorrelation f0, spectral centroid)
- **`idb`** for structured local state (calibration profiles, sessions)
- **`meyda`** for feature extraction (spectral centroid, MFCC, etc.)
- **PWA** via `vite-plugin-pwa` (installable, offline-capable)
- **`wouter`** for routing (1.5 KB), **`vitest`** for tests

### Audio ↔ UI boundary

```
AudioWorklet ──postMessage──▶ AudioBus ──▶ Canvas draw loop (via refs)
                                       └─▶ React (coarse events only)
```

The canvas render loop reads from `AudioBus` imperatively — React never
re-renders per audio frame. See [src/audio/AudioBus.ts](src/audio/AudioBus.ts).

## Scripts

```bash
pnpm install       # install deps
pnpm dev           # dev server with HMR
pnpm test          # vitest
pnpm build         # typecheck + production build
pnpm preview       # serve the built bundle
pnpm icons         # rasterize public/icon.svg → PNG manifest icons
```

## Layout

```
src/
  engine/          # pure logic — ported from v1 Python
    rhythms.ts     # 5 toque patterns
    scoring.ts     # beat matching + outcomes
    scoring.test.ts
    songs.ts       # Song types
  data/
    songs.json     # stub catalog (5 entries; full 185-song import TBD)
  audio/
    AudioBus.ts    # stub — audio ↔ UI boundary
  routes/
    Home.tsx
    Practice.tsx   # placeholder canvas (60 fps loop)
  App.tsx
  main.tsx
public/
  icon.svg         # source for rasterised icons
  icons/           # generated PNGs for PWA manifest
```
