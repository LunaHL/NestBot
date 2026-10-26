// Shared streak reward rule for Puzzle and NestWord:
// +10% per streak day after the first, capped at +50% (reached on day 6),
// plus one-time bonuses when hitting a milestone.
const STREAK_BONUS_PER_DAY = 0.1;
const STREAK_BONUS_MAX = 0.5;
const STREAK_MILESTONES = { 7: 25, 14: 50, 30: 100, 100: 300 };

function streakReward(base, streakDays) {
  const bonusPct = Math.min(Math.max(streakDays - 1, 0) * STREAK_BONUS_PER_DAY, STREAK_BONUS_MAX);
  const bonus = Math.round(base * bonusPct);
  const milestone = STREAK_MILESTONES[streakDays] || 0;
  return { total: base + bonus + milestone, bonus, bonusPct, milestone };
}

/** The text shown after a solve, e.g. "🔥 5-day streak! +40% bonus (+12)". */
function streakMessage(streakDays, r) {
  let msg = '';
  if (streakDays > 1) {
    msg =
      `🔥 ${streakDays}-day streak! +${Math.round(r.bonusPct * 100)}% bonus (**+${r.bonus}**)` +
      (r.bonusPct >= STREAK_BONUS_MAX ? ' (max)' : '');
  }
  if (r.milestone) msg += `\n🏅 **${streakDays}-day milestone!** Extra **${r.milestone}** coins!`;
  return msg;
}

module.exports = { streakReward, streakMessage };
