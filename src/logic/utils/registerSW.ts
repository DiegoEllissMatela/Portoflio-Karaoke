/**
 * Registers the PWA Service Worker.
 * Call this once at app startup (main.tsx).
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service workers not supported in this browser.');
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      console.log('[SW] Registered. Scope:', registration.scope);

      // Check for updates every 60 seconds
      setInterval(() => {
        registration.update().catch(() => {
          // Silent fail when offline
        });
      }, 60_000);

      // Handle new SW waiting to activate
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            // A new version is available — notify app
            window.dispatchEvent(new CustomEvent('sw-update-available'));
            console.log('[SW] New version available.');
          }
        });
      });

      // When the SW takes control, reload to use new assets
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW] Controller changed — reloading for fresh assets.');
        window.location.reload();
      });
    } catch (error) {
      console.error('[SW] Registration failed:', error);
    }
  });
}

/**
 * Gets the current audio cache status from the service worker.
 * Returns { cachedAudioCount, totalAudioCount } or null if unavailable.
 */
export async function getAudioCacheStatus(): Promise<{
  cachedAudioCount: number;
  totalAudioCount: number;
} | null> {
  if (!navigator.serviceWorker?.controller) return null;

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      if (event.data?.type === 'CACHE_STATUS') {
        resolve({
          cachedAudioCount: event.data.cachedAudioCount,
          totalAudioCount: event.data.totalAudioCount,
        });
      }
    };
    navigator.serviceWorker.controller!.postMessage(
      { type: 'GET_CACHE_STATUS' },
      [channel.port2]
    );
    // Timeout after 2 seconds
    setTimeout(() => resolve(null), 2000);
  });
}
