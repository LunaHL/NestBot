// Facts users ask NestBot to remember (/memory). Opt-in only: NestBot never
// saves anything on its own. Used in the AI chat prompt.
const db = require('../utils/db');

const MAX_MEMORIES = 10;
const MAX_LENGTH = 150;

function getMemories(guildId, userId) {
  return db.read(d => d.memories?.[guildId]?.[userId]) || [];
}

/** Returns { ok } or { error: 'full' | 'empty' }. */
function addMemory(guildId, userId, text) {
  const clean = String(text).replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
  if (!clean) return { error: 'empty' };
  if (getMemories(guildId, userId).length >= MAX_MEMORIES) return { error: 'full' };
  db.perform(d => {
    d.memories ||= {};
    d.memories[guildId] ||= {};
    (d.memories[guildId][userId] ||= []).push({ text: clean, at: Date.now() });
  });
  return { ok: true, text: clean };
}

/** Remove one memory by its 1-based number. Returns the removed text or null. */
function removeMemory(guildId, userId, number) {
  let removed = null;
  db.perform(d => {
    const list = d.memories?.[guildId]?.[userId];
    if (!list || number < 1 || number > list.length) return;
    removed = list.splice(number - 1, 1)[0].text;
  });
  return removed;
}

function clearMemories(guildId, userId) {
  db.perform(d => {
    if (d.memories?.[guildId]) delete d.memories[guildId][userId];
  });
}

module.exports = { getMemories, addMemory, removeMemory, clearMemories, MAX_MEMORIES, MAX_LENGTH };
