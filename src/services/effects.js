// Effects that shop items and wheel entries can have: gag someone, or give
// them a nickname for a while. Add new effects here; the shop and the wheel
// pick them up automatically (also in their "effect" choices).
const gag = require('./gag');
const nickname = require('./nickname');
const { duration } = require('../utils/ui');

const EFFECTS = {
  gag: {
    emoji: '🔇',
    label: 'Gag',
    describe: e => `Gags the target for ${duration(e.durationSec)}`,
    async apply(guild, { targetId, byId, effect }) {
      const info = gag.gagUser(guild.id, targetId, effect.durationSec, byId);
      const left = Math.round(
        ((info?.until || Date.now()) - Date.now()) / 1000,
      );
      const stacked = left > effect.durationSec + 5 ? ' (stacked)' : '';
      return {
        text: `🔇 <@${targetId}> is gagged for **${duration(Math.max(left, effect.durationSec))}**${stacked}.`,
      };
    },
  },
  nickname: {
    emoji: '🏷️',
    label: 'Nickname',
    describe: e =>
      `Renames the target to “${e.text || '???'}” for ${duration(e.durationSec)}`,
    async apply(guild, { targetId, byId, effect }) {
      const r = await nickname.apply(
        guild,
        targetId,
        effect.text || 'Victim of the Wheel',
        Math.max(1, Math.round(effect.durationSec / 60)),
        byId,
      );
      if (r.error === 'disabled')
        return { text: '🏷️ (Nicknames are switched off on this server.)' };
      if (r.error)
        return {
          text: '🏷️ (I can’t change that nickname: owner or a higher role.)',
        };
      return {
        text: `🏷️ <@${targetId}> is now called **${r.name}** for **${duration(effect.durationSec)}**.`,
      };
    },
  },
};

/** Choices for slash command options. */
const EFFECT_CHOICES = Object.entries(EFFECTS).map(([value, e]) => ({
  name: `${e.emoji} ${e.label}`,
  value,
}));

function describe(effect) {
  const e = effect && EFFECTS[effect.type];
  return e ? `${e.emoji} ${e.describe(effect)}` : null;
}

/** Apply an effect. Returns { text } (what happened) or null. */
async function applyEffect(guild, effect, { targetId, byId }) {
  const e = effect && EFFECTS[effect.type];
  if (!e) return null;
  return e.apply(guild, { targetId, byId, effect });
}

/** Old items stored the effect in the text: "… [effect:gag;duration:300]". */
function parseLegacy(text) {
  const m = String(text || '').match(/\[effect:(\w+);duration:(\d+)\]/i);
  const clean = String(text || '')
    .replace(/\s*\[effect:\w+;duration:\d+\]\s*/i, ' ')
    .trim();
  if (!m) return { text: clean, effect: null };
  return {
    text: clean,
    effect: { type: m[1].toLowerCase(), durationSec: Number(m[2]) },
  };
}

module.exports = {
  EFFECTS,
  EFFECT_CHOICES,
  describe,
  applyEffect,
  parseLegacy,
};
