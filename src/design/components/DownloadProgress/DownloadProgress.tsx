import React, { useState, useEffect } from 'react';
import { Download, CheckCircle2, CloudDownload, ChevronDown, ChevronUp } from 'lucide-react';
import { useDownloadProgress } from '../../../logic/hooks/useDownloadProgress';
import styles from './DownloadProgress.module.scss';

interface DownloadProgressProps {
  isInstallVisible?: boolean;
}

export const DownloadProgress: React.FC<DownloadProgressProps> = ({ isInstallVisible = false }) => {
  const { cachedAudioCount, totalAudioCount, percent, isDownloading, isComplete, currentFile, isSupported } = useDownloadProgress();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
    };

    mediaQuery.addEventListener('change', handleMediaChange);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Only show offline cache indicator if the app is installed in standalone mode
  if (!isInstalled || !isSupported) return null;

  return (
    <div
      className={`${styles.container} ${isInstallVisible ? styles.stackedAbove : styles.bottomAligned} ${isComplete ? styles.isComplete : styles.isActive}`}
      onClick={() => setIsExpanded(prev => !prev)}
      role="status"
      aria-label="Offline audio download progress"
    >
      <div className={styles.headerRow}>
        <div className={styles.iconWrapper}>
          {isComplete ? (
            <CheckCircle2 size={18} className={styles.completeIcon} />
          ) : isDownloading ? (
            <CloudDownload size={18} className={styles.downloadingIcon} />
          ) : (
            <Download size={18} className={styles.idleIcon} />
          )}
        </div>

        <div className={styles.textDetails}>
          <div className={styles.titleRow}>
            <span className={styles.statusLabel}>
              {isComplete ? 'Offline Ready' : isDownloading ? 'Downloading Songs' : 'Offline Cache'}
            </span>
            <span className={styles.percentageBadge}>{percent}%</span>
          </div>

          <div className={styles.subtextRow}>
            <span>{cachedAudioCount} / {totalAudioCount} songs</span>
          </div>
        </div>

        <button
          className={styles.toggleBtn}
          type="button"
          aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(prev => !prev);
          }}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {/* Progress Bar */}
      <div className={styles.progressBarBg}>
        <div
          className={`${styles.progressBarFill} ${isComplete ? styles.completeFill : ''}`}
          style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
        />
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className={styles.expandedContent}>
          {currentFile && isDownloading && (
            <div className={styles.currentFileText}>
              <span>Now:</span> {currentFile}
            </div>
          )}
          <p className={styles.explanation}>
            {isComplete
              ? 'All songs and audio are cached on this device for full offline playback!'
              : 'Songs are automatically downloading in the background so you can sing without internet.'}
          </p>
        </div>
      )}
    </div>
  );
};
