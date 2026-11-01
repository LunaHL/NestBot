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
    commands: ['daily', 'balance', 'shop', 'gamble', 'drop'],
    features: [
      {
        name: '🎉 Free mode',
        // Shown live: depends on /settings free
        text: guildId =>
          isFreeMode(guildId)
            ? '**Active right now:** drinks and rounds, shop items, nicknames, AI extras and targeted wheel spins cost nothing. You still earn coins as usual.'
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
    commands: ['nestword', 'puzzle'],
    features: [
      {
        name: '🔥 Streaks',
        // A function: the text depends on the server's /settings streak mode
        text: guildId => describeStreakRule(getStreakMode(guildId)),
      },
      {
        name: '🟩 Wordle app rewards',
        text:
          'Play the **Wordle app** in the Wordle channel. When it posts the daily results, NestBot pays everyone automatically (nothing to type). Your Wordle stats: `/profile tab:Games`.\n' +
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
        text: 'Plan with `/watch plan when:tomorrow 20:00` (or `/watch now`). The calendar in #movies shows what’s coming up: one click to sign up, another to leave. Times are shown in your own time zone. Everything else is a button: **⚙️** on the card or in the room changes the time or title, starts a vote, cancels or ends it (planner and admins); 🎞️ History and 🏆 Top 10 are under the calendar.',
      },
      {
        name: '🚪 Your room',
        text: 'One hour before the start, a private room opens. Signed-up people get a ping; anyone can still join with **🚪 Enter room**, even mid-movie.',
      },
      {
        name: '🗳️ Votes',
        text: 'Not sure what to watch? Plan without a title (or **⚙️ → 🗳️ Start a vote**): the room opens right away and everyone who signed up votes in it. Their watchlists add options automatically, **💡 Suggest** adds more. The winner is set automatically; ties are decided by the wheel.',
      },
      {
        name: '📝 Watchlists',
        text: 'Everyone has a watchlist (`/watchlist add`): public by default, single entries can be private. `/watchlist show` opens it: pick an entry to mark it watched, rate it, make it private, add a note or remove it; 🎲 picks something for you. After a movie night you get a **✅ mark as watched?** and can rate it ⭐1–5. `/watchlist match` shows what you all want to watch.',
      },
      {
        name: '💞 Groups',
        text: 'Couples and fixed groups get their own private channel with `/group create`, a panel (always at the bottom) with buttons for the shared watchlist (👍 votes) and 🍿 watching together, and their own series progress. Admins can technically see every channel; mute the group category if it pings you.',
      },
      {
        name: '▶️ Watching in sync',
        text: 'Pause your movie at 0:00 and press **✅ Ready**, then 3… 2… 1… ▶️. The check-in and the clock always move back to the bottom of the room when people chat. The live clock shows where everyone should be, **🔄 I’m at…** tells you if you’re ahead or behind, and anyone can press **⏸️ Pause**.',
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
      'Everything you do in the Nest is tracked: games, drinks, duels, tournaments, gags. `/profile` shows it all in tabs, `/leaderboard` ranks everyone.',
    commands: ['profile', 'leaderboard'],
    features: [
      {
        name: '🏅 Achievements',
        text: 'Unlock automatically while you play and pay coins. Some are secret. NestBot announces every unlock in chat. All of them: `/profile tab:Achievements`.',
      },
    ],
  },
  {
    id: 'ai',
    emoji: '🤖',
    name: 'NestBot AI',
    intro:
      "NestBot is the Nest's caretaker: dry, witty, a little sassy, but helpful.",
    commands: ['ai'],
    features: [
      {
        name: '💬 Chatting',
        text: 'Type **@NestBot** with your message to talk to her. She sees the last few messages in the channel. Replying to her messages without the @ does nothing.',
      },
      {
        name: '📝 She remembers things',
        text: 'Tell her: “@NestBot remember that I love Earl Grey” (up to 10 things). “@NestBot what do you know about me?” shows them with a menu to forget one; “@NestBot forget Earl Grey” or “forget everything” works too. Nothing is saved unless you ask.',
      },
    ],
  },
  {
    id: 'fun',
    emoji: '🔇',
    name: 'Fun moderation',
    intro:
      'Playful punishments: the wheel, gags, blindfolds and paid nicknames.',
    commands: ['wheel', 'ungag'],
    features: [
      {
        name: '🏷️ Paid nicknames',
        text: 'In `/shop` (🏷️ Rename someone, or `/shop nickname`): rename someone for 10 minutes (15 coins) up to a whole day (300 coins). More coins, more time. The renamed person can buy themselves out with 🔓 **Get your name back** for the same price; afterwards NestBot gives the old name back. See who’s renamed in their profile (⚔️ Duels & fun). Admins: `/settings nicknames`.',
      },
      {
        name: '✨ Effects',
        text: 'Shop items and wheel entries can **gag** (🔇), **blindfold** (🙈) or **rename** (🏷️) their target automatically. Admins pick the effect when adding them.',
      },
      {
        name: '🙈 Blindfolds',
        text: 'A blindfolded member can’t see any channel except **🕶️ in-the-dark**. There NestBot whispers what they’re missing: when someone says their name, and which channels are busy. When it comes off, NestBot DMs a summary of everything they missed. Several blindfolded people end up in the dark together. Blindfolds stack (max 3 h) and come from shop items, the wheel or admins. Admins can’t be blindfolded (Discord shows them everything).',
      },
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
    commands: ['birthday'],
    features: [
      {
        name: '📸 Picture leaderboard',
        text: 'NestBot counts pictures posted in the picture channel. Every Monday the weekly leaderboard is posted and active posters get coins. Live: `/leaderboard board:Pictures`.',
      },
    ],
  },
  {
    id: 'halloween',
    emoji: '🎃',
    name: 'Halloween',
    intro: 'Only on October 31 (the command only shows up then).',
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
    intro:
      'For server admins. Regular members don’t see these commands at all.',
    commands: ['settings', 'admin'],
  },
  {
    id: 'help',
    emoji: '❓',
    name: 'Help',
    intro: 'Three ways to find your way around.',
    commands: ['help'],
    features: [
      {
        name: '💬 Just ask NestBot',
        text: 'Write **@NestBot** and ask, e.g. “@NestBot how do movie nights work?” or “what can I buy with coins?”. She knows every feature.',
      },
      {
        name: '🖱️ Right-click someone',
        text: 'Right-click a member (on phones: tap their name) → **Apps**: 👤 View profile, 🍹 Gift a drink, 🤺 Challenge to a duel, 🏷️ Rename, 🙈 Blindfold. No commands, no typing names.',
      },
      {
        name: '🪺 The menu',
        text: 'A pinned menu in the hub channel: Daily coins, profile, shop, drinks, puzzle, movie nights… one click, no commands. Every Monday there’s a “💡 Did you know?” there too.',
      },
      {
        name: '💡 Tips',
        text: 'Now and then NestBot adds a short private tip after a command, about something related you might not know yet.',
      },
    ],
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
  },
  leaderboard: {
    explain:
      'Every ranking in one place: 💰 NestCoins, 🧩 Puzzle, 🟩 Wordle app, 🍹 Drinks, 🤺 Duels, 📸 Pictures this week, 🏅 Achievements. Pick one with `board:` or switch with the menu under the card.',
  },
  shop: {
    explain:
      'Look around with `/shop browse`: items are grouped in categories, buy from the menu. Items with an effect (🔇 gag, 🏷️ nickname) ask who it’s for, then you confirm. NestBot’s own specials: 🏷️ **Rename someone** (also `/shop nickname`), 🔓 **Get your name back** and 🙈 **Blindfold someone** (5 min = 20 coins … 1 h = 150).',
    tips: 'Admins: `/admin shop add` has `category` (reuse one while typing, or type a new one), `emoji`, and `effect` / `minutes` / `nickname` options.',
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
    tips: 'Ask @NestBot for a hint if you’re stuck.',
  },
  puzzle: {
    explain:
      'A new puzzle every day, announced in the puzzle channel. Open it, find the code, then press **🔑 Enter code** on the puzzle card (or get the card with `/puzzle info`). Harder puzzles pay more, and the first three solvers get a bonus (🥇 +15, 🥈 +10, 🥉 +5). You have 10 tries per day.',
    tips: 'Use `/puzzle history` to replay old puzzles and `/leaderboard board:Puzzle` to see the best solvers. Admins: the puzzle channel is set with `/settings channels`; setting a puzzle again for the same day replaces it but keeps its solvers.',
  },

  // 🍹 Café & Bar
  drinks: {
    explain:
      'Order a drink for yourself, gift one to a friend (with a note on the cup), or buy a whole round. Start typing in the `drink` option to search, e.g. "tea", "earl" or "beer". Each drink costs a few coins and is served with a picture.',
    tips: 'See everything with `/drinks menu`, or just one section with `/drinks menu category:`. `/drinks round`: everyone in your voice channel, everyone online or the whole server; 5+ people −10%, 10+ −20%, 20+ −30%; people at their daily limit are skipped and cost nothing. Your drink stats: `/profile tab:Drinks`, rankings: `/leaderboard board:Drinks`.',
  },

  // ⚔️ Competition
  event: {
    explain:
      'Tournaments with a coin prize pool, either single elimination or Swiss system. Admins create the event and enter results; everyone can join and follow the bracket. The top 3 get paid automatically.',
  },
  duel: {
    explain:
      'Challenge someone to rock-paper-scissors: `/duel @someone bet:`. Both bet the same amount, the winner takes both. Moves stay hidden until both have picked. Three ties in a row is a draw and both get their coins back.',
    tips: 'Your record: `/profile tab:Duels & fun`.',
  },

  // 🏅 Progress
  profile: {
    explain:
      'Everything about you (or someone else) in tabs: 📊 Overview, 🎮 Games (Puzzle, NestWord, Wordle app), 🍹 Drinks, ⚔️ Duels & fun (duels, tournaments, gags, nicknames), 🎬 Movies, 🏅 Achievements. Switch with the menu, or open one directly with `tab:`.',
    tips: 'Your own 🎬 Movies tab also shows your movie settings, only to you.',
  },

  // 🤖 AI
  ai: {
    explain:
      'Extras with NestBot’s AI: check her status, or pay coins for a roast, a compliment or a poem about someone (refunded if she fails), or change her mood for the rest of the day.',
  },

  // 🔇 Fun
  wheel: {
    explain:
      'Spin the punishment wheel. Spinning for yourself is free; spinning for someone else costs coins. Some entries gag (🔇) or rename (🏷️) the target.',
  },
  ungag: {
    explain: 'Remove a gag early.',
    admin: ['*'],
  },

  // 🎂 Social
  birthday: {
    explain:
      'Save your birthday. On the day NestBot congratulates you and gives you coins.',
    tips: 'Admins can also add and remove birthdays for others. The birthday channel is set with `/settings channels`.',
  },

  // 🎃 Halloween
  trickortreat: {
    explain:
      'Knock on spooky doors: candy and coins, or a trick (a ghost steals coins, a witch takes your voice…). Only on Halloween.',
  },

  // 🍿 Movie nights
  watch: {
    explain:
      'Movie nights for movies, series and anime: plan one (`when:` understands “tomorrow 20:00”, “friday”, “fr 21:00”) or start right away, sign up in the #movies calendar, get a private room, check in, and watch in sync with the live clock. Titles come with poster, length and where to stream them. Changing, voting, cancelling, ending and syncing are buttons on the card and in the room.',
    tips: 'Pick the title from the list while typing to get all the info. Series continue where you left off here, or from your own watchlist; `season:` / `episode:` use the seasons as people know them (also for anime that TMDB lists as one long season). Only the planner and admins can edit, cancel or end a movie night. Rooms close automatically after a day.',
  },

  watchlist: {
    explain:
      'Your own watchlist for movies, series and anime: 📌 want to watch, ▶️ watching (with season/episode), ✅ watched with a ⭐ rating. `add` (with `watched:` / `rating:` for things you already saw, `season:` / `episode:` for a series you’re in the middle of), `show` (open entries to change them; series have ⏭️ next episode watched, ⏮️ back one, 📺 set episode (also as one number for long anime) and 📋 an episode overview with ✅; movies show 📚 their movie series; 🎲 pick for me, 📬 movie nights waiting for your answer), `settings`, `match`. Public by default; make the whole list or single entries 🔒 private.',
    tips: 'Movie nights ask you "mark as watched?" at the end; forgot? `/watchlist show` → 📬. Turn on `/watchlist settings notify:` to get a DM when something from your list is planned.',
  },

  group: {
    explain:
      'Watch groups and couples: `/group create` gives you a permanent private channel with a **panel that stays at the bottom**: 📝 shared watchlist (👍 vote, watch now, mark watched, remove), ➕ add a title, 🍿 watch now or plan, 👋 leave. Series continue where your group stopped: **📺 Where are we?** in the list shows it, lets you set it (⏭️ we watched the next one, ⏮️, 📺 set episode), start ▶️ the next episode right away, and shows 📋 all episodes with ✅ (or 📚 the movie series). NestBot posts in the channel when a series you watch gets a 📢 new season or a 🆕 new episode you haven’t seen.',
    tips: 'The owner 👑 invites, removes, renames, shows the group’s nights in the public calendar or deletes the group, all in the panel. `/group list` shows your groups.',
  },

  // 🛠️ Admin
  admin: {
    explain:
      'All admin tools in one place, grouped: `/admin shop` (add, edit, remove items), `/admin wheel` (entries), `/admin puzzle` (set, queue, remove), `/admin nestword` (set a word, word pools), `/admin coins` (grant, remove), `/admin birthday announce`, `/admin event` (create, pairings, results, finish). Only admins see it.',
    admin: ['*'],
  },
  settings: {
    explain:
      'Server settings. `channels`: where NestBot posts (puzzle + ping role, Wordle app, birthdays, pictures). `tools`: one-off actions (pay missed Wordle results, reset the picture week, end all paid nicknames). `streak`: new capped streak bonus or the old multiplier. `free`: everything you can buy is free (earning works as usual). `hub`: the menu channel, the weekly “Did you know?” and how often tips come after commands. `blindfold`: set blindfolds up once (role + dark channel), switch them off again, blindfold someone or take it off. `nicknames`: paid nicknames on/off, may everyone change their own nickname, end one person’s nickname. `watch`: movie nights (#movies, room category, mod role, timings). Without options, each shows the current state.',
    admin: ['*'],
  },

  // ❓
  help: {
    explain:
      'Shows this overview. Pick a category, or look up one command (start typing to search).',
  },
};

module.exports = { CATEGORIES, COMMANDS };
