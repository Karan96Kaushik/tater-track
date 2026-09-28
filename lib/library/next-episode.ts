import { mediaApi } from '@/lib/amplify/media-functions';

export interface NextEpisodeRef {
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
  airDate: string | null;
}

const cache = new Map<string, NextEpisodeRef | null>();
const inflight = new Map<string, Promise<NextEpisodeRef | null>>();
const generations = new Map<string, number>();

function cacheKey(tmdbId: number, watchedCount: number, includeSpecials: boolean) {
  return `${tmdbId}:${watchedCount}:${includeSpecials ? 1 : 0}`;
}

/** Drops a cached lookup so a newer watched count is not stuck on the episode just marked. */
export function forgetNextEpisode(tmdbId: number, watchedCount: number, includeSpecials: boolean) {
  const key = cacheKey(tmdbId, watchedCount, includeSpecials);
  cache.delete(key);
  inflight.delete(key);
  generations.set(key, (generations.get(key) ?? 0) + 1);
}

/** `undefined` means this show has not been resolved yet. `null` means nothing is left. */
export function peekNextEpisode(
  tmdbId: number,
  watchedCount: number,
  includeSpecials: boolean,
): NextEpisodeRef | null | undefined {
  const key = cacheKey(tmdbId, watchedCount, includeSpecials);
  return cache.has(key) ? cache.get(key)! : undefined;
}

/**
 * First unwatched episode in season order. Uses the existing details API and
 * caches the result for this watched count so the library can render without
 * another walk.
 */
export function resolveNextEpisode(
  tmdbId: number,
  watchedCount: number,
  includeSpecials: boolean,
): Promise<NextEpisodeRef | null> {
  const key = cacheKey(tmdbId, watchedCount, includeSpecials);
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);
  const pending = inflight.get(key);
  if (pending) return pending;

  const generation = generations.get(key) ?? 0;
  const promise = walkSeasons(tmdbId, includeSpecials)
    .then((next) => {
      if ((generations.get(key) ?? 0) === generation) cache.set(key, next);
      return next;
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

async function walkSeasons(tmdbId: number, includeSpecials: boolean): Promise<NextEpisodeRef | null> {
  const overview = await mediaApi.details({ tmdbId, mediaType: 'tv', includeSpecials });
  const seasons = [...(overview.seasons ?? [])].sort((left, right) => left.seasonNumber - right.seasonNumber);
  const preloadedSeason = overview.episodes?.[0]?.seasonNumber;

  for (const season of seasons) {
    const episodes =
      season.seasonNumber === preloadedSeason
        ? (overview.episodes ?? [])
        : ((
            await mediaApi.details({
              tmdbId,
              mediaType: 'tv',
              seasonNumber: season.seasonNumber,
              includeSpecials,
            })
          ).episodes ?? []);

    const next = [...episodes]
      .sort((left, right) => left.episodeNumber - right.episodeNumber)
      .find((episode) => !episode.watched);
    if (!next) continue;

    return {
      seasonNumber: next.seasonNumber,
      episodeNumber: next.episodeNumber,
      name: next.name,
      airDate: next.airDate,
    };
  }

  return null;
}
