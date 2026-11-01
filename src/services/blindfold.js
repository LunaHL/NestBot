// 🙈 Blindfolds: the partner of the gag. A blindfolded member gets the
// "🙈 Blindfolded" role, which can't see any channel except "🕶️ in-the-dark".
// There NestBot whispers what they're missing (mentions, busy channels) and
// sums it up when the blindfold comes off.
//
// Setup (once): /settings blindfold enabled:true creates the role, the dark
// channel and a "can't see" overwrite for the role on every channel.
// Off again: enabled:false removes all of it.
//
// Data: data.blindfolds[guildId][userId] = { until, by, startedAt, missed,
//   channels: { channelId: count }, mentions: [channelId], lastWhisper, seen }
// data.blindfoldStats[guildId][userId] = { given, received }
// Settings: blindfoldRoleId, blindfoldChannelId (services/settings.js)
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/db');
const { getSetting, setSetting } = require('./settings');
const { runEvery } = require('../utils/schedule');

const ROLE_NAME = '🙈 Blindfolded';
const CHANNEL_NAME = '🕶️in-the-dark';
const WHISPER_EVERY_MS = 3 * 60000; // "you hear people chatting" at most every 3 min
const MAX_SEC = 3 * 3600; // stacking stops at 3 hours

const VIEW = PermissionFlagsBits.ViewChannel;

function config(guildId) {
  return {
    roleId: getSetting(guildId, 'blindfoldRoleId'),
    channelId: getSetting(guildId, 'blindfoldChannelId'),
  };
}
const isSetUp = guildId => !!config(guildId).roleId;

const all = guildId => db.read(d => d.blindfolds?.[guildId]) || {};
function getActive(guildId, userId) {
  const r = db.read(d => d.blindfolds?.[guildId]?.[userId]);
  return r && r.until > Date.now() ? { ...r } : null;
}
const getStats = (guildId, userId) => ({
  given: 0,
  received: 0,
  ...(db.read(d => d.blindfoldStats?.[guildId]?.[userId]) || {}),
});

const darkChannel = guild =>
  guild.channels.cache.get(config(guild.id).channelId) || null;

/** Give the role a "can't see" overwrite on every channel that doesn't have one yet. */
async function hideChannels(guild) {
  const { roleId, channelId } = config(guild.id);
  let changed = 0;
  for (const channel of guild.channels.cache.values()) {
    if (
      channel.id === channelId ||
      channel.isThread?.() ||
      !channel.permissionOverwrites
    )
      continue;
    const ow = channel.permissionOverwrites.cache?.get(roleId);
    if (ow?.deny?.has?.(VIEW)) continue;
    try {
      await channel.permissionOverwrites.edit(
        roleId,
        { ViewChannel: false },
        { reason: 'Blindfold setup' },
      );
      changed++;
    } catch (e) {
      console.error(`[Blindfold] couldn't hide #${channel.name}:`, e.message);
    }
  }
  return changed;
}

/** Channels other roles explicitly allow: a blindfolded member with such a role could still see them. */
function leaks(guild) {
  const { roleId, channelId } = config(guild.id);
  const out = [];
  for (const channel of guild.channels.cache.values()) {
    if (channel.id === channelId || !channel.permissionOverwrites?.cache)
      continue;
    const allows = [...channel.permissionOverwrites.cache.values()].some(
      ow =>
        ow.id !== roleId &&
        ow.id !== guild.id &&
        ow.type === 0 &&
        ow.allow?.has?.(VIEW),
    );
    if (allows) out.push(channel);
  }
  return out;
}

