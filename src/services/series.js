// Series and movie series, for watchlists and groups: the next / previous
// episode, an episode overview with ✅ for what's watched, and the parts of a
// movie series. Season data comes from TMDB (services/tmdb.js).
//
// Progress = { season, episode } = the LAST episode watched (null = not started).
// Group progress is the one movie nights use (watch.getProgress with the
// group id as scope), so the next group movie night continues there.
const tmdb = require('./tmdb');
const db = require('../utils/db');

const watch = () => require('./watch'); // lazy: watch.js loads groups.js, which loads this

const infoOf = item =>
  item?.tmdbId
    ? tmdb.details(item.type, item.tmdbId).catch(() => null)
    : Promise.resolve(null);
const label = p => (p ? `S${p.season}E${p.episode}` : '–');

/** The episode after `progress` ({1,1} if not started), or null when the series is over. */
async function nextEpisode(item, progress, info) {
  if (!progress) return { season: 1, episode: 1 };
  info ??= await infoOf(item);
  return watch().episodeAfter(info, progress.season, progress.episode);
}

/** One episode back (across seasons), or null = back to "not started". */
async function prevEpisode(item, progress, info) {
  if (!progress) return null;
  if (progress.episode > 1)
    return { season: progress.season, episode: progress.episode - 1 };
  if (progress.season <= 1) return null;
  info ??= await infoOf(item);
  const prev = (info?.seasons || [])
    .filter(x => x.number < progress.season)
    .at(-1);
  return { season: progress.season - 1, episode: prev?.episodes || 1 };
}

/** "Episode 1050" → { season, episode } for this series, or null. */
async function fromAbsolute(item, absolute) {
  const info = await infoOf(item);
  return info ? watch().fromAbsolute(info, absolute) : null;
}

/** Name of one episode, or null. */
async function episodeTitle(item, p) {
  if (!item?.tmdbId || !p) return null;
  const e = await tmdb
    .episode(item.tmdbId, p.season, p.episode)
    .catch(() => null);
  return e?.title || null;
}

// ---------- Group progress ----------

const groupProgress = (guildId, groupId, tvId) => {
  const p = watch().getProgress(guildId, groupId, tvId);
  return p ? { season: p.season, episode: p.episode } : null;
};

function setGroupProgress(guildId, groupId, tvId, p) {
  if (p)
    return watch().setProgress(guildId, groupId, tvId, p.season, p.episode);
  db.perform(d => {
    delete d.watch?.[guildId]?.progress?.[`${groupId}:${tvId}`];
  });
}

// ---------- Overviews ----------

const EPISODE_LIST_MAX = 30; // longer seasons show a window around the next episode

/**
 * Episode overview: finished seasons as one line, the current season episode
 * by episode (✅ watched, ▶️ next, ⬜ not yet), later seasons as one line.
 */
async function episodeOverview(item, progress) {
  const info = await infoOf(item);
  const seasons = info?.seasons || [];
  if (!seasons.length) {
    return `📺 **${item.title}**\nLast watched: **${label(progress)}**\n\n*(No season data from TMDB for this title.)*`;
  }
  const next = await nextEpisode(item, progress, info);
  const current = next?.season ?? seasons.at(-1).number;
  const lines = [];
  let watchedTotal = 0;
  let total = 0;
  for (const s of seasons) {
    total += s.episodes;
    const done = !progress
      ? 0
      : s.number < progress.season
        ? s.episodes
        : s.number === progress.season
          ? Math.min(progress.episode, s.episodes)
          : 0;
    watchedTotal += done;
    if (s.number !== current) {
      const icon = done >= s.episodes ? '✅' : done ? '▶️' : '⬜';
      lines.push(`${icon} **Season ${s.number}** · ${done}/${s.episodes}`);
      continue;
    }
    lines.push(`📂 **Season ${s.number}** · ${done}/${s.episodes}`);
    const names = await tmdb.season(item.tmdbId, s.number).catch(() => null);
    const nameOf = n => names?.find(e => e.episode === n)?.title;
    let from = 1;
    let to = s.episodes;
    if (s.episodes > EPISODE_LIST_MAX) {
      const at = next ? next.episode : s.episodes;
      from = Math.max(1, at - 5);
      to = Math.min(s.episodes, from + EPISODE_LIST_MAX - 10);
    }
    if (from > 1) lines.push(`　✅ E1–E${from - 1}`);
    for (let n = from; n <= to; n++) {
      const icon = n <= done ? '✅' : next && n === next.episode ? '▶️' : '⬜';
      const name = nameOf(n);
      lines.push(
        `　${icon} E${n}${name ? ` · ${name}` : ''}${next && n === next.episode ? ' **← next**' : ''}`,
      );
    }
    if (to < s.episodes) lines.push(`　⬜ E${to + 1}–E${s.episodes}`);
  }
  const head =
    `📺 **${item.title}** · ${watchedTotal}/${total} episodes` +
    (next ? ` · next: **${label(next)}**` : ' · 🎉 finished');
  return `${head}\n\n${lines.join('\n')}`.slice(0, 4000);
}

/**
 * The parts of a movie series with ✅ for watched ones. `isWatched(movieId)`
 * decides what counts as watched (own list, or the group's).
 */
