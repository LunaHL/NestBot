// Right-click menu on a member (Apps → …): the most common things you do
// with someone, without typing a command or their name. Discord allows at
// most 5 of these. Menus and forms ("usermenu:…") are routed here by
// events/interactionCreate.js.
const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { runAs } = require('../utils/runAs');
const drinks = require('../services/drinks');
const nickname = require('../services/nickname');
const blindfold = require('../services/blindfold');
const { CATEGORIES } = require('../config/drinksMenu');

const fail = content => ({ content: `❌ ${content}`, flags: 64 });

const entry = (name, execute) => ({
  data: new ContextMenuCommandBuilder()
    .setName(name)
    .setType(ApplicationCommandType.User)
    .setDMPermission(false),
  execute,
});

const ENTRIES = [
  entry('View profile', async interaction => {
    const user = interaction.targetUser;
    return runAs(interaction, ['profile', null, { user }], {
      members: { user: interaction.targetMember },
    });
  }),

  entry('Gift a drink', async interaction => {
    const user = interaction.targetUser;
    if (user.bot)
      return interaction.reply(fail('Sweet, but bots run on electricity. ⚡'));
    if (user.id === interaction.user.id)
      return interaction.reply(fail('For yourself? Use `/drinks order`.'));
    return interaction.reply({
      content: `🍹 What would you like to buy <@${user.id}>?`,
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`usermenu:drinkcat:${user.id}`)
            .setPlaceholder('Pick a section of the menu…')
            .addOptions(
              Object.entries(CATEGORIES)
                .filter(([key]) =>
                  drinks.availableDrinks().some(([, d]) => d.category === key),
                )
                .map(([value, c]) => ({
                  label: c.name,
                  value,
                  emoji: c.emoji,
                })),
            ),
        ),
      ],
      flags: 64,
      allowedMentions: { parse: [] },
    });
  }),

  entry('Challenge to a duel', async interaction => {
    const user = interaction.targetUser;
    if (user.bot || user.id === interaction.user.id)
      return interaction.reply(fail('Pick someone else to duel.'));
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`usermenu:duel:${user.id}`)
        .setTitle(`Duel ${user.username}`.slice(0, 45))
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('bet')
              .setLabel('Bet in NestCoins (each, 0 = just for fun)')
              .setStyle(TextInputStyle.Short)
              .setValue('10')
              .setMaxLength(4)
              .setRequired(true),
          ),
        ),
    );
  }),

  entry('Rename (costs coins)', async interaction => {
    const shop = require('./shop');
    const problem = await shop.nickProblem(
      interaction,
      interaction.targetUser.id,
    );
    if (problem)
      return interaction.reply({
        content: `❌ ${problem}`,
        flags: 64,
        allowedMentions: { parse: [] },
      });
    return interaction.reply({
      ...shop.timeMenu(interaction.guildId, interaction.targetUser.id),
      flags: 64,
    });
  }),

  entry('Blindfold (costs coins)', async interaction => {
    const shop = require('./shop');
    if (!blindfold.isSetUp(interaction.guildId))
      return interaction.reply(
        fail('Blindfolds aren’t set up on this server.'),
      );
    if (interaction.targetUser.bot)
      return interaction.reply(fail('Bots can’t be blindfolded.'));
    return interaction.reply({
      ...shop.blindMenu(interaction.guildId, interaction.targetUser.id),
      flags: 64,
    });
  }),
];

async function handleComponent(interaction) {
  const [, action, targetId] = interaction.customId.split(':');
  const guild = interaction.guild;

  // 🍹 Section picked → pick the drink
  if (action === 'drinkcat') {
    const list = drinks
      .availableDrinks()
      .filter(([, d]) => d.category === interaction.values[0]);
    return interaction.update({
      content: `${CATEGORIES[interaction.values[0]]?.emoji || '🍹'} Which one for <@${targetId}>?`,
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`usermenu:drink:${targetId}`)
            .setPlaceholder('Pick a drink…')
            .addOptions(
              list.slice(0, 25).map(([key, d]) => ({
                label: `${d.name} · ${d.price} coins`.slice(0, 100),
                value: key,
                emoji: d.emoji,
              })),
            ),
        ),
      ],
      allowedMentions: { parse: [] },
    });
  }

  // 🍹 Drink picked → the normal /drinks gift (posted in the channel)
  if (action === 'drink') {
    const user = await interaction.client.users
      .fetch(targetId)
      .catch(() => null);
    if (!user)
      return interaction.reply(fail('That person isn’t here anymore.'));
    const member = await guild.members.fetch(targetId).catch(() => null);
    return runAs(
      interaction,
      ['drinks', 'gift', { user, drink: interaction.values[0] }],
      { members: { user: member }, private: false },
    );
  }

  // 🤺 Bet entered → the normal /duel
  if (action === 'duel') {
    const bet = parseInt(interaction.fields.getTextInputValue('bet'), 10);
    if (!Number.isFinite(bet) || bet < 0)
      return interaction.reply(fail('The bet has to be a number, like 10.'));
    const max = require('./duel').MAX_BET;
    if (bet > max) return interaction.reply(fail(`The highest bet is ${max}.`));
    const user = await interaction.client.users
      .fetch(targetId)
      .catch(() => null);
    if (!user)
      return interaction.reply(fail('That person isn’t here anymore.'));
    const member = await guild.members.fetch(targetId).catch(() => null);
    return runAs(interaction, ['duel', null, { opponent: user, bet }], {
      members: { opponent: member },
      private: false,
    });
  }

  return interaction.reply(fail('Unknown button.'));
}

module.exports = {
  commands: ENTRIES,
  handleComponent,
  NAMES: ENTRIES.map(e => e.data.name),
  nicknamesOn: guildId => nickname.enabled(guildId),
};
