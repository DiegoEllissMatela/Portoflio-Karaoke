import React, { useState, useEffect } from 'react';
import type { GameMode } from '../../../logic/types/logicTypes';
import styles from './ModeSelection.module.scss';
import LottieModule from 'lottie-react';
const Lottie = (LottieModule as any).default || LottieModule;

interface ModeSelectionProps {
  onSelectMode: (mode: GameMode) => void;
}

export const ModeSelection: React.FC<ModeSelectionProps> = ({ onSelectMode }) => {
  const [cheersAnimation, setCheersAnimation] = useState<any>(null);
  const [dareAnimation, setDareAnimation] = useState<any>(null);
  const [normalAnimation, setNormalAnimation] = useState<any>(null);

  useEffect(() => {
    fetch('/AnimatedIcons/Cheers.json')
      .then((res) => res.json())
      .then((data) => setCheersAnimation(data))
      .catch((err) => console.error('Failed to load animation', err));

    fetch('/AnimatedIcons/DareIcon.json')
      .then((res) => res.json())
      .then((data) => setDareAnimation(data))
      .catch((err) => console.error('Failed to load animation', err));

    fetch('/AnimatedIcons/Normal.json')
      .then((res) => res.json())
      .then((data) => setNormalAnimation(data))
      .catch((err) => console.error('Failed to load animation', err));
  }, []);

  return (
    <div className={styles.screenContainer}>
      <h2 className={styles.title}>Select Game Mode</h2>

      <div className={styles.cardsContainer}>
        <div
          className={`${styles.modeCard} ${styles.highlighted}`}
          onClick={() => onSelectMode('DARE_DRINK')}
        >
          <div className={styles.iconWrapper}>
            {cheersAnimation ? (
              <Lottie animationData={cheersAnimation} loop={true} style={{ width: 80, height: 80 }} />
            ) : (
              <div style={{ width: 80, height: 80 }} />
            )}
          </div>
          <h3>Dare x Drinking Mode</h3>
          <p>Sing for your life, or take a dare and a shot!</p>
          <div className={styles.badge}>Recommended</div>
        </div>

        <div
          className={styles.modeCard}
          onClick={() => onSelectMode('DARE')}
        >
          <div className={styles.iconWrapper}>
            {dareAnimation ? (
              <Lottie animationData={dareAnimation} loop={true} style={{ width: 80, height: 80 }} />
            ) : (
              <div style={{ width: 80, height: 80 }} />
            )}
          </div>
          <h3>Truth or Dare</h3>
          <p>Nail the lyrics or bottoms up and take the dare.</p>
        </div>

        <div
          className={styles.modeCard}
          onClick={() => onSelectMode('NORMAL')}
        >
          <div className={styles.iconWrapper}>
            {normalAnimation ? (
              <Lottie animationData={normalAnimation} loop={true} style={{ width: 80, height: 80 }} />
            ) : (
              <div style={{ width: 80, height: 80 }} />
            )}
          </div>
          <h3>Normal Mode</h3>
          <p>Know the lines, fill the rhymes, take the crown.</p>
        </div>

      </div>
    </div>
  );
};
