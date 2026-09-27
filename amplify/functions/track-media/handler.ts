import { HttpError, json, parseBody, withHttp } from '../_shared/http.js';
import { enforceRateLimit } from '../_shared/rateLimit.js';
import { supabaseUser } from '../_shared/supabaseUser.js';
import { tmdb } from '../_shared/tmdb.js';
import { verifySupabaseAuth } from '../_shared/verifySupabaseAuth.js';

type MediaType = 'movie' | 'tv';
type TrackStatus = 'watchlist' | 'watching' | 'completed' | 'dropped';

interface TrackRequest {
  action?:
    | 'list'
    | 'upsert'
    | 'remove'
    | 'rate'
    | 'setEpisodeWatched'
    | 'setSeasonWatched';
  status?: TrackStatus | 'all';
  tmdbId?: number;
  mediaType?: MediaType;
  title?: string;
  rating?: number | null;
  notes?: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeNumbers?: number[];
  watched?: boolean;
}

const STATUSES: TrackStatus[] = ['watchlist', 'watching', 'completed', 'dropped'];

/** The selected episode, plus any earlier ones the client asked to catch up. */
function watchedEpisodeNumbers(body: TrackRequest, selected: number): number[] {
  const extra = Array.isArray(body.episodeNumbers) ? body.episodeNumbers : [];
  const numbers = new Set<number>([selected]);
  for (const value of extra) {
    if (Number.isInteger(value) && value > 0) numbers.add(value);
  }
  if (numbers.size > 100) throw new HttpError(400, 'Too many episodes');
  return [...numbers];
}

function requireMedia(body: TrackRequest): { tmdbId: number; mediaType: MediaType } {
  if (!body.tmdbId || (body.mediaType !== 'movie' && body.mediaType !== 'tv')) {
    throw new HttpError(400, 'tmdbId and mediaType ("movie" | "tv") are required');
  }
  return { tmdbId: body.tmdbId, mediaType: body.mediaType };
}

