// Movie nights: planning, the calendar in #movies, temporary watch rooms,
// check-in, the shared live clock, pauses and checkpoints.
// Everyone watches on their own device; NestBot keeps everyone in sync.
//
// Data: data.watch[guildId] = { nextId, calendarMessageId, nights: { id: night } }
// Settings (admins, /settings watch): see services/settings.js (watch…)
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
} = require('discord.js');
const db = require('../utils/db');
const tmdb = require('./tmdb');
const watchlist = require('./watchlist');
const nestcoins = require('./nestcoins');
const { getSetting } = require('./settings');
const { discordTime } = require('../utils/time');
const { runEvery } = require('../utils/schedule');

const CLOCK_EDIT_EVERY_MS = 30 * 1000;
const TICK_MS = 10 * 1000;
const CALENDAR_BUTTONS = 10; // more nights go into a dropdown
const COLOR = 0xe50914;
const ACTIVE = ['planned', 'open', 'live'];
const VOTE_TITLE = 'Movie night (vote)';

// ---------- Small helpers ----------

/** 4512000 → "1:15:12" */
function fmtPos(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** "1:12:05", "72:05" or "72" (minutes) → ms, or null */
function parsePos(text) {
  const parts = String(text).trim().split(':').map(Number);
  if (!parts.length || parts.some(n => !Number.isFinite(n) || n < 0))
    return null;
  if (parts.length === 1) return parts[0] * 60000;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3)
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return null;
}

/** 148 → "2h 28m" */
const fmtLength = min =>
  min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;

const slug = text =>
  String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'movie';

const settingsOf = guildId => ({
  channelId: getSetting(guildId, 'watchChannelId'),
  categoryId: getSetting(guildId, 'watchCategoryId'),
  modRoleId: getSetting(guildId, 'watchModRoleId'),
  planRoleId: getSetting(guildId, 'watchPlanRoleId'),
  opensMin: getSetting(guildId, 'watchRoomOpensMin'),
  autoDeleteH: getSetting(guildId, 'watchAutoDeleteH'),
  checkpointMin: getSetting(guildId, 'watchCheckpointMin'),
  attendanceCoins: getSetting(guildId, 'watchAttendanceCoins'),
  reminders: getSetting(guildId, 'watchReminders'),
  voteMaxH: getSetting(guildId, 'watchVoteMaxH'),
});

// ---------- Data ----------

const copy = x => (x ? JSON.parse(JSON.stringify(x)) : x);

function getNight(guildId, id) {
  return copy(db.read(d => d.watch?.[guildId]?.nights?.[id]));
}

function allNights(guildId) {
  return Object.values(copy(db.read(d => d.watch?.[guildId]?.nights)) || {});
}

/** Nights that are still coming up or running, soonest first. */
function upcoming(guildId) {
  return allNights(guildId)
    .filter(n => ACTIVE.includes(n.status))
    .sort((a, b) => a.startAt - b.startAt);
}

function nightByRoom(guildId, channelId) {
  return (
    allNights(guildId).find(
      n => n.roomId === channelId && ACTIVE.includes(n.status),
    ) || null
  );
}

/** Change a night inside the database; returns the updated copy. */
function updateNight(guildId, id, fn) {
  let result = null;
  db.perform(d => {
    const night = d.watch?.[guildId]?.nights?.[id];
    if (!night) return;
    fn(night);
    result = copy(night);
  });
  return result;
}

// ---------- Permissions ----------

function isAdminOrMod(member, guildId) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  const mod = settingsOf(guildId).modRoleId;
  return !!(mod && member.roles?.cache?.has?.(mod));
}

/** Planner, admins and the mod role may edit, cancel and end a night. */
function canManage(member, night) {
  return member?.id === night.createdBy || isAdminOrMod(member, night.guildId);
}

function canPlan(member, guildId) {
  const role = settingsOf(guildId).planRoleId;
  return (
    !role ||
    isAdminOrMod(member, guildId) ||
    !!member?.roles?.cache?.has?.(role)
  );
}

// ---------- Building a night from TMDB ----------

/**
 * Turn the chosen title into night details. `value` is "movie:123" / "tv:456"
 * from the search, or plain text if TMDB isn't set up or nothing was picked.
 */
// ---------- Series helpers ----------

/** Seasons of a series as [{ number, episodes }], season 1 first (no specials). */
const seasonsOf = info =>
  (info?.seasons || [])
    .filter(x => x.number > 0)
    .sort((a, b) => a.number - b.number);

/** The episode after S/E, using the season list: { season, episode } or null. */
function episodeAfter(info, season, episode) {
  const seasons = seasonsOf(info);
  if (!seasons.length) return { season, episode: episode + 1 }; // unknown: just count up
  const cur = seasons.find(x => x.number === season);
  if (cur && episode < cur.episodes) return { season, episode: episode + 1 };
  const next = seasons.find(x => x.number > season);
  return next ? { season: next.number, episode: 1 } : null;
}

/** "Episode 1050" → { season, episode } (counting through all seasons), or null. */
function fromAbsolute(info, absolute) {
  let left = absolute;
  for (const x of seasonsOf(info)) {
    if (left <= x.episodes) return { season: x.number, episode: left };
    left -= x.episodes;
  }
  return null;
}

/** Where a series stopped last time ("server" or a group id): { season, episode } */
function getProgress(guildId, scope, tvId) {
  return (
    db.read(d => d.watch?.[guildId]?.progress?.[`${scope}:${tvId}`]) || null
  );
}

function setProgress(guildId, scope, tvId, season, episode) {
  db.perform(d => {
    d.watch ||= {};
    d.watch[guildId] ||= { nights: {} };
    d.watch[guildId].progress ||= {};
    d.watch[guildId].progress[`${scope}:${tvId}`] = {
      season,
      episode,
      at: Date.now(),
    };
  });
}

/**
 * Turn the chosen title into night details. `value` is "movie:123" / "tv:456"
 * from the search, or plain text if TMDB isn't set up or nothing was picked.
 * Series: season/episode, or `absolute` ("episode 1050"), or, with neither,
 * it continues where `scope` (the server or a group) stopped last time.
 */
async function resolveTitle(
  value,
  {
    season,
    episode,
    episodes,
    length,
    absolute,
    guildId,
    scope = 'server',
  } = {},
) {
  const m = /^(movie|tv):(\d+)$/.exec(String(value || ''));
  const info = m ? await tmdb.details(m[1], Number(m[2])) : null;
  const kind =
    info?.type === 'tv' || season || episode || absolute ? 'tv' : 'movie';

  let ep = null;
  let continued = false;
  if (kind === 'tv') {
    if (absolute && info) {
      const pos = fromAbsolute(info, absolute);
      if (pos) ({ season, episode } = pos);
    }
    if (!season && !episode && info && guildId) {
      const last = getProgress(guildId, scope, info.id);
      const next = last && episodeAfter(info, last.season, last.episode);
      if (next) {
        ({ season, episode } = next);
        continued = true;
      }
    }
    season = season || 1;
    episode = episode || 1;
    if (info) ep = await tmdb.episode(info.id, season, episode);
  }

  // Movie series: "part 2 of 3" and what comes next
  let collection = null;
  if (kind === 'movie' && info?.collection) {
    const c = await tmdb.collection(info.collection.id);
    const index = c ? c.parts.findIndex(p => p.id === info.id) : -1;
    if (index >= 0) {
      collection = {
        name: c.name,
        part: index + 1,
        total: c.parts.length,
        next: c.parts[index + 1] || null,
      };
    }
  }

  const lengthMin =
    length || ep?.runtime || info?.runtime || (kind === 'tv' ? 45 : 120);
  return {
    title:
      info?.title ||
      String(value)
        .replace(/^(movie|tv):\d+$/, 'Movie')
        .slice(0, 100),
    kind,
    info, // TMDB details or null
    season: kind === 'tv' ? season : null,
    episode: kind === 'tv' ? episode : null,
    episodeTitle: ep?.title || null,
    episodes: kind === 'tv' ? Math.max(1, episodes || 1) : 1,
    lengthMin,
    collection,
    continued,
  };
}

