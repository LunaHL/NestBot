// Achievements: unlocked automatically from a member's stats, each with a
// small coin reward. Add new ones to the list below; `check` gets the result
// of stats.getUserStats(). Secret ones show as ❓ until unlocked.
const db = require('../utils/db');
const nestcoins = require('./nestcoins');
const { getUserStats } = require('./stats');

const CATEGORIES = {
  puzzle: '🧩 Puzzles',
  nestword: '🟩 NestWord',
  coffee: '☕ Café',
  social: '⚔️ Tournaments & Duels',
  gag: '🔇 Gags',
  misc: '✨ Other',
  halloween: '🎃 Halloween',
};

const ACHIEVEMENTS = [
  // 🧩 Puzzles
  { id: 'puzzle_1', cat: 'puzzle', emoji: '🧩', name: 'Puzzle Beginner', desc: 'Solve your first puzzle', reward: 10, check: s => s.puzzle.solved >= 1 },
  { id: 'puzzle_10', cat: 'puzzle', emoji: '🧠', name: 'Puzzle Solver', desc: 'Solve 10 puzzles', reward: 25, check: s => s.puzzle.solved >= 10 },
  { id: 'puzzle_50', cat: 'puzzle', emoji: '🎓', name: 'Puzzle Master', desc: 'Solve 50 puzzles', reward: 100, check: s => s.puzzle.solved >= 50 },
  { id: 'puzzle_streak_7', cat: 'puzzle', emoji: '📅', name: 'Week of Wits', desc: 'Reach a 7-day puzzle streak', reward: 25, check: s => s.puzzle.best >= 7 },
  { id: 'puzzle_streak_30', cat: 'puzzle', emoji: '🌟', name: 'Unstoppable Mind', desc: 'Reach a 30-day puzzle streak', reward: 100, check: s => s.puzzle.best >= 30 },

  // 🟩 NestWord
  { id: 'word_1', cat: 'nestword', emoji: '🟩', name: 'First Word', desc: 'Solve your first NestWord', reward: 10, check: s => s.nestword.solved >= 1 },
  { id: 'word_25', cat: 'nestword', emoji: '✍️', name: 'Wordsmith', desc: 'Solve 25 NestWords', reward: 50, check: s => s.nestword.solved >= 25 },
  { id: 'word_100', cat: 'nestword', emoji: '📚', name: 'Living Dictionary', desc: 'Solve 100 NestWords', reward: 150, check: s => s.nestword.solved >= 100 },
  { id: 'word_streak_7', cat: 'nestword', emoji: '📅', name: 'Word Week', desc: 'Reach a 7-day NestWord streak', reward: 25, check: s => s.nestword.best >= 7 },
  { id: 'word_first_try', cat: 'nestword', emoji: '🔮', name: 'Mind Reader', desc: 'Solve a NestWord on the first guess', reward: 50, check: s => s.nestword.firstTry >= 1 },
  { id: 'word_clutch', cat: 'nestword', emoji: '😮‍💨', name: 'Clutch', desc: 'Solve a NestWord with your very last guess', reward: 15, check: s => s.nestword.lastTry >= 1 },

  // ☕ Café
  { id: 'coffee_1', cat: 'coffee', emoji: '☕', name: 'First Sip', desc: 'Have your first coffee', reward: 5, check: s => s.coffee.total >= 1 },
  { id: 'coffee_50', cat: 'coffee', emoji: '🪑', name: 'Regular', desc: 'Have 50 coffees', reward: 25, check: s => s.coffee.total >= 50 },
  { id: 'coffee_200', cat: 'coffee', emoji: '👑', name: 'Caffeine Royalty', desc: 'Have 200 coffees', reward: 75, check: s => s.coffee.total >= 200 },
  { id: 'coffee_limit', cat: 'coffee', emoji: '⚡', name: 'Overcaffeinated', desc: 'Get cut off by the café for the day', reward: 10, check: s => s.coffee.today >= 6 },
  { id: 'coffee_streak_7', cat: 'coffee', emoji: '🌅', name: 'Daily Ritual', desc: 'Have coffee 7 days in a row', reward: 20, check: s => s.coffee.bestStreak >= 7 },
  { id: 'coffee_gift_10', cat: 'coffee', emoji: '🎁', name: "Barista's Friend", desc: 'Gift 10 coffees', reward: 25, check: s => s.coffee.given >= 10 },
  { id: 'coffee_menu', cat: 'coffee', emoji: '📋', name: 'Tried Everything', desc: 'Try every drink on the regular menu', reward: 50, check: s => s.coffee.triedWholeMenu },
  { id: 'coffee_decaf', cat: 'coffee', emoji: '😐', name: 'Why Though', desc: 'Order a decaf', reward: 1, secret: true, check: s => s.coffee.hadDecaf },

  // ⚔️ Tournaments & Duels
  { id: 'event_join', cat: 'social', emoji: '🎟️', name: 'Contender', desc: 'Join a tournament', reward: 10, check: s => s.events.joined >= 1 },
  { id: 'event_win', cat: 'social', emoji: '🏆', name: 'Champion', desc: 'Win a tournament', reward: 100, check: s => s.events.won >= 1 },
  { id: 'duel_win_1', cat: 'social', emoji: '🤺', name: 'First Blood', desc: 'Win a duel', reward: 15, check: s => s.duels.wins >= 1 },
  { id: 'duel_win_10', cat: 'social', emoji: '⚔️', name: 'Duelist', desc: 'Win 10 duels', reward: 50, check: s => s.duels.wins >= 10 },

  // 🔇 Gags
  { id: 'gagged_1', cat: 'gag', emoji: '🤐', name: 'Shhh', desc: 'Get gagged', reward: 5, check: s => s.gags.received >= 1 },
  { id: 'gagged_10', cat: 'gag', emoji: '🔇', name: 'Professional Mute', desc: 'Get gagged 10 times', reward: 25, check: s => s.gags.received >= 10 },
  { id: 'gagger_10', cat: 'gag', emoji: '🤫', name: 'Silencer', desc: 'Gag others 10 times', reward: 25, check: s => s.gags.given >= 10 },

  // ✨ Other
  { id: 'rich_1000', cat: 'misc', emoji: '💰', name: 'Nest Egg', desc: 'Have 1,000 NestCoins at once', reward: 25, check: s => s.balance >= 1000 },
  { id: 'memory_1', cat: 'misc', emoji: '🧠', name: 'Open Book', desc: 'Tell NestBot something to remember', reward: 5, check: s => s.memories >= 1 },

  // 🎃 Halloween
  { id: 'halloween', cat: 'halloween', emoji: '🎃', name: 'Trick or Treater', desc: 'Trick-or-treat on Halloween', reward: 25, check: s => s.halloween.treats + s.halloween.tricks >= 1 },
  { id: 'halloween_cursed', cat: 'halloween', emoji: '👻', name: 'Cursed', desc: 'Get tricked 3 times on Halloween', reward: 15, secret: true, check: s => s.halloween.tricks >= 3 },
];

