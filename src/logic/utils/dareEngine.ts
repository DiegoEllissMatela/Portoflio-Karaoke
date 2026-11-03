import type {
  ScoreType,
  DareResolutionPlan,
  DrinkCarouselItem,
  DareItem,
  DareEntry,
  AutoDrinkTargetType,
} from '../types/logicTypes.ts';
import { dares } from '../constants/dares.ts';
import { selectFairRandomPlayer, type DrinkWheelPlan } from './drinkWheelEngine.ts';

export function getPlayerNormalPoints(scores: ScoreType[] = []): number {
  let pts = 0;
  for (const s of scores) {
    if (s === 'PERFECT') pts += 3;
    else if (s === 'TWO_WORDS') pts += 2;
    else if (s === 'ONE_WORD') pts += 1;
  }
  return pts;
}

/**
 * Normalizes any DareEntry (either a structured DareItem or a legacy string)
 * into a full, strongly-typed DareItem object.
 */
export function normalizeDareEntry(entry: DareEntry): DareItem {
  if (typeof entry !== 'string') {
    return entry;
  }

  const rawText = entry.trim();

  // 1. Check if this exact text matches a default catalog dare
  const match = dares.challenge.find(
    (d: DareItem) => d.text.trim().toLowerCase() === rawText.toLowerCase() || d.id === rawText
  );
  if (match) {
    return match;
  }

  // 2. Legacy fallback heuristics for user-created custom dares that were saved as plain strings
  return inferLegacyStringDare(rawText);
}

/**
 * Infers DareItem properties from legacy strings as a fallback for older save files.
 */
