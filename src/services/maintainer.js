// DMs to the person who runs the bot (MAINTAINER_ID in .env):
// - once a week a backup of all data as a ZIP (BACKUP_DM_DAYS, 0 = off)
// - when something goes badly wrong: the bot crashed and pm2 restarted it,
//   a command or button crashed for a member, saving data failed, or an
//   error nobody caught. The same error comes at most once a day, and never
//   more than 5 DMs an hour. Background jobs that fail now and then (e.g.
//   TMDB is down) only go to the log.
// Without MAINTAINER_ID nothing is sent.
const fs = require('fs');
const path = require('path');
const db = require('../utils/db');
const { DATA_DIR } = require('../utils/paths');
const { zipData } = require('../utils/backupZip');
const { localDate } = require('../utils/time');
const { runEvery } = require('../utils/schedule');
const { version } = require('../../package.json');

const CRASH_FILE = path.join(DATA_DIR, 'last-crash.txt');
const MAX_UPLOAD = 10 * 1024 * 1024; // Discord's file limit without boosts
const SAME_ERROR_MS = 24 * 3600 * 1000;
const MAX_ERRORS_PER_HOUR = 5;

const maintainerId = () => (process.env.MAINTAINER_ID || '').trim();
const backupDays = () => {
  const n = Number(process.env.BACKUP_DM_DAYS ?? 7);
  return Number.isFinite(n) ? n : 7;
};

let client = null;
const waiting = []; // errors that happened before the bot was logged in
const lastSent = new Map(); // error signature → time
let sentThisHour = [];

const trim = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const kb = bytes => `${Math.max(1, Math.round(bytes / 1024))} KB`;

async function dm(payload) {
  const id = maintainerId();
  if (!id || !client) return false;
  try {
    const user = await client.users.fetch(id);
    await user.send(payload);
    return true;
  } catch (e) {
    console.error(`[Maintainer] DM to ${id} failed:`, e.message);
    return false;
  }
}

//* Errors

/** A bad error: DM the maintainer (deduplicated). `where` says what failed. */
function reportError(where, error) {
  if (!maintainerId()) return;
  const text = String(error?.stack || error);
  const signature = `${where}|${String(error?.message || text).slice(0, 200)}`;
  const now = Date.now();
  if (now - (lastSent.get(signature) || 0) < SAME_ERROR_MS) return;
  sentThisHour = sentThisHour.filter(t => now - t < 3600 * 1000);
  if (sentThisHour.length >= MAX_ERRORS_PER_HOUR) return;
  lastSent.set(signature, now);
  sentThisHour.push(now);

  const content =
    `🚨 **${trim(where, 200)}**\n` +
    '```\n' +
    trim(text, 1700) +
    '\n```' +
    `-# NestBot v${version} · the same error comes at most once a day`;
  if (client) dm({ content });
  else waiting.push({ content });
}

/** Right before the process dies: remember why, the DM comes after the restart. */
function recordCrash(error) {
  try {
    fs.writeFileSync(
      CRASH_FILE,
      `${new Date().toISOString()}\n${error?.stack || error}`,
    );
  } catch {
    // nothing we can do while crashing
  }
}

async function reportLastCrash() {
  if (!fs.existsSync(CRASH_FILE)) return;
  const text = fs.readFileSync(CRASH_FILE, 'utf8');
  const [when, ...stack] = text.split('\n');
  const at = Math.floor(new Date(when).getTime() / 1000);
  const sent = await dm({
    content:
      `💥 **NestBot crashed${at ? ` <t:${at}:R>` : ''} and was restarted.**\n` +
      '```\n' +
      trim(stack.join('\n'), 1700) +
      '\n```',
  });
  // Without MAINTAINER_ID the file stays, so it's there to read by hand
  if (sent) fs.rmSync(CRASH_FILE, { force: true });
}

//* Backups

/** The ZIP of all data: { buffer, files, name } */
function buildBackup() {
  db.flush(); // so the files have the newest data
  const { buffer, files } = zipData();
  return { buffer, files, name: `nestbot-backup-${localDate()}.zip` };
}

async function sendBackup() {
  const backup = buildBackup();
  const restore =
    'To restore: stop the bot, unzip it into `src/data/`, start the bot.';
  const ok =
    backup.buffer.length > MAX_UPLOAD
      ? await dm({
          content:
            `🗄️ The weekly backup is too big for Discord (${kb(backup.buffer.length)}). ` +
            'Make one with `npm run menu` on the server instead.',
        })
      : await dm({
          content: `🗄️ **NestBot backup** (${backup.files} files, ${kb(backup.buffer.length)}, v${version})\n-# ${restore}`,
          files: [{ attachment: backup.buffer, name: backup.name }],
        });
  if (ok)
    db.perform(d => {
      d.maintainer ||= {};
      d.maintainer.lastBackupDm = Date.now();
    });
  return ok;
}

// Checked every hour. The first one goes out right after the first start.
async function backupIfDue() {
  const days = backupDays();
  if (!maintainerId() || days <= 0) return;
  const last = db.read(d => d.maintainer?.lastBackupDm) || 0;
  if (Date.now() - last < days * 24 * 3600 * 1000) return;
  await sendBackup();
}

//* Start

/** Called once when the bot is ready. */
function startMaintainer(c) {
  client = c;
  if (!maintainerId()) {
    console.log('[Maintainer] MAINTAINER_ID not set: no backup or error DMs.');
    return;
  }
  reportLastCrash().catch(e => console.error('[Maintainer]', e));
  for (const payload of waiting.splice(0)) dm(payload);
  runEvery('Backup DM', 60, backupIfDue);
}

// Saving data failed / the daily backup failed (reported by utils/db.js)
db.onError((where, err) => reportError(where, err));

module.exports = {
  startMaintainer,
  reportError,
  recordCrash,
  buildBackup,
  sendBackup,
};
