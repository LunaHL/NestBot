// The maintainer menu for the server: update, status, logs, restart,
// settings (.env), a look at the data, backups and restore in one place.
// Runs next to the bot (managed by pm2).
//
//   npm run menu
//
// Doesn't load the bot's database code, so it never writes data itself
// (except when you restore a backup, and then the bot is stopped first).
// Helpers: menu/ui.js, the .env editor: menu/env.js, data views: menu/data.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const {
  ROOT,
  c,
  ask,
  yes,
  run,
  output,
  version,
  stamp,
  size,
  ago,
  folderSize,
} = require('./menu/ui');
// NESTBOT_PM2_NAME, and the bot token to show names in the data views
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
const { editEnv } = require('./menu/env');
const { browseData } = require('./menu/data');
const { DATA_DIR } = require('../utils/paths');
const { zipData } = require('../utils/backupZip');
const { NOT_DATA } = require('../utils/dataLayout');

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const ZIP_DIR = path.join(os.homedir(), 'nestbot-backups');
const NOT_DATA_DIRS = new Set(['backups', 'archive', 'examples']);

//* pm2

let pm2Name = process.env.NESTBOT_PM2_NAME || null;

function pm2Processes() {
  const out = output('pm2', ['jlist']);
  if (out === null) return null;
  try {
    return JSON.parse(out.slice(out.indexOf('[')));
  } catch {
    return [];
  }
}

// The pm2 process that runs this folder's bot
function findProcess() {
  const list = pm2Processes();
  if (!list) return { error: 'pm2 not found. Is it installed (npm i -g pm2)?' };
  const mine = pm2Name
    ? list.find(p => p.name === pm2Name)
    : list.find(
        p => path.resolve(p.pm2_env?.pm_cwd || '') === path.resolve(ROOT),
      ) ||
      list.find(p =>
        (p.pm2_env?.pm_exec_path || '').startsWith(path.resolve(ROOT)),
      );
  if (mine) pm2Name = mine.name;
  return { proc: mine };
}

function statusLine() {
  const { proc, error } = findProcess();
  if (error) return c.red(error);
  if (!proc) return c.yellow('not running in pm2');
  const env = proc.pm2_env || {};
  const state = env.status === 'online' ? c.green('online') : c.red(env.status);
  const up =
    env.status === 'online' ? `, up ${ago(Date.now() - env.pm_uptime)}` : '';
  const mem = proc.monit?.memory ? `, ${size(proc.monit.memory)} RAM` : '';
  return `pm2 "${proc.name}": ${state}${up}, ${env.restart_time ?? 0} restarts${mem}`;
}

async function pm2(action) {
  const { proc, error } = findProcess();
  if (error) return (console.log(c.red(error)), false);
  if (proc) return run('pm2', [action, proc.name]);
  if (action !== 'start' && action !== 'restart') {
    console.log(c.yellow('NestBot is not running in pm2.'));
    return false;
  }
  const name =
    (await ask('Not in pm2 yet. Name for the pm2 process [NestBot]: ')) ||
    'NestBot';
  pm2Name = name;
  const ok = run('pm2', ['start', 'src/index.js', '--name', name]);
  if (ok) run('pm2', ['save']); // so pm2 starts it again after a reboot
  return ok;
}

function showLogs(lines = 40) {
  if (!pm2Name && !findProcess().proc)
    return console.log(c.yellow('NestBot is not running in pm2.'));
  run('pm2', ['logs', pm2Name, '--lines', String(lines), '--nostream']);
}

function liveLogs() {
  if (!pm2Name && !findProcess().proc)
    return console.log(c.yellow('NestBot is not running in pm2.'));
  console.log(c.dim('Ctrl+C to go back to the menu'));
  return new Promise(resolve => {
    const ignore = () => {};
    process.on('SIGINT', ignore); // Ctrl+C ends the logs, not the menu
    const child = spawn('pm2', ['logs', pm2Name, '--lines', '20'], {
      stdio: 'inherit',
    });
    child.on('exit', () => {
      process.off('SIGINT', ignore);
      resolve();
    });
  });
}

//* Actions

// npm ci installs exactly what package-lock.json says and never changes it
const packagesChanged = files =>
  /^package(-lock)?\.json$/m.test(files) ||
  !fs.existsSync(path.join(ROOT, 'node_modules'));