function inferLegacyStringDare(text: string): DareItem {
  const lower = text.toLowerCase();

  const drinkCount = lower.includes('thrice') || lower.includes('3 drinks')
    ? 3
    : lower.includes('twice') || lower.includes('2 drinks')
    ? 2
    : 1;

  if (lower.includes('immune until your next turn')) {
    return {
      id: text,
      text,
      interactiveType: 'IMMUNITY',
      drinkCount: 0,
      isCustom: true,
    };
  }

  if (lower.includes('make a rule')) {
    return {
      id: text,
      text,
      interactiveType: 'ONGOING_RULE',
      drinkCount: 1,
      config: { requiresCustomRuleText: true, defaultRuleText: '' },
      isCustom: true,
    };
  }

  if (
    lower.includes('phones') ||
    lower.includes('one-syllable') ||
    lower.includes('robot') ||
    lower.includes('customer service') ||
    lower.includes('announce everything')
  ) {
    return {
      id: text,
      text,
      interactiveType: 'ONGOING_RULE',
      drinkCount,
      config: {
        requiresCustomRuleText: false,
        defaultRuleText: text.split(' or drink')[0],
        canRefuseRuleForDrinks: lower.includes(' or drink') ? drinkCount : undefined,
      },
      isCustom: true,
    };
  }

  if (lower.includes('spin the wheel')) {
    const selectCount = lower.includes('3 random') ? 3 : lower.includes('2 random') ? 2 : 1;
    const includeSingerInDrink = lower.includes('you drink with');
    const wheelNeedsFollowupPicker =
      lower.includes('arm wrestle') ||
      lower.includes('pickup line') ||
      lower.includes('two truths') ||
      lower.includes('messenger');

    return {
      id: text,
      text,
      interactiveType: 'WHEEL_SPIN',
      drinkCount,
      config: {
        selectCount,
        includeSingerInDrink,
        wheelNeedsFollowupPicker,
      },
      isCustom: true,
    };
  }

  if (
    lower === 'drink.' ||
    lower === 'drink twice.' ||
    lower === 'drink thrice.' ||
    lower.includes('everyone including you') ||
    lower.includes('everyone except you') ||
    lower.includes('scoreboard') ||
    lower.includes('scores you have') ||
    lower.includes('in their score')
  ) {
    let autoTarget: AutoDrinkTargetType = 'SINGER';
    let excludeSinger = false;
    if (lower.includes('everyone including you')) autoTarget = 'EVERYONE_INCLUDING_SINGER';
    else if (lower.includes('everyone except you')) autoTarget = 'EVERYONE_EXCEPT_SINGER';
    else if (lower.includes('lower score than you')) autoTarget = 'LOWER_SCORE_THAN_SINGER';
    else if (lower.includes('higher score than you')) autoTarget = 'HIGHER_SCORE_THAN_SINGER';
    else if (lower.includes('first place in the scoreboard')) autoTarget = 'FIRST_PLACE';
    else if (lower.includes('person above you')) autoTarget = 'PLAYER_ABOVE_SINGER';
    else if (lower.includes('green scores you have')) autoTarget = 'SINGER_PER_2_GREEN';
    else if (lower.includes('red scores you have')) autoTarget = 'SINGER_PER_3_RED';
    else if (lower.includes('green')) {
      autoTarget = lower.includes('most') ? 'MOST_GREEN' : 'LEAST_GREEN';
      excludeSinger = lower.includes('except you');
    } else if (lower.includes('red')) {
      autoTarget = lower.includes('most') ? 'MOST_RED' : 'LEAST_RED';
      excludeSinger = lower.includes('except you');
    } else if (lower.includes('yellow')) {
      autoTarget = lower.includes('most') ? 'MOST_YELLOW' : 'LEAST_YELLOW';
      excludeSinger = lower.includes('except you');
    } else if (lower.includes('orange')) {
      autoTarget = lower.includes('most') ? 'MOST_ORANGE' : 'LEAST_ORANGE';
      excludeSinger = lower.includes('except you');
    }

    return {
      id: text,
      text,
      interactiveType: 'AUTO_DRINK',
      drinkCount,
      config: {
        autoTarget,
        excludeSinger,
        includeSingerInDrink: lower.includes('with you') || lower.includes('person above you'),
      },
      isCustom: true,
    };
  }

  if (lower.startsWith('pick someone') || lower.startsWith('choose two') || lower.startsWith('choose three')) {
    const selectCount = lower.includes('three') ? 3 : lower.includes('two') ? 2 : 1;
    return {
      id: text,
      text,
      interactiveType: 'SINGER_PICKER',
      drinkCount,
      config: {
        selectCount,
        includeSingerInDrink: lower.includes('with you'),
      },
      isCustom: true,
    };
  }

  if (
    lower.includes('sylable') ||
    lower.includes('every planet missed') ||
    lower.includes('every missed one') ||
    lower.includes('every person you misname') ||
    lower.includes('every time you lose')
  ) {
    return {
      id: text,
      text,
      interactiveType: 'COUNT_PICKER',
      drinkCount,
      isCustom: true,
    };
  }

  if (
    lower.includes('pushups') ||
    lower.includes('dance solo') ||
    lower.includes('spin 10 times') ||
    lower.includes('blindfold') ||
    lower.includes('call someone') ||
    lower.includes('7 wonders') ||
    lower.includes('eeveelutions') ||
    lower.includes('coin flip') ||
    lower.includes('wallpaper') ||
    lower.includes('phone gallery') ||
    lower.includes('draw on your face') ||
    lower.includes('buy something outside') ||
    lower.includes(' or drink')
  ) {
    return {
      id: text,
      text,
      interactiveType: 'PASS_OR_DRINK',
      drinkCount,
      isCustom: true,
    };
  }

  return {
    id: text,
    text,
    interactiveType: 'ADMIN_GROUP_PICKER',
    drinkCount,
    isCustom: true,
  };
}

/**
 * Deterministically analyzes any DareEntry (DareItem or legacy string)
 * and produces a DareResolutionPlan for host and remote UI display.
 */
