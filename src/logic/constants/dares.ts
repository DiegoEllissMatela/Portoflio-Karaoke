import type { DareItem, DareInteractiveType } from '../types/logicTypes.ts';

export interface DareChallenges {
  threeWords: DareItem[];
  twoWords: DareItem[];
  oneWord: DareItem[];
  zeroWords: DareItem[];
  challenge: DareItem[];
}

export interface DareInteractiveCategoryMeta {
  type: DareInteractiveType;
  label: string;
  shortBadge: string;
  description: string;
  defaultDrinks: number;
}

/** Metadata used by the UI when displaying or creating custom dares */
export const DARE_INTERACTIVE_CATEGORIES: DareInteractiveCategoryMeta[] = [
  {
    type: 'PASS_OR_DRINK',
    label: 'Pass or Drink (Solo Challenge)',
    shortBadge: 'Pass / Drink',
    description: 'Singer completes the physical/vocal/trivia dare or takes the drink penalty.',
    defaultDrinks: 1,
  },
  {
    type: 'SINGER_PICKER',
    label: 'Singer Picks Player(s)',
    shortBadge: 'Singer Pick',
    description: 'The singer chooses who in the room has to drink.',
    defaultDrinks: 1,
  },
  {
    type: 'WHEEL_SPIN',
    label: 'Spin the Wheel',
    shortBadge: 'Wheel Spin',
    description: 'Spins the wheel to randomly select player(s) to drink or face a challenge.',
    defaultDrinks: 1,
  },
  {
    type: 'ADMIN_GROUP_PICKER',
    label: 'Group / Social Trait',
    shortBadge: 'Group Trait',
    description: 'Admin selects everyone in the room who matches the dare criteria.',
    defaultDrinks: 1,
  },
  {
    type: 'ONGOING_RULE',
    label: 'Ongoing Game Rule',
    shortBadge: 'Active Rule',
    description: 'Adds an active rule to the game that penalizes anyone who breaks it.',
    defaultDrinks: 1,
  },
  {
    type: 'COUNT_PICKER',
    label: 'Multiplier / Count Picker',
    shortBadge: 'Count × Drink',
    description: 'Admin sets a count (0–10) multiplied by the drink count (e.g. per missed item).',
    defaultDrinks: 1,
  },
  {
    type: 'AUTO_DRINK',
    label: 'Auto Drink (Instant)',
    shortBadge: 'Auto Drink',
    description: 'Automatically assigns drinks to Singer, Everyone, or Scoreboard targets.',
    defaultDrinks: 1,
  },
  {
    type: 'IMMUNITY',
    label: 'Grant Immunity',
    shortBadge: 'Immunity 🛡️',
    description: 'Grants the current singer immunity from drinks until their next turn.',
    defaultDrinks: 0,
  },
];

