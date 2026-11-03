// Holidays: which one is on right now, the admin test mode, lifetime stats
// for achievements and vouchers (a free drink or a free targeted wheel spin,
// e.g. from the advent calendar).
//
// Seasons (server time zone):
//   christmas  Dec 1–26      advent  Dec 1–24      newyear  Dec 31 + Jan 1
//   easter     Good Friday – Easter Monday           halloween  Oct 31
// Test mode (/settings holidays test:): one season is "on" no matter the date.
//
// Data: data.seasonTest = 'christmas' | 'easter' | 'newyear' | null
//       data.seasonStats[guildId][userId] = { adventOpened, adventYears, santaGifts, coal,
//          snowHits, snowFrozen, ornaments, eggs, goldenEggs, bunnyEggs, bunnyWorn, bunnyDressed, patterns: [] }
//       data.vouchers[guildId][userId] = { drink: n, spin: n }
const db = require('../utils/db');
const { nowInTZ } = require('../utils/time');

/** Easter Sunday of a year (Gregorian computus). Returns { month (0-based), day }. */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Days between a date and this year's Easter Sunday (negative = before). */
function daysFromEaster(date) {
  const { month, day } = easterSunday(date.getFullYear());
  const easter = new Date(date.getFullYear(), month, day);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((today - easter) / 86400000);
}

const getTest = () => db.read(d => d.seasonTest) || null;
function setTest(name) {
  db.perform(d => {
    d.seasonTest = name || null;
  });
}

const SEASONS = {
  christmas: d => d.getMonth() === 11 && d.getDate() <= 26,
  advent: d => d.getMonth() === 11 && d.getDate() <= 24,
  newyear: d =>
    (d.getMonth() === 11 && d.getDate() === 31) ||
    (d.getMonth() === 0 && d.getDate() === 1),
  easter: d => {
    const n = daysFromEaster(d);
    return n >= -2 && n <= 1; // Good Friday … Easter Monday
  },
};
// In test mode, these count as "on" together
const TEST_INCLUDES = {
  christmas: ['christmas', 'advent'],
  easter: ['easter'],
  newyear: ['newyear'],
};

/** Is this season on right now (or being tested)? */
function active(name, date = nowInTZ()) {
  const test = getTest();
  if (test && TEST_INCLUDES[test]?.includes(name)) return true;
  return !!SEASONS[name]?.(date);
}

/** Today's advent door (1–24). In test mode outside December: a door based on the date. */
function adventDay(date = nowInTZ()) {
  if (date.getMonth() === 11 && date.getDate() <= 24) return date.getDate();
  return getTest() === 'christmas' ? ((date.getDate() - 1) % 24) + 1 : null;
}

const year = () => nowInTZ().getFullYear();

// ---------- Lifetime stats (achievements, profile) ----------

const EMPTY = {
  adventOpened: 0,
  adventYears: {},
  santaGifts: 0,
  coal: 0,
  snowHits: 0,
  snowFrozen: 0,
  ornaments: 0,
  eggs: 0,
  goldenEggs: 0,
  bunnyEggs: 0,
  bunnyWorn: 0,
  bunnyDressed: 0,
  patterns: [],
};

function statsOf(guildId, userId) {
  return {
    ...EMPTY,
    ...JSON.parse(
      JSON.stringify(db.read(d => d.seasonStats?.[guildId]?.[userId]) || {}),
    ),
  };
}

/** Change someone's season stats: bump(guildId, userId, s => s.eggs++) */
function bump(guildId, userId, fn) {
  db.perform(d => {
    d.seasonStats ||= {};
    d.seasonStats[guildId] ||= {};
    const s = (d.seasonStats[guildId][userId] ||= JSON.parse(
      JSON.stringify(EMPTY),
    ));
    for (const [k, v] of Object.entries(EMPTY))
      s[k] ??= JSON.parse(JSON.stringify(v));
    fn(s);
  });
}

// ---------- Vouchers ----------

const getVouchers = (guildId, userId) => ({
  drink: 0,
  spin: 0,
  ...(db.read(d => d.vouchers?.[guildId]?.[userId]) || {}),
});

function addVoucher(guildId, userId, kind, n = 1) {
  db.perform(d => {
    d.vouchers ||= {};
    d.vouchers[guildId] ||= {};
    const v = (d.vouchers[guildId][userId] ||= { drink: 0, spin: 0 });
    v[kind] = (v[kind] || 0) + n;
  });
}

/** Use one voucher if there is one. Returns true if used. */
function useVoucher(guildId, userId, kind) {
  let used = false;
  db.perform(d => {
    const v = d.vouchers?.[guildId]?.[userId];
    if (v?.[kind] > 0) {
      v[kind]--;
      used = true;
    }
  });
  return used;
}

/** The channel for holiday posts: /settings channels holidays:, else the hub channel. */
async function holidayChannel(client, guildId) {
  const { getSetting } = require('./settings');
  const id =
    getSetting(guildId, 'holidayChannelId') ||
    getSetting(guildId, 'hubChannelId');
  return id ? client.channels.fetch(id).catch(() => null) : null;
}

module.exports = {
  easterSunday,
  daysFromEaster,
  getTest,
  setTest,
  active,
  adventDay,
  year,
  statsOf,
  bump,
  getVouchers,
  addVoucher,
  useVoucher,
  holidayChannel,
};