export function analyzeDare(
  dareInput: DareEntry,
  currentSinger: string,
  players: string[] = [],
  playerScores: Record<string, ScoreType[]> = {},
  immunePlayers: string[] = []
): DareResolutionPlan {
  const item = normalizeDareEntry(dareInput);
  const text = item.text.trim();
  const drinkCount = item.drinkCount ?? 1;
  const otherPlayers = players.filter((p) => p !== currentSinger);
  const vulnerableOthers = otherPlayers.filter((p) => !immunePlayers.includes(p));
  const vulnerableAll = players.filter((p) => !immunePlayers.includes(p));

  switch (item.interactiveType) {
    case 'IMMUNITY':
      return {
        dareText: text,
        interactiveType: 'IMMUNITY',
        drinkCount: 0,
        autoRecipients: {},
        autoSummary: `🛡️ ${currentSinger} is now IMMUNE from drinks until their next turn!`,
      };

    case 'ONGOING_RULE': {
      const defaultRuleTemplate = item.config?.defaultRuleText || '';
      const formattedDefault = defaultRuleTemplate.replace(/\{singer\}/g, currentSinger);
      return {
        dareText: text,
        interactiveType: 'ONGOING_RULE',
        drinkCount,
        requiresCustomRuleText: Boolean(item.config?.requiresCustomRuleText),
        defaultRuleText: formattedDefault,
        canRefuseRuleForDrinks: item.config?.canRefuseRuleForDrinks,
      };
    }

    case 'WHEEL_SPIN': {
      const selectCount = item.config?.selectCount || 1;
      const includeSingerInDrink = Boolean(item.config?.includeSingerInDrink);
      const wheelNeedsFollowupPicker = Boolean(item.config?.wheelNeedsFollowupPicker);

      return {
        dareText: text,
        interactiveType: 'WHEEL_SPIN',
        drinkCount,
        selectCount,
        includeSingerInDrink,
        wheelNeedsFollowupPicker,
        candidatePlayers: vulnerableOthers.length > 0 ? vulnerableOthers : otherPlayers,
      };
    }

    case 'SINGER_PICKER': {
      const selectCount = item.config?.selectCount || 1;
      const includeSingerInDrink = Boolean(item.config?.includeSingerInDrink);

      return {
        dareText: text,
        interactiveType: 'SINGER_PICKER',
        drinkCount,
        selectCount: Math.min(selectCount, Math.max(1, vulnerableOthers.length)),
        includeSingerInDrink,
        candidatePlayers: vulnerableOthers,
      };
    }

    case 'PASS_OR_DRINK':
      return {
        dareText: text,
        interactiveType: 'PASS_OR_DRINK',
        drinkCount,
        candidatePlayers: [currentSinger],
      };

    case 'COUNT_PICKER':
      return {
        dareText: text,
        interactiveType: 'COUNT_PICKER',
        drinkCount,
        candidatePlayers: [currentSinger],
      };

    case 'ADMIN_GROUP_PICKER':
      return {
        dareText: text,
        interactiveType: 'ADMIN_GROUP_PICKER',
        drinkCount,
        candidatePlayers: vulnerableAll,
      };

    case 'AUTO_DRINK': {
      const target = item.config?.autoTarget || 'SINGER';
      return resolveAutoDrinkTarget(
        target,
        text,
        drinkCount,
        currentSinger,
        players,
        otherPlayers,
        vulnerableAll,
        vulnerableOthers,
        playerScores,
        immunePlayers,
        item.config
      );
    }

    default:
      return {
        dareText: text,
        interactiveType: 'ADMIN_GROUP_PICKER',
        drinkCount,
        candidatePlayers: vulnerableAll,
      };
  }
}

/**
 * Computes AUTO_DRINK recipients and summary based on target type.
 */
