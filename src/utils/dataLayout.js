// Which folder in src/data/ each part of the bot's data lives in.
// Every top-level key gets its own file: src/data/<folder>/<key>.json.
//
// To move a key to another folder, change it here and restart: the bot moves
// the file itself. Keys that aren't listed (new features) land in `other/`,
// so nothing is ever lost; add them here to give them a proper home.

const LAYOUT = {
  economy: [
    'nestcoins', // coins per server and member
    'dailyClaims', // /daily
    'shop',
    'shopNextId',
    'vouchers',
    'lootdrop',
    'nicknames', // paid nicknames that are active right now
    'nicknameStats',
  ],
  games: [
    'puzzles',
    'puzzleSettings',
    'puzzleStreaks',
    'nestwordDaily',
    'nestwordUsers',
    'wordleApp', // coins for the Discord Wordle app
    'scoreboardLastChecked',
    'events', // tournaments
    'eventNextId',
    'duelStats',
    'achievements',
  ],
  drinks: [
    'coffee', // all drink stats (old name, kept so nothing breaks)
  ],
  fun: [
    'wheels', // punishment wheel entries
    'wheel', // very old wheel format, moved into `wheels` on start
    'gags',
    'gagStats',
    'blindfolds',
    'blindfoldStats',
    'pictracker', // weekly picture leaderboard
  ],
  social: [
    'birthdays',
    'birthdayChannels',
    'birthdayLastChecked',
    'birthdayState',
    'suggestions',
    'reminders',
    'memories', // "@NestBot remember that …"
    'aiMood',
  ],
  movies: ['watch', 'watchlists', 'groups', 'seriesAlerts', 'numbering'],
  holidays: [
    'christmas',
    'easter',
    'halloween',
    'seasonStats', // advent, Secret Santa, egg collections …
    'holidaysOn',
    'seasonTest',
  ],
  settings: [
    'settings', // channels, roles, timings set with /settings
    'features', // /settings features overrides
    'guide', // hub menu, tips, "Did you know?"
  ],
};

const FALLBACK = 'other';

// Files inside the data folders that are NOT part of the database.
const NOT_DATA = new Set(['wordlist.json']);

// Files that used to sit directly in src/data/ and now live in a folder.
// Moved once on start: [old, new], relative to the data folder.
const MOVED_FILES = [['wordlist.json', 'games/wordlist.json']];

const folderOf = new Map();
for (const [folder, keys] of Object.entries(LAYOUT))
  for (const key of keys) folderOf.set(key, folder);

/** "economy/nestcoins.json" for a key (path relative to the data folder). */
function fileFor(key) {
  // encodeURIComponent keeps odd key names from becoming paths ("a/b")
  return `${folderOf.get(key) || FALLBACK}/${encodeURIComponent(key)}.json`;
}

/** The key a data file belongs to ("nestcoins.json" → "nestcoins"). */
function keyOf(fileName) {
  return decodeURIComponent(fileName.slice(0, -'.json'.length));
}

const FOLDERS = [...Object.keys(LAYOUT), FALLBACK];

module.exports = {
  LAYOUT,
  FALLBACK,
  FOLDERS,
  NOT_DATA,
  MOVED_FILES,
  fileFor,
  keyOf,
};