/** "Breaking Bad · S2E4 “Cornered”" */
function fullTitle(n) {
  if (n.kind !== 'tv') return n.title;
  const ep = `S${n.season}E${n.episode}`;
  return `${n.title} · ${ep}${n.episodeTitle ? ` “${n.episodeTitle}”` : ''}`;
}

const emojiOf = n =>
  n.vote?.open ? '🗳️' : tmdb.kindEmoji(n.kind, n.info?.anime);

/** The watchlist fields / key of the night's title. */
const nightFields = n => watchlist.titleFields(n.info, n.title);
const nightKey = n => watchlist.keyOf(nightFields(n));

// ---------- Embeds and buttons ----------

function cardEmbed(n) {
  const info = n.info;
  const embed = new EmbedBuilder()
    .setColor(
      n.status === 'cancelled' || n.status === 'ended' ? 0x95a5a6 : COLOR,
    )
    .setTitle(`${emojiOf(n)} ${n.title}${info?.year ? ` (${info.year})` : ''}`);

  const desc = [];
  if (n.status === 'cancelled') desc.push('❌ **Cancelled**');
  if (n.status === 'ended') desc.push('✅ **Watched**');
  if (info?.original && info.original !== n.title)
    desc.push(`*${info.original}*`);
  if (info?.overview)
    desc.push(
      info.overview.length > 350
        ? `${info.overview.slice(0, 347)}…`
        : info.overview,
    );
  if (desc.length) embed.setDescription(desc.join('\n\n'));

  const fields = [
    {
      name: '🗓️ When',
      value: `${discordTime(n.startAt, 'F')}\n${discordTime(n.startAt, 'R')}`,
      inline: true,
    },
    {
      name: '⏱️ Length',
      value:
        fmtLength(n.lengthMin) +
        (n.episodes > 1 ? ` × ${n.episodes} episodes` : ''),
      inline: true,
    },
  ];
  if (n.kind === 'tv') {
    fields.push({
      name: '📺 Episode',
      value:
        `S${n.season}E${n.episode}${n.episodeTitle ? ` “${n.episodeTitle}”` : ''}` +
        (n.episodes > 1 ? `\n+ ${n.episodes - 1} more` : ''),
      inline: true,
    });
  }
  if (info?.genres?.length)
    fields.push({
      name: '🎭 Genre',
      value: info.genres.slice(0, 3).join(', '),
      inline: true,
    });
  if (info?.rating)
    fields.push({ name: '⭐ TMDB', value: `${info.rating}/10`, inline: true });
  fields.push({
    name: '📣 Planned by',
    value: `<@${n.createdBy}>`,
    inline: true,
  });
  if (n.collection) {
    fields.push({
      name: '📚 Movie series',
      value: `Part ${n.collection.part} of ${n.collection.total} · ${n.collection.name}`,
      inline: true,
    });
  }
  if (n.vote?.open) {
    const top = tally(n).slice(0, 3);
    fields.push({
      name: '🗳️ Vote',
      value:
        `Ends ${n.vote.mode === 'start' ? 'when the movie night starts' : discordTime(n.vote.endsAt, 'R')}. Vote in the room!` +
        (top.length
          ? `\n${top.map(o => `${o.emoji} ${o.title} · ${o.count}`).join('\n')}`
          : ''),
    });
  }
  const wants = watchlist.wantCount(n.guildId, nightKey(n));
  if (wants > 0) {
    fields.push({
      name: '👀 On watchlists',
      value: `${wants} ${wants === 1 ? 'person wants' : 'people want'} to watch this`,
      inline: true,
    });
  }
  fields.push({
    name: `🙋 Signed up (${n.signups.length})`,
    value: n.signups.length
      ? n.signups
          .map(id => `<@${id}>`)
          .join(' ')
          .slice(0, 1024)
      : 'Nobody yet. Be the first!',
  });
  embed.addFields(fields);
  if (info?.poster) embed.setThumbnail(info.poster);
  if (info) embed.setFooter({ text: tmdb.ATTRIBUTION });
  return embed;
}

function cardButtons(n) {
  if (!ACTIVE.includes(n.status)) return [];
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`watch:signup:${n.id}`)
      .setLabel('Sign up / leave')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Success),
  );
  if (n.status !== 'planned') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`watch:enter:${n.id}`)
        .setLabel('Enter room')
        .setEmoji('🚪')
        .setStyle(ButtonStyle.Primary),
    );
  }
  if (n.info) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`watch:where:${n.id}`)
        .setLabel('Where can I watch it?')
        .setEmoji('📺')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`watch:wl:${n.id}`)
      .setLabel('Watchlist')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

const statusBadge = n =>
  n.status === 'live'
    ? ' · 🔴 live'
    : n.status === 'open'
      ? ' · 🚪 room open'
      : '';

function calendarEmbed(guildId) {
  const list = upcoming(guildId);
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🗓️ Upcoming watches');
  if (!list.length) {
    embed.setDescription(
      'Nothing planned yet. Plan a movie night with `/watch plan`, or start one right now with `/watch now`!',
    );
    return embed;
  }
  embed.setDescription(
    list
      .slice(0, 25)
      .map(
        n =>
          `**${discordTime(n.startAt, 'f')}** · ${emojiOf(n)} ${fullTitle(n)} · 🙋 ${n.signups.length}${statusBadge(n)}`,
      )
      .join('\n'),
  );
  embed.setFooter({
    text: 'Press a button to sign up, press it again to leave. Times are shown in your time zone.',
  });
  return embed;
}

function calendarComponents(guildId) {
  const list = upcoming(guildId);
  const rows = [];
  const buttons = list.slice(0, CALENDAR_BUTTONS).map(n => {
    const day = new Date(n.startAt).toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: process.env.TIMEZONE || 'Europe/Berlin',
    });
    return new ButtonBuilder()
      .setCustomId(`watch:signup:${n.id}`)
      .setLabel(`${day} · ${n.title}`.slice(0, 80))
      .setEmoji('🙋')
      .setStyle(
        n.status === 'planned' ? ButtonStyle.Secondary : ButtonStyle.Success,
      );
  });
  for (let i = 0; i < buttons.length; i += 5)
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));

  const rest = list.slice(CALENDAR_BUTTONS, CALENDAR_BUTTONS + 25);
  if (rest.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('watch:signupmenu')
          .setPlaceholder('🙋 Sign up for a later one…')
          .addOptions(
            rest.map(n => ({
              label:
                `${new Date(n.startAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${n.title}`.slice(
                  0,
                  100,
                ),
              value: String(n.id),
            })),
          ),
      ),
    );
  }
  return rows;
}

// ---------- Talking to Discord ----------

async function fetchChannel(client, id) {
  if (!id) return null;
  return client.channels.fetch(id).catch(() => null);
}

async function moviesChannel(client, guildId) {
  return fetchChannel(client, settingsOf(guildId).channelId);
}

/** Create or update the pinned calendar in #movies. */
async function refreshCalendar(client, guildId) {
  const channel = await moviesChannel(client, guildId);
  if (!channel) return;
  const payload = {
    embeds: [calendarEmbed(guildId)],
    components: calendarComponents(guildId),
  };
  const msgId = db.read(d => d.watch?.[guildId]?.calendarMessageId);
  const existing = msgId
    ? await channel.messages.fetch(msgId).catch(() => null)
    : null;
  if (existing) {
    await existing
      .edit(payload)
      .catch(e => console.error('[Watch] Calendar edit failed:', e.message));
    return;
  }
  const msg = await channel
    .send(payload)
    .catch(e => console.error('[Watch] Calendar post failed:', e.message));
  if (!msg) return;
  await msg.pin?.().catch(() => {});
  db.perform(d => {
    d.watch ||= {};
    d.watch[guildId] ||= { nights: {} };
    d.watch[guildId].calendarMessageId = msg.id;
  });
}

/** Update the night's card in #movies. */
async function refreshCard(client, n) {
  const channel = await moviesChannel(client, n.guildId);
  if (!channel || !n.cardMessageId) return;
  const msg = await channel.messages.fetch(n.cardMessageId).catch(() => null);
  if (msg)
    await msg
      .edit({ embeds: [cardEmbed(n)], components: cardButtons(n) })
      .catch(() => {});
}

