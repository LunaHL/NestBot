const path = require('path');
const achievements = require('../services/achievements');
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const nestcoins = require('../services/nestcoins');
const db = require('../utils/db');
const coffeeArt = require('../services/coffeeArt');
const { isHalloween } = require('../utils/time');

const TZ = process.env.TIMEZONE || 'Europe/Berlin';
const DAILY_LIMIT = 6; // cups per person per day before NestBot cuts you off
const JITTERY_AT = 4; // from this many cups on, NestBot starts commenting
const LUCKY_BEAN_CHANCE = 0.05; // drink is free
const LATTE_ART_CHANCE = 0.35; // only for drinks with art: true

// ☕ The menu. Add, remove or reprice drinks here.
const MENU = {
  espresso: {
    name: 'Espresso', emoji: '☕', price: 3,
    art: false,
    imagePrompt: 'a small white espresso cup with dark crema-topped espresso on a saucer',
    lines: [
      'Short, strong, no nonsense. Like me.',
      'One espresso. Drink it before it judges you.',
      'Tiny cup, big decisions ahead.',
    ],
  },
  americano: {
    name: 'Americano', emoji: '☕', price: 3,
    art: false,
    imagePrompt: 'a ceramic mug of black americano coffee',
    lines: [
      'Espresso, but make it last longer.',
      'Hot water and ambition. Enjoy.',
    ],
  },
  cappuccino: {
    name: 'Cappuccino', emoji: '☕', price: 5,
    art: true,
    imagePrompt: 'a wide ceramic cappuccino cup with thick milk foam on a saucer',
    lines: [
      'Extra foam, because you deserve fluff today.',
      'Careful, foam mustache incoming.',
    ],
  },
  latte: {
    name: 'Latte', emoji: '🥛', price: 5,
    art: true,
    imagePrompt: 'a tall latte glass with creamy milk foam',
    lines: [
      'Milky, warm, and mildly comforting. Like a blanket in a cup.',
      'One latte, steamed to perfection. Mostly.',
    ],
  },
  flatwhite: {
    name: 'Flat White', emoji: '☕', price: 5,
    art: true,
    imagePrompt: 'a small ceramic cup of flat white coffee with silky microfoam',
    lines: [
      'For when a latte is too much commitment.',
      'Velvety. Smooth. Pretentious. Perfect.',
    ],
  },
  mocha: {
    name: 'Mocha', emoji: '🍫', price: 6,
    art: true,
    imagePrompt: 'a mug of chocolate mocha coffee with a little chocolate drizzle on the rim',
    lines: [
      "Coffee and chocolate. Let's not pretend this is about the coffee.",
      'Dessert disguised as a drink. I won’t tell.',
    ],
  },
  caramel: {
    name: 'Caramel Macchiato', emoji: '🍯', price: 6,
    art: true,
    imagePrompt: 'a glass cup of caramel macchiato with caramel drizzle on the rim',
    lines: [
      'Drizzled with caramel. Sticky fingers are your problem.',
      'Sweet enough to fix at least one bad mood.',
    ],
  },
  iced: {
    name: 'Iced Coffee', emoji: '🧊', price: 5,
    art: false,
    imagePrompt: 'a tall glass of iced coffee with ice cubes and a straw',
    lines: [
      'Cold brew for hot heads.',
      'Ice ice coffee.',
    ],
  },
  pumpkin: {
    name: 'Pumpkin Spice Latte', emoji: '🎃', price: 7,
    art: true,
    imagePrompt: 'a mug of pumpkin spice latte with a cinnamon stick, small autumn leaves around it',
    lines: [
      'It is always pumpkin season in the Nest.',
      'Cinnamon, nutmeg and a little bit of autumn magic.',
    ],
  },
  special: {
    name: 'Nest Special', emoji: '🪺', price: 10,
    art: true,
    imagePrompt: 'a fancy, slightly magical-looking cup of coffee with a tiny bird nest decoration on the saucer',
    lines: [
      'Secret ingredient today: {secret}. Don’t ask.',
      'House recipe with a dash of {secret}. Trust me.',
    ],
  },
  decaf: {
    name: 'Decaf', emoji: '😐', price: 1,
    art: false,
    imagePrompt: 'a plain, slightly sad-looking mug of decaf coffee',
    lines: [
      '…Decaf? In this economy? Fine.',
      'Here. It’s basically warm bean water. Enjoy, I guess.',
    ],
  },

  // 🎃 Halloween only (October 31)
  witchbrew: {
    name: "Witch's Brew", emoji: '🧪', price: 8,
    halloween: true,
    art: false,
    imagePrompt: 'a bubbling dark purple-green coffee drink in a small witch cauldron mug with glowing swirls and tiny bats',
    lines: [
      'Eye of newt, double shot, extra foam. Don’t ask what’s bubbling.',
      'Brewed at midnight under a full moon. Or in the microwave. Same thing.',
    ],
  },
  vampire: {
    name: 'Vampire Latte', emoji: '🩸', price: 8,
    halloween: true,
    art: true,
    imagePrompt: 'a gothic black latte cup with blood-red raspberry syrup dripping down the side, on a dark lace doily',
    lines: [
      'Raspberry syrup. It’s raspberry. Definitely raspberry.',
      'Best enjoyed after sunset. Garlic not included.',
    ],
  },
};

