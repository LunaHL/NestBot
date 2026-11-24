// Shared helpers for the menu (src/scripts/menu.js): colors, questions,
// running commands, sizes and times.
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');

const c = {
  bold: s => `\x1b[1m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
};

//* Helpers

// A fresh prompt per question, closed before commands run: so Ctrl+C in
// "Logs live" reaches pm2 and not the menu. (Piped input, e.g. in a test,
// is read line by line from one reader instead.)
let piped = null;
async function ask(question) {
  if (!process.stdin.isTTY) {
    piped ||= readline
      .createInterface({ input: process.stdin })
      [Symbol.asyncIterator]();
    process.stdout.write(question);
    const { value, done } = await piped.next();
    if (done) process.exit(0);
    console.log(value);
    return value.trim();
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}
const yes = async q => /^(y|yes|j|ja)$/i.test(await ask(`${q} [y/N] `));

// Run a command, output goes straight to the screen. Returns true on success.
function run(cmd, args, opts = {}) {
  console.log(c.dim(`$ ${cmd} ${args.join(' ')}`));
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
  if (r.error) console.log(c.red(`  ${r.error.message}`));
  return r.status === 0;
}
// Run a command quietly and return its output (or null)
function output(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

const version = () =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const stamp = () =>
  new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
const size = bytes =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
function ago(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} days`;
}
function folderSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? folderSize(p) : fs.statSync(p).size;
  }
  return n;
}

// A numbered list; returns the picked item (or undefined on Enter / nonsense)
async function choose(
  items,
  label = x => x,
  question = 'Which one? (number, Enter = back) ',
) {
  items.forEach((item, i) =>
    console.log(`  ${String(i + 1).padStart(2)}  ${label(item)}`),
  );
  const n = Number(await ask(question));
  return Number.isInteger(n) ? items[n - 1] : undefined;
}

module.exports = {
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
  choose,
};
