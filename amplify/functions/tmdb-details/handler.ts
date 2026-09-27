import { HttpError, json, parseBody, withHttp } from '../_shared/http.js';
import { logTiming } from '../_shared/timing.js';
import { enforceRateLimit } from '../_shared/rateLimit.js';
import { supabaseUser } from '../_shared/supabaseUser.js';
import { tmdb, type TmdbEpisode } from '../_shared/tmdb.js';
import { clientAddress, verifySupabaseAuthOptional } from '../_shared/verifySupabaseAuth.js';

interface DetailsRequest {
  tmdbId?: number;
  mediaType?: 'movie' | 'tv';
  /** When set, the episode list for that season is included. */
  seasonNumber?: number;
  includeSpecials?: boolean;
}

async function selectTracked(userId: string, mediaType: 'movie' | 'tv', tmdbId: number) {
  const started = Date.now();
  const { data } = await supabaseUser()
    .from('tracked_media')
    .select('*')
    .eq('user_id', userId)
    .eq('media_type', mediaType)
    .eq('tmdb_id', tmdbId)
    .maybeSingle();
  logTiming('db', started, { table: 'tracked_media', op: 'select' });
  return data;
}

async function selectWatched(userId: string, tmdbId: number) {
  const started = Date.now();
  const { data } = await supabaseUser()
    .from('watched_episodes')
    .select('season_number, episode_number')
    .eq('user_id', userId)
    .eq('tmdb_show_id', tmdbId);
  logTiming('db', started, { table: 'watched_episodes', op: 'select' });
  return data ?? [];
}

export const handler = withHttp(async (event) => {
  const user = await verifySupabaseAuthOptional(event);
  enforceRateLimit(
    user ? `details:${user.id}` : `details:anon:${clientAddress(event)}`,
    user ? 120 : 40,
  );

  const { tmdbId, mediaType, seasonNumber, includeSpecials = false } =
    parseBody<DetailsRequest>(event);

  if (!tmdbId || (mediaType !== 'movie' && mediaType !== 'tv')) {
    throw new HttpError(400, 'tmdbId and mediaType ("movie" | "tv") are required');
  }

  const trackedPromise = user ? selectTracked(user.id, mediaType, tmdbId) : Promise.resolve(null);

  if (mediaType === 'movie') {
    const [tracked, movie] = await Promise.all([trackedPromise, tmdb.movie(tmdbId)]);
    return json(200, {
      mediaType,
      tmdbId,
      title: movie.title,
      overview: movie.overview,
      posterPath: movie.poster_path,
      backdropPath: movie.backdrop_path,
      releaseDate: movie.release_date,
      runtime: movie.runtime,
      status: movie.status,
      tracked: tracked ?? null,
    });
  }

  const [tracked, show, watched, season] = await Promise.all([
    trackedPromise,
    tmdb.show(tmdbId),
    user ? selectWatched(user.id, tmdbId) : Promise.resolve([]),
    seasonNumber !== undefined ? tmdb.season(tmdbId, seasonNumber) : Promise.resolve(null),
  ]);

  const seasons = show.seasons.filter((s) => includeSpecials || s.season_number > 0);
  const watchedKeys = new Set(watched.map((w) => `${w.season_number}:${w.episode_number}`));

  const episodes = (season?.episodes ?? []).map((episode: TmdbEpisode) => ({
    seasonNumber: episode.season_number,
    episodeNumber: episode.episode_number,
    name: episode.name,
    overview: episode.overview,
    airDate: episode.air_date,
    stillPath: episode.still_path,
    watched: watchedKeys.has(`${episode.season_number}:${episode.episode_number}`),
  }));

  return json(200, {
    mediaType,
    tmdbId,
    title: show.name,
    overview: show.overview,
    posterPath: show.poster_path,
    backdropPath: show.backdrop_path,
    releaseDate: show.first_air_date,
    status: show.status,
    numberOfSeasons: show.number_of_seasons,
    numberOfEpisodes: show.number_of_episodes,
    nextEpisodeToAir: show.next_episode_to_air,
    lastEpisodeToAir: show.last_episode_to_air,
    seasons: seasons.map((s) => ({
      seasonNumber: s.season_number,
      name: s.name,
      episodeCount: s.episode_count,
      airDate: s.air_date,
    })),
    episodes,
    watchedEpisodeCount: watchedKeys.size,
    tracked: tracked ?? null,
  });
});
