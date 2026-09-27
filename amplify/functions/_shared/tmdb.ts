import { HttpError } from './http.js';
import { env } from './secrets.js';
import { readTmdbCache, writeTmdbCache } from './tmdbCache.js';
import { logTiming } from './timing.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';

export interface TmdbSearchResult {
  id: number;
  media_type?: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  popularity?: number;
}

export interface TmdbEpisode {
  id: number;
  name: string | null;
  overview: string | null;
  air_date: string | null;
  season_number: number;
  episode_number: number;
  still_path: string | null;
}

export interface TmdbShowDetails {
  id: number;
  name: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string | null;
  status: string | null;
  number_of_episodes: number | null;
  number_of_seasons: number | null;
  next_episode_to_air: TmdbEpisode | null;
  last_episode_to_air: TmdbEpisode | null;
  seasons: Array<{
    season_number: number;
    episode_count: number;
    name: string;
    air_date: string | null;
  }>;
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  runtime: number | null;
  status: string | null;
}

/** TMDB occasionally resets connections; retry transient failures with backoff. */
async function fetchWithRetry(url: URL, attempts = 3): Promise<{ response: Response; attempts: number }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${env.tmdbAccessToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (response.status >= 500 && attempt < attempts) {
        lastError = new Error(`TMDB responded ${response.status}`);
      } else {
        return { response, attempts: attempt };
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }

  console.error('TMDB request failed after retries', lastError);
  throw new HttpError(502, 'Could not reach TMDB');
}

export async function tmdbFetch<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const started = Date.now();
  let response: Response;
  let attempts = 0;
  try {
    const result = await fetchWithRetry(url);
    response = result.response;
    attempts = result.attempts;
  } catch (error) {
    logTiming('tmdb', started, { path: url.pathname, ok: false });
    throw error;
  }

  logTiming('tmdb', started, { path: url.pathname, status: response.status, attempts, ok: response.ok });

  if (response.status === 404) {
    throw new HttpError(404, 'Not found on TMDB');
  }
  if (response.status === 429) {
    throw new HttpError(429, 'TMDB rate limit reached, try again shortly');
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('TMDB request failed', response.status, detail.slice(0, 500));
    throw new HttpError(502, 'TMDB request failed');
  }

  return (await response.json()) as T;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type CacheOptions = { fresh?: boolean };

function positiveId(id: number): boolean {
  return Number.isInteger(id) && id > 0;
}

function movieTtl(movie: TmdbMovieDetails): number {
  return movie.status === 'Released' || movie.status === 'Canceled' ? 30 * DAY : 12 * HOUR;
}

function showTtl(show: TmdbShowDetails): number {
  return show.status === 'Ended' || show.status === 'Canceled' ? 7 * DAY : 12 * HOUR;
}

function seasonTtl(season: { episodes: Array<{ air_date: string | null }> }): number {
  const today = new Date().toISOString().slice(0, 10);
  const stillOpen =
    season.episodes.length === 0 ||
    season.episodes.some((episode) => !episode.air_date || episode.air_date >= today);
  return stillOpen ? 12 * HOUR : 30 * DAY;
}

async function cached<T>(
  cacheKey: string | null,
  ttlFor: (value: T) => number,
  load: () => Promise<T>,
  options?: CacheOptions,
): Promise<T> {
  if (!options?.fresh && cacheKey) {
    const hit = await readTmdbCache<T>(cacheKey);
    if (hit) return hit;
  }
  const value = await load();
  if (cacheKey) await writeTmdbCache(cacheKey, value, ttlFor(value));
  return value;
}

export const tmdb = {
  searchMulti: (query: string, page = 1) =>
    tmdbFetch<{ page: number; total_pages: number; total_results: number; results: TmdbSearchResult[] }>(
      '/search/multi',
      { query, page, include_adult: false },
    ),

  search: (mediaType: 'movie' | 'tv', query: string, page = 1) =>
    tmdbFetch<{ page: number; total_pages: number; total_results: number; results: TmdbSearchResult[] }>(
      `/search/${mediaType}`,
      { query, page, include_adult: false },
    ),

  trending: (mediaType: 'movie' | 'tv' | 'all', window: 'day' | 'week' = 'week') =>
    tmdbFetch<{ results: TmdbSearchResult[] }>(`/trending/${mediaType}/${window}`),

  movie: (id: number, options?: CacheOptions) =>
    cached(
      positiveId(id) ? `movie:${id}` : null,
      movieTtl,
      () => tmdbFetch<TmdbMovieDetails>(`/movie/${id}`),
      options,
    ),

  show: (id: number, options?: CacheOptions) =>
    cached(
      positiveId(id) ? `tv:${id}` : null,
      showTtl,
      () => tmdbFetch<TmdbShowDetails>(`/tv/${id}`),
      options,
    ),

  season: (showId: number, seasonNumber: number, options?: CacheOptions) =>
    cached(
      positiveId(showId) && Number.isInteger(seasonNumber) && seasonNumber >= 0
        ? `tv:${showId}:season:${seasonNumber}`
        : null,
      seasonTtl,
      () =>
        tmdbFetch<{ season_number: number; name: string; episodes: TmdbEpisode[] }>(
          `/tv/${showId}/season/${seasonNumber}`,
        ),
      options,
    ),
};
