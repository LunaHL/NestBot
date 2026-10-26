// Keeps nestbot.json small by moving old data into the archive
// (src/data/archive/). Nothing is removed unless it was archived first.
// Runs at startup and then every hour, independent of any channel settings.
const db = require('../utils/db');
const archive = require('./archive');
const { localDate } = require('../utils/time');
const { runEvery } = require('../utils/schedule');

const KEEP_DAILY_DAYS = 7; // NestWord days + past puzzles stay in the main DB this long
const KEEP_FINISHED_EVENTS_DAYS = 30; // finished tournaments

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const monthOfDateKey = key => key.slice(0, 7);

// Move "YYYY-MM-DD" entries older than the cutoff into the archive.
// Future dates are kept (e.g. puzzles queued with /puzzle set append).
function archiveOldDays(obj, kind, cutoff) {
  if (!obj) return 0;
  const old = {};
  for (const key of Object.keys(obj)) {
    if (DATE_KEY.test(key) && key < cutoff) old[key] = obj[key];
  }
  if (!archive.add(kind, old, monthOfDateKey)) return 0; // keep data if archiving failed
  for (const key of Object.keys(old)) delete obj[key];
  return Object.keys(old).length;
}

function archiveOldEvents(data, now) {
  const maxAge = KEEP_FINISHED_EVENTS_DAYS * 86400000;
  const old = {};

  for (const [guildId, events] of Object.entries(data.events || {})) {
    if (!Array.isArray(events)) continue;
    for (const e of events) {
      if (e.active) continue;
      if (!e.endedAt) e.endedAt = now; // old events: start the clock now
      if (now - e.endedAt > maxAge)
        old[`${guildId}-${e.id}`] = { ...e, guildId };
    }
  }

  const monthOf = (_key, e) => new Date(e.endedAt).toISOString().slice(0, 7);
  if (!archive.add('events', old, monthOf)) return 0;

  for (const e of Object.values(old)) {
    data.events[e.guildId] = data.events[e.guildId].filter(x => x.id !== e.id);
  }
  return Object.keys(old).length;
}

function runCleanup() {
  const cutoff = localDate(-KEEP_DAILY_DAYS);
  const now = Date.now();
  const stats = { nestword: 0, puzzles: 0, gags: 0, events: 0 };

  db.perform(data => {
    stats.nestword = archiveOldDays(data.nestwordDaily, 'nestword', cutoff);
    stats.puzzles = archiveOldDays(data.puzzles, 'puzzles', cutoff);
    stats.events = archiveOldEvents(data, now);

    // Expired gags have no history value, so they're just removed
    for (const [guildId, gags] of Object.entries(data.gags || {})) {
      for (const [userId, info] of Object.entries(gags)) {
        if (!info?.until || info.until <= now) {
          delete gags[userId];
          stats.gags++;
        }
      }
      if (Object.keys(gags).length === 0) delete data.gags[guildId];
    }
  });

  // NestWord's "recently used words" list in wordlist.json. Every past word
  // is already kept in the nestword archive, so old entries are just removed.
  let words = 0;
  try {
    words = require('../commands/nestword').pruneUsedWords();
  } catch (e) {
    console.error('[Cleanup] Wordlist cleanup failed:', e);
  }

  const total =
    stats.nestword + stats.puzzles + stats.gags + stats.events + words;
  if (total > 0) {
    console.log(
      `[Cleanup] Archived ${stats.nestword} NestWord days, ${stats.puzzles} puzzles, ` +
        `${stats.events} old events. Removed ${stats.gags} expired gags, ${words} used words.`,
    );
  }
}

/** Called once when the bot is ready. */
function startCleanup() {
  runEvery('Cleanup', 60, runCleanup);
}

module.exports = { startCleanup, runCleanup };
