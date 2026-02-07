const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('memory')
    .setDescription('Manage what the bot remembers about you')
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Tell the bot something to remember')
        .addStringOption(opt =>
          opt
            .setName('fact')
            .setDescription('The fact to remember')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('list').setDescription('See what the bot knows about you'),
    )
    .addSubcommand(sub =>
      sub
        .setName('clear')
        .setDescription('Make the bot forget everything about you'),
    )
    .addSubcommand(sub =>
      sub
        .setName('add-core')
        .setDescription('Add a global core memory (Admin only)')
        .addStringOption(opt =>
          opt
            .setName('fact')
            .setDescription('The global fact')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('list-core').setDescription('See global core memories'),
    )
    .addSubcommand(sub =>
      sub
        .setName('clear-core')
        .setDescription('Clear global core memories (Admin only)'),
    )
    .addSubcommand(sub =>
      sub
        .setName('list-all')
        .setDescription('See all memories for all users (Admin only)'),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'add') {
      const fact = interaction.options.getString('fact');
      db.perform(data => {
        if (!data.memory) data.memory = {};
        if (!data.memory[userId]) data.memory[userId] = [];
        data.memory[userId].push({ text: fact, timestamp: Date.now() });
      });
      return interaction.reply({
        content: "Got it! I'll remember that... maybe. 😒",
        flags: 64,
      });
    }

    if (sub === 'list') {
      // Access DB directly to avoid write-lock on read
      const raw = db.database.memory?.[userId] || [];
      const memories = raw.map(m => (typeof m === 'string' ? m : m.text));

      if (memories.length === 0) {
        return interaction.reply({
          content:
            "I don't remember anything about you. You're not that important! 😤",
          flags: 64,
        });
      }

      return interaction.reply({
        content: `**Here's what I know:**\n- ${memories.join('\n- ')}`,
        flags: 64,
      });
    }

    if (sub === 'clear') {
      db.perform(data => {
        if (data.memory) delete data.memory[userId];
      });
      return interaction.reply({
        content: "Fine, I've forgotten everything. Happy now?",
        flags: 64,
      });
    }

    // --- CORE MEMORIES (Global) ---

    if (sub === 'add-core') {
      if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({ content: '❌ Admins only.', flags: 64 });
      }
      const fact = interaction.options.getString('fact');
      db.perform(data => {
        if (!data.coreMemory) data.coreMemory = [];
        data.coreMemory.push(fact);
      });
      return interaction.reply({ content: '🧠 Core memory added.', flags: 64 });
    }

    if (sub === 'list-core') {
      const core = db.database.coreMemory || [];
      if (core.length === 0) {
        return interaction.reply({
          content: "I don't have any core memories yet.",
          flags: 64,
        });
      }
      return interaction.reply({
        content: `**Core Memories (Global Facts):**\n- ${core.join('\n- ')}`,
        flags: 64,
      });
    }

    if (sub === 'clear-core') {
      if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({ content: '❌ Admins only.', flags: 64 });
      }
      db.perform(data => {
        delete data.coreMemory;
      });
      return interaction.reply({
        content: '🧠 Core memories wiped.',
        flags: 64,
      });
    }

    if (sub === 'list-all') {
      if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({ content: '❌ Admins only.', flags: 64 });
      }

      const allMemories = db.database.memory || {};
      const entries = Object.entries(allMemories);
      const validEntries = entries.filter(
        ([_, mems]) => mems && mems.length > 0,
      );

      if (validEntries.length === 0) {
        return interaction.reply({
          content: "I don't remember anything about anyone.",
          flags: 64,
        });
      }

      let output = '**All User Memories:**\n\n';
      for (const [uid, mems] of validEntries) {
        const texts = mems.map(m => (typeof m === 'string' ? m : m.text));
        output += `User <@${uid}> (${uid}):\n- ${texts.join('\n- ')}\n\n`;
      }

      if (output.length > 2000) {
        const buffer = Buffer.from(output, 'utf-8');
        return interaction.reply({
          content: 'The memory list is too long, here is a file:',
          files: [{ attachment: buffer, name: 'all_memories.txt' }],
          flags: 64,
        });
      }

      return interaction.reply({ content: output, flags: 64 });
    }
  },
};
