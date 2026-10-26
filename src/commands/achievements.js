const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const achievements = require('../services/achievements');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('Show unlocked and locked achievements')
    .addUserOption(opt => opt.setName('user').setDescription('Whose achievements (default: you)')),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const name = interaction.options.getMember('user')?.displayName ||
      (user.id === interaction.user.id ? interaction.member?.displayName : null) || user.username;
    const guildId = interaction.guildId;

    // Catch up on anything already earned (e.g. stats from before achievements existed)
    const fresh = achievements.checkAchievements(guildId, user.id);
    const have = achievements.getUnlocked(guildId, user.id);

    const embed = new EmbedBuilder()
      .setTitle(`🏅 Achievements of ${name}`)
      .setThumbnail(user.displayAvatarURL())
      .setColor(0xf1c40f);

    for (const [cat, title] of Object.entries(achievements.CATEGORIES)) {
      const list = achievements.ACHIEVEMENTS.filter(a => a.cat === cat);
      const lines = list.map(a => {
        if (have[a.id]) return `${a.emoji} **${a.name}** · ${a.desc}`;
        if (a.secret) return '❓ *Secret achievement*';
        return `🔒 ${a.name} · ${a.desc} (+${a.reward})`;
      });
      embed.addFields({ name: title, value: lines.join('\n') });
    }

    const total = achievements.ACHIEVEMENTS.length;
    const count = achievements.ACHIEVEMENTS.filter(a => have[a.id]).length;
    embed.setDescription(
      `**${count} / ${total}** unlocked` +
        (fresh.length ? `\n✨ Just unlocked: ${fresh.map(a => `${a.emoji} ${a.name}`).join(', ')} ` +
          `(+${fresh.reduce((s, a) => s + a.reward, 0)} coins)` : ''),
    );

    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
