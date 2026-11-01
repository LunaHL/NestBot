// Watch groups: fixed groups and couples with their own permanent private
// channel, a shared watchlist and their own series progress.
//
// Data: data.groups[guildId] = { nextId, groups: { id: group } }
// group = { id, name, ownerId, members: [userIds incl. owner], channelId,
//           createdAt, showInCalendar, panelMessageId,
//           watchlist: { key: { …title fields, key, addedBy, addedAt, votes: [],
//                                status: 'want'|'watched', watchedAt } } }
const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../utils/db');
const watchlist = require('./watchlist');
const { getSetting } = require('./settings');

const copy = x => (x ? JSON.parse(JSON.stringify(x)) : x);
const slug = text =>
  String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'group';

const MEMBER_PERMS = {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  AddReactions: true,
  EmbedLinks: true,
  AttachFiles: true,
};

// ---------- Reading ----------

function allGroups(guildId) {
  return Object.values(copy(db.read(d => d.groups?.[guildId]?.groups)) || {});
}

function getGroup(guildId, id) {
  return copy(db.read(d => d.groups?.[guildId]?.groups?.[id])) || null;
}

function groupByChannel(guildId, channelId) {
  return allGroups(guildId).find(g => g.channelId === channelId) || null;
}

function groupsOf(guildId, userId) {
  return allGroups(guildId).filter(g => g.members.includes(userId));
}

function update(guildId, id, fn) {
  let result = null;
  db.perform(d => {
    const g = d.groups?.[guildId]?.groups?.[id];
    if (!g) return;
    result = fn(g) ?? null;
    result = { group: copy(g), result };
  });
  return result;
}

// ---------- Permissions ----------

function isAdmin(member) {
  if (member?.permissions?.has?.(PermissionFlagsBits.Administrator))
    return true;
  const mod = getSetting(member?.guild?.id, 'watchModRoleId');
  return !!(mod && member?.roles?.cache?.has?.(mod));
}

const isOwner = (group, userId) => group.ownerId === userId;
const canManage = (group, member) =>
  isOwner(group, member.id) || isAdmin(member);

// ---------- Channels ----------

async function grant(guild, group, userId) {
  const ch = await guild.client.channels
    .fetch(group.channelId)
    .catch(() => null);
  if (ch)
    await ch.permissionOverwrites
      .edit(userId, MEMBER_PERMS)
      .catch(e => console.error('[Groups] grant failed:', e.message));
}

async function revoke(guild, group, userId) {
  const ch = await guild.client.channels
    .fetch(group.channelId)
    .catch(() => null);
  if (ch) await ch.permissionOverwrites.delete(userId).catch(() => {});
}

// ---------- Create / members / delete ----------

/** Returns { error: 'limit'|'channel' } or { group }. */
async function createGroup(guild, owner, name, memberIds = []) {
  const max = getSetting(guild.id, 'watchMaxGroups');
  const owned = allGroups(guild.id).filter(g => g.ownerId === owner.id).length;
  if (max > 0 && owned >= max && !isAdmin(owner))
    return { error: 'limit', max };

  let channel;
  try {
    channel = await guild.channels.create({
      name: `💞・${slug(name)}`,
      type: ChannelType.GuildText,
      parent: getSetting(guild.id, 'watchGroupCategoryId') || undefined,
      topic: `Private watch group “${name}”: plan with /watch plan or /watch now right here`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: guild.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });
  } catch (e) {
    console.error('[Groups] Creating the channel failed:', e.message);
    return { error: 'channel' };
  }

  const members = [...new Set([owner.id, ...memberIds])];
  let group;
  db.perform(d => {
    d.groups ||= {};
    const g = (d.groups[guild.id] ||= { groups: {} });
    g.nextId = (g.nextId || 0) + 1;
    group = g.groups[g.nextId] = {
      id: g.nextId,
      name: String(name).slice(0, 50),
      ownerId: owner.id,
      members,
      channelId: channel.id,
      createdAt: Date.now(),
      showInCalendar: false,
      watchlist: {},
    };
  });
  group = copy(group);
  for (const userId of members) await grant(guild, group, userId);

  await channel
    .send({
      content: members.map(u => `<@${u}>`).join(' '),
      embeds: [
        new EmbedBuilder()
          .setColor(0xff69b4)
          .setTitle(`💞 Welcome to “${group.name}”!`)
          .setDescription(
            'Your private watch room. Only you can see it (and server admins, technically).\n\n' +
              'Everything is in the **panel** that stays at the bottom: your shared watchlist, watching together, members.\n' +
              '📺 Series continue where *this group* stopped last time.',
          ),
      ],
      allowedMentions: { users: members },
    })
    .catch(() => {});
  await postPanel(guild, group.id);
  return { group };
}

