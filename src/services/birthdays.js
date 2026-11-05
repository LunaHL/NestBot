// 🎂 Birthdays: saving them, understanding dates the way people type them,
// and the daily announcement (a card with a 🎉 button to send wishes, coins,
// an optional birthday role and a reminder the day before).
//
// Data: data.birthdays[guildId] = { id: { name, date: "MM-DD", userId, year } }  (unchanged format)
//       data.birthdayState[guildId] = { announced, reminded, roleHolders: [], wishes: { "YYYY-MM-DD:id": [userIds] } }
// Settings (/settings birthdays): birthdayChannels[guildId] (channel), birthdayRoleId,
//       birthdayHour (default 9), birthdayCoins (200), birthdayReminder (true)
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('./nestcoins');
const { getSetting } = require('./settings');
const { nowInTZ, localDate } = require('../utils/time');
const ui = require('../utils/ui');

const COLOR = 0xff9ff3;
const WISH_COINS = 5; // per wish, for the birthday person
const MAX_PAID_WISHES = 20;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTH_WORDS = [
  ['jan', 'januar', 'january', 'jänner'],
  ['feb', 'februar', 'february'],
  ['mar', 'mär', 'märz', 'maerz', 'march'],
  ['apr', 'april'],
  ['may', 'mai'],
  ['jun', 'juni', 'june'],
  ['jul', 'juli', 'july'],
  ['aug', 'august'],
  ['sep', 'sept', 'september'],
  ['oct', 'okt', 'oktober', 'october'],
  ['nov', 'november'],
  ['dec', 'dez', 'dezember', 'december'],
];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const pad = n => String(n).padStart(2, '0');

/** "24 December" for "12-24". */
function pretty(date) {
  const [m, d] = String(date).split('-').map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : String(date);
}

/**
 * Understand a birthday the way people type it:
 * "24.12.", "24.12", "24.12.1998", "24/12", "12-24", "1998-12-24", "Dec 24",
 * "24 Dezember", "December 24th". Returns { date: "MM-DD", year } or null.
 */
function parse(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/,/g, ' ');
  let d;
  let m;
  let year = null;
  let x;
  if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) [, year, m, d] = x;
  else if ((x = /^(\d{1,2})-(\d{1,2})$/.exec(t)))
    [, m, d] = x; // old format MM-DD
  else if ((x = /^(\d{1,2})[./](\d{1,2})\.?(?:[./]?(\d{4}))?$/.exec(t)))
    [, d, m, year] = x;
  else {
    const words = t.split(/[\s.]+/).filter(Boolean);
    const mi = words.findIndex(w =>
      MONTH_WORDS.some(names => names.includes(w)),
    );
    if (mi < 0) return null;
    m = MONTH_WORDS.findIndex(names => names.includes(words[mi])) + 1;
    const nums = words
      .filter((w, i) => i !== mi && /^\d+$/.test(w))
      .map(Number);
    d = nums.find(n => n >= 1 && n <= 31);
    year = nums.find(n => n > 31) || null;
  }
  d = Number(d);
  m = Number(m);
  year = year ? Number(year) : null;
  if (!m || !d || m > 12 || d > DAYS_IN[m - 1]) return null;
  const thisYear = nowInTZ().getFullYear();
  if (year && (year < 1900 || year > thisYear)) year = null;
  return { date: `${pad(m)}-${pad(d)}`, year };
}

/** All entries: [{ id, name, date, userId, year }] (only valid dates). */
function all(guildId) {
  const raw = db.read(d => d.birthdays?.[guildId]) || {};
  return Object.entries(raw)
    .map(([id, e]) => ({ id, ...e, date: parse(e.date)?.date || null }))
    .filter(e => e.date);
}

const forUser = (guildId, userId) =>
  all(guildId).find(e => e.userId === userId) || null;

/** Days until the next birthday (0 = today). Feb 29 counts as Feb 28 in other years. */
function daysUntil(date, now = nowInTZ()) {
  const [m, d] = date.split('-').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const day = m === 2 && d === 29 && !leap ? 28 : d;
    const next = new Date(y, m - 1, day);
    if (next >= today) return Math.round((next - today) / 86400000);
  }
  return 365;
}

