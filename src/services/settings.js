// Server settings that admins change with /settings. Stored per server in
// data.settings[guildId] in nestbot.json.
const db = require('../utils/db');

const DEFAULTS = {
  streakMode: 'capped', // see utils/streak.js
  freeMode: false, // true = everything you can buy is free (/settings free)
  nicknamePranks: true, // paid temporary nicknames (/nickname, /settings nicknames)
  // Movie nights (/settings watch)
  watchChannelId: null, // #movies: calendar, cards, announcements
  watchCategoryId: null, // category for the temporary watch rooms
  watchModRoleId: null, // role that may end/cancel any watch (besides admins)
  watchPlanRoleId: null, // only this role may plan (null = everyone)
  watchRoomOpensMin: 60, // room opens this many minutes before the start
  watchAutoDeleteH: 24, // forgotten rooms are closed after this many hours
  watchCheckpointMin: 30, // "where are you?" every N minutes (0 = off)
  watchAttendanceCoins: 0, // coins for checking in (0 = off)
  watchReminders: true, // reminder in #movies one day before
  watchGroupCategoryId: null, // category for the permanent group channels (/group)
  watchMaxGroups: 0, // groups one person may own (0 = unlimited)
  watchVoteMaxH: 168, // longest vote someone can start, in hours (vote until the start is always allowed)
};

function getSetting(guildId, key) {
  const value = db.read(d => d.settings?.[guildId]?.[key]);
  return value ?? DEFAULTS[key];
}

function setSetting(guildId, key, value) {
  db.perform(d => {
    d.settings ||= {};
    d.settings[guildId] ||= {};
    d.settings[guildId][key] = value;
  });
}

/** 'capped' (new) or 'multiplier' (old). */
const getStreakMode = guildId => getSetting(guildId, 'streakMode');

module.exports = { getSetting, setSetting, getStreakMode };
