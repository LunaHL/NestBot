// Whole features (and single subcommands) that can be switched on or off.
// A switched-off feature is invisible: its command isn't registered in
// Discord, and it's gone from /help, the hub menu, reminders, tips and
// NestBot's knowledge. All its data stays, so switching it back on brings
// everything back.
//
// Defaults: src/config/features.js. Admins override them in Discord with
// /settings features; "Back to file defaults" removes all overrides.
//
// Data: data.features = { nestword: true | false, … } (only the overrides)
//
// How a command uses it:
//   feature: 'gamble'                  the whole command
//   feature: ['watch', 'group']        only while ALL of them are on
//   subFeatures: { gift: 'drinkgift' } single subcommands (or groups)
// Background jobs: runEvery('…', 5, features.only('drop', tick))
const config = require('../config/features');

// Shown in /settings features, in this order. Group a and b are one select
// menu each (Discord allows 25 options per menu).
const FEATURES = {
  daily: { emoji: '💰', label: 'Daily coins', group: 'a' },
  gamble: { emoji: '🎲', label: 'Gamble', group: 'a' },
  drop: { emoji: '💰', label: 'Loot drops', group: 'a' },
  shop: { emoji: '🛒', label: 'Shop', group: 'a' },
  nicknames: { emoji: '🏷️', label: 'Paid nicknames', group: 'a' },
  wheel: { emoji: '🎡', label: 'Wheel', group: 'a' },
  drinkgift: { emoji: '🎁', label: 'Gifting drinks', group: 'a' },
  nestword: { emoji: '🟩', label: 'NestWord', group: 'a' },
  event: { emoji: '🏆', label: 'Tournaments', group: 'a' },
  duel: { emoji: '🤺', label: 'Duels', group: 'a' },
  achievements: { emoji: '🏅', label: 'Achievements', group: 'a' },
  gag: { emoji: '🔇', label: 'Gags', group: 'a' },
  blindfold: { emoji: '🙈', label: 'Blindfolds', group: 'a' },
  remind: { emoji: '⏰', label: 'Reminders', group: 'a' },
  suggest: { emoji: '💡', label: 'Ideas (/suggest)', group: 'a' },
  pictures: { emoji: '📸', label: 'Picture leaderboard', group: 'a' },
  ai: { emoji: '🤖', label: 'NestBot AI', group: 'b' },
  watch: { emoji: '🍿', label: 'Movie nights', group: 'b' },
  watchlist: { emoji: '📝', label: 'Watchlists', group: 'b' },
  group: { emoji: '👥', label: 'Groups', group: 'b' },
  halloween: { emoji: '🎃', label: 'Halloween', group: 'b' },
  christmas: { emoji: '🎄', label: 'Christmas', group: 'b' },
  easter: { emoji: '🐣', label: 'Easter', group: 'b' },
  newyear: { emoji: '🥂', label: 'New Year', group: 'b' },
  hub: { emoji: '🪺', label: 'Hub menu', group: 'b' },
  tips: { emoji: '💡', label: 'Tips after commands', group: 'b' },
  usermenu: { emoji: '🖱️', label: 'Right-click menu', group: 'b' },
};

const known = name =>
  Object.hasOwn(FEATURES, name) || Object.hasOwn(config, name);
const fileDefault = name => config[name] !== false;
// Required here, not at the top: utils/db loads the data file
const overrides = () => require('../utils/db').read(d => d.features) || {};

/** Is this feature on? Names that aren't features at all are always on. */
function on(name) {
  if (!known(name)) return true;
  const v = overrides()[name];
  return typeof v === 'boolean' ? v : fileDefault(name);
}

/** Switch a feature on or off (stored in the database). */
function set(name, value) {
  const db = require('../utils/db');
  db.perform(d => {
    d.features ||= {};
    // Same as the file says: no override needed
    if (!!value === fileDefault(name)) delete d.features[name];
    else d.features[name] = !!value;
  });
}

/** Back to src/config/features.js for everything. */
function reset() {
  require('../utils/db').perform(d => {
    delete d.features;
  });
}

/** Was this feature changed in Discord (differs from the file)? */
function isOverridden(name) {
  const v = overrides()[name];
  return typeof v === 'boolean' && v !== fileDefault(name);
}

/**
 * Is this on? spec: nothing (always), 'name', ['a', 'b'] (all of them on)
 * or a function that decides.
 */
function check(spec) {
  if (spec === undefined || spec === null) return true;
  if (typeof spec === 'string') return on(spec);
  if (Array.isArray(spec)) return spec.every(check);
  if (typeof spec === 'function') return !!spec();
  return true;
}

/** Is this subcommand (or subcommand group) of the command on? */
function subOn(cmd, name) {
  const subs = cmd?.subFeatures;
  if (!subs || !name || !Object.hasOwn(subs, name)) return true;
  return check(subs[name]);
}

/** Should this command be in Discord right now? (feature + season) */
function commandOn(cmd) {
  return check(cmd.feature) && (!cmd.season || !!cmd.season());
}

/** The command as Discord sees it, without its switched-off subcommands. */
function commandJson(cmd) {
  const json = cmd.data.toJSON();
  if (!cmd.subFeatures || !Array.isArray(json.options)) return { ...json };
  return {
    ...json,
    options: json.options.filter(
      o => (o.type !== 1 && o.type !== 2) || subOn(cmd, o.name),
    ),
  };
}

/**
 * May this slash command be used right now? Checks the command's feature and
 * the subcommand (and group) that was used. `group: false` skips the group,
 * for /admin, where the group is the admin tool and not the command's own.
 */
function interactionOn(cmd, interaction, { group = true } = {}) {
  if (!check(cmd?.feature)) return false;
  const names = [];
  try {
    names.push(interaction.options?.getSubcommand?.(false));
  } catch {
    // no subcommands
  }
  if (group)
    try {
      names.push(interaction.options?.getSubcommandGroup?.(false));
    } catch {
      // no groups
    }
  return names.every(n => subOn(cmd, n));
}

/** Wraps a background job: it only runs while the feature is on. */
function only(spec, fn) {
  return (...args) => (check(spec) ? fn(...args) : undefined);
}

module.exports = {
  FEATURES,
  on,
  set,
  reset,
  isOverridden,
  check,
  subOn,
  commandOn,
  commandJson,
  interactionOn,
  only,
};
