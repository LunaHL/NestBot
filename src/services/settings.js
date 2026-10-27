// Server settings that admins change with /settings. Stored per server in
// data.settings[guildId] in nestbot.json.
const db = require('../utils/db');

const DEFAULTS = {
  streakMode: 'capped', // see utils/streak.js
  freeMode: false, // true = everything you can buy is free (/settings free)
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