async function addMember(guild, id, userId) {
  const r = update(guild.id, id, g => {
    if (g.members.includes(userId)) return 'already';
    g.members.push(userId);
  });
  if (r?.result !== 'already') await grant(guild, r.group, userId);
  return r;
}

/** Remove someone (kick or leave). An owner who leaves hands the group over. */
async function removeMember(guild, id, userId) {
  const r = update(guild.id, id, g => {
    if (!g.members.includes(userId)) return 'not-member';
    g.members = g.members.filter(u => u !== userId);
    if (g.ownerId === userId && g.members.length) g.ownerId = g.members[0];
  });
  if (!r || r.result === 'not-member') return r;
  await revoke(guild, r.group, userId);
  if (!r.group.members.length) await deleteGroup(guild, id);
  return r;
}

async function deleteGroup(guild, id) {
  const group = getGroup(guild.id, id);
  if (!group) return null;
  // End movie nights still running in the group
  const watch = require('./watch');
  for (const n of watch.upcoming(guild.id).filter(x => x.groupId === id)) {
    await watch.cancelNight(guild, n.id, group.ownerId, { silent: true });
  }
  db.perform(d => delete d.groups[guild.id].groups[id]);
  const ch = await guild.client.channels
    .fetch(group.channelId)
    .catch(() => null);
  await ch?.delete('Watch group deleted').catch(() => {});
  return group;
}

function setShowInCalendar(guildId, id, on) {
  return update(guildId, id, g => {
    g.showInCalendar = !!on;
  })?.group;
}

function rename(guildId, id, name) {
  return update(guildId, id, g => {
    g.name = String(name).slice(0, 50);
  })?.group;
}

// ---------- Group watchlist ----------

function listItems(group) {
  return Object.values(group.watchlist || {}).sort(
    (a, b) =>
      (a.status === 'watched') - (b.status === 'watched') ||
      b.votes.length - a.votes.length ||
      a.addedAt - b.addedAt,
  );
}

function addItem(guildId, id, userId, fields) {
  const key = watchlist.keyOf(fields);
  return update(guildId, id, g => {
    if (g.watchlist[key]) return { item: g.watchlist[key], existed: true };
    g.watchlist[key] = {
      key,
      ...fields,
      addedBy: userId,
      addedAt: Date.now(),
      votes: [userId],
      status: 'want',
      watchedAt: null,
    };
    return { item: g.watchlist[key], existed: false };
  });
}

function removeItem(guildId, id, key) {
  return update(guildId, id, g => {
    const item = g.watchlist[key];
    delete g.watchlist[key];
    return item || null;
  });
}

/** 👍 toggle. Returns the item. */
function toggleVote(guildId, id, key, userId) {
  return update(guildId, id, g => {
    const item = g.watchlist[key];
    if (!item) return null;
    item.votes = item.votes.includes(userId)
      ? item.votes.filter(u => u !== userId)
      : [...item.votes, userId];
    return item;
  });
}

function markWatched(guildId, id, key) {
  return update(guildId, id, g => {
    const item = g.watchlist[key];
    if (!item) return null;
    item.status = 'watched';
    item.watchedAt = Date.now();
    return item;
  });
}

/** What the group should watch next: the most-👍 unwatched item. */
function upNext(group) {
  return listItems(group).find(i => i.status !== 'watched') || null;
}

// ---------- The panel in the group channel (stays at the bottom) ----------

const button = (customId, label, emoji, style = ButtonStyle.Secondary) =>
  new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(style);

