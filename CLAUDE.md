# Berimbau Pro — project notes for Claude

This file is for any future Claude session. Keep it terse and current.
Don't restate things obvious from `package.json` or the code; capture
context that would otherwise have to be re-discovered.

## What this is

Browser-only web app that listens to a berimbau through the mic and
scores rhythm accuracy in real time against a chosen toque. Local-first
(IndexedDB) for practice + calibration; cloud features (auth,
leaderboard, sync, payments) light up only when env vars are set.

Hosted at **berimbau.pro** on Vercel; auto-deploys from `main`.

## Stack — non-obvious bits

| Layer | Choice | Why |
|---|---|---|
| Routing | **wouter** | 1.5 KB vs React Router's 15 KB |
| Audio onset | **AudioWorklet** in `public/audio/onset-worklet.js` (plain JS, not bundled) | Vite's worker transform injects HMR client code that breaks the worklet's restricted globals. Keep it as raw JS. |
| Audio ↔ UI | `src/audio/AudioBus.ts` | Canvas reads `recentNotes` *imperatively* in its draw loop. React only subscribes to coarse events (`started` / `note` / `stopped`). Don't try to render audio frames through React. |
| State | Mostly local (`useState` / refs). i18n + auth + real-rhythm via Context | No Redux, no Zustand. Don't add one. |
| Cloud | Supabase (Postgres + Auth + Edge Functions + RLS) | Free tier covers far more than current scale |
| Errors | Sentry (`@sentry/browser`, lazy-loaded) | Tree-shaken to 0 KB without `VITE_SENTRY_DSN` |
| Analytics | Vercel Speed Insights | Web Vitals only; no cookies |

## Architecture — drawing the line

```
AudioWorklet (DSP) ──postMessage──▶ AudioInput ──▶ AudioBus ──▶ Canvas (60 fps, refs only)
                                                            └─▶ React (coarse events: started, note, stopped)
ScoringEngine reads from AudioBus.recentNotes inside the canvas loop.
```

Key invariant: **React never re-renders per audio frame.** If you find
yourself reaching for `useState` from inside the canvas tick, stop —
read a ref instead.

## Layout

```
src/
  audio/        AudioInput, AudioBus, Metronome, PlayAlong, mic-device
  cloud/        supabase client, auth context, sync, leaderboard, billing,
                account, sentry
  engine/       Pure DSP + scoring + scheduler + classifier (testable, no DOM)
  routes/       One file per page; Practice.tsx is the heaviest
  i18n/         messages.en.ts is source of truth; messages.pt.ts mirrors
  components/   PatternPreview, SoundSymbol, CalibrationScatter
  settings/     RealRhythmProvider, usePwaInstall, mic-device storage
supabase/
  migrations/   Timestamp-prefixed SQL. New ones go here; auto-applied
                via .github/workflows/db-migrate.yml on push to main
  functions/    Deno edge functions (validate-session, stripe-checkout,
                stripe-webhook, stripe-portal). Deployed via
                `pnpm exec supabase functions deploy <name>`.
public/
  audio/        onset-worklet.js (don't bundle)
  icon.svg      Source for both favicon + PWA icons
```

## Workflow — common commands

```bash
pnpm install     # adds the supabase native binary too (postinstall)
pnpm dev         # vite dev server with HMR
pnpm test        # vitest run
pnpm build       # tsc -b && vite build
pnpm lint        # eslint full repo

# DB
pnpm db:link     # supabase link --project-ref sihglhycaqwgjxiyaati
pnpm db:push     # apply pending migrations
pnpm db:diff     # generate a migration from drift
pnpm db:reset    # nuke + re-apply (staging only!)

# Edge functions
pnpm exec supabase functions deploy stripe-webhook --no-verify-jwt
pnpm exec supabase functions deploy stripe-checkout
pnpm exec supabase functions deploy stripe-portal
```

CI runs the build + lint + test on every push and PR. Lint diffs only
changed `.ts/.tsx` on PRs (full repo on `main`). Pre-commit hook
(`simple-git-hooks` + `lint-staged`) auto-`eslint --fix`es staged
`src/**/*.ts/.tsx`.

## Env vars — what lives where

