// Texts for /help. Edit freely; restart the bot afterwards.
//
// CATEGORIES: the sections shown in /help, in order.
//   commands: command names (without /) shown in that section
//   features: things that aren't commands (automatic stuff), shown as notes
// COMMANDS: the explanation for each command, plus which subcommands are
//   admin-only (marked 🔒).
//
// Subcommands, options and their short descriptions are read from the
// commands themselves, so they're always up to date. A command missing here
// still appears in /help, under "Other".
const { CAFFEINE_LIMIT, ALCOHOL_LIMIT } = require('./drinksMenu');
const { TRIES_PER_DAY } = require('../services/halloween');

const CATEGORIES = [
  {
    id: 'economy',
    emoji: '💰',
    name: 'Economy',
    intro:
      'NestCoins are the currency of the Nest. You earn them with games, streaks, achievements and loot drops, and spend them in the café & bar, the shop, on duels and AI extras.',
    commands: ['daily', 'balance', 'leaderboard', 'shop', 'gamble', 'drop'],
    features: [
      {
        name: '💰 Loot drops',
        text: 'A few times a day a coin pouch appears in a random channel. The first person to click **Claim** gets the coins.',
      },
    ],
  },
  {
    id: 'games',
    emoji: '🎮',
    name: 'Daily games',
    intro:
      'Two daily challenges that reset at midnight. Play every day to build a streak.',
    commands: ['nestword', 'puzzle'],
    features: [
      {
        name: '🔥 Streaks',
        text: 'Solving on consecutive days gives **+10% per day** (up to +50%), plus big one-time bonuses on day 7, 14, 30 and 100.',
      },
      {
        name: '📣 Announcements',
        text: "Every new puzzle is posted in the puzzle channel with a button to open it. After midnight NestBot also posts who solved yesterday's NestWord and Puzzle.",
      },
    ],
  },
  {
    id: 'drinks',
    emoji: '🍹',
    name: 'Café & Bar',
    intro:
      'The Nest Café & Bar: coffee, tea (lots of black tea), hot chocolate, cocktails, beer and wine. Order for yourself or treat your friends. Every drink comes with a picture.',
    commands: ['drinks'],
    features: [
      {
        name: '🍀 Little surprises',
        text: 'Latte art on milky drinks, the occasional drink **on the house**, and a drink streak for every day in a row.',
      },
      {
        name: '⛔ Daily limits',
        text: `After ${CAFFEINE_LIMIT} caffeinated drinks NestBot cuts you off, after ${ALCOHOL_LIMIT} alcoholic ones the bar closes for you. Herbal tea, hot chocolate and the alcohol-free Nest Sunrise are always fine.`,
      },
    ],
  },
  {
    id: 'competition',
    emoji: '⚔️',
    name: 'Tournaments & duels',
    intro:
      'Compete for coins: organized tournaments or quick one-on-one duels.',
    commands: ['event', 'duel'],
  },
  {
    id: 'progress',
    emoji: '🏅',
    name: 'Profile & achievements',
    intro:
      'Everything you do in the Nest is tracked: games, drinks, duels, tournaments, gags.',
    commands: ['profile', 'achievements'],
    features: [
      {
        name: '🏅 Achievements',
        text: 'Unlock automatically while you play and pay coins. Some are secret. NestBot announces every unlock in chat.',
      },
    ],
  },
  {
    id: 'ai',
    emoji: '🤖',
    name: 'NestBot AI',
    intro:
      "NestBot is the Nest's caretaker: dry, witty, a little sassy, but helpful.",
    commands: ['ai', 'memory'],
    features: [
      {
        name: '💬 Chatting',
        text: 'Type **@NestBot** with your message to talk to her. She sees the last few messages in the channel. Replying to her messages without the @ does nothing.',
      },
    ],
  },
  {
    id: 'fun',
    emoji: '🔇',
    name: 'Fun moderation',
    intro: 'Playful punishments: the wheel and gags.',
    commands: ['wheel', 'ungag'],
    features: [
      {
        name: '🔇 Gags',
        text: 'A gagged member’s messages are replaced with garbled “mmph” versions until the gag runs out. Spamming while gagged doubles the time. Gags come from shop items, the wheel and Halloween tricks.',
      },
    ],
  },
  {
    id: 'social',
    emoji: '🎂',
    name: 'Social',
    intro: 'Birthdays and the weekly picture leaderboard.',
    commands: ['birthday', 'pictracker'],
  },
  {
    id: 'halloween',
    emoji: '🎃',
    name: 'Halloween',
    intro: 'Only on October 31.',
    commands: ['trickortreat'],
    features: [
      {
        name: '👻 Halloween day',
        text: `${TRIES_PER_DAY} trick-or-treat tries, spooky drinks (🧪 Witch's Brew, 🩸 Vampire Latte), haunted loot drops twice as often, and a spooky NestBot.`,
      },
    ],
  },
  {
    id: 'help',
    emoji: '❓',
    name: 'Help',
    intro: 'This command.',
    commands: ['help'],
  },
];

