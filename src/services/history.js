// Combines recent data (nestbot.json) with archived data (data/archive/),
// so commands see the full history regardless of what cleanup has moved.
const db = require('../utils/db');
const archive = require('./archive');

/** All puzzles ever set: { "YYYY-MM-DD": puzzle } */
function allPuzzles() {
  return { ...archive.getAll('puzzles'), ...db.read(d => d.puzzles || {}) };
}

/** All NestWord days: { "YYYY-MM-DD": day } */
function allNestwordDays() {
  return {
    ...archive.getAll('nestword'),
    ...db.read(d => d.nestwordDaily || {}),
  };
}

/** All events of a guild, live and archived. */
function allEvents(guildId) {
  const archived = Object.values(archive.getAll('events')).filter(
    e => e.guildId === guildId,
  );
  const live = db.read(d => d.events?.[guildId] || []);
  return [...archived, ...live];
}

module.exports = { allPuzzles, allNestwordDays, allEvents };
