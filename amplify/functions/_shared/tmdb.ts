import { HttpError } from './http.js';
import { env } from './secrets.js';

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
async function fetchWithRetry(url: URL, attempts = 3): Promise<Response> {
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
        return response;
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

  const response = await fetchWithRetry(url);

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

  movie: (id: number) => tmdbFetch<TmdbMovieDetails>(`/movie/${id}`),

  show: (id: number) => tmdbFetch<TmdbShowDetails>(`/tv/${id}`),

  season: (showId: number, seasonNumber: number) =>
    tmdbFetch<{ season_number: number; name: string; episodes: TmdbEpisode[] }>(
      `/tv/${showId}/season/${seasonNumber}`,
    ),
};
