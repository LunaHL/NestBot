// /coffee: the Nest Café. Only the Discord side lives here (options, replies,
// embeds). Menu and prices: src/config/coffeeMenu.js. Logic: src/services/coffee.js.
const path = require('path');
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require('discord.js');
const achievements = require('../services/achievements');
const nestcoins = require('../services/nestcoins');
const db = require('../utils/db');
const coffeeArt = require('../services/coffeeArt');
const coffee = require('../services/coffee');
const { isHalloween } = require('../utils/time');
const { DAILY_LIMIT, MENU, CUT_OFF_LINES } = require('../config/coffeeMenu');

const {
  pick,
  readStats,
  getCoffeeSummary,
  serve,
  serveLine,
  rollLatteArt,
  extrasText,
} = coffee;

function errorReply(error, interaction, price, drinkerName) {
  const balance = nestcoins.getBalance(
    interaction.guildId,
    interaction.user.id,
  );
  if (error === 'coins') {
    return {
      content: `💸 That costs **${price}** NestCoins, you have **${balance}**.`,
      flags: 64,
    };
  }
  if (drinkerName) {
    return {
      content: `⛔ ${drinkerName} already had ${DAILY_LIMIT} cups today. Maybe a glass of water instead?`,
      flags: 64,
    };
  }
  return {
    content: `⛔ ${pick(CUT_OFF_LINES).replace('{n}', DAILY_LIMIT)}`,
    flags: 64,
  };
}

/** Reply with the coffee embed plus its premade picture, if there is one. */
function replyWithPicture(interaction, payload, embed, drinkKey, art) {
  const file = coffeeArt.getPicture(drinkKey, art?.key);
  if (!file) return interaction.reply({ ...payload, embeds: [embed] });

  const name = `coffee${path.extname(file)}`;
  embed.setImage(`attachment://${name}`);
  return interaction.reply({
    ...payload,
    embeds: [embed],
    files: [new AttachmentBuilder(file, { name })],
  });
}

const drinkChoices = Object.entries(MENU).map(([value, d]) => ({
  name: `${d.name} (${d.price} coins)${d.halloween ? ' 🎃 Halloween only' : ''}`,
  value,
}));

