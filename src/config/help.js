// Texts for /help. Edit freely; restart the bot afterwards.
//
// CATEGORIES: the sections shown in /help, in order.
//   commands: command names (without /) shown in that section
//   features: things that aren't commands (automatic stuff), shown as notes.
//     `text` can also be a function (guildId) => text for server-dependent texts
// COMMANDS: the explanation for each command, plus which subcommands are
//   admin-only (marked 🔒).
//
// Subcommands, options and their short descriptions are read from the
// commands themselves, so they're always up to date. A command missing here
// still appears in /help, under "Other".
const { CAFFEINE_LIMIT, ALCOHOL_LIMIT } = require('./drinksMenu');
const { TRIES_PER_DAY } = require('../services/halloween');
const { describeStreakRule } = require('../utils/streak');
const { getStreakMode } = require('../services/settings');
const { rewardsTable } = require('../services/wordle');
const { isFreeMode } = require('../services/nestcoins');

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
        name: '🎉 Free mode',
        // Shown live: depends on /settings free
        text: guildId =>
          isFreeMode(guildId)
            ? '**Active right now:** drinks, shop items, AI extras and targeted wheel spins cost nothing. You still earn coins as usual.'
            : 'Admins can make everything you can buy free for a while with `/settings free`.',
      },
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
      'Daily challenges that reset at midnight: NestWord, the Puzzle of the Day and the Wordle app. Play every day to build a streak.',
    commands: ['nestword', 'puzzle', 'wordle'],
    features: [
      {
        name: '🔥 Streaks',
        // A function: the text depends on the server's /settings streak mode
        text: guildId => describeStreakRule(getStreakMode(guildId)),
      },
      {
        name: '🟩 Wordle app rewards',
        text:
          'Play the **Wordle app** in the Wordle channel. When it posts the daily results, NestBot pays everyone automatically:\n' +
          rewardsTable(),
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
    id: 'movies',
    emoji: '🍿',
    name: 'Movie nights',
    intro:
      'Watch movies, series and anime together, each on your own device: NestBot keeps everyone in sync. No voice channel needed.',
    commands: ['watch', 'watchlist', 'group'],
    features: [
      {
        name: '🗓️ Plan & sign up',
        text: 'Plan with `/watch plan` (or `/watch now`). The calendar in #movies shows what’s coming up: one click to sign up, another to leave. Times are shown in your own time zone.',
      },
      {
        name: '🚪 Your room',
        text: 'One hour before the start, a private room opens. Signed-up people get a ping; anyone can still join with **🚪 Enter room**, even mid-movie.',
      },
      {
        name: '🗳️ Votes',
        text: 'Not sure what to watch? Plan without a title (or `/watch vote`): the room opens right away and everyone who signed up votes in it. Their watchlists add options automatically, `/watch suggest` adds more. The winner is set automatically; ties are decided by the wheel.',
      },
      {
        name: '📝 Watchlists',
        text: 'Everyone has a watchlist (`/watchlist add`): public by default, single entries can be private. After a movie night you get a **✅ mark as watched?** and can rate it ⭐1–5. `/watchlist match` shows what you all want to watch.',
      },
      {
        name: '💞 Groups',
        text: 'Couples and fixed groups get their own private channel with `/group create`, a shared watchlist with 👍 votes, and their own series progress. `/watch now` or `/watch plan` inside the group channel runs the movie night right there. Admins can technically see every channel; mute the group category if it pings you.',
      },
      {
        name: '▶️ Watching in sync',
        text: 'Pause your movie at 0:00 and press **✅ Ready**, then 3… 2… 1… ▶️. The live clock shows where everyone should be, `/watch sync` tells you if you’re ahead or behind, and anyone can press **⏸️ Pause**.',
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
    id: 'admin',
    emoji: '🛠️',
    name: 'Admin',
    intro: 'Settings for server admins.',
    commands: ['settings'],
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
  wordle: {
    explain:
      'Coins for playing the Wordle app (the Wordle activity in Discord). The app posts the results every day; NestBot reads them and pays everyone automatically, with a 👑 bonus for the best score. Nothing to type: just play.',
    admin: ['channel', 'scan'],
    tips: 'See the rewards with `/wordle rewards`. Admins: if the bot was offline, `/wordle scan` pays missed days.',
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

  // 🍿 Movie nights
  watch: {
    explain:
      'Movie nights for movies, series and anime: plan one (or start right away), sign up in the #movies calendar, get a private room, check in, and watch in sync with the live clock. Titles come with poster, length and where to stream them.',
    tips: 'Pick the title from the list while typing to get all the info. Only the planner and admins can edit, cancel or end a movie night. Rooms close automatically after a day.',
  },

  watchlist: {
    explain:
      'Your own watchlist for movies, series and anime: 📌 want to watch, ▶️ watching (with season/episode), ✅ watched with a ⭐ rating. Public by default; make the whole list or single entries 🔒 private. Set your country and streaming services so "where can I watch it?" fits you.',
    tips: 'Movie nights ask you "mark as watched?" at the end; forgot? `/watchlist pending`. Turn on `/watchlist settings notify:` to get a DM when something from your list is planned.',
  },

  group: {
    explain:
      'Watch groups and couples: your own permanent private channel, a shared watchlist with 👍 votes ("up next"), and series that continue where your group stopped. Use `/watch now` or `/watch plan` inside the group channel.',
    tips: 'The owner adds and removes people; anyone can leave. Group movie nights stay private unless the owner turns on `/group calendar`.',
  },

  // 🛠️ Admin
  settings: {
    explain:
      'Server settings. `streak` switches how Puzzle and NestWord streaks are rewarded: the new capped bonus (+10% per day, max +50%, milestones) or the old multiplier (reward × streak days, no limit). `free` makes everything you can buy free (drinks, shop, AI extras, targeted wheel spins); coins can still be earned. `watch` sets up movie nights (#movies channel, room category, mod role, timings). Without options, each shows the current state.',
    admin: ['*'],
  },

  // ❓
  help: {
    explain:
      'Shows this overview. Pick a category, or look up one command (start typing to search).',
  },
};

module.exports = { CATEGORIES, COMMANDS };
