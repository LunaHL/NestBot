const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('opinion')
    .setDescription('Check what NestBot thinks of people')
    .addSubcommand(sub =>
      sub.setName('check')
        .setDescription('See the bot\'s opinion of a user')
        .addUserOption(opt => opt.setName('user').setDescription('The user to check (defaults to you)'))
    )
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('Reset the bot\'s opinion of a user (Admin only)')
        .addUserOption(opt => opt.setName('user').setDescription('The user to reset').setRequired(true))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    
    if (sub === 'check') {
      const target = interaction.options.getUser('user') || interaction.user;
      const opinion = db.database.opinions?.[target.id] || "I haven't formed a strong opinion on them yet.";
      
      return interaction.reply({
        content: `**Opinion on ${target.username}:**\n"${opinion}"`,
        flags: 64
      });
    }

    if (sub === 'reset') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Admins only.', flags: 64 });
      }
      const target = interaction.options.getUser('user');
      db.perform(data => {
        if (data.opinions) delete data.opinions[target.id];
      });
      return interaction.reply({ content: `✅ Reset opinion on **${target.username}**.`, flags: 64 });
    }
  }
};