/** Recomputes the denormalised episode counters after any episode mutation. */
async function syncShowProgress(userId: string, tmdbShowId: number): Promise<number> {
  const db = supabaseUser();
  const { count } = await db
    .from('watched_episodes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('tmdb_show_id', tmdbShowId);

  const watchedCount = count ?? 0;

  const { data: existing } = await db
    .from('tracked_media')
    .select('status, total_episodes')
    .eq('user_id', userId)
    .eq('media_type', 'tv')
    .eq('tmdb_id', tmdbShowId)
    .maybeSingle();

  const totalEpisodes = existing?.total_episodes ?? null;
  const finished = totalEpisodes !== null && watchedCount >= totalEpisodes;

  // Watching a first episode promotes a watchlist entry; finishing completes it.
  let nextStatus = existing?.status as TrackStatus | undefined;
  if (nextStatus !== 'dropped') {
    if (finished) nextStatus = 'completed';
    else if (watchedCount > 0) nextStatus = 'watching';
  }

  await db
    .from('tracked_media')
    .update({
      watched_episode_count: watchedCount,
      last_watched_at: watchedCount > 0 ? new Date().toISOString() : null,
      ...(nextStatus ? { status: nextStatus } : {}),
    })
    .eq('user_id', userId)
    .eq('media_type', 'tv')
    .eq('tmdb_id', tmdbShowId);

  return watchedCount;
}

export const handler = withHttp(async (event) => {
  const user = await verifySupabaseAuth(event);
  enforceRateLimit(`track:${user.id}`, 150);

  const body = parseBody<TrackRequest>(event);
  const action = body.action ?? 'list';
  const db = supabaseUser();

  switch (action) {
    case 'list': {
      let query = db
        .from('tracked_media')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (body.status && body.status !== 'all') {
        query = query.eq('status', body.status);
      }

      const { data, error } = await query;
      if (error) throw new HttpError(500, error.message);
      return json(200, { items: data ?? [] });
    }

    case 'upsert': {
      const { tmdbId, mediaType } = requireMedia(body);
      const status = body.status && body.status !== 'all' ? body.status : 'watchlist';
      if (!STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');

      // Metadata always comes from TMDB so the library can't be poisoned by the client.
      const details =
        mediaType === 'movie'
          ? await tmdb.movie(tmdbId).then((m) => ({
              title: m.title,
              posterPath: m.poster_path,
              backdropPath: m.backdrop_path,
              releaseDate: m.release_date,
              totalEpisodes: null as number | null,
            }))
          : await tmdb.show(tmdbId).then((s) => ({
              title: s.name,
              posterPath: s.poster_path,
              backdropPath: s.backdrop_path,
              releaseDate: s.first_air_date,
              totalEpisodes: s.number_of_episodes,
            }));

      const { data, error } = await db
        .from('tracked_media')
        .upsert(
          {
            user_id: user.id,
            tmdb_id: tmdbId,
            media_type: mediaType,
            status,
            title: details.title,
            poster_path: details.posterPath,
            backdrop_path: details.backdropPath,
            release_date: details.releaseDate || null,
            total_episodes: details.totalEpisodes,
            notes: body.notes ?? null,
            ...(status === 'completed' && mediaType === 'movie'
              ? { last_watched_at: new Date().toISOString() }
              : {}),
          },
          { onConflict: 'user_id,media_type,tmdb_id' },
        )
        .select()
        .single();

      if (error) throw new HttpError(500, error.message);
      return json(200, { item: data });
    }

    case 'remove': {
      const { tmdbId, mediaType } = requireMedia(body);
      const { error } = await db
        .from('tracked_media')
        .delete()
        .eq('user_id', user.id)
        .eq('media_type', mediaType)
        .eq('tmdb_id', tmdbId);
      if (error) throw new HttpError(500, error.message);

      if (mediaType === 'tv') {
        await db.from('watched_episodes').delete().eq('user_id', user.id).eq('tmdb_show_id', tmdbId);
        await db.from('upcoming_episodes').delete().eq('user_id', user.id).eq('tmdb_show_id', tmdbId);
      }
      return json(200, { removed: true });
    }

    case 'rate': {
      const { tmdbId, mediaType } = requireMedia(body);
      const rating = body.rating ?? null;
      if (rating !== null && (rating < 1 || rating > 10)) {
        throw new HttpError(400, 'rating must be between 1 and 10');
      }
      const { data, error } = await db
        .from('tracked_media')
        .update({ user_rating: rating, notes: body.notes ?? undefined })
        .eq('user_id', user.id)
        .eq('media_type', mediaType)
        .eq('tmdb_id', tmdbId)
        .select()
        .single();
      if (error) throw new HttpError(500, error.message);
      return json(200, { item: data });
    }

    case 'setEpisodeWatched': {
      const { tmdbId } = requireMedia({ ...body, mediaType: 'tv' });
      const { seasonNumber, episodeNumber, watched = true } = body;
      if (seasonNumber === undefined || episodeNumber === undefined) {
        throw new HttpError(400, 'seasonNumber and episodeNumber are required');
      }

      if (watched) {
        const episodeNumbers = watchedEpisodeNumbers(body, episodeNumber);
        const watchedAt = new Date().toISOString();
        const { error } = await db.from('watched_episodes').upsert(
          episodeNumbers.map((number) => ({
            user_id: user.id,
            tmdb_show_id: tmdbId,
            season_number: seasonNumber,
            episode_number: number,
            watched_at: watchedAt,
          })),
          { onConflict: 'user_id,tmdb_show_id,season_number,episode_number' },
        );
        if (error) throw new HttpError(500, error.message);
      } else {
        const { error } = await db
          .from('watched_episodes')
          .delete()
          .eq('user_id', user.id)
          .eq('tmdb_show_id', tmdbId)
          .eq('season_number', seasonNumber)
          .eq('episode_number', episodeNumber);
        if (error) throw new HttpError(500, error.message);
      }

      const watchedEpisodeCount = await syncShowProgress(user.id, tmdbId);
      return json(200, { watchedEpisodeCount });
    }

    case 'setSeasonWatched': {
      const { tmdbId } = requireMedia({ ...body, mediaType: 'tv' });
      const { seasonNumber, watched = true } = body;
      if (seasonNumber === undefined) throw new HttpError(400, 'seasonNumber is required');

      if (watched) {
        const season = await tmdb.season(tmdbId, seasonNumber);
        const today = new Date().toISOString().slice(0, 10);
        // Only episodes that have actually aired can be marked watched.
        const aired = season.episodes.filter((e) => e.air_date && e.air_date <= today);
        if (aired.length > 0) {
          const { error } = await db.from('watched_episodes').upsert(
            aired.map((episode) => ({
              user_id: user.id,
              tmdb_show_id: tmdbId,
              season_number: episode.season_number,
              episode_number: episode.episode_number,
              episode_name: episode.name,
              air_date: episode.air_date,
              watched_at: new Date().toISOString(),
            })),
            { onConflict: 'user_id,tmdb_show_id,season_number,episode_number' },
          );
          if (error) throw new HttpError(500, error.message);
        }
      } else {
        const { error } = await db
          .from('watched_episodes')
          .delete()
          .eq('user_id', user.id)
          .eq('tmdb_show_id', tmdbId)
          .eq('season_number', seasonNumber);
        if (error) throw new HttpError(500, error.message);
      }

      const watchedEpisodeCount = await syncShowProgress(user.id, tmdbId);
      return json(200, { watchedEpisodeCount });
    }

    default:
      throw new HttpError(400, `Unsupported action: ${action}`);
  }
});
