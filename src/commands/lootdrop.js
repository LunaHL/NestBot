const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const nestcoins = require('../services/nestcoins');
const db = require('../utils/db');

let activeDrop = null;

async function spawnLoot(client) {
  for (const [guildId, guild] of client.guilds.cache) {
    let settings;
    db.perform(data => {
      data.lootdrop ||= {};
      data.lootdrop[guildId] ||= { blacklist: [] };
      settings = data.lootdrop[guildId];
    });
    const channels = guild.channels.cache
      .filter(c => c.isTextBased() && !settings.blacklist.includes(c.id))
      .map(c => c.id);

    if (channels.length === 0) continue;

    const channelId = channels[Math.floor(Math.random() * channels.length)];
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) continue;

    const coins = Math.floor(Math.random() * 4) + 1;
    const button = new ButtonBuilder()
      .setCustomId('claim_loot')
      .setLabel('💰 Claim Loot')
      .setStyle(ButtonStyle.Success);
    const row = new ActionRowBuilder().addComponents(button);

    const msg = await channel.send({
      content: `💰 **Loot Drop!** A pouch with **${coins} NestCoins** has appeared! First to claim gets it!`,
      components: [row],
    });

    activeDrop = { guildId, msgId: msg.id, coins };

    const collector = msg.createMessageComponentCollector({ time: 300000 });
    collector.on('collect', async i => {
      if (i.customId !== 'claim_loot' || activeDrop === null) return;
      nestcoins.addCoins(i.guildId, i.user.id, activeDrop.coins);
      await i.reply({
        content: `🎉 You claimed **${activeDrop.coins} NestCoins!**`,
        ephemeral: true,
      });
      await msg.edit({
        content: `🏆 **${i.user.username}** claimed the loot!`,
        components: [],
      });
      activeDrop = null;
      collector.stop();
    });

    collector.on('end', async () => {
      if (activeDrop) {
        await msg.edit({
          content: '⌛ The loot vanished into thin air.',
          components: [],
        });
        activeDrop = null;
      }
    });
  }
}

//* Schedules the next loot drop to drop
function schedule(client) {
  const dropsPerDay = Math.floor(Math.random() * 6) + 3; // 3–8 per day
  const interval = !process.env.DEBUG
    ? (24 * 60 * 60 * 1000) / dropsPerDay
    : (4 * 60 * 1000) / dropsPerDay;

  setTimeout(() => {
    spawnLoot(client);
    schedule(client);
  }, interval);
  console.log(`[LootDrop] Next drop in ${interval / 1000} seconds`);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('drop')
    .setDescription('Configure Nest Loot Drops')
    .addSubcommand(sub =>
      sub
        .setName('blacklist')
        .setDescription('Add or remove a channel from the blacklist')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel to blacklist/unblacklist')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Check loot drop system status'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    let guildSettings;
    db.perform(data => {
      data.lootdrop ||= {};
      data.lootdrop[guildId] ||= { blacklist: [] };
      guildSettings = data.lootdrop[guildId];
    });

    if (sub === 'blacklist') {
      const channel = interaction.options.getChannel('channel');
      const idx = guildSettings.blacklist.indexOf(channel.id);

      if (idx === -1) {
        guildSettings.blacklist.push(channel.id);
        db.perform(data => {
          data.lootdrop[guildId] = guildSettings;
        });
        return interaction.reply({
          content:`🚫 Added <#${channel.id}> to the loot drop blacklist.`,
          flags: 64
      });
      } else {
        guildSettings.blacklist.splice(idx, 1);
        db.perform(data => {
          data.lootdrop[guildId] = guildSettings;
        });
        return interaction.reply(
          `✅ Removed <#${channel.id}> from the loot drop blacklist.`,
        );
      }
    }

    if (sub === 'status') {
      const list =
        guildSettings.blacklist.map(id => `<#${id}>`).join(', ') || 'none';
      return interaction.reply({
        content:`💰 Loot Drop System is **active**\n**Blacklisted Channels:** ${list}`,
        flags: 64,
    });
    }
  },
  schedule: schedule,
};
