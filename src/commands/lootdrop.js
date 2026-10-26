const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const nestcoins = require('../services/nestcoins');
const db = require('../utils/db');
const { isHalloween } = require('../utils/time');

async function spawnLootInGuild(guildId, guild) {
  const settings = db.read(data => data.lootdrop?.[guildId]) || {
    blacklist: [],
  };
  const me = guild.members.me;

  // Only text channels the bot can actually post in
  const channels = guild.channels.cache
    .filter(
      c =>
        c.isTextBased() &&
        !c.isThread() &&
        !settings.blacklist.includes(c.id) &&
        me?.permissionsIn(c).has(['ViewChannel', 'SendMessages']),
    )
    .map(c => c);

  if (channels.length === 0) return;

  const channel = channels[Math.floor(Math.random() * channels.length)];
  const spooky = isHalloween();
  const coins = Math.floor(Math.random() * 4) + 1 + (spooky ? 2 : 0);
  const button = new ButtonBuilder()
    .setCustomId('claim_loot')
    .setLabel(spooky ? '🎃 Grab it… if you dare' : '💰 Claim Loot')
    .setStyle(ButtonStyle.Success);
  const row = new ActionRowBuilder().addComponents(button);

  const msg = await channel.send({
    content: spooky
      ? `🎃 **Haunted Loot!** A cursed pumpkin with **${coins} NestCoins** inside rolled into the room… First to grab it keeps it! 👻`
      : `💰 **Loot Drop!** A pouch with **${coins} NestCoins** has appeared! First to claim gets it!`,
    components: [row],
  });

  // State belongs to this one drop, so drops in different servers
  // (or overlapping drops) can't interfere with each other.
  let claimed = false;
  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async i => {
    if (i.customId !== 'claim_loot') return;
    if (claimed) {
      return i
        .reply({ content: '😢 Too slow, someone already took it!', flags: 64 })
        .catch(() => {});
    }
    // Mark as claimed BEFORE any await, so a second click can't also get paid
    claimed = true;
    collector.stop('claimed');
    nestcoins.addCoins(i.guildId, i.user.id, coins);

    await i
      .reply({ content: `🎉 You claimed **${coins} NestCoins!**`, flags: 64 })
      .catch(() => {});
    await msg
      .edit({
        content: `🏆 **${i.user.username}** claimed the loot!`,
        components: [],
      })
      .catch(() => {});
  });

  collector.on('end', async () => {
    if (claimed) return;
    await msg
      .edit({ content: '⌛ The loot vanished into thin air.', components: [] })
      .catch(() => {});
  });
}

async function spawnLoot(client) {
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      await spawnLootInGuild(guildId, guild);
    } catch (e) {
      console.error(`[LootDrop] Failed in guild ${guildId}:`, e);
    }
  }
}

//* Schedules the next loot drop to drop
function schedule(client) {
  // 3–8 per day, twice as many on Halloween
  const dropsPerDay =
    (Math.floor(Math.random() * 6) + 3) * (isHalloween() ? 2 : 1);
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
          content: `🚫 Added <#${channel.id}> to the loot drop blacklist.`,
          flags: 64,
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
        content: `💰 Loot Drop System is **active**\n**Blacklisted Channels:** ${list}`,
        flags: 64,
      });
    }
  },
  schedule: schedule,
};
