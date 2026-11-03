import React, { useEffect, useState, useRef } from 'react';
import { Mic, Terminal, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import styles from './LoadingScreen.module.scss';

interface LoadingScreenProps {
  progress: number;
  status: string;
  logs?: string[];
  isComplete: boolean;
  onFinished?: () => void;
  onEnterApp?: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  progress,
  status,
  logs = [],
  isComplete,
  onFinished,
  onEnterApp,
}) => {
  const [shouldRender, setShouldRender] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom as they arrive
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  // Track elapsed loading time to offer helpful feedback
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // When loading completes naturally
  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => {
        setIsFadingOut(true);
        const exitTimer = setTimeout(() => {
          setShouldRender(false);
          onFinished?.();
        }, 600);
        return () => clearTimeout(exitTimer);
      }, 450);

      return () => clearTimeout(timer);
    }
  }, [isComplete, onFinished]);

  const handleBypass = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      setShouldRender(false);
      if (onEnterApp) onEnterApp();
      if (onFinished) onFinished();
    }, 300);
  };

  if (!shouldRender) return null;

  return (
    <div
      className={`${styles.loadingOverlay} ${isFadingOut ? styles.fadeOut : ''}`}
      id="startup-loading-screen"
    >
      {/* Ambient background glows */}
      <div className={`${styles.ambientGlow} ${styles.glowCyan}`} />
      <div className={`${styles.ambientGlow} ${styles.glowPurple}`} />

      {/* Main glass card */}
      <div className={styles.cardContainer}>
        <div className={styles.iconWrapper}>
          <div className={styles.iconHalo} />
          <div className={styles.iconCircle}>
            <Mic size={38} className={styles.micIcon} />
          </div>
        </div>

        <div className={styles.titleArea}>
          <h1>Automate Karaoke</h1>
          <p>Studio Edition</p>
        </div>

        {/* Dynamic Equalizer Bars */}
        <div className={styles.equalizer} aria-hidden="true">
          <div className={styles.bar} />
          <div className={styles.bar} />
          <div className={styles.bar} />
          <div className={styles.bar} />
          <div className={styles.bar} />
          <div className={styles.bar} />
          <div className={styles.bar} />
          <div className={styles.bar} />
        </div>

        {/* Real-time Progress track */}
        <div className={styles.progressSection}>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressBar}
              style={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
            />
          </div>

          <div className={styles.statusRow}>
            <span className={styles.statusText}>{status || 'Loading songs...'}</span>
            <span className={styles.statusPercent}>{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Direct "Enter App Now" Button (Background Loading) */}
        <div className={styles.actionContainer}>
          <button
            type="button"
            className={styles.enterAppBtn}
            onClick={handleBypass}
            title="Enter application immediately while songs finish loading in background"
          >
            <span>Enter App Now</span>
            <ArrowRight size={18} />
          </button>
        </div>

        <span className={styles.subtip}>
          {elapsedSeconds > 3 ? (
            <span className={styles.quickTip}>
              ⚡ You can click <strong>Enter App Now</strong> to start immediately while 48,000+ tracks load in the background.
            </span>
          ) : (
            'Indexing 48,000+ songs in high-speed local memory'
          )}
        </span>

        {/* Live Background Activity Logs Toggle */}
        <button
          type="button"
          className={styles.logsToggleBtn}
          onClick={() => setShowLogs(prev => !prev)}
        >
          <Terminal size={14} />
          <span>{showLogs ? 'Hide Background Logs' : `Show Background Logs (${logs.length})`}</span>
          {showLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Collapsible Monospace Activity Console */}
        {showLogs && (
          <div className={styles.logsConsole}>
            <div className={styles.logsHeader}>
              <span>Diagnostics & Activity Stream</span>
              <span>{logs.length} events</span>
            </div>
            <div className={styles.logsBody}>
              {logs.length === 0 ? (
                <div className={styles.emptyLog}>Connecting to catalog service...</div>
              ) : (
                logs.map((line, idx) => (
                  <div key={idx} className={styles.logLine}>
                    {line}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
