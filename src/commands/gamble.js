// /gamble: the Nest Roulette. Costs 5 coins (a bet, so free mode doesn't
// apply). If the Punishment Roulette hits, the wheel spins for you.
const { SlashCommandBuilder } = require('discord.js');
const nestcoins = require('../services/nestcoins');
const wheel = require('../services/wheel');
const ui = require('../utils/ui');

const BET = 5;

/** Roll the roulette: { reward, text, punish } */
function roll() {
  const r = Math.random();
  if (r < 0.01) return { reward: 100, text: '🎰 **JACKPOT!** 💎' };
  if (r < 0.1) {
    const reward = 20 + Math.floor(Math.random() * 11);
    return { reward, text: '💰 **Big win!** 🎉' };
  }
  if (r < 0.3) return { reward: 10, text: '🍀 **You won!**' };
  if (r < 0.4)
    return {
      reward: 0,
      text: '💥 **Uh oh!** The Punishment Roulette hit!',
      punish: true,
    };
  return { reward: 0, text: '😢 Lost. Better luck next time!' };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamble')
    .setDescription(`Try your luck in the Nest Roulette (costs ${BET} coins)`),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    if (nestcoins.removeCoins(guildId, userId, BET) === null) {
      return interaction.reply(
        ui.fail(
          `A round costs ${BET} coins, you have ${nestcoins.getBalance(guildId, userId)}.`,
        ),
      );
    }

    const r = roll();
    if (r.reward) nestcoins.addCoins(guildId, userId, r.reward);
    let text = r.text;
    if (r.reward) text += `\n+${r.reward} coins`;
    if (r.punish) {
      const spin = await wheel.spin(interaction.guild, userId, userId);
      text += spin.error
        ? '\n…but the wheel is empty. Lucky you!'
        : `\n🎡 **${spin.entry.text}**${spin.effectText ? `\n${spin.effectText}` : ''}`;
    }

    return interaction.reply({
      embeds: [
        ui.card({
          title: '🎲 Nest Roulette',
          text,
          color: r.reward
            ? ui.COLORS.success
            : r.punish
              ? ui.COLORS.wheel
              : ui.COLORS.muted,
          footer: `Bet ${BET} · Balance ${nestcoins.getBalance(guildId, userId)} coins`,
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};
