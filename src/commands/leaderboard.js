const { SlashCommandBuilder } = require('discord.js');
const nestcoins = require('../services/nestcoins');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the Nestcoins leaderboard for this server')
    .addIntegerOption(opt =>
      opt
        .setName('limit')
        .setDescription('How many entries to show (default 10, max 25)')
        .setMinValue(1)
        .setMaxValue(25),
    ),

  async execute(interaction) {
    const limit = interaction.options.getInteger('limit') ?? 10;

    const all = nestcoins.getAllBalances(interaction.guildId);
    const top = all
      .filter(([, amt]) => amt > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    if (top.length === 0) {
      return interaction.reply({
        content: 'No Nestcoins recorded in this server yet.',
        flags: 64, // ephemeral
      });
    }

    const lines = top.map(
      ([userId, amt], i) => `#${i + 1} — <@${userId}> — ${amt} Nestcoins`,
    );
    return interaction.reply({
      content:
        `🏆 **Nestcoins Leaderboard** (top ${top.length})\n` + lines.join('\n'),
    });
  },
};