async function collectionOverview(item, isWatched) {
  const info = await infoOf(item);
  if (!info?.collection)
    return `🎬 **${item.title}** isn’t part of a movie series.`;
  const c = await tmdb.collection(info.collection.id).catch(() => null);
  if (!c?.parts?.length)
    return `🎬 **${item.title}** is part of **${info.collection.name}**.`;
  const seen = c.parts.filter(p => isWatched(p.id)).length;
  const next = c.parts.find(p => !isWatched(p.id));
  return (
    `📚 **${c.name}** · ${seen}/${c.parts.length} watched` +
    (next ? ` · next: **${next.title}**` : ' · 🎉 all watched') +
    '\n\n' +
    c.parts
      .map(
        (p, i) =>
          `${isWatched(p.id) ? '✅' : next && p.id === next.id ? '▶️' : '⬜'} Part ${i + 1}: ${p.title}${p.year ? ` (${p.year})` : ''}${p.id === item.tmdbId ? ' ← this one' : ''}`,
      )
      .join('\n')
  );
}

// ---------- 📢 New seasons and episodes (groups) ----------
// Every few hours: for every series a group is watching (or has watched),
// compare TMDB with what we saw last time and tell the group channel when
// a new season is announced or a new episode is out. The first check only
// remembers the state, so nobody gets old news.
//
// Data: data.seriesAlerts[guildId][groupId][tvId] = { seasons, last, announced }

const key = p => (p ? `S${p.season}E${p.episode}` : null);
const parseKey = k => {
  const m = /^S(\d+)E(\d+)$/.exec(k || '');
  return m ? { season: Number(m[1]), episode: Number(m[2]) } : null;
};
const after = (a, b) =>
  a.season > b.season || (a.season === b.season && a.episode > b.episode);
const dateText = d =>
  d ? `<t:${Math.floor(Date.parse(`${d}T12:00:00Z`) / 1000)}:D>` : 'soon';

/**
 * What changed since the last check? `progress` = the group's last watched
 * episode, `watched` = the group finished the series. Returns
 * { alerts: [{ text, watchButton }], state } (state = what to remember).
 */
function compare(snap, info, progress, watched) {
  const alerts = [];
  const seasons = (info.seasons || []).length;
  const last = info.lastAired;
  const next = info.nextToAir;
  const state = {
    seasons,
    last: key(last),
    announced: snap?.announced || null,
  };
  if (!snap) return { alerts, state }; // first look: just remember

  // 📢 A new season: announced with a date, or it just showed up on TMDB
  if (next && next.episode === 1 && key(next) !== snap.announced) {
    alerts.push({
      text: `📢 **${info.title}** Season ${next.season} starts ${dateText(next.airDate)}!`,
    });
    state.announced = key(next);
  } else if (seasons > snap.seasons && `S${seasons}E1` !== snap.announced) {
    alerts.push({
      text: `📢 **${info.title}** got a new season: **Season ${seasons}**!`,
    });
    state.announced = `S${seasons}E1`;
  }

  // 🆕 A new episode is out, and the group had seen everything before it
  const prevLast = parseKey(snap.last);
  const caughtUp =
    watched || (progress && prevLast && !after(prevLast, progress));
  if (
    last &&
    key(last) !== snap.last &&
    caughtUp &&
    (!progress || after(last, progress))
  ) {
    alerts.push({
      text: `🆕 **${info.title}** ${key(last)}${last.title ? ` “${last.title}”` : ''} is out! You're caught up, so it's next.`,
      watchButton: true,
    });
  }
  return { alerts, state };
}

async function checkGroupSeries(client) {
  const groups = require('./groups');
  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
  } = require('discord.js');
  for (const guild of client.guilds.cache.values()) {
    for (const group of groups.allGroups(guild.id)) {
      const items = Object.values(group.watchlist || {}).filter(
        i => i.type === 'tv' && i.tmdbId,
      );
      for (const item of items) {
        const progress = groupProgress(guild.id, group.id, item.tmdbId);
        const watched = item.status === 'watched';
        if (!progress && !watched) continue; // only series the group actually watches
        const info = await tmdb.details('tv', item.tmdbId).catch(() => null);
        if (!info) continue;
        const snap =
          db.read(d => d.seriesAlerts?.[guild.id]?.[group.id]?.[item.tmdbId]) ||
          null;
        const { alerts, state } = compare(snap, info, progress, watched);
        db.perform(d => {
          d.seriesAlerts ||= {};
          d.seriesAlerts[guild.id] ||= {};
          d.seriesAlerts[guild.id][group.id] ||= {};
          d.seriesAlerts[guild.id][group.id][item.tmdbId] = state;
        });
        if (!alerts.length) continue;
        const channel = await client.channels
          .fetch(group.channelId)
          .catch(() => null);
        if (!channel) continue;
        const enc = require('./watchlist').encodeKey(item.key);
        // A watched series with a new episode is "watching" again
        if (watched && alerts.some(a => a.watchButton)) {
          db.perform(d => {
            const it =
              d.groups?.[guild.id]?.groups?.[group.id]?.watchlist?.[item.key];
            if (it) it.status = 'want';
          });
        }
        await channel
          .send({
            content: alerts.map(a => a.text).join('\n'),
            components: alerts.some(a => a.watchButton)
              ? [
                  new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                      .setCustomId(`group:epwatch:${group.id}:${enc}`)
                      .setLabel('Watch it now')
                      .setEmoji('▶️')
                      .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                      .setCustomId(`group:eplist:${group.id}:${enc}`)
                      .setLabel('Episodes')
                      .setEmoji('📋')
                      .setStyle(ButtonStyle.Secondary),
                  ),
                ]
              : [],
            allowedMentions: { parse: [] },
          })
          .catch(() => {});
      }
    }
  }
}

function startSeriesAlerts(client) {
  require('../utils/schedule').runEvery('Series alerts', 6 * 60, () =>
    checkGroupSeries(client),
  );
}

module.exports = {
  compare,
  checkGroupSeries,
  startSeriesAlerts,
  label,
  infoOf,
  nextEpisode,
  prevEpisode,
  fromAbsolute,
  episodeTitle,
  groupProgress,
  setGroupProgress,
  episodeOverview,
  collectionOverview,
};
