// Menu → Data: a read-only look at the bot's data, straight from the files
// in src/data/ (never through utils/db.js, so the running bot isn't touched).
// Member names are looked up on Discord with BOT_TOKEN from .env; without it
// you see the user IDs.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { c, ask, choose } = require('./ui');
const { DATA_DIR } = require('../../utils/paths');
const { localDate } = require('../../utils/time');

const NOT_DATA_DIRS = new Set(['backups', 'examples']);

function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
  } catch {
    return null;
  }
}

//* Names

const names = new Map();
async function nameOf(userId) {
  if (names.has(userId)) return names.get(userId);
  let name = userId;
  const token = (process.env.BOT_TOKEN || '').trim();
  if (token && /^\d{5,}$/.test(userId)) {
    try {
      const res = await fetch(`https://discord.com/api/v10/users/${userId}`, {
        headers: { Authorization: `Bot ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const u = await res.json();
        name = u.global_name || u.username || userId;
      }
    } catch {
      // offline or rate limited: the ID will do
    }
  }
  names.set(userId, name);
  return name;
}
const namesOf = ids => Promise.all(ids.map(nameOf));

// Data is stored per server; usually there's just one
function perGuild(obj) {
  const guilds = Object.entries(obj || {});
  return guilds.map(([id, value]) => ({
    title: guilds.length > 1 ? c.bold(`Server ${id}`) : null,
    value,
  }));
}

//* Views

async function puzzles() {
  const all = {};
  const archive = path.join(DATA_DIR, 'archive');
  if (fs.existsSync(archive))
    for (const f of fs.readdirSync(archive).sort())
      if (f.startsWith('puzzles-'))
        Object.assign(all, readJson(`archive/${f}`));
  Object.assign(all, readJson('games/puzzles.json'));

  const today = localDate();
  const dates = Object.keys(all).sort().reverse();
  const queued = dates.filter(d => d > today).reverse();
  const past = dates.filter(d => d <= today).slice(0, 10);
  if (!dates.length) return console.log(c.dim('No puzzles yet.'));

  if (queued.length) {
    console.log(c.bold('\nComing up'));
    for (const d of queued)
      console.log(
        `  ${d}  ${all[d].difficulty || ''}  code ${c.bold(all[d].code)}`,
      );
  }
  console.log(c.bold('\nLast puzzles'));
  for (const d of past) {
    const p = all[d];
    const solvers = p.solvedBy || [];
    const first = (await namesOf(solvers.slice(0, 3))).join(', ');
    console.log(
      `  ${d === today ? c.green(d) : d}  ${(p.difficulty || '').padEnd(6)} ` +
        `code ${c.bold(p.code)}  ${solvers.length} solved${first ? c.dim(`: ${first}${solvers.length > 3 ? ' …' : ''}`) : ''}`,
    );
    if (p.link) console.log(c.dim(`              ${p.link}`));
  }
  console.log(c.dim(`\n${dates.length} puzzles in total.`));
}

async function coins() {
  const data = readJson('economy/nestcoins.json');
  if (!data) return console.log(c.dim('No coins yet.'));
  for (const { title, value } of perGuild(data)) {
    if (title) console.log(`\n${title}`);
    const rows = Object.entries(value).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((n, [, v]) => n + v, 0);
    console.log(
      c.bold(`\nTop coins`) +
        c.dim(` (${rows.length} members, ${total} coins in total)`),
    );
    const top = rows.slice(0, 15);
    const shown = await namesOf(top.map(([id]) => id));
    top.forEach(([, amount], i) =>
      console.log(
        `  ${String(i + 1).padStart(2)}. ${String(amount).padStart(7)}  ${shown[i]}`,
      ),
    );
  }
}

async function birthdays() {
  const data = readJson('social/birthdays.json');
  if (!data) return console.log(c.dim('No birthdays yet.'));
  const today = localDate().slice(5); // MM-DD
  const year = Number(localDate().slice(0, 4));
  for (const { title, value } of perGuild(data)) {
    if (title) console.log(`\n${title}`);
    const list = Object.values(value)
      .filter(b => b.date)
      .sort(
        (a, b) =>
          (a.date < today) - (b.date < today) || a.date.localeCompare(b.date),
      );
    console.log(c.bold(`\nBirthdays, next first`) + c.dim(` (${list.length})`));
    for (const b of list) {
      const [m, d] = b.date.split('-');
      const turns = b.year ? year + (b.date < today ? 1 : 0) - b.year : null;
      const name = b.userId ? await nameOf(b.userId) : b.name;
      console.log(
        `  ${b.date === today ? c.green(`${d}.${m}.`) : `${d}.${m}.`}  ${name || '?'}${turns ? c.dim(` (turns ${turns})`) : ''}`,
      );
    }
  }
}

// Everywhere a member's ID shows up in the data
async function member() {
  const input = await ask('User ID (or paste a mention like <@123…>): ');
  const id = (input.match(/\d{5,}/) || [])[0];
  if (!id) return;
  console.log(c.bold(`\n${await nameOf(id)}`) + c.dim(` (${id})`));

  const hits = [];
  const short = v => {
    const s = JSON.stringify(v);
    return s.length > 90 ? s.slice(0, 89) + '…' : s;
  };
  const walk = (value, trail, file) => {
    if (Array.isArray(value)) {
      if (value.includes(id))
        hits.push([file, trail.join('.'), `in a list of ${value.length}`]);
      value.forEach(
        (v, i) => v && typeof v === 'object' && walk(v, [...trail, i], file),
      );
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (k === id) hits.push([file, [...trail, k].join('.'), short(v)]);
        else if (v === id)
          hits.push([file, [...trail, k].join('.'), '= this member']);
        else if (v && typeof v === 'object') walk(v, [...trail, k], file);
      }
    }
  };
  for (const rel of dataFiles()) walk(readJson(rel), [], rel);

  if (!hits.length)
    return console.log(c.dim('Not found anywhere in the data.'));
  let last = null;
  for (const [file, where, what] of hits) {
    if (file !== last) console.log(c.bold(`\n  ${file}`));
    last = file;
    console.log(`    ${c.dim(where)}  ${what}`);
  }
}

function dataFiles() {
  const out = [];
  for (const e of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!e.isDirectory() || NOT_DATA_DIRS.has(e.name)) continue;
    for (const f of fs.readdirSync(path.join(DATA_DIR, e.name)).sort())
      if (f.endsWith('.json')) out.push(`${e.name}/${f}`);
  }
  return out;
}

async function files() {
  const folders = fs
    .readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && !NOT_DATA_DIRS.has(e.name))
    .map(e => e.name)
    .sort();
  console.log(c.bold('\nFolders'));
  const folder = await choose(folders);
  if (!folder) return;
  const list = dataFiles().filter(f => f.startsWith(`${folder}/`));
  console.log(c.bold(`\n${folder}/`));
  const file = await choose(list, f => {
    const kb = Math.max(
      1,
      Math.round(fs.statSync(path.join(DATA_DIR, f)).size / 1024),
    );
    return `${f.slice(folder.length + 1)} ${c.dim(`${kb} KB`)}`;
  });
  if (!file) return;
  const text = JSON.stringify(readJson(file), null, 2);
  const lines = text.split('\n');
  // Long files in `less` (q to close), if there is one
  if (lines.length > 60 && process.stdout.isTTY) {
    const r = spawnSync('less', ['-R'], {
      input: text,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    if (!r.error) return;
  }
  console.log(lines.slice(0, 300).join('\n'));
  if (lines.length > 300)
    console.log(c.dim(`… ${lines.length - 300} more lines`));
}

const VIEWS = [
  ['Puzzles', 'coming up, the last 10, codes and solvers', puzzles],
  ['Coins', 'top 15', coins],
  ['Birthdays', 'next first', birthdays],
  ['A member', 'everywhere a user ID shows up', member],
  ['Files', 'look at any data file', files],
];

async function browseData() {
  for (;;) {
    console.log(c.bold('\nData (read-only)\n'));
    const view = await choose(
      VIEWS,
      ([name, hint]) => `${name.padEnd(11)} ${c.dim(hint)}`,
    );
    if (!view) return;
    await view[2]();
    await ask(c.dim('\nEnter = back'));
  }
}

module.exports = { browseData };