function getUnlocked(guildId, userId) {
  return db.read(d => d.achievements?.[guildId]?.[userId]) || {};
}

// Extra coffee facts the achievements need
function withCoffeeExtras(guildId, userId, stats) {
  const { MENU } = require('../commands/coffee');
  const drinks = db.read(d => d.coffee?.[guildId]?.[userId]?.drinks) || {};
  const regular = Object.entries(MENU).filter(([, d]) => !d.halloween).map(([k]) => k);
  stats.coffee.triedWholeMenu = regular.every(k => drinks[k] > 0);
  stats.coffee.hadDecaf = (drinks.decaf || 0) > 0;
  return stats;
}

/**
 * Unlock everything this member has earned but not received yet, pay the
 * rewards, and return the newly unlocked achievements.
 */
function checkAchievements(guildId, userId) {
  const have = getUnlocked(guildId, userId);
  const stats = withCoffeeExtras(guildId, userId, getUserStats(guildId, userId));
  const fresh = ACHIEVEMENTS.filter(a => !have[a.id] && a.check(stats));
  if (!fresh.length) return [];

  db.perform(d => {
    d.achievements ||= {};
    d.achievements[guildId] ||= {};
    const mine = (d.achievements[guildId][userId] ||= {});
    for (const a of fresh) mine[a.id] = Date.now();
  });
  const coins = fresh.reduce((sum, a) => sum + a.reward, 0);
  if (coins) nestcoins.addCoins(guildId, userId, coins);
  return fresh;
}

/**
 * Check the given members after a command and post any unlocks as a
 * follow-up message. Never throws, so it can't break the command itself.
 */
async function announce(interaction, userIds) {
  try {
    const guildId = interaction.guildId;
    const lines = [];
    const mentioned = [];
    for (const userId of [...new Set(userIds.filter(Boolean))]) {
      const fresh = checkAchievements(guildId, userId);
      if (!fresh.length) continue;
      mentioned.push(userId);
      for (const a of fresh) {
        lines.push(`🏅 <@${userId}> unlocked ${a.emoji} **${a.name}** (${a.desc}) **+${a.reward}** coins`);
      }
    }
    if (!lines.length) return;

    // Discord messages max out at 2000 characters
    let text = lines.join('\n');
    if (text.length > 1900) text = lines.slice(0, 12).join('\n') + `\n…and ${lines.length - 12} more! See \`/achievements\`.`;
    await interaction.followUp({ content: text, allowedMentions: { users: mentioned } });
  } catch (e) {
    console.error('[Achievements] announce failed:', e);
  }
}

module.exports = { ACHIEVEMENTS, CATEGORIES, getUnlocked, checkAchievements, announce };
