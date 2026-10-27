// Achievements: unlocked automatically from a member's stats, each with a
// small coin reward. Add new ones to the list below; `check` gets the result
// of stats.getUserStats(). Secret ones show as ❓ until unlocked.
const db = require('../utils/db');
const nestcoins = require('./nestcoins');
const { getUserStats } = require('./stats');
const { CAFFEINE_LIMIT, ALCOHOL_LIMIT } = require('../config/drinksMenu');

const CATEGORIES = {
  puzzle: '🧩 Puzzles',
  nestword: '🟩 NestWord',
  wordle: '🟩 Wordle app',
  drinks: '🍹 Drinks',
  social: '⚔️ Tournaments & Duels',
  gag: '🔇 Gags',
  misc: '✨ Other',
  halloween: '🎃 Halloween',
};

const ACHIEVEMENTS = [
  // 🧩 Puzzles
  {
    id: 'puzzle_1',
    cat: 'puzzle',
    emoji: '🧩',
    name: 'Puzzle Beginner',
    desc: 'Solve your first puzzle',
    reward: 10,
    check: s => s.puzzle.solved >= 1,
  },
  {
    id: 'puzzle_10',
    cat: 'puzzle',
    emoji: '🧠',
    name: 'Puzzle Solver',
    desc: 'Solve 10 puzzles',
    reward: 25,
    check: s => s.puzzle.solved >= 10,
  },
  {
    id: 'puzzle_50',
    cat: 'puzzle',
    emoji: '🎓',
    name: 'Puzzle Master',
    desc: 'Solve 50 puzzles',
    reward: 100,
    check: s => s.puzzle.solved >= 50,
  },
  {
    id: 'puzzle_streak_7',
    cat: 'puzzle',
    emoji: '📅',
    name: 'Week of Wits',
    desc: 'Reach a 7-day puzzle streak',
    reward: 25,
    check: s => s.puzzle.best >= 7,
  },
  {
    id: 'puzzle_streak_30',
    cat: 'puzzle',
    emoji: '🌟',
    name: 'Unstoppable Mind',
    desc: 'Reach a 30-day puzzle streak',
    reward: 100,
    check: s => s.puzzle.best >= 30,
  },

  // 🟩 NestWord
  {
    id: 'word_1',
    cat: 'nestword',
    emoji: '🟩',
    name: 'First Word',
    desc: 'Solve your first NestWord',
    reward: 10,
    check: s => s.nestword.solved >= 1,
  },
  {
    id: 'word_25',
    cat: 'nestword',
    emoji: '✍️',
    name: 'Wordsmith',
    desc: 'Solve 25 NestWords',
    reward: 50,
    check: s => s.nestword.solved >= 25,
  },
  {
    id: 'word_100',
    cat: 'nestword',
    emoji: '📚',
    name: 'Living Dictionary',
    desc: 'Solve 100 NestWords',
    reward: 150,
    check: s => s.nestword.solved >= 100,
  },
  {
    id: 'word_streak_7',
    cat: 'nestword',
    emoji: '📅',
    name: 'Word Week',
    desc: 'Reach a 7-day NestWord streak',
    reward: 25,
    check: s => s.nestword.best >= 7,
  },
  {
    id: 'word_first_try',
    cat: 'nestword',
    emoji: '🔮',
    name: 'Mind Reader',
    desc: 'Solve a NestWord on the first guess',
    reward: 50,
    check: s => s.nestword.firstTry >= 1,
  },
  {
    id: 'word_clutch',
    cat: 'nestword',
    emoji: '😮‍💨',
    name: 'Clutch',
    desc: 'Solve a NestWord with your very last guess',
    reward: 15,
    check: s => s.nestword.lastTry >= 1,
  },

  // 🍹 Drinks (ids starting with "coffee_" are from before /drinks existed;
  // they're kept so nobody loses an unlocked achievement)
  {
    id: 'coffee_1',
    cat: 'drinks',
    emoji: '☕',
    name: 'First Sip',
    desc: 'Have your first drink',
    reward: 5,
    check: s => s.drinks.total >= 1,
  },
  {
    id: 'coffee_50',
    cat: 'drinks',
    emoji: '🪑',
    name: 'Regular',
    desc: 'Have 50 drinks',
    reward: 25,
    check: s => s.drinks.total >= 50,
  },
  {
    id: 'coffee_200',
    cat: 'drinks',
    emoji: '👑',
    name: 'Caffeine Royalty',
    desc: 'Have 200 coffees',
    reward: 75,
    check: s => (s.drinks.byCategory.coffee || 0) >= 200,
  },
  {
    id: 'coffee_limit',
    cat: 'drinks',
    emoji: '⚡',
    name: 'Overcaffeinated',
    desc: 'Reach the daily caffeine limit',
    reward: 10,
    check: s => s.drinks.todayCaffeine >= CAFFEINE_LIMIT,
  },
  {
    id: 'coffee_streak_7',
    cat: 'drinks',
    emoji: '🌅',
    name: 'Daily Ritual',
    desc: 'Have a drink 7 days in a row',
    reward: 20,
    check: s => s.drinks.bestStreak >= 7,
  },
  {
    id: 'coffee_gift_10',
    cat: 'drinks',
    emoji: '🎁',
    name: "Barista's Friend",
    desc: 'Gift 10 drinks',
    reward: 25,
    check: s => s.drinks.given >= 10,
  },
  {
    id: 'coffee_menu',
    cat: 'drinks',
    emoji: '📋',
    name: 'Coffee Connoisseur',
    desc: 'Try every coffee on the menu',
    reward: 50,
    check: s => s.drinks.triedAllCoffee,
  },
  {
    id: 'drinks_menu',
    cat: 'drinks',
    emoji: '🗺️',
    name: 'Tried Everything',
    desc: 'Try every drink on the regular menu',
    reward: 100,
    check: s => s.drinks.triedEverything,
  },
  {
    id: 'tea_10',
    cat: 'drinks',
    emoji: '🫖',
    name: 'Tea Time',
    desc: 'Have 10 teas',
    reward: 15,
    check: s => (s.drinks.byCategory.tea || 0) >= 10,
  },
  {
    id: 'blacktea_25',
    cat: 'drinks',
    emoji: '🖤',
    name: 'Black Tea Devotee',
    desc: 'Have 25 black teas',
    reward: 40,
    check: s => s.drinks.blackTea >= 25,
  },
  {
    id: 'cocoa_1',
    cat: 'drinks',
    emoji: '🍫',
    name: 'Cozy',
    desc: 'Have a hot chocolate',
    reward: 5,
    check: s => (s.drinks.byCategory.chocolate || 0) >= 1,
  },
  {
    id: 'bar_1',
    cat: 'drinks',
    emoji: '🥂',
    name: 'Cheers!',
    desc: 'Have your first drink at the bar',
    reward: 5,
    check: s => s.drinks.alcoholTotal >= 1,
  },
  {
    id: 'bar_limit',
    cat: 'drinks',
    emoji: '🥴',
    name: 'Last Call',
    desc: 'Get cut off at the bar for the night',
    reward: 10,
    check: s => s.drinks.todayAlcohol >= ALCOHOL_LIMIT,
  },
  {
    id: 'coffee_decaf',
    cat: 'drinks',
    emoji: '😐',
    name: 'Why Though',
    desc: 'Order a decaf',
    reward: 1,
    secret: true,
    check: s => s.drinks.hadDecaf,
  },

  // 🟩 Wordle app
  {
    id: 'wordleapp_1',
    cat: 'wordle',
    emoji: '🟩',
    name: 'Daily Wordler',
    desc: 'Play the Wordle app',
    reward: 5,
    check: s => s.wordle.played >= 1,
  },
  {
    id: 'wordleapp_crown',
    cat: 'wordle',
    emoji: '👑',
    name: 'Crowned',
    desc: 'Have the best Wordle score of the day',
    reward: 15,
    check: s => s.wordle.crowns >= 1,
  },
  {
    id: 'wordleapp_two',
    cat: 'wordle',
    emoji: '🎯',
    name: 'Sharp Shooter',
    desc: 'Solve the Wordle in 2 guesses',
    reward: 25,
    check: s => (s.wordle.dist[2] || 0) >= 1,
  },
  {
    id: 'wordleapp_streak_30',
    cat: 'wordle',
    emoji: '📆',
    name: 'Wordle Month',
    desc: 'Solve the Wordle 30 days in a row',
    reward: 75,
    check: s => s.wordle.bestStreak >= 30,
  },
  {
    id: 'wordleapp_one',
    cat: 'wordle',
    emoji: '🤯',
    name: 'Hole in One',
    desc: 'Solve the Wordle on the first guess',
    reward: 100,
    secret: true,
    check: s => (s.wordle.dist[1] || 0) >= 1,
  },

  // ⚔️ Tournaments & Duels
  {
    id: 'event_join',
    cat: 'social',
    emoji: '🎟️',
    name: 'Contender',
    desc: 'Join a tournament',
    reward: 10,
    check: s => s.events.joined >= 1,
  },
  {
    id: 'event_win',
    cat: 'social',
    emoji: '🏆',
    name: 'Champion',
    desc: 'Win a tournament',
    reward: 100,
    check: s => s.events.won >= 1,
  },
  {
    id: 'duel_win_1',
    cat: 'social',
    emoji: '🤺',
    name: 'First Blood',
    desc: 'Win a duel',
    reward: 15,
    check: s => s.duels.wins >= 1,
  },
  {
    id: 'duel_win_10',
    cat: 'social',
    emoji: '⚔️',
    name: 'Duelist',
    desc: 'Win 10 duels',
    reward: 50,
    check: s => s.duels.wins >= 10,
  },

  // 🔇 Gags
  {
    id: 'gagged_1',
    cat: 'gag',
    emoji: '🤐',
    name: 'Shhh',
    desc: 'Get gagged',
    reward: 5,
    check: s => s.gags.received >= 1,
  },
  {
    id: 'gagged_10',
    cat: 'gag',
    emoji: '🔇',
    name: 'Professional Mute',
    desc: 'Get gagged 10 times',
    reward: 25,
    check: s => s.gags.received >= 10,
  },
  {
    id: 'gagger_10',
    cat: 'gag',
    emoji: '🤫',
    name: 'Silencer',
    desc: 'Gag others 10 times',
    reward: 25,
    check: s => s.gags.given >= 10,
  },

  // ✨ Other
  {
    id: 'rich_1000',
    cat: 'misc',
    emoji: '💰',
    name: 'Nest Egg',
    desc: 'Have 1,000 NestCoins at once',
    reward: 25,
    check: s => s.balance >= 1000,
  },
  {
    id: 'memory_1',
    cat: 'misc',
    emoji: '🧠',
    name: 'Open Book',
    desc: 'Tell NestBot something to remember',
    reward: 5,
    check: s => s.memories >= 1,
  },

  // 🎃 Halloween
  {
    id: 'halloween',
    cat: 'halloween',
    emoji: '🎃',
    name: 'Trick or Treater',
    desc: 'Trick-or-treat on Halloween',
    reward: 25,
    check: s => s.halloween.treats + s.halloween.tricks >= 1,
  },
  {
    id: 'halloween_cursed',
    cat: 'halloween',
    emoji: '👻',
    name: 'Cursed',
    desc: 'Get tricked 3 times on Halloween',
    reward: 15,
    secret: true,
    check: s => s.halloween.tricks >= 3,
  },
];

