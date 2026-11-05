// Scenario test: birthdays typed freely, the list, the daily card with 🎉
// wishes, coins, the birthday role and the reminder.
// Run: node tests/scenarios/birthdays.test.js
const assert = require('assert');
const F = require('./fakes');
const { load, run, click, text, general, client, guild, memberRoles, db } = F;

const birthdays = load('services/birthdays');
const coins = load('services/nestcoins');
const { localDate, nowInTZ } = load('utils/time');

(async () => {
  // Dates the way people type them
  const p = t => birthdays.parse(t);
  assert.deepEqual(p('24.12.'), { date: '12-24', year: null });
  assert.deepEqual(p('24.12'), { date: '12-24', year: null });
  assert.deepEqual(p('3.7.1998'), { date: '07-03', year: 1998 });
  assert.deepEqual(p('Dec 24'), { date: '12-24', year: null });
  assert.deepEqual(p('24. Dezember'), { date: '12-24', year: null });
  assert.deepEqual(p('March 1st 2001'), { date: '03-01', year: 2001 });
  assert.deepEqual(
    p('12-24'),
    { date: '12-24', year: null },
    'old format still works',
  );
  assert.deepEqual(p('29.2.'), { date: '02-29', year: null });
  assert.equal(p('31.2.'), null);
  assert.equal(p('banana'), null);

  // Old entries keep working
  db.perform(d => {
    d.birthdays = {
      g: { 1: { name: 'Old Friend', date: '01-15', userId: null } },
    };
  });
  assert.equal(birthdays.all('g').length, 1);

  // Set your own (with autocomplete preview)
  let out = await run('birthday', 'set', { date: 'Dec 24', year: 2000 }, 'a');
  assert.match(text(out), /24 December/);
  out = await run('birthday', 'set', { date: '25.12.' }, 'a');
  assert.equal(
    birthdays.all('g').filter(e => e.userId === 'a').length,
    1,
    'updated, not doubled',
  );
  out = await run('birthday', 'set', { date: 'nope' }, 'b');
  assert.match(text(out), /didn’t get that date/);

  // Today and tomorrow
  const now = nowInTZ();
  const md = d =>
    `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  birthdays.set('g', { userId: 'b', name: 'B', date: md(now), year: 2001 });
  birthdays.set('g', { userId: 'c', name: 'C', date: md(tomorrow) });
  out = await run('birthday', 'list', {}, 'a');
  assert.match(text(out), /today!/);
  assert.match(text(out), /tomorrow/);

  // Settings: channel, coins, role
  out = await run(
    'settings',
    'birthdays',
    { channel: { id: 'general' }, coins: 150, role: { id: 'cake' }, hour: 0 },
    'admin',
  );
  assert.match(text(out), /general/);

  // The daily card
  const before = coins.getBalance('g', 'b');
  await birthdays.tick(client);
  const cardMsg = general.sent.find(m =>
    /Happy Birthday, B!/.test(JSON.stringify(m.payload)),
  );
  assert.ok(cardMsg, 'card posted');
  assert.match(JSON.stringify(cardMsg.payload), /turns \*\*\d+\*\*/);
  assert.equal(coins.getBalance('g', 'b') - before, 150);
  assert.ok(memberRoles.b?.has('cake'), 'birthday role');
  assert.ok(
    general.sent.some(m => /tomorrow is .*<@c>/.test(m.payload.content || '')),
    'reminder',
  );
  // Not twice
  const count = general.sent.length;
  await birthdays.tick(client);
  assert.equal(general.sent.length, count);

  // 🎉 wishes: +5 each, once per person, not for yourself
  const wishId = cardMsg.payload.components[0].toJSON().components[0].custom_id;
  const b2 = coins.getBalance('g', 'b');
  out = await click(wishId, 'a');
  assert.match(text(out), /Wishes from/);
  out = await click(wishId, 'a');
  assert.match(text(out), /already sent/);
  out = await click(wishId, 'b');
  assert.match(text(out), /own birthday/);
  await click(wishId, 'd');
  assert.equal(coins.getBalance('g', 'b') - b2, 10);

  // Profile shows it, NestBot knows it
  assert.equal(birthdays.isBirthday('g', 'b'), true);
  out = await run('profile', null, {}, 'c');
  assert.match(text(out), /in 1 day/);

  // Remove, admin tools
  out = await run('birthday', 'remove', {}, 'a');
  assert.equal(birthdays.forUser('g', 'a'), null);
  out = await run(
    'birthday',
    'add-for',
    { date: '1.5.', name: 'Grandma' },
    'admin',
  );
  assert.ok(birthdays.all('g').some(e => e.name === 'Grandma'));
  out = await run('birthday', 'remove-for', { name: 'grandma' }, 'admin');
  assert.ok(!birthdays.all('g').some(e => e.name === 'Grandma'));
  out = await run('birthday', 'add-for', { date: '1.5.', name: 'X' }, 'a');
  assert.match(text(out), /admin/i);
  console.log(
    '✅ Birthdays: dates, list, cards, wishes, coins, role and reminder work.',
  );
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
