import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { preloadActiveProfiles } from './audio/active-profiles';
import { I18nProvider } from './i18n';
import { RealRhythmProvider } from './settings/real-rhythm';
import { AuthProvider } from './cloud/auth';
import { initSentry } from './cloud/sentry';
import { SpeedInsights } from '@vercel/speed-insights/react';

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
    {/* No-op outside of Vercel deploys; ~5 KB gzipped, async-loaded
        after first paint. Reports Core Web Vitals to the Speed
        Insights dashboard. */}
    <SpeedInsights />
  </StrictMode>,
);
