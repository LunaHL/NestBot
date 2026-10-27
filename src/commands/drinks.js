// /drinks: the Nest Café & Bar. Only the Discord side lives here (options,
// replies, embeds). Menu and prices: src/config/drinksMenu.js.
// Logic and limits: src/services/drinks.js.
const path = require('path');
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require('discord.js');
const achievements = require('../services/achievements');
const nestcoins = require('../services/nestcoins');
const db = require('../utils/db');
const drinkArt = require('../services/drinkArt');
const drinks = require('../services/drinks');
const { isHalloween } = require('../utils/time');
const {
  CAFFEINE_LIMIT,
  ALCOHOL_LIMIT,
  TOTAL_LIMIT,
  CATEGORIES,
  MENU,
  CUT_OFF_LINES,
  BAR_CLOSED_LINES,
  FULL_LINES,
} = require('../config/drinksMenu');

const COLOR_CAFE = 0x6f4e37;
const COLOR_BAR = 0x8e44ad;
const colorFor = drink =>
  CATEGORIES[drink.category]?.place === 'bar' ? COLOR_BAR : COLOR_CAFE;

// ---------- Replies ----------

/** Checks the chosen drink. Returns an error reply, or null if it's fine. */
function checkDrink(key) {
  const drink = MENU[key];
  if (!drink) {
    return {
      content:
        '❓ I don’t know that drink. Pick one from the list while typing, or see `/drinks menu`.',
      flags: 64,
    };
  }
  if (drink.halloween && !isHalloween()) {
    return {
      content: `🎃 The ${drink.name} is only served on Halloween (October 31).`,
      flags: 64,
    };
  }
  return null;
}

function errorReply(result, interaction, drink, drinkerName) {
  const n = result.count;
  if (result.error === 'coins') {
    const balance = nestcoins.getBalance(
      interaction.guildId,
      interaction.user.id,
    );
    return {
      content: `💸 That costs **${drink.price}** NestCoins, you have **${balance}**.`,
      flags: 64,
    };
  }
  // Gifts: tell the buyer about the other person's limit
  if (drinkerName) {
    const why = {
      caffeine: `already had ${CAFFEINE_LIMIT} caffeinated drinks today. Maybe a herbal tea or hot chocolate instead?`,
      alcohol: `already had ${ALCOHOL_LIMIT} alcoholic drinks today. Maybe the alcohol-free Nest Sunrise?`,
      full: `already had ${TOTAL_LIMIT} drinks today. They're full!`,
    }[result.error];
    return { content: `⛔ ${drinkerName} ${why}`, flags: 64 };
  }
  const lines = {
    caffeine: CUT_OFF_LINES,
    alcohol: BAR_CLOSED_LINES,
    full: FULL_LINES,
  }[result.error];
  return {
    content: `⛔ ${drinks.pick(lines).replace('{n}', n)}`,
    flags: 64,
  };
}

/** Reply with the drink embed plus its premade picture, if there is one. */
function replyWithPicture(interaction, payload, embed, drinkKey, art) {
  const file = drinkArt.getPicture(drinkKey, art?.key);
  if (!file) return interaction.reply({ ...payload, embeds: [embed] });

  const name = `drink${path.extname(file)}`;
  embed.setImage(`attachment://${name}`);
  return interaction.reply({
    ...payload,
    embeds: [embed],
    files: [new AttachmentBuilder(file, { name })],
  });
}

