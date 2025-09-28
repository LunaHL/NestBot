const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wheel')
    .setDescription('Spin the Punishment Wheel!')
    //*sub commands
    .addSubcommand(sub =>
      sub
        .setName('spin')
        .setDescription('Spin the wheel and get a random punishment')
        .addUserOption(option =>
          option.setName('target')
            .setDescription('Optionally choose someone to punish')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add a new punishment to the wheel')
        .addStringOption(option =>
          option.setName('text')
            .setDescription('The punishment to add')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a punishment by its ID')
        .addIntegerOption(option =>
          option.setName('id')
            .setDescription('The ID of the punishment to remove')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
        sub
            .setName('list')
            .setDescription('List all punishments')
    ),

 //* sub command execution
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'spin') {
      let punishment;
      db.perform(data => {
        if (!data.wheel) data.wheel = [];
        if (data.wheel.length > 0) {
          const randomIndex = Math.floor(Math.random() * data.wheel.length);
          punishment = { id: randomIndex, text: data.wheel[randomIndex] };
        }
      });

      if (!punishment) {
        await interaction.reply('🎡 The wheel is empty!');
        return;
      }

      const target = interaction.options.getUser('target') || interaction.user;
      await interaction.reply(`🎡 ${target} has been chosen!\n**Punishment:** ${punishment.text}`);
    }

    if (sub === 'add') {
      const text = interaction.options.getString('text');
      let id;
      db.perform(data => {
        if (!data.wheel) data.wheel = [];
        data.wheel.push(text);
        id = data.wheel.length - 1; // index as ID
      });

      await interaction.reply(`✅ Added new punishment (#${id}): ${text}`);
    }

    if (sub === 'remove') {
      const id = interaction.options.getInteger('id');
      let removed;
      db.perform(data => {
        if (!data.wheel) data.wheel = [];
        if (id >= 0 && id < data.wheel.length) {
          removed = data.wheel.splice(id, 1);
        }
      });

      if (removed) {
        await interaction.reply(`🗑️ Removed punishment #${id}: ${removed}`);
      } else {
        await interaction.reply(`⚠️ No punishment found with ID #${id}`);
      }
    }

    if (sub === 'list') {
        let list = '🎡 **Punishment Wheel List:**\n';
        let count = 0;

        db.perform(data => {
            if (!data.wheel) data.wheel = [];
            data.wheel.forEach((punishment, index) => {
            list += `#${index}: ${punishment}\n`;
            count++;
            });
        });


        if (count === 0) {
            await interaction.reply({ content: '🎡 The wheel is empty!'});
        } else {
            await interaction.reply({ content: list});
        }
    }
}
};