const COMMANDS = {
  // 💰 Economy
  daily: {
    explain: 'Claim free NestCoins once per day. Resets at midnight.',
  },
  balance: {
    explain:
      "Check your coins or someone else's, and send coins to other members.",
    admin: ['grant', 'remove'],
  },
  leaderboard: { explain: 'The richest members of the Nest.' },
  shop: {
    explain:
      'Buy items with NestCoins. Some items have effects, like gagging another member.',
    admin: ['add', 'remove'],
    tips: 'Admins: an item gags its target when its description contains `[effect:gag;duration:300]` (seconds).',
  },
  gamble: {
    explain: 'Bet 5 coins on the Nest Roulette. Feeling lucky?',
  },
  drop: {
    explain:
      'Settings for the automatic loot drops: see their status, or stop drops in certain channels.',
    admin: ['status', 'blacklist'],
  },

  // 🎮 Games
  nestword: {
    explain:
      'A Wordle-style word game. Every day there is a new word with 3–7 letters. 🟩 = right letter, right spot; 🟨 = right letter, wrong spot. Fewer letters means more attempts.',
    admin: ['set', 'pool-bulkadd', 'pool-remove', 'pool-list', 'pool-clear'],
    tips: 'Ask @NestBot for a hint if you’re stuck.',
  },
  puzzle: {
    explain:
      'A new puzzle every day, announced in the puzzle channel. Open it, find the code and enter it with `/puzzle solve`. Harder puzzles pay more, and the first three solvers get a bonus (🥇 +15, 🥈 +10, 🥉 +5). You have 10 tries per day.',
    admin: ['set', 'queue', 'remove', 'channel'],
    tips: 'Use `/puzzle history` to replay old puzzles and `/puzzle leaderboard` to see the best solvers. Admins: setting a puzzle again for the same day replaces it but keeps its solvers.',
  },

  // 🍹 Café & Bar
  drinks: {
    explain:
      'Order a drink for yourself or gift one to a friend (with a note on the cup). Start typing in the `drink` option to search, e.g. "tea", "earl" or "beer". Each drink costs a few coins and is served with a picture.',
    tips: 'See everything with `/drinks menu`, or just one section with `/drinks menu category:`.',
  },

  // ⚔️ Competition
  event: {
    explain:
      'Tournaments with a coin prize pool, either single elimination or Swiss system. Admins create the event and enter results; everyone can join and follow the bracket. The top 3 get paid automatically.',
    admin: ['create', 'finish', 'add-user', 'pairings', 'win'],
  },
  duel: {
    explain:
      'Challenge someone to rock-paper-scissors. Both bet the same amount, the winner takes both. Moves stay hidden until both have picked. Three ties in a row is a draw and both get their coins back.',
  },

  // 🏅 Progress
  profile: {
    explain:
      'Your stats in one place: coins and rank, puzzles, NestWord, tournaments, duels, drinks, pictures, achievements.',
  },
  achievements: {
    explain: 'All achievements, which ones you have, and what the others need.',
  },

  // 🤖 AI
  ai: {
    explain:
      'Extras with NestBot’s AI: check her status, or pay coins for a roast, a compliment or a poem about someone (refunded if she fails), or change her mood for the rest of the day.',
  },
  memory: {
    explain:
      'Tell NestBot things about you to remember (up to 10), like your favorite drink or your pet’s name. She uses them when you chat. Nothing is saved unless you add it yourself.',
  },

  // 🔇 Fun
  wheel: {
    explain:
      'Spin the punishment wheel. Spinning for yourself is free; spinning for someone else costs coins. Some entries gag the target.',
    admin: ['add', 'remove'],
  },
  ungag: {
    explain: 'Remove a gag early.',
    admin: ['*'],
  },

  // 🎂 Social
  birthday: {
    explain:
      'Save your birthday. On the day NestBot congratulates you and gives you coins.',
    admin: ['channel', 'announce'],
    tips: 'Admins can also add and remove birthdays for others.',
  },
  pictracker: {
    explain:
      'Counts pictures posted in the picture channel. Every Monday the weekly leaderboard is posted and active posters get coins.',
    admin: ['reset', 'setchannel'],
  },

  // 🎃 Halloween
  trickortreat: {
    explain:
      'Knock on spooky doors: candy and coins, or a trick (a ghost steals coins, a witch takes your voice…). Only on Halloween.',
  },

  // ❓
  help: {
    explain:
      'Shows this overview. Pick a category, or look up one command (start typing to search).',
  },
};

module.exports = { CATEGORIES, COMMANDS };