/** Save someone's birthday (a member, or an outside name). Returns the entry. */
function set(guildId, { userId = null, name, date, year = null }) {
  let entry;
  db.perform(d => {
    d.birthdays ||= {};
    d.birthdays[guildId] ||= {};
    const list = d.birthdays[guildId];
    const id =
      Object.keys(list).find(k =>
        userId
          ? list[k].userId === userId
          : !list[k].userId &&
            list[k].name?.toLowerCase() === name.toLowerCase(),
      ) ||
      String(
        Math.max(0, ...Object.keys(list).map(Number).filter(Number.isFinite)) +
          1,
      );
    entry = list[id] = { name, date, userId, year: year || null };
  });
  return entry;
}

/** Remove a member's or an outside name's birthday. Returns the removed entry or null. */
function remove(guildId, { userId = null, name = null }) {
  let removed = null;
  db.perform(d => {
    const list = d.birthdays?.[guildId] || {};
    const id = Object.keys(list).find(k =>
      userId
        ? list[k].userId === userId
        : !list[k].userId &&
          list[k].name?.toLowerCase() === String(name).toLowerCase(),
    );
    if (id) {
      removed = list[id];
      delete list[id];
    }
  });
  return removed;
}

/** Upcoming birthdays, soonest first: [{ …entry, days }] */
function upcoming(guildId) {
  return all(guildId)
    .map(e => ({ ...e, days: daysUntil(e.date) }))
    .sort((a, b) => a.days - b.days);
}

const who = e => (e.userId ? `<@${e.userId}>` : `**${e.name}**`);
const turns = e => (e.year ? nowInTZ().getFullYear() - e.year : null);

// ---------- The announcement ----------

const state = guildId => db.read(d => d.birthdayState?.[guildId]) || {};
function changeState(guildId, fn) {
  let r;
  db.perform(d => {
    d.birthdayState ||= {};
    r = fn((d.birthdayState[guildId] ||= { roleHolders: [], wishes: {} }));
  });
  return r;
}

function card(guildId, e, day) {
  const wishes = state(guildId).wishes?.[`${day}:${e.id}`] || [];
  const age = turns(e);
  const coins = getSetting(guildId, 'birthdayCoins');
  return {
    content: e.userId ? `<@${e.userId}>` : undefined,
    embeds: [
      ui.card({
        title: `🎂 Happy Birthday, ${e.name}!`,
        color: COLOR,
        text:
          (age
            ? `${who(e)} turns **${age}** today! 🥳`
            : `It’s ${who(e)}’s birthday today! 🥳`) +
          (e.userId && coins ? `\n🎁 **+${coins} coins** from the Nest.` : '') +
          (wishes.length
            ? `\n\n🎉 **Wishes from:** ${wishes.map(u => `<@${u}>`).join(' ')}`
            : '\n\nPress 🎉 to send your wishes!'),
        footer: e.userId
          ? `Every wish gives ${e.name} +${WISH_COINS} coins`
          : 'Happy birthday!',
      }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`birthday:wish:${e.id}:${day}`)
          .setLabel(
            `Happy birthday!${wishes.length ? ` (${wishes.length})` : ''}`,
          )
          .setEmoji('🎉')
          .setStyle(ButtonStyle.Success),
      ),
    ],
    allowedMentions: { users: e.userId ? [e.userId] : [] },
  };
}

/** Someone pressed 🎉. Returns { error: 'self' | 'already' | 'gone' } or { entry, payload }. */
function wish(guildId, entryId, day, userId) {
  const e = all(guildId).find(x => x.id === entryId);
  if (!e) return { error: 'gone' };
  if (e.userId === userId) return { error: 'self' };
  const key = `${day}:${entryId}`;
  const added = changeState(guildId, s => {
    s.wishes ||= {};
    const list = (s.wishes[key] ||= []);
    if (list.includes(userId)) return false;
    list.push(userId);
    return list.length;
  });
  if (!added) return { error: 'already' };
  if (e.userId && added <= MAX_PAID_WISHES)
    nestcoins.addCoins(guildId, e.userId, WISH_COINS);
  return { entry: e, payload: card(guildId, e, day) };
}

