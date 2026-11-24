// Scenario test: the data folders (src/utils/db.js). The old single
// nestbot.json is split into one file per key, unchanged files aren't
// rewritten, broken files come back from the backup, and a nestbot.json
// dropped next to the folders is imported (restore).
// Each step starts the db in its own process, like a bot restart.
// Run: node tests/scenarios/data.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DB = path.join(__dirname, '..', '..', 'src', 'utils', 'db.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nestbot-data-test-'));
const at = rel => path.join(dir, rel);
const json = rel => JSON.parse(fs.readFileSync(at(rel), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

// Start the db, run `code` with `db` in scope, save, exit
function start(code = '') {
  return execFileSync(
    process.execPath,
    ['-e', `const db = require(${JSON.stringify(DB)}); ${code}; db.flush();`],
    {
      env: { ...process.env, NESTBOT_DATA_DIR: dir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

// 1. First start after the update: split nestbot.json, move wordlist.json
fs.writeFileSync(
  at('nestbot.json'),
  JSON.stringify({
    nestcoins: { g: { u1: 50 } },
    coffee: { g: { u1: { latte: 2 } } },
    features: { shop: true },
    brandNewThing: { x: 1 },
  }),
);
fs.writeFileSync(at('wordlist.json'), JSON.stringify({ pool5: ['apple'] }));
start();
assert.deepEqual(json('economy/nestcoins.json'), { g: { u1: 50 } });
assert.deepEqual(json('drinks/coffee.json'), { g: { u1: { latte: 2 } } });
assert.deepEqual(json('settings/features.json'), { shop: true });
assert.deepEqual(
  json('other/brandNewThing.json'),
  { x: 1 },
  'unknown keys land in other/',
);
assert.deepEqual(json('games/wordlist.json'), { pool5: ['apple'] });
assert.ok(!fs.existsSync(at('nestbot.json')), 'old file moved away');
assert.ok(
  fs.readdirSync(dir).some(f => f.startsWith('nestbot.json.imported-')),
  'old file kept',
);
assert.deepEqual(json(`backups/${today}/economy/nestcoins.json`), {
  g: { u1: 50 },
});

// 2. Changes: only changed files are written, removed keys lose their file
const coffeeTime = fs.statSync(at('drinks/coffee.json')).mtimeMs;
start(
  `db.perform(d => { d.nestcoins.g.u1 = 70; delete d.features; d.suggestions = { g: {} }; })`,
);
assert.equal(json('economy/nestcoins.json').g.u1, 70);
assert.ok(
  !fs.existsSync(at('settings/features.json')),
  'deleted key, deleted file',
);
assert.deepEqual(json('social/suggestions.json'), { g: {} });
assert.equal(
  fs.statSync(at('drinks/coffee.json')).mtimeMs,
  coffeeTime,
  'unchanged file untouched',
);
assert.equal(
  json(`backups/${today}/economy/nestcoins.json`).g.u1,
  50,
  "today's backup is from the first start",
);

// 3. A broken file comes back from the backup, the broken one is kept
fs.writeFileSync(at('economy/nestcoins.json'), '{ "g": { "u1": 7');
const out = start(`console.log('coins', db.read(d => d.nestcoins.g.u1))`);
assert.match(out, /coins 50/);
assert.equal(json('economy/nestcoins.json').g.u1, 50, 'restored file written');
assert.ok(fs.readdirSync(at('economy')).some(f => f.includes('.broken-')));

// 4. Broken and no backup anywhere: refuse to start
fs.rmSync(at('backups'), { recursive: true });
fs.writeFileSync(at('drinks/coffee.json'), 'nope');
assert.throws(() => start(), /no backup of it could be found/);
fs.writeFileSync(at('drinks/coffee.json'), '{}');

// 5. A key whose folder changed moves by itself
fs.renameSync(at('drinks/coffee.json'), at('other/coffee.json'));
start();
assert.ok(fs.existsSync(at('drinks/coffee.json')));
assert.ok(!fs.existsSync(at('other/coffee.json')));

// 6. Restore: a nestbot.json next to the folders replaces everything,
// what was there before is kept in backups/before-import-…
fs.writeFileSync(
  at('nestbot.json'),
  JSON.stringify({ nestcoins: { g: { u1: 1 } } }),
);
start();
assert.equal(json('economy/nestcoins.json').g.u1, 1);
assert.ok(
  !fs.existsSync(at('social/suggestions.json')),
  'keys not in the restored file are gone',
);
const before = fs
  .readdirSync(at('backups'))
  .find(f => f.startsWith('before-import-'));
assert.ok(before, 'previous data kept');
assert.deepEqual(json(`backups/${before}/social/suggestions.json`), { g: {} });

fs.rmSync(dir, { recursive: true, force: true });
console.log('✅ Data: split, saving, backups, broken files and restore work.');
