const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/db');

function getNextPeriod(period) {
  const now = new Date();
  let start, end;

  if (period === 'daily') {
    start = new Date(now);
    start.setHours(24, 0, 0, 0); 
    end = new Date(start);
    end.setDate(start.getDate() + 1);
  } else if (period === 'weekly') {
    start = new Date(now);
    const day = start.getDay(); // 0=So, 1=Mo...
    const daysUntilMonday = (8 - day) % 7; 
    start.setDate(start.getDate() + daysUntilMonday);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(start.getDate() + 7);
  }

  return { start: start.getTime(), end: end.getTime() };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('picquota')
    .setDescription('Picture quota system')
    .addSubcommand(sub =>
    sub
        .setName('set')
        .setDescription('Set picture quota')
        .addIntegerOption(opt =>
        opt
            .setName('amount')
            .setDescription('Required number of pictures')
            .setRequired(true)
        )
        .addStringOption(opt =>
        opt
            .setName('period')
            .setDescription('daily or weekly')
            .setRequired(true)
            .addChoices(
            { name: 'Daily', value: 'daily' },
            { name: 'Weekly', value: 'weekly' }
            )
        )
        .addRoleOption(opt =>
        opt
            .setName('role')
            .setDescription('Role this quota applies to')
            .setRequired(true)
        )
        .addChannelOption(opt =>
        opt
            .setName('channel')
            .setDescription('Channel where pictures must be sent')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
        opt
            .setName('reward')
            .setDescription('NestCoins reward if quota completed')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Check current quota status')
    )
    .addSubcommand(sub =>
      sub.setName('reset').setDescription('Reset the quota manually (admin only)')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'set') {
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) {
        return interaction.reply({ content: "❌ You don't have permission.", ephemeral: true });
      }

      const amount = interaction.options.getInteger('amount');
      const period = interaction.options.getString('period');
      const role = interaction.options.getRole('role');
      const channel = interaction.options.getChannel('channel');
      const reward = interaction.options.getInteger('reward') || 20;

      const { start, end } = getNextPeriod(period);

      db.perform(data => {
        if (!data.picquota) data.picquota = {};
        data.picquota[guildId] = {
          amount,
          period,
          roleId: role.id,
          channelId: channel.id,
          current: 0,
          start,
          end,
          reward
        };
      });

      return interaction.reply({
        content: `✅ Picture quota set: **${amount}** images per ${period}, applies to role ${role}. Starts <t:${Math.floor(start/1000)}:F>.`,
        ephemeral: true
      });
    }

    if (sub === 'status') {
      let quota;
      db.perform(data => {
        quota = data.picquota?.[guildId];
      });

      if (!quota) {
        return interaction.reply({ content: "❌ No quota set for this server.", ephemeral: true });
      }

      const percent = ((quota.current / quota.amount) * 100).toFixed(1);
      const statusIcon = quota.current >= quota.amount ? "✅" : "❌";

      const msg = `📷 **Picture Quota**
• Required: ${quota.amount} images
• Period: ${quota.period}
• Role: <@&${quota.roleId}>
• Current: ${quota.current} (${percent}%)
• Status: ${statusIcon}
• Timeframe: <t:${Math.floor(quota.start/1000)}:F> → <t:${Math.floor(quota.end/1000)}:F>`;
      return interaction.reply({ content: msg });
    }

    if (sub === 'reset') {
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) {
        return interaction.reply({ content: "❌ You don't have permission.", ephemeral: true });
      }

      db.perform(data => {
        if (data.picquota) delete data.picquota[guildId];
      });

      return interaction.reply({ content: "✅ Quota has been reset.", ephemeral: true });
    }
  }
};
