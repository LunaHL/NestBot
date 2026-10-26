const { SlashCommandBuilder } = require('discord.js');
const achievements = require('../services/achievements');
const memory = require('../services/memory');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('memory')
    .setDescription('Things NestBot remembers about you in chat')
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Tell NestBot something to remember about you')
        .addStringOption(opt =>
          opt
            .setName('fact')
            .setDescription('e.g. "I like oat milk lattes" or "My cat is called Mochi"')
            .setRequired(true)
            .setMaxLength(memory.MAX_LENGTH),
        ),
    )
    .addSubcommand(sub => sub.setName('list').setDescription('See what NestBot remembers about you'))
    .addSubcommand(sub =>
      sub
        .setName('forget')
        .setDescription('Make NestBot forget one thing (or everything)')
        .addIntegerOption(opt =>
          opt.setName('number').setDescription('Number from /memory list (leave empty to forget everything)').setMinValue(1),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (sub === 'add') {
      const result = memory.addMemory(guildId, userId, interaction.options.getString('fact'));
      if (result.error === 'full') {
        return interaction.reply({
          content: `🧠 My notebook about you is full (${memory.MAX_MEMORIES} things). Use \`/memory forget\` to make room.`,
          flags: 64,
        });
      }
      if (result.error) return interaction.reply({ content: '🧠 That was empty.', flags: 64 });
      await interaction.reply({ content: `🧠 Noted: *${result.text}*`, flags: 64 });
      return achievements.announce(interaction, [userId]);
    }

    if (sub === 'list') {
      const list = memory.getMemories(guildId, userId);
      if (!list.length) {
        return interaction.reply({
          content: "🧠 I don't remember anything about you yet. Tell me something with `/memory add`.",
          flags: 64,
        });
      }
      const lines = list.map((m, i) => `**${i + 1}.** ${m.text}`);
      return interaction.reply({
        content: `🧠 **What I remember about you** (${list.length}/${memory.MAX_MEMORIES}):\n${lines.join('\n')}`,
        flags: 64,
      });
    }

    if (sub === 'forget') {
      const number = interaction.options.getInteger('number');
      if (!number) {
        memory.clearMemories(guildId, userId);
        return interaction.reply({ content: '🧠 Done. I forgot everything about you. Who are you again?', flags: 64 });
      }
      const removed = memory.removeMemory(guildId, userId, number);
      if (!removed) return interaction.reply({ content: `🧠 There's no #${number}. Check \`/memory list\`.`, flags: 64 });
      return interaction.reply({ content: `🧠 Forgotten: ~~${removed}~~`, flags: 64 });
    }
  },
};