function resolveAutoDrinkTarget(
  target: AutoDrinkTargetType,
  text: string,
  drinkCount: number,
  currentSinger: string,
  players: string[],
  otherPlayers: string[],
  vulnerableAll: string[],
  vulnerableOthers: string[],
  playerScores: Record<string, ScoreType[]>,
  immunePlayers: string[],
  config?: DareItem['config']
): DareResolutionPlan {
  switch (target) {
    case 'SINGER':
      return {
        dareText: text,
        interactiveType: 'AUTO_DRINK',
        drinkCount,
        autoRecipients: { [currentSinger]: drinkCount },
        autoSummary: `🍺 ${currentSinger} drinks ${drinkCount}!`,
      };

    case 'EVERYONE_INCLUDING_SINGER': {
      const rec: Record<string, number> = {};
      for (const p of vulnerableAll) rec[p] = drinkCount;
      return {
        dareText: text,
        interactiveType: 'AUTO_DRINK',
        drinkCount,
        autoRecipients: rec,
        autoSummary:
          Object.keys(rec).length > 0
            ? `🍺 Everyone drinks ${drinkCount}! (${Object.keys(rec).join(', ')})`
            : '🛡️ Everyone is immune! No one drinks.',
      };
    }

    case 'EVERYONE_EXCEPT_SINGER': {
      const rec: Record<string, number> = {};
      for (const p of vulnerableOthers) rec[p] = drinkCount;
      return {
        dareText: text,
        interactiveType: 'AUTO_DRINK',
        drinkCount,
        autoRecipients: rec,
        autoSummary:
          Object.keys(rec).length > 0
            ? `🍺 Everyone except ${currentSinger} drinks ${drinkCount}! (${Object.keys(rec).join(', ')})`
            : 'No other unprotected players — no one drinks!',
      };
    }

    case 'FIRST_THREE_PLAYERS': {
      const rec: Record<string, number> = {};
      const targets = players.slice(0, 3).filter((p) => !immunePlayers.includes(p));
      for (const p of targets) rec[p] = drinkCount;
      return {
        dareText: text,
        interactiveType: 'AUTO_DRINK',
        drinkCount,
        autoRecipients: rec,
        autoSummary:
          targets.length > 0
            ? `🍺 ${targets.join(', ')} drink ${drinkCount} each!`
            : '🛡️ Target players are immune!',
      };
    }

    case 'LOWER_SCORE_THAN_SINGER':
    case 'HIGHER_SCORE_THAN_SINGER': {
      const isLower = target === 'LOWER_SCORE_THAN_SINGER';
      const singerPts = getPlayerNormalPoints(playerScores[currentSinger]);
      const rec: Record<string, number> = {};
      for (const p of vulnerableOthers) {
        const pts = getPlayerNormalPoints(playerScores[p]);
        if (isLower ? pts < singerPts : pts > singerPts) {
          rec[p] = drinkCount;
        }
      }
      const names = Object.keys(rec);
      return {
        dareText: text,
        interactiveType: 'AUTO_DRINK',
        drinkCount,
        autoRecipients: rec,
        autoSummary:
          names.length > 0
            ? `🍺 ${names.join(', ')} (${isLower ? 'lower' : 'higher'} score than ${currentSinger}) drink ${drinkCount}!`
            : `No players have a ${isLower ? 'lower' : 'higher'} score than ${currentSinger} (${singerPts} pts)! No one drinks.`,
      };
    }

    case 'FIRST_PLACE': {
      let maxPts = -1;
      for (const p of players) {
        const pts = getPlayerNormalPoints(playerScores[p]);
        if (pts > maxPts) maxPts = pts;
      }
      const leaders = players.filter(
        (p) => getPlayerNormalPoints(playerScores[p]) === maxPts && !immunePlayers.includes(p)
      );
      const rec: Record<string, number> = {};
      for (const p of leaders) rec[p] = drinkCount;
      return {
        dareText: text,
        interactiveType: 'AUTO_DRINK',
        drinkCount,
        autoRecipients: rec,
        autoSummary:
          leaders.length > 0
            ? `🍺 1st Place (${leaders.join(', ')}) drinks ${drinkCount}!`
            : '🛡️ 1st Place is immune! No one drinks.',
      };
    }

    case 'PLAYER_ABOVE_SINGER': {
      const ranked = [...players].sort(
        (a, b) => getPlayerNormalPoints(playerScores[b]) - getPlayerNormalPoints(playerScores[a])
      );
      const myIdx = ranked.indexOf(currentSinger);
      const abovePlayer = myIdx > 0 ? ranked[myIdx - 1] : ranked[0];
      const rec: Record<string, number> = { [currentSinger]: drinkCount };
      if (abovePlayer && abovePlayer !== currentSinger && !immunePlayers.includes(abovePlayer)) {
        rec[abovePlayer] = drinkCount;
      }
      const names = Object.keys(rec);
      return {
        dareText: text,
        interactiveType: 'AUTO_DRINK',
        drinkCount,
        autoRecipients: rec,
        autoSummary: `🍺 ${names.join(' and ')} drink ${drinkCount}!`,
      };
    }

    case 'SINGER_PER_2_GREEN':
    case 'SINGER_PER_3_RED': {
      const isGreen = target === 'SINGER_PER_2_GREEN';
      const targetBadge: ScoreType = isGreen ? 'PERFECT' : 'ZERO';
      const divisor = isGreen ? 2 : 3;
      const myBadges = (playerScores[currentSinger] || []).filter((s) => s === targetBadge).length;
      const earnedDrinks = Math.floor(myBadges / divisor) * drinkCount;
      const rec: Record<string, number> = earnedDrinks > 0 ? { [currentSinger]: earnedDrinks } : {};
      return {
        dareText: text,
        interactiveType: 'AUTO_DRINK',
        drinkCount: earnedDrinks,
        autoRecipients: rec,
        autoSummary:
          earnedDrinks > 0
            ? `🍺 ${currentSinger} has ${myBadges} ${isGreen ? 'Green' : 'Red'} badge(s) and drinks ${earnedDrinks}!`
            : `${currentSinger} only has ${myBadges} ${isGreen ? 'Green' : 'Red'} badge(s) — 0 drinks!`,
      };
    }

    case 'MOST_GREEN':
    case 'MOST_YELLOW':
    case 'MOST_ORANGE':
    case 'MOST_RED':
    case 'LEAST_GREEN':
    case 'LEAST_YELLOW':
    case 'LEAST_ORANGE':
    case 'LEAST_RED': {
      const isMost = target.startsWith('MOST_');
      const exceptYou = Boolean(config?.excludeSinger);
      const targetScore: ScoreType = target.includes('GREEN')
        ? 'PERFECT'
        : target.includes('YELLOW')
        ? 'TWO_WORDS'
        : target.includes('ORANGE')
        ? 'ONE_WORD'
        : 'ZERO';
      const colorName = target.includes('GREEN')
        ? 'Green'
        : target.includes('YELLOW')
        ? 'Yellow'
        : target.includes('ORANGE')
        ? 'Orange'
        : 'Red';

      const pool = exceptYou ? otherPlayers : players;
      if (pool.length === 0) {
        return {
          dareText: text,
          interactiveType: 'AUTO_DRINK',
          drinkCount: 0,
          autoRecipients: {},
          autoSummary: 'No eligible players!',
        };
      }

      const counts = pool.map((p) => ({
        player: p,
        count: (playerScores[p] || []).filter((s) => s === targetScore).length,
      }));
      const targetVal = isMost
        ? Math.max(...counts.map((c) => c.count))
        : Math.min(...counts.map((c) => c.count));

      if (isMost && targetVal === 0) {
        return {
          dareText: text,
          interactiveType: 'AUTO_DRINK',
          drinkCount: 0,
          autoRecipients: {},
          autoSummary: `No one has any ${colorName} scores yet — everyone is safe!`,
        };
      }

      const matched = counts
        .filter((c) => c.count === targetVal && !immunePlayers.includes(c.player))
        .map((c) => c.player);
      const rec: Record<string, number> = {};
      for (const p of matched) rec[p] = drinkCount;

      return {
        dareText: text,
        interactiveType: 'AUTO_DRINK',
        drinkCount,
        autoRecipients: rec,
        autoSummary:
          matched.length > 0
            ? `🍺 ${matched.join(', ')} (${isMost ? 'most' : 'least'} ${colorName}: ${targetVal}) drink ${drinkCount}!`
            : `🛡️ Qualifying player(s) are immune! No one drinks.`,
      };
    }

    default:
      return {
        dareText: text,
        interactiveType: 'AUTO_DRINK',
        drinkCount,
        autoRecipients: { [currentSinger]: drinkCount },
        autoSummary: `🍺 ${currentSinger} drinks ${drinkCount}!`,
      };
  }
}

