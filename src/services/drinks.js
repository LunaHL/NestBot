// The Café & Bar logic: serving drinks, daily limits, charging coins and
// keeping drink stats. The menu and all tunable numbers are in
// src/config/drinksMenu.js.
//
// Stats are stored under data.coffee in nestbot.json. That's the old name
// from when only coffee existed; it's kept so nobody loses their stats.
const db = require('../utils/db');
const nestcoins = require('./nestcoins');
const { localDate, isHalloween } = require('../utils/time');
const {
  CAFFEINE_LIMIT,
  JITTERY_AT,
  ALCOHOL_LIMIT,
  TIPSY_AT,
  TOTAL_LIMIT,
  LUCKY_CHANCE,
  LATTE_ART_CHANCE,
  CATEGORIES,
  MENU,
  SECRETS,
  LATTE_ART,
  JITTERY_LINES,
  TIPSY_LINES,
} = require('../config/drinksMenu');

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ---------- Menu helpers ----------

/** Drinks that can be ordered right now (Halloween ones only on Oct 31). */
function availableDrinks() {
  return Object.entries(MENU).filter(([, d]) => !d.halloween || isHalloween());
}

/** Drinks matching a search text, for the autocomplete while typing. */
function searchDrinks(query) {
  const q = String(query || '')
    .toLowerCase()
    .trim();
  return availableDrinks()
    .map(([key, d]) => {
      const cat = CATEGORIES[d.category];
      const text = `${d.name} ${key} ${cat?.name || ''}`.toLowerCase();
      let score = 0;
      if (!q) score = 1;
      else if (d.name.toLowerCase().startsWith(q)) score = 3;
      else if (text.includes(q)) score = 2;
      return { key, d, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)
    .map(({ key, d }) => ({
      name: `${d.emoji} ${d.name} (${d.price} coins)${d.halloween ? ' 🎃' : ''}`,
      value: key,
    }));
}

// ---------- Data helpers ----------

function emptyStats() {
  return {
    total: 0, // drinks had (ordered + received)
    given: 0, // drinks gifted to others
    received: 0,
    spent: 0,
    drinks: {}, // drinkKey -> count
    todayDate: null,
    todayCups: 0, // all drinks today
    todayCaffeine: 0,
    todayAlcohol: 0,
    streak: 0,
    bestStreak: 0,
    lastDate: null,
  };
}

function readStats(guildId, userId) {
  return db.read(d => d.coffee?.[guildId]?.[userId]) || null;
}

/** How many drinks someone had today: { total, caffeine, alcohol }. */
function todayCounts(stats) {
  if (!stats || stats.todayDate !== localDate(0)) {
    return { total: 0, caffeine: 0, alcohol: 0 };
  }
  return {
    total: stats.todayCups || 0,
    caffeine: stats.todayCaffeine ?? stats.todayCups ?? 0, // older stats: coffee only
    alcohol: stats.todayAlcohol || 0,
  };
}

// Record one drink for a drinker (inside a db.perform)
function addDrink(data, guildId, userId, drinkKey) {
  const drink = MENU[drinkKey];
  data.coffee ||= {};
  data.coffee[guildId] ||= {};
  const s = (data.coffee[guildId][userId] ||= emptyStats());
  const today = localDate(0);

  if (s.todayDate !== today) {
    s.todayDate = today;
    s.todayCups = 0;
    s.todayCaffeine = 0;
    s.todayAlcohol = 0;
  }
  // Stats from the /coffee era have no caffeine counter: all were coffees
  s.todayCaffeine ??= s.todayCups;
  s.todayAlcohol ??= 0;
  s.todayCups++;
  if (drink.caffeine) s.todayCaffeine++;
  if (drink.alcohol) s.todayAlcohol++;
  s.total++;
  s.drinks[drinkKey] = (s.drinks[drinkKey] || 0) + 1;

  // Streak = days in a row with at least one drink
  if (s.lastDate !== today) {
    s.streak = s.lastDate === localDate(-1) ? s.streak + 1 : 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.lastDate = today;
  }
  return s;
}

function favoriteDrink(stats) {
  const entries = Object.entries(stats?.drinks || {}).filter(([k]) => MENU[k]);
  if (!entries.length) return null;
  const [key, count] = entries.sort((a, b) => b[1] - a[1])[0];
  return { ...MENU[key], key, count };
}

/** How many drinks per category, e.g. { coffee: 12, tea: 3 }. */
function countByCategory(stats) {
  const counts = {};
  for (const [key, n] of Object.entries(stats?.drinks || {})) {
    const cat = MENU[key]?.category;
    if (cat) counts[cat] = (counts[cat] || 0) + n;
  }
  return counts;
}

/** Summary for /profile, achievements and the AI chat. Null if no drinks yet. */
function getDrinksSummary(guildId, userId) {
  const s = readStats(guildId, userId);
  if (!s) return null;
  const live = s.lastDate === localDate(0) || s.lastDate === localDate(-1);
  const today = todayCounts(s);
  const tried = Object.keys(s.drinks || {}).filter(k => s.drinks[k] > 0);
  const blackTea = tried
    .filter(k => MENU[k]?.blackTea)
    .reduce((n, k) => n + s.drinks[k], 0);
  return {
    total: s.total,
    today: today.total,
    todayCaffeine: today.caffeine,
    todayAlcohol: today.alcohol,
    streak: live ? s.streak : 0,
    bestStreak: s.bestStreak,
    favorite: favoriteDrink(s),
    given: s.given,
    received: s.received,
    spent: s.spent,
    byCategory: countByCategory(s),
    blackTea,
    tried,
  };
}

/**
 * Check limits, charge, serve and record.
 * Returns { error, count } or { stats, lucky }.
 * Errors: 'full' (total limit), 'caffeine', 'alcohol', 'coins'.
 */
function serve(guildId, buyerId, drinkerId, drinkKey) {
  const drink = MENU[drinkKey];
  const today = todayCounts(readStats(guildId, drinkerId));

  if (today.total >= TOTAL_LIMIT) return { error: 'full', count: today.total };
  if (drink.caffeine && today.caffeine >= CAFFEINE_LIMIT) {
    return { error: 'caffeine', count: today.caffeine };
  }
  if (drink.alcohol && today.alcohol >= ALCOHOL_LIMIT) {
    return { error: 'alcohol', count: today.alcohol };
  }

  const lucky = Math.random() < LUCKY_CHANCE;
  if (!lucky && nestcoins.removeCoins(guildId, buyerId, drink.price) === null) {
    return { error: 'coins' };
  }

  let stats;
  db.perform(data => {
    stats = addDrink(data, guildId, drinkerId, drinkKey);
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

/** The extra lines under a served drink (latte art, lucky, streak, jitters…). */
function extrasText(stats, lucky, art, drink) {
  const extras = [];
  if (art) extras.push(`🎨 Latte art: ${art.text}`);
  if (lucky) extras.push('🍀 **On the house!** This one is free.');
  if (stats.streak > 1)
    extras.push(`🔥 Drink streak: **${stats.streak}** days`);
  if (drink.caffeine && stats.todayCaffeine >= JITTERY_AT) {
    extras.push(
      `⚡ ${pick(JITTERY_LINES).replace('{n}', stats.todayCaffeine)}`,
    );
  }
  if (drink.alcohol && stats.todayAlcohol >= TIPSY_AT) {
    extras.push(`🥴 ${pick(TIPSY_LINES).replace('{n}', stats.todayAlcohol)}`);
  }
  return extras.join('\n');
}

module.exports = {
  pick,
  availableDrinks,
  searchDrinks,
  readStats,
  todayCounts,
  getDrinksSummary,
  serve,
  serveLine,
  rollLatteArt,
  extrasText,
};
