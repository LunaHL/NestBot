// All stats about one member, from current and archived data.
// Used by /profile and achievements.
const db = require('../utils/db');
const nestcoins = require('./nestcoins');
const history = require('./history');
const { localDate } = require('../utils/time');

// A stored streak only counts if it was continued today or yesterday
function liveStreak(lastDate, count) {
  return lastDate === localDate(0) || lastDate === localDate(-1) ? count || 0 : 0;
}

function puzzleStats(userId) {
  const today = localDate(0);
  const puzzles = Object.entries(history.allPuzzles()).filter(([date]) => date <= today);
  const s = db.read(d => d.puzzleStreaks?.[userId]) || {};
  return {
    solved: puzzles.filter(([, p]) => p.solvedBy?.includes(userId)).length,
    total: puzzles.length,
    streak: liveStreak(s.lastDate, s.current),
    best: s.best || 0,
  };
}

function nestwordStats(userId) {
  let played = 0;
  let solved = 0;
  let triesOnSolved = 0;
  let firstTry = 0; // solved with the very first guess
  let lastTry = 0; // solved with the last allowed guess
  for (const day of Object.values(history.allNestwordDays())) {
    const tries = day.guesses?.[userId];
    if (!tries) continue;
    played++;
    if (day.solvedBy?.includes(userId)) {
      solved++;
      triesOnSolved += tries;
      if (tries === 1) firstTry++;
      if (day.attempts && tries === day.attempts) lastTry++;
    }
  }
  const u = db.read(d => d.nestwordUsers?.[userId]) || {};
  return {
    played,
    solved,
    winRate: played ? Math.round((solved / played) * 100) : 0,
    avgTries: solved ? (triesOnSolved / solved).toFixed(1) : '–',
    firstTry,
    lastTry,
    streak: liveStreak(u.lastDate, u.streakCount),
    best: Math.max(u.bestStreak || 0, u.streakCount || 0),
  };
}

function eventStats(guildId, userId) {
  const events = history.allEvents(guildId);
  return {
    joined: events.filter(e => e.participants?.includes(userId)).length,
    won: events.filter(e => e.winnerId === userId).length,
  };
}

function coffeeStats(guildId, userId) {
  const s = db.read(d => d.coffee?.[guildId]?.[userId]);
  const summary = require('../commands/coffee').getCoffeeSummary(guildId, userId);
  return {
    total: s?.total || 0,
    today: summary?.today || 0,
    streak: summary?.streak || 0,
    bestStreak: s?.bestStreak || 0,
    given: s?.given || 0,
    received: s?.received || 0,
    favorite: summary?.favorite || null,
    drinksTried: Object.keys(s?.drinks || {}).length,
  };
}

/** Everything about a member in one object. */
function getUserStats(guildId, userId) {
  const balances = nestcoins
    .getAllBalances(guildId)
    .filter(e => e[1] > 0)
    .sort((a, b) => b[1] - a[1]);
  const rankIndex = balances.findIndex(e => e[0] === userId);

  return {
    balance: nestcoins.getBalance(guildId, userId),
    rank: rankIndex === -1 ? null : rankIndex + 1,
    rankedCount: balances.length,
    puzzle: puzzleStats(userId),
    nestword: nestwordStats(userId),
    events: eventStats(guildId, userId),
    coffee: coffeeStats(guildId, userId),
    gags: db.read(d => d.gagStats?.[guildId]?.[userId]) || { received: 0, given: 0 },
    duels: db.read(d => d.duelStats?.[guildId]?.[userId]) || { wins: 0, losses: 0, ties: 0, coinsWon: 0 },
    halloween: db.read(d => d.halloween?.[guildId]?.users?.[userId]) || { treats: 0, tricks: 0, years: [] },
    pictures: db.read(d => d.pictracker?.[guildId]?.users?.[userId]) || 0,
    memories: (db.read(d => d.memories?.[guildId]?.[userId]) || []).length,
  };
}

module.exports = { getUserStats };
