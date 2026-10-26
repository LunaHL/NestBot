const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const halloween = require('../services/halloween');
const achievements = require('../services/achievements');
const { daysUntilHalloween } = require('../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trickortreat')
    .setDescription('🎃 Trick or treat! (Halloween only)'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const result = halloween.trickOrTreat(guildId, userId);

    if (result.error === 'closed') {
      const days = daysUntilHalloween();
      return interaction.reply({
        content: `🎃 The doors are locked. Trick-or-treating opens on **Halloween** (October 31): ${days} day${days === 1 ? '' : 's'} to go! 👻`,
        flags: 64,
      });
    }
    if (result.error === 'none-left') {
      return interaction.reply({
        content: `🍬 You've used all ${halloween.TRIES_PER_DAY} tries this Halloween. Go eat your candy.`,
        flags: 64,
      });
    }

    const name = interaction.member?.displayName || interaction.user.username;
    const embed = new EmbedBuilder()
      .setTitle(`🎃 ${name} knocks on a spooky door…`)
      .setDescription(result.text)
      .setFooter({ text: `${result.left} tr${result.left === 1 ? 'y' : 'ies'} left today` })
      .setColor(result.kind === 'treat' ? 0xff8c00 : 0x6a0dad);

    await interaction.reply({ embeds: [embed] });
    return achievements.announce(interaction, [userId]);
  },
};
