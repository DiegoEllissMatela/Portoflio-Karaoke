import { useEffect, useState } from 'react';
import styles from './InstallPrompt.module.scss';

type Platform = 'android' | 'desktop' | 'other';

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/windows|macintosh|linux/.test(ua) && !/mobile|android/.test(ua)) return 'desktop';
  return 'other';
}

/**
 * Cross-platform install prompt.
 * - Android Chrome: Shows native install prompt via beforeinstallprompt OR manual instructions
 * - Desktop Chrome/Edge: Uses beforeinstallprompt
 * - Always shows an accessible "Install App" button regardless of beforeinstallprompt availability
 */
interface InstallPromptProps {
  onVisibilityChange?: (visible: boolean) => void;
}

export function InstallPrompt({ onVisibilityChange }: InstallPromptProps = {}) {
  // Never show PWA install prompt when running inside native Electron desktop app
  if (typeof window !== 'undefined' && (Boolean((window as any).desktop?.isElectron) || navigator.userAgent.includes('Electron'))) {
    return null;
  }

  const [isInstalled, setIsInstalled] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [platform] = useState<Platform>(detectPlatform);
  const [showFab, setShowFab] = useState(false);

  useEffect(() => {
    const isVisible = showFab && !isInstalled;
    onVisibilityChange?.(isVisible);
  }, [showFab, isInstalled, onVisibilityChange]);

  useEffect(() => {
    // Already running as installed PWA — hide everything
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Show the FAB after initial load
    const timer = setTimeout(() => setShowFab(true), 1500);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  if (isInstalled) return null;

  return (
    <>
      {/* Floating Install Button — disabled with Coming Soon notice */}
      {showFab && (
        <button
          id="pwa-install-fab"
          className={`${styles.fab} ${styles.fabDisabled}`}
          disabled
          title="App Installation Coming Soon"
          aria-label="App installation coming soon"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Install App (Coming Soon)</span>
        </button>
      )}

      {/* Manual Instructions Modal */}
      {showModal && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Install instructions">
          <div className={styles.modal}>
            <button
              className={styles.closeBtn}
              onClick={() => setShowModal(false)}
              aria-label="Close"
            >✕</button>

            <div className={styles.modalIcon}>
              <img src="/icons/icon-192.png" alt="Karaoke app icon" />
            </div>

            <h2 className={styles.modalTitle}>Install Automate Karaoke</h2>
            <p className={styles.modalSubtitle}>Add to your home screen for offline use &amp; full-screen mode</p>

            {platform === 'android' && (
              <div className={styles.steps}>
                <div className={styles.stepItem}>
                  <span className={styles.stepNum}>1</span>
                  <span>Open this page in <strong>Chrome</strong> on your Android device</span>
                </div>
                <div className={styles.stepItem}>
                  <span className={styles.stepNum}>2</span>
                  <span>Tap the <strong>⋮ menu</strong> (three dots) in the top-right corner</span>
                </div>
                <div className={styles.stepItem}>
                  <span className={styles.stepNum}>3</span>
                  <span>Tap <strong>"Add to Home Screen"</strong> or <strong>"Install App"</strong></span>
                </div>
                <div className={styles.stepItem}>
                  <span className={styles.stepNum}>4</span>
                  <span>Tap <strong>Install</strong> to confirm</span>
                </div>

                <div className={styles.httpsNote}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>
                    <strong>Note:</strong> Android Chrome requires the app to be served over <strong>HTTPS</strong>.
                    Once deployed to <strong>Vercel</strong> or any HTTPS host, the install option will appear automatically.
                  </span>
                </div>
              </div>
            )}

            {platform === 'desktop' && (
              <div className={styles.steps}>
                <div className={styles.stepItem}>
                  <span className={styles.stepNum}>1</span>
                  <span>Open this page in <strong>Chrome</strong> or <strong>Edge</strong></span>
                </div>
                <div className={styles.stepItem}>
                  <span className={styles.stepNum}>2</span>
                  <span>Look for the <strong>install icon ⊕</strong> in the address bar</span>
                </div>
                <div className={styles.stepItem}>
                  <span className={styles.stepNum}>3</span>
                  <span>Click it and select <strong>"Install"</strong></span>
                </div>
              </div>
            )}

            {platform === 'other' && (
              <div className={styles.steps}>
                <div className={styles.stepItem}>
                  <span className={styles.stepNum}>1</span>
                  <span>Open in <strong>Chrome</strong> on Android</span>
                </div>
                <div className={styles.stepItem}>
                  <span className={styles.stepNum}>2</span>
                  <span>Tap <strong>⋮ menu → Add to Home Screen</strong></span>
                </div>
              </div>
            )}

            <button
              id="close-install-modal-btn"
              className={styles.modalCloseBtn}
              onClick={() => setShowModal(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
