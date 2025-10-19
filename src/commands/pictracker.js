const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('../services/nestcoins');

function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sonntag
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return { start: monday.getTime(), end: sunday.getTime() };
}

function checkPicTracker(client) {
  db.perform(data => {
    for (const guildId of Object.keys(data.pictracker || {})) {
      const board = data.pictracker[guildId];
      if (!board) continue;

      const now = Date.now();
      if (now >= board.end) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        const channel = board.channelId
          ? guild.channels.cache.get(board.channelId)
          : null;
        if (!channel) continue;

        const entries = Object.entries(board.users || {});
        if (entries.length === 0) continue;

        const sorted = entries.sort((a, b) => b[1] - a[1]);
        const topUserId = sorted[0][0];
        const leaderboardText = sorted
          .slice(0, 10)
          .map(([id, count], i) => `**#${i + 1}** <@${id}> — ${count} 🖼️`)
          .join('\n');

        channel.send(
          `🏆 **Weekly Picture Leaderboard** 🏆\n\n${leaderboardText}`,
        );

        let rewarded = [];
        for (const [userId, count] of entries) {
          if (count >= 10) {
            nestcoins.addCoins(guildId, userId, 50);
            rewarded.push(`<@${userId}> +50 🪙 (${count} pics)`);
          }
        }

        if (topUserId) {
          nestcoins.addCoins(guildId, topUserId, 30);
          rewarded.push(`💎 <@${topUserId}> gets **+30 bonus coins** for #1!`);
        }

        if (rewarded.length > 0) {
          channel.send(`💰 **Rewards distributed:**\n${rewarded.join('\n')}`);
        } else {
          channel.send('😔 No one reached 10 pictures this week.');
        }

        data.pictracker[guildId] = {
          users: {},
          ...getWeekRange(),
          channelId: board.channelId,
        };
      }
    }
  });
}

function schedule(client) {
  const now = new Date();
  const nextMonday = new Date(now);
  const day = now.getDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 1, 0, 0);
  const msUntilMonday = nextMonday - now;

  checkPicTracker(client);

  setTimeout(() => {
    checkPicTracker(client);
    setInterval(() => checkPicTracker(client), 7 * 24 * 60 * 60 * 1000);
  }, msUntilMonday);
}

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
      const isAdmin = interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator,
      );
      if (!isAdmin) {
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
      const isAdmin = interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator,
      );
      if (!isAdmin) {
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
  schedule: schedule,
};