function getUnlocked(guildId, userId) {
  return db.read(d => d.achievements?.[guildId]?.[userId]) || {};
}

/**
 * Unlock everything this member has earned but not received yet, pay the
 * rewards, and return the newly unlocked achievements.
 */
function checkAchievements(guildId, userId) {
  const have = getUnlocked(guildId, userId);
  const stats = getUserStats(guildId, userId);
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
 * Check the given members and post any unlocks, as a follow-up to a command
 * or as a message in a channel. Never throws, so it can't break the caller.
 */
async function announce(target, userIds) {
  try {
    // target: a slash command interaction (answers with followUp) or a
    // channel (posts a normal message), e.g. for the Wordle app results
    const guildId = target.guildId ?? target.guild?.id;
    const send =
      typeof target.followUp === 'function'
        ? msg => target.followUp(msg)
        : msg => target.send(msg);
    const lines = [];
    const mentioned = [];
    for (const userId of [...new Set(userIds.filter(Boolean))]) {
      const fresh = checkAchievements(guildId, userId);
      if (!fresh.length) continue;
      mentioned.push(userId);
      for (const a of fresh) {
        lines.push(
          `🏅 <@${userId}> unlocked ${a.emoji} **${a.name}** (${a.desc}) **+${a.reward}** coins`,
        );
      }
    }
    if (!lines.length) return;

    // Discord messages max out at 2000 characters
    let text = lines.join('\n');
    if (text.length > 1900)
      text =
        lines.slice(0, 12).join('\n') +
        `\n…and ${lines.length - 12} more! See \`/achievements\`.`;
    await send({ content: text, allowedMentions: { users: mentioned } });
  } catch (e) {
    console.error('[Achievements] announce failed:', e);
  }
}

module.exports = {
  ACHIEVEMENTS,
  CATEGORIES,
  getUnlocked,
  checkAchievements,
  announce,
};
