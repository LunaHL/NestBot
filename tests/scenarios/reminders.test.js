// Scenario test: /remind sends a DM only if the puzzle / NestWord / daily
// coins aren't done yet, once a day.
// Run: node tests/scenarios/reminders.test.js
const assert = require('assert');
const F = require('./fakes');
const { load, run, click, text, client, dms, db } = F;

const reminders = load('services/reminders');
const { localDate } = load('utils/time');

(async () => {
  const today = localDate(0);
  db.perform(d => {
    d.puzzles = {
      [today]: {
        link: 'https://example.com/p',
        code: 'abc123',
        difficulty: 'easy',
        solvedBy: ['b'],
      },
    };
    d.nestwordDaily = {
      [today]: { answer: 'nest', attempts: 6, guesses: { b: 6 }, solvedBy: [] },
    };
    d.dailyClaims = { g: { b: today } };
  });

  // The panel and the menus
  let out = await run('remind', null, {}, 'a');
  assert.match(text(out), /Your reminders/);
  assert.equal(out[0].components.length, 4, '3 menus + test button');
  for (const user of ['a', 'b'])
    for (const task of ['puzzle', 'nestword', 'daily'])
      await click(`remind:set:${task}`, user, ['20:00']);
  out = await click('remind:set:daily', 'a', ['off']);
  assert.match(text(out), /no more reminders/);
  assert.equal(reminders.get('g', 'a').daily, null);

  // Make them due now
  db.perform(d => {
    for (const u of ['a', 'b']) {
      const r = d.reminders.g[u];
      for (const t of ['puzzle', 'nestword', 'daily']) if (r[t]) r[t] = '00:00';
      r.sent = {};
    }
  });
  await reminders.tick(client);
  const toA = dms.filter(m => m.to === 'a');
  assert.equal(toA.length, 1, 'one DM with everything that is open');
  assert.match(toA[0].payload, /puzzle is still waiting/);
  assert.match(toA[0].payload, /NestWord/);
  assert.doesNotMatch(toA[0].payload, /daily coins/, 'daily is off for a');
  assert.equal(
    dms.filter(m => m.to === 'b').length,
    0,
    'b did everything: no DM',
  );

  // The panel shows what happened
  assert.equal(reminders.get('g', 'a').last.result, 'sent');
  assert.equal(reminders.get('g', 'b').last.result, 'done');
  out = await run('remind', null, {}, 'a');
  assert.match(text(out), /Last time:.*reminder sent/);

  // 📨 Test DM: works for a; for someone with closed DMs it explains why
  out = await click('remind:test', 'a');
  assert.match(text(out), /Sent! Check your DMs/);
  F.MEMBERS.e.send = async () => {
    const err = new Error('Cannot send messages to this user');
    err.code = 50007;
    throw err;
  };
  out = await click('remind:test', 'e');
  assert.match(text(out), /Direct messages from server members/);

  // Only once a day
  const sentToA = dms.filter(m => m.to === 'a').length;
  await reminders.tick(client);
  assert.equal(dms.filter(m => m.to === 'a').length, sentToA);

  // A time that's already over starts tomorrow (no instant DM)
  db.perform(d => delete d.reminders.g.c);
  await click('remind:set:puzzle', 'c', ['10:00']);
  const hour = new Date().getHours();
  if (hour >= 11) {
    await reminders.tick(client);
    assert.equal(dms.filter(m => m.to === 'c').length, 0);
  }
  console.log('✅ Reminders: DMs only for what is still open, once a day.');
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
