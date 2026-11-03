// Runs once when the bot has logged in: starts all background jobs.
const ai = require('../services/ai');
const nestword = require('../commands/nestword');
const { startCleanup } = require('../services/cleanup');
const { startHalloween } = require('../services/halloween');
const { startScoreboard } = require('../services/scoreboard');
const { startPicTracker } = require('../services/pictracker');
const { startPuzzleAnnouncer } = require('../services/puzzle');
const { startWordle } = require('../services/wordle');
const { startWatch } = require('../services/watch');
const { startNicknames } = require('../services/nickname');
const { startBlindfolds } = require('../services/blindfold');
const { startHub } = require('../services/hub');
const { startGroups } = require('../services/groups');
const { startSeasons } = require('../deploy-commands');

module.exports = function onReady(client) {
  console.log(`✅ Logged in as ${client.user.tag}`);

  nestword.initDailyPicker(); // picks today's word
  startScoreboard(client); // posts yesterday's results after midnight
  startPuzzleAnnouncer(client); // posts today's puzzle in the puzzle channel
  startWordle(client); // pays Wordle app results the bot missed while offline
  startWatch(client); // movie nights: reminders, rooms, live clocks
  startNicknames(client); // gives paid nicknames back when their time is up
  startBlindfolds(client); // ends blindfolds, whispers what blindfolded people miss
  startHub(client); // refreshes the hub menu, weekly "Did you know?"
  startGroups(client).catch(() => {}); // the panel in every group channel
  require('../services/series').startSeriesAlerts(client); // new seasons / episodes → group channels
  startSeasons(); // seasonal commands (/trickortreat, /christmas, /easter) appear and disappear
  require('../services/christmas').startChristmas(client); // Secret Santa draw/reveal, tree, New Year
  require('../services/easter').startEaster(client); // bunny outfits end, Easter results
  startPicTracker(client); // weekly picture leaderboard
  startCleanup(); // moves old data to the archive
  startHalloween(client); // Halloween announcement (Oct 31 only)
  ai.checkModels(); // warns if the configured Gemini models don't exist

  // Jobs that live inside command files (birthdays, loot drops)
  for (const command of client.commands.values()) {
    if (command.schedule) command.schedule(client);
  }
};