export function buildDareWheelPlan(
  plan: DareResolutionPlan,
  currentSinger: string,
  players: string[] = [],
  playerDrinks: Record<string, number> = {},
  recentRecipients: string[] = []
): DrinkWheelPlan {
  const otherPlayers = players.filter((p) => p !== currentSinger);
  const candidatePool =
    plan.candidatePlayers && plan.candidatePlayers.length > 0
      ? plan.candidatePlayers
      : otherPlayers.length > 0
      ? otherPlayers
      : players;

  const selectCount = Math.min(plan.selectCount || 1, Math.max(1, candidatePool.length));
  const drinkCount = plan.drinkCount || 1;

  const winnerItem: DrinkCarouselItem = {
    id: 'dare-wheel-winner',
    label: plan.dareText,
    category: 'RANDOM_PLAYERS_DRINK',
    drinkCount,
  };

  const stage1Options: DrinkCarouselItem[] = [
    winnerItem,
    { id: 'dare-wheel-opt1', label: 'Random Drinker', category: 'RANDOM_PLAYERS_DRINK', drinkCount },
    { id: 'dare-wheel-opt2', label: 'Wheel of Fate', category: 'RANDOM_PLAYERS_DRINK', drinkCount },
    { id: 'dare-wheel-opt3', label: 'Party Target', category: 'RANDOM_PLAYERS_DRINK', drinkCount },
  ];

  const pickedPlayers: string[] = [];
  const stage2Rounds: { playerPool: string[]; winningPlayer: string; winningIndex: number }[] = [];
  let pool = [...candidatePool];

  for (let c = 0; c < selectCount && pool.length > 0; c++) {
    const chosen = selectFairRandomPlayer(pool, playerDrinks, [...recentRecipients, ...pickedPlayers]);
    pickedPlayers.push(chosen);
    const chosenIdx = pool.indexOf(chosen);
    stage2Rounds.push({
      playerPool: [...pool],
      winningPlayer: chosen,
      winningIndex: chosenIdx >= 0 ? chosenIdx : 0,
    });
    pool = pool.filter((p) => p !== chosen);
  }

  const drinkRecipients: Record<string, number> = {};
  for (const p of pickedPlayers) {
    drinkRecipients[p] = drinkCount;
  }
  if (plan.includeSingerInDrink) {
    drinkRecipients[currentSinger] = (drinkRecipients[currentSinger] || 0) + drinkCount;
  }

  let summaryText = plan.includeSingerInDrink
    ? `🍺 ${currentSinger} and ${pickedPlayers.join(' and ')} drink ${drinkCount}!`
    : `🍺 ${pickedPlayers.join(' and ')} drink${pickedPlayers.length === 1 ? 's' : ''} ${drinkCount}!`;

  if (plan.wheelNeedsFollowupPicker) {
    summaryText = `🎯 Landed on ${pickedPlayers.join(', ')}! Challenge: ${plan.dareText}`;
  }

  return {
    score: 'PERFECT',
    currentSinger,
    stage1Tasks: stage1Options,
    stage1Winner: winnerItem,
    stage1WinningIndex: 0,
    requiresStage2: stage2Rounds.length > 0,
    stage2Rounds,
    drinkRecipients,
    summaryText,
  };
}
