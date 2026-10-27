const db = require('../utils/db');
const { getSetting } = require('./settings');

function ensureWallet(data, guildId) {
  if (!data.nestcoins) data.nestcoins = {};
  if (!data.nestcoins[guildId]) data.nestcoins[guildId] = {};
  return data.nestcoins[guildId];
}

function getBalance(guildId, userId) {
  return db.read(data => {
    const v = data.nestcoins?.[guildId]?.[userId];
    return Number.isInteger(v) ? v : 0;
  });
}

function getAllBalances(guildId) {
  return db.read(data =>
    Object.entries(data.nestcoins?.[guildId] || {}).map(([userId, amt]) => [
      userId,
      Number.isInteger(amt) ? amt : 0,
    ]),
  );
}

function addCoins(guildId, userId, amount) {
  let newBalance = 0;
  db.perform(data => {
    const wallet = ensureWallet(data, guildId);
    const current = Number.isInteger(wallet[userId]) ? wallet[userId] : 0;
    const inc = Math.trunc(amount);
    newBalance = current + inc;
    if (newBalance < 0) newBalance = 0;
    wallet[userId] = newBalance;
  });
  return newBalance;
}

function removeCoins(guildId, userId, amount) {
  let result = null;

  db.perform(data => {
    const wallet = ensureWallet(data, guildId);
    const current = Number.isInteger(wallet[userId]) ? wallet[userId] : 0;

    const dec = Math.trunc(amount);
    if (dec <= 0) return;

    const candidate = current - dec;
    if (candidate < 0) {
      return;
    }

    wallet[userId] = candidate;
    result = candidate;
  });

  return result;
}

// ---------- Purchases ----------
// Everything you can BUY (drinks, shop, AI extras, targeted wheel spins) goes
// through pay(). In free mode (/settings free) nothing is taken. Bets
// (gamble, duels) and transfers use removeCoins directly and always cost.

/** Is everything free right now on this server? */
function isFreeMode(guildId) {
  return !!getSetting(guildId, 'freeMode');
}

/**
 * Charge for a purchase. Returns { ok, paid, balance }:
 * ok = false if the buyer can't afford it; paid = coins actually taken
 * (0 in free mode, use it for refunds).
 */
function pay(guildId, userId, price) {
  if (isFreeMode(guildId) || price <= 0) {
    return { ok: true, paid: 0, balance: getBalance(guildId, userId) };
  }
  const left = removeCoins(guildId, userId, price);
  if (left === null)
    return { ok: false, paid: 0, balance: getBalance(guildId, userId) };
  return { ok: true, paid: price, balance: left };
}

/** "5 NestCoins", or "free" in free mode. */
function priceText(guildId, price) {
  return isFreeMode(guildId) ? 'free' : `${price} NestCoins`;
}

module.exports = {
  isFreeMode,
  pay,
  priceText,
  getBalance,
  getAllBalances,
  addCoins,
  removeCoins,
};
