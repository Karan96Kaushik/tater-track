import { mediaApi, type EpisodeDetail, type MediaDetails, type SeasonSummary } from '@/lib/amplify/media-functions';
import type { MediaType } from '@/lib/supabase/types';
import { supabase } from '@/utils/supabase';

interface CachedEpisode {
  name: string | null;
  overview: string | null;
  air_date: string | null;
  season_number: number;
  episode_number: number;
  still_path: string | null;
}

interface CachedShow {
  name: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string | null;
  status: string | null;
  number_of_episodes: number | null;
  number_of_seasons: number | null;
  next_episode_to_air: MediaDetails['nextEpisodeToAir'];
  seasons: Array<{
    season_number: number;
    episode_count: number;
    name: string;
    air_date: string | null;
  }>;
}

interface CachedMovie {
  title: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  runtime: number | null;
  status: string | null;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

const inflightSeasons = new Map<string, Promise<EpisodeDetail[]>>();

function movieKey(tmdbId: number): string {
  return `movie:${tmdbId}`;
}

function showKey(tmdbId: number): string {
  return `tv:${tmdbId}`;
}

function seasonKey(tmdbId: number, seasonNumber: number): string {
  return `tv:${tmdbId}:season:${seasonNumber}`;
}

function inflightKey(tmdbId: number, seasonNumber: number): string {
  return `${tmdbId}:${seasonNumber}`;
}

function defer<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  let settled = false;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: (value) => {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    },
    reject: (reason) => {
      if (settled) return;
      settled = true;
      rejectPromise(reason);
    },
  };
}

function isEpisode(value: unknown): value is CachedEpisode {
  if (!value || typeof value !== 'object') return false;
  const episode = value as CachedEpisode;
  return Number.isInteger(episode.season_number) && Number.isInteger(episode.episode_number);
}

function isSeason(value: unknown): value is { episodes: CachedEpisode[] } {
  if (!value || typeof value !== 'object') return false;
  const episodes = (value as { episodes?: unknown }).episodes;
  return Array.isArray(episodes) && episodes.every(isEpisode);
}

function isShow(value: unknown): value is CachedShow {
  if (!value || typeof value !== 'object') return false;
  const show = value as CachedShow;
  return typeof show.name === 'string' && Array.isArray(show.seasons);
}

function isMovie(value: unknown): value is CachedMovie {
  return Boolean(value && typeof value === 'object' && typeof (value as { title?: unknown }).title === 'string');
}

