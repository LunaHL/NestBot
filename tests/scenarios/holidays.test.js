// Scenario test: Christmas (advent, snowballs, tree, Secret Santa), New Year
// and Easter (egg hunt, Bunny Girl, painting), using the test mode.
// Run: node tests/scenarios/holidays.test.js
const assert = require('assert');
const F = require('./fakes');
const {
  load,
  run,
  click,
  submit,
  chat,
  text,
  MEMBERS,
  memberRoles,
  nicknames,
  dms,
  hub,
  client,
  guild,
} = F;

const seasons = load('services/seasons');
const christmas = load('services/christmas');
const easter = load('services/easter');
const coins = load('services/nestcoins');
const { setSetting } = load('services/settings');
const { inSeason } = load('deploy-commands');
const { MENU } = load('config/drinksMenu');

const withRandom = async (value, fn) => {
  const real = Math.random;
  Math.random = () => value;
  try {
    return await fn();
  } finally {
    Math.random = real;
  }
};

(async () => {
  // ---------- Dates ----------
  assert.deepEqual(seasons.easterSunday(2026), { month: 3, day: 5 });
  assert.deepEqual(seasons.easterSunday(2027), { month: 2, day: 28 });
  assert.equal(
    seasons.active('easter', new Date(2026, 3, 3)),
    true,
    'Good Friday',
  );
  assert.equal(
    seasons.active('easter', new Date(2026, 3, 7)),
    false,
    'Tuesday after',
  );
  assert.equal(seasons.active('christmas', new Date(2026, 11, 26)), true);
  assert.equal(seasons.active('christmas', new Date(2026, 11, 27)), false);
  assert.equal(seasons.active('newyear', new Date(2027, 0, 1)), true);

  setSetting('g', 'hubChannelId', 'hub');
  for (const id of Object.keys(MEMBERS)) coins.addCoins('g', id, 300);

  // ---------- 🎄 Christmas (test mode) ----------
  const xmas = client.commands.get('christmas');
  seasons.setTest(null);
  if (!seasons.active('christmas'))
    assert.equal(inSeason(xmas), false, 'hidden outside December');
  await run('settings', 'holidays', { test: 'christmas' }, 'admin');
  assert.equal(seasons.active('christmas'), true);
  assert.equal(inSeason(xmas), true);
  assert.ok(
    Object.keys(MENU).some(
      k =>
        MENU[k].season === 'christmas' &&
        load('services/drinks')
          .availableDrinks()
          .some(([d]) => d === k),
    ),
    'Christmas drinks on the menu',
  );

  // Advent
  let out = await run('christmas', 'advent', {}, 'a');
  assert.match(text(out), /Door \d+/);
  out = await run('christmas', 'advent', {}, 'a');
  assert.match(text(out), /already opened door/);
  assert.equal(seasons.statsOf('g', 'a').adventOpened, 1);

  // Vouchers: a free drink
  seasons.addVoucher('g', 'b', 'drink');
  out = await withRandom(0.9, () =>
    run('drinks', 'order', { drink: 'gluehwein' }, 'b'),
  );
  assert.match(text(out), /voucher/);
  assert.equal(
    F.db.read(d => d.coffee.g.b.spent),
    0,
    'free with voucher',
  );
  assert.equal(seasons.getVouchers('g', 'b').drink, 0, 'voucher used');

  // Snowballs: hit → frozen (❄️ name), frozen can't throw, warm drink thaws
  out = await withRandom(0.1, () =>
    run('christmas', 'snowball', { user: 'c' }, 'a'),
  );
  assert.match(text(out), /SPLAT/);
  assert.ok(christmas.frozenUntil('g', 'c'));
  assert.equal(nicknames.c, '❄️C❄️');
  out = await run('christmas', 'snowball', { user: 'a' }, 'c');
  assert.match(text(out), /frozen solid/);
  out = await run(
    'drinks',
    'gift',
    { user: 'c', drink: 'marshmallowcocoa' },
    'd',
  );
  assert.match(text(out), /thawed/);
  assert.equal(christmas.frozenUntil('g', 'c'), 0);
  assert.equal(nicknames.c, null, 'name back');
  // 3 free a day, then 5 coins
  for (let k = 0; k < 2; k++)
    await withRandom(0.99, () =>
      run('christmas', 'snowball', { user: 'd' }, 'a'),
    );
  const beforeSnow = coins.getBalance('g', 'a');
  out = await withRandom(0.99, () =>
    run('christmas', 'snowball', { user: 'd' }, 'a'),
  );
  assert.match(text(out), /cost 5 coins/);
  assert.equal(beforeSnow - coins.getBalance('g', 'a'), 5);

  // Tree: one ornament a day, goal 50 pays everyone who helped
  out = await run('christmas', 'tree', {}, 'a');
  assert.match(text(out), /Christmas tree/);
  out = await click('christmas:ornament:star', 'a');
  assert.match(text(out), /hung a star/);
  out = await click('christmas:ornament:ball', 'a');
  assert.match(text(out), /already hung/);
  F.db.perform(d => {
    const t = d.christmas.g[seasons.year()].tree;
    for (let k = 0; k < 48; k++)
      t.ornaments.push({ userId: 'e', kind: 'ball', date: '2000-01-01' });
  });
  const beforeTree = coins.getBalance('g', 'e');
  out = await click('christmas:ornament:bell', 'b');
  assert.match(text(out), /50 ornaments/);
  assert.equal(coins.getBalance('g', 'e') - beforeTree, 20);

  // Secret Santa: join → draw → gifts → reveal
  for (const id of ['a', 'b', 'c'])
    await run('christmas', 'join', { wish: `tea for ${id}` }, id, {
      group: 'santa',
    });
  out = await run('settings', 'tools', { action: 'santa-draw' }, 'admin');
  assert.match(text(out), /Drew the names for 3/);
  assert.equal(dms.filter(m => /Secret Santa/.test(m.payload)).length, 3);
  const pairs = christmas.read('g').santa.pairs;
  assert.ok(
    Object.entries(pairs).every(([s, r]) => s !== r),
    'nobody gets themselves',
  );
  const aBefore = coins.getBalance('g', 'a');
  out = await run(
    'christmas',
    'gift',
    { coins: 50, drink: 'eggnog', note: 'Merry!' },
    'a',
    { group: 'santa' },
  );
  assert.match(text(out), /wrapped/);
  assert.equal(aBefore - coins.getBalance('g', 'a'), 50, 'coins put aside');
  await run('christmas', 'gift', { coins: 20 }, 'a', { group: 'santa' });
  assert.equal(
    aBefore - coins.getBalance('g', 'a'),
    20,
    'changed gift refunds the difference',
  );
  await run('christmas', 'gift', { coins: 10 }, 'b', { group: 'santa' });
  const recipientOfA = pairs.a;
  const rBefore = coins.getBalance('g', recipientOfA);
  out = await run('settings', 'tools', { action: 'santa-reveal' }, 'admin');
  assert.match(text(out), /Opened 3 presents/);
  assert.ok(coins.getBalance('g', recipientOfA) - rBefore >= 20);
  assert.equal(seasons.getVouchers('g', recipientOfA).drink >= 0, true);
  assert.equal(seasons.statsOf('g', 'c').coal, 1, 'c forgot: coal');
  assert.match(text(hub.sent.map(m => m.payload)), /The Santas were/);

  // ---------- 🎆 New Year ----------
  await run('settings', 'tools', { action: 'newyear-post' }, 'admin');
  const ny = hub.sent.at(-1).payload.components[0].toJSON()
    .components[0].custom_id;
  const nyBefore = coins.getBalance('g', 'd');
  out = await click(ny, 'd');
  assert.match(text(out), /\+25 coins/);
  assert.equal(coins.getBalance('g', 'd') - nyBefore, 25);
  out = await click(ny, 'd');
  assert.match(text(out), /already toasted/);

  // ---------- 🐣 Easter ----------
  await run('settings', 'holidays', { test: 'easter' }, 'admin');
  assert.equal(seasons.active('christmas'), false);
  assert.equal(inSeason(client.commands.get('easter')), true);

  // An egg hides under a message; first click gets it
  const spawn = async kind => {
    const { msg, replies } = chat('e', 'hello');
    const real = Math.random;
    const weights = Object.entries(easter.EGGS);
    const total = weights.reduce((n, [, x]) => n + x.weight, 0);
    let acc = 0;
    let at = 0;
    for (const [k, x] of weights) {
      if (k === kind) {
        at = (acc + x.weight / 2) / total;
        break;
      }
      acc += x.weight;
    }
    Math.random = () => at;
    load('services/easter').liveEggs.clear();
    const appeared = await easter.maybeEgg(msg, () => 0);
    Math.random = real;
    return {
      appeared,
      id: replies[0]?.payload.components[0].toJSON().components[0].custom_id,
    };
  };
  const egg1 = await spawn('golden');
  assert.ok(egg1.appeared);
  out = await click(egg1.id, 'a');
  assert.match(text(out), /GOLDEN egg/);
  assert.equal(easter.basket('g', 'a').golden, 1);
  assert.equal(easter.basket('g', 'a').coins, 50);
  out = await click(egg1.id, 'b');
  assert.match(text(out), /rolled away|Too slow/);
  const cool = await spawn('normal');
  assert.equal(cool.appeared, false, 'cooldown between eggs');

  // The bunny egg → Bunny Girl outfit (role + 🐰 name)
  const realNow = Date.now;
  Date.now = () => realNow() + 10 * 60000; // past the egg cooldown
  const egg2 = await spawn('bunny');
  Date.now = realNow;
  out = await click(egg2.id, 'b');
  assert.match(text(out), /Bunny Girl/);
  assert.ok(easter.getBunny('g', 'b'));
  assert.equal(nicknames.b, '🐰 B');
  assert.ok([...(memberRoles.b || [])].length, 'pink role');
  // Bunnies get carrot drinks
  out = await withRandom(0.9, () =>
    run('drinks', 'order', { drink: 'carrotlatte' }, 'b'),
  );
  assert.match(text(out), /Carrot Carrot Cake Latte|🥕 Carrot/);

  // Shop: put the outfit on two more → bunny party
  out = await run('shop', 'browse', {}, 'a');
  assert.match(text(out), /Bunny Girl outfit/);
  out = await click('shop:bunnyuser', 'a', ['c']);
  out = await click('shop:bunnyuser', 'a', ['d']);
  assert.match(text(hub.sent.map(m => m.payload)), /BUNNY PARTY/);
  assert.equal(seasons.statsOf('g', 'a').bunnyDressed, 2);
  // Take it off early
  out = await click('shop:pick', 'c', ['bunnyoff']);
  assert.match(text(out), /ears are off/);
  assert.equal(easter.getBunny('g', 'c'), null);

  // Painting, basket, gift
  out = await run('easter', 'paint', {}, 'a');
  assert.match(text(out), /painted a/);
  out = await run('easter', 'paint', {}, 'a');
  assert.match(text(out), /still drying/);
  const myEgg = seasons.statsOf('g', 'a').patterns[0];
  out = await run('easter', 'gift', { user: 'e', egg: myEgg }, 'a');
  assert.match(text(out), /gave/);
  assert.ok(seasons.statsOf('g', 'e').patterns.includes(myEgg));
  out = await run('easter', 'basket', {}, 'a');
  assert.match(text(out), /Easter basket/);

  // Results and achievements
  out = await run('settings', 'tools', { action: 'easter-results' }, 'admin');
  assert.match(text(hub.sent.map(m => m.payload)), /best egg hunters/);
  const ach = load('services/achievements');
  ach.checkAchievements('g', 'a');
  assert.ok(ach.getUnlocked('g', 'a').golden_touch, 'Golden Touch');

  // Test mode off: back to the real date
  await run('settings', 'holidays', { test: 'off' }, 'admin');
  assert.equal(seasons.getTest(), null);
  console.log(
    '✅ Holidays: Christmas, Secret Santa, New Year and Easter work.',
  );
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
