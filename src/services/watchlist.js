// Personal watchlists (and the movie settings of each person).
//
// Data: data.watchlists[guildId][userId] = {
//   settings: { visibility: 'public'|'private', region, services: [], notify },
//   items: { key: item },             key = "movie:123", "tv:456" or "text:<slug>"
//   pending: { key: { … } },          watched at a movie night, waiting for "✅ yes"
// }
// item = { key, type, tmdbId, title, year, anime, poster, runtime, genres,
//          status: 'want'|'watching'|'watched', visibility: null|'public'|'private',
//          must, note, addedAt, watchedAt, rating, progress: { season, episode },
//          watchedWith: [userIds] }
const db = require('../utils/db');

const PENDING_DAYS = 7; // unconfirmed "did you watch it?" expire after this
const MAX_NOTE = 200;

const STATUS = {
  want: { emoji: '📌', label: 'Want to watch' },
  watching: { emoji: '▶️', label: 'Watching' },
  watched: { emoji: '✅', label: 'Watched' },
};

const copy = x => (x ? JSON.parse(JSON.stringify(x)) : x);

// ---------- Keys ----------

/** A stable id for a title: "movie:27205", "tv:209867" or "text:our-home-video". */
function keyOf({ type, tmdbId, title }) {
  if (tmdbId) return `${type}:${tmdbId}`;
  const slug = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `text:${slug || 'untitled'}`;
}

/** Keys contain ":" which Discord button ids use as separator. */
const encodeKey = key => key.replace(/:/g, '_');
const decodeKey = enc => enc.replace(/_/, ':');

/** Title fields for an item, from TMDB details or plain text. */
function titleFields(info, fallbackTitle) {
  if (!info)
    return {
      type: 'movie',
      tmdbId: null,
      title: fallbackTitle,
      year: '',
      anime: false,
      poster: null,
      runtime: null,
      genres: [],
    };
  return {
    type: info.type,
    tmdbId: info.id,
    title: info.title,
    year: info.year,
    anime: !!info.anime,
    poster: info.poster,
    runtime: info.runtime,
    genres: info.genres || [],
  };
}

// ---------- Reading ----------

function getList(guildId, userId) {
  const raw = db.read(d => d.watchlists?.[guildId]?.[userId]);
  return {
    settings: {
      visibility: 'public',
      region: null,
      services: [],
      notify: false,
      ...(raw?.settings || {}),
    },
    items: copy(raw?.items) || {},
    pending: copy(raw?.pending) || {},
  };
}

/** Is this item visible to other people? */
function isPublic(item, settings) {
  return (item.visibility || settings.visibility) === 'public';
}

/** Items, newest first, optionally only the ones others may see. */
function items(guildId, userId, { publicOnly = false } = {}) {
  const list = getList(guildId, userId);
  return Object.values(list.items)
    .filter(i => !publicOnly || isPublic(i, list.settings))
    .sort(
      (a, b) => (b.must ? 1 : 0) - (a.must ? 1 : 0) || b.addedAt - a.addedAt,
    );
}

function getItem(guildId, userId, key) {
  return getList(guildId, userId).items[key] || null;
}

/** Everyone's lists in this server: [[userId, list], …] */
function allLists(guildId) {
  return Object.entries(copy(db.read(d => d.watchlists?.[guildId])) || {});
}

/** How many people publicly want to watch this title. */
function wantCount(guildId, key) {
  let n = 0;
  for (const [, list] of allLists(guildId)) {
    const settings = { visibility: 'public', ...(list.settings || {}) };
    const item = list.items?.[key];
    if (item && item.status !== 'watched' && isPublic(item, settings)) n++;
  }
  return n;
}

/** People who want to be told when this title is planned. */
function notifyTargets(guildId, key) {
  return allLists(guildId)
    .filter(
      ([, l]) =>
        l.settings?.notify &&
        l.items?.[key] &&
        l.items[key].status !== 'watched',
    )
    .map(([userId]) => userId);
}

// ---------- Writing ----------

function mutate(guildId, userId, fn) {
  let result;
  db.perform(d => {
    d.watchlists ||= {};
    d.watchlists[guildId] ||= {};
    const list = (d.watchlists[guildId][userId] ||= {
      settings: {},
      items: {},
      pending: {},
    });
    list.items ||= {};
    list.pending ||= {};
    list.settings ||= {};
    result = fn(list);
  });
  return copy(result);
}

/** Add a title. Returns { item, existed }. */
function addItem(
  guildId,
  userId,
  fields,
  { visibility = null, must = false, note = null, status = 'want' } = {},
) {
  const key = keyOf(fields);
  return mutate(guildId, userId, list => {
    const existed = !!list.items[key];
    const item = (list.items[key] ||= {
      key,
      ...fields,
      status,
      visibility: null,
      must: false,
      note: null,
      addedAt: Date.now(),
      watchedAt: null,
      rating: null,
      progress: null,
      watchedWith: [],
    });
    if (visibility) item.visibility = visibility;
    if (must) item.must = true;
    if (note) item.note = note.slice(0, MAX_NOTE);
    return { item, existed };
  });
}

function removeItem(guildId, userId, key) {
  return mutate(guildId, userId, list => {
    const item = list.items[key];
    delete list.items[key];
    return item || null;
  });
}

/** Change fields of an item (status, visibility, must, note, rating, progress). */
function editItem(guildId, userId, key, changes) {
  return mutate(guildId, userId, list => {
    const item = list.items[key];
    if (!item) return null;
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined) continue;
      item[k] = k === 'note' && v ? String(v).slice(0, MAX_NOTE) : v;
    }
    if (changes.status === 'watched' && !item.watchedAt)
      item.watchedAt = Date.now();
    return item;
  });
}