| Var | Where | Public? |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env.local` + Vercel | Yes; ships in browser bundle, RLS protects data |
| `VITE_SENTRY_DSN` | same | Yes |
| `VITE_STRIPE_PUBLISHABLE_KEY` | same | Yes |
| `VITE_STRIPE_PRICE_MONTHLY` / `_ANNUAL` | same | Yes; Stripe Price IDs |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` | GitHub repo secrets only | No; used by `db-migrate.yml` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Supabase Edge Function secrets only | No; never paste into chat |
| `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`, `STRIPE_PORTAL_RETURN_URL` | Supabase Edge Function secrets | No |

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are
auto-injected into Edge Functions by Supabase — don't add manually.

**Rule:** any key prefixed `pk_`, `anon`, or "DSN" can land in `.env.local`
or chat. Anything `sk_`, `service`, or `whsec_` goes directly into the
relevant dashboard's secret store, never through chat.

## Quirks + gotchas

- **pnpm + `supabase` on Windows**: the npm package's postinstall
  downloads a platform binary; pnpm refuses to run postinstalls
  unless the package is on `pnpm.onlyBuiltDependencies`. Already
  configured. If a fresh clone fails, run `pnpm rebuild supabase`.
- **HTTPS for mic on phone**: `navigator.mediaDevices` only exists on
  secure origins. For phone testing during dev, use
  `tailscale serve --bg --https=443 5173` and visit the `*.ts.net`
  hostname (real LE cert). LAN IP over HTTP won't work.
- **PWA cache**: service worker caches aggressively. After deploys
  that change `public/icon.svg` or similar assets, expect a stale
  version on already-installed PWAs until users hard-refresh or
  reinstall. `registerType: 'autoUpdate'` handles most cases.
- **TCH samples in scatter**: TCH is broadband; autocorrelation gives
  scattered f0 across 80–1200 Hz. Y-axis goes to 1200 in
  `CalibrationScatter` for that reason. Don't shrink it.
- **Phantom notes**: `audioBus.recentNotes` is a singleton ring
  buffer; cleared at every `AudioInput.start()` so old session notes
  don't render in the new cycle. Don't remove that clear.
- **Strict React 19 hooks rules**: `set-state-in-effect`,
  `purity`, `immutability` are disabled in `eslint.config.js`. The
  rules are correct in spirit but flag intentional patterns here
  (auth state-from-async, today-key from `Date.now()`).

## Conventions

- **i18n**: every user-facing string goes through `t()`. Source of
  truth is `messages.en.ts` (`as const`). PT mirrors keys; values can
  diverge in phrasing (e.g. PT keeps "Criar conta", EN says "Register").
- **Types**: `MessageKey = keyof typeof en`. `TFn` is the render-time
  function. Pass `t: TFn` as a prop into subcomponents defined
  outside the parent function; don't call `useI18n()` inside leaf
  components defined out-of-tree.
- **Comments**: explain the *why*, not the *what*. Long comments at
  the top of a file are ok; per-line "increment counter" is not.
- **Commit messages**: short subject, then prose body explaining the
  change. Follow the existing style — see `git log`.
- **Releases**: `v<major>.<minor>` tags (e.g. `v0.2`). Changelog page
  at `/changelog` mirrors the GitHub Releases content. Bump
  `package.json` version to `<tag>.0` (semver requires 3 parts).

## Things deliberately not done

- **Scatter clustering / region overlays**: discussed; not built.
  Roadmap.
- **Latency calibration** (clap-along to measure system delay):
  discussed; would need its own UI flow. Roadmap.
- **Real audio playback in calibration**: we synth in `PlayAlong.ts`;
  saving the user's actual recorded samples per sound for play-along
  is on the wishlist but not done.
- **Bundle splitting Supabase client**: ~150 KB of the main bundle is
  Supabase. Could be lazy-loaded for cold-start speed. Not worth it
  yet.
- **Anonymous auth**: not enabled. Email + Google only.
- **Email confirmation**: currently OFF in Supabase auth settings
  for testing convenience. **Flip back ON before production launch.**

## When stuck

- Schema changes: write a new file in `supabase/migrations/`. CI
  applies on push (or `pnpm db:push` locally for faster feedback).
- Live-test auth: I (Claude) have a Node script pattern that uses
  `@supabase/supabase-js` with the publishable key to sign up a test
  user, insert a session, query the leaderboard. See conversation
  history for the exact form.
- Debug a stuck deploy: check Vercel → Deployments. Check that env
  vars are set for *all three* of Production / Preview / Development.
- Webhook not firing: Stripe → Webhooks → endpoint detail page →
  recent attempts. Look for non-200s. Most common: missing
  `--no-verify-jwt` on the deploy, or wrong `STRIPE_WEBHOOK_SECRET`.
