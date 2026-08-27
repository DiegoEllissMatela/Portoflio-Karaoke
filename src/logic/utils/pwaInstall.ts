/**
 * Triggers the native browser PWA installation dialog.
 * Returns true if installation was accepted, false otherwise.
 */
export async function triggerPwaInstall(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const promptEvent = (window as any).__deferredInstallPrompt;
  if (promptEvent && typeof promptEvent.prompt === 'function') {
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === 'accepted') {
        (window as any).__deferredInstallPrompt = null;
        return true;
      }
    } catch (err) {
      console.warn('[PWA] Native prompt trigger error:', err);
    }
  }
  return false;
}

export function isAppInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}
