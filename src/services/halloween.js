// 🎃 Halloween event. Everything here is only active on October 31
// (server time zone). Set FORCE_HALLOWEEN=true in .env to test on other days.
const db = require('../utils/db');
const nestcoins = require('./nestcoins');
const gag = require('./gag');
const { isHalloween, localDate, nowInTZ } = require('../utils/time');
const { runEvery } = require('../utils/schedule');

const TRIES_PER_DAY = 3;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const between = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const CANDY = [
  'a lollipop 🍭',
  'a chocolate bar 🍫',
  'a handful of candy corn 🌽',
  'a caramel apple 🍎',
  'gummy worms 🪱',
  'a pumpkin cookie 🎃',
  'a suspicious unlabeled candy 🍬',
];

// Weighted outcomes. Each returns { kind: 'treat'|'trick', text }.
const OUTCOMES = [
  {
    weight: 55,
    run: ({ guildId, userId }) => {
      const coins = between(5, 20);
      nestcoins.addCoins(guildId, userId, coins);
      return {
        kind: 'treat',
        text: `🍬 **Treat!** You got ${pick(CANDY)} and **${coins}** NestCoins.`,
      };
    },
  },
  {
    weight: 5,
    run: ({ guildId, userId }) => {
      nestcoins.addCoins(guildId, userId, 75);
      return {
        kind: 'treat',
        text: '🍫 **JACKPOT!** A FULL-SIZE chocolate bar! The rarest treat of all. **+75** NestCoins!',
      };
    },
  },
  {
    weight: 15,
    run: ({ guildId, userId }) => {
      const balance = nestcoins.getBalance(guildId, userId);
      const lost = Math.min(between(3, 10), balance);
      if (lost > 0) nestcoins.removeCoins(guildId, userId, lost);
      return {
        kind: 'trick',
        text:
          lost > 0
            ? `👻 **Trick!** A ghost picked your pocket and floated away with **${lost}** NestCoins.`
            : '👻 **Trick!** A ghost tried to pick your pocket, found it empty and left looking disappointed.',
      };
    },
  },
  {
    weight: 10,
    run: ({ guildId, userId }) => {
      gag.gagUser(guildId, userId, 60, null);
      return {
        kind: 'trick',
        text: '🧙‍♀️ **Trick!** A witch stole your voice. You are gagged for **1 minute**.',
      };
    },
  },
  {
    weight: 15,
    run: () => ({
      kind: 'trick',
      text: pick([
        '💀 **Trick!** A skeleton opens the door, stares at you for a long time, and closes it again.',
        '🦇 **Trick!** A bat flies out of the candy bowl. The bowl is empty. It was always empty.',
        '🕸️ **Trick!** You walked face-first into a spider web. No candy, just regret.',
      ]),
    }),
  },
];

function rollOutcome() {
  const total = OUTCOMES.reduce((sum, o) => sum + o.weight, 0);
  let roll = Math.random() * total;
  for (const o of OUTCOMES) {
    if ((roll -= o.weight) < 0) return o;
  }
  return OUTCOMES[0];
}

function triesLeft(guildId, userId) {
  const u = db.read(d => d.halloween?.[guildId]?.users?.[userId]);
  const used = u?.lastDate === localDate(0) ? u.todayCount : 0;
  return TRIES_PER_DAY - used;
}

/** Returns { error: 'closed'|'none-left' } or { text, kind, left }. */
function trickOrTreat(guildId, userId) {
  if (!isHalloween()) return { error: 'closed' };
  if (triesLeft(guildId, userId) <= 0) return { error: 'none-left' };

  // Count the try first, so double-clicking can't get extra tries
  db.perform(d => {
    d.halloween ||= {};
    d.halloween[guildId] ||= {};
    d.halloween[guildId].users ||= {};
    const u = (d.halloween[guildId].users[userId] ||= {
      treats: 0,
      tricks: 0,
      years: [],
      todayCount: 0,
      lastDate: null,
    });
    if (u.lastDate !== localDate(0)) {
      u.lastDate = localDate(0);
      u.todayCount = 0;
    }
    u.todayCount++;
    const year = nowInTZ().getFullYear();
    if (!u.years.includes(year)) u.years.push(year);
  });

  const result = rollOutcome().run({ guildId, userId });
  db.perform(d => {
    const u = d.halloween[guildId].users[userId];
    if (result.kind === 'treat') u.treats++;
    else u.tricks++;
  });
  return { ...result, left: triesLeft(guildId, userId) };
}

// Post a one-time "Happy Halloween" message per year in the scoreboard channel
async function announceIfNeeded(client) {
  if (!isHalloween()) return;
  const channel = client.channels.cache.get(process.env.SCOREBOARD_CHANNEL_ID);
  if (!channel?.guild) return;

  const year = nowInTZ().getFullYear();
  const guildId = channel.guild.id;
  if (db.read(d => d.halloween?.[guildId]?.announcedYear) === year) return;
  db.perform(d => {
    d.halloween ||= {};
    d.halloween[guildId] ||= {};
    d.halloween[guildId].announcedYear = year;
  });

  await channel
    .send(
      '🎃 **Happy Halloween, Nest!** 👻\n' +
        `Today only:\n` +
        `• \`/trickortreat\`: ${TRIES_PER_DAY} tries for candy and coins… or a trick\n` +
        `• Spooky drinks at the café: 🧪 Witch's Brew and 🩸 Vampire Latte (\`/coffee menu\`)\n` +
        `• Haunted loot drops appear twice as often\n` +
        `• And NestBot is feeling a little… spooky.\n` +
        `Unlock the 🎃 **Trick or Treater** achievement while you can!`,
    )
    .catch(e => console.error('[Halloween] Announcement failed:', e.message));
}

/** Called once when the bot is ready. */
function startHalloween(client) {
  runEvery('Halloween', 30, () => announceIfNeeded(client));
}

module.exports = { trickOrTreat, triesLeft, startHalloween, TRIES_PER_DAY };
