import { lazy, Suspense } from 'react';
import { Route, Switch } from 'wouter';
import { Home } from './routes/Home';
import { Practice } from './routes/Practice';
import { Calibrate } from './routes/Calibrate';
import { Settings } from './routes/Settings';
import { Stats } from './routes/Stats';
import { Classes } from './routes/Classes';
import { Class } from './routes/Class';
import { Roadmap } from './routes/Roadmap';
import { Changelog } from './routes/Changelog';
import { About } from './routes/About';
import { Leaderboard } from './routes/Leaderboard';
import { Auth } from './routes/Auth';
import { Profile } from './routes/Profile';
import { Privacy } from './routes/Privacy';
import { Terms } from './routes/Terms';
import { Subscribe } from './routes/Subscribe';

// Songs routes are code-split — the 185-song catalog is ~150 KB, no reason
// to ship it in the initial bundle when only a subset of users open it.
// Both /songs and /songs/:slug share the same chunk (both import songs.json).
const Songs = lazy(() => import('./routes/Songs').then((m) => ({ default: m.Songs })));
const SongDetail = lazy(() =>
  import('./routes/SongDetail').then((m) => ({ default: m.SongDetail })),
);

const SongsFallback = (
  <div className="p-8 text-text-dim">Loading songs…</div>
);

export function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/practice" component={Practice} />
      <Route path="/calibrate" component={Calibrate} />
      <Route path="/settings" component={Settings} />
      <Route path="/stats" component={Stats} />
      <Route path="/classes" component={Classes} />
      <Route path="/classes/:id">
        {(params) => <Class params={params as { id: string }} />}
      </Route>
      <Route path="/roadmap" component={Roadmap} />
      <Route path="/changelog" component={Changelog} />
      <Route path="/about" component={About} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/auth" component={Auth} />
      <Route path="/profile" component={Profile} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/subscribe" component={Subscribe} />
      <Route path="/songs">
        <Suspense fallback={SongsFallback}>
          <Songs />
        </Suspense>
      </Route>
      <Route path="/songs/:slug">
        {(params) => (
          <Suspense fallback={SongsFallback}>
            <SongDetail params={params} />
          </Suspense>
        )}
      </Route>
      <Route>
        <div className="p-8 text-text-dim">Not found.</div>
      </Route>
    </Switch>
  );
}
