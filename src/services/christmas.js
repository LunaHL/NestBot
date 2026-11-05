// 🎄 Christmas (Dec 1–26) and New Year's Eve: the advent calendar, Secret
// Santa, snowball fights, the server tree and the New Year post.
// The Discord side is in commands/christmas.js; dates and test mode in
// services/seasons.js.
//
// Data: data.christmas[guildId][year] = {
//   advent: { userId: [doors opened] },
//   snow: { userId: { date, thrown } }, frozen: { userId: until },
//   tree: { ornaments: [{ userId, kind, date }], goal50, goal150, boostUntil, posted },
//   santa: { participants: { userId: { wish } }, pairs: { santaId: recipientId },
//            gifts: { santaId: { coins, drink, note } }, drawn, revealed } }
// data.christmas[guildId].newyear[year] = { countdown, posted, cheers: [userIds] }
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('./nestcoins');
const nickname = require('./nickname');
const seasons = require('./seasons');
const { nowInTZ, localDate } = require('../utils/time');
const ui = require('../utils/ui');

const COLOR = 0xc0392b;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const between = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function blank() {
  return {
    advent: {},
    snow: {},
    frozen: {},
    tree: {
      ornaments: [],
      goal50: false,
      goal150: false,
      boostUntil: 0,
      posted: false,
    },
    santa: {
      participants: {},
      pairs: {},
      gifts: {},
      drawn: false,
      revealed: false,
    },
  };
}

/** This year's Christmas data (a copy). */
function read(guildId) {
  const s = db.read(d => d.christmas?.[guildId]?.[seasons.year()]);
  return JSON.parse(JSON.stringify(s || blank()));
}

/** Change this year's Christmas data. */
function change(guildId, fn) {
  let result;
  db.perform(d => {
    d.christmas ||= {};
    d.christmas[guildId] ||= {};
    const s = (d.christmas[guildId][seasons.year()] ||= blank());
    result = fn(s);
  });
  return result;
}

// ---------- 🗓️ Advent calendar ----------

const ADVENT_REWARDS = [
  { weight: 50, kind: 'coins', min: 10, max: 30 },
  { weight: 15, kind: 'coins', min: 30, max: 50 },
  { weight: 15, kind: 'drink' },
  { weight: 12, kind: 'spin' },
  { weight: 8, kind: 'hat' },
];

function rollReward() {
  let r = Math.random() * ADVENT_REWARDS.reduce((n, x) => n + x.weight, 0);
  for (const x of ADVENT_REWARDS) {
    r -= x.weight;
    if (r < 0) return x;
  }
  return ADVENT_REWARDS[0];
}

/**
 * Open today's door. Returns { error: 'closed' | 'opened', day } or
 * { day, text } (what was behind it).
 */
async function openDoor(guild, member) {
  const day = seasons.adventDay();
  if (!day) return { error: 'closed' };
  const userId = member.id;
  if (read(guild.id).advent[userId]?.includes(day))
    return { error: 'opened', day };
  change(guild.id, s => {
    (s.advent[userId] ||= []).push(day);
  });

  let text;
  if (day === 24) {
    nestcoins.addCoins(guild.id, userId, 120);
    seasons.addVoucher(guild.id, userId, 'drink');
    text =
      '🎁 **The big one!** 120 coins and a 🎟️ free drink. Merry Christmas! 🎄';
  } else if (day === 6) {
    nestcoins.addCoins(guild.id, userId, 60);
    seasons.addVoucher(guild.id, userId, 'drink');
    text =
      '🥾 **St. Nicholas’ boot**, full of sweets: 60 coins and a 🎟️ free drink!';
  } else {
    const r = rollReward();
    if (r.kind === 'coins') {
      const n = between(r.min, r.max);
      nestcoins.addCoins(guild.id, userId, n);
      text = `💰 **${n} coins**!`;
    } else if (r.kind === 'drink') {
      seasons.addVoucher(guild.id, userId, 'drink');
      text =
        '🎟️ A **free drink**! It’s used for your next `/drinks order` or gift.';
    } else if (r.kind === 'spin') {
      seasons.addVoucher(guild.id, userId, 'spin');
      text =
        '🎡 A **free wheel spin** on someone else! It’s used for your next `/wheel spin target:`.';
    } else {
      const ok =
        nickname.enabled(guild.id) &&
        !nickname.getActive(guild.id, userId) &&
        !(
          await nickname.apply(
            guild,
            userId,
            `🎅 ${member.displayName}`.slice(0, 32),
            3 * 24 * 60,
            'advent',
            0,
          )
        ).error;
      if (ok)
        text =
          '🎅 A **Santa hat**! You wear 🎅 in front of your name for 3 days.';
      else {
        nestcoins.addCoins(guild.id, userId, 40);
        text = '💰 **40 coins**!';
      }
    }
  }
  const year = seasons.year();
  seasons.bump(guild.id, userId, s => {
    s.adventOpened++;
    s.adventYears[year] = (s.adventYears[year] || 0) + 1;
  });
  return { day, text };
}

