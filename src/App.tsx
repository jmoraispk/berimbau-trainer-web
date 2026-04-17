import { lazy, Suspense } from 'react';
import { Route, Switch } from 'wouter';
import { Home } from './routes/Home';
import { Practice } from './routes/Practice';
import { Calibrate } from './routes/Calibrate';

// Songs is code-split — the 185-song catalog is ~150 KB, no reason to
// ship it in the initial bundle when only a subset of users will open it.
const Songs = lazy(() => import('./routes/Songs').then((m) => ({ default: m.Songs })));

export function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/practice" component={Practice} />
      <Route path="/calibrate" component={Calibrate} />
      <Route path="/songs">
        <Suspense fallback={<div className="p-8 text-text-dim">Loading songs…</div>}>
          <Songs />
        </Suspense>
      </Route>
      <Route>
        <div className="p-8 text-text-dim">Not found.</div>
      </Route>
    </Switch>
  );
}
