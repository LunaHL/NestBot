// Rewards for the Wordle app (the official Wordle activity in Discord).
// Every day the app posts a summary in its channel, e.g.:
//
//   Your group is on a 12 day streak! 🔥 Here are yesterday's results:
//   👑 3/6: @Anna @Mia
//   4/6: @Luna
//   X/6: @Kim
//
// NestBot reads that message in the channel set with `/settings channels wordle:`,
// pays coins per result and keeps Wordle stats. Each day is paid only once.
// It also looks back over recent messages regularly, so summaries posted
// while the bot was offline are paid later.
//
// Data: data.wordleApp[guildId] = { channelId, days: { "YYYY-MM-DD": {...} },
//                                   users: { userId: stats } }
const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('./nestcoins');
const { formatDate, TZ } = require('../utils/time');
const { runEvery } = require('../utils/schedule');

// ---------- Rewards ----------

/** Coins per result. Keys: 1–6 = solved in that many guesses, X = not solved. */
const REWARDS = { 1: 50, 2: 35, 3: 25, 4: 15, 5: 10, 6: 5, X: 2 };
const CROWN_BONUS = 10; // best score of the day (everyone tied for best)
const SCAN_LAST_MESSAGES = 30; // how far back the catch-up looks

// ---------- Parsing ----------

/** All text of a message: content plus embed texts (in case the app uses embeds). */
function messageText(message) {
  const parts = [message.content || ''];
  for (const e of message.embeds || []) {
    parts.push(e.title || '', e.description || '');
    for (const f of e.fields || []) parts.push(f.name || '', f.value || '');
  }
  return parts.join('\n');
}

/** Does this look like the Wordle app's daily summary? */
function isSummary(text) {
  return /day streak/i.test(text) && /[1-6X]\/6:/i.test(text);
}

/**
 * Read the results out of the summary text.
 * Returns [{ score: '3', ids: ['123…'], names: ['Anna'] }, …]
 * ids come from real @mentions (<@123>), names from plain "@Name" text.
 */
function parseSummary(text) {
  const results = [];
  const re = /(?:👑\s*)?([1-6X])\/6:\s*([\s\S]*?)(?=(?:👑\s*)?[1-6X]\/6:|$)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const score = m[1].toUpperCase();
    const rest = m[2];
    const ids = [...rest.matchAll(/<@!?(\d+)>/g)].map(x => x[1]);
    const names = rest
      .replace(/<@!?\d+>/g, '')
      .split('@')
      .slice(1)
      .map(n => n.replace(/[\n,;.!?]+$/g, '').trim())
      .filter(Boolean);
    if (ids.length || names.length) results.push({ score, ids, names });
  }
  return results;
}

/** The day the results are about: the day before the message was posted. */
function resultDate(message) {
  const posted = new Date(
    new Date(message.createdTimestamp || Date.now()).toLocaleString('en-US', {
      timeZone: TZ,
    }),
  );
  posted.setDate(posted.getDate() - 1);
  return formatDate(posted);
}

// Find a member by the name shown in the summary
async function findMemberByName(guild, name) {
  const lower = name.toLowerCase();
  const matches = m =>
    [m.displayName, m.user.username, m.user.globalName]
      .filter(Boolean)
      .some(n => n.toLowerCase() === lower);
  const cached = guild.members.cache.find(matches);
  if (cached) return cached;
  try {
    const found = await guild.members.fetch({ query: name, limit: 10 });
    return found.find(matches) || null;
  } catch {
    return null;
  }
}

// ---------- Settings + data ----------

function getGuildData(guildId) {
  return db.read(d => d.wordleApp?.[guildId]) || {};
}

function setChannel(guildId, channelId) {
  db.perform(d => {
    d.wordleApp ||= {};
    d.wordleApp[guildId] ||= { days: {}, users: {} };
    d.wordleApp[guildId].channelId = channelId;
  });
}

