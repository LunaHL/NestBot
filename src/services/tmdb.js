// The Movie Database (TMDB): movies, series and anime with posters, runtimes,
// seasons/episodes and where to stream them. Free for non-commercial use;
// attribution required ("Uses TMDB, not endorsed by TMDB").
//
// Needs TMDB_TOKEN in .env (the "API Read Access Token" from
// themoviedb.org/settings/api; the short v3 API key works too).
// Without it everything still works, just without posters and details.
const API = 'https://api.themoviedb.org/3';
const IMAGE = 'https://image.tmdb.org/t/p/w500';
const TIMEOUT_MS = 8000;
const ATTRIBUTION = 'Data from TMDB · not endorsed by TMDB';

const cache = new Map(); // url -> { at, data }
const CACHE_MS = 6 * 60 * 60 * 1000;

const token = () => process.env.TMDB_TOKEN || '';
const isEnabled = () => !!token();

async function get(path, params = {}) {
  if (!isEnabled()) return null;
  const t = token();
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  // Long token = v4 "Read Access Token" (Bearer); short = v3 api_key
  const headers = { accept: 'application/json' };
  if (t.length > 40) headers.Authorization = `Bearer ${t}`;
  else url.searchParams.set('api_key', t);

  const key = url.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(key, { headers, signal: ctrl.signal });
    if (!res.ok) {
      console.warn(`[TMDB] ${path} → HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    console.warn(`[TMDB] ${path} failed:`, e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const yearOf = date => (date ? String(date).slice(0, 4) : '');
const ANIMATION = 16;
const isAnime = (r, genres = []) =>
  r.original_language === 'ja' &&
  (r.genre_ids?.includes(ANIMATION) || genres.some(g => g.id === ANIMATION));

/** Emoji for the kind: 🎬 movie, 📺 series, 🎌 anime */
function kindEmoji(type, anime) {
  if (anime) return '🎌';
  return type === 'tv' ? '📺' : '🎬';
}

/**
 * Search movies and series (incl. anime). For autocomplete.
 * Returns [{ type: 'movie'|'tv', id, title, original, year, anime }]
 */
async function search(query) {
  if (!query || query.trim().length < 2) return [];
  const data = await get('/search/multi', {
    query: query.trim(),
    include_adult: 'false',
    language: 'en-US',
    page: 1,
  });
  return (data?.results || [])
    .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, 20)
    .map(r => ({
      type: r.media_type,
      id: r.id,
      title: r.title || r.name,
      original: r.original_title || r.original_name,
      year: yearOf(r.release_date || r.first_air_date),
      anime: isAnime(r),
    }));
}

/** Full details for one movie or series, in the format the bot uses. */
async function details(type, id) {
  const d = await get(`/${type}/${id}`, { language: 'en-US' });
  if (!d) return null;
  const tv = type === 'tv';
  return {
    type,
    id: d.id,
    title: tv ? d.name : d.title,
    original: tv ? d.original_name : d.original_title,
    year: yearOf(tv ? d.first_air_date : d.release_date),
    overview: d.overview || '',
    genres: (d.genres || []).map(g => g.name),
    poster: d.poster_path ? IMAGE + d.poster_path : null,
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    anime: isAnime(d, d.genres || []),
    // Movies: runtime; series: typical episode length
    runtime: tv ? d.episode_run_time?.[0] || null : d.runtime || null,
    seasons: tv
      ? (d.seasons || [])
          .filter(s => s.season_number > 0)
          .map(s => ({
            number: s.season_number,
            episodes: s.episode_count,
            name: s.name,
          }))
      : null,
    collection:
      !tv && d.belongs_to_collection
        ? { id: d.belongs_to_collection.id, name: d.belongs_to_collection.name }
        : null,
  };
}

/** A movie series ("collection"), parts sorted by release: [{ id, title, year }] */
async function collection(id) {
  const d = await get(`/collection/${id}`, { language: 'en-US' });
  if (!d?.parts) return null;
  return {
    id: d.id,
    name: d.name,
    parts: [...d.parts]
      .filter(p => p.release_date)
      .sort((a, b) => a.release_date.localeCompare(b.release_date))
      .map(p => ({ id: p.id, title: p.title, year: yearOf(p.release_date) })),
  };
}

/** One episode: { season, episode, title, runtime } or null. */
async function episode(tvId, season, ep) {
  const d = await get(`/tv/${tvId}/season/${season}/episode/${ep}`, {
    language: 'en-US',
  });
  if (!d) return null;
  return {
    season: d.season_number,
    episode: d.episode_number,
    title: d.name,
    runtime: d.runtime || null,
  };
}

/**
 * Where to watch in a country (e.g. "DE").
 * Returns { link, stream: [...], free: [...], rent: [...], buy: [...] } or null.
 */
async function providers(type, id, region) {
  const d = await get(`/${type}/${id}/watch/providers`);
  const r = d?.results?.[region];
  if (!r) return null;
  const names = list => [...new Set((list || []).map(p => p.provider_name))];
  return {
    link: r.link,
    stream: names(r.flatrate),
    free: names([...(r.free || []), ...(r.ads || [])]),
    rent: names(r.rent),
    buy: names(r.buy),
  };
}

/** Guess a country from the Discord language, e.g. "de" → DE, "en-GB" → GB. */
function regionFromLocale(locale) {
  const l = String(locale || '');
  const map = {
    de: 'DE',
    fr: 'FR',
    es: 'ES',
    it: 'IT',
    nl: 'NL',
    pl: 'PL',
    ja: 'JP',
    ko: 'KR',
    sv: 'SE',
    da: 'DK',
    fi: 'FI',
    no: 'NO',
    tr: 'TR',
    pt: 'PT',
    cs: 'CZ',
    hu: 'HU',
    ro: 'RO',
    el: 'GR',
    uk: 'UA',
  };
  if (l.includes('-')) return l.split('-')[1].toUpperCase();
  return map[l] || 'DE';
}

module.exports = {
  ATTRIBUTION,
  isEnabled,
  search,
  details,
  episode,
  collection,
  providers,
  regionFromLocale,
  kindEmoji,
};
