// /shop: everything you can buy besides drinks. Items admins add (grouped in
// categories) plus NestBot's own specials: 🏷️ renaming someone and 🔓 buying
// your own name back. Logic: src/services/shop.js, src/services/nickname.js;
// effects (gag, nickname): src/services/effects.js.
// Menus, buttons and forms ("shop:…") keep working after restarts.
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const shop = require('../services/shop');
const nickname = require('../services/nickname');
const nestcoins = require('../services/nestcoins');
const achievements = require('../services/achievements');
const { EFFECT_CHOICES, describe } = require('../services/effects');
const { isAdmin, denyNonAdmin } = require('../utils/permissions');
const { discordTime } = require('../utils/time');
const ui = require('../utils/ui');

const DEFAULT_CATEGORY = '📦 Other';
const SPECIALS_CATEGORY = '🏷️ Nicknames';
const free = guildId => nestcoins.isFreeMode(guildId);
const price = (guildId, n) =>
  free(guildId) ? `~~${n}~~ **free**` : ui.coins(n);
const priceShort = (guildId, n) => (free(guildId) ? 'free' : `${n} coins`);
const categoryOf = item => item.category || DEFAULT_CATEGORY;

const NICK_PRICES = Object.entries(nickname.PRICES).map(([min, p]) => ({
  min: Number(min),
  price: p,
}));
const nickRange = () => `${NICK_PRICES[0].price}–${NICK_PRICES.at(-1).price}`;

/** NestBot's own items (not stored, shown while paid nicknames are on). */
function specials(guildId) {
  if (!nickname.enabled(guildId)) return [];
  return [
    {
      id: 'nick',
      emoji: '🏷️',
      name: 'Rename someone',
      category: SPECIALS_CATEGORY,
      priceText: free(guildId) ? '**free**' : `💰 **${nickRange()}**`,
      menuPrice: free(guildId) ? 'free' : `${nickRange()} coins`,
      description: `Give someone a nickname for ${ui.duration(NICK_PRICES[0].min * 60)} up to ${ui.duration(NICK_PRICES.at(-1).min * 60)}. More coins, more time.`,
    },
    {
      id: 'buyout',
      emoji: '🔓',
      name: 'Get your name back',
      category: SPECIALS_CATEGORY,
      priceText: 'what it cost',
      menuPrice: 'same price',
      description: 'Renamed? Buy yourself out early for the price it cost.',
    },
  ];
}

/** The shop card. `category` = only that category (null = all). */
function browseView(guildId, category = null) {
  const all = [
    ...shop
      .getItems(guildId)
      .map(i => ({
        ...i,
        category: categoryOf(i),
        priceText: price(guildId, i.price),
        menuPrice: priceShort(guildId, i.price),
      })),
    ...specials(guildId),
  ];
  const categories = [...new Set(all.map(i => i.category))];
  const shown = category ? all.filter(i => i.category === category) : all;

  const fields = (category ? [category] : categories).map(cat => ({
    name: cat,
    value:
      shown
        .filter(i => i.category === cat)
        .map(
          i =>
            `${i.emoji} **${i.name}** · ${i.priceText}\n${[i.description, i.effect && describe(i.effect)].filter(Boolean).join(' · ')}`,
        )
        .join('\n\n')
        .slice(0, 1024) || '–',
  }));
  const embed = ui.card({
    title: category ? `🛍️ The Nest Shop · ${category}` : '🛍️ The Nest Shop',
    color: ui.COLORS.shop,
    text: all.length
      ? free(guildId)
        ? '🎉 **Free mode:** everything costs nothing right now!'
        : null
      : 'The shop is empty right now. Admins add items with `/shop add`.',
    fields: all.length ? fields.slice(0, 25) : [],
    footer: 'Pick something below. Drinks: /drinks',
  });

  const rows = [];
  if (!category && categories.length > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('shop:cat')
          .setPlaceholder('📂 Only one category…')
          .addOptions(
            categories
              .slice(0, 25)
              .map(c => ({ label: c.slice(0, 100), value: c.slice(0, 100) })),
          ),
      ),
    );
  }
  if (shown.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('shop:pick')
          .setPlaceholder('🛒 Buy something…')
          .addOptions(
            shown.slice(0, 25).map(i => ({
              label: `${i.name} · ${i.menuPrice}`.slice(0, 100),
              value: String(i.id),
              emoji: i.emoji,
              description:
                (i.effect ? describe(i.effect) : i.description || '').slice(
                  0,
                  100,
                ) || undefined,
            })),
          ),
      ),
    );
  }
  return { embeds: [embed], components: rows, allowedMentions: { parse: [] } };
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

