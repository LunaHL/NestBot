// Features admins can switch off completely (/settings features). A switched-
// off feature is invisible: its command isn't registered in Discord, and it's
// gone from /help, the hub menu, reminders, tips and NestBot's knowledge.
// All its data stays, so switching it back on brings everything back.
//
// Data: data.features = { nestword: true | false }
const db = require('../utils/db');

const FEATURES = {
  nestword: { emoji: '🟩', label: 'NestWord', default: false }, // off: the Wordle app does the same
};

/** Is this feature on? */
function on(name) {
  const v = db.read(d => d.features?.[name]);
  return v === undefined ? FEATURES[name]?.default !== false : !!v;
}

function set(name, value) {
  db.perform(d => {
    d.features ||= {};
    d.features[name] = !!value;
  });
}

module.exports = { FEATURES, on, set };
