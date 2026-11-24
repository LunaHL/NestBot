const fs = require('fs');
const path = require('path');

//* Paths
// All live data is in src/data/<folder>/<key>.json, one file per top-level
// key (which folder: src/utils/dataLayout.js). In memory it's still one big
// object, so the rest of the bot only sees db.perform / db.read.
const { DATA_DIR: dataPath } = require('./paths');
const layout = require('./dataLayout');

const LEGACY_FILE = path.join(dataPath, 'nestbot.json'); // the old single file
const backupDir = path.join(dataPath, 'backups');
// Folders in src/data/ that aren't part of the database
const NOT_DATA_DIRS = new Set(['backups', 'archive', 'examples']);

const SAVE_DELAY_MS = 2000; // batch many changes into one write
const BACKUPS_TO_KEEP = 7; // one per day

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEGACY_BACKUP_RE = /^nestbot-(\d{4}-\d{2}-\d{2})\.json$/;

const abs = rel => path.join(dataPath, rel);
const stamp = () =>
  new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
const toText = value => JSON.stringify(value, null, 2);

//* Files

// { value } if readable, { missing: true } or { broken: true }
function tryRead(file) {
  if (!fs.existsSync(file)) return { missing: true };
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (error) {
    console.error(
      `[DB] Could not read ${path.relative(dataPath, file)}:`,
      error.message,
    );
    return { broken: true };
  }
}

// Write to a temp file, then rename over the real file.
// A rename is all-or-nothing, so a crash can never leave a half-written file.
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function removeFile(rel) {
  try {
    fs.rmSync(abs(rel), { force: true });
  } catch (err) {
    console.error(`[DB] Could not remove ${rel}:`, err.message);
  }
}

// Keep a broken file around so nothing is lost
function keepBroken(file) {
  const copy = `${file}.broken-${stamp()}`;
  fs.copyFileSync(file, copy);
  console.error(`[DB] Saved broken file as ${path.relative(dataPath, copy)}`);
}

//* Backups
// backups/YYYY-MM-DD/ is a copy of all data folders from that day.
// Old backups (before the split) are single files: backups/nestbot-YYYY-MM-DD.json

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  const out = [];
  for (const name of fs.readdirSync(backupDir)) {
    if (DAY_RE.test(name))
      out.push({ day: name, dir: path.join(backupDir, name) });
    const m = name.match(LEGACY_BACKUP_RE);
    if (m) out.push({ day: m[1], file: path.join(backupDir, name) });
  }
  // newest first; on the same day the folder wins over an old single file
  return out.sort((a, b) => b.day.localeCompare(a.day) || (a.dir ? -1 : 1));
}

// The newest good copy of one key, from the backups
function keyFromBackups(key, rel) {
  for (const b of listBackups()) {
    if (b.dir) {
      const r = tryRead(path.join(b.dir, rel));
      if ('value' in r)
        return { value: r.value, from: `backups/${b.day}/${rel}` };
    } else {
      const r = tryRead(b.file);
      if (r.value && typeof r.value === 'object' && key in r.value)
        return {
          value: r.value[key],
          from: `backups/${path.basename(b.file)}`,
        };
    }
  }
  return null;
}

//* Loading

// Files that moved into a folder (e.g. wordlist.json → games/)
function moveOldFiles() {
  for (const [from, to] of layout.MOVED_FILES) {
    if (fs.existsSync(abs(from)) && !fs.existsSync(abs(to))) {
      fs.mkdirSync(path.dirname(abs(to)), { recursive: true });
      fs.renameSync(abs(from), abs(to));
      console.log(`[DB] Moved ${from} to ${to}`);
    }
  }
}

function dataFolders() {
  return fs
    .readdirSync(dataPath, { withFileTypes: true })
    .filter(
      e =>
        e.isDirectory() && !NOT_DATA_DIRS.has(e.name) && !e.name.includes('.'),
    )
    .map(e => e.name);
}

// Read every <folder>/<key>.json. A broken file is replaced with its newest
// backup; if there is none, the bot refuses to start (rather than starting
// without, say, everyone's coins and overwriting them on the next save).
function loadFolders() {
  const data = {};
  const written = new Map(); // key → { rel, text } as it is on disk right now

  for (const folder of dataFolders()) {
    const dir = abs(folder);
    const names = fs.readdirSync(dir);

    // A crash between writing .tmp and renaming can leave a new file only as .tmp
    for (const name of names) {
      const main = name.slice(0, -'.tmp'.length);
      if (name.endsWith('.json.tmp') && !names.includes(main)) {
        fs.renameSync(path.join(dir, name), path.join(dir, main));
        names.push(main);
      }
    }

    for (const name of names) {
      if (!name.endsWith('.json') || layout.NOT_DATA.has(name)) continue;
      const key = layout.keyOf(name);
      const rel = `${folder}/${name}`;

      // Same key in two folders (half-finished move): keep the one where it belongs
      if (written.has(key)) {
        const stale = rel === layout.fileFor(key) ? written.get(key).rel : rel;
        console.warn(`[DB] ${key} was in two folders, removing ${stale}`);
        removeFile(stale);
        if (stale === rel) continue;
      }

      let r = tryRead(abs(rel));
      if (r.broken) {
        keepBroken(abs(rel));
        const tmp = tryRead(abs(rel) + '.tmp');
        const backup =
          'value' in tmp
            ? { value: tmp.value, from: `${rel}.tmp` }
            : keyFromBackups(key, rel);
        if (!backup)
          throw new Error(
            `[DB] ${rel} is broken and no backup of it could be found.`,
          );
        console.warn(`[DB] Restored ${rel} from ${backup.from}`);
        r = { value: backup.value };
        written.set(key, { rel, text: null }); // force a rewrite
        data[key] = r.value;
        continue;
      }
      data[key] = r.value;
      written.set(key, { rel, text: toText(r.value) });
    }
  }
  return { data, written };
}