async function resolveUserId(userId: string | null | undefined): Promise<string | null> {
  if (userId !== undefined) return userId;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Unexpired cache rows. `null` means the read failed and the caller should use Amplify. */
async function readPayloads(keys: string[]): Promise<Map<string, unknown> | null> {
  if (keys.length === 0) return new Map();
  const { data, error } = await supabase
    .from('tmdb_cache')
    .select('cache_key, payload')
    .in('cache_key', keys)
    .gt('expires_at', new Date().toISOString());
  if (error) {
    console.warn('tmdb cache read failed', error.message);
    return null;
  }
  return new Map((data ?? []).map((row) => [row.cache_key, row.payload]));
}

export async function listWatchedKeys(tmdbId: number, userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const { data, error } = await supabase
    .from('watched_episodes')
    .select('season_number, episode_number')
    .eq('user_id', userId)
    .eq('tmdb_show_id', tmdbId);
  if (error) {
    console.warn('watched episode read failed', error.message);
    return new Set();
  }
  return new Set((data ?? []).map((row) => `${row.season_number}:${row.episode_number}`));
}

function toEpisodes(episodes: CachedEpisode[], watched: Set<string>): EpisodeDetail[] {
  return episodes.map((episode) => ({
    seasonNumber: episode.season_number,
    episodeNumber: episode.episode_number,
    name: episode.name,
    overview: episode.overview,
    airDate: episode.air_date,
    stillPath: episode.still_path,
    watched: watched.has(`${episode.season_number}:${episode.episode_number}`),
  }));
}

function visibleSeasons(show: CachedShow, includeSpecials: boolean): SeasonSummary[] {
  return show.seasons
    .filter((season) => includeSpecials || season.season_number > 0)
    .map((season) => ({
      seasonNumber: season.season_number,
      name: season.name,
      episodeCount: season.episode_count,
      airDate: season.air_date,
    }));
}

function assembleShow(
  tmdbId: number,
  show: CachedShow,
  seasons: SeasonSummary[],
  episodes: EpisodeDetail[],
  watched: Set<string>,
): MediaDetails {
  return {
    mediaType: 'tv',
    tmdbId,
    title: show.name,
    overview: show.overview ?? null,
    posterPath: show.poster_path ?? null,
    backdropPath: show.backdrop_path ?? null,
    releaseDate: show.first_air_date ?? null,
    status: show.status ?? null,
    numberOfSeasons: show.number_of_seasons ?? undefined,
    numberOfEpisodes: show.number_of_episodes ?? undefined,
    nextEpisodeToAir: show.next_episode_to_air ?? null,
    seasons,
    episodes,
    watchedEpisodeCount: watched.size,
    tracked: null,
  };
}

async function loadMovie(tmdbId: number): Promise<MediaDetails> {
  const payloads = await readPayloads([movieKey(tmdbId)]);
  const movie = payloads?.get(movieKey(tmdbId));
  if (isMovie(movie)) {
    return {
      mediaType: 'movie',
      tmdbId,
      title: movie.title,
      overview: movie.overview ?? null,
      posterPath: movie.poster_path ?? null,
      backdropPath: movie.backdrop_path ?? null,
      releaseDate: movie.release_date ?? null,
      runtime: movie.runtime ?? null,
      status: movie.status ?? null,
      tracked: null,
    };
  }
  return mediaApi.details({ tmdbId, mediaType: 'movie' });
}

async function loadShow(tmdbId: number, includeSpecials: boolean, userId: string | null): Promise<MediaDetails> {
  const payloads = await readPayloads([showKey(tmdbId)]);
  const show = payloads?.get(showKey(tmdbId));
  if (!isShow(show)) {
    return mediaApi.details({ tmdbId, mediaType: 'tv', includeSpecials });
  }

  const seasons = visibleSeasons(show, includeSpecials);
  const first = seasons[0]?.seasonNumber;
  const watched = await listWatchedKeys(tmdbId, userId);
  if (first === undefined) return assembleShow(tmdbId, show, seasons, [], watched);

  const seasonPayloads = await readPayloads([seasonKey(tmdbId, first)]);
  const season = seasonPayloads?.get(seasonKey(tmdbId, first));
  if (isSeason(season)) {
    return assembleShow(tmdbId, show, seasons, toEpisodes(season.episodes, watched), watched);
  }

  const filled = await mediaApi.details({
    tmdbId,
    mediaType: 'tv',
    seasonNumbers: [first],
    includeSpecials,
  });
  const episodes = filled.episodesBySeason?.[String(first)] ?? filled.episodes ?? [];
  return assembleShow(tmdbId, show, seasons, episodes, watched);
}

/** Show or movie details. Reads `tmdb_cache` first and calls Amplify only on a miss. */
export async function loadMediaDetails(params: {
  tmdbId: number;
  mediaType: MediaType;
  includeSpecials?: boolean;
  userId?: string | null;
}): Promise<MediaDetails> {
  const userId = await resolveUserId(params.userId);
  if (params.mediaType === 'movie') return loadMovie(params.tmdbId);
  return loadShow(params.tmdbId, params.includeSpecials ?? false, userId);
}

async function fillSeasons(
  tmdbId: number,
  seasonNumbers: number[],
  deferreds: Map<number, Deferred<EpisodeDetail[]>>,
  userId: string | null,
  includeSpecials: boolean,
): Promise<void> {
  const watched = await listWatchedKeys(tmdbId, userId);
  const payloads = await readPayloads(seasonNumbers.map((seasonNumber) => seasonKey(tmdbId, seasonNumber)));
  const misses: number[] = [];

  for (const seasonNumber of seasonNumbers) {
    const payload = payloads?.get(seasonKey(tmdbId, seasonNumber));
    if (isSeason(payload)) deferreds.get(seasonNumber)?.resolve(toEpisodes(payload.episodes, watched));
    else misses.push(seasonNumber);
  }

  if (misses.length === 0) return;

  try {
    const filled = await mediaApi.details({
      tmdbId,
      mediaType: 'tv',
      seasonNumbers: misses,
      includeSpecials,
    });
    const stillMissing: number[] = [];
    for (const seasonNumber of misses) {
      const episodes = episodesFor(filled, seasonNumber);
      if (episodes) deferreds.get(seasonNumber)?.resolve(episodes);
      else stillMissing.push(seasonNumber);
    }
    // A details function that has not been redeployed ignores seasonNumbers and
    // returns only one season. Fetch the rest one at a time.
    if (stillMissing.length > 0) {
      await mapLimit(stillMissing, 4, async (seasonNumber) => {
        try {
          const single = await mediaApi.details({
            tmdbId,
            mediaType: 'tv',
            seasonNumber,
            includeSpecials,
          });
          const episodes = episodesFor(single, seasonNumber);
          if (episodes) deferreds.get(seasonNumber)?.resolve(episodes);
          else deferreds.get(seasonNumber)?.reject(new Error(`Could not load season ${seasonNumber}`));
        } catch (error) {
          deferreds.get(seasonNumber)?.reject(error);
        }
      });
    }
  } catch (error) {
    for (const seasonNumber of misses) deferreds.get(seasonNumber)?.reject(error);
  }
}

function episodesFor(details: MediaDetails, seasonNumber: number): EpisodeDetail[] | null {
  const batched = details.episodesBySeason?.[String(seasonNumber)];
  if (batched) return batched;
  if (details.episodes?.[0]?.seasonNumber === seasonNumber) return details.episodes;
  return null;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}

/**
 * Episode lists for the given seasons. Cache hits resolve on their own; misses
 * share one Amplify call. A season already being loaded joins that request.
 */
export async function ensureSeasons(params: {
  tmdbId: number;
  seasonNumbers: number[];
  includeSpecials?: boolean;
  userId?: string | null;
}): Promise<Map<number, EpisodeDetail[]>> {
  const { tmdbId, includeSpecials = false } = params;
  const unique = [...new Set(params.seasonNumbers)];
  const start: number[] = [];
  const deferreds = new Map<number, Deferred<EpisodeDetail[]>>();

  for (const seasonNumber of unique) {
    if (!inflightSeasons.has(inflightKey(tmdbId, seasonNumber))) start.push(seasonNumber);
  }

  if (start.length > 0) {
    for (const seasonNumber of start) {
      const deferred = defer<EpisodeDetail[]>();
      deferreds.set(seasonNumber, deferred);
      const key = inflightKey(tmdbId, seasonNumber);
      const promise = deferred.promise.finally(() => {
        if (inflightSeasons.get(key) === promise) inflightSeasons.delete(key);
      });
      inflightSeasons.set(key, promise);
    }

    void (async () => {
      try {
        const userId = await resolveUserId(params.userId);
        await fillSeasons(tmdbId, start, deferreds, userId, includeSpecials);
      } catch (error) {
        for (const deferred of deferreds.values()) deferred.reject(error);
      }
    })();
  }

  const loaded = new Map<number, EpisodeDetail[]>();
  await Promise.all(
    unique.map(async (seasonNumber) => {
      try {
        const episodes = await inflightSeasons.get(inflightKey(tmdbId, seasonNumber));
        if (episodes) loaded.set(seasonNumber, episodes);
      } catch (error) {
        console.warn(`Season ${seasonNumber} failed for show ${tmdbId}`, error);
      }
    }),
  );
  return loaded;
}
