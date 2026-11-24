// A ZIP of all bot data (src/data/), for the weekly backup DM and the backup
// in `npm run menu`. Doesn't load utils/db.js, so the menu can use it while
// the bot is running (every data file is written all-or-nothing, so each one
// in the ZIP is complete).
const { DATA_DIR } = require('./paths');
const { zipFolder } = require('./zip');

// Left out: backups/ (old copies), examples/ (in git), temp files, leftovers
function skip(rel, isDir) {
  const name = rel.split('/').at(-1);
  if (!rel.includes('/')) {
    if (isDir && ['backups', 'examples'].includes(name)) return true;
    if (name === 'README.md' || name === 'last-crash.txt') return true;
  }
  return /\.tmp$|\.broken-|\.imported-/.test(name);
}

/** { buffer, files } */
function zipData() {
  return zipFolder(DATA_DIR, skip);
}

module.exports = { zipData, skip };