function menuEmbed(categoryFilter, guildId) {
  const free = nestcoins.isFreeMode(guildId);
  const embed = new EmbedBuilder()
    .setTitle('🍹 The Nest Café & Bar')
    .setColor(COLOR_CAFE);

  for (const [catKey, cat] of Object.entries(CATEGORIES)) {
    if (categoryFilter && catKey !== categoryFilter) continue;
    const list = drinks
      .availableDrinks()
      .filter(([, d]) => d.category === catKey);
    if (!list.length) continue;
    embed.addFields({
      name: `${cat.emoji} ${cat.name}`,
      value: list
        .map(
          ([, d]) =>
            `${d.emoji} **${d.name}** — ${free ? `~~${d.price}~~ free` : d.price}`,
        )
        .join('\n'),
      inline: !categoryFilter,
    });
  }

  if (categoryFilter && !embed.data.fields?.length) {
    embed.setDescription(
      'Nothing on the menu here today. 🎃 These are only served on Halloween.',
    );
  }
  embed.addFields({
    name: '​',
    value:
      (free
        ? '🎉 **Everything is free right now!** '
        : 'Prices in NestCoins. ') +
      'Order with `/drinks order`, treat a friend with `/drinks gift`.\n' +
      `Per day: max ${CAFFEINE_LIMIT} with caffeine, ${ALCOHOL_LIMIT} with alcohol, ${TOTAL_LIMIT} in total.`,
  });
  return embed;
}

const drinkOption = (opt, description) =>
  opt
    .setName('drink')
    .setDescription(description)
    .setRequired(true)
    .setAutocomplete(true);

// ---------- Command ----------

