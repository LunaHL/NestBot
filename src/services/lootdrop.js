const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const nestcoins = require('./nestcoins');
const db = require('../utils/db');

let activeDrop = null;

async function spawnLoot(client) {
  for (const [guildId, guild] of client.guilds.cache) {
    const settings = db.get(`lootdrop_${guildId}`) || { blacklist: [] };
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

    const collector = msg.createMessageComponentCollector({ time: 30000 });
    collector.on('collect', async i => {
      if (i.customId !== 'claim_loot' || activeDrop === null) return;
      nestcoins.addCoins(i.guildId, i.user.id, activeDrop.coins);
      await i.reply({ content: `🎉 You claimed **${activeDrop.coins} NestCoins!**`, ephemeral: true });
      await msg.edit({
        content: `🏆 **${i.user.username}** claimed the loot!`,
        components: [],
      });
      activeDrop = null;
      collector.stop();
    });

    collector.on('end', async () => {
      if (activeDrop) {
        await msg.edit({ content: '⌛ The loot vanished into thin air.', components: [] });
        activeDrop = null;
      }
    });
  }
}

function start(client) {
  const dropsPerDay = Math.floor(Math.random() * 6) + 3; // 3–8 per day
  const interval = (24 * 60 * 60 * 1000) / dropsPerDay;

  setInterval(() => spawnLoot(client), interval);
  console.log(`[LootDrop] Active — about ${dropsPerDay} drops per day`);
}

module.exports = { start };