// The old single nestbot.json, if there is one. Broken → the newest good
// .tmp or old-style backup, otherwise refuse to start.
function readLegacy() {
  const r = tryRead(LEGACY_FILE);
  if (r.missing) return null;
  const ok = v => v && typeof v === 'object' && !Array.isArray(v);
  if (ok(r.value)) return r.value;

  keepBroken(LEGACY_FILE);
  const candidates = [
    LEGACY_FILE + '.tmp',
    ...listBackups()
      .filter(b => b.file)
      .map(b => b.file),
  ];
  for (const file of candidates) {
    const c = tryRead(file);
    if (ok(c.value)) {
      console.warn(
        `[DB] nestbot.json was broken, using ${path.basename(file)}`,
      );
      return c.value;
    }
  }
  throw new Error('[DB] nestbot.json is broken and no backup could be loaded.');
}

// Save the current folders to backups/<name>/ (before an import overwrites them)
function snapshot(name) {
  const target = path.join(backupDir, name);
  const tmpDir = target + '.tmp';
  fs.rmSync(tmpDir, { recursive: true, force: true });
  for (const { rel, text } of written.values()) {
    const file = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // text is null only for a file we just restored; copy what's on disk then
    if (text === null) fs.copyFileSync(abs(rel), file);
    else fs.writeFileSync(file, text + '\n');
  }
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(tmpDir, target);
  return target;
}

let written = new Map();
let lastBackupDay = null;

function load() {
  fs.mkdirSync(dataPath, { recursive: true });
  moveOldFiles();

  const legacy = readLegacy();
  const current = loadFolders();
  written = current.written;
  if (!legacy) return { data: current.data, importing: false };

  // A nestbot.json next to the folders: the first start after the split, or
  // someone copied an old backup there to restore it. Either way it wins;
  // what was in the folders is kept in backups/before-import-… first.
  if (written.size > 0) {
    const kept = snapshot(`before-import-${stamp()}`);
    console.warn(
      `[DB] Found nestbot.json next to the data folders: importing it. ` +
        `The previous data is in ${path.relative(dataPath, kept)}`,
    );
  } else {
    console.log('[DB] Splitting nestbot.json into data folders…');
  }
  return { data: legacy, importing: true };
}

const loaded = load();
const database = loaded.data;

//* Saving

// Write every key whose content changed, move keys whose folder changed,
// and remove files of keys that are gone.
function saveAll() {
  const seen = new Set();
  for (const [key, value] of Object.entries(database)) {
    const text = value === undefined ? undefined : toText(value);
    if (text === undefined) continue; // undefined / functions aren't saved
    seen.add(key);
    const rel = layout.fileFor(key);
    const prev = written.get(key);
    if (prev && prev.text === text && prev.rel === rel) continue;
    writeAtomic(abs(rel), text + '\n');
    if (prev && prev.rel !== rel) removeFile(prev.rel);
    written.set(key, { rel, text });
  }
  for (const [key, prev] of written) {
    if (seen.has(key)) continue;
    removeFile(prev.rel);
    written.delete(key);
  }
}

// Right away: writes restored files, moves keys whose folder changed in
// dataLayout.js, and on an import writes all the new files. Unchanged files
// aren't touched. Throws (and the bot doesn't start) if this fails.
saveAll();

if (loaded.importing) {
  const done = `${LEGACY_FILE}.imported-${stamp()}`;
  fs.renameSync(LEGACY_FILE, done);
  fs.rmSync(LEGACY_FILE + '.tmp', { force: true });
  console.log(
    `[DB] Done: ${written.size} files in ${[...new Set([...written.values()].map(w => w.rel.split('/')[0]))].join(', ')}. ` +
      `The old file is kept as ${path.basename(done)}`,
  );
}
backupIfNeeded(); // today's backup right at the start, too

let dirty = false;
let saveTimer = null;

function writeNow() {
  saveTimer = null;
  if (!dirty) return;
  dirty = false;
  try {
    saveAll();
    backupIfNeeded();
  } catch (err) {
    dirty = true; // try again next time
    console.error('[DB] Save failed:', err);
  }
}

function scheduleSave() {
  dirty = true;
  if (!saveTimer) saveTimer = setTimeout(writeNow, SAVE_DELAY_MS);
}

// Once per day: copy all data folders into backups/YYYY-MM-DD/ and drop old days.
function backupIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (lastBackupDay === today) return;
  try {
    if (!fs.existsSync(path.join(backupDir, today))) snapshot(today);
    for (const old of listBackups().slice(BACKUPS_TO_KEEP)) {
      fs.rmSync(old.dir || old.file, { recursive: true, force: true });
    }
    lastBackupDay = today;
  } catch (err) {
    console.error('[DB] Backup failed:', err);
  }
}

//* Public API

// Modify the DB. Changes are saved shortly after (batched).
function perform(callback) {
  const result = callback(database);
  scheduleSave();
  return result;
}

// Read from the DB without saving anything.
function read(callback) {
  return callback(database);
}

// Write pending changes immediately (used on shutdown).
function flush() {
  if (saveTimer) clearTimeout(saveTimer);
  writeNow();
}

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[DB] ${signal} received, saving...`);
  flush();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', flush);

module.exports = { perform, read, flush, database };