async function refreshAll(client, n) {
  await Promise.all([
    refreshCard(client, n),
    refreshCalendar(client, n.guildId),
  ]);
}

async function createEvent(guild, n) {
  if (n.startAt < Date.now() + 60000) return null; // Discord needs a start in the future
  try {
    const event = await guild.scheduledEvents.create({
      name: `${emojiOf(n)} ${fullTitle(n)}`.slice(0, 100),
      scheduledStartTime: new Date(n.startAt),
      scheduledEndTime: new Date(n.startAt + n.lengthMin * n.episodes * 60000),
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: { location: 'Nest movie night · sign up in #movies' },
      description: (n.info?.overview || 'Movie night in the Nest!').slice(
        0,
        1000,
      ),
    });
    return event.id;
  } catch (e) {
    console.error('[Watch] Creating the Discord event failed:', e.message);
    return null;
  }
}

async function deleteEvent(guild, n) {
  if (!n.eventId) return;
  const event = await guild.scheduledEvents.fetch(n.eventId).catch(() => null);
  if (event) await event.delete().catch(() => {});
}

async function editEvent(guild, n) {
  if (!n.eventId) return;
  const event = await guild.scheduledEvents.fetch(n.eventId).catch(() => null);
  if (!event) return;
  await event
    .edit({
      name: `${emojiOf(n)} ${fullTitle(n)}`.slice(0, 100),
      scheduledStartTime: new Date(n.startAt),
      scheduledEndTime: new Date(n.startAt + n.lengthMin * n.episodes * 60000),
    })
    .catch(e =>
      console.error('[Watch] Editing the Discord event failed:', e.message),
    );
}

// ---------- Planning ----------

/**
 * Create a night. Posts its card in #movies, creates a Discord event and
 * updates the calendar. With now: true the room opens right away.
 */
async function createNight(
  guild,
  member,
  details,
  startAt,
  { now = false } = {},
) {
  const guildId = guild.id;
  let night;
  db.perform(d => {
    d.watch ||= {};
    const g = (d.watch[guildId] ||= { nights: {} });
    g.nextId = (g.nextId || 0) + 1;
    night = g.nights[g.nextId] = {
      id: g.nextId,
      guildId,
      ...details,
      startAt,
      createdBy: member.id,
      createdAt: Date.now(),
      signups: [member.id],
      members: [],
      status: 'planned',
      roomId: null,
      cardMessageId: null,
      eventId: null,
      remindedDay: false,
      session: { phase: 'waiting', ready: [], checkedIn: [], pausedTotal: 0 },
    };
  });
  night = copy(night);

  const channel = await moviesChannel(guild.client, guildId);
  if (channel) {
    const msg = await channel
      .send({ embeds: [cardEmbed(night)], components: cardButtons(night) })
      .catch(() => null);
    if (msg)
      night = updateNight(guildId, night.id, x => (x.cardMessageId = msg.id));
  }
  if (!now) {
    const eventId = await createEvent(guild, night);
    if (eventId)
      night = updateNight(guildId, night.id, x => (x.eventId = eventId));
  }
  if (now) {
    night = await openRoom(guild, night, { spontaneous: true });
    await startCheckin(guild.client, night);
  } else {
    await notifyWatchlists(guild, night);
  }
  await refreshCalendar(guild.client, guildId);
  return getNight(guildId, night.id);
}

/** DM people who have this title on their watchlist and turned notify on. */
async function notifyWatchlists(guild, n) {
  const targets = watchlist
    .notifyTargets(guild.id, nightKey(n))
    .filter(u => u !== n.createdBy);
  for (const userId of targets) {
    const user = await guild.client.users?.fetch(userId).catch(() => null);
    await user
      ?.send({
        content: `🍿 **${fullTitle(n)}** from your watchlist is planned for ${discordTime(n.startAt, 'F')} (${discordTime(n.startAt, 'R')})!`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`watch:signup:${n.id}:${guild.id}`)
              .setLabel('Sign up')
              .setEmoji('🙋')
              .setStyle(ButtonStyle.Success),
          ),
        ],
      })
      .catch(() => {}); // DMs closed
  }
}

async function editNight(guild, id, changes) {
  const n = updateNight(guild.id, id, x =>
    Object.assign(x, changes, { remindedDay: false }),
  );
  await editEvent(guild, n);
  await refreshAll(guild.client, n);
  const channel = await moviesChannel(guild.client, guild.id);
  if (channel) {
    await channel
      .send({
        content: `🔁 **${fullTitle(n)}** was changed: now ${discordTime(n.startAt, 'F')} (${discordTime(n.startAt, 'R')}).\n${n.signups.map(u => `<@${u}>`).join(' ')}`,
        allowedMentions: { users: n.signups },
      })
      .catch(() => {});
  }
  return n;
}

async function cancelNight(guild, id, by) {
  const n = updateNight(guild.id, id, x => {
    x.status = 'cancelled';
    x.endedAt = Date.now();
  });
  await deleteEvent(guild, n);
  if (n.roomId) {
    const room = await fetchChannel(guild.client, n.roomId);
    await room?.delete('Movie night cancelled').catch(() => {});
  }
  const channel = await moviesChannel(guild.client, guild.id);
  if (channel) {
    await channel
      .send({
        content: `❌ **${fullTitle(n)}** (${discordTime(n.startAt, 'f')}) was cancelled by <@${by}>.\n${n.signups.map(u => `<@${u}>`).join(' ')}`,
        allowedMentions: { users: n.signups.filter(u => u !== by) },
      })
      .catch(() => {});
  }
  await refreshAll(guild.client, n);
  return n;
}

// ---------- Signing up and the room ----------

const MEMBER_PERMS = {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  AddReactions: true,
  EmbedLinks: true,
  AttachFiles: true,
};

async function grantRoom(guild, n, userId) {
  const room = await fetchChannel(guild.client, n.roomId);
  if (room)
    await room.permissionOverwrites
      .edit(userId, MEMBER_PERMS)
      .catch(e => console.error('[Watch] Grant failed:', e.message));
}

async function revokeRoom(guild, n, userId) {
  const room = await fetchChannel(guild.client, n.roomId);
  if (room) await room.permissionOverwrites.delete(userId).catch(() => {});
}

/** Sign up, or leave if already signed up. Returns { joined, night } or { error }. */
async function toggleSignup(guild, id, userId) {
  const before = getNight(guild.id, id);
  if (!before || !ACTIVE.includes(before.status)) return { error: 'gone' };
  const joined = !before.signups.includes(userId);
  const n = updateNight(guild.id, id, x => {
    if (joined) {
      x.signups.push(userId);
      if (x.roomId && !x.members.includes(userId)) x.members.push(userId);
    } else {
      x.signups = x.signups.filter(u => u !== userId);
      x.members = x.members.filter(u => u !== userId);
      x.session.ready = x.session.ready.filter(u => u !== userId);
    }
  });
  if (n.roomId) {
    if (joined) await grantRoom(guild, n, userId);
    else await revokeRoom(guild, n, userId);
  }
  if (n.vote?.open && joined) await addAutoOptions(guild.client, n);
  await refreshAll(guild.client, getNight(guild.id, id));
  return { joined, night: getNight(guild.id, id) };
}