async function update() {
  const changed = output('git', [
    'status',
    '--porcelain',
    '--untracked-files=no',
  ]);
  // package-lock.json changed by itself (an `npm install` with another npm
  // version rewrites it): safe to throw away, it's generated
  const lockOnly =
    changed && changed.split('\n').every(l => / package-lock\.json$/.test(l));
  if (lockOnly) {
    console.log(
      c.dim(
        'package-lock.json was rewritten here by npm; resetting it (it is generated).',
      ),
    );
    run('git', ['checkout', '--', 'package-lock.json']);
  } else if (changed) {
    console.log(c.yellow('Files of the bot were changed here on the server:'));
    console.log(changed);
    console.log(
      c.yellow('git pull may fail or mix them in. Changes belong on your PC.'),
    );
    if (!(await yes('Try anyway?'))) return;
  }
  const before = output('git', ['rev-parse', 'HEAD']);
  if (!run('git', ['pull', '--ff-only']))
    return console.log(c.red('git pull failed, nothing changed.'));
  const after = output('git', ['rev-parse', 'HEAD']);

  if (before === after) {
    console.log(c.green('Already up to date.'));
    if (!(await yes('Restart anyway?'))) return;
  } else {
    console.log(c.bold('\nNew:'));
    run('git', ['log', '--oneline', '--no-decorate', `${before}..${after}`]);
    const files = output('git', ['diff', '--name-only', before, after]) || '';
    if (packagesChanged(files) && !run('npm', ['ci']))
      return console.log(
        c.red('npm ci failed. The bot is still running the old version.'),
      );
  }

  console.log(c.bold('\nTesting…'));
  if (!run('npm', ['test'])) {
    console.log(
      c.red('\nTests failed. The bot is still running the old version.'),
    );
    if (
      before !== after &&
      (await yes(`Go back to the old code (${before.slice(0, 7)})?`))
    ) {
      run('git', ['reset', '--hard', before]);
      const files = output('git', ['diff', '--name-only', before, after]) || '';
      if (packagesChanged(files)) run('npm', ['ci']);
      console.log(c.green('Back on the old code. Nothing was restarted.'));
    }
    return;
  }

  if (!(await pm2('restart'))) return;
  console.log(c.dim('\nWaiting a few seconds for the start…'));
  await new Promise(r => setTimeout(r, 6000));
  showLogs(15);
  console.log('\n' + statusLine());
}

function status() {
  console.log(c.bold('\nBot'));
  console.log(`  ${statusLine()}`);
  const commit = output('git', ['log', '-1', '--format=%h %s (%cr)']);
  console.log(`  v${version()}${commit ? `, ${commit}` : ''}`);

  console.log(c.bold('\nData'));
  const folders = fs
    .readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && !NOT_DATA_DIRS.has(e.name))
    .map(
      e => `${e.name} ${c.dim(size(folderSize(path.join(DATA_DIR, e.name))))}`,
    );
  console.log(`  ${folders.join(' · ') || 'no data yet'}`);
  console.log(
    `  archive ${c.dim(size(folderSize(path.join(DATA_DIR, 'archive'))))}`,
  );

  console.log(c.bold('\nBackups'));
  const days = listBackups().filter(b => b.day);
  console.log(
    days.length
      ? `  daily: ${days.length}, newest ${days[0].name}`
      : c.yellow('  no daily backups yet'),
  );
  try {
    const m = JSON.parse(
      fs.readFileSync(
        path.join(DATA_DIR, 'settings', 'maintainer.json'),
        'utf8',
      ),
    );
    if (m.lastBackupDm)
      console.log(`  last backup DM: ${ago(Date.now() - m.lastBackupDm)} ago`);
  } catch {
    console.log(c.dim('  no backup DM sent yet (MAINTAINER_ID in .env?)'));
  }
  const zips = fs.existsSync(ZIP_DIR)
    ? fs.readdirSync(ZIP_DIR).filter(f => f.endsWith('.zip'))
    : [];
  if (zips.length) console.log(`  ZIPs in ~/nestbot-backups: ${zips.length}`);

  const crash = path.join(DATA_DIR, 'last-crash.txt');
  if (fs.existsSync(crash)) {
    console.log(c.bold(c.red('\nLast crash (not reported by DM yet)')));
    console.log(
      fs.readFileSync(crash, 'utf8').split('\n').slice(0, 6).join('\n'),
    );
  }
}

function backupNow(prefix = 'nestbot-backup') {
  const { buffer, files } = zipData();
  fs.mkdirSync(ZIP_DIR, { recursive: true });
  const file = path.join(ZIP_DIR, `${prefix}-${stamp()}.zip`);
  fs.writeFileSync(file, buffer);
  console.log(c.green(`✅ ${files} files, ${size(buffer.length)} → ${file}`));
  return file;
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter(
      e =>
        e.isDirectory() &&
        (/^\d{4}-\d{2}-\d{2}$/.test(e.name) ||
          e.name.startsWith('before-import-')),
    )
    .map(e => ({
      name: e.name,
      day: /^\d{4}/.test(e.name),
      dir: path.join(BACKUP_DIR, e.name),
    }))
    .sort((a, b) => b.day - a.day || b.name.localeCompare(a.name));
}

function filesIn(dir, prefix = '') {
  return fs
    .readdirSync(path.join(dir, prefix), { withFileTypes: true })
    .flatMap(e => {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      return e.isDirectory() ? filesIn(dir, rel) : [rel];
    });
}

