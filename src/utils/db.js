const fs = require('fs');
const path = require('path');

//* Paths
const dataPath = path.join(__dirname, '..', 'data');
const filePath = path.join(dataPath, 'nestbot.json');
const tmpPath = filePath + '.tmp';
const backupDir = path.join(dataPath, 'backups');

const SAVE_DELAY_MS = 2000; // batch many changes into one write
const BACKUPS_TO_KEEP = 7; // one per day

//* Load JSON once to memory at startup.
// If the main file is broken, fall back to the newest backup instead of
// starting empty (which would wipe everyone's coins on the next save).
function tryRead(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`[DB] Could not read ${path.basename(file)}:`, error.message);
    return undefined; // exists but is broken
  }
}

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter(f => /^nestbot-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse(); // newest first
}

function load() {
  if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });

  const main = tryRead(filePath);
  if (main) return main;

  if (main === undefined) {
    // Keep the broken file around so nothing is lost, then try backups.
    const broken = `${filePath}.broken-${Date.now()}`;
    fs.copyFileSync(filePath, broken);
    console.error(`[DB] Saved broken file as ${path.basename(broken)}`);
  }

  // A crash between writing .tmp and renaming leaves a good .tmp behind
  const candidates = [tmpPath, ...listBackups().map(f => path.join(backupDir, f))];
  for (const file of candidates) {
    const data = tryRead(file);
    if (data) {
      console.warn(`[DB] Restored data from ${path.basename(file)}`);
      return data;
    }
  }

  if (main === undefined) {
    // Refuse to start with an empty DB over a broken one.
    throw new Error('[DB] nestbot.json is broken and no backup could be loaded.');
  }
  return {}; // first run
}

const database = load();

//* Saving
let dirty = false;
let saveTimer = null;

// Write to a temp file, then rename over the real file.
// A rename is all-or-nothing, so a crash can never leave a half-written file.
function writeNow() {
  saveTimer = null;
  if (!dirty) return;
  dirty = false;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(database, null, 2));
    fs.renameSync(tmpPath, filePath);
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

// Once per day: copy the current file into backups/ and drop old copies.
let lastBackupDay = null;
function backupIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (lastBackupDay === today) return;
  lastBackupDay = today;
  try {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const target = path.join(backupDir, `nestbot-${today}.json`);
    if (!fs.existsSync(target)) fs.copyFileSync(filePath, target);
    for (const old of listBackups().slice(BACKUPS_TO_KEEP)) {
      fs.unlinkSync(path.join(backupDir, old));
    }
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