/** Enter an open room (also works for people who didn't sign up). */
async function enterRoom(guild, id, userId) {
  const n0 = getNight(guild.id, id);
  if (!n0 || !n0.roomId || !['open', 'live'].includes(n0.status))
    return { error: 'closed' };
  const already = n0.members.includes(userId);
  const n = updateNight(guild.id, id, x => {
    if (!x.members.includes(userId)) x.members.push(userId);
    if (!x.signups.includes(userId)) x.signups.push(userId);
  });
  await grantRoom(guild, n, userId);
  if (!already) {
    const room = await fetchChannel(guild.client, n.roomId);
    const phase = n.session.phase;
    const where =
      phase === 'playing' || phase === 'paused'
        ? ` The movie is running: we're at **${fmtPos(position(n))}**. Use \`/watch sync\` to catch up.`
        : phase === 'checkin'
          ? ' We’re checking in right now: pause at 0:00 and press **✅ Ready** above.'
          : '';
    await room
      ?.send({
        content: `👋 <@${userId}> joined!${where}`,
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
    if (n.vote?.open) await addAutoOptions(guild.client, n);
    await refreshAll(guild.client, n);
  }
  return { night: n, already };
}

/** Create the private room, let the signed-up people in and announce it. */
async function openRoom(guild, n, { spontaneous = false } = {}) {
  const s = settingsOf(guild.id);
  const me = guild.client.user.id;
  let room;
  try {
    room = await guild.channels.create({
      name: `🍿・${slug(n.title)}`,
      type: ChannelType.GuildText,
      parent: s.categoryId || undefined,
      topic: `${fullTitle(n)} · starts ${new Date(n.startAt).toISOString()}`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: me,
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
    console.error('[Watch] Creating the room failed:', e.message);
    return n;
  }

  n = updateNight(guild.id, n.id, x => {
    x.status = 'open';
    x.roomId = room.id;
    x.members = [...x.signups];
  });
  // Let people in one by one, so someone who left the server can't break it
  for (const userId of n.members) await grantRoom(guild, n, userId);

  await room
    .send({
      embeds: [
        cardEmbed(n),
        new EmbedBuilder()
          .setColor(COLOR)
          .setTitle('🍿 How this works')
          .setDescription(
            '1. When it starts, load the movie on your own device and **pause it at 0:00**.\n' +
              '2. Press **✅ Ready**. When everyone is ready, NestBot counts down: 3… 2… 1… ▶️\n' +
              '3. The **live clock** shows where everyone should be. Behind? Use `/watch sync <your time>`.\n' +
              '4. Anyone can press **⏸️ Pause**. To continue, everyone presses ✅ Ready again.',
          ),
      ],
    })
    .catch(() => {});

  const channel = await moviesChannel(guild.client, guild.id);
  if (channel) {
    const when = spontaneous
      ? 'right now'
      : `${discordTime(n.startAt, 't')} (${discordTime(n.startAt, 'R')})`;
    await channel
      .send({
        content:
          (n.vote?.open
            ? `🗳️ **Movie night ${discordTime(n.startAt, 'F')}: vote what we watch!** The room is open, the vote ends ${n.vote.mode === 'start' ? 'when it starts' : discordTime(n.vote.endsAt, 'R')}.\n`
            : `🍿 **The room for ${emojiOf(n)} ${fullTitle(n)} is open!** Starts ${when}.\n`) +
          (n.signups.length ? n.signups.map(u => `<@${u}>`).join(' ') : ''),
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`watch:enter:${n.id}`)
              .setLabel('Enter room')
              .setEmoji('🚪')
              .setStyle(ButtonStyle.Primary),
          ),
        ],
        allowedMentions: { users: n.signups },
      })
      .catch(() => {});
  }
  await refreshAll(guild.client, n);
  return n;
}

// ---------- Session: check-in, countdown, clock ----------

/** Current position in the movie, in ms. */
function position(n, at = Date.now()) {
  const s = n.session;
  if (!s.startedAt) return 0;
  const end = s.phase === 'playing' ? at : s.pausedAt || at;
  return Math.max(0, end - s.startedAt - (s.pausedTotal || 0));
}

const lengthMs = n => n.lengthMin * 60000;

function checkinEmbed(n) {
  const s = n.session;
  const resume = !!s.resume;
  const ready = s.ready.filter(u => n.members.includes(u));
  const waiting = n.members.filter(u => !s.ready.includes(u));
  return new EmbedBuilder()
    .setColor(resume ? 0xf1c40f : COLOR)
    .setTitle(
      resume
        ? `▶️ Resuming at ${fmtPos(position(n))}`
        : `🎬 Time for ${fullTitle(n)}!`,
    )
    .setDescription(
      (resume
        ? `Go to **${fmtPos(position(n))}**, pause there and press **✅ Ready**.`
        : 'Load it on your device, **pause at 0:00** and press **✅ Ready**.') +
        `\n\n✅ **Ready (${ready.length}/${n.members.length}):** ${ready.map(u => `<@${u}>`).join(' ') || '–'}` +
        (waiting.length
          ? `\n⏳ **Waiting for:** ${waiting.map(u => `<@${u}>`).join(' ')}`
          : ''),
    );
}

function checkinButtons(n) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`watch:ready:${n.id}`)
        .setLabel('Ready')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`watch:force:${n.id}`)
        .setLabel('Start anyway')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/** Post the check-in in the room (at the start time, or after a pause). */
async function startCheckin(client, n, { resume = false } = {}) {
  const room = await fetchChannel(client, n.roomId);
  if (!room) return n;
  let claimed = false;
  n = updateNight(n.guildId, n.id, x => {
    // Only once: from 'waiting' (start) or 'paused' (resume)
    if (x.session.phase !== (resume ? 'paused' : 'waiting')) return;
    claimed = true;
    x.session.phase = 'checkin';
    x.session.resume = resume;
    x.session.ready = [];
    if (!resume) x.status = 'live';
  });
  if (!claimed) return n;
  const msg = await room
    .send({
      content: resume ? '' : n.members.map(u => `<@${u}>`).join(' '),
      embeds: [checkinEmbed(n)],
      components: checkinButtons(n),
      allowedMentions: { users: resume ? [] : n.members },
    })
    .catch(() => null);
  if (msg)
    n = updateNight(
      n.guildId,
      n.id,
      x => (x.session.checkinMessageId = msg.id),
    );
  await refreshCalendar(client, n.guildId);
  return n;
}

async function editCheckin(client, n, payload) {
  const room = await fetchChannel(client, n.roomId);
  const msg =
    room && n.session.checkinMessageId
      ? await room.messages.fetch(n.session.checkinMessageId).catch(() => null)
      : null;
  if (msg) await msg.edit(payload).catch(() => {});
}

/** Someone pressed ✅ Ready. Starts the countdown when everyone is ready. */
async function markReady(client, guildId, id, userId) {
  const before = getNight(guildId, id);
  if (!before || before.session.phase !== 'checkin')
    return { error: 'not-checkin' };
  if (!before.members.includes(userId)) return { error: 'not-member' };

  const firstTime = !(
    before.session.allCheckedIn || before.session.checkedIn
  ).includes(userId);
  const n = updateNight(guildId, id, x => {
    if (!x.session.ready.includes(userId)) x.session.ready.push(userId);
    if (!x.session.checkedIn.includes(userId)) x.session.checkedIn.push(userId);
    x.session.allCheckedIn ||= [];
    if (!x.session.allCheckedIn.includes(userId))
      x.session.allCheckedIn.push(userId);
  });
  const coins = settingsOf(guildId).attendanceCoins;
  if (firstTime && coins > 0) nestcoins.addCoins(guildId, userId, coins);

  const allReady = n.members.every(u => n.session.ready.includes(u));
  if (allReady) await countdown(client, n);
  else
    await editCheckin(client, n, {
      embeds: [checkinEmbed(n)],
      components: checkinButtons(n),
    });
  return { night: n, allReady, coins: firstTime ? coins : 0 };
}

/** 3… 2… 1… ▶️, then start or resume the clock. */
async function countdown(client, n) {
  const claimed = updateNight(n.guildId, n.id, x => {
    if (x.session.phase !== 'checkin') return;
    x.session.phase = 'countdown';
    x.session.countdownAt = Date.now();
  });
  if (claimed?.session.phase !== 'countdown') return; // someone else started it
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (const step of ['3…', '2…', '1…']) {
    await editCheckin(client, claimed, {
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR)
          .setTitle(`⏳ ${step}`)
          .setDescription(`${fullTitle(claimed)}`),
      ],
      components: [],
    });
    await wait(1000);
  }
  await finishCountdown(client, claimed);
}

