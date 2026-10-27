const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const gag = require('../services/gag');
const db = require('../utils/db');
const { getUserStats } = require('../services/stats');
const achievements = require('../services/achievements');

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

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

    // Award anything already earned before showing the badges
    const fresh = achievements.checkAchievements(guildId, userId);
    const s = getUserStats(guildId, userId);
    const gagMs = gag.getRemainingMs(guildId, userId);

    const have = achievements.getUnlocked(guildId, userId);
    const badges = achievements.ACHIEVEMENTS.filter(a => have[a.id]);
    const total = achievements.ACHIEVEMENTS.length;

    const embed = new EmbedBuilder()
      .setTitle(`Profile for ${member?.displayName || targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor('#5865F2')
      .addFields(
        { name: '💰 NestCoins', value: `**${s.balance}**`, inline: true },
        {
          name: '🏆 Rank',
          value: s.rank ? `**#${s.rank}** / ${s.rankedCount}` : 'Unranked',
          inline: true,
        },
        {
          name: '🎂 Birthday',
          value: getBirthday(guildId, userId),
          inline: true,
        },
        {
          name: '🧩 Puzzles',
          value: `Solved **${s.puzzle.solved}** / ${s.puzzle.total}\n🔥 Streak **${s.puzzle.streak}** (best ${s.puzzle.best})`,
          inline: true,
        },
        {
          name: '🟩 NestWord',
          value:
            `Solved **${s.nestword.solved}** / ${s.nestword.played} played (${s.nestword.winRate}%)\n` +
            `Avg. tries: **${s.nestword.avgTries}**\n🔥 Streak **${s.nestword.streak}** (best ${s.nestword.best})`,
          inline: true,
        },
        {
          name: '⚔️ Tournaments & Duels',
          value:
            `Tournaments: joined **${s.events.joined}**, won **${s.events.won}**\n` +
            `Duels: **${s.duels.wins}**W / ${s.duels.losses}L`,
          inline: true,
        },
        {
          name: '🍹 Drinks',
          value: s.drinks.total
            ? `**${s.drinks.total}** drinks (${s.drinks.today} today)\n🔥 Streak **${s.drinks.streak}**` +
              (s.drinks.favorite ? `\n❤️ ${s.drinks.favorite.name}` : '')
            : 'No drinks yet',
          inline: true,
        },
        {
          name: '🟩 Wordle app',
          value: s.wordle.played
            ? `**${s.wordle.played}** played · ⌀ ${s.wordle.average}\n👑 ${s.wordle.crowns} · 🔥 ${s.wordle.streak}`
            : 'Not played yet',
          inline: true,
        },
        {
          name: '📸 Pictures this week',
          value: `**${s.pictures}**`,
          inline: true,
        },
        {
          name: `🏅 Achievements (${badges.length}/${total})`,
          value: badges.length
            ? badges.map(a => a.emoji).join(' ') +
              '\nSee `/achievements` for details'
            : 'None yet. See `/achievements`',
        },
      )
      .setTimestamp();

    if (gagMs > 0) {
      embed.addFields({
        name: '🔇 Gagged',
        value: `~${Math.ceil(gagMs / 60000)} min left`,
        inline: true,
      });
    }
    if (fresh.length) {
      embed.setDescription(
        `✨ Just unlocked: ${fresh.map(a => `${a.emoji} ${a.name}`).join(', ')} ` +
          `(+${fresh.reduce((sum, a) => sum + a.reward, 0)} coins)`,
      );
    }

    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};
