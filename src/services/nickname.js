// Paid temporary nicknames: someone pays coins to give another member a
// nickname for a while. NestBot remembers the old nickname and puts it back
// when the time is up. Admins can switch it off with /settings nicknames.
//
// Data: data.nicknames[guildId][userId] = { name, original, by, until, setAt }
const db = require('../utils/db');
const { getSetting } = require('./settings');
const { runEvery } = require('../utils/schedule');

/** Duration (minutes) → price in coins. More money, longer nickname. */
const PRICES = { 10: 15, 30: 30, 60: 50, 180: 100, 720: 200, 1440: 300 };
const MAX_LENGTH = 32; // Discord's limit

const enabled = guildId => getSetting(guildId, 'nicknamePranks') !== false;

function getActive(guildId, userId) {
  const r = db.read(d => d.nicknames?.[guildId]?.[userId]);
  return r && r.until > Date.now() ? { ...r } : null;
}

/** Clean up a nickname: no pings, no line breaks, max 32 characters. */
function clean(name) {
  return String(name || '')
    .replace(/@(everyone|here)/gi, '$1')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, MAX_LENGTH);
}

/**
 * Give someone a nickname for `minutes`. Returns { error } or { until, name }.
 * Errors: 'disabled', 'empty', 'not-found', 'cannot' (owner / higher role).
 * `price` is remembered: buying yourself out early costs the same.
 */
async function apply(guild, targetId, name, minutes, byId, price = 0) {
  if (!enabled(guild.id)) return { error: 'disabled' };
  name = clean(name);
  if (!name) return { error: 'empty' };
  const member = await guild.members.fetch(targetId).catch(() => null);
  if (!member) return { error: 'not-found' };
  if (member.manageable === false) return { error: 'cannot' };

  const active = getActive(guild.id, targetId);
  const original = active ? active.original : (member.nickname ?? null);
  try {
    await member.setNickname(name, `Paid nickname by ${byId}`);
  } catch (e) {
    console.error('[Nickname] setNickname failed:', e.message);
    return { error: 'cannot' };
  }
  const until = Date.now() + minutes * 60000;
  db.perform(d => {
    d.nicknameStats ||= {};
    d.nicknameStats[guild.id] ||= {};
    const by = (d.nicknameStats[guild.id][byId] ||= { given: 0, received: 0 });
    const to = (d.nicknameStats[guild.id][targetId] ||= {
      given: 0,
      received: 0,
    });
    by.given++;
    to.received++;
    d.nicknames ||= {};
    d.nicknames[guild.id] ||= {};
    d.nicknames[guild.id][targetId] = {
      name,
      original,
      by: byId,
      until,
      setAt: Date.now(),
      price,
    };
  });
  return { until, name };
}

/** { given, received }: how often someone renamed others / got renamed. */
const getStats = (guildId, userId) => ({
  given: 0,
  received: 0,
  ...(db.read(d => d.nicknameStats?.[guildId]?.[userId]) || {}),
});

/** Give the old nickname back. */
async function restore(guild, userId) {
  const r = db.read(d => d.nicknames?.[guild.id]?.[userId]);
  if (!r) return false;
  db.perform(d => delete d.nicknames[guild.id][userId]);
  const member = await guild.members.fetch(userId).catch(() => null);
  // Only put it back if nobody changed it in the meantime
  if (member && (member.nickname === r.name || member.nickname == null)) {
    await member
      .setNickname(r.original, 'Paid nickname expired')
      .catch(() => {});
  }
  return true;
}

/** Restore every paid nickname of a server (when admins switch it off). */
async function restoreAll(guild) {
  const users = Object.keys(db.read(d => d.nicknames?.[guild.id]) || {});
  for (const userId of users) await restore(guild, userId);
  return users.length;
}

async function tick(client) {
  const all = db.read(d => d.nicknames || {});
  for (const [guildId, users] of Object.entries(all)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    for (const [userId, r] of Object.entries(users)) {
      if (r.until <= Date.now()) await restore(guild, userId);
    }
  }
}

/** Called once when the bot is ready. */
function startNicknames(client) {
  runEvery('Nicknames', 1, () => tick(client));
}

module.exports = {
  getStats,
  PRICES,
  MAX_LENGTH,
  enabled,
  getActive,
  clean,
  apply,
  restore,
  restoreAll,
  tick,
  startNicknames,
};