async function finishCountdown(client, n) {
  const now = Date.now();
  const resume = !!n.session.resume;
  n = updateNight(n.guildId, n.id, x => {
    if (x.session.phase !== 'countdown') return;
    if (resume) x.session.pausedTotal += now - x.session.pausedAt;
    else {
      x.session.startedAt = now;
      x.session.pausedTotal = 0;
      const cp = settingsOf(x.guildId).checkpointMin;
      x.session.nextCheckpoint = cp > 0 ? cp * 60000 : null;
    }
    x.session.phase = 'playing';
    x.session.pausedAt = null;
    x.session.pausedBy = null;
    x.session.lastClockEdit = 0;
  });
  if (n.session.phase !== 'playing') return;
  await editCheckin(client, n, {
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('▶️ PLAY!')
        .setDescription(
          resume
            ? `Continuing from **${fmtPos(position(n))}**.`
            : 'Enjoy the movie! 🍿',
        ),
    ],
    components: [],
  });

  const room = await fetchChannel(client, n.roomId);
  if (!room) return;
  if (n.session.clockMessageId) {
    await updateClock(client, n, true);
  } else {
    const msg = await room
      .send({ embeds: [clockEmbed(n)], components: clockButtons(n) })
      .catch(() => null);
    if (msg) {
      await msg.pin?.().catch(() => {});
      updateNight(n.guildId, n.id, x => (x.session.clockMessageId = msg.id));
    }
  }
}

function clockEmbed(n) {
  const pos = position(n);
  const total = lengthMs(n);
  const pct = Math.min(100, Math.round((pos / total) * 100));
  const filled = Math.round((pct / 100) * 14);
  const bar = '▓'.repeat(filled) + '░'.repeat(14 - filled);
  const s = n.session;
  const title =
    s.phase === 'paused'
      ? `⏸️ Paused · ${fullTitle(n)}`
      : s.phase === 'finished'
        ? `🎬 Finished · ${fullTitle(n)}`
        : `▶️ ${fullTitle(n)}`;
  const epInfo =
    n.kind === 'tv' && (n.episodes > 1 || (n.session.episodesDone || 1) > 1)
      ? ` · episode ${n.session.episodesDone || 1}${n.episodes > 1 ? `/${n.episodes}` : ''}`
      : '';
  let desc = `⏱️ **${fmtPos(pos)}** / ${fmtPos(total)}${epInfo}\n${bar} ${pct}%`;
  if (s.phase === 'paused')
    desc += `\n\n⏸️ Paused by <@${s.pausedBy}>. Press **▶️ Resume** when everyone's back.`;
  else if (s.phase === 'finished')
    desc +=
      '\n\n🎬 That was it! The planner (or an admin) closes the room with `/watch end`.';
  else desc += '\n\nBehind or ahead? `/watch sync <your time>`';
  return new EmbedBuilder()
    .setColor(
      s.phase === 'paused'
        ? 0xf1c40f
        : s.phase === 'finished'
          ? 0x95a5a6
          : 0x2ecc71,
    )
    .setTitle(title)
    .setDescription(desc);
}

function clockButtons(n) {
  const phase = n.session.phase;
  if (phase === 'finished') return [];
  return [
    new ActionRowBuilder().addComponents(
      phase === 'paused'
        ? new ButtonBuilder()
            .setCustomId(`watch:resume:${n.id}`)
            .setLabel('Resume')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Success)
        : new ButtonBuilder()
            .setCustomId(`watch:pause:${n.id}`)
            .setLabel('Pause')
            .setEmoji('⏸️')
            .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`watch:pos:${n.id}`)
        .setLabel('Where should I be?')
        .setEmoji('🕐')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`watch:missed:${n.id}`)
        .setLabel('I missed part')
        .setEmoji('⚠️')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function updateClock(client, n, force = false) {
  if (!n.session.clockMessageId) return;
  if (
    !force &&
    Date.now() - (n.session.lastClockEdit || 0) < CLOCK_EDIT_EVERY_MS
  )
    return;
  const room = await fetchChannel(client, n.roomId);
  const msg = room
    ? await room.messages.fetch(n.session.clockMessageId).catch(() => null)
    : null;
  if (msg)
    await msg
      .edit({ embeds: [clockEmbed(n)], components: clockButtons(n) })
      .catch(() => {});
  updateNight(n.guildId, n.id, x => (x.session.lastClockEdit = Date.now()));
}

/** ⏸️ pressed by a member. */
async function pause(client, guildId, id, userId) {
  const n = updateNight(guildId, id, x => {
    if (x.session.phase !== 'playing' || !x.members.includes(userId)) return;
    x.session.phase = 'paused';
    x.session.pausedAt = Date.now();
    x.session.pausedBy = userId;
  });
  if (n?.session.phase !== 'paused' || n.session.pausedBy !== userId)
    return { error: 'cannot' };
  await updateClock(client, n, true);
  const room = await fetchChannel(client, n.roomId);
  await room
    ?.send({
      content: `⏸️ <@${userId}> paused at **${fmtPos(position(n))}**. Everyone pause there!`,
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
  return { night: n };
}

/** ▶️ Resume pressed: everyone checks in again at the paused position. */
async function resume(client, guildId, id, userId) {
  const n = getNight(guildId, id);
  if (!n || n.session.phase !== 'paused') return { error: 'not-paused' };
  if (!n.members.includes(userId)) return { error: 'not-member' };
  return { night: await startCheckin(client, n, { resume: true }) };
}

/** ▶️ Start anyway: planner, the person who paused, admins and mods. */
async function forceStart(client, member, id) {
  const n = getNight(member.guild.id, id);
  if (!n || n.session.phase !== 'checkin') return { error: 'not-checkin' };
  const allowed = canManage(member, n) || n.session.pausedBy === member.id;
  if (!allowed) return { error: 'not-allowed' };
  await countdown(client, n);
  return { night: n };
}

/** "/watch sync 41:50": how far off is this person? */
function syncInfo(n, givenMs) {
  const expected = position(n);
  return { expected, diff: expected - givenMs }; // >0: behind
}

// ---------- Checkpoints ----------

function checkpointMessage(
  n,
  index,
  votes = { ahead: [], ok: [], behind: [] },
) {
  const at = fmtPos(index);
  const behind = votes.behind.length;
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`📍 Checkpoint ${at}`)
        .setDescription(
          'Quick check: where are you?\n\n' +
            `⏩ Ahead: **${votes.ahead.length}** · ✅ On time: **${votes.ok.length}** · ⏪ Behind: **${behind}**` +
            (behind >= 2
              ? '\n\nSeveral of you are behind. Maybe a quick ⏸️ pause so everyone can catch up?'
              : ''),
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`watch:cp:${n.id}:${index}:ahead`)
          .setLabel('Ahead')
          .setEmoji('⏩')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`watch:cp:${n.id}:${index}:ok`)
          .setLabel('On time')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`watch:cp:${n.id}:${index}:behind`)
          .setLabel('Behind')
          .setEmoji('⏪')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function voteCheckpoint(guildId, id, index, userId, choice) {
  return updateNight(guildId, id, x => {
    x.session.checkpoints ||= {};
    const v = (x.session.checkpoints[index] ||= {
      ahead: [],
      ok: [],
      behind: [],
    });
    for (const k of Object.keys(v)) v[k] = v[k].filter(u => u !== userId);
    v[choice].push(userId);
  });
}

/** "⚠️ I missed part": this person won't be asked to mark it as watched. */
function markMissed(guildId, id, userId) {
  return updateNight(guildId, id, x => {
    x.session.missed ||= [];
    if (!x.session.missed.includes(userId)) x.session.missed.push(userId);
  });
}

/** Ended nights, newest first. */
function pastNights(guildId) {
  return allNights(guildId)
    .filter(n => n.status === 'ended')
    .sort((a, b) => b.startAt - a.startAt);
}

/** Average watchlist rating of the people who watched this night. */
function averageRating(n) {
  const key = nightKey(n);
  const ratings = watchers(n)
    .map(u => watchlist.getItem(n.guildId, u, key)?.rating)
    .filter(Boolean);
  return ratings.length
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : null;
}

// ---------- Votes: what do we watch? ----------