const threeWordsDares: DareItem[] = [
  { id: "Pick someone to drink.", text: "Pick someone to drink.", interactiveType: 'SINGER_PICKER', drinkCount: 1, config: { selectCount: 1 } },
  { id: "Everyone except you drinks.", text: "Everyone except you drinks.", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'EVERYONE_EXCEPT_SINGER' } },
  { id: "Spin the wheel! 1 random player drinks.", text: "Spin the wheel! 1 random player drinks.", interactiveType: 'WHEEL_SPIN', drinkCount: 1, config: { selectCount: 1 } },
  { id: "Spin the wheel! 1 random player drinks twice.", text: "Spin the wheel! 1 random player drinks twice.", interactiveType: 'WHEEL_SPIN', drinkCount: 2, config: { selectCount: 1 } },
  { id: "Spin the wheel! 2 random players drink.", text: "Spin the wheel! 2 random players drink.", interactiveType: 'WHEEL_SPIN', drinkCount: 1, config: { selectCount: 2 } },
  { id: "Choose two persons to drink.", text: "Choose two persons to drink.", interactiveType: 'SINGER_PICKER', drinkCount: 1, config: { selectCount: 2 } },
  { id: "Spin the wheel! 3 random players drink twice.", text: "Spin the wheel! 3 random players drink twice.", interactiveType: 'WHEEL_SPIN', drinkCount: 2, config: { selectCount: 3 } },
  { id: "Choose two persons to drink twice.", text: "Choose two persons to drink twice.", interactiveType: 'SINGER_PICKER', drinkCount: 2, config: { selectCount: 2 } },
  { id: "Choose three persons to drink.", text: "Choose three persons to drink.", interactiveType: 'SINGER_PICKER', drinkCount: 1, config: { selectCount: 3 } },
  { id: "You’re immune until your next turn.", text: "You’re immune until your next turn.", interactiveType: 'IMMUNITY', drinkCount: 0 },
  { id: "Make a rule. First one who breaks it drinks.", text: "Make a rule. First one who breaks it drinks.", interactiveType: 'ONGOING_RULE', drinkCount: 1, config: { requiresCustomRuleText: true, defaultRuleText: '' } },
  { id: "Force two people to switch seats with anyone (or with you). Anyone who refuses drinks twice.", text: "Force two people to switch seats with anyone (or with you). Anyone who refuses drinks twice.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 2 },
  { id: "Dare someone of your choice. If they refuse, they drink.", text: "Dare someone of your choice. If they refuse, they drink.", interactiveType: 'SINGER_PICKER', drinkCount: 1, config: { selectCount: 1 } },
  { id: "Everyone who has a lower score than you drinks twice.", text: "Everyone who has a lower score than you drinks twice.", interactiveType: 'AUTO_DRINK', drinkCount: 2, config: { autoTarget: 'LOWER_SCORE_THAN_SINGER' } },
  { id: "All phones except yours must be hidden in pockets, purses, or bags. The first person to use theirs drinks thrice.", text: "All phones except yours must be hidden in pockets, purses, or bags. The first person to use theirs drinks thrice.", interactiveType: 'ONGOING_RULE', drinkCount: 3, config: { requiresCustomRuleText: false, defaultRuleText: 'No phones allowed (except {singer})' } },
  { id: "Everyone who has a higher score than you drinks twice.", text: "Everyone who has a higher score than you drinks twice.", interactiveType: 'AUTO_DRINK', drinkCount: 2, config: { autoTarget: 'HIGHER_SCORE_THAN_SINGER' } },
  { id: "The Person who has the most Green in their score Drinks Except You", text: "The Person who has the most Green in their score Drinks Except You", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'MOST_GREEN', excludeSinger: true } },
  { id: "The Person who has the most Red in their score Drinks Except You", text: "The Person who has the most Red in their score Drinks Except You", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'MOST_RED', excludeSinger: true } },
  { id: "The Person who has the most Orange in their score Drinks Except You", text: "The Person who has the most Orange in their score Drinks Except You", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'MOST_ORANGE', excludeSinger: true } },
  { id: "The Person who has the most Yellow in their score Drinks Except You", text: "The Person who has the most Yellow in their score Drinks Except You", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'MOST_YELLOW', excludeSinger: true } },
  { id: "The Person who has the least Green in their score Drinks Except You", text: "The Person who has the least Green in their score Drinks Except You", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'LEAST_GREEN', excludeSinger: true } },
  { id: "The Person who has the least Red in their score Drinks Except You", text: "The Person who has the least Red in their score Drinks Except You", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'LEAST_RED', excludeSinger: true } },
  { id: "The Person who has the least Orange in their score Drinks Except You", text: "The Person who has the least Orange in their score Drinks Except You", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'LEAST_ORANGE', excludeSinger: true } },
  { id: "The Person who has the least Yellow in their score Drinks Except You", text: "The Person who has the least Yellow in their score Drinks Except You", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'LEAST_YELLOW', excludeSinger: true } },
  { id: "All players younger than you drink.", text: "All players younger than you drink.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "All players older than you drink.", text: "All players older than you drink.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "Name Everyone's Full name. Everyone you named correct Drink once ", text: "Name Everyone's Full name. Everyone you named correct Drink once ", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
];

