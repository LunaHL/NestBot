// Facts users ask NestBot to remember. Opt-in only: NestBot never saves
// anything on its own. Used in the AI chat prompt. People manage them by
// talking to her (see chatCommand): "@NestBot remember that I love Earl Grey",
// "@NestBot forget Earl Grey", "@NestBot what do you know about me?".
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
  if (getMemories(guildId, userId).length >= MAX_MEMORIES)
    return { error: 'full' };
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

// ---------- Talking to NestBot ----------

const LIST =
  /^(?:what do you (?:know|remember) about me|what have you (?:saved|remembered)|was wei(?:ß|ss)t du (?:alles )?(?:über|ueber) mich|woran erinnerst du dich|was hast du dir gemerkt)\b/i;
const FORGET_ALL =
  /^(?:please\s+|bitte\s+)?(?:forget everything(?: about me)?|vergiss alles(?: (?:über|ueber) mich)?)\b/i;
const FORGET =
  /^(?:please\s+|bitte\s+)?(?:forget|vergiss)\s+(?:that\s+|dass\s+|about\s+)?(.+)$/i;
const REMEMBER =
  /^(?:please\s+|bitte\s+)?(?:remember|merk(?:e)? dir|notier(?:e)? dir)(?:\s*[,:])?(?:\s+(?:that|dass))?\s+(.+)$/i;

/** Is this message about memories? → { type: 'list'|'forgetAll'|'forget'|'add', text } or null. */
function chatCommand(text) {
  const t = String(text || '')
    .trim()
    .replace(/[.!]+$/, '');
  if (LIST.test(t)) return { type: 'list' };
  if (FORGET_ALL.test(t)) return { type: 'forgetAll' };
  let m = FORGET.exec(t);
  if (m) return { type: 'forget', text: m[1].trim() };
  m = REMEMBER.exec(t);
  if (m) return { type: 'add', text: m[1].trim() };
  return null;
}

/** Forget the memory that best matches the text. Returns the removed text or null. */
function forgetMatching(guildId, userId, text) {
  const q = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]/g, '')
    .trim();
  if (!q) return null;
  const list = getMemories(guildId, userId);
  const index = list.findIndex(m => {
    const mt = m.text.toLowerCase();
    return (
      mt.includes(q) ||
      q
        .split(' ')
        .filter(w => w.length > 2)
        .some(w => mt.includes(w))
    );
  });
  return index < 0 ? null : removeMemory(guildId, userId, index + 1);
}

module.exports = {
  chatCommand,
  forgetMatching,
  getMemories,
  addMemory,
  removeMemory,
  clearMemories,
  MAX_MEMORIES,
  MAX_LENGTH,
};
