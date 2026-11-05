// 💡 Ideas for NestBot: anyone posts one, everyone votes 👍/👎, admins set a
// status (planned, in progress, done, declined) and the author gets a DM.
// The Discord side is in commands/suggest.js.
//
// Data: data.suggestions[guildId] = { nextId, items: { id: { id, text, by, at, status,
//         up: [userIds], down: [userIds], channelId, messageId, statusBy, statusAt } } }
// Channel: /settings channels suggestions: (else the channel it was posted in)
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/db');
const ui = require('../utils/ui');

const STATUS = {
  open: { emoji: '🗳️', label: 'Open for votes', color: 0x5865f2 },
  planned: { emoji: '📋', label: 'Planned', color: 0x3498db },
  building: { emoji: '🚧', label: 'In progress', color: 0xf39c12 },
  done: { emoji: '✅', label: 'Done', color: 0x2ecc71 },
  declined: { emoji: '❌', label: 'Declined', color: 0x95a5a6 },
};
const CLOSED = ['done', 'declined'];
const MAX_LENGTH = 1000;

const copy = x => (x ? JSON.parse(JSON.stringify(x)) : x);
const get = (guildId, id) =>
  copy(db.read(d => d.suggestions?.[guildId]?.items?.[id])) || null;
const all = guildId =>
  Object.values(copy(db.read(d => d.suggestions?.[guildId]?.items)) || {});
const score = s => s.up.length - s.down.length;

function update(guildId, id, fn) {
  let r = null;
  db.perform(d => {
    const s = d.suggestions?.[guildId]?.items?.[id];
    if (s) {
      fn(s);
      r = copy(s);
    }
  });
  return r;
}

/** Save a new idea. Returns the suggestion. */
function create(guildId, userId, text) {
  let s;
  db.perform(d => {
    d.suggestions ||= {};
    const g = (d.suggestions[guildId] ||= { nextId: 1, items: {} });
    const id = g.nextId++;
    s = g.items[id] = {
      id,
      text: String(text).trim().slice(0, MAX_LENGTH),
      by: userId,
      at: Date.now(),
      status: 'open',
      up: [],
      down: [],
      channelId: null,
      messageId: null,
    };
  });
  return copy(s);
}

/** 👍 / 👎 (click again to take it back). Returns the suggestion, or { error: 'closed' }. */
function vote(guildId, id, userId, dir) {
  const s = get(guildId, id);
  if (!s) return null;
  if (CLOSED.includes(s.status)) return { error: 'closed' };
  return update(guildId, id, x => {
    const had = (dir === 'up' ? x.up : x.down).includes(userId);
    x.up = x.up.filter(u => u !== userId);
    x.down = x.down.filter(u => u !== userId);
    if (!had) (dir === 'up' ? x.up : x.down).push(userId); // clicking again takes it back
  });
}

function setStatus(guildId, id, status, byId) {
  return update(guildId, id, x => {
    x.status = status;
    x.statusBy = byId;
    x.statusAt = Date.now();
  });
}

/** The card with the vote buttons. */
function card(s) {
  const st = STATUS[s.status] || STATUS.open;
  const closed = CLOSED.includes(s.status);
  return {
    embeds: [
      ui.card({
        title: `💡 Idea #${s.id}`,
        color: st.color,
        text: `${s.text}\n\n— <@${s.by}>`,
        fields: [
          {
            name: 'Votes',
            value: `👍 **${s.up.length}** · 👎 **${s.down.length}**`,
            inline: true,
          },
          { name: 'Status', value: `${st.emoji} ${st.label}`, inline: true },
        ],
        footer: closed
          ? 'Voting is closed'
          : 'Vote with the buttons · discuss in the thread · admins: ⚙️',
      }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`suggest:up:${s.id}`)
          .setEmoji('👍')
          .setLabel(String(s.up.length))
          .setStyle(ButtonStyle.Success)
          .setDisabled(closed),
        new ButtonBuilder()
          .setCustomId(`suggest:down:${s.id}`)
          .setEmoji('👎')
          .setLabel(String(s.down.length))
          .setStyle(ButtonStyle.Danger)
          .setDisabled(closed),
        new ButtonBuilder()
          .setCustomId(`suggest:admin:${s.id}`)
          .setEmoji('⚙️')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

/** Post the card (and a discussion thread). Returns the message or null. */
async function post(client, guildId, s, fallbackChannelId) {
  const { getSetting } = require('./settings');
  const channelId =
    getSetting(guildId, 'suggestionChannelId') || fallbackChannelId;
  const channel =
    channelId && (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return null;
  const msg = await channel.send(card(s)).catch(() => null);
  if (!msg) return null;
  update(guildId, s.id, x => {
    x.channelId = channel.id;
    x.messageId = msg.id;
  });
  await msg
    .startThread?.({ name: `💬 Idea #${s.id}: ${s.text}`.slice(0, 90) })
    .catch(() => {});
  return msg;
}

/** Update the card after votes / status changes. */
async function refresh(client, guildId, id) {
  const s = get(guildId, id);
  if (!s?.messageId) return;
  const channel = await client.channels.fetch(s.channelId).catch(() => null);
  const msg =
    channel && (await channel.messages.fetch(s.messageId).catch(() => null));
  await msg?.edit(card(s)).catch(() => {});
}

/** Open ideas, most liked first. */
function top(guildId, n = 10) {
  return all(guildId)
    .filter(s => !CLOSED.includes(s.status))
    .sort((a, b) => score(b) - score(a) || a.id - b.id)
    .slice(0, n);
}

module.exports = {
  STATUS,
  CLOSED,
  MAX_LENGTH,
  get,
  all,
  create,
  vote,
  setStatus,
  card,
  post,
  refresh,
  top,
  score,
};
