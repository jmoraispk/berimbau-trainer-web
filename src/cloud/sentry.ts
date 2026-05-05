/**
 * Sentry init helper. Dynamically imports `@sentry/browser` only when
 * VITE_SENTRY_DSN is set so a build without the DSN ships zero Sentry
 * bytes. Called from main.tsx at app boot; the dynamic chunk loads in
 * parallel with the rest of the app and the first errors after boot
 * still get captured because Sentry's queue holds events until init.
 */
export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  const Sentry = await import('@sentry/browser');
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Modest sample rate; bump later if you actually need traces.
    tracesSampleRate: 0.1,
    // No session replay by default — too heavy for an audio app and
    // the privacy implications need a separate decision.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
