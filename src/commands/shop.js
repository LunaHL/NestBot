const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const nestcoins = require('../services/nestcoins');
const db = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Shop to buy nice rewards!')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all available items in the shop.'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('buy')
        .setDescription('Buy an item from the shop.')
        .addIntegerOption(option =>
          option
            .setName('id')
            .setDescription('The ID of the item to buy.')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a new item to the shop.')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('The name of the item.')
            .setRequired(true),
        )
        .addIntegerOption(option =>
          option
            .setName('price')
            .setDescription('The price of the item.')
            .setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName('description')
            .setDescription('The description of the item.')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove an item from the shop.')
        .addIntegerOption(option =>
          option
            .setName('id')
            .setDescription('The ID of the item to remove.')
            .setRequired(true),
        ),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    //*Admin-only commands
    if (sub === 'add' || sub === 'remove') {
      const isAdmin = interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator,
      );
      if (!isAdmin) {
        return interaction.reply({
          content: "You don't have permission to use this subcommand.",
          flags: 64,
        });
      }
    }

    if (sub === 'list') {
      db.perform(data => {
        const shop = data.shop?.[guildId] || {};
        const items = Object.entries(shop);

        if (items.length === 0) {
          return interaction.reply({
            content: 'The shop is currently empty.',
            flags: 64,
          });
        }

        const embed = new EmbedBuilder()
          .setTitle('Shop - Available Items')
          .setColor('#00AAFF');

        for (const [id, item] of items) {
          embed.addFields({
            name: `#${id}: ${item.name}`,
            value: `${item.price} Nestcoins - ${item.description}`,
          });
        }

        interaction.reply({ embeds: [embed] });
      });
    }

    if (sub === 'add') {
      const name = interaction.options.getString('name');
      const price = interaction.options.getInteger('price');
      const description = interaction.options.getString('description');

      db.perform(data => {
        if (!data.shop) data.shop = {};
        if (!data.shop[guildId]) data.shop[guildId] = {};

        const nextId = Object.keys(data.shop[guildId]).length + 1;

        data.shop[guildId][nextId] = {
          name,
          price,
          description,
        };

        interaction.reply({
          content: `Added item #${nextId}: ${name} for ${price} Nestcoins.`,
          flags: 64,
        });
      });
    }

    if (sub === 'remove') {
      const id = interaction.options.getInteger('id');

      db.perform(data => {
        if (!data.shop || !data.shop[guildId] || !data.shop[guildId][id]) {
          return interaction.reply({
            content: `Item #${id} does not exist.`,
            flags: 64,
          });
        }
        const itemName = data.shop[guildId][id].name;
        delete data.shop[guildId][id];

        const items = Object.values(data.shop[guildId]);
        data.shop[guildId] = {};

        items.forEach((item, index) => {
          const newId = index + 1;
          data.shop[guildId][newId] = item;
        });

        interaction.reply({
          content: `Removed item #${id}: ${itemName}.`,
          flags: 64,
        });
      });
    }

    if (sub === 'buy') {
      const id = interaction.options.getInteger('id');
      const userId = interaction.user.id;

      let item;

      db.perform(data => {
        const shop = data.shop?.[guildId] || {};
        item = shop[id];
      });

      if (!item) {
        return interaction.reply({
          content: `Item #${id} does not exist.`,
          flags: 64,
        });
      }

      const balance = nestcoins.getBalance(guildId, userId);
      if (balance < item.price) {
        return interaction.reply({
          content: `You don't have enough Nestcoins to buy "${item.name}".`,
          flags: 64,
        });
      }

      const newBalance = nestcoins.removeCoins(guildId, userId, item.price);
      if (newBalance === null) {
        return interaction.reply({
          content: `Something went wrong while processing your purchase.`,
          flags: 64,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`${interaction.user.username} bought ${item.name}`)
        .setDescription(`${item.price} Nestcoins – ${item.description}`)
        .setColor('Green');

      return interaction.reply({ embeds: [embed] });
    }
  },
};
