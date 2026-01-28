const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const gag = require('../services/gag');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ungag')
    .setDescription('Remove gag from a user (admin only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('User to ungag')
        .setRequired(true),
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;

    // Safety: in case permissions aren’t enforced by Discord for some reason
    const isAdmin = interaction.memberPermissions?.has(
      PermissionFlagsBits.Administrator,
    );
    if (!isAdmin) {
      return interaction.reply({
        content: "You don't have permission to use this command.",
        flags: 64,
      });
    }

    const target = interaction.options.getUser('target');
    gag.ungagUser(guildId, target.id);

    return interaction.reply({
      content: `✅ Ungagged <@${target.id}>.`,
      flags: 64,
    });
  },
};
