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

    // Check user balance
    const balance = nestcoins.getBalance(guildId, userId);
    if (balance < bet) {
      return interaction.reply({ content: "❌ You don’t have enough NestCoins to gamble.", flags: 64 });
    }

    // Deduct entry fee
    nestcoins.addCoins(guildId, userId, -bet);

    // Random roll
    const roll = Math.random(); // 0–1
    let result = "";
    let reward = 0;

    if (roll < 0.01) {
      // Jackpot zone (1%)
      const jackpotType = Math.random() < 0.5 ? "coins" : "punishment";
      if (jackpotType === "coins") {
        reward = 50;
        nestcoins.addCoins(guildId, userId, reward);
        result = "🎰 **JACKPOT!** You won **50 NestCoins!** 💰";
      } else {
        result = "💥 **JACKPOT!** You triggered the **Punishment Roulette!** 🎡";
      }
    } else if (roll < 0.2) {
      // 19% chance to win 10 coins
      reward = 10;
      nestcoins.addCoins(guildId, userId, reward);
      result = "🎲 You won **10 NestCoins!** 🍀";
    } else {
      // 80% lose
      result = "😢 You lost your bet. Better luck next time!";
    }

    const newBalance = nestcoins.getBalance(guildId, userId);
    return interaction.reply({
      content: `${result}\n💰 New Balance: **${newBalance}** coins.`,
    });
  },
};
