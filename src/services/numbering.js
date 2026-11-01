// Episode numbering as people know it. TMDB sometimes puts several seasons
// into one: Frieren's Japanese season 2 is "S1E29–S1E38" there. TMDB also
// has alternative orders ("episode groups"); when one splits the series into
// more seasons (e.g. "Seasons" / production order), NestBot SHOWS and READS
// episodes that way ("S2E1"), but keeps TMDB's numbering inside, so saved
// progress and movie nights keep working.
//
// Data: data.numbering[tvId] = { at, name, seasons: [["1x29|Title", …], …] } or { at, none: true }
const db = require('../utils/db');
const tmdb = require('./tmdb');

const REFRESH_MS = 7 * 24 * 3600 * 1000; // look again after a week
const PREFERRED_TYPES = [6, 7, 1]; // production, TV, original air date

/** Pick the episode group that splits the series into more real seasons than TMDB does. */
async function pickGroup(tvId) {
  const info = await tmdb.details('tv', tvId).catch(() => null);
  const regular = (info?.seasons || []).length;
  const total = (info?.seasons || []).reduce((n, s) => n + s.episodes, 0);
  const groups = await tmdb.episodeGroups(tvId).catch(() => []);
  const candidates = groups
    .filter(g => PREFERRED_TYPES.includes(g.type))
    .sort(
      (a, b) =>
        PREFERRED_TYPES.indexOf(a.type) - PREFERRED_TYPES.indexOf(b.type) ||
        /season/i.test(b.name) - /season/i.test(a.name),
    );
  for (const c of candidates) {
    const parts = await tmdb.episodeGroup(c.id).catch(() => null);
    if (!parts) continue;
    const seasons = parts
      .sort((a, b) => a.order - b.order)
      .map(p =>
        p.episodes.filter(e => e.season > 0).sort((a, b) => a.order - b.order),
      )
      .filter(eps => eps.length);
    const covered = seasons.reduce((n, eps) => n + eps.length, 0);
    if (seasons.length > regular && covered >= total * 0.9)
      return { name: c.name, seasons };
  }
  return null;
}

/** Load (or refresh) the numbering of a series. Returns the stored entry. */
async function load(tvId, { fresh = false } = {}) {
  if (!tvId) return null;
  const stored = db.read(d => d.numbering?.[tvId]);
  if (stored && !fresh && Date.now() - stored.at < REFRESH_MS) return stored;
  if (!tmdb.isEnabled()) return stored || null;
  const g = await pickGroup(tvId).catch(() => null);
  const entry = g
    ? {
        at: Date.now(),
        name: g.name,
        seasons: g.seasons.map(eps =>
          eps.map(e => `${e.season}x${e.episode}|${e.title || ''}`),
        ),
      }
    : { at: Date.now(), none: true };
  db.perform(d => {
    d.numbering ||= {};
    d.numbering[tvId] = entry;
  });
  return entry;
}

/** The stored numbering, already split up: [[{ season, episode, title }]] or null. */
function seasonsOf(tvId) {
  const e = tvId && db.read(d => d.numbering?.[tvId]);
  if (!e || e.none) return null;
  return e.seasons.map(eps =>
    eps.map(x => {
      const [se, title] = x.split('|');
      const [season, episode] = se.split('x').map(Number);
      return { season, episode, title: title || null };
    }),
  );
}

/** TMDB episode → how people number it ({ season, episode }). */
function toDisplay(tvId, season, episode) {
  const seasons = seasonsOf(tvId);
  if (!seasons) return { season, episode };
  for (let i = 0; i < seasons.length; i++) {
    const j = seasons[i].findIndex(
      x => x.season === season && x.episode === episode,
    );
    if (j >= 0) return { season: i + 1, episode: j + 1 };
  }
  // Newer than the episode group (TMDB not updated yet): keep counting in the last season
  const last = seasons.at(-1);
  const end = last.at(-1);
  if (season === end.season && episode > end.episode)
    return {
      season: seasons.length,
      episode: last.length + (episode - end.episode),
    };
  return { season, episode };
}

/** How people number it → TMDB episode, or null if that episode doesn't exist. */
function fromDisplay(tvId, season, episode) {
  const seasons = seasonsOf(tvId);
  if (!seasons) return { season, episode };
  const s = seasons[season - 1];
  if (!s) return null;
  if (s[episode - 1])
    return { season: s[episode - 1].season, episode: s[episode - 1].episode };
  // Past the known end of the last season: count on in TMDB's numbering
  if (season === seasons.length) {
    const end = s.at(-1);
    return { season: end.season, episode: end.episode + (episode - s.length) };
  }
  return null;
}

/** "S2E1" (as people know it). */
function label(tvId, p) {
  if (!p) return '–';
  const d = toDisplay(tvId, p.season, p.episode);
  return `S${d.season}E${d.episode}`;
}

/** Seasons as people know them, for overviews: [{ number, episodes, list: [{ season, episode, title }] }] or null. */
function displaySeasons(tvId) {
  const seasons = seasonsOf(tvId);
  return seasons
    ? seasons.map((list, i) => ({ number: i + 1, episodes: list.length, list }))
    : null;
}

module.exports = {
  load,
  toDisplay,
  fromDisplay,
  label,
  displaySeasons,
  seasonsOf,
};