/** The calendar as a grid: 🎁 opened · ⭐ today · ❌ missed · 🔒 later. */
function adventGrid(guildId, userId) {
  const today = seasons.adventDay() || 0;
  const opened = read(guildId).advent[userId] || [];
  const cells = [];
  for (let day = 1; day <= 24; day++) {
    const icon = opened.includes(day)
      ? '🎁'
      : day === today
        ? '⭐'
        : day < today
          ? '❌'
          : '🔒';
    cells.push(`${icon}\`${String(day).padStart(2, ' ')}\``);
  }
  const rows = [];
  for (let i = 0; i < 24; i += 6) rows.push(cells.slice(i, i + 6).join(' '));
  return { text: rows.join('\n'), opened: opened.length };
}

// ---------- ❄️ Snowballs ----------

const FREE_SNOWBALLS = 3;
const SNOWBALL_PRICE = 5;
const FROZEN_MIN = 10;

const frozenUntil = (guildId, userId) => {
  const until = read(guildId).frozen[userId] || 0;
  return until > Date.now() ? until : 0;
};

/** Freeze someone for 10 minutes (❄️ around their nickname if possible). */
async function freeze(guild, userId) {
  const until = Date.now() + FROZEN_MIN * 60000;
  change(guild.id, s => {
    s.frozen[userId] = until;
  });
  seasons.bump(guild.id, userId, s => s.snowFrozen++);
  const member = await guild.members.fetch(userId).catch(() => null);
  if (
    member &&
    nickname.enabled(guild.id) &&
    !nickname.getActive(guild.id, userId)
  ) {
    await nickname
      .apply(
        guild,
        userId,
        `❄️${member.displayName}❄️`.slice(0, 32),
        FROZEN_MIN,
        'snowball',
        0,
      )
      .catch(() => {});
  }
  return until;
}

/** Thaw someone early (a hot drink). Returns true if they were frozen. */
async function thaw(guild, userId) {
  if (!frozenUntil(guild.id, userId)) return false;
  change(guild.id, s => {
    delete s.frozen[userId];
  });
  if (nickname.getActive(guild.id, userId)?.by === 'snowball')
    await nickname.restore(guild, userId);
  return true;
}

/**
 * Throw a snowball. Returns { error: 'frozen' | 'coins', until, balance } or
 * { outcome: 'hit' | 'bystander' | 'miss', victimId, paid, left }.
 */
