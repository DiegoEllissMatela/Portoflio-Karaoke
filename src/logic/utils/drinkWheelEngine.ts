import type { ScoreType, DrinkCarouselItem } from '../types/logicTypes.ts';

/**
 * Anti-Bullying / Rubber-Banding Player Selection
 * Evaluates candidate drink totals and applies inverse-drink weighting
 * so players who have already taken many drinks are less likely to be chosen,
 * while sober players are targeted more frequently.
 */
export function selectFairRandomPlayer(
  candidates: string[],
  playerDrinks: Record<string, number> = {},
  recentRecipients: string[] = []
): string {
  if (candidates.length === 0) return '';
  if (candidates.length === 1) return candidates[0];

  const drinkCounts = candidates.map(c => playerDrinks[c] || 0);
  const maxDrinks = Math.max(...drinkCounts);

  // Compute inverse weights: higher weight for fewer drinks
  const weights = candidates.map(c => {
    const drinks = playerDrinks[c] || 0;
    let weight = (maxDrinks - drinks) + 1; // Base range: 1 to (maxDrinks + 1)

    // Cooldown multiplier: Reduce chance if recently chosen in the last turn
    if (candidates.length >= 3 && recentRecipients.includes(c)) {
      weight = Math.max(1, Math.round(weight * 0.5));
    }
    return weight;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let randomVal = Math.random() * totalWeight;

  for (let i = 0; i < candidates.length; i++) {
    randomVal -= weights[i];
    if (randomVal <= 0) {
      return candidates[i];
    }
  }

  return candidates[candidates.length - 1];
}

/**
 * Generates an expanded carousel strip (repeating pool items)
 * and sets the winning index deep enough into the strip (~30-50 items)
 * for a satisfying slot-machine deceleration animation.
 */
export function buildCarouselStrip<T>(items: T[], winningItem: T, minTotal = 40): { strip: T[]; winningIndex: number } {
  if (items.length === 0) return { strip: [winningItem], winningIndex: 0 };
  
  const strip: T[] = [];
  const repeatCount = Math.max(6, Math.ceil(minTotal / items.length));
  
  for (let r = 0; r < repeatCount; r++) {
    for (const it of items) {
      strip.push(it);
    }
  }

  // Pick a winning index around 75% through the strip
  const targetRegionStart = Math.floor(strip.length * 0.65);
  let winningIndex = -1;

  for (let i = targetRegionStart; i < strip.length - 2; i++) {
    if (strip[i] === winningItem) {
      winningIndex = i;
      break;
    }
  }

  // If not found in target region, inject it at a standard landing point
  if (winningIndex === -1) {
    winningIndex = Math.min(strip.length - 5, targetRegionStart + 5);
    strip[winningIndex] = winningItem;
  }

  return { strip, winningIndex };
}

/**
 * Main Drink Wheel Engine
 * Computes the complete multi-stage spin plan, outcomes, and exact drink
 * increments for the Just Drink mode.
 */
export interface DrinkWheelPlan {
  score: ScoreType;
  currentSinger: string;
  stage1Tasks: DrinkCarouselItem[];
  stage1Winner: DrinkCarouselItem;
  stage1WinningIndex: number;
  requiresStage2: boolean;
  requiresManualSelection?: boolean;
  manualSelectionCount?: number;
  candidatePlayers?: string[];
  stage2Rounds?: {
    playerPool: string[];
    winningPlayer: string;
    winningIndex: number;
  }[];
  drinkRecipients: Record<string, number>;
  summaryText: string;
}

export function generateDrinkWheelPlan(
  score: ScoreType,
  currentSinger: string,
  players: string[] = [],
  playerDrinks: Record<string, number> = {},
  recentRecipients: string[] = []
): DrinkWheelPlan {
  const otherPlayers = players.filter(p => p !== currentSinger);

  // 1. TIER: ZERO (No Correct)
  if (score === 'ZERO') {
    const zeroOptions: DrinkCarouselItem[] = [
      { id: 'zero-drink', label: 'Drink', sublabel: '+1 Drink', category: 'SINGER_DRINK', drinkCount: 1 },
      { id: 'zero-twice', label: 'Drink Twice', sublabel: '+2 Drinks', category: 'SINGER_DRINK', drinkCount: 2 },
      { id: 'zero-thrice', label: 'Drink Thrice', sublabel: '+3 Drinks', category: 'SINGER_DRINK', drinkCount: 3 },
    ];

    // Weights: 50% Drink, 35% Drink Twice, 15% Drink Thrice
    const r = Math.random() * 100;
    const winner = r < 50 ? zeroOptions[0] : (r < 85 ? zeroOptions[1] : zeroOptions[2]);
    const winningIndex = zeroOptions.findIndex(o => o.id === winner.id);

    return {
      score,
      currentSinger,
      stage1Tasks: zeroOptions,
      stage1Winner: winner,
      stage1WinningIndex: winningIndex,
      requiresStage2: false,
      drinkRecipients: {
        [currentSinger]: winner.drinkCount || 1,
      },
      summaryText: `${currentSinger}: ${winner.label}`,
    };
  }

  // 2. TIER: ONE_WORD (1 Word)
  if (score === 'ONE_WORD') {
    if (otherPlayers.length === 0) {
      const soloItem: DrinkCarouselItem = {
        id: 'one-solo',
        label: 'Solo Drink',
        sublabel: '+1 Drink',
        category: 'SINGER_DRINK',
        drinkCount: 1,
      };
      return {
        score,
        currentSinger,
        stage1Tasks: [soloItem],
        stage1Winner: soloItem,
        stage1WinningIndex: 0,
        requiresStage2: false,
        drinkRecipients: { [currentSinger]: 1 },
        summaryText: `${currentSinger} drinks 1!`,
      };
    }

    const winningPlayer = selectFairRandomPlayer(otherPlayers, playerDrinks, recentRecipients);
    const playerItems: DrinkCarouselItem[] = otherPlayers.map(p => ({
      id: `partner-${p}`,
      label: `Drink with ${p}`,
      sublabel: `You & ${p} drink 1`,
      category: 'DRINK_WITH_PARTNER',
      drinkCount: 1,
    }));

    const winningIndex = playerItems.findIndex(it => it.id === `partner-${winningPlayer}`);
    const winningItem = playerItems[winningIndex >= 0 ? winningIndex : 0];

    return {
      score,
      currentSinger,
      stage1Tasks: playerItems,
      stage1Winner: winningItem,
      stage1WinningIndex: Math.max(0, winningIndex),
      requiresStage2: false,
      drinkRecipients: {
        [currentSinger]: 1,
        [winningPlayer]: 1,
      },
      summaryText: `${currentSinger} and ${winningPlayer} drink 1 each!`,
    };
  }

  // 3. TIER: TWO_WORDS (2 Words)
  if (score === 'TWO_WORDS') {
    const twoWordOptions: DrinkCarouselItem[] = [
      { id: 'two-none', label: 'No One Drinks', sublabel: 'Everyone is safe', category: 'NO_ONE_DRINKS', drinkCount: 0 },
      { id: 'two-you', label: 'You Drink', sublabel: `${currentSinger} drinks 1`, category: 'YOU_DRINK', drinkCount: 1 },
      { id: 'two-everyone', label: 'Everyone Drinks', sublabel: 'All players drink 1', category: 'EVERYONE_DRINKS', drinkCount: 1 },
      { id: 'two-pick-1', label: '1 Person Drinks', sublabel: 'Wheel spins players', category: 'RANDOM_PLAYERS_DRINK', drinkCount: 1, requiresPlayerSelection: true, playerSelectionCount: 1 },
    ];

    if (otherPlayers.length >= 2) {
      twoWordOptions.push({
        id: 'two-pick-2',
        label: '2 Persons Drink',
        sublabel: 'Wheel spins players',
        category: 'RANDOM_PLAYERS_DRINK',
        drinkCount: 1,
        requiresPlayerSelection: true,
        playerSelectionCount: 2,
      });
    }

    const winningIndex = Math.floor(Math.random() * twoWordOptions.length);
    const winner = twoWordOptions[winningIndex];

    if (winner.category === 'NO_ONE_DRINKS') {
      return {
        score,
        currentSinger,
        stage1Tasks: twoWordOptions,
        stage1Winner: winner,
        stage1WinningIndex: winningIndex,
        requiresStage2: false,
        drinkRecipients: {},
        summaryText: 'No one drinks! Everyone is safe.',
      };
    }

    if (winner.category === 'YOU_DRINK') {
      return {
        score,
        currentSinger,
        stage1Tasks: twoWordOptions,
        stage1Winner: winner,
        stage1WinningIndex: winningIndex,
        requiresStage2: false,
        drinkRecipients: { [currentSinger]: 1 },
        summaryText: `${currentSinger} drinks 1!`,
      };
    }

    if (winner.category === 'EVERYONE_DRINKS') {
      const allRecipients: Record<string, number> = {};
      for (const p of players) allRecipients[p] = 1;
      return {
        score,
        currentSinger,
        stage1Tasks: twoWordOptions,
        stage1Winner: winner,
        stage1WinningIndex: winningIndex,
        requiresStage2: false,
        drinkRecipients: allRecipients,
        summaryText: 'Everyone drinks 1!',
      };
    }

    // Random player selection
    const countToPick = winner.playerSelectionCount || 1;
    const pickedPlayers: string[] = [];
    const stage2Rounds: { playerPool: string[]; winningPlayer: string; winningIndex: number }[] = [];
    let pool = [...otherPlayers];

    for (let c = 0; c < countToPick && pool.length > 0; c++) {
      const chosen = selectFairRandomPlayer(pool, playerDrinks, [...recentRecipients, ...pickedPlayers]);
      pickedPlayers.push(chosen);
      const chosenIdx = pool.indexOf(chosen);

      stage2Rounds.push({
        playerPool: [...pool],
        winningPlayer: chosen,
        winningIndex: chosenIdx >= 0 ? chosenIdx : 0,
      });

      pool = pool.filter(p => p !== chosen);
    }

    const drinkRecipients: Record<string, number> = {};
    for (const p of pickedPlayers) drinkRecipients[p] = 1;

    return {
      score,
      currentSinger,
      stage1Tasks: twoWordOptions,
      stage1Winner: winner,
      stage1WinningIndex: winningIndex,
      requiresStage2: true,
      stage2Rounds,
      drinkRecipients,
      summaryText: `${pickedPlayers.join(' and ')} drink${pickedPlayers.length === 1 ? 's' : ''} 1!`,
    };
  }

  // 4. TIER: PERFECT
  if (score === 'PERFECT') {
    if (otherPlayers.length === 0) {
      const soloItem: DrinkCarouselItem = {
        id: 'perf-solo',
        label: 'Solo Safe',
        sublabel: 'No other players',
        category: 'NO_ONE_DRINKS',
        drinkCount: 0,
      };
      return {
        score,
        currentSinger,
        stage1Tasks: [soloItem],
        stage1Winner: soloItem,
        stage1WinningIndex: 0,
        requiresStage2: false,
        requiresManualSelection: false,
        drinkRecipients: {},
        summaryText: `${currentSinger} is safe!`,
      };
    }

    const perfectOptions: DrinkCarouselItem[] = [
      { id: 'perf-pick-1', label: 'Choose 1 Person to Drink', sublabel: 'Click to choose 1 player', category: 'CHOOSE_PLAYERS_DRINK', drinkCount: 1, requiresPlayerSelection: true, playerSelectionCount: 1 },
    ];

    if (otherPlayers.length >= 2) {
      perfectOptions.push({
        id: 'perf-pick-2',
        label: 'Choose 2 Persons to Drink',
        sublabel: 'Click to choose 2 players',
        category: 'CHOOSE_PLAYERS_DRINK',
        drinkCount: 1,
        requiresPlayerSelection: true,
        playerSelectionCount: 2,
      });
    }

    if (otherPlayers.length >= 3) {
      perfectOptions.push({
        id: 'perf-pick-3',
        label: 'Choose 3 Persons to Drink',
        sublabel: 'Click to choose 3 players',
        category: 'CHOOSE_PLAYERS_DRINK',
        drinkCount: 1,
        requiresPlayerSelection: true,
        playerSelectionCount: 3,
      });
    }

    if (otherPlayers.length >= 1) {
      perfectOptions.push({
        id: 'perf-everyone-except',
        label: `Everyone Drinks Except You!`,
        sublabel: `${currentSinger} is immune`,
        category: 'EVERYONE_EXCEPT_SINGER',
        drinkCount: 1,
      });
    }

    const winningIndex = Math.floor(Math.random() * perfectOptions.length);
    const winner = perfectOptions[winningIndex];

    if (winner.category === 'EVERYONE_EXCEPT_SINGER') {
      const drinkRecipients: Record<string, number> = {};
      for (const p of otherPlayers) drinkRecipients[p] = 1;
      return {
        score,
        currentSinger,
        stage1Tasks: perfectOptions,
        stage1Winner: winner,
        stage1WinningIndex: winningIndex,
        requiresStage2: false,
        requiresManualSelection: false,
        drinkRecipients,
        summaryText: `Everyone drinks except ${currentSinger}!`,
      };
    }

    // Manual mouse selection for "Choose X Person(s) to Drink"
    const countToPick = winner.playerSelectionCount || 1;

    return {
      score,
      currentSinger,
      stage1Tasks: perfectOptions,
      stage1Winner: winner,
      stage1WinningIndex: winningIndex,
      requiresStage2: false,
      requiresManualSelection: true,
      manualSelectionCount: countToPick,
      candidatePlayers: otherPlayers,
      drinkRecipients: {},
      summaryText: '',
    };
  }

  // 5. TIER: EXTRA
  const extraOptions: DrinkCarouselItem[] = [
    { id: 'extra-1-twice', label: '1 Person Drinks Twice', sublabel: '+2 Drinks', category: 'RANDOM_PLAYERS_DRINK', drinkCount: 2, requiresPlayerSelection: true, playerSelectionCount: 1 },
    { id: 'extra-everyone', label: 'Everyone Drinks', sublabel: 'All players drink 1', category: 'EVERYONE_DRINKS', drinkCount: 1 },
    { id: 'extra-you-twice', label: `${currentSinger} Drinks Twice!`, sublabel: '+2 Drinks', category: 'YOU_DRINK', drinkCount: 2 },
  ];

  if (otherPlayers.length >= 2) {
    extraOptions.push({
      id: 'extra-2-drink',
      label: '2 Persons Drink',
      sublabel: '+1 Drink each',
      category: 'RANDOM_PLAYERS_DRINK',
      drinkCount: 1,
      requiresPlayerSelection: true,
      playerSelectionCount: 2,
    });
  }

  const winningIndex = Math.floor(Math.random() * extraOptions.length);
  const winner = extraOptions[winningIndex];

  if (winner.category === 'YOU_DRINK') {
    return {
      score,
      currentSinger,
      stage1Tasks: extraOptions,
      stage1Winner: winner,
      stage1WinningIndex: winningIndex,
      requiresStage2: false,
      drinkRecipients: { [currentSinger]: winner.drinkCount || 2 },
      summaryText: `${currentSinger} drinks twice!`,
    };
  }

  if (winner.category === 'EVERYONE_DRINKS') {
    const drinkRecipients: Record<string, number> = {};
    for (const p of players) drinkRecipients[p] = 1;
    return {
      score,
      currentSinger,
      stage1Tasks: extraOptions,
      stage1Winner: winner,
      stage1WinningIndex: winningIndex,
      requiresStage2: false,
      drinkRecipients,
      summaryText: 'Everyone drinks 1!',
    };
  }

  const countToPick = winner.playerSelectionCount || 1;
  const pickedPlayers: string[] = [];
  const stage2Rounds: { playerPool: string[]; winningPlayer: string; winningIndex: number }[] = [];
  let pool = [...otherPlayers];

  for (let c = 0; c < countToPick && pool.length > 0; c++) {
    const chosen = selectFairRandomPlayer(pool, playerDrinks, [...recentRecipients, ...pickedPlayers]);
    pickedPlayers.push(chosen);
    const chosenIdx = pool.indexOf(chosen);

    stage2Rounds.push({
      playerPool: [...pool],
      winningPlayer: chosen,
      winningIndex: chosenIdx >= 0 ? chosenIdx : 0,
    });

    pool = pool.filter(p => p !== chosen);
  }

  const drinkRecipients: Record<string, number> = {};
  for (const p of pickedPlayers) drinkRecipients[p] = winner.drinkCount || 1;

  return {
    score,
    currentSinger,
    stage1Tasks: extraOptions,
    stage1Winner: winner,
    stage1WinningIndex: winningIndex,
    requiresStage2: true,
    stage2Rounds,
    drinkRecipients,
    summaryText: `${pickedPlayers.join(' and ')} drink${pickedPlayers.length === 1 ? 's' : ''} ${winner.drinkCount === 2 ? 'twice' : '1'}!`,
  };
}

// Backwards compatibility alias for previous name
export const generateDrinkSpinPlan = generateDrinkWheelPlan as any;