/** Vote durations for /watch plan vote: and /watch vote (hours; null = until the start). */
const VOTE_DURATIONS = {
  '1h': 1,
  '6h': 6,
  '12h': 12,
  '1d': 24,
  '3d': 72,
  '7d': 168,
  start: null,
};
const MAX_OPTIONS = 25; // Discord's limit for a select menu

/** A vote option from a watchlist item or TMDB details. */
function voteOption(src, { by = null, auto = false, wants = 0 } = {}) {
  const fields = src.key
    ? src
    : watchlist.titleFields(src.info || null, src.title);
  const key = src.key || watchlist.keyOf(fields);
  return {
    key,
    ref: fields.tmdbId ? `${fields.type}:${fields.tmdbId}` : fields.title,
    title: fields.title,
    year: fields.year || '',
    emoji: tmdb.kindEmoji(fields.type, fields.anime),
    by,
    auto,
    wants,
  };
}

/** Options sorted by votes: [{ …option, count, voters }] */
function tally(n) {
  const votes = n.vote?.votes || {};
  return (n.vote?.options || [])
    .map(o => {
      const voters = Object.entries(votes)
        .filter(([, keys]) => keys.includes(o.key))
        .map(([u]) => u);
      return { ...o, count: voters.length, voters };
    })
    .sort((a, b) => b.count - a.count || b.wants - a.wants);
}

function voteEmbed(n) {
  const rows = tally(n);
  const ends =
    n.vote.mode === 'start'
      ? `when the movie night starts (${discordTime(n.startAt, 'R')})`
      : discordTime(n.vote.endsAt, 'R');
  const lines = rows.map(
    o =>
      `${o.emoji} **${o.title}**${o.year ? ` (${o.year})` : ''} · **${o.count}** vote${o.count === 1 ? '' : 's'}` +
      (o.wants
        ? ` · 🎯 on ${o.wants} watchlist${o.wants === 1 ? '' : 's'}`
        : '') +
      (o.by ? ` · 💡 <@${o.by}>` : ''),
  );
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(n.vote.open ? '🗳️ What do we watch?' : '🗳️ The vote is over')
    .setDescription(
      (lines.join('\n') ||
        'No options yet. Suggest something with `/watch suggest`!') +
        (n.vote.open
          ? `\n\n⏳ Ends ${ends}. Pick **everything** you'd like to watch.`
          : ''),
    )
    .setFooter({
      text: '🎯 = on the watchlists of people here · 💡 = suggested by',
    });
}

function voteComponents(n) {
  if (!n.vote.open) return [];
  const rows = [];
  if (n.vote.options.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`watch:vote:${n.id}`)
          .setPlaceholder('🗳️ Pick everything you’d like to watch…')
          .setMinValues(0)
          .setMaxValues(n.vote.options.length)
          .addOptions(
            n.vote.options.map(o => ({
              label: `${o.title}${o.year ? ` (${o.year})` : ''}`.slice(0, 100),
              value: o.key,
              emoji: o.emoji,
            })),
          ),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`watch:suggest:${n.id}`)
        .setLabel('Suggest something')
        .setEmoji('💡')
        .setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

async function refreshVote(client, n) {
  const room = await fetchChannel(client, n.roomId);
  if (!room || !n.vote?.messageId) return;
  const msg = await room.messages.fetch(n.vote.messageId).catch(() => null);
  await msg
    ?.edit({
      embeds: [voteEmbed(n)],
      components: voteComponents(n),
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
}

/** Add titles from the signed-up people's watchlists (keeps everything else). */
async function addAutoOptions(client, n) {
  const matches = watchlist.match(n.guildId, n.signups).slice(0, 10);
  const updated = updateNight(n.guildId, n.id, x => {
    if (!x.vote?.open) return;
    for (const m of matches) {
      const existing = x.vote.options.find(o => o.key === m.key);
      if (existing) existing.wants = m.count;
      else if (x.vote.options.length < MAX_OPTIONS)
        x.vote.options.push(voteOption(m, { auto: true, wants: m.count }));
    }
  });
  if (updated?.vote) await refreshVote(client, updated);
  return updated;
}

/**
 * Start a vote for a night. duration: a key of VOTE_DURATIONS.
 * The room opens right away so people can vote in it.
 */
async function startVote(guild, id, duration = 'start') {
  const s = settingsOf(guild.id);
  let n = getNight(guild.id, id);
  const hours = VOTE_DURATIONS[duration] ?? null;
  const endsAt =
    hours === null
      ? n.startAt
      : Math.min(Date.now() + Math.min(hours, s.voteMaxH) * 3600000, n.startAt);
  const options =
    n.info || n.title !== VOTE_TITLE
      ? [voteOption({ info: n.info, title: n.title }, { by: n.createdBy })]
      : [];

  n = updateNight(guild.id, id, x => {
    x.vote = {
      open: true,
      mode: hours === null ? 'start' : 'fixed',
      endsAt,
      options,
      votes: {},
      messageId: null,
    };
  });
  n = await addAutoOptions(guild.client, n);
  if (n.status === 'planned') n = await openRoom(guild, n);

  const room = await fetchChannel(guild.client, n.roomId);
  const msg = await room
    ?.send({
      embeds: [voteEmbed(n)],
      components: voteComponents(n),
      allowedMentions: { parse: [] },
    })
    .catch(() => null);
  if (msg) {
    await msg.pin?.().catch(() => {});
    n = updateNight(guild.id, id, x => (x.vote.messageId = msg.id));
  }
  await refreshAll(guild.client, n);
  return n;
}

/** Someone picked options in the menu (replaces their earlier picks). */
function castVote(guildId, id, userId, keys) {
  return updateNight(guildId, id, x => {
    if (!x.vote?.open || !x.members.includes(userId)) return;
    const valid = keys.filter(k => x.vote.options.some(o => o.key === k));
    if (valid.length) x.vote.votes[userId] = valid;
    else delete x.vote.votes[userId];
  });
}

/** /watch suggest: add a title to the vote. Returns { error } or { option }. */
async function suggest(guild, id, userId, ref) {
  const n0 = getNight(guild.id, id);
  if (!n0?.vote?.open) return { error: 'closed' };
  if (!n0.members.includes(userId)) return { error: 'not-member' };
  const m = /^(movie|tv):(\d+)$/.exec(String(ref));
  const info = m ? await tmdb.details(m[1], Number(m[2])) : null;
  const option = voteOption(
    { info, title: info?.title || String(ref).slice(0, 100) },
    { by: userId },
  );
  let result = { option };
  const n = updateNight(guild.id, id, x => {
    if (x.vote.options.some(o => o.key === option.key))
      return (result = { error: 'exists', option });
    if (x.vote.options.length >= MAX_OPTIONS)
      return (result = { error: 'full' });
    x.vote.options.push(option);
  });
  if (!result.error) {
    await refreshVote(guild.client, n);
    await refreshAll(guild.client, n);
  }
  return result;
}

/** End the vote: the winner becomes the night's title. Ties: the wheel decides. */
async function closeVote(guild, n) {
  const rows = tally(n);
  const best = rows.length ? rows[0].count : 0;
  const tied = rows.filter(o => o.count === best);
  const winner = tied.length
    ? tied[Math.floor(Math.random() * tied.length)]
    : null;

  let details = null;
  if (winner) details = await resolveTitle(winner.ref, {});
  n = updateNight(guild.id, n.id, x => {
    x.vote.open = false;
    x.vote.winner = winner?.key || null;
    if (details) Object.assign(x, details);
  });

  const room = await fetchChannel(guild.client, n.roomId);
  if (winner) await room?.setName?.(`🍿・${slug(n.title)}`).catch(() => {});
  await refreshVote(guild.client, n);
  const text = !winner
    ? '🗳️ The vote is over, but there were no options. <@' +
      n.createdBy +
      '>, set a title with `/watch edit`.'
    : `🏆 **${winner.title}** won with **${winner.count}** vote${winner.count === 1 ? '' : 's'}!` +
      (tied.length > 1
        ? ` (🎡 ${tied.length}-way tie, the wheel decided)`
        : '') +
      (Date.now() >= n.startAt
        ? ''
        : ` See you ${discordTime(n.startAt, 'R')}!`);
  await room
    ?.send({
      content: text,
      allowedMentions: { users: winner ? [] : [n.createdBy] },
    })
    .catch(() => {});
  await editEvent(guild, n);
  await refreshAll(guild.client, n);

  // Vote ended at the start time: go straight to the check-in
  if (winner && n.status === 'open' && Date.now() >= n.startAt)
    await startCheckin(guild.client, n);
  return n;
}

// ---------- Series: next episode ----------

/** The next episode with its title and length, or null after the last one. */
async function nextEpisode(n) {
  const next = episodeAfter(n.info, n.season, n.episode);
  if (!next) return null;
  const ep = n.info
    ? await tmdb.episode(n.info.id, next.season, next.episode)
    : null;
  if (n.info && !ep && seasonsOf(n.info).length) return null;
  return {
    ...next,
    title: ep?.title || null,
    runtime: ep?.runtime || n.lengthMin,
  };
}

/** "✅ S1E5 is over" with ⏭️ Next / 🛑 Stop here. */
async function episodeOverMessage(n) {
  const next = await nextEpisode(n);
  const done = n.session.episodesDone || 1;
  const planned = n.episodes || 1;
  const marker = `${n.season}x${n.episode}`;
  const buttons = [];
  if (next) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`watch:next:${n.id}:${marker}`)
        .setLabel(
          `${done >= planned ? 'One more' : 'Next'}: S${next.season}E${next.episode}${next.title ? ` “${next.title}”` : ''} (${next.runtime} min)`.slice(
            0,
            80,
          ),
        )
        .setEmoji('⏭️')
        .setStyle(
          done >= planned ? ButtonStyle.Secondary : ButtonStyle.Success,
        ),
    );
  }
  buttons.push(
    new ButtonBuilder()
      .setCustomId(`watch:stop:${n.id}:${marker}`)
      .setLabel('Stop here')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Secondary),
  );
  const seasonEnd =
    next && next.season !== n.season
      ? `\n🎉 That was the end of season ${n.season}!`
      : '';
  return {
    content:
      `✅ **${fullTitle(n)}** is over! (episode ${done}${planned > 1 ? ` of ${planned} planned` : ''})` +
      (next ? seasonEnd : '\n🎉 That was the last episode!'),
    components: [new ActionRowBuilder().addComponents(buttons)],
  };
}