function panelMessage(group, guildId) {
  // Series: where the group is ("▶️ at S2E5")
  const atEpisode = item => {
    if (item.type !== 'tv' || !item.tmdbId || !guildId) return '';
    const series = require('./series');
    const p = series.groupProgress(guildId, group.id, item.tmdbId);
    return p ? `\n▶️ at ${series.label(p)}` : '';
  };
  const next = upNext(group);
  const open = listItems(group).filter(i => i.status !== 'watched').length;
  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(`💞 ${group.name}`)
    .addFields(
      {
        name: '👥 Members',
        value:
          group.members
            .map(u => `<@${u}>${u === group.ownerId ? ' 👑' : ''}`)
            .join(' ') || '–',
      },
      {
        name: '⭐ Up next',
        value: next
          ? `**${next.title}**${next.year ? ` (${next.year})` : ''} · 👍 ${next.votes.length}` +
            atEpisode(next)
          : 'Nothing on the list yet',
        inline: true,
      },
      { name: '📝 Shared watchlist', value: `${open} to watch`, inline: true },
      {
        name: '🗓️ Public calendar',
        value: group.showInCalendar ? 'Shown' : 'Private',
        inline: true,
      },
    )
    .setFooter({
      text: '👑 = owner: invite, remove, rename, calendar, delete',
    });
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        button(
          `group:list:${group.id}`,
          'Watchlist',
          '📝',
          ButtonStyle.Primary,
        ),
        button(`group:addform:${group.id}`, 'Add a title', '➕'),
        button(
          `group:planform:${group.id}`,
          'Watch now / plan',
          '🍿',
          ButtonStyle.Success,
        ),
        button(`group:leaveask:${group.id}`, 'Leave', '👋'),
      ),
      new ActionRowBuilder().addComponents(
        button(`group:invite:${group.id}`, 'Invite', '➕'),
        button(`group:kickpick:${group.id}`, 'Remove someone', '👢'),
        button(`group:renameform:${group.id}`, 'Rename', '✏️'),
        button(
          `group:caltoggle:${group.id}`,
          group.showInCalendar ? 'Make private' : 'Show in calendar',
          '🗓️',
        ),
        button(
          `group:delete:${group.id}:ask`,
          'Delete',
          '🗑️',
          ButtonStyle.Danger,
        ),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

/** Post the panel in the group channel (or update it). */
async function postPanel(guild, id) {
  const group = getGroup(guild.id, id);
  if (!group) return null;
  const channel = await guild.client.channels
    .fetch(group.channelId)
    .catch(() => null);
  if (!channel) return null;
  const old = group.panelMessageId
    ? await channel.messages.fetch(group.panelMessageId).catch(() => null)
    : null;
  if (old) {
    await old.edit(panelMessage(group, guild.id)).catch(() => {});
    return old;
  }
  const msg = await channel
    .send(panelMessage(group, guild.id))
    .catch(() => null);
  if (!msg) return null;
  update(guild.id, id, g => {
    g.panelMessageId = msg.id;
  });
  return msg;
}

// ---------- Keep the panel at the bottom ----------
// After people chat in the group channel, the panel is posted again at the
// bottom and the old one deleted (bundled: after a quiet moment). During a
// movie night the check-in / clock stays at the bottom instead.

const PANEL_QUIET_MS = 8000;
const PANEL_MAX_WAIT_MS = 30000;
const panelTimers = new Map(); // channelId → { timer, since }

function onGroupMessage(message) {
  if (!message.guild) return;
  // Only chat and plain notices, not NestBot's own button messages
  if (
    message.author.bot &&
    (message.author.id !== message.client.user.id || message.components?.length)
  )
    return;
  const group = groupByChannel(message.guild.id, message.channel.id);
  if (!group) return;
  const channelId = message.channel.id;
  const pending = panelTimers.get(channelId);
  if (pending) clearTimeout(pending.timer);
  const since = pending?.since || Date.now();
  const delay = Math.max(
    0,
    Math.min(PANEL_QUIET_MS, since + PANEL_MAX_WAIT_MS - Date.now()),
  );
  const timer = setTimeout(() => {
    panelTimers.delete(channelId);
    movePanelDown(message.guild, group.id).catch(e =>
      console.error('[Groups] panel move failed:', e.message),
    );
  }, delay);
  panelTimers.set(channelId, { timer, since });
}

async function movePanelDown(guild, id) {
  const group = getGroup(guild.id, id);
  if (!group) return false;
  // A movie night is running here: its check-in / clock has the bottom
  const watch = require('./watch');
  const night = watch.nightByRoom(guild.id, group.channelId);
  if (night && watch.stickyOf(night)) return false;
  const channel = await guild.client.channels
    .fetch(group.channelId)
    .catch(() => null);
  if (
    !channel ||
    (group.panelMessageId && channel.lastMessageId === group.panelMessageId)
  )
    return false;
  const msg = await channel
    .send(panelMessage(group, guild.id))
    .catch(() => null);
  if (!msg) return false;
  update(guild.id, id, g => {
    g.panelMessageId = msg.id;
  });
  if (group.panelMessageId) {
    const old = await channel.messages
      .fetch(group.panelMessageId)
      .catch(() => null);
    await old?.delete().catch(() => {});
  }
  return true;
}

/** On startup: every group gets its (updated) panel. */
async function startGroups(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const g of allGroups(guild.id))
      await postPanel(guild, g.id).catch(() => {});
  }
}

module.exports = {
  allGroups,
  getGroup,
  groupByChannel,
  groupsOf,
  isOwner,
  canManage,
  createGroup,
  addMember,
  removeMember,
  deleteGroup,
  setShowInCalendar,
  rename,
  listItems,
  addItem,
  removeItem,
  toggleVote,
  markWatched,
  upNext,
  panelMessage,
  postPanel,
  startGroups,
  onGroupMessage,
  movePanelDown,
};