/** Create role, dark channel and overwrites. Returns { hidden, leaks }. */
async function setup(guild) {
  let { roleId, channelId } = config(guild.id);
  let role = roleId ? await guild.roles.fetch(roleId).catch(() => null) : null;
  if (!role) {
    role = await guild.roles.create({
      name: ROLE_NAME,
      permissions: [],
      reason: 'Blindfold setup',
    });
    setSetting(guild.id, 'blindfoldRoleId', role.id);
  }
  let channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel) {
    channel = await guild.channels.create({
      name: CHANNEL_NAME,
      type: ChannelType.GuildText,
      topic: 'You are blindfolded. NestBot whispers what you are missing.',
      permissionOverwrites: [
        { id: guild.id, deny: [VIEW] },
        {
          id: role.id,
          allow: [
            VIEW,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: guild.client.user.id,
          allow: [VIEW, PermissionFlagsBits.SendMessages],
        },
      ],
      reason: 'Blindfold setup',
    });
    setSetting(guild.id, 'blindfoldChannelId', channel.id);
  }
  const hidden = await hideChannels(guild);
  return { hidden, leaks: leaks(guild), channel, role };
}

/** Take everyone's blindfold off and remove role, channel and overwrites. */
async function teardown(guild) {
  const { roleId, channelId } = config(guild.id);
  for (const userId of Object.keys(all(guild.id)))
    await remove(guild, userId, { quiet: true });
  for (const channel of guild.channels.cache.values()) {
    if (channel.permissionOverwrites?.cache?.has?.(roleId)) {
      await channel.permissionOverwrites.delete(roleId).catch(() => {});
    }
  }
  await guild.channels.cache
    .get(channelId)
    ?.delete('Blindfold off')
    .catch(() => {});
  await (await guild.roles.fetch(roleId).catch(() => null))
    ?.delete('Blindfold off')
    .catch(() => {});
  setSetting(guild.id, 'blindfoldRoleId', null);
  setSetting(guild.id, 'blindfoldChannelId', null);
}

/**
 * Blindfold someone (or add time). Returns { error } or { until, stacked }.
 * Errors: 'off' (not set up), 'not-found', 'admin' (admins see everything),
 * 'cannot' (role can't be given), 'bot'.
 */
async function apply(guild, targetId, seconds, byId) {
  const { roleId } = config(guild.id);
  if (!roleId) return { error: 'off' };
  const member = await guild.members.fetch(targetId).catch(() => null);
  if (!member) return { error: 'not-found' };
  if (member.user?.bot) return { error: 'bot' };
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator))
    return { error: 'admin' };

  const active = getActive(guild.id, targetId);
  const now = Date.now();
  const until = Math.min(
    (active ? active.until : now) + seconds * 1000,
    now + MAX_SEC * 1000,
  );
  if (!active) {
    try {
      await member.roles.add(roleId, `Blindfolded by ${byId}`);
    } catch (e) {
      console.error('[Blindfold] add role failed:', e.message);
      return { error: 'cannot' };
    }
    await hideChannels(guild); // channels created since the setup
  }
  db.perform(d => {
    d.blindfolds ||= {};
    d.blindfolds[guild.id] ||= {};
    const r = (d.blindfolds[guild.id][targetId] ||= {
      startedAt: now,
      missed: 0,
      channels: {},
      mentions: [],
      lastWhisper: now,
      seen: 0,
    });
    r.until = until;
    r.by = byId;
    d.blindfoldStats ||= {};
    d.blindfoldStats[guild.id] ||= {};
    (d.blindfoldStats[guild.id][targetId] ||= { given: 0, received: 0 })
      .received++;
    if (byId && byId !== targetId)
      (d.blindfoldStats[guild.id][byId] ||= { given: 0, received: 0 }).given++;
  });

  const dark = darkChannel(guild);
  if (!active && dark) {
    await dark
      .send({
        content:
          `🙈 <@${targetId}>, everything goes dark… You're blindfolded until <t:${Math.floor(until / 1000)}:t>.\n` +
          'You can still talk here. I’ll whisper what you’re missing. 🤫',
        allowedMentions: { users: [targetId] },
      })
      .catch(() => {});
  }
  return { until, stacked: !!active };
}