/**
 * ⏭️ Next episode: same room, new check-in. `marker` ("1x5") makes sure a
 * double click doesn't skip two episodes. Returns { error } or { night }.
 */
async function goNext(client, guildId, id, userId, marker) {
  const n0 = getNight(guildId, id);
  if (
    !n0 ||
    n0.session.phase !== 'finished' ||
    `${n0.season}x${n0.episode}` !== marker
  )
    return { error: 'gone' };
  if (!n0.members.includes(userId)) return { error: 'not-member' };
  const next = await nextEpisode(n0);
  if (!next) return { error: 'last' };

  let claimed = false;
  const n = updateNight(guildId, id, x => {
    if (x.session.phase !== 'finished' || `${x.season}x${x.episode}` !== marker)
      return;
    claimed = true;
    x.season = next.season;
    x.episode = next.episode;
    x.episodeTitle = next.title;
    x.lengthMin = next.runtime;
    Object.assign(x.session, {
      phase: 'waiting',
      ready: [],
      checkedIn: [],
      missed: [],
      resume: false,
      startedAt: null,
      pausedAt: null,
      pausedBy: null,
      pausedTotal: 0,
      clockMessageId: null,
      checkinMessageId: null,
      nextCheckpoint: null,
      episodesDone: (x.session.episodesDone || 1) + 1,
    });
  });
  if (!claimed) return { error: 'gone' };
  await startCheckin(client, n);
  await refreshAll(client, getNight(guildId, id));
  return { night: getNight(guildId, id) };
}

/** 🛑 Stop here: ask everyone to mark what they watched. */
async function stopSeries(client, guildId, id, userId, marker) {
  const n = getNight(guildId, id);
  if (
    !n ||
    n.session.phase !== 'finished' ||
    `${n.season}x${n.episode}` !== marker
  )
    return { error: 'gone' };
  if (!n.members.includes(userId)) return { error: 'not-member' };
  const room = await fetchChannel(client, n.roomId);
  await room
    ?.send({
      content: `🛑 <@${userId}> stopped after **${fullTitle(n)}**. Mark the episodes you watched on your watchlist?\n<@${n.createdBy}>, close the room with \`/watch end\` when you're done.`,
      components: watchedPrompt(n),
      allowedMentions: { users: [n.createdBy] },
    })
    .catch(() => {});
  return { night: n };
}

// ---------- "Did you watch it?" ----------

/** People who watched the current movie/episode: checked in, didn't miss part. */
const currentWatchers = n =>
  n.session.checkedIn.filter(u => !(n.session.missed || []).includes(u));

/** Everyone who watched anything this night (all episodes). */
const watchers = n => {
  const all = new Set((n.session.history || []).flatMap(h => h.watchers));
  if (
    !(n.session.history || []).some(
      h => h.season === n.season && h.episode === n.episode,
    )
  ) {
    for (const u of currentWatchers(n)) all.add(u);
  }
  return [...all];
};

/** Episodes this person watched tonight: [{ season, episode }] */
function episodesOf(n, userId) {
  const list = (n.session.history || [])
    .filter(h => h.watchers.includes(userId))
    .map(h => ({ season: h.season, episode: h.episode }));
  const currentDone = (n.session.history || []).some(
    h => h.season === n.season && h.episode === n.episode,
  );
  if (!currentDone && currentWatchers(n).includes(userId))
    list.push({ season: n.season, episode: n.episode });
  return list;
}

/** "Frieren · S1E5–S1E7" for this person (series), or the title. */
function labelFor(n, userId) {
  if (n.kind !== 'tv') return fullTitle(n);
  const eps = episodesOf(n, userId);
  if (!eps.length) return n.title;
  const f = e => `S${e.season}E${e.episode}`;
  return `${n.title} · ${f(eps[0])}${eps.length > 1 ? `–${f(eps[eps.length - 1])}` : ''}`;
}

/** The "✅ Yes, mark as watched / ❌ No" buttons. */
function watchedPrompt(n) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`watchlist:night:${n.id}:yes`)
        .setLabel('Yes, mark as watched')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`watchlist:night:${n.id}:no`)
        .setLabel('No')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/**
 * Someone answered the prompt. Returns 'not-there', or { key } when marked.
 * Works during the night (in the room) and afterwards (summary, pending).
 */
function confirmWatched(guildId, n, userId, yes) {
  if (!watchers(n).includes(userId)) return 'not-there';
  const key = nightKey(n);
  updateNight(guildId, n.id, x => {
    x.session.answered ||= [];
    if (!x.session.answered.includes(userId)) x.session.answered.push(userId);
  });
  if (!yes) {
    watchlist.resolvePending(guildId, userId, key, false);
    return { key };
  }
  const eps = episodesOf(n, userId);
  watchlist.markWatched(guildId, userId, nightFields(n), {
    watchedWith: watchers(n),
    progress: n.kind === 'tv' && eps.length ? eps[eps.length - 1] : null,
  });
  return { key, label: labelFor(n, userId) };
}

/** "Did you watch it?" waiting for everyone who was there and hasn't answered. */
function addPendingFor(n) {
  const answered = n.session.answered || [];
  for (const userId of watchers(n)) {
    if (answered.includes(userId)) continue;
    const eps = episodesOf(n, userId);
    watchlist.addPending(n.guildId, userId, {
      key: nightKey(n),
      fields: nightFields(n),
      label: labelFor(n, userId),
      nightId: n.id,
      watchedWith: watchers(n),
      progress: n.kind === 'tv' && eps.length ? eps[eps.length - 1] : null,
    });
  }
}

// ---------- Ending ----------