/** Mark as watched (adds the title if it wasn't on the list). */
function markWatched(
  guildId,
  userId,
  fields,
  { rating = null, watchedWith = [], progress = null } = {},
) {
  const key = keyOf(fields);
  return mutate(guildId, userId, list => {
    const item = (list.items[key] ||= {
      key,
      ...fields,
      visibility: null,
      must: false,
      note: null,
      addedAt: Date.now(),
      watchedWith: [],
    });
    const isSeries = fields.type === 'tv';
    item.status = isSeries && progress ? 'watching' : 'watched';
    item.watchedAt = Date.now();
    if (rating) item.rating = rating;
    if (progress) item.progress = progress;
    item.watchedWith = [
      ...new Set([
        ...(item.watchedWith || []),
        ...watchedWith.filter(u => u !== userId),
      ]),
    ];
    delete list.pending[key];
    return item;
  });
}

function rate(guildId, userId, key, rating) {
  return editItem(guildId, userId, key, { rating });
}

function setSettings(guildId, userId, changes) {
  return mutate(guildId, userId, list => {
    for (const [k, v] of Object.entries(changes))
      if (v !== undefined) list.settings[k] = v;
    return {
      visibility: 'public',
      region: null,
      services: [],
      notify: false,
      ...list.settings,
    };
  });
}

// ---------- Pending confirmations ----------

/** After a movie night: ask this person to confirm they watched it. */
function addPending(guildId, userId, entry) {
  return mutate(guildId, userId, list => {
    list.pending[entry.key] = { ...entry, at: Date.now() };
    return list.pending[entry.key];
  });
}

function getPending(guildId, userId) {
  const cutoff = Date.now() - PENDING_DAYS * 86400000;
  return Object.values(getList(guildId, userId).pending).filter(
    p => p.at >= cutoff,
  );
}

/** Confirm (→ watched) or dismiss a pending entry. Returns the entry or null. */
function resolvePending(guildId, userId, key, confirm) {
  const entry = getList(guildId, userId).pending[key];
  if (!entry) return null;
  if (confirm) {
    markWatched(guildId, userId, entry.fields, {
      watchedWith: entry.watchedWith || [],
      progress: entry.progress || null,
    });
  } else {
    mutate(guildId, userId, list => delete list.pending[key]);
  }
  return entry;
}

/** Drop pending entries older than PENDING_DAYS (called by cleanup). */
function prunePending() {
  const cutoff = Date.now() - PENDING_DAYS * 86400000;
  db.perform(d => {
    for (const guild of Object.values(d.watchlists || {})) {
      for (const list of Object.values(guild)) {
        for (const [k, p] of Object.entries(list.pending || {}))
          if (p.at < cutoff) delete list.pending[k];
      }
    }
  });
}

// ---------- Matching and stats ----------

/**
 * What do these people want to watch? Only public, not-yet-watched items.
 * Returns [{ key, title, …, count, users }] sorted by how many want it.
 */
function match(guildId, userIds) {
  const map = new Map();
  for (const userId of userIds) {
    for (const item of items(guildId, userId, { publicOnly: true })) {
      if (item.status === 'watched') continue;
      const entry = map.get(item.key) || { ...item, count: 0, users: [] };
      entry.count++;
      entry.users.push(userId);
      if (item.must) entry.must = true;
      map.set(item.key, entry);
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || (b.must ? 1 : 0) - (a.must ? 1 : 0),
  );
}

/** Average rating per title over everyone (min. `min` ratings). */
function topRated(guildId, { min = 2, limit = 10 } = {}) {
  const map = new Map();
  for (const [, list] of allLists(guildId)) {
    for (const item of Object.values(list.items || {})) {
      if (!item.rating) continue;
      const e = map.get(item.key) || { ...item, sum: 0, n: 0 };
      e.sum += item.rating;
      e.n++;
      map.set(item.key, e);
    }
  }
  return [...map.values()]
    .filter(e => e.n >= min)
    .map(e => ({ ...e, avg: e.sum / e.n }))
    .sort((a, b) => b.avg - a.avg || b.n - a.n)
    .slice(0, limit);
}

/** Numbers for /profile and achievements. */
function stats(guildId, userId) {
  const all = Object.values(getList(guildId, userId).items);
  const watched = all.filter(
    i => i.status === 'watched' || i.status === 'watching',
  );
  const genres = {};
  for (const i of watched)
    for (const g of i.genres || []) genres[g] = (genres[g] || 0) + 1;
  const favGenre =
    Object.entries(genres).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return {
    onList: all.filter(i => i.status !== 'watched').length,
    watchedMovies: watched.filter(i => i.type === 'movie').length,
    watchedSeries: watched.filter(i => i.type === 'tv').length,
    watchedAnime: watched.filter(i => i.anime).length,
    ratings: all.filter(i => i.rating).length,
    minutes: watched
      .filter(i => i.type === 'movie')
      .reduce((n, i) => n + (i.runtime || 0), 0),
    favGenre,
  };
}

module.exports = {
  STATUS,
  PENDING_DAYS,
  keyOf,
  encodeKey,
  decodeKey,
  titleFields,
  getList,
  isPublic,
  items,
  getItem,
  wantCount,
  notifyTargets,
  addItem,
  removeItem,
  editItem,
  markWatched,
  rate,
  setSettings,
  addPending,
  getPending,
  resolvePending,
  prunePending,
  match,
  topRated,
  stats,
};
