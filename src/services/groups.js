// Watch groups: fixed groups and couples with their own permanent private
// channel, a shared watchlist and their own series progress.
//
// Data: data.groups[guildId] = { nextId, groups: { id: group } }
// group = { id, name, ownerId, members: [userIds incl. owner], channelId,
//           createdAt, showInCalendar,
//           watchlist: { key: { …title fields, key, addedBy, addedAt, votes: [],
//                                status: 'want'|'watched', watchedAt } } }
const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
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
              '🍿 `/watch now` or `/watch plan` **right here** to watch together\n' +
              '📝 `/group watchlist add` for your shared watchlist, 👍 to vote what’s next\n' +
              '📺 Series continue where *this group* stopped last time\n' +
              '👥 `/group add` / `/group kick` (owner) · `/group leave` · `/group delete`',
          ),
      ],
      allowedMentions: { users: members },
    })
    .catch(() => {});
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
};
