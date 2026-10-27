// Streak reward rules for Puzzle and NestWord. Admins switch between them
// with `/settings streak` (stored per server, see services/settings.js).
//
//   'capped'     (new, default): +10% per streak day after the first, capped at
//                +50% (reached on day 6), plus one-time milestone bonuses.
//   'multiplier' (old): reward × streak days, no limit (day 30 = 30× the reward).
const STREAK_BONUS_PER_DAY = 0.1;
const STREAK_BONUS_MAX = 0.5;
const STREAK_MILESTONES = { 7: 25, 14: 50, 30: 100, 100: 300 };

const STREAK_MODES = {
  capped: {
    label: 'New: +10% per day, max +50%, milestone bonuses',
    short: '+10% per day, up to +50%',
  },
  multiplier: {
    label: 'Old: reward × streak days (no limit)',
    short: 'reward × streak days',
  },
};

/**
 * Coins for a solve with a given streak.
 * Returns { total, bonus, bonusPct, milestone, mode }.
 */
function streakReward(base, streakDays, mode = 'capped') {
  const days = Math.max(streakDays, 1);

  if (mode === 'multiplier') {
    const total = base * days;
    return {
      total,
      bonus: total - base,
      bonusPct: days - 1,
      milestone: 0,
      mode,
    };
  }

  const bonusPct = Math.min(
    (days - 1) * STREAK_BONUS_PER_DAY,
    STREAK_BONUS_MAX,
  );
  const bonus = Math.round(base * bonusPct);
  const milestone = STREAK_MILESTONES[days] || 0;
  return {
    total: base + bonus + milestone,
    bonus,
    bonusPct,
    milestone,
    mode: 'capped',
  };
}

/** The text shown after a solve, e.g. "🔥 5-day streak! +40% bonus (+12)". */
function streakMessage(streakDays, r) {
  if (streakDays <= 1) return '';
  if (r.mode === 'multiplier') {
    return `🔥 ${streakDays}-day streak! Your reward is multiplied by **${streakDays}**!`;
  }
  let msg =
    `🔥 ${streakDays}-day streak! +${Math.round(r.bonusPct * 100)}% bonus (**+${r.bonus}**)` +
    (r.bonusPct >= STREAK_BONUS_MAX ? ' (max)' : '');
  if (r.milestone) {
    msg += `\n🏅 **${streakDays}-day milestone!** Extra **${r.milestone}** coins!`;
  }
  return msg;
}

/** One sentence explaining the active rule, for /help and announcements. */
function describeStreakRule(mode = 'capped') {
  return mode === 'multiplier'
    ? 'Solving on consecutive days **multiplies** your reward by the streak length (day 5 = 5×).'
    : 'Solving on consecutive days gives **+10% per day** (up to +50%), plus big one-time bonuses on day 7, 14, 30 and 100.';
}

module.exports = {
  STREAK_MODES,
  streakReward,
  streakMessage,
  describeStreakRule,
};
