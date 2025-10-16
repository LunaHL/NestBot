const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/db');

function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getNextPeriod(period) {
  const now = new Date();
  let start = new Date();

  if (period === 'daily') {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + 1);
  } else if (period === 'weekly') {
    const day = start.getDay(); // 0 = Sonntag
    const daysUntilMonday = (1 + 7 - day) % 7 || 7;
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + daysUntilMonday);
  }

  const end = new Date(start);
  if (period === 'daily') end.setDate(start.getDate() + 1);
  else end.setDate(start.getDate() + 7);

  return { start: start.getTime(), end: end.getTime() };
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('picquota')
    .setDescription('Picture quota system')
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set a new picture quota')
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('Required number of pictures').setRequired(true)
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
          opt.setName('role').setDescription('Role to track').setRequired(true)
        )
        .addChannelOption(opt =>
          opt.setName('channel').setDescription('Channel for pictures').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('reward').setDescription('NestCoins reward')
        )
    )
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Show current quota status')
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
        return interaction.reply({ content: "❌ You don't have permission.", flags: 64 });
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
        flags: 64
      });
    }

    if (sub === 'status') {
      let quota;
      db.perform(data => (quota = data.picquota?.[guildId]));

      if (!quota) {
        return interaction.reply({ content: "❌ No quota set for this server.",  flags: 64  });
      }

      const percent = ((quota.current / quota.amount) * 100).toFixed(1);
      const statusIcon = quota.current >= quota.amount ? "✅" : "❌";

      return interaction.reply({
        content:
          `📷 **Picture Quota**\n` +
          `• Required: ${quota.amount}\n` +
          `• Period: ${quota.period}\n` +
          `• Role: <@&${quota.roleId}>\n` +
          `• Channel: <#${quota.channelId}>\n` +
          `• Progress: ${quota.current}/${quota.amount} (${percent}%) ${statusIcon}\n` +
          `• Timeframe: <t:${Math.floor(quota.start / 1000)}:F> → <t:${Math.floor(quota.end / 1000)}:F>`,
        ephemeral: true
      });
    }

    if (sub === 'reset') {
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) {
        return interaction.reply({ content: "❌ You don't have permission.", flags: 64 });
      }

      db.perform(data => {
        if (data.picquota) delete data.picquota[guildId];
      });

      return interaction.reply({ content: "✅ Quota has been reset.", flags: 64 });
    }
  }
};
