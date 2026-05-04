import { useEffect, useState } from 'react';

/**
 * usePwaInstall — captures Chrome/Edge/Android's `beforeinstallprompt`
 * event so a custom button can trigger the install dialog. iOS Safari
 * doesn't expose any programmatic API; the caller falls back to
 * showing manual instructions for that case.
 *
 * Returned status:
 *   - already-installed: app is running in standalone mode, hide the
 *     install entry point entirely.
 *   - can-prompt: we have a deferred prompt event ready, show a
 *     "Install" button that calls prompt().
 *   - ios-manual: iOS Safari, no API — show the share-menu hint.
 *   - unavailable: desktop browsers without the prompt (e.g. Firefox,
 *     or a browser that already declined). Suggest reopening in a
 *     supported browser.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PwaInstallStatus =
  | 'already-installed'
  | 'can-prompt'
  | 'ios-manual'
  | 'unavailable';

export interface PwaInstall {
  status: PwaInstallStatus;
  /** Trigger the install dialog. No-op unless status is 'can-prompt'. */
  prompt: () => Promise<void>;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari uses navigator.standalone, not the media query.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function detectIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
}

export function usePwaInstall(): PwaInstall {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(detectStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Stop the browser's default install banner — we'll show our own.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const status: PwaInstallStatus = installed
    ? 'already-installed'
    : deferred
    ? 'can-prompt'
    : detectIos()
    ? 'ios-manual'
    : 'unavailable';

  const prompt = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setDeferred(null);
  };

  return { status, prompt };
}
