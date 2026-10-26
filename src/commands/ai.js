const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ai = require('../services/ai');
const nestcoins = require('../services/nestcoins');

// Prices in NestCoins
const PRICES = {
  roast: 20,
  compliment: 10,
  poem: 25,
  mood: 100,
};

const FUN_TITLES = {
  roast: '🔥 Roast',
  compliment: '💖 Compliment',
  poem: '📜 Poem',
};

const targetOption = (sub, what) =>
  sub.addUserOption(opt =>
    opt.setName('target').setDescription(`Who gets the ${what}`).setRequired(true),
  );

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('AI commands')
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Show bot status and AI health'),
    )
    .addSubcommand(sub =>
      targetOption(
        sub.setName('roast').setDescription(`NestBot roasts someone (${PRICES.roast} coins)`),
        'roast',
      ),
    )
    .addSubcommand(sub =>
      targetOption(
        sub
          .setName('compliment')
          .setDescription(`NestBot compliments someone (${PRICES.compliment} coins)`),
        'compliment',
      ),
    )
    .addSubcommand(sub =>
      targetOption(
        sub.setName('poem').setDescription(`NestBot writes a poem about someone (${PRICES.poem} coins)`),
        'poem',
      ).addStringOption(opt =>
        opt.setName('topic').setDescription('Optional theme for the poem').setMaxLength(100),
      ),
    )
    .addSubcommand(sub =>
      sub
        .setName('mood')
        .setDescription(`Set NestBot's personality for the rest of today (${PRICES.mood} coins)`)
        .addStringOption(opt =>
          opt
            .setName('mood')
            .setDescription('The mood')
            .setRequired(true)
            .addChoices(
              ...Object.entries(ai.MOODS).map(([value, m]) => ({ name: m.label, value })),
            ),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    // ---------- status ----------
    if (sub === 'status') {
      const aiStatus = ai.getStatus();
      const mood = ai.getMood(guildId);
      const uptime = process.uptime();

      const days = Math.floor(uptime / 86400);
      const hours = Math.floor(uptime / 3600) % 24;
      const minutes = Math.floor(uptime / 60) % 60;

      const embed = new EmbedBuilder()
        .setTitle('🤖 NestBot Status')
        .setColor(aiStatus.isRateLimited ? 0xff0000 : 0x00ff00)
        .addFields(
          { name: '🧠 AI Health', value: aiStatus.isRateLimited ? '🔴 Rate Limited' : '🟢 Operational', inline: true },
          { name: '📚 Models', value: aiStatus.models.join('\n'), inline: true },
          { name: '📉 Requests', value: `${aiStatus.totalRequests} total / ${aiStatus.failedRequests} failed`, inline: true },
          { name: '🎭 Mood today', value: mood ? `${mood.label} (by <@${mood.by}>)` : 'Normal', inline: true },
          { name: '⏱️ Uptime', value: `${days}d ${hours}h ${minutes}m`, inline: true },
          { name: '📡 Ping', value: `${interaction.client.ws.ping}ms`, inline: true },
        )
        .setTimestamp();

      // flags: 64 makes the message "ephemeral" (only visible to the executor)
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ---------- mood ----------
    if (sub === 'mood') {
      const moodKey = interaction.options.getString('mood');
      const current = ai.getMood(guildId);
      if (current) {
        return interaction.reply({
          content: `🎭 Today's mood is already **${current.label}** (bought by <@${current.by}>). Try again tomorrow!`,
          flags: 64,
          allowedMentions: { parse: [] },
        });
      }

      if (nestcoins.removeCoins(guildId, userId, PRICES.mood) === null) {
        return interaction.reply({
          content: `💸 You need **${PRICES.mood}** NestCoins, you have **${nestcoins.getBalance(guildId, userId)}**.`,
          flags: 64,
        });
      }

      if (!ai.setMood(guildId, moodKey, userId)) {
        // Someone else bought one at the same moment
        nestcoins.addCoins(guildId, userId, PRICES.mood);
        return interaction.reply({ content: '🎭 Someone was faster! Coins refunded.', flags: 64 });
      }

      return interaction.reply(
        `🎭 ${interaction.user} paid **${PRICES.mood}** NestCoins: NestBot is now in **${ai.MOODS[moodKey].label}** mode until midnight!`,
      );
    }

    // ---------- roast / compliment / poem ----------
    if (FUN_TITLES[sub]) {
      if (!process.env.GEMINI_API_KEY) {
        return interaction.reply({ content: '❌ The AI is not set up on this bot.', flags: 64 });
      }

      const target = interaction.options.getUser('target');
      if (target.bot) {
        return interaction.reply({ content: "🤖 Leave the bots out of this.", flags: 64 });
      }

      const price = PRICES[sub];
      if (nestcoins.removeCoins(guildId, userId, price) === null) {
        return interaction.reply({
          content: `💸 You need **${price}** NestCoins, you have **${nestcoins.getBalance(guildId, userId)}**.`,
          flags: 64,
        });
      }

      // The AI can take a few seconds
      await interaction.deferReply();

      const targetMember = interaction.options.getMember('target');
      try {
        const text = await ai.generateFun(sub, {
          channel: interaction.channel,
          guildId,
          buyerName: interaction.member?.displayName || interaction.user.username,
          targetName: targetMember?.displayName || target.username,
          targetId: target.id,
          topic: interaction.options.getString('topic'),
        });

        const embed = new EmbedBuilder()
          .setTitle(`${FUN_TITLES[sub]} for ${targetMember?.displayName || target.username}`)
          .setDescription(text)
          .setColor(sub === 'roast' ? 0xff5722 : sub === 'compliment' ? 0xff69b4 : 0x9b59b6)
          .setFooter({ text: `Ordered by ${interaction.user.username} for ${price} NestCoins` });

        return interaction.editReply({
          content: `${target}`,
          embeds: [embed],
          allowedMentions: { users: [target.id] },
        });
      } catch (e) {
        console.error(`[AI] ${sub} failed:`, e);
        nestcoins.addCoins(guildId, userId, price);
        return interaction.editReply(
          `😵‍💫 I couldn't think of anything right now. Your **${price}** NestCoins were refunded.`,
        );
      }
    }
  },
};
