const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const nestcoins = require('../services/nestcoins');
const gag = require('../services/gag');
const history = require('../services/history');
const db = require('../utils/db');

const TZ = process.env.TIMEZONE || 'Europe/Berlin';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function localDate(offsetDays = 0) {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A stored streak only counts if it was continued today or yesterday
function liveStreak(lastDate, count) {
  return lastDate === localDate(0) || lastDate === localDate(-1) ? count || 0 : 0;
}

function getBirthday(guildId, userId) {
  const birthdays = db.read(d => d.birthdays?.[guildId] || {});
  for (const entry of Object.values(birthdays)) {
    if (entry.userId === userId) {
      const [month, day] = entry.date.split('-');
      return `${MONTHS[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
    }
  }
  return 'Not set';
}

function getPuzzleStats(userId) {
  const today = localDate(0);
  const puzzles = Object.entries(history.allPuzzles()).filter(([date]) => date <= today);
  const solved = puzzles.filter(([, p]) => p.solvedBy?.includes(userId)).length;
  const s = db.read(d => d.puzzleStreaks?.[userId]) || {};
  return {
    solved,
    total: puzzles.length,
    streak: liveStreak(s.lastDate, s.current),
    best: s.best || 0,
  };
}

function getNestwordStats(userId) {
  let played = 0;
  let solved = 0;
  let triesOnSolved = 0;
  for (const day of Object.values(history.allNestwordDays())) {
    const tries = day.guesses?.[userId];
    if (!tries) continue;
    played++;
    if (day.solvedBy?.includes(userId)) {
      solved++;
      triesOnSolved += tries;
    }
  }
  const u = db.read(d => d.nestwordUsers?.[userId]) || {};
  return {
    played,
    solved,
    winRate: played ? Math.round((solved / played) * 100) : 0,
    avgTries: solved ? (triesOnSolved / solved).toFixed(1) : '–',
    streak: liveStreak(u.lastDate, u.streakCount),
    best: u.bestStreak || 0,
  };
}

function getEventStats(guildId, userId) {
  const events = history.allEvents(guildId);
  return {
    joined: events.filter(e => e.participants?.includes(userId)).length,
    won: events.filter(e => e.winnerId === userId).length,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Shows a user's profile and stats.")
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('The user to view the profile of (defaults to you)'),
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = interaction.options.getMember('user') || interaction.member;
    const guildId = interaction.guildId;
    const userId = targetUser.id;

    // Coins + rank
    const balance = nestcoins.getBalance(guildId, userId);
    const sorted = nestcoins
      .getAllBalances(guildId)
      .filter(e => e[1] > 0)
      .sort((a, b) => b[1] - a[1]);
    const rankIndex = sorted.findIndex(e => e[0] === userId);
    const rankText = rankIndex === -1 ? 'Unranked' : `**#${rankIndex + 1}** / ${sorted.length}`;

    const puzzle = getPuzzleStats(userId);
    const word = getNestwordStats(userId);
    const events = getEventStats(guildId, userId);
    const pics = db.read(d => d.pictracker?.[guildId]?.users?.[userId]) || 0;
    const gagMs = gag.getRemainingMs(guildId, userId);

    const embed = new EmbedBuilder()
      .setTitle(`Profile for ${member?.displayName || targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor('#5865F2')
      .addFields(
        { name: '💰 NestCoins', value: `**${balance}**`, inline: true },
        { name: '🏆 Rank', value: rankText, inline: true },
        { name: '🎂 Birthday', value: getBirthday(guildId, userId), inline: true },
        {
          name: '🧩 Puzzles',
          value:
            `Solved **${puzzle.solved}** / ${puzzle.total}\n` +
            `🔥 Streak **${puzzle.streak}** (best ${puzzle.best})`,
          inline: true,
        },
        {
          name: '🟩 NestWord',
          value:
            `Solved **${word.solved}** / ${word.played} played (${word.winRate}%)\n` +
            `Avg. tries: **${word.avgTries}**\n` +
            `🔥 Streak **${word.streak}** (best ${word.best})`,
          inline: true,
        },
        {
          name: '⚔️ Tournaments',
          value: `Joined **${events.joined}**\nWon **${events.won}**`,
          inline: true,
        },
        { name: '📸 Pictures this week', value: `**${pics}**`, inline: true },
      )
      .setTimestamp();

    if (gagMs > 0) {
      embed.addFields({
        name: '🔇 Gagged',
        value: `~${Math.ceil(gagMs / 60000)} min left`,
        inline: true,
      });
    }

    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
