// /ungag: admins take a gag off early.
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isAdmin, denyNonAdmin } = require('../utils/permissions');
const gag = require('../services/gag');
const ui = require('../utils/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ungag')
    .setDescription('Take a gag off someone (admins)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o =>
      o.setName('target').setDescription('Who').setRequired(true),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction)) return denyNonAdmin(interaction);
    const target = interaction.options.getUser('target');
    if (!gag.isGagged(interaction.guildId, target.id))
      return interaction.reply(ui.info(`<@${target.id}> isn’t gagged.`));
    gag.ungagUser(interaction.guildId, target.id);
    return interaction.reply(ui.ok(`<@${target.id}> can talk again.`));
  },
};
