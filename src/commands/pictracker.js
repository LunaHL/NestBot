const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const { isAdmin } = require('../utils/permissions');
const { getWeekRange } = require('../services/pictracker');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pictracker')
    .setDescription('Track and show weekly picture leaderboard')
    .addSubcommand(sub =>
      sub.setName('show').setDescription('Show the current weekly leaderboard'),
    )
    .addSubcommand(sub =>
      sub
        .setName('reset')
        .setDescription('Manually reset leaderboard (admin only)'),
    )
    .addSubcommand(sub =>
      sub
        .setName('setchannel')
        .setDescription(
          'Set the channel where the weekly leaderboard will be posted',
        )
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Target channel')
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'show') {
      let tracker;
      db.perform(data => (tracker = data.pictracker?.[guildId]));
      if (!tracker || Object.keys(tracker.users || {}).length === 0) {
        return interaction.reply({
          content: '📷 No pictures tracked this week yet.',
          ephemeral: true,
        });
      }

      const sorted = Object.entries(tracker.users)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const text = sorted
        .map(([id, count], i) => `**#${i + 1}** <@${id}> — ${count} 🖼️`)
        .join('\n');

      return interaction.reply({
        content: `🏆 **This Week’s Picture Leaderboard** 🏆\n\n${text}`,
        ephemeral: false,
      });
    }

    if (sub === 'reset') {
      const admin = isAdmin(interaction);
      if (!admin) {
        return interaction.reply({
          content: '❌ You do not have permission.',
          ephemeral: true,
        });
      }

      db.perform(data => {
        if (!data.pictracker) data.pictracker = {};
        data.pictracker[guildId] = {
          users: {},
          ...getWeekRange(),
          channelId: data.pictracker?.[guildId]?.channelId || null,
        };
      });

      return interaction.reply({
        content: '✅ Leaderboard has been reset.',
        ephemeral: true,
      });
    }

    if (sub === 'setchannel') {
      const admin = isAdmin(interaction);
      if (!admin) {
        return interaction.reply({
          content: '❌ You do not have permission.',
          ephemeral: true,
        });
      }

      const channel = interaction.options.getChannel('channel');
      db.perform(data => {
        if (!data.pictracker) data.pictracker = {};
        if (!data.pictracker[guildId])
          data.pictracker[guildId] = { users: {}, ...getWeekRange() };
        data.pictracker[guildId].channelId = channel.id;
      });

      return interaction.reply({
        content: `✅ Leaderboard channel set to <#${channel.id}>.`,
        ephemeral: true,
      });
    }
  },
};