async function throwSnowball(guild, throwerId, targetId) {
  const until = frozenUntil(guild.id, throwerId);
  if (until) return { error: 'frozen', until };
  const today = localDate(0);
  const mine = read(guild.id).snow[throwerId];
  const thrownToday = mine?.date === today ? mine.thrown : 0;
  let paid = 0;
  if (thrownToday >= FREE_SNOWBALLS) {
    const payment = nestcoins.pay(guild.id, throwerId, SNOWBALL_PRICE);
    if (!payment.ok) return { error: 'coins', balance: payment.balance };
    paid = payment.paid;
  }
  change(guild.id, s => {
    s.snow[throwerId] = { date: today, thrown: thrownToday + 1 };
  });

  const r = Math.random();
  let outcome = r < 0.6 ? 'hit' : r < 0.75 ? 'bystander' : 'miss';
  let victimId = outcome === 'hit' ? targetId : null;
  if (outcome === 'bystander') {
    const others = [...(guild.members.cache?.values() || [])].filter(
      m => !m.user?.bot && m.id !== throwerId && m.id !== targetId,
    );
    if (others.length) victimId = pick(others).id;
    else outcome = 'miss';
  }
  if (victimId) {
    await freeze(guild, victimId);
    seasons.bump(guild.id, throwerId, s => s.snowHits++);
  }
  return {
    outcome,
    victimId,
    paid,
    left: Math.max(0, FREE_SNOWBALLS - thrownToday - 1),
  };
}

// ---------- 🎄 The server tree ----------

const ORNAMENTS = {
  ball: { emoji: '🔴', name: 'Ball' },
  star: { emoji: '⭐', name: 'Star' },
  candle: { emoji: '🕯️', name: 'Candle' },
  candy: { emoji: '🍬', name: 'Candy cane' },
  bell: { emoji: '🔔', name: 'Bell' },
};
const GOAL_SMALL = 50;
const GOAL_BIG = 150;
const TREE_ROWS = 8;

/**
 * Hang an ornament (one per person per day). Returns { error: 'today' } or
 * { count, goal: 50 | 150 | null, decorators }.
 */
function decorate(guildId, userId, kind) {
  const today = localDate(0);
  return change(guildId, s => {
    if (s.tree.ornaments.some(o => o.userId === userId && o.date === today))
      return { error: 'today' };
    s.tree.ornaments.push({ userId, kind, date: today });
    seasons.bump(guildId, userId, x => x.ornaments++);
    const count = s.tree.ornaments.length;
    const decorators = [...new Set(s.tree.ornaments.map(o => o.userId))];
    let goal = null;
    if (count >= GOAL_SMALL && !s.tree.goal50) {
      s.tree.goal50 = true;
      goal = GOAL_SMALL;
    }
    if (count >= GOAL_BIG && !s.tree.goal150) {
      s.tree.goal150 = true;
      s.tree.boostUntil = Date.now() + 24 * 3600 * 1000;
      goal = GOAL_BIG;
    }
    return { count, goal, decorators };
  });
}

/** Pay the goal rewards: 50 ornaments → 20 coins for everyone who helped. */
function payGoal(guildId, goal, decorators) {
  if (goal === GOAL_SMALL)
    for (const id of decorators) nestcoins.addCoins(guildId, id, 20);
}

/** Double loot drops after the big goal. */
const lootBoost = guildId => read(guildId).tree.boostUntil > Date.now();

/** The tree as emojis: ornaments fill the rows from the top. */
function treeCard(guildId) {
  const t = read(guildId).tree;
  const icons = t.ornaments.map(o => ORNAMENTS[o.kind]?.emoji || '✨');
  const lines = [t.goal150 ? '🌟' : '☆'];
  let i = 0;
  for (let row = 1; row <= TREE_ROWS; row++) {
    const slots = [];
    for (let k = 0; k < row; k++) slots.push(icons[i++] || '🟩');
    lines.push(slots.join(''));
  }
  lines.push('🟫');
  const width = TREE_ROWS * 2;
  const centered = lines.map(
    l => ' '.repeat(Math.max(0, Math.floor((width - [...l].length) / 2))) + l,
  );
  const decorators = [...new Set(t.ornaments.map(o => o.userId))];
  const next = !t.goal50 ? GOAL_SMALL : !t.goal150 ? GOAL_BIG : null;
  return ui.card({
    title: '🎄 The Nest’s Christmas tree',
    color: 0x27ae60,
    text:
      centered.join('\n') +
      `\n\n**${t.ornaments.length}** ornaments from **${decorators.length}** people` +
      (icons.length > (TREE_ROWS * (TREE_ROWS + 1)) / 2
        ? ' (the tree is full of them!)'
        : '') +
      (next
        ? `\n🎯 Next goal: **${next}** ${next === GOAL_SMALL ? '→ 20 coins for everyone who helped' : '→ the 🌟 lights up and loot drops double for a day'}`
        : '\n🌟 All goals reached!'),
    footer: 'Hang one ornament a day: /christmas tree',
  });
}