const SECRETS = ['cardamom', 'a pinch of sea salt', 'vanilla', 'honey', 'lavender',
  'cinnamon', 'orange zest', 'a marshmallow', 'stardust', 'pure chaos'];
// Latte art designs. `key` is used in picture file names (e.g. latte-cat.png).
const LATTE_ART = [
  { key: 'heart', text: 'a heart 🤍', imagePrompt: 'a classic heart' },
  { key: 'bird', text: 'a little bird 🐦', imagePrompt: 'a cute little bird' },
  { key: 'nest', text: 'a nest 🪺', imagePrompt: 'a small bird nest with eggs' },
  { key: 'cat', text: 'a cat 🐱', imagePrompt: 'a cute cat face' },
  { key: 'leaf', text: 'a leaf 🍃', imagePrompt: 'a rosetta leaf (fern pattern)' },
  { key: 'star', text: 'a star ⭐', imagePrompt: 'a star' },
  { key: 'swan', text: 'a very confused swan 🦢', imagePrompt: 'a swan with a funny, confused expression' },
  { key: 'moon', text: 'a tiny moon 🌙', imagePrompt: 'a crescent moon with tiny stars' },
];
const JITTERY_LINES = [
  'Your hands are shaking a little. Just saying.',
  'This is cup number {n}. I’m starting to worry.',
  'You are vibrating at a frequency only dogs can hear.',
];
const CUT_OFF_LINES = [
  "No. {n} cups is enough. I'm cutting you off until tomorrow. Drink some water.",
  "The café is closed. For you. Specifically. Come back tomorrow.",
];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function localDate(offsetDays = 0) {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Data helpers ----------

function emptyStats() {
  return {
    total: 0, // cups drunk (ordered + received)
    given: 0, // cups gifted to others
    received: 0,
    spent: 0,
    drinks: {}, // drinkKey -> count
    todayDate: null,
    todayCups: 0,
    streak: 0,
    bestStreak: 0,
    lastDate: null,
  };
}

function readStats(guildId, userId) {
  return db.read(d => d.coffee?.[guildId]?.[userId]) || null;
}

function cupsToday(stats) {
  return stats && stats.todayDate === localDate(0) ? stats.todayCups : 0;
}

// Record one cup for a drinker (inside a db.perform)
function addCup(data, guildId, userId, drinkKey) {
  data.coffee ||= {};
  data.coffee[guildId] ||= {};
  const s = (data.coffee[guildId][userId] ||= emptyStats());
  const today = localDate(0);

  if (s.todayDate !== today) {
    s.todayDate = today;
    s.todayCups = 0;
  }
  s.todayCups++;
  s.total++;
  s.drinks[drinkKey] = (s.drinks[drinkKey] || 0) + 1;

  // Streak = days in a row with at least one coffee
  if (s.lastDate !== today) {
    s.streak = s.lastDate === localDate(-1) ? s.streak + 1 : 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.lastDate = today;
  }
  return s;
}

function favoriteDrink(stats) {
  const entries = Object.entries(stats?.drinks || {});
  if (!entries.length) return null;
  const [key, count] = entries.sort((a, b) => b[1] - a[1])[0];
  return MENU[key] ? { ...MENU[key], count } : null;
}

/** Summary for /profile and the AI chat. */
function getCoffeeSummary(guildId, userId) {
  const s = readStats(guildId, userId);
  if (!s) return null;
  const live = s.lastDate === localDate(0) || s.lastDate === localDate(-1);
  return {
    total: s.total,
    today: cupsToday(s),
    streak: live ? s.streak : 0,
    bestStreak: s.bestStreak,
    favorite: favoriteDrink(s),
    given: s.given,
  };
}

// Charge, serve and record. Returns { error } or { stats, lucky }.
function serve(guildId, buyerId, drinkerId, drinkKey) {
  const drink = MENU[drinkKey];

  const drinkerStats = readStats(guildId, drinkerId);
  if (cupsToday(drinkerStats) >= DAILY_LIMIT) return { error: 'limit' };

  const lucky = Math.random() < LUCKY_BEAN_CHANCE;
  if (!lucky && nestcoins.removeCoins(guildId, buyerId, drink.price) === null) {
    return { error: 'coins' };
  }

  let stats;
  db.perform(data => {
    stats = addCup(data, guildId, drinkerId, drinkKey);
    const buyer = (data.coffee[guildId][buyerId] ||= emptyStats());
    if (!lucky) buyer.spent += drink.price;
    if (buyerId !== drinkerId) {
      buyer.given++;
      stats.received++;
    }
  });
  return { stats, lucky };
}

function serveLine(drink) {
  return pick(drink.lines).replace('{secret}', pick(SECRETS));
}

function rollLatteArt(drink) {
  return drink.art && Math.random() < LATTE_ART_CHANCE ? pick(LATTE_ART) : null;
}

function extrasText(stats, lucky, art) {
  const extras = [];
  if (art) extras.push(`🎨 Latte art: ${art.text}`);
  if (lucky) extras.push('🍀 **Lucky bean!** This one is on the house.');
  if (stats.streak > 1) extras.push(`🔥 Coffee streak: **${stats.streak}** days`);
  if (stats.todayCups >= JITTERY_AT) {
    extras.push(`⚡ ${pick(JITTERY_LINES).replace('{n}', stats.todayCups)}`);
  }
  return extras.join('\n');
}

function errorReply(error, interaction, price, drinkerName) {
  const balance = nestcoins.getBalance(interaction.guildId, interaction.user.id);
  if (error === 'coins') {
    return { content: `💸 That costs **${price}** NestCoins, you have **${balance}**.`, flags: 64 };
  }
  if (drinkerName) {
    return { content: `⛔ ${drinkerName} already had ${DAILY_LIMIT} cups today. Maybe a glass of water instead?`, flags: 64 };
  }
  return { content: `⛔ ${pick(CUT_OFF_LINES).replace('{n}', DAILY_LIMIT)}`, flags: 64 };
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
  getCoffeeSummary,
  MENU,
  LATTE_ART,

  data: new SlashCommandBuilder()
    .setName('coffee')
    .setDescription('The Nest Café ☕')
    .addSubcommand(sub => sub.setName('menu').setDescription('Show the café menu'))
    .addSubcommand(sub =>
      sub
        .setName('order')
        .setDescription('Order a coffee for yourself')
        .addStringOption(opt =>
          opt.setName('drink').setDescription('What would you like?').setRequired(true).addChoices(...drinkChoices),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('gift')
        .setDescription('Buy someone a coffee')
        .addUserOption(opt => opt.setName('user').setDescription('Who gets the coffee').setRequired(true))
        .addStringOption(opt =>
          opt.setName('drink').setDescription('Which drink').setRequired(true).addChoices(...drinkChoices),
        )
        .addStringOption(opt =>
          opt.setName('note').setDescription('A little note on the cup').setMaxLength(150),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('stats')
        .setDescription('Coffee stats')
        .addUserOption(opt => opt.setName('user').setDescription('Whose stats (default: you)')),
    )
    .addSubcommand(sub => sub.setName('leaderboard').setDescription('Biggest coffee drinkers')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const myName = interaction.member?.displayName || interaction.user.username;

    // ---------- menu ----------
    if (sub === 'menu') {
      const lines = Object.values(MENU)
        .filter(d => !d.halloween || isHalloween())
        .map(d => `${d.emoji} **${d.name}** — ${d.price} coins${d.halloween ? ' 🎃 *today only*' : ''}`);
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
        return interaction.reply({ content: `🎃 The ${MENU[key].name} is only served on Halloween (October 31).`, flags: 64 });
      }
      const drink = MENU[key];
      const result = serve(guildId, userId, userId, key);
      if (result.error) return interaction.reply(errorReply(result.error, interaction, drink.price));

      const art = rollLatteArt(drink);
      const embed = new EmbedBuilder()
        .setTitle(`${drink.emoji} ${drink.name} for ${myName}`)
        .setDescription(`${serveLine(drink)}\n\n${extrasText(result.stats, result.lucky, art)}`.trim())
        .setFooter({ text: `Cup #${result.stats.todayCups} today · ${result.stats.total} all time` })
        .setColor(0x6f4e37);
      await replyWithPicture(interaction, {}, embed, key, art);
      return achievements.announce(interaction, [userId]);
    }

    // ---------- gift ----------
    if (sub === 'gift') {
      const target = interaction.options.getUser('user');
      const targetName = interaction.options.getMember('user')?.displayName || target.username;
      const key = interaction.options.getString('drink');
      if (MENU[key].halloween && !isHalloween()) {
        return interaction.reply({ content: `🎃 The ${MENU[key].name} is only served on Halloween (October 31).`, flags: 64 });
      }
      const drink = MENU[key];
      const note = interaction.options.getString('note');

      if (target.id === userId) {
        return interaction.reply({ content: 'Buying yourself a gift? Just use `/coffee order`.', flags: 64 });
      }
      if (target.bot) {
        return interaction.reply({ content: 'Sweet, but bots run on electricity. ⚡', flags: 64 });
      }

      const result = serve(guildId, userId, target.id, key);
      if (result.error) return interaction.reply(errorReply(result.error, interaction, drink.price, targetName));

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
      const name = interaction.options.getMember('user')?.displayName || (user.id === userId ? myName : user.username);
      const s = getCoffeeSummary(guildId, user.id);
      const raw = readStats(guildId, user.id);

      if (!s) {
        return interaction.reply({ content: `☕ ${name} hasn't had a coffee in the Nest yet.`, flags: 64 });
      }

      const embed = new EmbedBuilder()
        .setTitle(`☕ Coffee stats for ${name}`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: 'Today', value: `**${s.today}** / ${DAILY_LIMIT} cups`, inline: true },
          { name: 'All time', value: `**${s.total}** cups`, inline: true },
          { name: '🔥 Streak', value: `**${s.streak}** days (best ${s.bestStreak})`, inline: true },
          { name: '❤️ Favorite', value: s.favorite ? `${s.favorite.emoji} ${s.favorite.name} (${s.favorite.count}×)` : '–', inline: true },
          { name: '🎁 Gifted / received', value: `${raw.given} / ${raw.received}`, inline: true },
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

      if (!all.length) return interaction.reply({ content: '☕ Nobody has ordered a coffee yet.', flags: 64 });

      const medals = ['🥇', '🥈', '🥉'];
      const lines = all.map(
        ([uid, s], i) => `${medals[i] || `**${i + 1}.**`} <@${uid}> — **${s.total}** cup${s.total === 1 ? '' : 's'}` +
          (s.given ? ` · 🎁 ${s.given} gifted` : ''),
      );
      const embed = new EmbedBuilder()
        .setTitle('☕ Biggest Coffee Drinkers')
        .setDescription(lines.join('\n'))
        .setColor(0x6f4e37);
      return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  },
};
