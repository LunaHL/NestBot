// /balance: look at coins, send coins, and (admins) grant or remove coins.
const { SlashCommandBuilder } = require('discord.js');
const { isAdmin, denyNonAdmin } = require('../utils/permissions');
const nestcoins = require('../services/nestcoins');
const ui = require('../utils/ui');

const userOpt = (o, required = true, text = 'Who') =>
  o.setName('user').setDescription(text).setRequired(required);
const amountOpt = (o, text) =>
  o.setName('amount').setDescription(text).setRequired(true).setMinValue(1);

function rankOf(guildId, userId) {
  const sorted = nestcoins
    .getAllBalances(guildId)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const i = sorted.findIndex(([id]) => id === userId);
  return i < 0 ? null : { rank: i + 1, of: sorted.length };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Your NestCoins: look, send, (admins) grant')
    .addSubcommand(s =>
      s
        .setName('view')
        .setDescription('How many coins you (or someone) have')
        .addUserOption(o => userOpt(o, false, 'Whose coins (default: yours)')),
    )
    .addSubcommand(s =>
      s
        .setName('transfer')
        .setDescription('Send someone coins')
        .addUserOption(o => userOpt(o, true, 'Who gets them'))
        .addIntegerOption(o => amountOpt(o, 'How many coins')),
    )
    .addSubcommand(s =>
      s
        .setName('grant')
        .setDescription('Give someone coins (admins)')
        .addUserOption(o => userOpt(o))
        .addIntegerOption(o => amountOpt(o, 'How many coins')),
    )
    .addSubcommand(s =>
      s
        .setName('remove')
        .setDescription('Take coins away (admins)')
        .addUserOption(o => userOpt(o))
        .addIntegerOption(o => amountOpt(o, 'How many coins')),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (sub === 'view') {
      const user = target || interaction.user;
      const balance = nestcoins.getBalance(guildId, user.id);
      const r = rankOf(guildId, user.id);
      return interaction.reply({
        embeds: [
          ui.card({
            title: `💰 ${user.id === interaction.user.id ? 'Your' : `${user.username}’s`} NestCoins`,
            text: `${ui.coins(balance)} coins${r ? `\n🏆 Rank **#${r.rank}** of ${r.of}` : ''}`,
            color: ui.COLORS.coins,
            thumbnail: user.displayAvatarURL(),
            footer: nestcoins.isFreeMode(guildId)
              ? '🎉 Free mode: everything you can buy is free right now'
              : 'Earn: /daily · /puzzle · /nestword · /wordle · Spend: /shop · /drinks · /nickname',
          }),
        ],
        flags: 64,
      });
    }

    if (sub === 'transfer') {
      if (target.id === interaction.user.id)
        return interaction.reply(ui.fail('You can’t send coins to yourself.'));
      if (target.bot)
        return interaction.reply(ui.fail('Bots don’t need coins.'));
      const left = nestcoins.removeCoins(guildId, interaction.user.id, amount);
      if (left === null) {
        return interaction.reply(
          ui.fail(
            `You only have ${nestcoins.getBalance(guildId, interaction.user.id)} coins.`,
          ),
        );
      }
      nestcoins.addCoins(guildId, target.id, amount);
      return interaction.reply({
        embeds: [
          ui.card({
            title: '💸 Coins sent',
            text: `<@${interaction.user.id}> sent <@${target.id}> ${ui.coins(amount)} coins.`,
            color: ui.COLORS.coins,
            footer: `You have ${left} coins left`,
          }),
        ],
        allowedMentions: { users: [target.id] },
      });
    }

    if (!isAdmin(interaction)) return denyNonAdmin(interaction);

    if (sub === 'grant') {
      const now = nestcoins.addCoins(guildId, target.id, amount);
      return interaction.reply(
        ui.ok(
          `Gave <@${target.id}> **${amount}** coins. They have **${now}** now.`,
        ),
      );
    }
    if (sub === 'remove') {
      const now = nestcoins.removeCoins(guildId, target.id, amount);
      if (now === null) {
        return interaction.reply(
          ui.fail(
            `<@${target.id}> only has ${nestcoins.getBalance(guildId, target.id)} coins.`,
          ),
        );
      }
      return interaction.reply(
        ui.ok(
          `Took **${amount}** coins from <@${target.id}>. They have **${now}** now.`,
        ),
      );
    }
  },
};
