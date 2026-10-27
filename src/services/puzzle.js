// Puzzle of the Day: setting puzzles, solving, the queue, the leaderboard and
// the daily announcement in the puzzle channel.
// Puzzles are stored in data.puzzles["YYYY-MM-DD"]; settings per server in
// data.puzzleSettings[guildId] ({ channelId, roleId, announcedDate }).
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('./nestcoins');
const history = require('./history');
const {
  streakReward,
  streakMessage,
  STREAK_MODES,
} = require('../utils/streak');
const { getStreakMode } = require('./settings');
const { nowInTZ, formatDate, localDate } = require('../utils/time');
const { runEvery } = require('../utils/schedule');

// ---------- Settings ----------

const DIFFICULTIES = {
  easy: { label: 'Easy', emoji: '🟢', color: 0x2ecc71, reward: 10 },
  medium: { label: 'Medium', emoji: '🟡', color: 0xf1c40f, reward: 20 },
  hard: { label: 'Hard', emoji: '🔴', color: 0xe74c3c, reward: 30 },
  special: { label: 'Special', emoji: '🌟', color: 0x9b59b6, reward: 50 },
};
const FIRST_SOLVER_BONUS = [15, 10, 5]; // extra coins for #1, #2, #3
const MEDALS = ['🥇', '🥈', '🥉'];
const MAX_WRONG_PER_DAY = 10; // wrong codes per person per puzzle

const difficultyOf = p => DIFFICULTIES[p?.difficulty] || DIFFICULTIES.easy;

// ---------- Reading ----------

function getPuzzle(date = localDate(0)) {
  return db.read(d => d.puzzles?.[date]) || null;
}

function getSettings(guildId) {
  return db.read(d => d.puzzleSettings?.[guildId]) || {};
}

/** A person's streak, counting only if it was continued today or yesterday. */
function getStreak(userId) {
  const s = db.read(d => d.puzzleStreaks?.[userId]) || {};
  const live = s.lastDate === localDate(0) || s.lastDate === localDate(-1);
  return { current: live ? s.current || 0 : 0, best: s.best || 0 };
}

function wrongTriesLeft(puzzle, userId) {
  return MAX_WRONG_PER_DAY - (puzzle?.wrong?.[userId] || 0);
}

// ---------- Validation ----------

/** "YYYY-MM-DD" that really exists, e.g. not 2026-02-31. */
function isValidDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  return formatDate(new Date(y, m - 1, d)) === text;
}

function isValidLink(text) {
  try {
    return ['http:', 'https:'].includes(new URL(text).protocol);
  } catch {
    return false;
  }
}

// ---------- Admin: set / remove / queue ----------

/**
 * Set (or replace) the puzzle for a date. With append: the next free day
 * starting today. Returns { error } or { date, replaced, keptSolvers }.
 */
function setPuzzle({ link, code, difficulty, date, append }) {
  if (!isValidLink(link)) return { error: 'link' };
  const today = localDate(0);

  let target = date || today;
  if (!append) {
    if (!isValidDate(target)) return { error: 'date-format' };
    if (target < today) return { error: 'date-past' };
  }

  let result;
  db.perform(data => {
    data.puzzles ||= {};
    if (append) {
      const d = nowInTZ();
      for (let i = 0; i < 365 && data.puzzles[formatDate(d)]; i++) {
        d.setDate(d.getDate() + 1);
      }
      target = formatDate(d);
    }

    // Replacing keeps who already solved it and their wrong tries
    const old = data.puzzles[target];
    data.puzzles[target] = {
      link,
      code: code.trim(),
      difficulty,
      reward: DIFFICULTIES[difficulty].reward,
      solvedBy: old?.solvedBy || [],
      wrong: old?.wrong || {},
    };
    result = {
      date: target,
      replaced: !!old,
      keptSolvers: old?.solvedBy?.length || 0,
    };
  });
  return result;
}

/** Remove a scheduled puzzle. Returns the removed puzzle or null. */
function removePuzzle(date) {
  let removed = null;
  db.perform(data => {
    if (!data.puzzles?.[date]) return;
    removed = data.puzzles[date];
    delete data.puzzles[date];
  });
  return removed;
}

