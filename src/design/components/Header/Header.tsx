import React, { useEffect, useState } from 'react';
import LottieModule from 'lottie-react';
// Handle Vite CJS/ESM interop
const Lottie = (LottieModule as any).default || LottieModule;
import styles from './Header.module.scss';

import type { GameMode } from '../../../logic/types/logicTypes';

interface HeaderProps {
  gameMode?: GameMode | null;
}

export const Header: React.FC<HeaderProps> = ({ gameMode }) => {
  const [animationData, setAnimationData] = useState<any>(null);

  useEffect(() => {
    fetch('/AnimatedIcons/MicrophoneLogo.json')
      .then((res) => res.json())
      .then((data) => setAnimationData(data))
      .catch((err) => console.error('Failed to load animation', err));
  }, []);

  const getModeText = () => {
    switch (gameMode) {
      case 'NORMAL': return 'Classic';
      case 'DARE_DRINK': return 'Dare x Drink';
      case 'JUST_DRINK':
      case 'DARE': return 'Just Drink';
      default: return '';
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.logoIcon}>
          {animationData && <Lottie animationData={animationData} loop={true} style={{ width: 44, height: 44 }} />}
        </div>
        <div className={styles.titleWrapper}>
          <h1 className={styles.title}>DNM Karaoke</h1>
        </div>
      </div>
      
      {gameMode && (
        <div className={styles.centerMode}>
          <span className={styles.modeText}>{getModeText()}</span>
        </div>
      )}
    </header>
  );
};
