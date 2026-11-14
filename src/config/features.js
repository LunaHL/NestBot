// Which features are on when nobody changed them: true = on, false = off.
//
// This file is only the default. Admins can switch each feature on or off
// in Discord with /settings features (stored in the database, works right
// away, no restart needed). "Back to file defaults" in /settings features
// goes back to what's written here.
//
// Off means invisible: the command isn't registered in Discord, and it's
// gone from /help, the hub menu, reminders, tips and what NestBot knows.
// Data (coins, streaks, stats) is never deleted, so switching a feature back
// on brings everything back as it was.
//
// After changing this file: push, pull on the server, restart the bot.

module.exports = {
  daily: false, // 💰 /daily: free coins once a day
  gamble: false, // 🎲 /gamble: Nest Roulette
  drop: false, // 💰 Loot drops: coin pouches in the chat (and /drop for admins)
  shop: false, // 🛒 The shop: buying items with coins
  nicknames: false, // 🏷️ Paid nicknames: renaming someone for coins
  wheel: false, // 🎡 The punishment wheel
  drinkgift: false, // 🎁 Gifting drinks to someone
  nestword: false, // 🟩 NestWord (the Wordle app does the same)
  event: false, // 🏆 Tournaments
  duel: false, // 🤺 Duels
  achievements: false, // 🏅 Achievements
  gag: false, // 🔇 Gags
  blindfold: false, // 🙈 Blindfolds
  remind: false, // ⏰ Reminders by DM (/remind)
  suggest: false, // 💡 Ideas: /suggest and the ideas channel
  pictures: false, // 📸 Picture leaderboard
  ai: false, // 🤖 NestBot AI: chatting with @NestBot and /ai
  watch: false, // 🍿 Movie nights
  watchlist: false, // 📝 Watchlists
  group: false, // 👥 Groups
  halloween: false, // 🎃 Halloween
  christmas: false, // 🎄 Christmas
  easter: false, // 🐣 Easter
  newyear: false, // 🥂 New Year
  hub: false, // 🪺 The hub menu (buttons in the hub channel)
  tips: false, // 💡 Short tips after commands
  usermenu: false, // 🖱️ Right-click menu (Apps → …)
};
