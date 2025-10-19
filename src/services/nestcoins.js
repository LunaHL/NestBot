const db = require('../utils/db');

function ensureWallet(data, guildId) {
  if (!data.nestcoins) data.nestcoins = {};
  if (!data.nestcoins[guildId]) data.nestcoins[guildId] = {};
  return data.nestcoins[guildId];
}

function getBalance(guildId, userId) {
  let balance = 0;
  db.perform(data => {
    const wallet = ensureWallet(data, guildId);
    const v = wallet[userId];
    balance = Number.isInteger(v) ? v : 0;
  });
  return balance;
}

function getAllBalances(guildId) {
  let entries = [];
  db.perform(data => {
    const wallet = ensureWallet(data, guildId);
    entries = Object.entries(wallet).map(([userId, amt]) => [
      userId,
      Number.isInteger(amt) ? amt : 0,
    ]);
  });
  return entries;
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

module.exports = { getBalance, getAllBalances, addCoins, removeCoins };