/** End a night: summary in #movies, delete the room and the event. */
async function endNight(guild, id, { by = null, auto = false } = {}) {
  const n = updateNight(guild.id, id, x => {
    x.status = 'ended';
    x.endedAt = Date.now();
    if (x.session.phase !== 'finished') x.session.endPosition = position(x);
  });
  if (!n) return null;
  await deleteEvent(guild, n);

  const channel = await moviesChannel(guild.client, guild.id);
  if (channel) {
    const watched = watchers(n);
    const missed = n.session.missed || [];
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`🎬 Finished: ${emojiOf(n)} ${fullTitle(n)}`)
      .addFields(
        {
          name: '👥 Watched by',
          value: watched.length
            ? watched.map(u => `<@${u}>`).join(' ')
            : 'Nobody checked in',
        },
        {
          name: '🗓️ Started',
          value: discordTime(n.startAt, 'f'),
          inline: true,
        },
        { name: '📣 Planned by', value: `<@${n.createdBy}>`, inline: true },
      );
    if (n.collection?.next) {
      embed.addFields({
        name: '➡️ Next in the series',
        value: `**${n.collection.next.title}** (${n.collection.next.year}) · part ${n.collection.part + 1} of ${n.collection.total}`,
      });
    }
    if (missed.length) {
      embed.addFields({
        name: '⚠️ Missed part',
        value: missed.map(u => `<@${u}>`).join(' '),
      });
    }
    if (auto)
      embed.setFooter({
        text: 'Closed automatically because nobody ended it.',
      });
    const ask = watchers(n).filter(
      u => !(n.session.answered || []).includes(u),
    );
    if (ask.length) {
      embed.addFields({
        name: '📝 Watchlist',
        value: `${ask.map(u => `<@${u}>`).join(' ')}: mark it as watched? (Or later with \`/watchlist pending\`.)`,
      });
    }
    await channel
      .send({
        embeds: [embed],
        components: [
          ...(ask.length ? watchedPrompt(n) : []),
          ...(n.collection?.next
            ? [
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId(
                      `watch:wladd:${n.id}:movie_${n.collection.next.id}`,
                    )
                    .setLabel(
                      `Add “${n.collection.next.title}” to my watchlist`.slice(
                        0,
                        80,
                      ),
                    )
                    .setEmoji('➕')
                    .setStyle(ButtonStyle.Secondary),
                ),
              ]
            : []),
        ],
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  }
  addPendingFor(n);

  if (n.roomId) {
    const room = await fetchChannel(guild.client, n.roomId);
    await room
      ?.delete(
        auto
          ? 'Movie night closed automatically'
          : `Movie night ended by ${by}`,
      )
      .catch(() => {});
  }
  await refreshAll(guild.client, n);
  return n;
}

// ---------- Background jobs ----------

async function schedulerTick(client) {
  const now = Date.now();
  const all = db.read(d => Object.keys(d.watch || {}));
  for (const guildId of all) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    const s = settingsOf(guildId);

    for (const n of upcoming(guildId)) {
      // Reminder the day before
      if (
        n.status === 'planned' &&
        s.reminders &&
        !n.remindedDay &&
        now >= n.startAt - 24 * 3600000 &&
        n.startAt - now > 90 * 60000
      ) {
        updateNight(guildId, n.id, x => (x.remindedDay = true));
        const channel = await moviesChannel(client, guildId);
        await channel
          ?.send({
            content: `⏰ **Tomorrow:** ${emojiOf(n)} **${fullTitle(n)}** ${discordTime(n.startAt, 'R')}. Not signed up yet? Use the calendar!\n${n.signups.map(u => `<@${u}>`).join(' ')}`,
            allowedMentions: { users: n.signups },
          })
          .catch(() => {});
      }
      // Close a vote that's over (before anything else happens)
      if (n.vote?.open && now >= n.vote.endsAt) {
        await closeVote(guild, n);
        continue;
      }
      // Open the room
      if (n.status === 'planned' && now >= n.startAt - s.opensMin * 60000) {
        await openRoom(guild, n);
        continue;
      }
      // Start the check-in at the start time
      if (
        n.status === 'open' &&
        now >= n.startAt &&
        n.session.phase === 'waiting' &&
        !n.vote?.open
      ) {
        await startCheckin(client, n);
        continue;
      }
      // A countdown interrupted by a restart
      if (
        n.session.phase === 'countdown' &&
        now - (n.session.countdownAt || 0) > 15000
      ) {
        await finishCountdown(client, n);
      }
      // Forgotten rooms
      if (
        (n.status === 'open' || n.status === 'live') &&
        now >= n.startAt + s.autoDeleteH * 3600000
      ) {
        await endNight(guild, n.id, { auto: true });
      }
    }
  }
}

/** Every few seconds: live clocks, the end of the movie, checkpoints. */
async function clockTick(client) {
  const all = db.read(d => Object.keys(d.watch || {}));
  for (const guildId of all) {
    for (const n of upcoming(guildId)) {
      if (n.session.phase !== 'playing') continue;
      const pos = position(n);

      if (pos >= lengthMs(n)) {
        const done = updateNight(guildId, n.id, x => {
          x.session.phase = 'finished';
          x.session.pausedAt = Date.now();
          if (x.kind === 'tv') {
            x.session.history ||= [];
            x.session.history.push({
              season: x.season,
              episode: x.episode,
              title: x.episodeTitle,
              watchers: currentWatchers(x),
            });
          }
        });
        await updateClock(client, done, true);
        const room = await fetchChannel(client, n.roomId);
        if (done.kind === 'tv') {
          if (done.info)
            setProgress(
              guildId,
              done.groupId || 'server',
              done.info.id,
              done.season,
              done.episode,
            );
          await room?.send(await episodeOverMessage(done)).catch(() => {});
        } else {
          await room
            ?.send({
              content: `🎬 **${fullTitle(n)}** is over! Mark it as watched on your watchlist?\n<@${n.createdBy}>, close the room with \`/watch end\` when you're done chatting.`,
              components: watchedPrompt(n),
              allowedMentions: { users: [n.createdBy] },
            })
            .catch(() => {});
        }
        continue;
      }

      if (n.session.nextCheckpoint && pos >= n.session.nextCheckpoint) {
        const index = n.session.nextCheckpoint;
        const cp = settingsOf(guildId).checkpointMin;
        updateNight(
          guildId,
          n.id,
          x => (x.session.nextCheckpoint = cp > 0 ? index + cp * 60000 : null),
        );
        const room = await fetchChannel(client, n.roomId);
        await room?.send(checkpointMessage(n, index)).catch(() => {});
      }
      await updateClock(client, n);
    }
  }
}

/** Called once when the bot is ready. */
function startWatch(client) {
  runEvery('Watch', 1, () => schedulerTick(client));
  setInterval(
    () =>
      clockTick(client).catch(e => console.error('[Watch] Clock failed:', e)),
    TICK_MS,
  );
  // Make sure each server's calendar exists and is up to date
  for (const guildId of db.read(d => Object.keys(d.watch || {}))) {
    refreshCalendar(client, guildId).catch(() => {});
  }
}

module.exports = {
  fmtPos,
  parsePos,
  fmtLength,
  settingsOf,
  getNight,
  upcoming,
  nightByRoom,
  canManage,
  canPlan,
  isAdminOrMod,
  resolveTitle,
  fullTitle,
  emojiOf,
  cardEmbed,
  calendarEmbed,
  calendarComponents,
  checkpointMessage,
  voteCheckpoint,
  refreshCalendar,
  createNight,
  editNight,
  cancelNight,
  toggleSignup,
  enterRoom,
  markReady,
  pause,
  resume,
  forceStart,
  position,
  syncInfo,
  endNight,
  confirmWatched,
  refreshAll,
  goNext,
  stopSeries,
  nextEpisode,
  episodeAfter,
  fromAbsolute,
  getProgress,
  setProgress,
  labelFor,
  VOTE_DURATIONS,
  VOTE_TITLE,
  startVote,
  castVote,
  suggest,
  closeVote,
  voteEmbed,
  tally,
  markMissed,
  pastNights,
  averageRating,
  watchers,
  nightKey,
  nightFields,
  schedulerTick,
  clockTick,
  startWatch,
};
