// Scenario test: DMs to the maintainer (MAINTAINER_ID): the weekly backup
// ZIP, bad errors (each one at most once a day, at most 5 an hour) and the
// crash report after a restart.
// Run: node tests/scenarios/maintainer.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nestbot-maint-test-'));
process.env.NESTBOT_DATA_DIR = dir;
process.env.MAINTAINER_ID = 'm1';
delete process.env.BACKUP_DM_DAYS;

const SRC = path.join(__dirname, '..', '..', 'src');
const db = require(path.join(SRC, 'utils/db'));
const maintainer = require(path.join(SRC, 'services/maintainer'));

const dms = [];
const client = {
  users: {
    fetch: async id => {
      assert.equal(id, 'm1');
      return { send: async p => dms.push(p) };
    },
  },
};
const settle = () => new Promise(r => setTimeout(r, 50));

// Read a file back out of a ZIP buffer (central directory → local entry)
function unzipFile(buf, wanted) {
  let p = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(p + 10);
  p = buf.readUInt32LE(p + 16);
  for (let i = 0; i < count; i++) {
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const start =
        offset +
        30 +
        buf.readUInt16LE(offset + 26) +
        buf.readUInt16LE(offset + 28);
      return zlib.inflateRawSync(buf.subarray(start, start + size)).toString();
    }
    p += 46 + nameLen + extra;
  }
  return null;
}

(async () => {
  db.perform(d => {
    d.nestcoins = { g: { u1: 42 } };
  });
  db.flush();
  fs.mkdirSync(path.join(dir, 'archive'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'archive', 'puzzles-2026-10.json'), '{}');

  // An error before login waits until the bot is ready
  maintainer.reportError('/drinks failed', new Error('boom'));
  assert.equal(dms.length, 0);

  maintainer.startMaintainer(client);
  await settle();

  const error = dms.find(d => d.content.includes('/drinks failed'));
  assert.ok(error, 'waiting error sent after start');
  assert.match(error.content, /boom/);

  // First backup right after the first start, as a ZIP with the data in it
  const backup = dms.find(d => d.files);
  assert.ok(backup, 'backup DM sent');
  assert.match(backup.files[0].name, /^nestbot-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  const zip = backup.files[0].attachment;
  assert.deepEqual(JSON.parse(unzipFile(zip, 'economy/nestcoins.json')), {
    g: { u1: 42 },
  });
  assert.equal(
    unzipFile(zip, 'archive/puzzles-2026-10.json'),
    '{}',
    'archive included',
  );
  assert.ok(!zip.includes(Buffer.from('backups/')), 'no old backups inside');
  assert.ok(db.read(d => d.maintainer.lastBackupDm) > 0, 'remembered when');

  // The same error only once a day
  dms.length = 0;
  maintainer.reportError('/drinks failed', new Error('boom'));
  await settle();
  assert.equal(dms.length, 0, 'same error not again');

  // At most 5 an hour (the first one above counts)
  for (let i = 0; i < 10; i++)
    maintainer.reportError('Unhandled error', new Error(`e${i}`));
  await settle();
  assert.equal(dms.length, 4);

  // A crash: written to a file, reported by DM after the restart, then gone
  dms.length = 0;
  maintainer.recordCrash(new Error('kaputt'));
  assert.ok(fs.existsSync(path.join(dir, 'last-crash.txt')));
  maintainer.startMaintainer(client);
  await settle();
  const crash = dms.find(d => d.content.includes('crashed'));
  assert.ok(crash, 'crash DM sent');
  assert.match(crash.content, /kaputt/);
  assert.ok(!fs.existsSync(path.join(dir, 'last-crash.txt')));
  assert.ok(!dms.some(d => d.files), 'no second backup within a week');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(
    '✅ Maintainer: backup ZIP, error DMs with limits and crash reports work.',
  );
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
