import React from 'react';
import styles from './MainMenu.module.scss';

interface MainMenuProps {
  onStart: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStart }) => {
  const handleStartWithFullscreen = () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    onStart();
  };

  return (
    <div className={styles.screenContainer}>
      <div className={styles.heroSection}>
        <div className={styles.titleWrapper}>
          <h1 className={styles.title}>DNM Karaoke</h1>
        </div>
        <p className={styles.subtitle}>Sing, drink, and take a dare.</p>
      </div>

      <button className={styles.startBtn} onClick={handleStartWithFullscreen}>
        START GAME
      </button>
    </div>
  );
};
