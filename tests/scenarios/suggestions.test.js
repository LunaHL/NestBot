// Scenario test: /suggest ideas, 👍/👎 votes, admin status, DM to the author.
// Run: node tests/scenarios/suggestions.test.js
const assert = require('assert');
const F = require('./fakes');
const { load, run, click, submit, text, general, hub, dms } = F;

const suggestions = load('services/suggestions');
const { setSetting } = load('services/settings');

(async () => {
  // Without a channel setting: posted where it was written
  let out = await run('suggest', null, { idea: 'A cat cafe mode' }, 'a');
  assert.match(text(out), /idea \*\*#1\*\*/);
  const card = general.sent.at(-1);
  assert.match(JSON.stringify(card.payload), /A cat cafe mode/);
  // With the channel setting
  setSetting('g', 'suggestionChannelId', 'hub');
  out = await submit('suggest:new', 'b', { idea: 'Weekly quiz night' });
  assert.match(text(out), /#2/);
  assert.match(JSON.stringify(hub.sent.at(-1).payload), /Weekly quiz night/);

  // Votes: toggle and switch
  out = await click('suggest:up:1', 'b');
  out = await click('suggest:up:1', 'c');
  out = await click('suggest:down:1', 'd');
  let s = suggestions.get('g', 1);
  assert.deepEqual([s.up.length, s.down.length], [2, 1]);
  out = await click('suggest:up:1', 'c'); // take it back
  out = await click('suggest:up:1', 'd'); // switch to 👍
  s = suggestions.get('g', 1);
  assert.deepEqual([s.up.length, s.down.length], [2, 0]);
  assert.match(text(out), /👍/);

  // Top list
  out = await run('suggest', null, {}, 'e');
  assert.match(text(out), /Top ideas/);
  assert.ok(
    text(out).indexOf('#1') < text(out).indexOf('#2'),
    'most liked first',
  );

  // Status: admins only, author gets a DM, voting closes when done
  out = await click('suggest:admin:1', 'b');
  assert.match(text(out), /Only admins/);
  out = await click('suggest:admin:1', 'admin');
  assert.match(text(out), /Status of idea/);
  out = await click('suggest:status:1', 'admin', ['planned']);
  assert.match(text(out), /Planned/);
  assert.ok(dms.some(m => m.to === 'a' && /#1.*Planned/.test(m.payload)));
  await click('suggest:status:1', 'admin', ['done']);
  out = await click('suggest:up:1', 'e');
  assert.match(text(out), /closed/);
  out = await run('suggest', null, {}, 'e');
  assert.ok(
    !text(out).includes('A cat cafe mode'),
    'done ideas leave the top list',
  );
  console.log('✅ Suggestions: ideas, votes, status and DMs work.');
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
