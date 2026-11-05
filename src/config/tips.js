// Short tips NestBot sometimes adds (privately) after a command, so people
// discover related features. Key: "command" or "command subcommand".
// How often: /settings tips frequency:  (logic: services/guide.js)
module.exports = {
  daily: [
    'Spend your coins in `/shop`: rename a friend 🏷️ or buy them a blindfold 🙈.',
    'More coins every day: `/puzzle`, `/nestword` and the Wordle app all pay.',
    'See where you rank: `/leaderboard`.',
  ],
  balance: [
    'Send coins to a friend with `/balance transfer`.',
    'All rankings in one place: `/leaderboard`.',
  ],
  gamble: [
    'Feeling lucky? Challenge someone instead: `/duel @someone bet:20`.',
  ],
  shop: [
    'Renamed? 🔓 **Get your name back** in `/shop` costs what it cost them.',
    'Right-click someone → **Apps → Rename** or **Blindfold**, without opening the shop.',
  ],
  drinks: [
    'Buy everyone in voice a drink with `/drinks round`. Bigger rounds are cheaper!',
    'Gift a drink with a note on the cup: `/drinks gift`.',
    'Your drink stats: `/profile tab:Drinks`.',
    'Faster: right-click someone → **Apps → Gift a drink**.',
  ],
  'drinks round': ['Who bought the most rounds? `/leaderboard board:Drinks`.'],
  puzzle: [
    'Found the code? Press **🔑 Enter code** on the puzzle card.',
    'Your puzzle stats and streak: `/profile tab:Games`.',
    'Best solvers: `/leaderboard board:Puzzle`.',
  ],
  nestword: [
    'Stuck? Ask @NestBot for a hint.',
    'Your NestWord stats: `/profile tab:Games`.',
  ],
  profile: [
    'Switch tabs with the menu under your profile: games, drinks, movies, achievements…',
    'Someone else’s profile: right-click them → **Apps → View profile**.',
  ],
  leaderboard: ['Switch boards with the menu under the card.'],
  help: [
    'Missing something? Suggest it: `/suggest idea:` and everyone can vote.',
  ],
  wheel: ['Wheel entries can gag 🔇, blindfold 🙈 or rename 🏷️ automatically.'],
  duel: [
    'Your duel record: `/profile tab:Duels & fun`.',
    'Faster: right-click someone → **Apps → Challenge to a duel**.',
  ],
  watch: [
    'Plan with words: `/watch plan when:tomorrow 20:00`.',
    'Changed your mind? ⚙️ on the movie card changes the time, starts a vote or cancels.',
    'Out of sync during a movie? Press **🔄 I’m at…** on the clock.',
  ],
  watchlist: [
    'Open an entry in `/watchlist show` to mark it watched, rate it or hide it.',
    'Watching a series? Open it in `/watchlist show` and press ⏭️ after each episode.',
    'Can’t decide? 🎲 **Pick for me** in `/watchlist show`.',
    'What do you all want to watch? `/watchlist match @friend`.',
    'Set your streaming services so “Where can I watch it?” fits you: `/watchlist settings`.',
  ],
  group: [
    'Inside your group channel, `/watch now` starts a movie night right there.',
    'Watched an episode without the bot? 📝 Watchlist → **📺 Where are we?** → ⏭️.',
  ],
  ai: [
    'Tell @NestBot things to remember: “@NestBot remember that I love Earl Grey”.',
  ],
  suggest: [
    'Your idea got popular? Admins set it to 📋 planned and you get a DM.',
  ],
  birthday: [
    'On your birthday NestBot congratulates you and gives you coins 🎂.',
  ],
  event: ['Your tournament record: `/profile tab:Duels & fun`.'],
};
