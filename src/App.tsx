import { Route, Switch } from 'wouter';
import { Home } from './routes/Home';
import { Practice } from './routes/Practice';
import { Calibrate } from './routes/Calibrate';

export function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/practice" component={Practice} />
      <Route path="/calibrate" component={Calibrate} />
      <Route>
        <div className="p-8 text-text-dim">Not found.</div>
      </Route>
    </Switch>
  );
}
