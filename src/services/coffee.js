// The café's logic: serving drinks, charging coins and keeping coffee stats.
// The menu and all tunable numbers are in src/config/coffeeMenu.js.
const db = require('../utils/db');
const nestcoins = require('./nestcoins');
const { localDate } = require('../utils/time');
const {
  DAILY_LIMIT,
  JITTERY_AT,
  LUCKY_BEAN_CHANCE,
  LATTE_ART_CHANCE,
  MENU,
  SECRETS,
  LATTE_ART,
  JITTERY_LINES,
} = require('../config/coffeeMenu');

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

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
  if (stats.streak > 1)
    extras.push(`🔥 Coffee streak: **${stats.streak}** days`);
  if (stats.todayCups >= JITTERY_AT) {
    extras.push(`⚡ ${pick(JITTERY_LINES).replace('{n}', stats.todayCups)}`);
  }
  return extras.join('\n');
}

module.exports = {
  pick,
  readStats,
  getCoffeeSummary,
  serve,
  serveLine,
  rollLatteArt,
  extrasText,
};
