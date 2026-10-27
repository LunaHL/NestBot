// /settings: server settings for admins. Values are stored per server via
// src/services/settings.js.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { isAdmin, denyNonAdmin } = require('../utils/permissions');
const { getStreakMode, setSetting } = require('../services/settings');
const { STREAK_MODES, streakReward } = require('../utils/streak');

// Example table: what a hard puzzle (30 coins) pays on these streak days
const EXAMPLE_BASE = 30;
const EXAMPLE_DAYS = [1, 3, 7, 10, 30];

function comparisonTable() {
  const rows = EXAMPLE_DAYS.map(day => {
    const now = streakReward(EXAMPLE_BASE, day, 'capped').total;
    const old = streakReward(EXAMPLE_BASE, day, 'multiplier').total;
    return `Day ${String(day).padEnd(2)} │ ${String(now).padStart(4)} │ ${String(old).padStart(4)}`;
  });
  return (
    '```\n' +
    'Streak │  New │  Old\n' +
    '───────┼──────┼──────\n' +
    rows.join('\n') +
    '\n```\n' +
    `*Example: a hard puzzle (${EXAMPLE_BASE} coins). Applies to Puzzle and NestWord.*`
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Server settings (admins only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('streak')
        .setDescription('How streaks are rewarded in Puzzle and NestWord')
        .addStringOption(opt =>
          opt
            .setName('mode')
            .setDescription('Leave empty to see the current mode')
            .addChoices(
              ...Object.entries(STREAK_MODES).map(([value, m]) => ({
                name: m.label,
                value,
              })),
            ),
        ),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction)) return denyNonAdmin(interaction);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'streak') {
      const chosen = interaction.options.getString('mode');
      const before = getStreakMode(guildId);
      if (chosen) setSetting(guildId, 'streakMode', chosen);
      const mode = getStreakMode(guildId);

      let title = '🔥 Streak rewards';
      if (chosen && chosen !== before) title = '✅ Streak rewards changed';
      else if (chosen) title = 'ℹ️ Streak rewards (no change)';

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(mode === 'multiplier' ? 0xe67e22 : 0x2ecc71)
        .setDescription(
          `Active: **${STREAK_MODES[mode].label}**\n\n${comparisonTable()}` +
            (mode === 'multiplier'
              ? '\n\n⚠️ The old mode has no limit: long streaks pay huge amounts of coins.'
              : ''),
        )
        .setFooter({ text: 'Switch with /settings streak mode:' });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
