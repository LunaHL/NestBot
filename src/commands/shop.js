// /shop: browse, buy with a menu, admins manage items.
// Logic: src/services/shop.js; effects (gag, nickname): src/services/effects.js.
// Menus and buttons ("shop:…") keep working after restarts.
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} = require('discord.js');
const shop = require('../services/shop');
const nestcoins = require('../services/nestcoins');
const achievements = require('../services/achievements');
const { EFFECT_CHOICES, describe } = require('../services/effects');
const { isAdmin, denyNonAdmin } = require('../utils/permissions');
const ui = require('../utils/ui');

const price = (guildId, n) =>
  nestcoins.isFreeMode(guildId) ? `~~${n}~~ **free**` : ui.coins(n);

function browseView(guildId) {
  const items = shop.getItems(guildId);
  if (!items.length) {
    return {
      embeds: [
        ui.card({
          title: '🛍️ The Nest Shop',
          text: 'The shop is empty right now. Admins add items with `/shop add`.',
          color: ui.COLORS.shop,
        }),
      ],
    };
  }
  const embed = ui.card({
    title: '🛍️ The Nest Shop',
    color: ui.COLORS.shop,
    text: nestcoins.isFreeMode(guildId)
      ? '🎉 **Free mode:** everything costs nothing right now!'
      : null,
    fields: items.slice(0, 25).map(i => ({
      name: `${i.emoji} ${i.name}`,
      value:
        `${price(guildId, i.price)}\n${i.description || ''}${i.effect ? `\n${describe(i.effect)}` : ''}`.trim(),
      inline: true,
    })),
    footer:
      'Pick something in the menu below. More to spend coins on: /drinks · /nickname · /ai',
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId('shop:pick')
    .setPlaceholder('🛒 Buy something…')
    .addOptions(
      items.slice(0, 25).map(i => ({
        label:
          `${i.name} · ${nestcoins.isFreeMode(guildId) ? 'free' : `${i.price} coins`}`.slice(
            0,
            100,
          ),
        value: String(i.id),
        emoji: i.emoji,
        description:
          (i.effect ? describe(i.effect) : i.description || '').slice(0, 100) ||
          undefined,
      })),
    );
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

function confirmView(guildId, item, targetId) {
  const what = item.effect
    ? `\n${describe(item.effect).replace('the target', `<@${targetId}>`)}`
    : '';
  return {
    content: `🛒 Buy **${item.emoji} ${item.name}** for ${price(guildId, item.price)}?${what}`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`shop:confirm:${item.id}:${targetId || 'none'}`)
          .setLabel('Buy')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('shop:cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

/** Do the purchase and announce it in the channel. */
async function purchase(interaction, id, target, { viaButton }) {
  const targetId = target?.id || null;
  const r = await shop.buy(interaction.guild, interaction.user.id, id, target);
  const errors = {
    gone: 'That item isn’t in the shop anymore.',
    target: 'This item needs a target.',
    bot: 'Bots can’t be targeted.',
    coins: `You need ${r.item?.price} coins, you have ${r.balance}.`,
  };
  if (r.error) {
    const msg = ui.fail(errors[r.error]);
    return viaButton
      ? interaction.update({ content: msg.content, components: [] })
      : interaction.reply(msg);
  }

  const name = interaction.member?.displayName || interaction.user.username;
  const announcement = {
    embeds: [
      ui.card({
        title: `${r.item.emoji} ${name} bought ${r.item.name}`,
        text: r.effectText || r.item.description || null,
        color: ui.COLORS.shop,
        footer: r.paid ? `Paid ${r.paid} coins` : '🎉 Free',
      }),
    ],
    allowedMentions: { parse: [] },
  };
  if (viaButton) {
    await interaction.update({ content: '✅ Bought!', components: [] });
    await interaction.followUp(announcement);
  } else {
    await interaction.reply(announcement);
  }
  return achievements.announce(interaction, [interaction.user.id, targetId]);
}

async function handleComponent(interaction) {
  const [, action, idText, targetId] = interaction.customId.split(':');
  const guildId = interaction.guildId;

  if (action === 'cancel')
    return interaction.update({ content: '👍 Cancelled.', components: [] });

  if (action === 'pick') {
    const item = shop.getItem(guildId, interaction.values[0]);
    if (!item)
      return interaction.reply(ui.fail('That item isn’t in the shop anymore.'));
    if (!item.effect)
      return interaction.reply({
        ...confirmView(guildId, item, null),
        flags: 64,
      });
    return interaction.reply({
      content: `${item.emoji} **${item.name}**: ${describe(item.effect)}. Who?`,
      components: [
        new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`shop:target:${item.id}`)
            .setPlaceholder('👤 Pick the target…'),
        ),
      ],
      flags: 64,
    });
  }

  if (action === 'target') {
    const item = shop.getItem(guildId, idText);
    if (!item)
      return interaction.update({
        content: '❌ That item isn’t in the shop anymore.',
        components: [],
      });
    return interaction.update(
      confirmView(guildId, item, interaction.values[0]),
    );
  }

  if (action === 'confirm') {
    const target =
      targetId === 'none'
        ? null
        : await interaction.client.users.fetch(targetId).catch(() => null);
    return purchase(interaction, idText, target, { viaButton: true });
  }
  return interaction.reply(ui.fail('Unknown button.'));
}

const itemOption = o =>
  o
    .setName('item')
    .setDescription('Which item (start typing)')
    .setRequired(true)
    .setAutocomplete(true);
const effectOptions = s =>
  s
    .addStringOption(o =>
      o
        .setName('effect')
        .setDescription('What it does to the target')
        .addChoices({ name: '— none', value: 'none' }, ...EFFECT_CHOICES),
    )
    .addIntegerOption(o =>
      o
        .setName('minutes')
        .setDescription('How long the effect lasts (default 5)')
        .setMinValue(1)
        .setMaxValue(1440),
    )
    .addStringOption(o =>
      o
        .setName('nickname')
        .setDescription('Nickname effect: the name the target gets')
        .setMaxLength(32),
    );

function effectFrom(o, current = null) {
  const type = o.getString('effect');
  if (type === 'none') return null;
  if (!type && !current) return null;
  const base = current || { type, durationSec: 300, text: null };
  return {
    type: type || base.type,
    durationSec: o.getInteger('minutes')
      ? o.getInteger('minutes') * 60
      : base.durationSec,
    text: o.getString('nickname') ?? base.text ?? null,
  };
}

module.exports = {
  handleComponent,

  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('The Nest Shop')
    .addSubcommand(s =>
      s.setName('browse').setDescription('Look around and buy something'),
    )
    .addSubcommand(s =>
      s
        .setName('buy')
        .setDescription('Buy an item directly')
        .addStringOption(o => itemOption(o))
        .addUserOption(o =>
          o
            .setName('target')
            .setDescription('Who it’s for (items with an effect)'),
        ),
    )
    .addSubcommand(s =>
      effectOptions(
        s
          .setName('add')
          .setDescription('Add an item (admins)')
          .addStringOption(o =>
            o
              .setName('name')
              .setDescription('Name')
              .setRequired(true)
              .setMaxLength(60),
          )
          .addIntegerOption(o =>
            o
              .setName('price')
              .setDescription('Price in coins')
              .setRequired(true)
              .setMinValue(0),
          )
          .addStringOption(o =>
            o
              .setName('description')
              .setDescription('Short description')
              .setMaxLength(200),
          )
          .addStringOption(o =>
            o
              .setName('emoji')
              .setDescription('Emoji, e.g. 🎀')
              .setMaxLength(10),
          ),
      ),
    )
    .addSubcommand(s =>
      effectOptions(
        s
          .setName('edit')
          .setDescription('Change an item (admins)')
          .addStringOption(o => itemOption(o))
          .addStringOption(o =>
            o.setName('name').setDescription('New name').setMaxLength(60),
          )
          .addIntegerOption(o =>
            o.setName('price').setDescription('New price').setMinValue(0),
          )
          .addStringOption(o =>
            o
              .setName('description')
              .setDescription('New description')
              .setMaxLength(200),
          )
          .addStringOption(o =>
            o.setName('emoji').setDescription('New emoji').setMaxLength(10),
          ),
      ),
    )
    .addSubcommand(s =>
      s
        .setName('remove')
        .setDescription('Remove an item (admins)')
        .addStringOption(o => itemOption(o)),
    ),

  async autocomplete(interaction) {
    const q = String(interaction.options.getFocused() || '').toLowerCase();
    return interaction.respond(
      shop
        .getItems(interaction.guildId)
        .filter(i => !q || i.name.toLowerCase().includes(q))
        .slice(0, 25)
        .map(i => ({
          name: `${i.emoji} ${i.name} · ${i.price} coins`.slice(0, 100),
          value: String(i.id),
        })),
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const o = interaction.options;

    if (sub === 'browse')
      return interaction.reply({
        ...browseView(guildId),
        allowedMentions: { parse: [] },
      });
    if (sub === 'buy')
      return purchase(interaction, o.getString('item'), o.getUser('target'), {
        viaButton: false,
      });

    if (!isAdmin(interaction)) return denyNonAdmin(interaction);

    if (sub === 'add') {
      const item = shop.addItem(guildId, {
        name: o.getString('name'),
        price: o.getInteger('price'),
        description: o.getString('description') || '',
        emoji: o.getString('emoji') || '🛍️',
        effect: effectFrom(o),
      });
      return interaction.reply(
        ui.ok(
          `Added **${item.emoji} ${item.name}** for ${item.price} coins.${item.effect ? `\n${describe(item.effect)}` : ''}`,
        ),
      );
    }
    if (sub === 'edit') {
      const current = shop.getItem(guildId, o.getString('item'));
      if (!current) return interaction.reply(ui.fail('Item not found.'));
      const item = shop.editItem(guildId, current.id, {
        name: o.getString('name') ?? undefined,
        price: o.getInteger('price') ?? undefined,
        description: o.getString('description') ?? undefined,
        emoji: o.getString('emoji') ?? undefined,
        effect:
          o.getString('effect') ||
          o.getInteger('minutes') ||
          o.getString('nickname')
            ? effectFrom(o, current.effect)
            : undefined,
      });
      return interaction.reply(
        ui.ok(
          `Updated **${item.emoji} ${item.name}** (${item.price} coins).${item.effect ? `\n${describe(item.effect)}` : ''}`,
        ),
      );
    }
    if (sub === 'remove') {
      const removed = shop.removeItem(guildId, o.getString('item'));
      return interaction.reply(
        removed
          ? ui.ok(`Removed **${removed.name}**.`)
          : ui.fail('Item not found.'),
      );
    }
  },
};