// ---------- Command ----------

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coffee')
    .setDescription('The Nest Café ☕')
    .addSubcommand(sub =>
      sub.setName('menu').setDescription('Show the café menu'),
    )
    .addSubcommand(sub =>
      sub
        .setName('order')
        .setDescription('Order a coffee for yourself')
        .addStringOption(opt =>
          opt
            .setName('drink')
            .setDescription('What would you like?')
            .setRequired(true)
            .addChoices(...drinkChoices),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('gift')
        .setDescription('Buy someone a coffee')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Who gets the coffee')
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('drink')
            .setDescription('Which drink')
            .setRequired(true)
            .addChoices(...drinkChoices),
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
        .setDescription('Coffee stats')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Whose stats (default: you)'),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('leaderboard').setDescription('Biggest coffee drinkers'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const myName = interaction.member?.displayName || interaction.user.username;

    // ---------- menu ----------
    if (sub === 'menu') {
      const lines = Object.values(MENU)
        .filter(d => !d.halloween || isHalloween())
        .map(
          d =>
            `${d.emoji} **${d.name}** — ${d.price} coins${d.halloween ? ' 🎃 *today only*' : ''}`,
        );
      const embed = new EmbedBuilder()
        .setTitle('☕ The Nest Café')
        .setDescription(
          `${lines.join('\n')}\n\n` +
            `Order with \`/coffee order\`, treat a friend with \`/coffee gift\`.\n` +
            `Limit: ${DAILY_LIMIT} cups per person per day.`,
        )
        .setColor(0x6f4e37);
      return interaction.reply({ embeds: [embed] });
    }

    // ---------- order ----------
    if (sub === 'order') {
      const key = interaction.options.getString('drink');
      if (MENU[key].halloween && !isHalloween()) {
        return interaction.reply({
          content: `🎃 The ${MENU[key].name} is only served on Halloween (October 31).`,
          flags: 64,
        });
      }
      const drink = MENU[key];
      const result = serve(guildId, userId, userId, key);
      if (result.error)
        return interaction.reply(
          errorReply(result.error, interaction, drink.price),
        );

      const art = rollLatteArt(drink);
      const embed = new EmbedBuilder()
        .setTitle(`${drink.emoji} ${drink.name} for ${myName}`)
        .setDescription(
          `${serveLine(drink)}\n\n${extrasText(result.stats, result.lucky, art)}`.trim(),
        )
        .setFooter({
          text: `Cup #${result.stats.todayCups} today · ${result.stats.total} all time`,
        })
        .setColor(0x6f4e37);
      await replyWithPicture(interaction, {}, embed, key, art);
      return achievements.announce(interaction, [userId]);
    }

    // ---------- gift ----------
    if (sub === 'gift') {
      const target = interaction.options.getUser('user');
      const targetName =
        interaction.options.getMember('user')?.displayName || target.username;
      const key = interaction.options.getString('drink');
      if (MENU[key].halloween && !isHalloween()) {
        return interaction.reply({
          content: `🎃 The ${MENU[key].name} is only served on Halloween (October 31).`,
          flags: 64,
        });
      }
      const drink = MENU[key];
      const note = interaction.options.getString('note');

      if (target.id === userId) {
        return interaction.reply({
          content: 'Buying yourself a gift? Just use `/coffee order`.',
          flags: 64,
        });
      }
      if (target.bot) {
        return interaction.reply({
          content: 'Sweet, but bots run on electricity. ⚡',
          flags: 64,
        });
      }

      const result = serve(guildId, userId, target.id, key);
      if (result.error)
        return interaction.reply(
          errorReply(result.error, interaction, drink.price, targetName),
        );

      const art = rollLatteArt(drink);
      const embed = new EmbedBuilder()
        .setTitle(`${drink.emoji} A ${drink.name} for ${targetName}!`)
        .setDescription(
          `**${myName}** bought you a coffee.\n` +
            (note ? `> 📝 ${note}\n` : '') +
            `\n${serveLine(drink)}\n\n${extrasText(result.stats, result.lucky, art)}`.trimEnd(),
        )
        .setColor(0xc69c6d);
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
      const s = getCoffeeSummary(guildId, user.id);
      const raw = readStats(guildId, user.id);

      if (!s) {
        return interaction.reply({
          content: `☕ ${name} hasn't had a coffee in the Nest yet.`,
          flags: 64,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`☕ Coffee stats for ${name}`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          {
            name: 'Today',
            value: `**${s.today}** / ${DAILY_LIMIT} cups`,
            inline: true,
          },
          { name: 'All time', value: `**${s.total}** cups`, inline: true },
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
            value: `${raw.given} / ${raw.received}`,
            inline: true,
          },
          { name: '💸 Coins spent', value: `${raw.spent}`, inline: true },
        )
        .setColor(0x6f4e37);
      return interaction.reply({ embeds: [embed] });
    }

    // ---------- leaderboard ----------
    if (sub === 'leaderboard') {
      const all = Object.entries(db.read(d => d.coffee?.[guildId]) || {})
        .filter(([, s]) => s.total > 0)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10);

      if (!all.length)
        return interaction.reply({
          content: '☕ Nobody has ordered a coffee yet.',
          flags: 64,
        });

      const medals = ['🥇', '🥈', '🥉'];
      const lines = all.map(
        ([uid, s], i) =>
          `${medals[i] || `**${i + 1}.**`} <@${uid}> — **${s.total}** cup${s.total === 1 ? '' : 's'}` +
          (s.given ? ` · 🎁 ${s.given} gifted` : ''),
      );
      const embed = new EmbedBuilder()
        .setTitle('☕ Biggest Coffee Drinkers')
        .setDescription(lines.join('\n'))
        .setColor(0x6f4e37);
      return interaction.reply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    }
  },
};
