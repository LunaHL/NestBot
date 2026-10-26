// Long-term storage for old data that is moved out of nestbot.json.
// One file per kind and month, e.g. archive/puzzles-2026-10.json, so the
// main database stays small and no single file grows forever.
const fs = require('fs');
const path = require('path');

const archiveDir = path.join(__dirname, '..', 'data', 'archive');
const KINDS = ['puzzles', 'nestword', 'events'];
const FILE_RE = /^(\w+)-(\d{4}-\d{2})\.json$/;

// Cache of everything loaded per kind: { "YYYY-MM-DD" or id: entry }
const cache = {};

function fileFor(kind, month) {
  return path.join(archiveDir, `${kind}-${month}.json`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`[Archive] Could not read ${path.basename(file)}:`, e.message);
    return null;
  }
}

function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function listFiles(kind) {
  if (!fs.existsSync(archiveDir)) return [];
  return fs
    .readdirSync(archiveDir)
    .map(f => f.match(FILE_RE))
    .filter(m => m && m[1] === kind)
    .map(m => ({ month: m[2], file: path.join(archiveDir, m[0]) }));
}

/**
 * Save entries to the archive. `entries` is { key: value } where the month
 * comes from monthOf(key, value). Returns true only if everything was written,
 * so the caller knows it's safe to remove the data from nestbot.json.
 */
function add(kind, entries, monthOf) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown archive kind: ${kind}`);
  const keys = Object.keys(entries);
  if (keys.length === 0) return true;

  try {
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

    const byMonth = {};
    for (const key of keys) {
      const month = monthOf(key, entries[key]);
      (byMonth[month] ||= {})[key] = entries[key];
    }

    for (const [month, items] of Object.entries(byMonth)) {
      const file = fileFor(kind, month);
      let existing = {};
      if (fs.existsSync(file)) {
        existing = readJson(file);
        // Never overwrite an archive file we couldn't read
        if (!existing) return false;
      }
      writeJson(file, { ...existing, ...items });
    }

    delete cache[kind]; // reload next time
    return true;
  } catch (e) {
    console.error(`[Archive] Failed to archive ${kind}:`, e);
    return false;
  }
}

/** Everything archived for a kind, as one { key: value } object. */
function getAll(kind) {
  if (cache[kind]) return cache[kind];
  const all = {};
  for (const { file } of listFiles(kind)) {
    Object.assign(all, readJson(file) || {});
  }
  cache[kind] = all;
  return all;
}

module.exports = { add, getAll };
