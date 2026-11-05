// Scenario test: switched-off features (NestWord) are invisible everywhere,
// and come back when switched on.
// Run: node tests/scenarios/features.test.js
const assert = require('assert');
const F = require('./fakes');
const { load, run, text, client, guild } = F;

const features = load('services/features');
const { inSeason } = load('deploy-commands');
const hub = load('services/hub');
const guide = load('services/guide');

(async () => {
  const nestword = client.commands.get('nestword');
  // Off by default
  assert.equal(features.on('nestword'), false);
  assert.equal(inSeason(nestword), false, 'not registered in Discord');
  const adminTools = client.commands
    .get('admin')
    .data.toJSON()
    .options.map(g => g.name);
  assert.ok(!adminTools.includes('nestword'), 'no /admin nestword');
  let out = await run('help', null, {}, 'a');
  assert.ok(
    !/nestword/i.test(JSON.stringify(out[0].embeds?.[0] || '')),
    'not in /help overview',
  );
  assert.ok(
    !hub
      .menuMessage()
      .components.flatMap(r => r.toJSON().components)
      .some(c => c.custom_id === 'hub:nestword'),
  );
  out = await run('remind', null, {}, 'a');
  assert.ok(!text(out).includes('NestWord'), 'no NestWord reminder');
  assert.ok(
    !guide.featureGuide('g').includes('/nestword'),
    'NestBot doesn’t mention it',
  );

  // Switch it on
  out = await run('settings', 'features', { nestword: true }, 'admin');
  assert.match(text(out), /NestWord:\*\* ✅ on/);
  assert.equal(inSeason(nestword), true);
  assert.ok(
    client.commands
      .get('admin')
      .data.toJSON()
      .options.some(g => g.name === 'nestword'),
  );
  assert.ok(
    hub
      .menuMessage()
      .components.flatMap(r => r.toJSON().components)
      .some(c => c.custom_id === 'hub:nestword'),
  );
  out = await run('remind', null, {}, 'a');
  assert.ok(text(out).includes('NestWord'));
  assert.ok(guide.featureGuide('g').includes('/nestword'));
  void guild;
  console.log('✅ Features: NestWord is invisible when off and back when on.');
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