const ornamentButtons = () => [
  new ActionRowBuilder().addComponents(
    Object.entries(ORNAMENTS).map(([kind, o]) =>
      new ButtonBuilder()
        .setCustomId(`christmas:ornament:${kind}`)
        .setLabel(o.name)
        .setEmoji(o.emoji)
        .setStyle(ButtonStyle.Secondary),
    ),
  ),
];

// ---------- 🎅 Secret Santa ----------

const SANTA_JOIN_UNTIL = 10; // sign up until Dec 10, then the draw
const REVEAL_HOUR = 18; // Dec 24, 18:00
const BACKUP_GIFT = 20;

/** Sign up. Returns { error: 'drawn' } or { joined, count }. */
function santaJoin(guildId, userId, wish) {
  return change(guildId, s => {
    if (s.santa.drawn) return { error: 'drawn' };
    const joined = !s.santa.participants[userId];
    s.santa.participants[userId] = {
      wish: wish
        ? String(wish).slice(0, 200)
        : s.santa.participants[userId]?.wish || null,
    };
    return { joined, count: Object.keys(s.santa.participants).length };
  });
}

function santaLeave(guildId, userId) {
  return change(guildId, s => {
    if (s.santa.drawn) return { error: 'drawn' };
    const was = !!s.santa.participants[userId];
    delete s.santa.participants[userId];
    return { left: was };
  });
}

/** Draw the pairs (one big circle, so nobody gets themselves) and DM everyone. */
async function santaDraw(client, guildId) {
  const ids = Object.keys(read(guildId).santa.participants);
  if (ids.length < 2) {
    change(guildId, s => {
      s.santa.drawn = true;
    });
    return { error: 'few', count: ids.length };
  }
  const order = [...ids].sort(() => Math.random() - 0.5);
  const pairs = {};
  order.forEach((id, i) => (pairs[id] = order[(i + 1) % order.length]));
  const s = change(guildId, x => {
    x.santa.pairs = pairs;
    x.santa.drawn = true;
    return x.santa;
  });
  for (const [santaId, recipientId] of Object.entries(pairs)) {
    const user = await client.users.fetch(santaId).catch(() => null);
    const wish = s.participants[recipientId]?.wish;
    await user
      ?.send(
        `🎅 **Secret Santa:** you're the Santa of <@${recipientId}>!` +
          (wish
            ? `\n🎁 Their wish: *${wish}*`
            : '\nThey didn’t write a wish. Surprise them!') +
          `\nPrepare your gift with \`/christmas santa gift\` by December 23. It stays secret until Christmas Eve at ${REVEAL_HOUR}:00.`,
      )
      .catch(() => {});
  }
  return { count: ids.length };
}

/**
 * Prepare (or change) your gift. Coins are put aside right away.
 * Returns { error: 'not-drawn' | 'not-santa' | 'revealed' | 'coins', … } or { gift, recipientId }.
 */
