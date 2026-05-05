import * as Sentry from '@sentry/react';

/**
 * Sentry init helper. No-op if VITE_SENTRY_DSN is empty so dev builds
 * don't accidentally ship errors to a production project. Called once
 * from main.tsx before the app renders.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Modest sample rate; bump if you actually need traces.
    tracesSampleRate: 0.1,
    // No session replay by default — too heavy for an audio app.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
