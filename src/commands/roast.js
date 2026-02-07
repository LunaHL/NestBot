const { SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roast')
    .setDescription('Roast a user with Tsundere energy')
    .addUserOption(option => 
      option.setName('target').setDescription('The user to roast').setRequired(true)
    ),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    
    if (!process.env.GEMINI_API_KEY) {
      return interaction.reply({ content: '❌ AI is not configured.', flags: 64 });
    }

    await interaction.deferReply();

    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const prompt = `You are a tsundere. Roast the user named "${target.username}". Be creative, funny, but slightly mean in a cute way. Don't hold back too much, but keep it TOS friendly.`;
      
      const result = await model.generateContent(prompt);
      const response = result.response.text();
      
      await interaction.editReply(`**To ${target}:** ${response}`);
    } catch (error) {
      console.error(error);
      await interaction.editReply('I... I forgot how to roast. Baka!');
    }
  }
};