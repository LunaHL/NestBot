// Runs once when the bot has logged in: starts all background jobs.
const ai = require('../services/ai');
const nestword = require('../commands/nestword');
const { startCleanup } = require('../services/cleanup');
const { startHalloween } = require('../services/halloween');
const { startScoreboard } = require('../services/scoreboard');
const { startPicTracker } = require('../services/pictracker');
const { startPuzzleAnnouncer } = require('../services/puzzle');
const { startWordle } = require('../services/wordle');

module.exports = function onReady(client) {
  console.log(`✅ Logged in as ${client.user.tag}`);

  nestword.initDailyPicker(); // picks today's word
  startScoreboard(client); // posts yesterday's results after midnight
  startPuzzleAnnouncer(client); // posts today's puzzle in the puzzle channel
  startWordle(client); // pays Wordle app results the bot missed while offline
  startPicTracker(client); // weekly picture leaderboard
  startCleanup(); // moves old data to the archive
  startHalloween(client); // Halloween announcement (Oct 31 only)
  ai.checkModels(); // warns if the configured Gemini models don't exist

  // Jobs that live inside command files (birthdays, loot drops)
  for (const command of client.commands.values()) {
    if (command.schedule) command.schedule(client);
  }
};
