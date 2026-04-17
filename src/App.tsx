import { Route, Switch } from 'wouter';
import { Home } from './routes/Home';
import { Practice } from './routes/Practice';

export function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/practice" component={Practice} />
      <Route>
        <div className="p-8 text-text-dim">Not found.</div>
      </Route>
    </Switch>
  );
}
