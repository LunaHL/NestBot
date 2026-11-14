// Scenario test: switched-off features are invisible everywhere and come back
// when switched on. Defaults are in src/config/features.js; admins change
// them with /settings features (stored in the database).
// Run: node tests/scenarios/features.test.js
const assert = require('assert');
const F = require('./fakes');
const { load, run, click, text, client } = F;

const features = load('services/features');
const config = load('config/features');
const { inSeason } = load('deploy-commands');
const hub = load('services/hub');
const guide = load('services/guide');
const onInteraction = load('events/interactionCreate');

(async () => {
  // Every feature in the file has a line in /settings features, and back
  for (const key of Object.keys(config))
    assert.ok(features.FEATURES[key], `${key} has a label`);
  for (const key of Object.keys(features.FEATURES))
    assert.ok(key in config, `${key} has a default`);
  assert.equal(features.on('profile'), true, 'unknown names are always on');

  // /remind shows which daily things are on (it's off by default too)
  features.set('remind', true);
  const nestword = client.commands.get('nestword');
  // Off by default
  assert.equal(features.on('nestword'), false);
  assert.equal(features.isOverridden('nestword'), false);
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

  // Switch it on (a database override, the file stays as it is)
  features.set('nestword', true);
  assert.equal(features.on('nestword'), true);
  assert.equal(features.isOverridden('nestword'), true);
  assert.equal(config.nestword, false, 'the file default is untouched');
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
  // Setting it to the file default removes the override
  features.set('nestword', false);
  assert.equal(features.isOverridden('nestword'), false);
  assert.equal(
    F.db.read(d => d.features?.nestword),
    undefined,
    'no override stored',
  );
  features.set('nestword', true);

  // Daily and Gamble are off: no command, no hub button, no reminder, no tip
  for (const name of ['daily', 'gamble']) {
    assert.equal(features.on(name), false);
    assert.equal(inSeason(client.commands.get(name)), false, `/${name} hidden`);
    assert.ok(
      !guide.featureGuide('g').includes(`/${name}`),
      `${name} not in the guide`,
    );
  }
  const hubIds = hub
    .menuMessage()
    .components.flatMap(r => r.toJSON().components)
    .map(c => c.custom_id);
  assert.ok(!hubIds.includes('hub:daily'), 'no daily button');
  out = await run('remind', null, {}, 'a');
  assert.ok(!text(out).includes('Daily coins'), 'no daily reminder');
  // Old buttons of a switched-off command answer politely
  let replied;
  await onInteraction({
    isButton: () => true,
    customId: 'gamble:again',
    client,
    reply: async m => (replied = m),
  });
  assert.match(replied.content, /switched off/);
  // …and so does the command itself (still in someone's old command list)
  out = await run('gamble', null, {}, 'a');
  assert.match(text(out), /switched off/);
  features.set('daily', true);
  assert.equal(inSeason(client.commands.get('daily')), true);
  out = await run('remind', null, {}, 'a');
  assert.ok(text(out).includes('Daily coins'));

  // Commands: feature (one name or all of a list), season, subcommands
  assert.equal(features.commandOn({ feature: 'daily' }), true);
  assert.equal(features.commandOn({ feature: ['daily', 'gamble'] }), false);
  assert.equal(
    features.commandOn({ feature: 'daily', season: () => false }),
    false,
  );
  assert.equal(features.commandOn({}), true);
  const fakeJson = {
    name: 'fake',
    options: [
      { type: 1, name: 'play' },
      { type: 1, name: 'bet' },
      { type: 2, name: 'pool', options: [] },
      { type: 3, name: 'note' },
    ],
  };
  const fake = {
    data: { toJSON: () => fakeJson },
    subFeatures: { bet: 'gamble', pool: () => true },
  };
  let names = features.commandJson(fake).options.map(o => o.name);
  assert.deepEqual(names, ['play', 'pool', 'note'], 'bet is hidden');
  assert.equal(fakeJson.options.length, 4, 'the original is untouched');
  assert.equal(
    features.interactionOn(fake, { options: { getSubcommand: () => 'bet' } }),
    false,
  );
  assert.equal(
    features.interactionOn(fake, { options: { getSubcommand: () => 'play' } }),
    true,
  );
  features.set('gamble', true);
  names = features.commandJson(fake).options.map(o => o.name);
  assert.ok(names.includes('bet'), 'bet is back');
  features.set('gamble', false);
  // Background jobs
  let ran = 0;
  features.only('gamble', () => ran++)();
  features.only('daily', () => ran++)();
  assert.equal(ran, 1, 'only the job of a switched-on feature runs');

  // /settings features: the overview with two menus and a reset button
  out = await run('settings', 'features', {}, 'admin');
  const embed = out[0].embeds[0].toJSON();
  assert.equal(embed.title, '🔌 Features');
  assert.match(embed.description, /Economy, games & social/);
  assert.match(embed.description, /Movies, holidays & extras/);
  assert.match(embed.description, /NestWord: ✅ on \*\(changed here\)\*/);
  assert.match(embed.description, /Gamble: 🔒 off/);
  const rows = out[0].components.map(r => r.toJSON().components[0]);
  assert.equal(rows[0].custom_id, 'settings:features:a');
  assert.equal(rows[1].custom_id, 'settings:features:b');
  assert.equal(rows[2].custom_id, 'settings:features:reset');
  assert.equal(rows[0].max_values, rows[0].options.length);
  assert.ok(rows[0].options.find(o => o.value === 'nestword').default);
  assert.ok(!rows[0].options.find(o => o.value === 'gamble').default);
  assert.ok(rows[1].options.some(o => o.value === 'christmas'));

  // Only admins can change it
  out = await click('settings:features:a', 'a', ['gamble']);
  assert.match(text(out), /Only admins/);
  assert.equal(features.on('gamble'), false);
  // Picked = on, the rest of that menu = off; the other menu stays
  features.set('ai', true);
  out = await click('settings:features:a', 'admin', ['gamble', 'shop']);
  assert.equal(features.on('gamble'), true);
  assert.equal(features.on('shop'), true);
  assert.equal(features.on('nestword'), false);
  assert.equal(features.on('daily'), false);
  assert.equal(features.on('ai'), true, 'group b untouched');
  assert.match(text(out), /command list updates in a moment/);
  assert.match(text(out), /Gamble: ✅ on \*\(changed here\)\*/);
  // Back to the file
  out = await click('settings:features:reset', 'admin');
  for (const key of Object.keys(config)) {
    assert.equal(features.on(key), config[key] !== false, `${key} reset`);
    assert.equal(features.isOverridden(key), false);
  }
  assert.ok(!text(out).includes('changed here'));
  // /settings features itself never disappears
  assert.ok(
    features
      .commandJson(client.commands.get('settings'))
      .options.some(o => o.name === 'features'),
  );

  // ---------- Everything is off now (the file defaults) ----------

  // /leaderboard: only boards that are on, in the option and in the menu
  const boardChoices = () =>
    client.commands
      .get('leaderboard')
      .data.toJSON()
      .options[0].choices.map(c => c.value);
  for (const board of ['duels', 'pictures', 'movies', 'achievements'])
    assert.ok(!boardChoices().includes(board), `no ${board} board`);
  assert.ok(boardChoices().includes('coins'));
  // A switched-off board asked for anyway (old command list): NestCoins
  out = await run('leaderboard', null, { board: 'achievements' }, 'a');
  assert.match(text(out), /NestCoins Leaderboard/);
  assert.ok(!text(out).includes('"value":"achievements"'), 'not in the menu');
  features.set('duel', true);
  assert.ok(boardChoices().includes('duels'), 'back when switched on');
  features.set('duel', false);

  // /profile: tabs of switched-off features are gone
  const tabChoices = () =>
    client.commands
      .get('profile')
      .data.toJSON()
      .options.find(o => o.name === 'tab')
      .choices.map(c => c.value);
  for (const tab of ['fun', 'movies', 'achievements'])
    assert.ok(!tabChoices().includes(tab), `no ${tab} tab`);
  out = await run('profile', null, { tab: 'achievements' }, 'a');
  assert.match(text(out), /Profile for/, 'the overview instead');
  assert.ok(!text(out).includes('🏅 Achievements ('), 'no badges line');
  features.set('watchlist', true); // movies: watch OR watchlist
  assert.ok(tabChoices().includes('movies'));
  features.set('gag', true); // Duels & fun: any of its features
  assert.ok(tabChoices().includes('fun'));
  features.set('watchlist', false);
  features.set('gag', false);

  // Halloween off: never Halloween, not even when forced
  const { isHalloween } = load('utils/time');
  process.env.FORCE_HALLOWEEN = 'true';
  assert.equal(isHalloween(), false);
  features.set('halloween', true);
  assert.equal(isHalloween(), true);
  features.set('halloween', false);
  delete process.env.FORCE_HALLOWEEN;

  // Christmas off: not even in test mode (advent belongs to it)
  const seasons = load('services/seasons');
  seasons.setTest('christmas');
  assert.equal(seasons.active('christmas'), false);
  assert.equal(seasons.active('advent'), false);
  assert.equal(inSeason(client.commands.get('christmas')), false);
  features.set('christmas', true);
  assert.equal(seasons.active('christmas'), true);
  assert.equal(seasons.active('advent'), true);
  features.set('christmas', false);
  seasons.setTest(null);

  // @NestBot: no AI answer while the AI is off
  const ai = load('services/ai');
  const onMessage = load('events/messageCreate');
  const realAsk = ai.handleMessage;
  let asked = 0;
  ai.handleMessage = async () => asked++;
  const ping = () => {
    const { msg } = F.chat('a', '<@BOT> hi');
    msg.mentions.has = () => true;
    return onMessage(msg);
  };
  await ping();
  assert.equal(asked, 0, 'AI off: no answer');
  features.set('ai', true);
  await ping();
  assert.equal(asked, 1, 'AI on: answers');
  ai.handleMessage = realAsk;
  assert.ok(guide.featureGuide('g').includes('💬 Chatting'));
  features.set('ai', false);
  assert.ok(!guide.featureGuide('g').includes('💬 Chatting'), 'help note');

  // Hub menu: no @NestBot or right-click lines, no menu at all when off
  const menuText = JSON.stringify(hub.menuMessage().embeds);
  assert.ok(!menuText.includes('@NestBot'));
  assert.ok(!menuText.includes('Right-click'));
  assert.equal(await hub.postMenu(F.guild), null, 'hub off: nothing posted');

  // Right-click entries: the menu and their own feature
  const gift = client.commands.get('Gift a drink');
  const profileEntry = client.commands.get('View profile');
  features.set('usermenu', true);
  assert.equal(features.commandOn(profileEntry), true);
  assert.equal(features.commandOn(gift), false, 'gifting is still off');
  features.set('drinkgift', true);
  assert.equal(features.commandOn(gift), true);
  features.set('usermenu', false);
  assert.equal(features.commandOn(gift), false);
  features.set('drinkgift', false);

  // Tips: none at all while off, never about a switched-off command
  features.set('daily', true);
  features.set('tips', true);
  for (let n = 0; n < 50; n++) {
    const tip = guide.pickTip('daily', null);
    assert.ok(tip, 'daily has tips that are on');
    assert.ok(!/\/remind|\/shop|blindfold/.test(tip), `no tip about ${tip}`);
  }
  features.set('daily', false);
  features.set('tips', false);

  console.log(
    '✅ Features: invisible when off, back when on, /settings features switches them.',
  );
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
