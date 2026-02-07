const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('memory')
    .setDescription('Manage what the bot remembers about you')
    .addSubcommand(sub => 
      sub.setName('add')
        .setDescription('Tell the bot something to remember')
        .addStringOption(opt => opt.setName('fact').setDescription('The fact to remember').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('list')
        .setDescription('See what the bot knows about you')
    )
    .addSubcommand(sub => 
      sub.setName('clear')
        .setDescription('Make the bot forget everything about you')
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'add') {
      const fact = interaction.options.getString('fact');
      db.perform(data => {
        if (!data.memory) data.memory = {};
        if (!data.memory[userId]) data.memory[userId] = [];
        data.memory[userId].push(fact);
      });
      return interaction.reply({ content: 'Got it! I\'ll remember that... maybe. 😒', flags: 64 });
    }

    if (sub === 'list') {
      // Access DB directly to avoid write-lock on read
      const memories = db.database.memory?.[userId] || [];

      if (memories.length === 0) {
        return interaction.reply({ content: "I don't remember anything about you. You're not that important! 😤", flags: 64 });
      }

      return interaction.reply({ content: `**Here's what I know:**\n- ${memories.join('\n- ')}`, flags: 64 });
    }

    if (sub === 'clear') {
      db.perform(data => {
        if (data.memory) delete data.memory[userId];
      });
      return interaction.reply({ content: "Fine, I've forgotten everything. Happy now?", flags: 64 });
    }
  }
};