function emptyUser() {
  return {
    played: 0,
    solved: 0,
    guesses: 0, // sum of guesses on solved days (for the average)
    crowns: 0,
    coins: 0,
    streak: 0, // days in a row solved
    bestStreak: 0,
    lastDate: null, // last day solved
    dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, X: 0 },
  };
}

function getUserStats(guildId, userId) {
  return getGuildData(guildId).users?.[userId] || null;
}

// ---------- Processing a summary ----------

/**
 * Handle one message. Returns null if it's not a (new) summary in the Wordle
 * channel, otherwise { date, paid: [...], unknown: [...] }.
 */
async function processMessage(message, { reply = true } = {}) {
  if (!message.guild) return null;
  const guildId = message.guild.id;
  const settings = getGuildData(guildId);
  if (!settings.channelId || message.channelId !== settings.channelId)
    return null;
  if (message.author?.id === message.client?.user?.id) return null; // our own messages

  const text = messageText(message);
  if (!isSummary(text)) return null;

  const date = resultDate(message);
  if (settings.days?.[date]) return null; // already paid for that day

  // Who got which score
  const entries = []; // { userId, score }
  const unknown = [];
  for (const group of parseSummary(text)) {
    for (const id of group.ids)
      entries.push({ userId: id, score: group.score });
    for (const name of group.names) {
      const member = await findMemberByName(message.guild, name);
      if (member) entries.push({ userId: member.id, score: group.score });
      else unknown.push(name);
    }
  }
  // One result per person (first one wins, in case of duplicates)
  const seen = new Set();
  const results = entries.filter(
    e => !seen.has(e.userId) && seen.add(e.userId),
  );
  if (!results.length) return null;

  // Crown: best (lowest) solved score of the day
  const solvedScores = results
    .filter(r => r.score !== 'X')
    .map(r => Number(r.score));
  const best = solvedScores.length ? Math.min(...solvedScores) : null;

  const paid = [];
  db.perform(d => {
    d.wordleApp ||= {};
    const g = (d.wordleApp[guildId] ||= { days: {}, users: {} });
    g.days ||= {};
    g.users ||= {};
    if (g.days[date]) return; // paid in the meantime

    const prevDay = (() => {
      const [y, m, dd] = date.split('-').map(Number);
      return formatDate(new Date(y, m - 1, dd - 1));
    })();

    for (const r of results) {
      const crowned = best !== null && Number(r.score) === best;
      const coins = REWARDS[r.score] + (crowned ? CROWN_BONUS : 0);
      nestcoins.addCoins(guildId, r.userId, coins);

      const u = (g.users[r.userId] ||= emptyUser());
      u.played++;
      u.coins += coins;
      u.dist[r.score] = (u.dist[r.score] || 0) + 1;
      if (crowned) u.crowns++;
      if (r.score !== 'X') {
        u.solved++;
        u.guesses += Number(r.score);
        u.streak = u.lastDate === prevDay ? u.streak + 1 : 1;
        u.bestStreak = Math.max(u.bestStreak, u.streak);
        u.lastDate = date;
      } else {
        u.streak = 0;
      }
      paid.push({ ...r, coins, crowned });
    }
    g.days[date] = {
      messageId: message.id,
      results: paid.map(({ userId, score, coins, crowned }) => ({
        userId,
        score,
        coins,
        crowned,
      })),
    };
  });
  if (!paid.length) return null;

  if (reply) {
    await message.channel
      .send({
        embeds: [rewardsEmbed(date, paid, unknown)],
        allowedMentions: { parse: [] },
      })
      .catch(e => console.error('[Wordle] Reply failed:', e.message));
    // Achievements (Wordle ones and e.g. "Nest Egg")
    await require('./achievements').announce(
      message.channel,
      paid.map(p => p.userId),
    );
  }
  return { date, paid, unknown };
}

