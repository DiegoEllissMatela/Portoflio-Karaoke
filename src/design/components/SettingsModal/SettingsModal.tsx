import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings, RefreshCw, Trash2, X, Check, Maximize2, Save, Power } from 'lucide-react';
import type { AppState } from '../../../logic/types/logicTypes';
import styles from './SettingsModal.module.scss';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshLyrics: () => Promise<void>;
  onResetSession: () => void;
  appState: AppState;
  onToggleAutoResume?: () => void;
  onToggleCountdown?: () => void;
  onUpdateMaxWidth?: (width: number) => void;
  onUpdateMaxHeight?: (height: number) => void;
  onUpdateDareBlanks?: (blanks: number) => void;
  onUpdateDareMinWordLength?: (min: number) => void;
  onUpdateDareMaxWordLength?: (max: number) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onRefreshLyrics,
  onResetSession,
  appState,
  onToggleAutoResume,
  onToggleCountdown,
  onUpdateMaxWidth,
  onUpdateMaxHeight,
  onUpdateDareBlanks,
  onUpdateDareMinWordLength,
  onUpdateDareMaxWordLength,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!isOpen) return null;

  const currentMaxWidth = appState.mainContentMaxWidth || 1400;
  const currentMaxHeight = appState.mainContentMaxHeight ?? 800;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshLyrics();
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (err) {
      console.error('Failed to refresh lyrics:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleReset = () => {
    if (confirmReset) {
      onResetSession();
      setConfirmReset(false);
      onClose();
    } else {
      setConfirmReset(true);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (onUpdateMaxWidth) onUpdateMaxWidth(val);
  };

  const handleStepWidth = (delta: number) => {
    const newWidth = Math.min(2400, Math.max(1000, currentMaxWidth + delta));
    if (onUpdateMaxWidth) onUpdateMaxWidth(newWidth);
  };

  const handleExitApp = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    window.close();
    setTimeout(() => {
      window.location.href = 'about:blank';
    }, 150);
  };

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>
            <Settings size={22} />
            Application Settings
          </h3>
          <button className={styles.closeBtn} onClick={onClose} title="Close Settings">
            <X size={20} />
          </button>
        </div>

        <div className={styles.settingsSection}>
          <h4 className={styles.sectionTitle}>Display & Layout</h4>

          <div className={styles.settingRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '14px' }}>
            <div className={styles.settingInfo} style={{ width: '100%' }}>
              <span className={styles.settingLabel} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Maximize2 size={18} />
                Game Container Max Width
              </span>
              <span className={styles.settingSubtext}>
                Adjust layout max width for larger screens and wide monitors.
              </span>
            </div>

            <div className={styles.widthControls}>
              <div className={styles.widthSliderRow}>
                <button
                  className={styles.stepperBtn}
                  onClick={() => handleStepWidth(-50)}
                  disabled={currentMaxWidth <= 1000}
                  title="Decrease Width (-50px)"
                >-</button>
                <input
                  type="range"
                  min="1000"
                  max="2400"
                  step="50"
                  value={currentMaxWidth}
                  onChange={handleSliderChange}
                  className={styles.widthSlider}
                />
                <button
                  className={styles.stepperBtn}
                  onClick={() => handleStepWidth(50)}
                  disabled={currentMaxWidth >= 2400}
                  title="Increase Width (+50px)"
                >+</button>
                <div className={styles.widthBadge}>{currentMaxWidth}px</div>
              </div>

              <div className={styles.presetGroup}>
                <button
                  className={`${styles.presetBtn} ${currentMaxWidth === 1200 ? styles.active : ''}`}
                  onClick={() => onUpdateMaxWidth && onUpdateMaxWidth(1200)}
                >1200px (Compact)</button>
                <button
                  className={`${styles.presetBtn} ${currentMaxWidth === 1400 ? styles.active : ''}`}
                  onClick={() => onUpdateMaxWidth && onUpdateMaxWidth(1400)}
                >1400px (Standard)</button>
                <button
                  className={`${styles.presetBtn} ${currentMaxWidth === 1800 ? styles.active : ''}`}
                  onClick={() => onUpdateMaxWidth && onUpdateMaxWidth(1800)}
                >1800px (Wide)</button>
                <button
                  className={`${styles.presetBtn} ${currentMaxWidth === 2400 ? styles.active : ''}`}
                  onClick={() => onUpdateMaxWidth && onUpdateMaxWidth(2400)}
                >2400px (Ultra-Wide)</button>
              </div>
            </div>
          </div>

          <div className={styles.settingRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '14px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div className={styles.settingInfo} style={{ width: '100%' }}>
              <span className={styles.settingLabel} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Maximize2 size={18} />
                Game Container Max Height
              </span>
              <span className={styles.settingSubtext}>
                Control how tall the side panels can grow before scrolling.
              </span>
            </div>

            <div className={styles.widthControls}>
              <div className={styles.widthSliderRow}>
                <button
                  className={styles.stepperBtn}
                  onClick={() => {
                    if (onUpdateMaxHeight) {
                      if (currentMaxHeight === 0) onUpdateMaxHeight(1200);
                      else if (currentMaxHeight > 700) onUpdateMaxHeight(currentMaxHeight - 50);
                      else if (currentMaxHeight === 700) onUpdateMaxHeight(0);
                    }
                  }}
                  disabled={currentMaxHeight === 0}
                  title="Decrease Height (-50px)"
                >-</button>
                <input
                  type="range"
                  min="650"
                  max="1200"
                  step="50"
                  value={currentMaxHeight === 0 ? 650 : currentMaxHeight}
                  onChange={(e) => {
                    if (onUpdateMaxHeight) {
                      const val = parseInt(e.target.value);
                      if (val <= 650) onUpdateMaxHeight(0);
                      else onUpdateMaxHeight(val);
                    }
                  }}
                  className={styles.widthSlider}
                />
                <button
                  className={styles.stepperBtn}
                  onClick={() => {
                    if (onUpdateMaxHeight) {
                      if (currentMaxHeight === 0) onUpdateMaxHeight(700);
                      else if (currentMaxHeight < 1200) onUpdateMaxHeight(currentMaxHeight + 50);
                    }
                  }}
                  disabled={currentMaxHeight >= 1200}
                  title="Increase Height (+50px)"
                >+</button>
                <div className={styles.widthBadge}>{currentMaxHeight === 0 ? 'Auto' : `${currentMaxHeight}px`}</div>
              </div>

              <div className={styles.presetGroup}>
                <button
                  className={`${styles.presetBtn} ${currentMaxHeight === 700 ? styles.active : ''}`}
                  onClick={() => onUpdateMaxHeight && onUpdateMaxHeight(700)}
                >700px (Compact)</button>
                <button
                  className={`${styles.presetBtn} ${currentMaxHeight === 800 ? styles.active : ''}`}
                  onClick={() => onUpdateMaxHeight && onUpdateMaxHeight(800)}
                >800px (Standard)</button>
                <button
                  className={`${styles.presetBtn} ${currentMaxHeight === 1000 ? styles.active : ''}`}
                  onClick={() => onUpdateMaxHeight && onUpdateMaxHeight(1000)}
                >1000px (Tall)</button>
                <button
                  className={`${styles.presetBtn} ${currentMaxHeight === 0 ? styles.active : ''}`}
                  onClick={() => onUpdateMaxHeight && onUpdateMaxHeight(0)}
                >Auto (Infinite)</button>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.settingsSection}>
          <h4 className={styles.sectionTitle}>Song & Lyric Management</h4>

          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.settingLabel}>Re-read Lyrics (.txt / .lrc)</span>
              <span className={styles.settingSubtext}>
                Refresh song lyric text files to reload updated timestamps, LRC offsets, and countdown timing without resetting active game scores.
              </span>
            </div>
            <button
              className={`${styles.actionBtn} ${styles.refreshBtn}`}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Lyrics'}
            </button>
          </div>
        </div>

        <div className={styles.settingsSection}>
          <h4 className={styles.sectionTitle}>Game Preferences</h4>

          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.settingLabel}>Auto-Resume Next Song</span>
              <span className={styles.settingSubtext}>Automatically proceed to next singer after dare timer expires.</span>
            </div>
            {onToggleAutoResume && (
              <div
                className={`${styles.toggleSwitch} ${appState.isAutoResumeEnabled ? styles.active : ''}`}
                onClick={onToggleAutoResume}
              >
                <div className={styles.toggleKnob} />
              </div>
            )}
          </div>

          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.settingLabel}>Show 3-2-1 Countdown</span>
              <span className={styles.settingSubtext}>Display a countdown for song intro (≥4s gap) and instrumental breaks (≥8s gap).</span>
            </div>
            {onToggleCountdown && (
              <div
                className={`${styles.toggleSwitch} ${appState.isCountdownEnabled ? styles.active : ''}`}
                onClick={onToggleCountdown}
              >
                <div className={styles.toggleKnob} />
              </div>
            )}
          </div>
        </div>

        {(appState.gameMode === 'DARE' || appState.gameMode === 'DARE_DRINK') && (
          <div className={styles.settingsSection}>
            <h4 className={styles.sectionTitle}>Dare Mode Difficulty</h4>

            <div className={styles.settingRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '14px' }}>
              <div className={styles.settingInfo} style={{ width: '100%' }}>
                <span className={styles.settingLabel}>Blanks Per Song</span>
                <span className={styles.settingSubtext}>Number of words to hide per song (Default: 3)</span>
              </div>
              <div className={styles.rangeControl}>
                <button
                  className={styles.stepperBtn}
                  onClick={() => {
                    const current = appState.dareBlanksPerSong ?? 3;
                    if (onUpdateDareBlanks && current > 0) onUpdateDareBlanks(current - 1);
                  }}
                  disabled={(appState.dareBlanksPerSong ?? 3) <= 0}
                >-</button>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={appState.dareBlanksPerSong ?? 3}
                  onChange={(e) => onUpdateDareBlanks && onUpdateDareBlanks(parseInt(e.target.value))}
                  className={styles.rangeSlider}
                />
                <button
                  className={styles.stepperBtn}
                  onClick={() => {
                    const current = appState.dareBlanksPerSong ?? 3;
                    if (onUpdateDareBlanks && current < 10) onUpdateDareBlanks(current + 1);
                  }}
                  disabled={(appState.dareBlanksPerSong ?? 3) >= 10}
                >+</button>
                <span className={styles.rangeValue}>{appState.dareBlanksPerSong ?? 3}</span>
              </div>
            </div>

            <div className={styles.settingRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '14px' }}>
              <div className={styles.settingInfo} style={{ width: '100%' }}>
                <span className={styles.settingLabel}>Min Word Length</span>
                <span className={styles.settingSubtext}>Minimum letters a word must have to be blanked (Default: 3)</span>
              </div>
              <div className={styles.rangeControl}>
                <button
                  className={styles.stepperBtn}
                  onClick={() => {
                    const current = appState.dareMinWordLength ?? 3;
                    if (onUpdateDareMinWordLength && current > 1) onUpdateDareMinWordLength(current - 1);
                  }}
                  disabled={(appState.dareMinWordLength ?? 3) <= 1}
                >-</button>
                <input
                  type="range"
                  min="1"
                  max={appState.dareMaxWordLength ?? 10}
                  value={appState.dareMinWordLength ?? 3}
                  onChange={(e) => {
                    if (onUpdateDareMinWordLength) {
                      onUpdateDareMinWordLength(Math.min(parseInt(e.target.value), appState.dareMaxWordLength ?? 10));
                    }
                  }}
                  className={styles.rangeSlider}
                />
                <button
                  className={styles.stepperBtn}
                  onClick={() => {
                    const current = appState.dareMinWordLength ?? 3;
                    const maxAllowed = appState.dareMaxWordLength ?? 10;
                    if (onUpdateDareMinWordLength && current < maxAllowed) onUpdateDareMinWordLength(current + 1);
                  }}
                  disabled={(appState.dareMinWordLength ?? 3) >= (appState.dareMaxWordLength ?? 10)}
                >+</button>
                <span className={styles.rangeValue}>{appState.dareMinWordLength ?? 3}</span>
              </div>
            </div>

            <div className={styles.settingRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '14px' }}>
              <div className={styles.settingInfo} style={{ width: '100%' }}>
                <span className={styles.settingLabel}>Max Word Length</span>
                <span className={styles.settingSubtext}>Maximum letters a word can have to be blanked (Default: 10)</span>
              </div>
              <div className={styles.rangeControl}>
                <button
                  className={styles.stepperBtn}
                  onClick={() => {
                    const current = appState.dareMaxWordLength ?? 10;
                    const minAllowed = appState.dareMinWordLength ?? 3;
                    if (onUpdateDareMaxWordLength && current > minAllowed) onUpdateDareMaxWordLength(current - 1);
                  }}
                  disabled={(appState.dareMaxWordLength ?? 10) <= (appState.dareMinWordLength ?? 3)}
                >-</button>
                <input
                  type="range"
                  min={appState.dareMinWordLength ?? 3}
                  max="20"
                  value={appState.dareMaxWordLength ?? 10}
                  onChange={(e) => {
                    if (onUpdateDareMaxWordLength) {
                      onUpdateDareMaxWordLength(Math.max(parseInt(e.target.value), appState.dareMinWordLength ?? 3));
                    }
                  }}
                  className={styles.rangeSlider}
                />
                <button
                  className={styles.stepperBtn}
                  onClick={() => {
                    const current = appState.dareMaxWordLength ?? 10;
                    if (onUpdateDareMaxWordLength && current < 20) onUpdateDareMaxWordLength(current + 1);
                  }}
                  disabled={(appState.dareMaxWordLength ?? 10) >= 20}
                >+</button>
                <span className={styles.rangeValue}>{appState.dareMaxWordLength ?? 10}</span>
              </div>
            </div>
          </div>
        )}



        <div className={styles.settingsSection}>
          <h4 className={styles.sectionTitle}>Session Storage & Reset</h4>

          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.settingLabel}>Clear Local Storage & Session</span>
              <span className={styles.settingSubtext}>
                Reset all saved player names, scores, and active screen back to initial menu state.
              </span>
            </div>
            <button
              className={`${styles.actionBtn} ${styles.resetBtn}`}
              onClick={handleReset}
            >
              <Trash2 size={16} />
              {confirmReset ? 'Confirm Reset?' : 'Reset All'}
            </button>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={`${styles.actionBtn} ${styles.exitBtn}`} onClick={handleExitApp} title="Exit and Close Application">
            <Power size={18} /> Exit Application
          </button>
          <button className={`${styles.actionBtn} ${styles.saveBtn}`} onClick={onClose}>
            <Save size={18} /> Save & Close
          </button>
        </div>

        {showSuccessToast && (
          <div className={styles.toastNotification}>
            <Check size={16} />
            Lyrics successfully refreshed!
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
