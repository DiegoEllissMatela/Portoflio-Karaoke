import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Undo2 } from 'lucide-react';
import type { DrinkSpinPlan } from '../../../logic/types/logicTypes';
import styles from './DrinkCarousel.module.scss';

const ITEM_WIDTH = 200;
const ITEM_GAP = 12;
const SETTLE_PAUSE_MS = 700;

interface ReelItem {
  label: string;
  sublabel?: string;
  icon?: string;
}

interface ReelProps {
  title: string;
  items: ReelItem[];
  winningIndex: number;
  durationMs: number;
  onDone: () => void;
}

/** A single horizontal slot-machine strip that decelerates onto the winning item. */
const Reel: React.FC<ReelProps> = ({ title, items, winningIndex, durationMs, onDone }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [landed, setLanded] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useLayoutEffect(() => {
    const viewportWidth = viewportRef.current?.clientWidth ?? 0;
    const target = -(winningIndex * (ITEM_WIDTH + ITEM_GAP)) + viewportWidth / 2 - ITEM_WIDTH / 2;
    // Two frames so the browser paints the starting position before the transition begins.
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setOffset(target));
    });
    return () => cancelAnimationFrame(raf1);
  }, [winningIndex]);

  useEffect(() => {
    const landTimer = setTimeout(() => setLanded(true), durationMs);
    const doneTimer = setTimeout(() => onDoneRef.current(), durationMs + SETTLE_PAUSE_MS);
    return () => {
      clearTimeout(landTimer);
      clearTimeout(doneTimer);
    };
  }, [durationMs]);

  return (
    <div className={styles.reelSection}>
      <div className={styles.reelTitle}>{title}</div>
      <div className={styles.reelViewport} ref={viewportRef}>
        <div className={styles.pointer} />
        <div
          className={styles.reelTrack}
          style={{
            transform: `translateX(${offset}px)`,
            transitionDuration: `${durationMs}ms`,
          }}
        >
          {items.map((item, idx) => (
            <div
              key={idx}
              className={`${styles.reelItem} ${landed && idx === winningIndex ? styles.reelItemWinner : ''}`}
              style={{ width: ITEM_WIDTH }}
            >
              {item.icon && <span className={styles.reelIcon}>{item.icon}</span>}
              <span className={styles.reelLabel}>{item.label}</span>
              {item.sublabel && <span className={styles.reelSublabel}>{item.sublabel}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface DrinkCarouselProps {
  plan: DrinkSpinPlan;
  /** Fires once, when every spin has landed and the result is revealed. */
  onFinished: () => void;
  onUndo: () => void;
  onDone: () => void;
}

export const DrinkCarousel: React.FC<DrinkCarouselProps> = ({ plan, onFinished, onUndo, onDone }) => {
  const stage2Rounds = plan.requiresStage2 ? plan.stage2Rounds || [] : [];
  // phase 0 = outcome reel, 1..N = player-pick reels, N+1 = result
  const [phase, setPhase] = useState(0);
  const isResult = phase > stage2Rounds.length;
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (isResult && !finishedRef.current) {
      finishedRef.current = true;
      onFinishedRef.current();
    }
  }, [isResult]);

  const advance = () => setPhase(p => p + 1);
  const chosenSoFar = stage2Rounds.slice(0, Math.max(0, phase - 1)).map(r => r.winningPlayer);
  const recipients = Object.entries(plan.drinkRecipients);

  return (
    <div className={styles.carouselContainer}>
      {isResult && (
        <button className={styles.undoBtn} onClick={onUndo} title="Undo Score">
          <Undo2 size={20} />
        </button>
      )}

      <h3 className={styles.heading}>
        {isResult ? 'Drink Time!' : `${plan.currentSinger}'s Spin`}
      </h3>

      {phase === 0 && (
        <Reel
          key="stage1"
          title="Spinning the outcome..."
          items={plan.stage1Items.map(i => ({ label: i.label, sublabel: i.sublabel, icon: i.icon }))}
          winningIndex={plan.stage1WinningIndex}
          durationMs={3800}
          onDone={advance}
        />
      )}

      {phase >= 1 && !isResult && (
        <>
          {chosenSoFar.length > 0 && (
            <div className={styles.chosenRow}>
              {chosenSoFar.map(name => (
                <span key={name} className={styles.chosenChip}>{name}</span>
              ))}
            </div>
          )}
          <Reel
            key={`stage2-${phase}`}
            title={
              stage2Rounds.length > 1
                ? `Picking player ${phase} of ${stage2Rounds.length}...`
                : 'Picking a player...'
            }
            items={stage2Rounds[phase - 1].playerPool.map(name => ({ label: name, icon: '🍺' }))}
            winningIndex={stage2Rounds[phase - 1].winningIndex}
            durationMs={3000}
            onDone={advance}
          />
        </>
      )}

      {isResult && (
        <div className={styles.resultCard}>
          <img src="/Beer.gif" alt="Cheers" className={styles.resultGif} />
          <p className={styles.resultText}>{plan.summaryText}</p>
          {recipients.length > 0 && (
            <div className={styles.recipientRow}>
              {recipients.map(([name, count]) => (
                <span key={name} className={styles.recipientChip}>
                  {name} <strong>+{count} 🍺</strong>
                </span>
              ))}
            </div>
          )}
          <button className={styles.doneBtn} onClick={onDone}>Start</button>
        </div>
      )}
    </div>
  );
};
