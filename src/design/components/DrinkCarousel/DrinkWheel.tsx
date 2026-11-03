import React, { useEffect, useRef, useState, useId } from 'react';
import { Undo2 } from 'lucide-react';
import type { DrinkWheelPlan } from '../../../logic/utils/drinkWheelEngine';
import styles from './DrinkWheel.module.scss';

// Vibrant neon carnival palette for wheel segments
const SEGMENT_COLORS = [
  '#ec4899', // Neon pink
  '#8b5cf6', // Neon violet
  '#06b6d4', // Cyber cyan
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#f43f5e', // Rose
  '#a855f7', // Purple
  '#eab308', // Bright yellow
];

// Helper to wrap long task names onto 2 lines so they fit comfortably on slices
function splitLabel(str: string): string[] {
  if (str.length <= 10) return [str];
  const words = str.split(' ');
  if (words.length <= 1) return [str];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

interface WheelCanvasProps {
  title: string;
  items: string[];
  winningIndex: number;
  durationMs?: number;
  onDone: () => void;
}

const WheelCanvas: React.FC<WheelCanvasProps> = ({
  title,
  items,
  winningIndex,
  durationMs = 4500,
  onDone,
}) => {
  const [rotation, setRotation] = useState<number>(0);
  const [isLanded, setIsLanded] = useState<boolean>(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const gradientPrefix = useId().replace(/:/g, '_');

  const count = Math.max(1, items.length);
  const sliceAngle = 360 / count;

  useEffect(() => {
    // 5 full rotations (1800 deg) plus slice positioning so the winning segment points directly UP at the arrow (270 deg)
    const extraRotations = 5 * 360;
    const targetSliceCenter = winningIndex * sliceAngle + sliceAngle / 2;
    // Align targetSliceCenter with top pointer (270 deg in SVG polar coord system)
    let finalAngle = extraRotations + (270 - targetSliceCenter);
    while (finalAngle < extraRotations) finalAngle += 360;

    // Small raf delay to ensure clean CSS transition start
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setRotation(finalAngle);
      });
      return () => cancelAnimationFrame(raf2);
    });

    const landTimer = setTimeout(() => {
      setIsLanded(true);
    }, durationMs);

    const doneTimer = setTimeout(() => {
      onDoneRef.current();
    }, durationMs + 700);

    return () => {
      cancelAnimationFrame(raf1);
      clearTimeout(landTimer);
      clearTimeout(doneTimer);
    };
  }, [winningIndex, sliceAngle, durationMs]);

  // Radius for SVG coordinate space
  const size = 500;
  const center = size / 2;
  const radius = center - 16;

  return (
    <div className={styles.wheelSection}>
      <div className={styles.wheelTitle}>{title}</div>

      <div className={styles.wheelStage}>
        {/* Top Indicator Arrow */}
        <div className={styles.arrowPointer}>
          <svg viewBox="0 0 40 46" className={styles.arrowSvg}>
            <polygon points="20,44 4,6 36,6" fill="#f43f5e" stroke="#ffffff" strokeWidth="2.5" />
          </svg>
        </div>

        {/* Rotating SVG Wheel */}
        <div
          className={styles.wheelDisc}
          style={{
            transform: `rotate(${rotation}deg)`,
            transitionDuration: `${durationMs}ms`,
          }}
        >
          <svg viewBox={`0 0 ${size} ${size}`} className={styles.wheelSvg}>
            <defs>
              <radialGradient id={`${gradientPrefix}_rim`} cx="50%" cy="50%" r="50%">
                <stop offset="92%" stopColor="#1e1b4b" />
                <stop offset="100%" stopColor="#0f172a" />
              </radialGradient>
              <clipPath id={`${gradientPrefix}_wheelClip`}>
                <circle cx={center} cy={center} r={radius} />
              </clipPath>
            </defs>

            {/* Background Rim */}
            <circle cx={center} cy={center} r={radius + 8} fill={`url(#${gradientPrefix}_rim)`} stroke="rgba(255,255,255,0.2)" strokeWidth="4" />

            {/* Slices with strict circle clipping */}
            <g clipPath={`url(#${gradientPrefix}_wheelClip)`}>
              {items.map((label, idx) => {
                const startA = idx * sliceAngle;
                const endA = (idx + 1) * sliceAngle;
                const startRad = (startA * Math.PI) / 180;
                const endRad = (endA * Math.PI) / 180;
                const midRad = ((startA + endA) / 2 * Math.PI) / 180;

                const x1 = center + radius * Math.cos(startRad);
                const y1 = center + radius * Math.sin(startRad);
                const x2 = center + radius * Math.cos(endRad);
                const y2 = center + radius * Math.sin(endRad);

                const largeArc = sliceAngle > 180 ? 1 : 0;
                const pathData = count === 1
                  ? `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center - 0.01} ${center - radius} Z`
                  : `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

                const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length];
                const isWinner = isLanded && idx === winningIndex;

                // Text position: positioned neatly within the wedge sweet spot
                const textR = radius * 0.58;
                const tx = center + textR * Math.cos(midRad);
                const ty = center + textR * Math.sin(midRad);
                // Rotate text to follow the ray outward
                const textAngleDeg = ((startA + endA) / 2);
                const lines = splitLabel(label);
                const baseFontSize = count > 8 ? 12 : count > 5 ? 13 : 15;

                return (
                  <g key={idx}>
                    <path
                      d={pathData}
                      fill={color}
                      stroke="#0a0b10"
                      strokeWidth="3"
                      className={isWinner ? styles.winningSlice : ''}
                    />
                    <g transform={`translate(${tx}, ${ty}) rotate(${textAngleDeg})`}>
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#ffffff"
                        fontSize={baseFontSize}
                        fontWeight="700"
                        className={styles.sliceText}
                      >
                        {lines.length === 1 ? (
                          lines[0]
                        ) : (
                          <>
                            <tspan x="0" dy="-0.55em">{lines[0]}</tspan>
                            <tspan x="0" dy="1.15em">{lines[1]}</tspan>
                          </>
                        )}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>

            {/* Center Pin / Cap */}
            <circle cx={center} cy={center} r="28" fill="#0f172a" stroke="#ffffff" strokeWidth="3" />
            <circle cx={center} cy={center} r="14" fill="#f43f5e" />
          </svg>
        </div>
      </div>
    </div>
  );
};

interface DrinkWheelProps {
  plan: DrinkWheelPlan;
  onFinished: (recipients?: Record<string, number>, summaryText?: string) => void;
  onUndo: () => void;
  onDone: () => void;
  onManualPhaseStart?: () => void;
  externalSelectedPlayers?: string[] | null;
}

export const DrinkWheel: React.FC<DrinkWheelProps> = ({
  plan,
  onFinished,
  onUndo,
  onDone,
  onManualPhaseStart,
  externalSelectedPlayers,
}) => {
  const stage2Rounds = plan.requiresStage2 ? plan.stage2Rounds || [] : [];
  // phase 0 = main task wheel, 1..N = stage 2 (wheel or manual selection), N+1 = result card
  const [phase, setPhase] = useState(0);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [isManualConfirmed, setIsManualConfirmed] = useState(false);
  const [manualResult, setManualResult] = useState<{
    drinkRecipients: Record<string, number>;
    summaryText: string;
  } | null>(null);

  const onManualPhaseStartRef = useRef(onManualPhaseStart);
  onManualPhaseStartRef.current = onManualPhaseStart;

  const isResult = plan.requiresManualSelection
    ? isManualConfirmed
    : phase > stage2Rounds.length;

  useEffect(() => {
    if (phase >= 1 && !isResult && plan.requiresManualSelection) {
      onManualPhaseStartRef.current?.();
    }
  }, [phase, isResult, plan.requiresManualSelection]);

  useEffect(() => {
    if (
      plan.requiresManualSelection &&
      !isManualConfirmed &&
      Array.isArray(externalSelectedPlayers) &&
      externalSelectedPlayers.length > 0
    ) {
      const validTargets = externalSelectedPlayers.filter(p =>
        (plan.candidatePlayers || []).includes(p)
      );
      if (validTargets.length > 0) {
        const drinkRecipients: Record<string, number> = {};
        for (const p of validTargets) {
          drinkRecipients[p] = 1;
        }
        const summaryText = `${validTargets.join(' and ')} drink${validTargets.length === 1 ? 's' : ''} 1!`;
        setSelectedPlayers(validTargets);
        setManualResult({ drinkRecipients, summaryText });
        setIsManualConfirmed(true);
      }
    }
  }, [externalSelectedPlayers, isManualConfirmed, plan.requiresManualSelection, plan.candidatePlayers]);

  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (isResult && !finishedRef.current) {
      finishedRef.current = true;
      if (manualResult) {
        onFinishedRef.current(manualResult.drinkRecipients, manualResult.summaryText);
      } else {
        onFinishedRef.current();
      }
    }
  }, [isResult, manualResult]);

  const advance = () => setPhase(p => p + 1);
  const chosenSoFar = stage2Rounds.slice(0, Math.max(0, phase - 1)).map(r => r.winningPlayer);

  const targetCount = plan.manualSelectionCount || 1;
  const togglePlayer = (name: string) => {
    setSelectedPlayers(prev => {
      if (prev.includes(name)) {
        return prev.filter(p => p !== name);
      }
      if (targetCount === 1) {
        return [name];
      }
      if (prev.length < targetCount) {
        return [...prev, name];
      }
      return prev;
    });
  };

  const handleConfirmManual = () => {
    if (selectedPlayers.length !== targetCount) return;
    const drinkRecipients: Record<string, number> = {};
    for (const p of selectedPlayers) {
      drinkRecipients[p] = 1;
    }
    const summaryText = `${selectedPlayers.join(' and ')} drink${selectedPlayers.length === 1 ? 's' : ''} 1!`;
    setManualResult({ drinkRecipients, summaryText });
    setIsManualConfirmed(true);
  };

  const activeRecipients = manualResult ? manualResult.drinkRecipients : plan.drinkRecipients;
  const recipients = Object.entries(activeRecipients);
  const activeSummary = manualResult ? manualResult.summaryText : plan.summaryText;

  return (
    <div className={styles.wheelContainer}>
      {isResult && (
        <button className={styles.undoBtn} onClick={onUndo} title="Undo Score">
          <Undo2 size={22} />
        </button>
      )}

      <h3 className={styles.heading}>
        {isResult ? 'Drink Time!' : `${plan.currentSinger}'s Turn`}
      </h3>

      {phase === 0 && (
        <WheelCanvas
          key="stage1-wheel"
          title="Spin the Wheel!"
          items={plan.stage1Tasks.map(t => t.label)}
          winningIndex={plan.stage1WinningIndex}
          durationMs={4500}
          onDone={advance}
        />
      )}

      {phase >= 1 && !isResult && plan.requiresManualSelection && (
        <div className={styles.manualSelectionContainer}>
          <div className={styles.manualHeader}>
            <div className={styles.wheelTitle}>{plan.stage1Winner.label}</div>
            <p className={styles.manualInstruction}>
              Click <strong>{targetCount}</strong> player{targetCount > 1 ? 's' : ''} to take a drink:
            </p>
          </div>

          <div className={styles.playerPickerGrid}>
            {(plan.candidatePlayers || []).map(player => {
              const isSelected = selectedPlayers.includes(player);
              return (
                <button
                  key={player}
                  type="button"
                  className={`${styles.playerPickBtn} ${isSelected ? styles.playerPickSelected : ''}`}
                  onClick={() => togglePlayer(player)}
                >
                  <span className={styles.pickAvatar}>🍺</span>
                  <span className={styles.pickName}>{player}</span>
                  {isSelected && <span className={styles.pickCheck}>✓</span>}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className={styles.confirmPickBtn}
            disabled={selectedPlayers.length !== targetCount}
            onClick={handleConfirmManual}
          >
            {selectedPlayers.length === targetCount
              ? `Confirm: ${selectedPlayers.join(', ')} 🍺`
              : `Select ${targetCount - selectedPlayers.length} more (${selectedPlayers.length}/${targetCount})`}
          </button>
        </div>
      )}

      {phase >= 1 && !isResult && !plan.requiresManualSelection && (
        <>
          {chosenSoFar.length > 0 && (
            <div className={styles.chosenRow}>
              {chosenSoFar.map(name => (
                <span key={name} className={styles.chosenChip}>{name}</span>
              ))}
            </div>
          )}
          <WheelCanvas
            key={`stage2-wheel-${phase}`}
            title={
              stage2Rounds.length > 1
                ? `Picking player ${phase} of ${stage2Rounds.length}...`
                : 'Choosing a player...'
            }
            items={stage2Rounds[phase - 1].playerPool}
            winningIndex={stage2Rounds[phase - 1].winningIndex}
            durationMs={4000}
            onDone={advance}
          />
        </>
      )}

      {isResult && (
        <div className={styles.resultCard}>
          <img src="/Beer.gif" alt="Cheers" className={styles.resultGif} />
          <p className={styles.resultText}>{activeSummary}</p>
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
