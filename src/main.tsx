import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { preloadActiveProfiles } from './audio/active-profiles';

// Warm the calibration cache before the first mic-start so the classifier
// sees personal profiles on the very first hit rather than after a race.
void preloadActiveProfiles();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
