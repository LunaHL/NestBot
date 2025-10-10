const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('../services/nestcoins');

const DAILY_AMOUNT = 10;
const TZ = process.env.TIMEZONE || 'Europe/Berlin';

function getLocalDate() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily NestCoins'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
<<<<<<< HEAD
      return interaction.reply({ content: 'This command can only be used in a server (guild).', flags: 64 });
=======
      return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
>>>>>>> f572f88085560077159e649ec2c6f87a593714f9
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const today = getLocalDate();

    let canClaim = false;


    db.perform((data) => {
      if (!data.dailyClaims) data.dailyClaims = {};
      if (!data.dailyClaims[guildId]) data.dailyClaims[guildId] = {};

      const lastClaim = data.dailyClaims[guildId][userId];
      if (lastClaim !== today) {
        data.dailyClaims[guildId][userId] = today;
        canClaim = true;
      }
    });

    if (!canClaim) {
      return interaction.reply({
<<<<<<< HEAD
        content: `⏳ You already claimed your daily. Come back in **${hours}h ${mins}m**.`,
         flags: 64 
=======
        content: '⏳ You already claimed your daily today! Come back tomorrow after midnight 🕛.',
        ephemeral: true,
>>>>>>> f572f88085560077159e649ec2c6f87a593714f9
      });
    }

    const newBalance = nestcoins.addCoins(guildId, userId, DAILY_AMOUNT);
    return interaction.reply({
<<<<<<< HEAD
      content: `✅ You claimed **${DAILY_AMOUNT}** Nestcoins!\n💰 New balance: **${newBalance}** Nestcoins.`,
       flags: 64 
=======
      content: `✅ You claimed **${DAILY_AMOUNT}** NestCoins!\n💰 New balance: **${newBalance}** NestCoins.`,
      ephemeral: true,
>>>>>>> f572f88085560077159e649ec2c6f87a593714f9
    });
  },
};