function santaGift(guildId, santaId, { coins = 0, drink = null, note = null }) {
  const s = read(guildId).santa;
  if (!s.drawn) return { error: 'not-drawn' };
  if (s.revealed) return { error: 'revealed' };
  const recipientId = s.pairs[santaId];
  if (!recipientId) return { error: 'not-santa' };
  const before = s.gifts[santaId]?.coins || 0;
  if (coins > before) {
    if (nestcoins.removeCoins(guildId, santaId, coins - before) === null)
      return {
        error: 'coins',
        balance: nestcoins.getBalance(guildId, santaId),
      };
  } else if (coins < before)
    nestcoins.addCoins(guildId, santaId, before - coins);
  const gift = { coins, drink, note: note ? String(note).slice(0, 300) : null };
  change(guildId, x => {
    x.santa.gifts[santaId] = gift;
  });
  return { gift, recipientId };
}

/** Open all gifts in the holiday channel, pay them out, reveal the Santas. */
async function santaReveal(client, guildId) {
  const s = read(guildId).santa;
  if (!s.drawn || s.revealed || !Object.keys(s.pairs).length)
    return { error: 'nothing' };
  change(guildId, x => {
    x.santa.revealed = true;
  });
  const channel = await seasons.holidayChannel(client, guildId);
  const { MENU } = require('../config/drinksMenu');
  const lines = [];
  for (const [santaId, recipientId] of Object.entries(s.pairs)) {
    const gift = s.gifts[santaId];
    if (gift) {
      if (gift.coins) nestcoins.addCoins(guildId, recipientId, gift.coins);
      if (gift.drink) seasons.addVoucher(guildId, recipientId, 'drink');
      seasons.bump(guildId, santaId, x => x.santaGifts++);
      const parts = [
        gift.coins ? `💰 ${gift.coins} coins` : null,
        gift.drink ? `🎟️ a ${MENU[gift.drink]?.name || 'drink'}` : null,
      ].filter(Boolean);
      lines.push(
        `🎁 For <@${recipientId}>: ${parts.join(' + ') || 'a warm hug 🤗'}${gift.note ? `\n> ${gift.note}` : ''}`,
      );
    } else {
      nestcoins.addCoins(guildId, recipientId, BACKUP_GIFT);
      seasons.bump(guildId, santaId, x => x.coal++);
      lines.push(
        `🎁 For <@${recipientId}>: 💰 ${BACKUP_GIFT} coins from NestBot (their Santa forgot… 🪨)`,
      );
    }
  }
  if (channel) {
    await channel
      .send({
        content: '🎅 **Ho ho ho! Secret Santa time!** Let’s open the presents…',
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
    for (let i = 0; i < lines.length; i += 5) {
      await channel
        .send({
          embeds: [
            ui.card({ color: COLOR, text: lines.slice(i, i + 5).join('\n\n') }),
          ],
          allowedMentions: { users: Object.values(s.pairs) },
        })
        .catch(() => {});
    }
    await channel
      .send({
        embeds: [
          ui.card({
            title: '🎅 The Santas were…',
            color: COLOR,
            text: Object.entries(s.pairs)
              .map(
                ([santaId, recipientId]) =>
                  `<@${santaId}> → <@${recipientId}>${s.gifts[santaId] ? '' : ' 🪨'}`,
              )
              .join('\n'),
            footer: '🪨 = forgot their gift and gets coal. Merry Christmas! 🎄',
          }),
        ],
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  }
  return { count: lines.length };
}

// ---------- 🎆 New Year ----------

const NEW_YEAR_COINS = 25;

function newYearState(guildId, yr) {
  return db.read(d => d.christmas?.[guildId]?.newyear?.[yr]) || {};
}
function changeNewYear(guildId, yr, fn) {
  let r;
  db.perform(d => {
    d.christmas ||= {};
    d.christmas[guildId] ||= {};
    d.christmas[guildId].newyear ||= {};
    r = fn((d.christmas[guildId].newyear[yr] ||= { cheers: [] }));
  });
  return r;
}

async function postNewYear(client, guildId, yr, kind) {
  const channel = await seasons.holidayChannel(client, guildId);
  if (!channel) return false;
  if (kind === 'countdown') {
    await channel
      .send({
        content: `🎆 **10 minutes left in ${yr - 1}!** Grab a drink, the countdown is on… 🥂`,
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
    return true;
  }
  await channel
    .send({
      embeds: [
        ui.card({
          title: `🎆 Happy New Year ${yr}! 🥂`,
          color: 0xf1c40f,
          text: `Cheers, everyone! Click below for your New Year’s **${NEW_YEAR_COINS} coins**. ✨`,
        }),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`christmas:cheers:${yr}`)
            .setLabel('Cheers!')
            .setEmoji('🥂')
            .setStyle(ButtonStyle.Success),
        ),
      ],
    })
    .catch(() => {});
  return true;
}

/** 🥂 clicked. Returns 'ok' | 'already'. */
function cheers(guildId, yr, userId) {
  const done = changeNewYear(guildId, yr, s => {
    if (s.cheers.includes(userId)) return true;
    s.cheers.push(userId);
    return false;
  });
  if (done) return 'already';
  nestcoins.addCoins(guildId, userId, NEW_YEAR_COINS);
  return 'ok';
}

// ---------- Jobs ----------

async function tick(client) {
  const now = nowInTZ();
  const m = now.getMonth();
  const day = now.getDate();
  const hour = now.getHours();
  for (const guild of client.guilds.cache.values()) {
    const s = read(guild.id);
    // Thaw people whose 10 minutes are over
    const melted = Object.entries(s.frozen).filter(
      ([, until]) => until <= Date.now(),
    );
    if (melted.length)
      change(guild.id, x => melted.forEach(([id]) => delete x.frozen[id]));
    // Real dates only when holidays are switched on (/settings holidays enabled:)
    if (!seasons.isEnabled()) continue;
    if (m === 11) {
      if (
        day >= SANTA_JOIN_UNTIL &&
        day < 24 &&
        !s.santa.drawn &&
        Object.keys(s.santa.participants).length
      )
        await santaDraw(client, guild.id);
      if (day === 24 && hour >= REVEAL_HOUR) {
        if (s.santa.drawn && !s.santa.revealed)
          await santaReveal(client, guild.id);
        if (!s.tree.posted && s.tree.ornaments.length) {
          change(guild.id, x => {
            x.tree.posted = true;
          });
          const ch = await seasons.holidayChannel(client, guild.id);
          await ch
            ?.send({
              content:
                '🎄 **Our finished Christmas tree!** Thank you to everyone who helped decorate. Merry Christmas!',
              embeds: [treeCard(guild.id)],
              allowedMentions: { parse: [] },
            })
            .catch(() => {});
        }
      }
      if (day === 31 && hour === 23 && now.getMinutes() >= 50) {
        const yr = now.getFullYear() + 1;
        if (!newYearState(guild.id, yr).countdown) {
          changeNewYear(guild.id, yr, x => (x.countdown = true));
          await postNewYear(client, guild.id, yr, 'countdown');
        }
      }
    }
    if (m === 0 && day === 1 && hour < 2) {
      const yr = now.getFullYear();
      if (!newYearState(guild.id, yr).posted) {
        changeNewYear(guild.id, yr, x => (x.posted = true));
        await postNewYear(client, guild.id, yr, 'newyear');
      }
    }
  }
}

function startChristmas(client) {
  require('../utils/schedule').runEvery('Christmas', 5, () => tick(client));
}

module.exports = {
  COLOR,
  ORNAMENTS,
  FREE_SNOWBALLS,
  SNOWBALL_PRICE,
  FROZEN_MIN,
  GOAL_SMALL,
  GOAL_BIG,
  REVEAL_HOUR,
  SANTA_JOIN_UNTIL,
  read,
  openDoor,
  adventGrid,
  throwSnowball,
  freeze,
  thaw,
  frozenUntil,
  decorate,
  payGoal,
  lootBoost,
  treeCard,
  ornamentButtons,
  santaJoin,
  santaLeave,
  santaDraw,
  santaGift,
  santaReveal,
  postNewYear,
  cheers,
  tick,
  startChristmas,
};