function rewardsEmbed(date, paid, unknown = []) {
  const order = ['1', '2', '3', '4', '5', '6', 'X'];
  const lines = [...paid]
    .sort((a, b) => order.indexOf(a.score) - order.indexOf(b.score))
    .map(
      p =>
        `${p.crowned ? '👑' : '▫️'} <@${p.userId}> · ${p.score}/6 · **+${p.coins}**` +
        (p.crowned ? ` *(incl. +${CROWN_BONUS} crown)*` : ''),
    );
  const embed = new EmbedBuilder()
    .setTitle(`💰 Wordle rewards for ${date}`)
    .setDescription(lines.join('\n'))
    .setColor(0x6aaa64)
    .setFooter({
      text: 'Your stats: /profile tab:Games · rewards table in /help',
    });
  if (unknown.length) {
    embed.addFields({
      name: '❓ Couldn’t match',
      value: `${unknown.join(', ')}\nThese names don't match a member, so no coins.`,
    });
  }
  return embed;
}

/** Look back over recent messages in the Wordle channel and pay what's missing. */
async function catchUp(client) {
  const all = db.read(d => d.wordleApp || {});
  for (const [guildId, g] of Object.entries(all)) {
    if (!g.channelId) continue;
    const channel = await client.channels.fetch(g.channelId).catch(() => null);
    if (!channel?.messages) continue;
    const recent = await channel.messages
      .fetch({ limit: SCAN_LAST_MESSAGES })
      .catch(() => null);
    if (!recent) continue;
    // Oldest first, so days are paid in order (streaks stay right)
    const sorted = [...recent.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    );
    for (const message of sorted) {
      if (message.guild?.id !== guildId) continue;
      await processMessage(message);
    }
  }
}

/** Called once when the bot is ready. */
function startWordle(client) {
  runEvery('Wordle', 30, () => catchUp(client));
}

// ---------- Stats ----------

/** Stats summary for /profile and achievements. */
function getSummary(guildId, userId) {
  const u = getUserStats(guildId, userId);
  if (!u) return null;
  const today = formatDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: TZ })),
  );
  const yesterday = (() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    d.setDate(d.getDate() - 1);
    return formatDate(d);
  })();
  const dayBefore = (() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    d.setDate(d.getDate() - 2);
    return formatDate(d);
  })();
  // Results arrive a day late, so a streak is still alive if the last solve
  // was yesterday or the day before
  const live = [today, yesterday, dayBefore].includes(u.lastDate);
  return {
    ...u,
    streak: live ? u.streak : 0,
    average: u.solved ? (u.guesses / u.solved).toFixed(2) : '–',
    winRate: u.played ? Math.round((u.solved / u.played) * 100) : 0,
  };
}

function getLeaderboard(guildId, limit = 5) {
  const users = Object.entries(getGuildData(guildId).users || {});
  const top = (fn, filter = () => true) =>
    users
      .filter(([, u]) => filter(u))
      .map(([id, u]) => [id, fn(u)])
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  return {
    crowns: top(u => u.crowns),
    played: top(u => u.played),
    // Best average (lowest), only with at least 5 solved days
    average: users
      .filter(([, u]) => u.solved >= 5)
      .map(([id, u]) => [id, u.guesses / u.solved])
      .sort((a, b) => a[1] - b[1])
      .slice(0, limit),
  };
}

/** The rewards table as text (used in /help). */
function rewardsTable() {
  return (
    '```\n' +
    'Result  │ Coins\n' +
    '────────┼──────\n' +
    ['1', '2', '3', '4', '5', '6', 'X']
      .map(k => `${k}/6     │ ${String(REWARDS[k]).padStart(5)}`)
      .join('\n') +
    `\n👑 Best │   +${CROWN_BONUS}\n` +
    '```'
  );
}

module.exports = {
  REWARDS,
  CROWN_BONUS,
  parseSummary,
  isSummary,
  messageText,
  processMessage,
  catchUp,
  startWordle,
  setChannel,
  getGuildData,
  getSummary,
  getLeaderboard,
  rewardsTable,
  rewardsEmbed,
};
