// Daily results post: shortly after midnight, posts yesterday's NestWord and
// Puzzle results in the channel set as SCOREBOARD_CHANNEL_ID in .env.
const db = require('../utils/db');
const { localDate } = require('../utils/time');
const { runEvery } = require('../utils/schedule');

let warned = false;

function postResults(client) {
  const channel = client.channels.cache.get(process.env.SCOREBOARD_CHANNEL_ID);
  if (!channel) {
    if (!warned)
      console.log(
        '❌ Scoreboard channel invalid (check SCOREBOARD_CHANNEL_ID)',
      );
    warned = true;
    return;
  }

  const today = localDate(0);
  const yesterday = localDate(-1);

  // Only once per day
  if (db.read(data => data.scoreboardLastChecked) === today) return;
  db.perform(data => {
    data.scoreboardLastChecked = today;
  });

  const { daily, puzzle } = db.read(data => ({
    daily: data.nestwordDaily?.[yesterday],
    puzzle: data.puzzles?.[yesterday],
  }));

  // 🟩 NestWord
  if (daily?.guesses && Object.keys(daily.guesses).length > 0) {
    const lines = Object.entries(daily.guesses).map(([userId, tries]) => {
      const solved = daily.solvedBy?.includes(userId);
      return `• <@${userId}> — ${solved ? '✅' : '❌'} ${tries} tries`;
    });
    const header =
      `📊 **NestWord Results for ${yesterday}**\n` +
      `• Length: **${daily.len}**\n` +
      `• Attempts allowed: **${daily.attempts}**\n` +
      `• Reward: **${daily.reward}** NestCoins\n`;
    channel.send(`${header}\n${lines.join('\n')}`).catch(console.error);
  }

  // 🧩 Puzzle
  if (puzzle?.solvedBy?.length > 0) {
    const lines = puzzle.solvedBy.map(uid => `• <@${uid}> — ✅ solved`);
    channel
      .send(`🧩 **Puzzle Results for ${yesterday}**\n${lines.join('\n')}`)
      .catch(console.error);
  }
}

/** Called once when the bot is ready. */
function startScoreboard(client) {
  runEvery('Scoreboard', 10, () => postResults(client));
}

module.exports = { startScoreboard };
