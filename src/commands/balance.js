const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const nestcoins = require('../services/nestcoins');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Manage and view Nestcoins')
    .addSubcommand(sub =>
      sub
        .setName('view')
        .setDescription('View your Nestcoins or someone else’s')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to inspect (optional)')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('grant')
        .setDescription('Grant Nestcoins to a user (admin only)')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('Target user')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount')
            .setDescription('Amount of Nestcoins to grant')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove Nestcoins from a user (admin only)')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('Target user')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount')
            .setDescription('Amount of Nestcoins to remove')
            .setRequired(true)
            .setMinValue(1)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    //*Admin-only commands
    if (sub === 'grant' || sub === 'remove') {
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) {
        return interaction.reply({
          content: "You don't have permission to use this subcommand.",
          ephemeral: true
        });
      }
    }

    if (sub === 'view') {
        const target = interaction.options.getUser('user') ?? interaction.user;
        const balance = nestcoins.getBalance(interaction.guildId, target.id);

        return interaction.reply({
            content: `The balance of ${target.username} is ${balance} Nestcoins.`,
            ephemeral: true
        });
    }

    if (sub === 'grant') {
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (!target || amount < 1) {
            return interaction.reply({
                content: 'Invalid user or amount.',
                ephemeral: true
            });
        }
        const newBalance = nestcoins.addCoins(interaction.guildId, target.id, amount);
        return interaction.reply({
            content: `✅ Granted ${amount} Nestcoins to ${target.username}. New balance: ${newBalance} Nestcoins.`,
            ephemeral: true
        });
    }

    if (sub === 'remove') {
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (!target || amount < 1) {
          return interaction.reply({ content: 'Invalid parameters.', ephemeral: true });
        }

        const newBal = nestcoins.removeCoins(interaction.guildId, target.id, amount);

        if (newBal === null) {
          return interaction.reply({
            content: `❌ Cannot remove **${amount}** Nestcoins from **${target.tag}**: insufficient funds.`,
            ephemeral: true,
          });
        }

        return interaction.reply({
          content: `✅ Removed **${amount}** Nestcoins from **${target.tag}**.\n💰 New balance: **${newBal}** Nestcoins.`,
          ephemeral: true,
        });
      }

 },
};  
