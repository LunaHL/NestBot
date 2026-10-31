// /leaderboard: the richest members of the Nest.
const { SlashCommandBuilder } = require('discord.js');
const nestcoins = require('../services/nestcoins');
const ui = require('../utils/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('The richest members of the Nest')
    .addIntegerOption(o =>
      o
        .setName('limit')
        .setDescription('How many (default 10, max 25)')
        .setMinValue(1)
        .setMaxValue(25),
    ),

  async execute(interaction) {
    const limit = interaction.options.getInteger('limit') ?? 10;
    const all = nestcoins
      .getAllBalances(interaction.guildId)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
    if (!all.length)
      return interaction.reply(
        ui.info('Nobody has coins yet. Start with `/daily`!'),
      );

    const lines = all
      .slice(0, limit)
      .map(([id, n], i) => `${ui.rank(i)} <@${id}> · ${ui.coins(n)}`);
    const mine = all.findIndex(([id]) => id === interaction.user.id);
    return interaction.reply({
      embeds: [
        ui.card({
          title: '🏆 NestCoins Leaderboard',
          text: lines.join('\n'),
          color: ui.COLORS.coins,
          footer:
            mine >= 0
              ? `You: #${mine + 1} with ${all[mine][1]} coins`
              : 'You’re not on the board yet',
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};