const twoWordsDares: DareItem[] = [
  { id: "Everyone including you drinks.", text: "Everyone including you drinks.", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'EVERYONE_INCLUDING_SINGER' } },
  { id: "Everyone votes on who drinks.", text: "Everyone votes on who drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "All girls drink.", text: "All girls drink.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "All boys drink.", text: "All boys drink.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "All LGBT drink.", text: "All LGBT drink.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "The oldest person drinks.", text: "The oldest person drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "Youngest person drinks.", text: "Youngest person drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "The person with the most pets drinks.", text: "The person with the most pets drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "Anyone sitting on the bed or floor drinks.", text: "Anyone sitting on the bed or floor drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "Everyone wearing stripes drinks.", text: "Everyone wearing stripes drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "Everyone who's wearing a plain shirt drinks.", text: "Everyone who's wearing a plain shirt drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "Everyone wearing above the knee shorts or skirts drinks.", text: "Everyone wearing above the knee shorts or skirts drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "Everyone who owns an iPhone drinks.", text: "Everyone who owns an iPhone drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "Everyone who owns an Android drinks.", text: "Everyone who owns an Android drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "The next person who's birthday is upcoming starting from today drinks twice.", text: "The next person who's birthday is upcoming starting from today drinks twice.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 2 },
  { id: "Anyone with their partner present drink twice.", text: "Anyone with their partner present drink twice.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 2 },
  { id: "First, second, and third player drink twice.", text: "First, second, and third player drink twice.", interactiveType: 'AUTO_DRINK', drinkCount: 2, config: { autoTarget: 'FIRST_THREE_PLAYERS' } },
  { id: "The last person to raise their hand drinks.", text: "The last person to raise their hand drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "Last person to stand up drinks.", text: "Last person to stand up drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "Last person who's in first place in the scoreboard drinks twice.", text: "Last person who's in first place in the scoreboard drinks twice.", interactiveType: 'AUTO_DRINK', drinkCount: 2, config: { autoTarget: 'FIRST_PLACE' } },
  { id: "The person who reads this aloud drinks. If no one reads, last person that sang drink.", text: "The person who reads this aloud drinks. If no one reads, last person that sang drink.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "All phones must be hidden in pockets, purses, or bags. The first person to use theirs drinks thrice.", text: "All phones must be hidden in pockets, purses, or bags. The first person to use theirs drinks thrice.", interactiveType: 'ONGOING_RULE', drinkCount: 3, config: { requiresCustomRuleText: false, defaultRuleText: 'No phones allowed for anyone' } },
  { id: "Everyone must speak in one-syllable words, except the singer. The first to fail drinks.", text: "Everyone must speak in one-syllable words, except the singer. The first to fail drinks.", interactiveType: 'ONGOING_RULE', drinkCount: 1, config: { requiresCustomRuleText: false, defaultRuleText: 'Speak only in 1-syllable words (except {singer})' } },
  { id: "Challenge someone to rock-paper-scissors. Loser drinks twice.", text: "Challenge someone to rock-paper-scissors. Loser drinks twice.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 2 },
  { id: "Play Two Truths and a Lie with three persons of your choice. Losers drink.", text: "Play Two Truths and a Lie with three persons of your choice. Losers drink.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "Pick two persons to enter like a WWE wrestler from outside the room and make a signature pose. The worst one drinks, if they refuse drink twice.", text: "Pick two persons to enter like a WWE wrestler from outside the room and make a signature pose. The worst one drinks, if they refuse drink twice.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 2 },
  { id: "Everyone must give you a genuine compliment. The person whose compliment you think is fake or worst drinks.", text: "Everyone must give you a genuine compliment. The person whose compliment you think is fake or worst drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "The Person who has the most Green in their score Drinks", text: "The Person who has the most Green in their score Drinks", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'MOST_GREEN', excludeSinger: false } },
  { id: "The Person who has the most Red in their score Drinks", text: "The Person who has the most Red in their score Drinks", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'MOST_RED', excludeSinger: false } },
  { id: "The Person who has the most Orange in their score Drinks", text: "The Person who has the most Orange in their score Drinks", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'MOST_ORANGE', excludeSinger: false } },
  { id: "The Person who has the most Yellow in their score Drinks", text: "The Person who has the most Yellow in their score Drinks", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'MOST_YELLOW', excludeSinger: false } },
  { id: "The Person who has the least Green in their score Drinks", text: "The Person who has the least Green in their score Drinks", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'LEAST_GREEN', excludeSinger: false } },
  { id: "The Person who has the least Red in their score Drinks", text: "The Person who has the least Red in their score Drinks", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'LEAST_RED', excludeSinger: false } },
  { id: "The Person who has the least Orange in their score Drinks", text: "The Person who has the least Orange in their score Drinks", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'LEAST_ORANGE', excludeSinger: false } },
  { id: "The Person who has the least Yellow in their score Drinks", text: "The Person who has the least Yellow in their score Drinks", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'LEAST_YELLOW', excludeSinger: false } },
  { id: "Everyone Who's not wearing a watch Drink twice", text: "Everyone Who's not wearing a watch Drink twice", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 2 },
];

