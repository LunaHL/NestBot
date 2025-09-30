// src/commands/daily.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('../services/nestcoins');

const DAILY_AMOUNT = 10;
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily Nestcoins'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'This command can only be used in a server (guild).', ephemeral: true });
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const now = Date.now();

    // read/update cooldown atomically
    let canClaim = false;
    let msLeft = 0;

    db.perform((data) => {
      if (!data.daily) data.daily = {};
      if (!data.daily[guildId]) data.daily[guildId] = {};

      const last = data.daily[guildId][userId] || 0;
      const diff = now - last;

      if (diff >= COOLDOWN_MS) {
        data.daily[guildId][userId] = now; // mark claimed
        canClaim = true;
      } else {
        msLeft = COOLDOWN_MS - diff;
      }
    });

    if (!canClaim) {
      const hours = Math.floor(msLeft / 3_600_000);
      const mins  = Math.floor((msLeft % 3_600_000) / 60_000);
      return interaction.reply({
        content: `⏳ You already claimed your daily. Come back in **${hours}h ${mins}m**.`,
        ephemeral: true
      });
    }

    const newBalance = nestcoins.addCoins(guildId, userId, DAILY_AMOUNT);
    return interaction.reply({
      content: `✅ You claimed **${DAILY_AMOUNT}** Nestcoins!\n💰 New balance: **${newBalance}** Nestcoins.`,
      ephemeral: true
    });
  }
};
