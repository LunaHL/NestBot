const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('drop')
    .setDescription('Configure Nest Loot Drops')
    .addSubcommand(sub => 
      sub.setName('blacklist')
        .setDescription('Add or remove a channel from the blacklist')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to blacklist/unblacklist').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Check loot drop system status')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const guildSettings = db.get(`lootdrop_${guildId}`) || { blacklist: [] };

    if (sub === 'blacklist') {
      const channel = interaction.options.getChannel('channel');
      const idx = guildSettings.blacklist.indexOf(channel.id);

      if (idx === -1) {
        guildSettings.blacklist.push(channel.id);
        db.set(`lootdrop_${guildId}`, guildSettings);
        return interaction.reply(`🚫 Added <#${channel.id}> to the loot drop blacklist.`);
      } else {
        guildSettings.blacklist.splice(idx, 1);
        db.set(`lootdrop_${guildId}`, guildSettings);
        return interaction.reply(`✅ Removed <#${channel.id}> from the loot drop blacklist.`);
      }
    }

    if (sub === 'status') {
      const list = guildSettings.blacklist.map(id => `<#${id}>`).join(', ') || 'none';
      return interaction.reply(`💰 Loot Drop System is **active**\n**Blacklisted Channels:** ${list}`);
    }
  },
};