/** Buy a stored item and announce it in the channel. */
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

// ---------- Nicknames ----------

const NICK_ERRORS = {
  disabled: 'Paid nicknames are switched off on this server.',
  empty: 'That nickname is empty.',
  'not-found': 'That person isn’t on this server.',
  cannot: 'I can’t rename them (server owner, or their role is above mine).',
};

/** Can `targetId` be renamed right now? Returns an error text or null. */
async function nickProblem(interaction, targetId) {
  if (!nickname.enabled(interaction.guildId)) return NICK_ERRORS.disabled;
  const user = await interaction.client.users.fetch(targetId).catch(() => null);
  if (!user) return NICK_ERRORS['not-found'];
  if (user.bot) return 'Bots keep their names.';
  const active = nickname.getActive(interaction.guildId, targetId);
  if (active)
    return `<@${targetId}> is already called **${active.name}** until ${discordTime(active.until, 't')} (${discordTime(active.until, 'R')}).`;
  return null;
}

function timeMenu(guildId, targetId) {
  return {
    content: `🏷️ How long should <@${targetId}> keep the new name?`,
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`shop:nicktime:${targetId}`)
          .setPlaceholder('⏱️ Pick a time…')
          .addOptions(
            NICK_PRICES.map(d => ({
              label: `${ui.duration(d.min * 60)} · ${priceShort(guildId, d.price)}`,
              value: String(d.min),
            })),
          ),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

/** Pay and rename. Replies publicly with the result. */
async function rename(interaction, targetId, name, minutes) {
  const guildId = interaction.guildId;
  const me = interaction.user.id;
  const problem = await nickProblem(interaction, targetId);
  if (problem) return interaction.reply(ui.fail(problem));
  const cost = nickname.PRICES[minutes];
  if (!cost)
    return interaction.reply(ui.fail('Pick one of the times in the list.'));
  if (!nickname.clean(name))
    return interaction.reply(ui.fail(NICK_ERRORS.empty));

  const payment = nestcoins.pay(guildId, me, cost);
  if (!payment.ok)
    return interaction.reply(
      ui.fail(`That costs ${cost} coins, you have ${payment.balance}.`),
    );
  const r = await nickname.apply(
    interaction.guild,
    targetId,
    name,
    minutes,
    me,
    payment.paid,
  );
  if (r.error) {
    if (payment.paid) nestcoins.addCoins(guildId, me, payment.paid); // refund
    return interaction.reply(ui.fail(NICK_ERRORS[r.error]));
  }
  await interaction.reply({
    embeds: [
      ui.card({
        title: '🏷️ New name!',
        text: `<@${me}> renamed <@${targetId}> to **${r.name}** until ${discordTime(r.until, 't')} (${discordTime(r.until, 'R')}).`,
        color: ui.COLORS.nickname,
        footer: `${payment.paid ? `Paid ${payment.paid} coins` : 'Free'} · Get out early: /shop → 🔓 Get your name back`,
      }),
    ],
    allowedMentions: { users: [targetId] },
  });
  return achievements.announce(interaction, [me, targetId]);
}

async function buyout(interaction, { viaButton }) {
  const guildId = interaction.guildId;
  const me = interaction.user.id;
  const active = nickname.getActive(guildId, me);
  const done = msg =>
    viaButton
      ? interaction.update({ content: msg, components: [] })
      : interaction.reply({ content: msg, flags: 64 });
  if (!active) return done('🎉 You don’t have a paid nickname right now.');
  const payment = nestcoins.pay(guildId, me, active.price || 0);
  if (!payment.ok)
    return done(
      `❌ Buying out costs ${active.price} coins, you have ${payment.balance}.`,
    );
  await nickname.restore(interaction.guild, me);
  const card = {
    embeds: [
      ui.card({
        title: '🔓 Bought out!',
        text: `<@${me}> paid to get rid of **${active.name}**.`,
        color: ui.COLORS.nickname,
        footer: payment.paid ? `Paid ${payment.paid} coins` : 'Free',
      }),
    ],
    allowedMentions: { parse: [] },
  };
  if (viaButton) {
    await interaction.update({ content: '✅ Done!', components: [] });
    return interaction.followUp(card);
  }
  return interaction.reply(card);
}

// ---------- Menus, buttons, forms ----------

async function handleComponent(interaction) {
  const [, action, idText, extra] = interaction.customId.split(':');
  const guildId = interaction.guildId;

  if (action === 'cancel')
    return interaction.update({ content: '👍 Cancelled.', components: [] });

  if (action === 'cat')
    return interaction.reply({
      ...browseView(guildId, interaction.values[0]),
      flags: 64,
    });

  if (action === 'pick') {
    const value = interaction.values[0];
    if (value === 'nick') {
      if (!nickname.enabled(guildId))
        return interaction.reply(ui.fail(NICK_ERRORS.disabled));
      return interaction.reply({
        content: '🏷️ Who gets a new name?',
        components: [
          new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId('shop:nickuser')
              .setPlaceholder('👤 Pick someone…'),
          ),
        ],
        flags: 64,
      });
    }
    if (value === 'buyout') {
      const active = nickname.getActive(guildId, interaction.user.id);
      if (!active)
        return interaction.reply(
          ui.info('🎉 You don’t have a paid nickname right now.'),
        );
      return interaction.reply({
        content: `🔓 Get rid of **${active.name}** for ${price(guildId, active.price || 0)}? (It ends by itself ${discordTime(active.until, 'R')}.)`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('shop:buyout')
              .setLabel('Buy me out')
              .setEmoji('🔓')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('shop:cancel')
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
        flags: 64,
      });
    }
    const item = shop.getItem(guildId, value);
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
      extra === 'none'
        ? null
        : await interaction.client.users.fetch(extra).catch(() => null);
    return purchase(interaction, idText, target, { viaButton: true });
  }

  if (action === 'nickuser') {
    const targetId = interaction.values[0];
    const problem = await nickProblem(interaction, targetId);
    if (problem)
      return interaction.update({
        content: `❌ ${problem}`,
        components: [],
        allowedMentions: { parse: [] },
      });
    return interaction.update(timeMenu(guildId, targetId));
  }

  if (action === 'nicktime') {
    const minutes = interaction.values[0];
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`shop:nickname:${idText}:${minutes}`)
        .setTitle(`New name for ${ui.duration(minutes * 60)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel('The new nickname')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(nickname.MAX_LENGTH)
              .setRequired(true),
          ),
        ),
    );
  }

  if (action === 'nickname') {
    return rename(
      interaction,
      idText,
      interaction.fields.getTextInputValue('name'),
      Number(extra),
    );
  }

  if (action === 'buyout') return buyout(interaction, { viaButton: true });

  return interaction.reply(ui.fail('Unknown button.'));
}

// ---------- Slash command ----------

const itemOption = o =>
  o
    .setName('item')
    .setDescription('Which item (start typing)')
    .setRequired(true)
    .setAutocomplete(true);
const categoryOption = o =>
  o
    .setName('category')
    .setDescription('Category, e.g. "🎀 Cute" (start typing to reuse one)')
    .setMaxLength(40)
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

const itemText = item =>
  `**${item.emoji} ${item.name}** (${item.price} coins, ${categoryOf(item)})${item.effect ? `\n${describe(item.effect)}` : ''}`;

module.exports = {
  handleComponent,

  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription(
      'The Nest Shop: items, renaming someone, getting your name back',
    )
    .addSubcommand(s =>
      s
        .setName('browse')
        .setDescription('Look around and buy something')
        .addStringOption(o =>
          categoryOption(o).setDescription('Only one category'),
        ),
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
      s
        .setName('nickname')
        .setDescription('🏷️ Rename someone for a while. More coins = longer')
        .addUserOption(o =>
          o
            .setName('user')
            .setDescription('Who gets the nickname')
            .setRequired(true),
        )
        .addStringOption(o =>
          o
            .setName('name')
            .setDescription('The new nickname')
            .setRequired(true)
            .setMaxLength(nickname.MAX_LENGTH),
        )
        .addStringOption(o =>
          o
            .setName('time')
            .setDescription('How long (and what it costs)')
            .setRequired(true)
            .addChoices(
              ...NICK_PRICES.map(d => ({
                name: `${ui.duration(d.min * 60)} · ${d.price} coins`,
                value: String(d.min),
              })),
            ),
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
          )
          .addStringOption(o => categoryOption(o)),
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
          )
          .addStringOption(o => categoryOption(o)),
      ),
    )
    .addSubcommand(s =>
      s
        .setName('remove')
        .setDescription('Remove an item (admins)')
        .addStringOption(o => itemOption(o)),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const q = String(focused?.value || '').toLowerCase();
    const items = shop.getItems(interaction.guildId);
    if (focused?.name === 'category') {
      const cats = [
        ...new Set([
          ...items.map(categoryOf),
          ...specials(interaction.guildId).map(i => i.category),
        ]),
      ];
      const typed = String(focused.value || '').trim();
      const list = cats.filter(c => !q || c.toLowerCase().includes(q));
      if (typed && !cats.includes(typed)) list.unshift(typed); // a new category
      return interaction.respond(
        list
          .slice(0, 25)
          .map(c => ({ name: c.slice(0, 100), value: c.slice(0, 100) })),
      );
    }
    return interaction.respond(
      items
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
      return interaction.reply(browseView(guildId, o.getString('category')));
    if (sub === 'buy')
      return purchase(interaction, o.getString('item'), o.getUser('target'), {
        viaButton: false,
      });
    if (sub === 'nickname')
      return rename(
        interaction,
        o.getUser('user').id,
        o.getString('name'),
        Number(o.getString('time')),
      );

    if (!isAdmin(interaction)) return denyNonAdmin(interaction);

    if (sub === 'add') {
      const item = shop.addItem(guildId, {
        name: o.getString('name'),
        price: o.getInteger('price'),
        description: o.getString('description') || '',
        emoji: o.getString('emoji') || '🛍️',
        category: o.getString('category') || DEFAULT_CATEGORY,
        effect: effectFrom(o),
      });
      return interaction.reply(ui.ok(`Added ${itemText(item)}`));
    }
    if (sub === 'edit') {
      const current = shop.getItem(guildId, o.getString('item'));
      if (!current) return interaction.reply(ui.fail('Item not found.'));
      const item = shop.editItem(guildId, current.id, {
        name: o.getString('name') ?? undefined,
        price: o.getInteger('price') ?? undefined,
        description: o.getString('description') ?? undefined,
        emoji: o.getString('emoji') ?? undefined,
        category: o.getString('category') ?? undefined,
        effect:
          o.getString('effect') ||
          o.getInteger('minutes') ||
          o.getString('nickname')
            ? effectFrom(o, current.effect)
            : undefined,
      });
      return interaction.reply(ui.ok(`Updated ${itemText(item)}`));
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