module.exports = {
  data: new SlashCommandBuilder()
    .setName('drinks')
    .setDescription('The Nest Café & Bar 🍹')
    .addSubcommand(sub =>
      sub
        .setName('menu')
        .setDescription('Show the menu')
        .addStringOption(opt =>
          opt
            .setName('category')
            .setDescription('Only one category')
            .addChoices(
              ...Object.entries(CATEGORIES).map(([value, c]) => ({
                name: `${c.emoji} ${c.name}`,
                value,
              })),
            ),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('order')
        .setDescription('Order a drink for yourself')
        .addStringOption(opt =>
          drinkOption(opt, 'What would you like? (start typing to search)'),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('gift')
        .setDescription('Buy someone a drink')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Who gets the drink')
            .setRequired(true),
        )
        .addStringOption(opt =>
          drinkOption(opt, 'Which drink (start typing to search)'),
        )
        .addStringOption(opt =>
          opt
            .setName('note')
            .setDescription('A little note on the cup')
            .setMaxLength(150),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('stats')
        .setDescription('Drink stats')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Whose stats (default: you)'),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('leaderboard').setDescription('Most drinks had'),
    ),

  // Suggestions while typing the drink name
  async autocomplete(interaction) {
    await interaction.respond(
      drinks.searchDrinks(
        interaction.options.getFocused(),
        interaction.guildId,
      ),
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const myName = interaction.member?.displayName || interaction.user.username;

    // ---------- menu ----------
    if (sub === 'menu') {
      const category = interaction.options.getString('category');
      return interaction.reply({ embeds: [menuEmbed(category, guildId)] });
    }

    // ---------- order ----------
    if (sub === 'order') {
      const key = interaction.options.getString('drink');
      const problem = checkDrink(key);
      if (problem) return interaction.reply(problem);
      const drink = MENU[key];

      const result = drinks.serve(guildId, userId, userId, key);
      if (result.error)
        return interaction.reply(errorReply(result, interaction, drink));

      const art = drinks.rollLatteArt(drink);
      const embed = new EmbedBuilder()
        .setTitle(`${drink.emoji} ${drink.name} for ${myName}`)
        .setDescription(
          `${drinks.serveLine(drink)}\n\n${drinks.extrasText(result.stats, result.lucky, art, drink)}`.trim(),
        )
        .setFooter({
          text: `Drink #${result.stats.todayCups} today · ${result.stats.total} all time`,
        })
        .setColor(colorFor(drink));
      await replyWithPicture(interaction, {}, embed, key, art);
      return achievements.announce(interaction, [userId]);
    }

    // ---------- gift ----------
    if (sub === 'gift') {
      const target = interaction.options.getUser('user');
      const targetName =
        interaction.options.getMember('user')?.displayName || target.username;
      const key = interaction.options.getString('drink');
      const note = interaction.options.getString('note');

      const problem = checkDrink(key);
      if (problem) return interaction.reply(problem);
      const drink = MENU[key];

      if (target.id === userId) {
        return interaction.reply({
          content: 'Buying yourself a gift? Just use `/drinks order`.',
          flags: 64,
        });
      }
      if (target.bot) {
        return interaction.reply({
          content: 'Sweet, but bots run on electricity. ⚡',
          flags: 64,
        });
      }

      const result = drinks.serve(guildId, userId, target.id, key);
      if (result.error) {
        return interaction.reply(
          errorReply(result, interaction, drink, targetName),
        );
      }

      const art = drinks.rollLatteArt(drink);
      const embed = new EmbedBuilder()
        .setTitle(`${drink.emoji} A ${drink.name} for ${targetName}!`)
        .setDescription(
          `**${myName}** bought you a drink.\n` +
            (note ? `> 📝 ${note}\n` : '') +
            `\n${drinks.serveLine(drink)}\n\n${drinks.extrasText(result.stats, result.lucky, art, drink)}`.trimEnd(),
        )
        .setColor(colorFor(drink));
      await replyWithPicture(
        interaction,
        { content: `${target}`, allowedMentions: { users: [target.id] } },
        embed,
        key,
        art,
      );
      return achievements.announce(interaction, [userId, target.id]);
    }

    // ---------- stats ----------
    if (sub === 'stats') {
      const user = interaction.options.getUser('user') || interaction.user;
      const name =
        interaction.options.getMember('user')?.displayName ||
        (user.id === userId ? myName : user.username);
      const s = drinks.getDrinksSummary(guildId, user.id);

      if (!s || !s.total) {
        return interaction.reply({
          content: `🍹 ${name} hasn't had a drink in the Nest yet.`,
          flags: 64,
        });
      }

      const perCategory = Object.entries(CATEGORIES)
        .filter(([k]) => s.byCategory[k])
        .map(([k, c]) => `${c.emoji} ${s.byCategory[k]}`)
        .join(' · ');

      const embed = new EmbedBuilder()
        .setTitle(`🍹 Drink stats for ${name}`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          {
            name: 'Today',
            value:
              `**${s.today}** / ${TOTAL_LIMIT} drinks\n` +
              `⚡ ${s.todayCaffeine} / ${CAFFEINE_LIMIT} caffeine\n` +
              `🍺 ${s.todayAlcohol} / ${ALCOHOL_LIMIT} alcohol`,
            inline: true,
          },
          {
            name: 'All time',
            value: `**${s.total}** drinks\n${perCategory || '–'}`,
            inline: true,
          },
          {
            name: '🔥 Streak',
            value: `**${s.streak}** days (best ${s.bestStreak})`,
            inline: true,
          },
          {
            name: '❤️ Favorite',
            value: s.favorite
              ? `${s.favorite.emoji} ${s.favorite.name} (${s.favorite.count}×)`
              : '–',
            inline: true,
          },
          {
            name: '🎁 Gifted / received',
            value: `${s.given} / ${s.received}`,
            inline: true,
          },
          { name: '💸 Coins spent', value: `${s.spent}`, inline: true },
        )
        .setColor(COLOR_CAFE);
      return interaction.reply({ embeds: [embed] });
    }

    // ---------- leaderboard ----------
    if (sub === 'leaderboard') {
      const all = Object.entries(db.read(d => d.coffee?.[guildId]) || {})
        .filter(([, s]) => s.total > 0)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10);

      if (!all.length) {
        return interaction.reply({
          content: '🍹 Nobody has ordered a drink yet.',
          flags: 64,
        });
      }

      const medals = ['🥇', '🥈', '🥉'];
      const lines = all.map(
        ([uid, s], i) =>
          `${medals[i] || `**${i + 1}.**`} <@${uid}> — **${s.total}** drink${s.total === 1 ? '' : 's'}` +
          (s.given ? ` · 🎁 ${s.given} gifted` : ''),
      );
      const embed = new EmbedBuilder()
        .setTitle('🍹 Most Drinks Had')
        .setDescription(lines.join('\n'))
        .setColor(COLOR_CAFE);
      return interaction.reply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    }
  },
};
