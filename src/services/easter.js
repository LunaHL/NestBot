// 🐣 Easter (Good Friday – Easter Monday): the egg hunt, the 🐰 Bunny Girl
// outfit and egg painting. The Discord side is in commands/easter.js; dates
// and test mode in services/seasons.js.
//
// Data: data.easter[guildId][year] = {
//   eggs: { userId: { normal, painted, golden, prank, bunny, coins } },
//   paint: { userId: date }, bunnies: { userId: { until, by, price, nick } },
//   party: date, announced }
// Painted egg collections are lifetime: data.seasonStats[…].patterns
// Settings: easterEnabled (eggs), bunnyEnabled, bunnyRoleId
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('./nestcoins');
const nickname = require('./nickname');
const seasons = require('./seasons');
const { getSetting, setSetting } = require('./settings');
const { nowInTZ, localDate } = require('../utils/time');
const ui = require('../utils/ui');

const COLOR = 0xf8a5c2;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function blank() {
  return { eggs: {}, paint: {}, bunnies: {}, party: null, announced: false };
}
function read(guildId) {
  return JSON.parse(
    JSON.stringify(
      db.read(d => d.easter?.[guildId]?.[seasons.year()]) || blank(),
    ),
  );
}
function change(guildId, fn) {
  let r;
  db.perform(d => {
    d.easter ||= {};
    d.easter[guildId] ||= {};
    r = fn((d.easter[guildId][seasons.year()] ||= blank()));
  });
  return r;
}

// ---------- 🥚 Egg hunt ----------

const EGGS = {
  normal: { weight: 58, emoji: '🥚', name: 'an egg', coins: 5 },
  painted: { weight: 25, emoji: '🌈', name: 'a painted egg', coins: 15 },
  golden: { weight: 7, emoji: '🥇', name: 'a GOLDEN egg', coins: 50 },
  prank: { weight: 6, emoji: '💣', name: 'a prank egg', coins: 0 },
  bunny: { weight: 4, emoji: '🐰', name: 'the BUNNY egg', coins: 10 },
};
const EGG_CHANCE = 1 / 12; // per chat message
const EGG_COOLDOWN_MS = 4 * 60000; // per server
const EGG_LIFETIME_MS = 2 * 60000;

const lastEgg = new Map(); // guildId → time
const liveEggs = new Map(); // eggId → { guildId, kind, claimed }
let eggCounter = 0;

function rollEgg() {
  let r = Math.random() * Object.values(EGGS).reduce((n, e) => n + e.weight, 0);
  for (const [kind, e] of Object.entries(EGGS)) {
    r -= e.weight;
    if (r < 0) return kind;
  }
  return 'normal';
}

const huntOn = guildId =>
  seasons.active('easter') && getSetting(guildId, 'easterEnabled') !== false;

/** messageCreate: sometimes an egg hides under a message. Returns true if one appeared. */
async function maybeEgg(message, random = Math.random) {
  if (message.author.bot || !huntOn(message.guild.id)) return false;
  if (Date.now() - (lastEgg.get(message.guild.id) || 0) < EGG_COOLDOWN_MS)
    return false;
  if (random() >= EGG_CHANCE) return false;
  lastEgg.set(message.guild.id, Date.now());
  const id = `${Date.now().toString(36)}${(eggCounter++).toString(36)}`;
  liveEggs.set(id, {
    guildId: message.guild.id,
    kind: rollEgg(),
    claimed: false,
  });
  const reply = await message
    .reply({
      content: '🥚 *Psst… an egg is hiding here!*',
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`easter:egg:${id}`)
            .setLabel('Grab it!')
            .setEmoji('🧺')
            .setStyle(ButtonStyle.Success),
        ),
      ],
      allowedMentions: { repliedUser: false },
    })
    .catch(() => null);
  setTimeout(() => {
    const egg = liveEggs.get(id);
    liveEggs.delete(id);
    if (egg && !egg.claimed)
      reply
        ?.edit({ content: '🐣 *The egg rolled away…*', components: [] })
        .catch(() => {});
  }, EGG_LIFETIME_MS).unref?.();
  return true;
}

