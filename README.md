# Berimbau Pro — Web

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
pnpm install       # install deps + sets up pre-commit hooks
pnpm dev           # dev server with HMR
pnpm test          # vitest
pnpm build         # typecheck + production build
pnpm lint          # eslint full repo (CI runs eslint on changed files for PRs)
pnpm preview       # serve the built bundle
pnpm icons         # rasterize public/icon.svg → PNG manifest icons
```

A `pre-commit` hook runs `lint-staged` over staged `.ts`/`.tsx` files
(eslint --fix). CI runs `tsc -b` + `vitest` + `vite build` on every
push and PR.

## Environment variables

Copy `.env.example` → `.env` and fill in the values you want. The app
runs offline-only without any of them; cloud features light up once
the corresponding pair is set.

| Var | Required for | Where it comes from |
|---|---|---|
| `VITE_SUPABASE_URL` | Auth + leaderboard + sync + delete account | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | (same) | Supabase → Project Settings → API |
| `VITE_SENTRY_DSN` | Browser error reporting | Sentry → project → SDK setup |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Subscriptions | Stripe → Developers → API keys |

The Supabase **anon** key is safe to ship in the browser — RLS
policies are what protect data. The Supabase **service** key (which
isn't here) must never reach the browser; it's only used by Edge
Functions and migrations from the Supabase CLI.

### One-time backend setup

1. Create a Supabase project (free tier, pick São Paulo or US-East).
2. Apply the schema (see "Migrations" below — either via the SQL
   editor or via the CLI).
3. Auth → Providers: enable email + Google (Google needs OAuth client
   id/secret from Google Cloud Console).
4. Copy the project URL + publishable / anon key into `.env.local`.

### Migrations

Schema lives in `supabase/migrations/*.sql` — one file per migration,
named `<timestamp>_<slug>.sql`. Three ways to apply them:

**A) SQL editor (one-shot)** — paste the file into Supabase → SQL
editor → Run. Fine for the first migration; doesn't update the
CLI's tracking table.

**B) Supabase CLI (local)** — recommended once you've done a
browser-SSO login. After `pnpm install` (which fetches the CLI
binary):

```bash
pnpm exec supabase login                 # browser SSO, one time
pnpm db:link                             # links to the project ref
# If you already applied the first migration via the SQL editor:
pnpm exec supabase migration repair --status applied 20260505000000
# Future migrations: just write the SQL file then
pnpm db:push
```

The convenience scripts live in `package.json`:

```
pnpm db:link    # supabase link --project-ref sihglhycaqwgjxiyaati
pnpm db:push    # apply pending migrations
pnpm db:diff    # generate a migration from current schema drift
pnpm db:reset   # nuke + re-apply (only run against staging!)
```

**C) GitHub Actions (auto on push)** — the
`.github/workflows/db-migrate.yml` workflow runs `supabase db push`
on every push to `main` that touches a file under
`supabase/migrations/`. Requires three repo secrets:

| Secret | From |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF` | the dashboard URL (e.g. `sihglhycaqwgjxiyaati`) |
| `SUPABASE_DB_PASSWORD` | Supabase → Settings → Database |

Set them at GitHub → repo Settings → Secrets and variables → Actions.
The workflow fails fast if any of them are missing, so it's safe to
commit the file before they're configured.

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