const oneWordDares: DareItem[] = [
  { id: "Drink.", text: "Drink.", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'SINGER' } },
  { id: "Pick someone to drink with you.", text: "Pick someone to drink with you.", interactiveType: 'SINGER_PICKER', drinkCount: 1, config: { selectCount: 1, includeSingerInDrink: true } },
  { id: "Spin the wheel! You drink with the player it lands on.", text: "Spin the wheel! You drink with the player it lands on.", interactiveType: 'WHEEL_SPIN', drinkCount: 1, config: { selectCount: 1, includeSingerInDrink: true } },
  { id: "You drink with the person above you on the scoreboard.", text: "You drink with the person above you on the scoreboard.", interactiveType: 'AUTO_DRINK', drinkCount: 1, config: { autoTarget: 'PLAYER_ABOVE_SINGER', includeSingerInDrink: true } },
  { id: "Do 5 pushups or drink.", text: "Do 5 pushups or drink.", interactiveType: 'PASS_OR_DRINK', drinkCount: 1 },
  { id: "Dance solo for 30 seconds or drink twice.", text: "Dance solo for 30 seconds or drink twice.", interactiveType: 'PASS_OR_DRINK', drinkCount: 2 },
  { id: "Talk like a robot until your next turn or drink.", text: "Talk like a robot until your next turn or drink.", interactiveType: 'ONGOING_RULE', drinkCount: 1, config: { requiresCustomRuleText: false, defaultRuleText: '{singer}: Talk like a robot until your next turn', canRefuseRuleForDrinks: 1 } },
  { id: "Dance with anyone you want for 30 seconds. Person who refuses drinks.", text: "Dance with anyone you want for 30 seconds. Person who refuses drinks.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "Spin the wheel and say a pickup line to that player. If they don’t smile, you drink.", text: "Spin the wheel and say a pickup line to that player. If they don’t smile, you drink.", interactiveType: 'WHEEL_SPIN', drinkCount: 1, config: { selectCount: 1, wheelNeedsFollowupPicker: true } },
  { id: "Choose someone, make him or her laugh without talking. If that person laughs they drink, otherwise you drink.", text: "Choose someone, make him or her laugh without talking. If that person laughs they drink, otherwise you drink.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 1 },
  { id: "Spin 10 times in 25 seconds or drink twice.", text: "Spin 10 times in 25 seconds or drink twice.", interactiveType: 'PASS_OR_DRINK', drinkCount: 2 },
  { id: "Wear a blindfold. Someone will put something in your hand and you have to guess what it is. If you don't guess it, you drink twice.", text: "Wear a blindfold. Someone will put something in your hand and you have to guess what it is. If you don't guess it, you drink twice.", interactiveType: 'PASS_OR_DRINK', drinkCount: 2 },
  { id: "Name all the players using their full name (not including middle name). For every person you misname, you drink.", text: "Name all the players using their full name (not including middle name). For every person you misname, you drink.", interactiveType: 'COUNT_PICKER', drinkCount: 1 },
  { id: "Call someone in your contacts if he/she doesn't answer within 15 seconds you drink thrice", text: "Call someone in your contacts if he/she doesn't answer within 15 seconds you drink thrice", interactiveType: 'PASS_OR_DRINK', drinkCount: 3 },
  { id: "Name The 7 Deadly Sins Starting From Wrath Every Missed One You Drink ", text: "Name The 7 Deadly Sins Starting From Wrath Every Missed One You Drink ", interactiveType: 'COUNT_PICKER', drinkCount: 1 },
  { id: "Name The 7 Wonders of The world If you can name all don't drink, if you can name atleast 3 Drink once else Drink twice", text: "Name The 7 Wonders of The world If you can name all don't drink, if you can name atleast 3 Drink once else Drink twice", interactiveType: 'PASS_OR_DRINK', drinkCount: 2 },
  { id: "In Pokemon, Name Atleast 5 out of 8 Eeveelutions or Drink Twice", text: "In Pokemon, Name Atleast 5 out of 8 Eeveelutions or Drink Twice", interactiveType: 'PASS_OR_DRINK', drinkCount: 2 },
  { id: "Drink with the person above you on the scoreboard twice", text: "Drink with the person above you on the scoreboard twice", interactiveType: 'AUTO_DRINK', drinkCount: 2, config: { autoTarget: 'PLAYER_ABOVE_SINGER', includeSingerInDrink: true } },
];

const zeroWordsDares: DareItem[] = [
  { id: "Drink For every Sylable you have in your last name", text: "Drink For every Sylable you have in your last name", interactiveType: 'COUNT_PICKER', drinkCount: 1 },
  { id: "Drink twice.", text: "Drink twice.", interactiveType: 'AUTO_DRINK', drinkCount: 2, config: { autoTarget: 'SINGER' } },
  { id: "Drink thrice.", text: "Drink thrice.", interactiveType: 'AUTO_DRINK', drinkCount: 3, config: { autoTarget: 'SINGER' } },
  { id: "The person who first initiated this gathering drinks thrice.", text: "The person who first initiated this gathering drinks thrice.", interactiveType: 'ADMIN_GROUP_PICKER', drinkCount: 3 },
  { id: "Drink twice for every 2 green scores you have.", text: "Drink twice for every 2 green scores you have.", interactiveType: 'AUTO_DRINK', drinkCount: 2, config: { autoTarget: 'SINGER_PER_2_GREEN' } },
  { id: "Drink twice for every 3 red scores you have.", text: "Drink twice for every 3 red scores you have.", interactiveType: 'AUTO_DRINK', drinkCount: 2, config: { autoTarget: 'SINGER_PER_3_RED' } },
  { id: "Do a coin flip. If it's heads you drink, if it's tails you drink twice.", text: "Do a coin flip. If it's heads you drink, if it's tails you drink twice.", interactiveType: 'PASS_OR_DRINK', drinkCount: 2 },
  { id: "Do 15 pushups or drink thrice.", text: "Do 15 pushups or drink thrice.", interactiveType: 'PASS_OR_DRINK', drinkCount: 3 },
  { id: "Name all the players using their full name (not including middle name). For every person you misname, you drink twice.", text: "Name all the players using their full name (not including middle name). For every person you misname, you drink twice.", interactiveType: 'COUNT_PICKER', drinkCount: 2 },
  { id: "Spin the wheel and arm wrestle that player. Loser drinks twice.", text: "Spin the wheel and arm wrestle that player. Loser drinks twice.", interactiveType: 'WHEEL_SPIN', drinkCount: 2, config: { selectCount: 1, wheelNeedsFollowupPicker: true } },
  { id: "Spin the wheel! That player challenges you to Two Truths and a Lie. Fail = 3 drinks, Win = 1 drink.", text: "Spin the wheel! That player challenges you to Two Truths and a Lie. Fail = 3 drinks, Win = 1 drink.", interactiveType: 'WHEEL_SPIN', drinkCount: 3, config: { selectCount: 1, wheelNeedsFollowupPicker: true } },
  { id: "Speak only in your customer service voice and in English until the third song ends or drink twice.", text: "Speak only in your customer service voice and in English until the third song ends or drink twice.", interactiveType: 'ONGOING_RULE', drinkCount: 2, config: { requiresCustomRuleText: false, defaultRuleText: '{singer}: Speak only in customer service voice in English', canRefuseRuleForDrinks: 2 } },
  { id: "Announce everything you do for the next 3 songs before doing it, including reaction and movement, or drink twice.", text: "Announce everything you do for the next 3 songs before doing it, including reaction and movement, or drink twice.", interactiveType: 'ONGOING_RULE', drinkCount: 2, config: { requiresCustomRuleText: false, defaultRuleText: '{singer}: Announce everything before doing it', canRefuseRuleForDrinks: 2 } },
  { id: "Someone sends you a photo. Set it as your wallpaper, take a screenshot, and post it on your story. You can’t remove it until the game ends or drink thrice.", text: "Someone sends you a photo. Set it as your wallpaper, take a screenshot, and post it on your story. You can’t remove it until the game ends or drink thrice.", interactiveType: 'PASS_OR_DRINK', drinkCount: 3 },
  { id: "Let someone go through your phone gallery and you drink once, or refuse and drink thrice.", text: "Let someone go through your phone gallery and you drink once, or refuse and drink thrice.", interactiveType: 'PASS_OR_DRINK', drinkCount: 3 },
  { id: "Let someone draw on your face using a marker, pen, or lipstick and you can't remove it until the game ends or drink thrice.", text: "Let someone draw on your face using a marker, pen, or lipstick and you can't remove it until the game ends or drink thrice.", interactiveType: 'PASS_OR_DRINK', drinkCount: 3 },
  { id: "Spin the wheel! Let that player call anyone on your messenger for 5 minutes. If you refuse, drink thrice.", text: "Spin the wheel! Let that player call anyone on your messenger for 5 minutes. If you refuse, drink thrice.", interactiveType: 'WHEEL_SPIN', drinkCount: 3, config: { selectCount: 1, wheelNeedsFollowupPicker: true } },
  { id: "Buy something outside alone, using your own money or a volunteer’s. If you refuse, drink thrice.", text: "Buy something outside alone, using your own money or a volunteer’s. If you refuse, drink thrice.", interactiveType: 'PASS_OR_DRINK', drinkCount: 3 },
  { id: "Play Rock Paper Scisor with everyone. Every time you lose you drink.", text: "Play Rock Paper Scisor with everyone. Every time you lose you drink.", interactiveType: 'COUNT_PICKER', drinkCount: 1 },
  { id: "Name The 9 Planets Drink for Every Planet Missed", text: "Name The 9 Planets Drink for Every Planet Missed", interactiveType: 'COUNT_PICKER', drinkCount: 1 },
];

export const dares: DareChallenges = {
  threeWords: threeWordsDares,
  twoWords: twoWordsDares,
  oneWord: oneWordDares,
  zeroWords: zeroWordsDares,
  challenge: [
    ...threeWordsDares,
    ...twoWordsDares,
    ...oneWordDares,
    ...zeroWordsDares,
  ],
};