function summary(r) {
  const top = Object.entries(r.channels || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, n]) => `<#${id}> (${n})`);
  return (
    `🌅 The blindfold slips off. You missed **${r.missed}** message${r.missed === 1 ? '' : 's'}` +
    (top.length ? `, most in ${top.join(', ')}` : '') +
    '.' +
    (r.mentions?.length
      ? `\n👂 Someone said your name in ${[...new Set(r.mentions)].map(id => `<#${id}>`).join(', ')}.`
      : '') +
    (r.missed > 30 ? '\nGood luck catching up. 😅' : '')
  );
}

/** Take the blindfold off and tell them what they missed (by DM). */
async function remove(guild, userId, { quiet = false } = {}) {
  const r = db.read(d => d.blindfolds?.[guild.id]?.[userId]);
  if (!r) return false;
  db.perform(d => delete d.blindfolds[guild.id][userId]);
  const member = await guild.members.fetch(userId).catch(() => null);
  const { roleId } = config(guild.id);
  if (member && roleId)
    await member.roles.remove(roleId, 'Blindfold over').catch(() => {});
  if (!quiet && member)
    await member.send(`${summary(r)}\n*(on ${guild.name})*`).catch(() => {});
  return true;
}

/** messageCreate: count what blindfolded people miss, whisper mentions right away. */
async function onMessage(message) {
  const guildId = message.guild?.id;
  if (!guildId) return;
  const active = Object.entries(all(guildId)).filter(
    ([, r]) => r.until > Date.now(),
  );
  if (!active.length || message.channel.id === config(guildId).channelId)
    return;

  const mentioned = [];
  db.perform(d => {
    for (const [userId] of active) {
      if (message.author.id === userId) continue;
      const r = d.blindfolds[guildId][userId];
      r.missed++;
      r.channels[message.channel.id] =
        (r.channels[message.channel.id] || 0) + 1;
      if (message.mentions?.users?.has?.(userId)) {
        r.mentions.push(message.channel.id);
        mentioned.push(userId);
      }
    }
  });
  const dark = mentioned.length && darkChannel(message.guild);
  for (const userId of mentioned) {
    await dark
      ?.send({
        content: `👂 <@${userId}>, someone just said your name in <#${message.channel.id}>…`,
        allowedMentions: { users: [userId] },
      })
      .catch(() => {});
  }
}

const LINES = [
  n => `🗣️ You hear ${n} people chatting in {ch}…`,
  n => `🗣️ Voices from {ch}… at least ${n} of them.`,
  () => `👀 Something is going on in {ch}. You can’t see what.`,
];

/** Every minute: end blindfolds, whisper what's happening. */
async function tick(client) {
  const data = db.read(d => d.blindfolds || {});
  for (const [guildId, users] of Object.entries(data)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    for (const [userId, r] of Object.entries(users)) {
      if (r.until <= Date.now()) {
        await remove(guild, userId);
        continue;
      }
      const fresh = r.missed - (r.seen || 0);
      if (fresh < 3 || Date.now() - (r.lastWhisper || 0) < WHISPER_EVERY_MS)
        continue;
      const [topId] =
        Object.entries(r.channels).sort((a, b) => b[1] - a[1])[0] || [];
      db.perform(d => {
        const x = d.blindfolds[guildId][userId];
        x.seen = x.missed;
        x.lastWhisper = Date.now();
      });
      const line = LINES[Math.floor(Math.random() * LINES.length)](
        Math.min(fresh, 9),
      ).replace('{ch}', topId ? `<#${topId}>` : 'the server');
      await darkChannel(guild)
        ?.send({
          content: `<@${userId}> ${line}`,
          allowedMentions: { users: [] },
        })
        .catch(() => {});
    }
  }
}

function startBlindfolds(client) {
  runEvery('Blindfolds', 1, () => tick(client));
}

module.exports = {
  ROLE_NAME,
  MAX_SEC,
  isSetUp,
  config,
  getActive,
  getStats,
  setup,
  teardown,
  apply,
  remove,
  onMessage,
  tick,
  summary,
  leaks,
  startBlindfolds,
};