async function restore() {
  const backups = listBackups();
  if (!backups.length)
    return console.log(c.yellow('No backups in src/data/backups/ yet.'));
  console.log(c.bold('\nBackups'));
  backups.forEach((b, i) =>
    console.log(`  ${String(i + 1).padStart(2)}  ${b.name}`),
  );
  const pick =
    backups[Number(await ask('Which one? (number, Enter = cancel) ')) - 1];
  if (!pick) return;

  const all = filesIn(pick.dir)
    .filter(f => f.endsWith('.json'))
    .sort();
  if (!all.length) return console.log(c.yellow('That backup is empty.'));
  console.log(`\n  a  everything (${all.length} files)`);
  all.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2)}  ${f}`));
  const what = await ask(
    'Everything or one file? (a / number, Enter = cancel) ',
  );
  const files =
    what.toLowerCase() === 'a'
      ? all
      : all[Number(what) - 1]
        ? [all[Number(what) - 1]]
        : null;
  if (!files) return;

  const label = files.length === 1 ? files[0] : `all data`;
  console.log(
    c.yellow(
      `\nThis stops the bot, replaces ${label} with the version from ${pick.name} and starts it again.`,
    ),
  );
  if (!(await yes('Go ahead?'))) return;

  console.log(c.dim('First a ZIP of the current data, just in case:'));
  backupNow('before-restore');
  const wasRunning = findProcess().proc?.pm2_env?.status === 'online';
  if (wasRunning && !(await pm2('stop')))
    return console.log(c.red('Could not stop the bot, nothing restored.'));

  if (files === all) {
    // Everything: data that didn't exist on that day goes away too
    // (the archive and the NestWord word list aren't in daily backups and stay)
    for (const e of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
      if (!e.isDirectory() || NOT_DATA_DIRS.has(e.name)) continue;
      for (const f of fs.readdirSync(path.join(DATA_DIR, e.name)))
        if (!NOT_DATA.has(f))
          fs.rmSync(path.join(DATA_DIR, e.name, f), { force: true });
    }
  }
  for (const rel of files) {
    fs.mkdirSync(path.dirname(path.join(DATA_DIR, rel)), { recursive: true });
    fs.copyFileSync(path.join(pick.dir, rel), path.join(DATA_DIR, rel));
  }
  console.log(
    c.green(`✅ Restored ${files.length} file(s) from ${pick.name}.`),
  );
  if (wasRunning) {
    await pm2('start');
    await new Promise(r => setTimeout(r, 4000));
    showLogs(10);
  } else console.log('The bot was not running, so it was not started.');
}

async function logRotation() {
  console.log(
    "Keeps pm2's log files small: a new file at 10 MB, the last 7 kept, old ones zipped.\n" +
      c.dim(
        'Installs the pm2 module "pm2-logrotate" (once, for all pm2 apps on this server).',
      ),
  );
  if (!(await yes('Set it up?'))) return;
  if (!run('pm2', ['install', 'pm2-logrotate'])) return;
  run('pm2', ['set', 'pm2-logrotate:max_size', '10M']);
  run('pm2', ['set', 'pm2-logrotate:retain', '7']);
  run('pm2', ['set', 'pm2-logrotate:compress', 'true']);
  console.log(c.green('✅ Log rotation is on.'));
}

//* Menu

const ITEMS = [
  ['1', 'Update', 'newest version from GitHub, test, restart', update],
  ['2', 'Status', 'bot, version, data, backups', status],
  ['3', 'Logs', 'the last 40 lines', () => showLogs()],
  ['4', 'Logs live', 'Ctrl+C to come back', liveLogs],
  ['5', 'Restart', '', () => pm2('restart')],
  ['6', 'Stop', '', () => pm2('stop')],
  ['7', 'Start', '', () => pm2('start')],
  [
    '8',
    'Settings',
    'view and change .env',
    () => editEnv({ restart: () => pm2('restart') }),
  ],
  [
    '9',
    'Data',
    'puzzles, coins, birthdays, a member, files (read-only)',
    browseData,
  ],
  [
    '10',
    'Backup now',
    'ZIP of all data to ~/nestbot-backups/',
    () => backupNow(),
  ],
  ['11', 'Restore', 'a daily backup, everything or one file', restore],
  ['12', 'Log rotation', 'set up once', logRotation],
  ['0', 'Quit', '', null],
];

async function main() {
  for (;;) {
    console.log(`\n${c.bold(`🪺 NestBot v${version()}`)}  ${statusLine()}\n`);
    for (const [key, name, hint] of ITEMS)
      console.log(`  ${key.padStart(2)}  ${name.padEnd(13)} ${c.dim(hint)}`);
    const choice = await ask('\n> ');
    const item = ITEMS.find(([key]) => key === choice);
    if (!item) continue;
    if (!item[3]) return;
    console.log();
    try {
      await item[3]();
    } catch (e) {
      console.log(c.red(`Something went wrong: ${e.message}`));
    }
    // Settings and Data have their own "back"
    if (!['Settings', 'Data'].includes(item[1]))
      await ask(c.dim('\nEnter = back to the menu'));
  }
}

main();
