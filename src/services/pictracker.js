// Weekly picture leaderboard: counts images posted in the tracked channel
// (set with /pictracker setchannel) and pays rewards every Monday.
const db = require('../utils/db');
const nestcoins = require('./nestcoins');
const { runEvery } = require('../utils/schedule');

const REWARD_THRESHOLD = 10; // pictures per week to earn the reward
const REWARD_COINS = 50;
const TOP_BONUS_COINS = 30; // extra for #1

/** Start (Monday 00:00) and end (next Monday) of the current week, as timestamps. */
function getWeekRange() {
  const now = new Date();
  const diffToMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return { start: monday.getTime(), end: nextMonday.getTime() };
}

/** Called for every message: counts images posted in the tracked channel. */
function countImages(message) {
  if (!message.attachments.size) return;
  const guildId = message.guild.id;
  const trackedChannel = db.read(data => data.pictracker?.[guildId]?.channelId);
  if (!trackedChannel || message.channelId !== trackedChannel) return;

  const images = [...message.attachments.values()].filter(a =>
    a.contentType?.startsWith('image/'),
  );
  if (images.length === 0) return;

  db.perform(data => {
    let board = data.pictracker[guildId];
    if (Date.now() > board.end) {
      board = data.pictracker[guildId] = {
        users: {},
        ...getWeekRange(),
        channelId: board.channelId,
      };
    }
    board.users[message.author.id] =
      (board.users[message.author.id] || 0) + images.length;
  });
}

// When a week is over: post the leaderboard, pay rewards, start a new week
function finishWeeks(client) {
  db.perform(data => {
    for (const guildId of Object.keys(data.pictracker || {})) {
      const board = data.pictracker[guildId];
      if (!board || Date.now() < board.end) continue;

      const channel = board.channelId
        ? client.guilds.cache.get(guildId)?.channels.cache.get(board.channelId)
        : null;
      if (!channel) continue;

      const entries = Object.entries(board.users || {});
      if (entries.length === 0) continue;

      const sorted = entries.sort((a, b) => b[1] - a[1]);
      const leaderboard = sorted
        .slice(0, 10)
        .map(([id, count], i) => `**#${i + 1}** <@${id}> — ${count} 🖼️`)
        .join('\n');
      channel
        .send(`🏆 **Weekly Picture Leaderboard** 🏆\n\n${leaderboard}`)
        .catch(console.error);

      const rewarded = [];
      for (const [userId, count] of entries) {
        if (count >= REWARD_THRESHOLD) {
          nestcoins.addCoins(guildId, userId, REWARD_COINS);
          rewarded.push(`<@${userId}> +${REWARD_COINS} 🪙 (${count} pics)`);
        }
      }
      const topUserId = sorted[0][0];
      nestcoins.addCoins(guildId, topUserId, TOP_BONUS_COINS);
      rewarded.push(
        `💎 <@${topUserId}> gets **+${TOP_BONUS_COINS} bonus coins** for #1!`,
      );

      channel
        .send(`💰 **Rewards distributed:**\n${rewarded.join('\n')}`)
        .catch(console.error);

      data.pictracker[guildId] = {
        users: {},
        ...getWeekRange(),
        channelId: board.channelId,
      };
    }
  });
}

/** Called once when the bot is ready. */
function startPicTracker(client) {
  runEvery('PicTracker', 30, () => finishWeeks(client));
}

module.exports = { getWeekRange, countImages, startPicTracker };
