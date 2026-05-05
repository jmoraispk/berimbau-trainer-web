import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { preloadActiveProfiles } from './audio/active-profiles';
import { I18nProvider } from './i18n';
import { RealRhythmProvider } from './settings/real-rhythm';
import { AuthProvider } from './cloud/auth';
import { initSentry } from './cloud/sentry';

void initSentry();

// Warm the calibration cache before the first mic-start so the classifier
// sees personal profiles on the very first hit rather than after a race.
void preloadActiveProfiles();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <RealRhythmProvider>
          <App />
        </RealRhythmProvider>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
);
