// ⏰ Reminders people sign up for: "DM me at 20:00 if I haven't done today's
// puzzle yet". Nothing is sent if it's already done. Set with /remind.
//
// Data: data.reminders[guildId][userId] = { puzzle: "20:00" | null, nestword, daily,
//         sent: { puzzle: "YYYY-MM-DD", … } }
// Times are server time (TIMEZONE in .env).
const db = require('../utils/db');
const { nowInTZ, localDate } = require('../utils/time');

/** What can be reminded, and how to tell if it's still open today. */
const TASKS = {
  puzzle: {
    emoji: '🧩',
    label: 'Puzzle of the Day',
    open: (guildId, userId) => {
      const puzzles = require('./puzzle');
      const p = puzzles.getPuzzle(localDate(0));
      return (
        !!p &&
        !(p.solvedBy || []).includes(userId) &&
        puzzles.wrongTriesLeft(p, userId) > 0
      );
    },
    text: () => {
      const p = require('./puzzle').getPuzzle(localDate(0));
      return `🧩 Today’s puzzle is still waiting for you!${p?.link ? ` ${p.link}` : ''}\nFound the code? Press **🔑 Enter code** on the puzzle card (or \`/puzzle info\`).`;
    },
  },
  nestword: {
    emoji: '🟩',
    label: 'NestWord',
    open: (guildId, userId) => {
      const daily = db.read(d => d.nestwordDaily?.[localDate(0)]);
      if (!daily) return false;
      if ((daily.solvedBy || []).includes(userId)) return false;
      return (daily.guesses?.[userId] || 0) < (daily.attempts || 6);
    },
    text: () =>
      '🟩 You haven’t finished today’s NestWord yet! `/nestword guess`',
  },
  daily: {
    emoji: '💰',
    label: 'Daily coins',
    open: (guildId, userId) =>
      db.read(d => d.dailyClaims?.[guildId]?.[userId]) !== localDate(0),
    text: () => '💰 Your daily coins are still there! `/daily`',
  },
};

/** Times people can pick. */
/** The tasks people can pick right now (NestWord only when it's switched on). */
const activeTasks = () =>
  Object.fromEntries(
    Object.entries(TASKS).filter(
      ([key]) => key !== 'nestword' || require('./features').on('nestword'),
    ),
  );

const TIMES = [
  '10:00',
  '12:00',
  '14:00',
  '16:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
  '23:00',
];

const get = (guildId, userId) => ({
  puzzle: null,
  nestword: null,
  daily: null,
  sent: {},
  ...(db.read(d => d.reminders?.[guildId]?.[userId]) || {}),
});

/** Set (or clear with null) one reminder. */
function set(guildId, userId, task, time) {
  db.perform(d => {
    d.reminders ||= {};
    d.reminders[guildId] ||= {};
    const r = (d.reminders[guildId][userId] ||= { sent: {} });
    r[task] = time || null;
    // Picked a time that's already over today? Then it starts tomorrow
    const now = nowInTZ();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    r.sent ||= {};
    if (time && time <= hhmm) r.sent[task] = localDate(0);
  });
  return get(guildId, userId);
}

/** Every few minutes: send the DMs that are due, if the task is still open. */
async function tick(client) {
  const now = nowInTZ();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = localDate(0);
  const all = db.read(d => d.reminders || {});
  for (const [guildId, users] of Object.entries(all)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    for (const [userId, r] of Object.entries(users)) {
      const due = Object.keys(activeTasks()).filter(
        t => r[t] && r[t] <= hhmm && r.sent?.[t] !== today,
      );
      if (!due.length) continue;
      db.perform(d => {
        const x = d.reminders[guildId][userId];
        x.sent ||= {};
        for (const t of due) x.sent[t] = today;
      });
      const open = due.filter(t => TASKS[t].open(guildId, userId));
      if (!open.length) {
        remember(guildId, userId, {
          at: hhmm,
          date: today,
          result: 'done',
          tasks: due,
        });
        continue;
      }
      const sent = await sendDM(
        client,
        userId,
        `⏰ **Reminder from ${guild.name}**\n${open.map(t => TASKS[t].text()).join('\n\n')}\n\n*Change or stop reminders with \`/remind\`.*`,
      );
      remember(guildId, userId, {
        at: hhmm,
        date: today,
        result: sent.ok ? 'sent' : 'failed',
        error: sent.error || null,
        tasks: open,
      });
      console.log(
        `[Reminders] ${sent.ok ? 'Sent' : 'Could not send'} reminder (${open.join(', ')}) to ${userId}${sent.error ? `: ${sent.error}` : ''}`,
      );
    }
  }
}

/** Remember what happened last time (shown in /remind). */
function remember(guildId, userId, last) {
  db.perform(d => {
    const r = d.reminders?.[guildId]?.[userId];
    if (r) r.last = last;
  });
}

/**
 * Send a DM. Returns { ok } or { ok: false, error } ('dms-closed' = Discord
 * error 50007: the person doesn't accept DMs from the bot).
 */
async function sendDM(client, userId, content) {
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return { ok: false, error: 'user not found' };
  try {
    await user.send(content);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.code === 50007 ? 'dms-closed' : e.message };
  }
}

function startReminders(client) {
  require('../utils/schedule').runEvery('Reminders', 5, () => tick(client));
}

module.exports = {
  TASKS,
  activeTasks,
  TIMES,
  get,
  set,
  tick,
  sendDM,
  startReminders,
};
