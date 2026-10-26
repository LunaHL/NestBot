const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('../services/nestcoins');

const DAILY_AMOUNT = 10;
const { nowInTZ, localDate } = require('../utils/time');

const getLocalDate = () => localDate(0);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily NestCoins'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used in a server (guild).',
        flags: 64,
      });
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const today = getLocalDate();

    let canClaim = false;

    db.perform(data => {
      if (!data.dailyClaims) data.dailyClaims = {};
      if (!data.dailyClaims[guildId]) data.dailyClaims[guildId] = {};

      const lastClaim = data.dailyClaims[guildId][userId];
      if (lastClaim !== today) {
        data.dailyClaims[guildId][userId] = today;
        canClaim = true;
      }
    });

    if (!canClaim) {
      // Time until the next local midnight
      const now = nowInTZ();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const msLeft = midnight - now;
      const hours = Math.floor(msLeft / 3600000);
      const mins = Math.floor((msLeft % 3600000) / 60000);

      return interaction.reply({
        content: `⏳ You already claimed your daily. Come back in **${hours}h ${mins}m**.`,
        flags: 64,
      });
    }

    const newBalance = nestcoins.addCoins(guildId, userId, DAILY_AMOUNT);
    return interaction.reply({
      content: `✅ You claimed **${DAILY_AMOUNT}** Nestcoins!\n💰 New balance: **${newBalance}** Nestcoins.`,
      flags: 64,
    });
  },
};