/** Today's and all future puzzles, sorted by date. */
function getQueue() {
  const today = localDate(0);
  return Object.entries(db.read(d => d.puzzles || {}))
    .filter(([date]) => date >= today)
    .sort(([a], [b]) => a.localeCompare(b));
}

// ---------- Solving ----------

/**
 * Try a code for today's puzzle.
 * Returns { error } ('none' | 'solved' | 'locked' | 'wrong' with triesLeft)
 * or { reward, position, bonus, streakMsg }.
 */
function solve(guildId, userId, code) {
  const today = localDate(0);
  const yesterday = localDate(-1);
  let result = { error: 'none' };

  db.perform(data => {
    const puzzle = data.puzzles?.[today];
    if (!puzzle) return;
    puzzle.wrong ||= {};

    if (puzzle.solvedBy.includes(userId)) {
      result = {
        error: 'solved',
        position: puzzle.solvedBy.indexOf(userId) + 1,
      };
      return;
    }
    if ((puzzle.wrong[userId] || 0) >= MAX_WRONG_PER_DAY) {
      result = { error: 'locked' };
      return;
    }
    if (puzzle.code.toLowerCase() !== code.trim().toLowerCase()) {
      puzzle.wrong[userId] = (puzzle.wrong[userId] || 0) + 1;
      result = { error: 'wrong', triesLeft: wrongTriesLeft(puzzle, userId) };
      return;
    }

    // Correct: streak, reward, first-solver bonus
    data.puzzleStreaks ||= {};
    const streak = data.puzzleStreaks[userId] || {
      current: 0,
      best: 0,
      lastDate: null,
    };
    streak.current = streak.lastDate === yesterday ? streak.current + 1 : 1;
    streak.best = Math.max(streak.best, streak.current);
    streak.lastDate = today;
    data.puzzleStreaks[userId] = streak;

    puzzle.solvedBy.push(userId);
    const position = puzzle.solvedBy.length;
    const bonus = FIRST_SOLVER_BONUS[position - 1] || 0;
    const r = streakReward(
      puzzle.reward,
      streak.current,
      getStreakMode(guildId),
    );
    const reward = r.total + bonus;
    nestcoins.addCoins(guildId, userId, reward);

    result = {
      reward,
      position,
      bonus,
      streakMsg: streakMessage(streak.current, r),
    };
  });
  return result;
}

// ---------- Leaderboard ----------

function getLeaderboard(limit = 5) {
  const today = localDate(0);
  const solved = {};
  const firsts = {};
  for (const [date, p] of Object.entries(history.allPuzzles())) {
    if (date > today) continue;
    for (const uid of p.solvedBy || []) solved[uid] = (solved[uid] || 0) + 1;
    if (p.solvedBy?.[0])
      firsts[p.solvedBy[0]] = (firsts[p.solvedBy[0]] || 0) + 1;
  }
  const streaks = Object.fromEntries(
    Object.entries(db.read(d => d.puzzleStreaks || {})).map(([uid, s]) => [
      uid,
      s.best || 0,
    ]),
  );
  const top = obj =>
    Object.entries(obj)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  return { solved: top(solved), firsts: top(firsts), streaks: top(streaks) };
}

// ---------- Embeds ----------

function prettyDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const medalList = ids =>
  ids
    .slice(0, 3)
    .map((uid, i) => `${MEDALS[i]} <@${uid}>`)
    .join('  ');