/** Someone clicked an egg. Returns { error: 'gone' | 'taken' } or { kind, text }. */
async function grabEgg(guild, member, id) {
  const egg = liveEggs.get(id);
  if (!egg) return { error: 'gone' };
  if (egg.claimed) return { error: 'taken' };
  egg.claimed = true; // before any await: no double claims
  liveEggs.delete(id);
  const e = EGGS[egg.kind];
  const userId = member.id;
  if (e.coins) nestcoins.addCoins(guild.id, userId, e.coins);
  change(guild.id, s => {
    const b = (s.eggs[userId] ||= {
      normal: 0,
      painted: 0,
      golden: 0,
      prank: 0,
      bunny: 0,
      coins: 0,
    });
    b[egg.kind]++;
    b.coins += e.coins;
  });
  seasons.bump(guild.id, userId, s => {
    s.eggs++;
    if (egg.kind === 'golden') s.goldenEggs++;
    if (egg.kind === 'bunny') s.bunnyEggs++;
  });
  let text = `${e.emoji} <@${userId}> found **${e.name}**!${e.coins ? ` +${e.coins} coins` : ''}`;
  if (egg.kind === 'prank') {
    require('./gag').gagUser(guild.id, userId, 60, null);
    text +=
      '\n🎉 *POP!* Confetti everywhere… and you’re gagged for a minute. 🤐';
  }
  if (egg.kind === 'bunny') {
    const r = await putOnBunny(guild, userId, null, 0);
    text += r.error
      ? ''
      : '\n🐰 Inside: the **Bunny Girl** outfit! Wear it with pride for a day. *hops*';
  }
  return { kind: egg.kind, text };
}

// ---------- 🐰 Bunny Girl ----------

const BUNNY_HOURS = 24;
const BUNNY_PRICE = 60;
const ROLE_NAME = '🐰 Bunny Girl';
const HOP_EVERY = 4; // every 4th message of a bunny gets a *hop*
const PARTY_SIZE = 3;
const hopCounter = new Map();

const bunnyOn = guildId => getSetting(guildId, 'bunnyEnabled') !== false;

function getBunny(guildId, userId) {
  const b = read(guildId).bunnies[userId];
  return b && b.until > Date.now() ? b : null;
}
const activeBunnies = guildId =>
  Object.entries(read(guildId).bunnies).filter(([, b]) => b.until > Date.now());

async function bunnyRole(guild) {
  const id = getSetting(guild.id, 'bunnyRoleId');
  let role = id ? await guild.roles.fetch(id).catch(() => null) : null;
  if (!role) {
    role = await guild.roles
      .create({
        name: ROLE_NAME,
        color: 0xff8fc7,
        permissions: [],
        reason: 'Easter bunny outfit',
      })
      .catch(() => null);
    if (role) setSetting(guild.id, 'bunnyRoleId', role.id);
  }
  return role;
}

/**
 * Put the outfit on someone for a day: pink role, 🐰 in front of the name,
 * *hops*, carrot drinks. Returns { error: 'off' | 'bot' | 'not-found' } or { until, party }.
 */
async function putOnBunny(guild, userId, byId, price) {
  if (!bunnyOn(guild.id)) return { error: 'off' };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { error: 'not-found' };
  if (member.user?.bot) return { error: 'bot' };
  const role = await bunnyRole(guild);
  if (role)
    await member.roles.add(role.id, 'Bunny Girl outfit').catch(() => {});
  let nick = false;
  if (nickname.enabled(guild.id) && !nickname.getActive(guild.id, userId)) {
    nick = !(
      await nickname.apply(
        guild,
        userId,
        `🐰 ${member.displayName}`.slice(0, 32),
        BUNNY_HOURS * 60,
        'bunny',
        0,
      )
    ).error;
  }
  const until = Date.now() + BUNNY_HOURS * 3600 * 1000;
  change(guild.id, s => {
    s.bunnies[userId] = { until, by: byId, price, nick };
  });
  seasons.bump(guild.id, userId, s => s.bunnyWorn++);
  if (byId && byId !== userId)
    seasons.bump(guild.id, byId, s => s.bunnyDressed++);
  return { until, party: await maybeParty(guild) };
}

/** Take the outfit off (early or when the day is over). */
async function takeOffBunny(guild, userId) {
  const b = read(guild.id).bunnies[userId];
  if (!b) return false;
  change(guild.id, s => {
    delete s.bunnies[userId];
  });
  const roleId = getSetting(guild.id, 'bunnyRoleId');
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member && roleId) await member.roles.remove(roleId).catch(() => {});
  if (nickname.getActive(guild.id, userId)?.by === 'bunny')
    await nickname.restore(guild, userId);
  return true;
}

