// The punishment wheel: entries admins add, a random one is picked per spin.
// Entries can have an effect (gag, nickname, see services/effects.js).
//
// Data: data.wheels[guildId] = { nextId, entries: { id: { id, text, effect } } }
// The old wheel (one list for all servers, effects written into the text) is
// moved into the first server that uses the wheel.
const db = require('../utils/db');
const { parseLegacy, applyEffect } = require('./effects');

const PRICE_TARGETED_SPIN = 15; // spinning for someone else costs coins

const copy = x => JSON.parse(JSON.stringify(x));

function migrate(guildId) {
  db.perform(d => {
    d.wheels ||= {};
    if (d.wheels[guildId]) return;
    const w = (d.wheels[guildId] = { nextId: 1, entries: {} });
    for (const text of Array.isArray(d.wheel) ? d.wheel : []) {
      const parsed = parseLegacy(text);
      const id = w.nextId++;
      w.entries[id] = { id, text: parsed.text, effect: parsed.effect };
    }
    delete d.wheel;
  });
}

function getEntries(guildId) {
  if (!db.read(d => d.wheels?.[guildId])) migrate(guildId);
  return Object.values(copy(db.read(d => d.wheels[guildId].entries))).sort(
    (a, b) => a.id - b.id,
  );
}

function addEntry(guildId, text, effect = null) {
  getEntries(guildId);
  let entry;
  db.perform(d => {
    const w = d.wheels[guildId];
    const id = w.nextId++;
    entry = w.entries[id] = { id, text: String(text).slice(0, 200), effect };
  });
  return copy(entry);
}

function removeEntry(guildId, id) {
  getEntries(guildId);
  let removed = null;
  db.perform(d => {
    removed = d.wheels[guildId].entries[id] || null;
    if (removed) delete d.wheels[guildId].entries[id];
  });
  return removed;
}

/** Pick a random entry and apply its effect. Returns { entry, effectText }. */
async function spin(guild, issuerId, targetId) {
  const entries = getEntries(guild.id);
  if (!entries.length) return { error: 'empty' };
  const entry = entries[Math.floor(Math.random() * entries.length)];
  const result = entry.effect
    ? await applyEffect(guild, entry.effect, { targetId, byId: issuerId })
    : null;
  return { entry, effectText: result?.text || null };
}

module.exports = {
  PRICE_TARGETED_SPIN,
  getEntries,
  addEntry,
  removeEntry,
  spin,
};