async function channelOf(client, guildId) {
  const id = db.read(d => d.birthdayChannels?.[guildId]);
  return id ? client.channels.fetch(id).catch(() => null) : null;
}

/** Today's birthdays (Feb 29 birthdays on Feb 28 in other years). */
function todays(guildId, now = nowInTZ()) {
  return all(guildId).filter(e => daysUntil(e.date, now) === 0);
}

/** Post the cards, pay coins, give the role. Returns how many were announced. */
async function announce(client, guild, { force = false } = {}) {
  const day = localDate(0);
  if (!force && state(guild.id).announced === day) return 0;
  changeState(guild.id, s => {
    s.announced = day;
  });
  const list = todays(guild.id);
  const channel = await channelOf(client, guild.id);
  const coins = getSetting(guild.id, 'birthdayCoins');
  const roleId = getSetting(guild.id, 'birthdayRoleId');

  // Yesterday's birthday role comes off
  for (const id of state(guild.id).roleHolders || []) {
    if (list.some(e => e.userId === id)) continue;
    const m = await guild.members.fetch(id).catch(() => null);
    if (m && roleId) await m.roles.remove(roleId).catch(() => {});
  }
  changeState(guild.id, s => {
    s.roleHolders = list.filter(e => e.userId).map(e => e.userId);
  });

  for (const e of list) {
    if (e.userId) {
      if (coins) nestcoins.addCoins(guild.id, e.userId, coins);
      if (roleId) {
        const m = await guild.members.fetch(e.userId).catch(() => null);
        await m?.roles.add(roleId, 'Birthday').catch(() => {});
      }
    }
    if (channel) await channel.send(card(guild.id, e, day)).catch(() => {});
  }
  return list.length;
}

/** The day before: a little reminder in the birthday channel. */
async function remind(client, guild) {
  const day = localDate(0);
  if (
    getSetting(guild.id, 'birthdayReminder') === false ||
    state(guild.id).reminded === day
  )
    return 0;
  changeState(guild.id, s => {
    s.reminded = day;
  });
  const tomorrow = upcoming(guild.id).filter(e => e.days === 1);
  const channel = tomorrow.length && (await channelOf(client, guild.id));
  if (!channel) return 0;
  await channel
    .send({
      content: `🎈 Psst… tomorrow is ${tomorrow.map(who).join(', ')}’s birthday!`,
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
  return tomorrow.length;
}

/** Every few minutes: at the set hour, announce today's birthdays and tomorrow's reminder. */
async function tick(client) {
  const now = nowInTZ();
  const hour = now.getHours();
  // The old version announced at midnight and remembered "MM-DD": don't congratulate twice on update day
  const oldMark = db.read(d => d.birthdayLastChecked);
  const todayMD = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  for (const guild of client.guilds.cache.values()) {
    if (oldMark === todayMD && !state(guild.id).announced) {
      changeState(guild.id, s => {
        s.announced = localDate(0);
      });
    }
    if (hour < getSetting(guild.id, 'birthdayHour')) continue;
    await announce(client, guild);
    await remind(client, guild);
  }
}

function startBirthdays(client) {
  require('../utils/schedule').runEvery('Birthdays', 5, () => tick(client));
}

/** For NestBot's AI: is it this person's birthday today? */
function isBirthday(guildId, userId) {
  const e = forUser(guildId, userId);
  return !!e && daysUntil(e.date) === 0;
}

module.exports = {
  COLOR,
  WISH_COINS,
  MONTHS,
  pretty,
  parse,
  all,
  forUser,
  daysUntil,
  set,
  remove,
  upcoming,
  turns,
  card,
  wish,
  todays,
  announce,
  remind,
  tick,
  startBirthdays,
  isBirthday,
};
