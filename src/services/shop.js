// The shop: items admins add, people buy. Items can have an effect (gag,
// nickname, see services/effects.js) that needs a target.
//
// Data: data.shop[guildId] = { id: item }, data.shopNextId[guildId]
// item = { id, name, emoji, price, description, effect: { type, durationSec, text } | null }
// Items from the old shop (effect written into the description) are
// converted automatically the first time they're read.
const db = require('../utils/db');
const nestcoins = require('./nestcoins');
const { parseLegacy, applyEffect } = require('./effects');

const copy = x => JSON.parse(JSON.stringify(x));

/** All items, sorted by price. Converts old items on the way. */
function getItems(guildId) {
  const raw = db.read(d => d.shop?.[guildId]) || {};
  if (Object.values(raw).some(i => !i.v2)) {
    db.perform(d => {
      for (const [id, item] of Object.entries(d.shop[guildId])) {
        if (item.v2) continue;
        const { text, effect } = parseLegacy(item.description);
        d.shop[guildId][id] = {
          id: Number(id),
          name: item.name,
          emoji: '🛍️',
          price: item.price,
          description: text,
          effect,
          v2: true,
        };
      }
      d.shopNextId ||= {};
      d.shopNextId[guildId] =
        Math.max(
          d.shopNextId[guildId] || 0,
          ...Object.keys(d.shop[guildId]).map(Number),
        ) + 1;
    });
  }
  return Object.values(copy(db.read(d => d.shop?.[guildId]) || {})).sort(
    (a, b) => a.price - b.price || a.id - b.id,
  );
}

function getItem(guildId, id) {
  return getItems(guildId).find(i => i.id === Number(id)) || null;
}

function addItem(guildId, fields) {
  getItems(guildId); // convert old items first
  let item;
  db.perform(d => {
    d.shop ||= {};
    d.shop[guildId] ||= {};
    d.shopNextId ||= {};
    const id =
      d.shopNextId[guildId] ||
      Math.max(0, ...Object.keys(d.shop[guildId]).map(Number)) + 1;
    d.shopNextId[guildId] = id + 1;
    item = d.shop[guildId][id] = {
      id,
      v2: true,
      emoji: '🛍️',
      effect: null,
      ...fields,
    };
  });
  return copy(item);
}

function editItem(guildId, id, changes) {
  let item = null;
  db.perform(d => {
    const it = d.shop?.[guildId]?.[id];
    if (!it) return;
    for (const [k, v] of Object.entries(changes))
      if (v !== undefined) it[k] = v;
    item = copy(it);
  });
  return item;
}

function removeItem(guildId, id) {
  let removed = null;
  db.perform(d => {
    removed = d.shop?.[guildId]?.[id] || null;
    if (removed) delete d.shop[guildId][id];
  });
  return removed;
}

/**
 * Buy an item. Returns { error } ('gone', 'target', 'bot', 'coins') or
 * { item, paid, effectText }.
 */
async function buy(guild, buyerId, id, target) {
  const item = getItem(guild.id, id);
  if (!item) return { error: 'gone' };
  if (item.effect && !target) return { error: 'target' };
  if (target?.bot) return { error: 'bot' };

  const payment = nestcoins.pay(guild.id, buyerId, item.price);
  if (!payment.ok) return { error: 'coins', balance: payment.balance, item };

  const result = item.effect
    ? await applyEffect(guild, item.effect, {
        targetId: target.id,
        byId: buyerId,
      })
    : null;
  return { item, paid: payment.paid, effectText: result?.text || null };
}

module.exports = { getItems, getItem, addItem, editItem, removeItem, buy };