/** The puzzle card used for the announcement and /puzzle info. */
function puzzleEmbed(date, puzzle, { recap = false, guildId } = {}) {
  const diff = difficultyOf(puzzle);
  const solvers = puzzle.solvedBy?.length || 0;
  const embed = new EmbedBuilder()
    .setColor(diff.color)
    .setTitle('🧩 Puzzle of the Day')
    .setDescription(
      `**${prettyDate(date)}**\n\n` +
        'A new puzzle is waiting for you! Open it, find the code and enter it with `/puzzle solve`.',
    )
    .addFields(
      {
        name: 'Difficulty',
        value: `${diff.emoji} **${diff.label}**`,
        inline: true,
      },
      {
        name: 'Reward',
        value: `💰 **${puzzle.reward}** NestCoins`,
        inline: true,
      },
      {
        name: 'Be quick!',
        value: FIRST_SOLVER_BONUS.map((b, i) => `${MEDALS[i]} +${b}`).join(
          '  ',
        ),
        inline: true,
      },
    )
    .setFooter({
      text: `🔥 Solve daily for a streak bonus: ${STREAK_MODES[getStreakMode(guildId)].short}`,
    });

  if (solvers > 0 && !recap) {
    embed.addFields({
      name: `Solved by ${solvers} so far`,
      value: medalList(puzzle.solvedBy),
    });
  }

  // Yesterday's recap (for the announcement)
  if (recap) {
    const yesterday = history.allPuzzles()[localDate(-1)];
    if (yesterday) {
      const n = yesterday.solvedBy?.length || 0;
      embed.addFields({
        name: '📊 Yesterday',
        value: n
          ? `Solved by **${n}**\n${medalList(yesterday.solvedBy)}`
          : 'Nobody solved it. Today is your chance!',
      });
    }
  }
  return embed;
}

/** The "Open puzzle" button. */
function linkButton(puzzle) {
  if (!isValidLink(puzzle.link)) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Open puzzle')
        .setEmoji('🧩')
        .setURL(puzzle.link),
    ),
  ];
}

// ---------- Puzzle channel ----------

async function puzzleChannel(client, guildId) {
  const { channelId } = getSettings(guildId);
  if (!channelId) return null;
  return client.channels.fetch(channelId).catch(() => null);
}

/** Post a short "X solved it" notice (no code) in the puzzle channel. */
async function postSolveNotice(client, guildId, name, position) {
  const channel = await puzzleChannel(client, guildId);
  if (!channel) return false;
  const medal = MEDALS[position - 1] || '✅';
  await channel
    .send({
      content: `🧩 **${name}** solved today's puzzle! ${medal} (#${position})`,
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
  return true;
}

// Announce today's puzzle once per day per server
async function announceToday(client) {
  const today = localDate(0);
  const puzzle = getPuzzle(today);
  if (!puzzle) return;

  const all = db.read(d => d.puzzleSettings || {});
  for (const [guildId, settings] of Object.entries(all)) {
    if (!settings.channelId || settings.announcedDate === today) continue;
    const channel = await puzzleChannel(client, guildId);
    if (!channel) continue;

    db.perform(d => {
      d.puzzleSettings[guildId].announcedDate = today;
    });
    await channel
      .send({
        content: settings.roleId ? `<@&${settings.roleId}>` : undefined,
        embeds: [puzzleEmbed(today, puzzle, { recap: true, guildId })],
        components: linkButton(puzzle),
        allowedMentions: settings.roleId
          ? { roles: [settings.roleId] }
          : { parse: [] },
      })
      .catch(e => console.error('[Puzzle] Announcement failed:', e.message));
  }
}

function setChannel(guildId, channelId, roleId) {
  db.perform(d => {
    d.puzzleSettings ||= {};
    d.puzzleSettings[guildId] = {
      ...d.puzzleSettings[guildId],
      channelId,
      roleId: roleId || null,
    };
  });
}

/** Called once when the bot is ready. */
function startPuzzleAnnouncer(client) {
  runEvery('Puzzle', 10, () => announceToday(client));
}

module.exports = {
  DIFFICULTIES,
  FIRST_SOLVER_BONUS,
  MEDALS,
  MAX_WRONG_PER_DAY,
  getPuzzle,
  getSettings,
  getStreak,
  wrongTriesLeft,
  setPuzzle,
  removePuzzle,
  getQueue,
  solve,
  getLeaderboard,
  puzzleEmbed,
  linkButton,
  postSolveNotice,
  announceToday,
  setChannel,
  startPuzzleAnnouncer,
  prettyDate,
  difficultyOf,
};
