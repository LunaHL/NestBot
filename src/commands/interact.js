const { SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('interact')
    .setDescription('Perform an action on the bot')
    .addStringOption(option =>
      option.setName('action')
        .setDescription('The action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'Pat', value: 'pat' },
          { name: 'Poke', value: 'poke' },
          { name: 'Hug', value: 'hug' },
          { name: 'Boop', value: 'boop' },
          { name: 'High-five', value: 'high-five' }
        )
    ),
  async execute(interaction) {
    if (!process.env.GEMINI_API_KEY) {
      return interaction.reply({ content: '❌ AI is not configured.', flags: 64 });
    }

    await interaction.deferReply();

    const action = interaction.options.getString('action');
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const nickname = interaction.member?.displayName || username;

    // Load context
    const memories = db.database.memory?.[userId] || [];
    const opinion = db.database.opinions?.[userId] || "You haven't formed a strong opinion on them yet.";
    const memText = memories.length ? `\nFacts you know about them:\n- ${memories.join('\n- ')}` : '';

    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const prompt = `
You are NestBot, a mild tsundere Discord bot. You are helpful but act sassy or reluctant.
User: ${nickname} (@${username}).
Your current opinion of them: "${opinion}".${memText}

The user just performed this action on you: *${action}s you*.
React to this action in character. Keep it short (1-2 sentences). Include an action in asterisks (e.g. *blushes*, *looks away*, *sighs*).`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();

      await interaction.editReply(`**${nickname}** *${action}s NestBot*\n\n${response}`);
    } catch (error) {
      console.error('[Interact] Error:', error);
      await interaction.editReply('I... I don\'t know how to react to that. Baka!');
    }
  }
};