// Helping people discover NestBot's features without /help:
// - forPrompt(): a compact guide for NestBot's AI, added when someone asks
//   her how something works ("@NestBot how do I plan a movie night?")
// - maybeTip(): now and then a short private tip after a command
//   (/settings tips frequency:)
// - weekly "💡 Did you know?" post in the hub channel (/settings hub)
// Everything is built from the /help texts (config/help.js), so it stays
// up to date by itself. The tips themselves are in config/tips.js.
const { CATEGORIES, COMMANDS } = require('../config/help');
const TIPS = require('../config/tips');
const db = require('../utils/db');
const { getSetting } = require('./settings');

/** Categories and commands that are on right now (holidays, switched-off games). */
function visibleCategories() {
  const { loadCommands } = require('../utils/commands');
  const hidden = new Set(
    loadCommands()
      .filter(c => c.season && !c.season())
      .map(c => c.data.name),
  );
  return CATEGORIES.filter(c => !c.visible || c.visible()).map(c => ({
    ...c,
    commands: (c.commands || []).filter(n => !hidden.has(n)),
  }));
}

const textOf = (t, guildId) => (typeof t === 'function' ? t(guildId) : t);
const plain = s =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .trim();

// ---------- For the AI ----------

/** All features and commands as short plain text. */
function featureGuide(guildId) {
  const lines = [];
  for (const cat of visibleCategories()) {
    lines.push(`\n## ${cat.name}: ${plain(cat.intro)}`);
    for (const name of cat.commands || []) {
      const c = COMMANDS[name];
      if (!c) continue;
      lines.push(
        `- /${name}: ${plain(c.explain)}${c.tips ? ` Tip: ${plain(c.tips)}` : ''}${c.admin ? ' (some parts admins only)' : ''}`,
      );
    }
    for (const f of cat.features || [])
      lines.push(`- ${f.name}: ${plain(textOf(f.text, guildId))}`);
  }
  return lines.join('\n');
}

// Words that suggest a question about the bot itself
const QUESTION =
  /\b(how|what can|what does|where|which command|command|commands|help|explain|wie|was kann|was macht|wo|welche?r? befehl|befehle?|hilfe|erklär|funktionier|feature|features)\b/i;
const TOPICS =
  /\b(coins?|daily|shop|buy|kauf|drinks?|round|runde|wheel|rad|gag|blindfold|augenbinde|nickname|spitzname|profile?|leaderboard|rangliste|achievements?|puzzle|nestword|wordle|duel|duell|tournament|turnier|event|watch|movie|film|filmabend|watchlist|group|gruppe|birthday|geburtstag|memory|roast|poem|mood|settings?)\b/i;

/** Is this message asking how NestBot / a feature works? */
function looksLikeQuestion(text) {
  const t = String(text || '');
  return (
    QUESTION.test(t) ||
    (TOPICS.test(t) && t.includes('?')) ||
    /(^|\s)\/[a-z]+/.test(t)
  );
}

/** Extra system prompt with the feature guide, or '' if it's not needed. */
function forPrompt(message) {
  if (!looksLikeQuestion(message.content)) return '';
  return (
    '\n\n[NESTBOT FEATURES: use this to answer questions about what you can do and how]\n' +
    featureGuide(message.guild.id) +
    '\n\nWhen someone asks how something works: answer briefly in your own voice, name the exact command (e.g. `/watch plan when:friday 21:00`) or button, and only mention features from this list. If something isn’t in the list, say NestBot can’t do that (yet). For the full list point to `/help` or the menu in the hub channel.'
  );
}

// ---------- Tips after commands ----------

const FREQUENCIES = {
  off: { label: 'Off', chance: 0 },
  rare: { label: 'Rarely (about 1 in 10)', chance: 0.1 },
  sometimes: { label: 'Sometimes (about 1 in 5)', chance: 0.2 },
  often: { label: 'Often (about 1 in 3)', chance: 0.33 },
};
const TIP_COOLDOWN_MS = 15 * 60000; // at most one tip per person every 15 min
const lastTip = new Map(); // userId → time

/** A tip that fits the command just used, or null. */
function pickTip(commandName, sub) {
  const list = [
    ...(TIPS[`${commandName} ${sub}`] || []),
    ...(TIPS[commandName] || []),
  ];
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

/** After a command: maybe send a short private tip. */
async function maybeTip(interaction, random = Math.random) {
  if (!interaction.guildId || !(interaction.replied || interaction.deferred))
    return;
  const freq =
    FREQUENCIES[getSetting(interaction.guildId, 'tipFrequency')] ||
    FREQUENCIES.rare;
  if (!freq.chance || random() >= freq.chance) return;
  const userId = interaction.user.id;
  if (Date.now() - (lastTip.get(userId) || 0) < TIP_COOLDOWN_MS) return;
  let sub = null;
  try {
    sub = interaction.options?.getSubcommand?.(false) || null;
  } catch {
    sub = null;
  }
  const tip = pickTip(interaction.commandName, sub);
  if (!tip) return;
  lastTip.set(userId, Date.now());
  await interaction
    .followUp({ content: `💡 ${tip}`, flags: 64 })
    .catch(() => {});
}

// ---------- Weekly "Did you know?" ----------

/** Everything worth a weekly post: features and commands, in /help order. */
function weeklyItems(guildId) {
  const items = [];
  for (const cat of visibleCategories()) {
    if (
      cat.id === 'help' ||
      cat.id === 'admin' ||
      cat.id === 'halloween' ||
      cat.id === 'holidays'
    )
      continue;
    for (const f of cat.features || [])
      items.push({ title: f.name, text: textOf(f.text, guildId), cat });
    for (const name of cat.commands || []) {
      const c = COMMANDS[name];
      if (c && !(c.admin || []).includes('*'))
        items.push({
          title: `/${name}`,
          text: c.explain + (c.tips ? `\n\n💡 ${c.tips}` : ''),
          cat,
        });
    }
  }
  return items;
}

/** The next weekly item for this server (and remember it). */
function nextWeekly(guildId) {
  const items = weeklyItems(guildId);
  let index = 0;
  db.perform(d => {
    d.guide ||= {};
    d.guide[guildId] ||= {};
    index = (d.guide[guildId].weeklyIndex || 0) % items.length;
    d.guide[guildId].weeklyIndex = index + 1;
  });
  return items[index];
}

module.exports = {
  FREQUENCIES,
  featureGuide,
  looksLikeQuestion,
  forPrompt,
  pickTip,
  maybeTip,
  weeklyItems,
  nextWeekly,
};
