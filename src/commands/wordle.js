// /wordle: rewards for the Wordle app in Discord. Only the Discord side
// lives here; reading the app's summary and paying is in src/services/wordle.js.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
} = require('discord.js');
const wordle = require('../services/wordle');
const { isAdmin, denyNonAdmin } = require('../utils/permissions');

const COLOR = 0x6aaa64; // Wordle green
const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wordle')
    .setDescription('Coins for playing the Wordle app')
    .addSubcommand(sub =>
      sub
        .setName('stats')
        .setDescription('Wordle stats')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Whose stats (default: you)'),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('leaderboard').setDescription('Best Wordle players'),
    )
    .addSubcommand(sub =>
      sub.setName('rewards').setDescription('How many coins each result pays'),
    )
    .addSubcommand(sub =>
      sub
        .setName('channel')
        .setDescription(
          'The channel where the Wordle app posts its results (admins only)',
        )
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Wordle channel')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('scan')
        .setDescription('Pay any results the bot missed (admins only)'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // ---------- stats ----------
    if (sub === 'stats') {
      const user = interaction.options.getUser('user') || interaction.user;
      const s = wordle.getSummary(guildId, user.id);
      if (!s) {
        return interaction.reply({
          content: `🟩 No Wordle results for ${user.username} yet. Play the Wordle app in the Wordle channel!`,
          flags: 64,
        });
      }
      const max = Math.max(...Object.values(s.dist), 1);
      const bars = ['1', '2', '3', '4', '5', '6', 'X']
        .map(k => {
          const n = s.dist[k] || 0;
          const bar = '🟩'.repeat(Math.round((n / max) * 8)) || '▫️';
          return `\`${k}\` ${bar} ${n}`;
        })
        .join('\n');

      const embed = new EmbedBuilder()
        .setTitle(`🟩 Wordle stats for ${user.username}`)
        .setThumbnail(user.displayAvatarURL())
        .setColor(COLOR)
        .addFields(
          {
            name: 'Played',
            value: `**${s.played}** (${s.winRate}% solved)`,
            inline: true,
          },
          { name: 'Average', value: `**${s.average}** guesses`, inline: true },
          { name: '👑 Crowns', value: `**${s.crowns}**`, inline: true },
          {
            name: '🔥 Streak',
            value: `**${s.streak}** (best ${s.bestStreak})`,
            inline: true,
          },
          { name: '💰 Coins earned', value: `**${s.coins}**`, inline: true },
          { name: 'Results', value: bars },
        );
      return interaction.reply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    }

    // ---------- leaderboard ----------
    if (sub === 'leaderboard') {
      const lb = wordle.getLeaderboard(guildId, 5);
      const list = (rows, fmt) =>
        rows.length
          ? rows
              .map(
                ([id, v], i) =>
                  `${MEDALS[i] || `**${i + 1}.**`} <@${id}> — ${fmt(v)}`,
              )
              .join('\n')
          : '–';
      const embed = new EmbedBuilder()
        .setTitle('🟩 Wordle Leaderboard')
        .setColor(COLOR)
        .addFields(
          { name: '👑 Most crowns', value: list(lb.crowns, v => `**${v}**`) },
          {
            name: '🎯 Best average (min. 5 solved)',
            value: list(lb.average, v => `**${v.toFixed(2)}** guesses`),
          },
          {
            name: '📅 Most days played',
            value: list(lb.played, v => `**${v}**`),
          },
        );
      return interaction.reply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    }

    // ---------- rewards ----------
    if (sub === 'rewards') {
      const embed = new EmbedBuilder()
        .setTitle('🟩 Wordle rewards')
        .setColor(COLOR)
        .setDescription(
          'Play the Wordle app in the Wordle channel. When it posts the daily results, NestBot pays everyone automatically:\n' +
            wordle.rewardsTable(),
        );
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ===== Admin only from here =====
    if (!isAdmin(interaction)) return denyNonAdmin(interaction);

    // ---------- channel ----------
    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel');
      wordle.setChannel(guildId, channel.id);
      return interaction.reply({
        content:
          `✅ NestBot now reads the Wordle app's daily results in <#${channel.id}> and pays coins automatically.\n` +
          'Results posted there recently are paid within 30 minutes (or right away with `/wordle scan`).',
        flags: 64,
      });
    }

    // ---------- scan ----------
    if (sub === 'scan') {
      if (!wordle.getGuildData(guildId).channelId) {
        return interaction.reply({
          content: '❌ Set the Wordle channel first with `/wordle channel`.',
          flags: 64,
        });
      }
      await interaction.deferReply({ flags: 64 });
      const before = Object.keys(
        wordle.getGuildData(guildId).days || {},
      ).length;
      await wordle.catchUp(interaction.client);
      const after = Object.keys(wordle.getGuildData(guildId).days || {}).length;
      return interaction.editReply(
        after > before
          ? `✅ Paid ${after - before} missed day(s).`
          : '✅ Nothing missing. Every result in the last messages was already paid.',
      );
    }
  },
};
