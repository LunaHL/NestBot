const { SlashCommandBuilder } = require('discord.js');
const nestcoins = require('../services/nestcoins');
const db = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('Try your luck in the Nest Roulette! Costs 5 coins.'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const bet = 5;

    // Check balance
    const balance = nestcoins.getBalance(guildId, userId);
    if (balance < bet) {
      return interaction.reply({
        content: '❌ You don’t have enough NestCoins to gamble.',
        flags: 64,
      });
    }

    // Deduct entry fee
    nestcoins.addCoins(guildId, userId, -bet);

    // Roll
    const roll = Math.random(); // 0–1
    let result = '';
    let reward = 0;

    if (roll < 0.01) {
      // 1% jackpot
      reward = 100;
      nestcoins.addCoins(guildId, userId, reward);
      result = '🎰 **JACKPOT!** You won **100 NestCoins!** 💎';
    } else if (roll < 0.1) {
      // 9% big win
      reward = Math.floor(Math.random() * 11) + 20; // 20–30
      nestcoins.addCoins(guildId, userId, reward);
      result = `💰 You hit a **big win!** You won **${reward} NestCoins!** 🎉`;
    } else if (roll < 0.3) {
      // 20% normal win
      reward = 10;
      nestcoins.addCoins(guildId, userId, reward);
      result = '🍀 You won **10 NestCoins!**';
    } else if (roll < 0.4) {
      // 10% punishment
      result = '💥 **Uh oh!** You triggered the **Punishment Roulette!** 🎡';
    } else {
      // 60% lose
      result = '😢 You lost your bet. Better luck next time!';
    }

    const newBalance = nestcoins.getBalance(guildId, userId);
    return interaction.reply({
      content: `${result}\n💰 New Balance: **${newBalance}** coins.`,
    });
  },
};