/** 3+ bunnies at once: a bunny party (once a day), 10 coins each. */
async function maybeParty(guild) {
  const bunnies = activeBunnies(guild.id);
  const today = localDate(0);
  if (bunnies.length < PARTY_SIZE || read(guild.id).party === today)
    return false;
  change(guild.id, s => {
    s.party = today;
  });
  for (const [id] of bunnies) nestcoins.addCoins(guild.id, id, 10);
  const ch = await seasons.holidayChannel(guild.client, guild.id);
  await ch
    ?.send({
      content: `🐰🐰🐰 **BUNNY PARTY!** ${bunnies.map(([id]) => `<@${id}>`).join(' ')} are hopping around together. +10 coins each! *hop hop*`,
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
  return true;
}

/** messageCreate: bunnies hop now and then. */
async function maybeHop(message) {
  if (message.author.bot || !getBunny(message.guild.id, message.author.id))
    return;
  const n = (hopCounter.get(message.author.id) || 0) + 1;
  hopCounter.set(message.author.id, n);
  await message.react('🐰').catch(() => {});
  if (n % HOP_EVERY === 0) {
    await message
      .reply({
        content: pick([
          '*hops* 🐇',
          '*wiggles nose* 🐰',
          '*hop hop* 🥕',
          '*thumps foot* 🐇',
        ]),
        allowedMentions: { repliedUser: false },
      })
      .catch(() => {});
  }
}

// ---------- 🎨 Egg painting ----------

const COLORS = [
  '🔴 red',
  '🟠 orange',
  '🟡 yellow',
  '🟢 green',
  '🔵 blue',
  '🟣 purple',
  '🩷 pink',
  '🤍 white',
];
const PATTERNS = [
  'zigzag',
  'polka dot',
  'striped',
  'flowery',
  'starry',
  'swirly',
  'checkered',
  'glittery',
];
const ARTIST_GOAL = 10;

/** Paint today's egg (once a day). Returns { error: 'today' } or { egg, isNew, total }. */
function paintEgg(guildId, userId) {
  const today = localDate(0);
  if (read(guildId).paint[userId] === today) return { error: 'today' };
  change(guildId, s => {
    s.paint[userId] = today;
  });
  const egg = `${pick(COLORS)} ${pick(PATTERNS)} egg`;
  let isNew = false;
  let total = 0;
  seasons.bump(guildId, userId, s => {
    isNew = !s.patterns.includes(egg);
    if (isNew) s.patterns.push(egg);
    total = s.patterns.length;
  });
  return { egg, isNew, total };
}

/** Give one of your painted eggs to someone. Returns false if you don't have it. */
function giveEgg(guildId, fromId, toId, egg) {
  if (!seasons.statsOf(guildId, fromId).patterns.includes(egg)) return false;
  seasons.bump(
    guildId,
    fromId,
    s => (s.patterns = s.patterns.filter(p => p !== egg)),
  );
  seasons.bump(guildId, toId, s => {
    if (!s.patterns.includes(egg)) s.patterns.push(egg);
  });
  return true;
}

// ---------- Results and jobs ----------

function basket(guildId, userId) {
  return (
    read(guildId).eggs[userId] || {
      normal: 0,
      painted: 0,
      golden: 0,
      prank: 0,
      bunny: 0,
      coins: 0,
    }
  );
}

const eggCount = b => b.normal + b.painted + b.golden + b.prank + b.bunny;

/** The best egg hunters of this Easter: [[userId, count]] */
function hunters(guildId, n = 10) {
  return Object.entries(read(guildId).eggs)
    .map(([id, b]) => [id, eggCount(b)])
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

async function postResults(client, guildId) {
  const top = hunters(guildId, 5);
  if (!top.length) return false;
  const ch = await seasons.holidayChannel(client, guildId);
  if (!ch) return false;
  await ch
    .send({
      embeds: [
        ui.card({
          title: '🧺 The best egg hunters this Easter',
          color: COLOR,
          text: top
            .map(([id, c], i) => `${ui.rank(i)} <@${id}> · **${c}** eggs`)
            .join('\n'),
          footer: 'Happy Easter! 🐣',
        }),
      ],
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
  return true;
}

async function tick(client) {
  const now = nowInTZ();
  for (const guild of client.guilds.cache.values()) {
    // Bunnies whose day is over
    for (const [id, b] of Object.entries(read(guild.id).bunnies))
      if (b.until <= Date.now()) await takeOffBunny(guild, id);
    // Easter Monday evening: the best egg hunters
    if (
      seasons.daysFromEaster(now) === 1 &&
      now.getHours() >= 20 &&
      !read(guild.id).announced
    ) {
      change(guild.id, s => {
        s.announced = true;
      });
      await postResults(client, guild.id);
    }
  }
}

function startEaster(client) {
  require('../utils/schedule').runEvery('Easter', 5, () => tick(client));
}

module.exports = {
  COLOR,
  EGGS,
  BUNNY_PRICE,
  BUNNY_HOURS,
  ARTIST_GOAL,
  read,
  huntOn,
  bunnyOn,
  maybeEgg,
  grabEgg,
  putOnBunny,
  takeOffBunny,
  getBunny,
  activeBunnies,
  maybeHop,
  paintEgg,
  giveEgg,
  basket,
  eggCount,
  hunters,
  postResults,
  tick,
  startEaster,
  liveEggs,
};
