import { HttpError, json, parseBody, withHttp } from '../_shared/http.js';
import { logTiming } from '../_shared/timing.js';
import { enforceRateLimit } from '../_shared/rateLimit.js';
import { supabaseUser } from '../_shared/supabaseUser.js';
import { tmdb } from '../_shared/tmdb.js';
import { clientAddress, verifySupabaseAuthOptional } from '../_shared/verifySupabaseAuth.js';

interface DetailsRequest {
  tmdbId?: number;
  mediaType?: 'movie' | 'tv';
  /** When set, the episode list for that season is included. */
  seasonNumber?: number;
  includeSpecials?: boolean;
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

  const db = user ? supabaseUser() : null;
  const trackedStarted = Date.now();
  const { data: tracked } = db
    ? await db
        .from('tracked_media')
        .select('*')
        .eq('user_id', user!.id)
        .eq('media_type', mediaType)
        .eq('tmdb_id', tmdbId)
        .maybeSingle()
    : { data: null };
  if (db) logTiming('db', trackedStarted, { table: 'tracked_media', op: 'select' });

  if (mediaType === 'movie') {
    const movie = await tmdb.movie(tmdbId);
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

  const show = await tmdb.show(tmdbId);
  const seasons = show.seasons.filter((s) => includeSpecials || s.season_number > 0);

  const watchedStarted = Date.now();
  const { data: watched } = db
    ? await db
        .from('watched_episodes')
        .select('season_number, episode_number')
        .eq('user_id', user!.id)
        .eq('tmdb_show_id', tmdbId)
    : { data: null };
  if (db) logTiming('db', watchedStarted, { table: 'watched_episodes', op: 'select' });

  const watchedKeys = new Set((watched ?? []).map((w) => `${w.season_number}:${w.episode_number}`));

  let episodes: Array<Record<string, unknown>> = [];
  if (seasonNumber !== undefined) {
    const season = await tmdb.season(tmdbId, seasonNumber);
    episodes = season.episodes.map((episode) => ({
      seasonNumber: episode.season_number,
      episodeNumber: episode.episode_number,
      name: episode.name,
      overview: episode.overview,
      airDate: episode.air_date,
      stillPath: episode.still_path,
      watched: watchedKeys.has(`${episode.season_number}:${episode.episode_number}`),
    }));
  }

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
