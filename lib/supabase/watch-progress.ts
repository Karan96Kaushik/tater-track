import { supabase } from '@/utils/supabase';
import type { TrackedMedia, TrackStatus } from '@/lib/supabase/types';

/** Fields the details view already has, so a first watch can create the library row without TMDB. */
export interface ShowSnapshot {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  totalEpisodes: number | null;
}

export interface EpisodeMark {
  episodeNumber: number;
  name: string | null;
  airDate: string | null;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** Same rule as the track-media function: an episode counts as aired only with a date on or before today. */
export function airedOnOrBeforeToday(airDate: string | null, today = new Date().toISOString().slice(0, 10)): boolean {
  return Boolean(airDate && airDate <= today);
}

async function ensureShowTracked(userId: string, show: ShowSnapshot): Promise<'created' | 'existed'> {
  const { error } = await supabase.from('tracked_media').insert({
    user_id: userId,
    tmdb_id: show.tmdbId,
    media_type: 'tv',
    status: 'watchlist',
    title: show.title,
    poster_path: show.posterPath,
    backdrop_path: show.backdropPath,
    release_date: show.releaseDate,
    total_episodes: show.totalEpisodes,
  });
  if (!error) return 'created';
  // A parallel mark can insert the same show first.
  if (error.code === '23505') return 'existed';
  throw new Error(error.message);
}

interface ProgressSeed {
  status: TrackStatus;
  totalEpisodes: number | null;
}

/** Recomputes the denormalised episode counters after any episode mutation. */
export async function syncShowProgress(
  userId: string,
  tmdbShowId: number,
  known?: ProgressSeed,
): Promise<TrackedMedia> {
  const { count, error: countError } = await supabase
    .from('watched_episodes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('tmdb_show_id', tmdbShowId);
  fail(countError);

  const watchedCount = count ?? 0;

  let seed = known;
  if (!seed) {
    const { data: existing, error: lookupError } = await supabase
      .from('tracked_media')
      .select('status, total_episodes')
      .eq('user_id', userId)
      .eq('media_type', 'tv')
      .eq('tmdb_id', tmdbShowId)
      .maybeSingle();
    fail(lookupError);
    seed = existing
      ? { status: existing.status, totalEpisodes: existing.total_episodes }
      : undefined;
  }

  const totalEpisodes = seed?.totalEpisodes ?? null;
  const finished = totalEpisodes !== null && watchedCount >= totalEpisodes;

  let nextStatus = seed?.status;
  if (nextStatus !== 'dropped') {
    if (finished) nextStatus = 'completed';
    else if (watchedCount > 0) nextStatus = 'watching';
  }

  const { data, error } = await supabase
    .from('tracked_media')
    .update({
      watched_episode_count: watchedCount,
      last_watched_at: watchedCount > 0 ? new Date().toISOString() : null,
      ...(nextStatus ? { status: nextStatus } : {}),
    })
    .eq('user_id', userId)
    .eq('media_type', 'tv')
    .eq('tmdb_id', tmdbShowId)
    .select()
    .single();
  fail(error);
  return data as TrackedMedia;
}

export async function setEpisodesWatched(params: {
  userId: string;
  show: ShowSnapshot;
  seasonNumber: number;
  episodes: EpisodeMark[];
  watched: boolean;
  /** Library row already on screen, so progress can update without another read. */
  tracked?: ProgressSeed | null;
}): Promise<TrackedMedia> {
  const { userId, show, seasonNumber, episodes, watched, tracked } = params;
  if (episodes.length === 0) throw new Error('No episodes to update');
  if (episodes.length > 100) throw new Error('Too many episodes');

  if (watched) {
    const watchedAt = new Date().toISOString();
    const write = supabase.from('watched_episodes').upsert(
      episodes.map((episode) => ({
        user_id: userId,
        tmdb_show_id: show.tmdbId,
        season_number: seasonNumber,
        episode_number: episode.episodeNumber,
        episode_name: episode.name,
        air_date: episode.airDate,
        watched_at: watchedAt,
      })),
      { onConflict: 'user_id,tmdb_show_id,season_number,episode_number' },
    );
    if (tracked) {
      const { error } = await write;
      fail(error);
    } else {
      const [{ error }, outcome] = await Promise.all([write, ensureShowTracked(userId, show)]);
      fail(error);
      return syncShowProgress(
        userId,
        show.tmdbId,
        outcome === 'created' ? { status: 'watchlist', totalEpisodes: show.totalEpisodes } : undefined,
      );
    }
  } else {
    const { error } = await supabase
      .from('watched_episodes')
      .delete()
      .eq('user_id', userId)
      .eq('tmdb_show_id', show.tmdbId)
      .eq('season_number', seasonNumber)
      .in(
        'episode_number',
        episodes.map((episode) => episode.episodeNumber),
      );
    fail(error);
  }

  return syncShowProgress(userId, show.tmdbId, tracked ?? undefined);
}

export async function setSeasonWatched(params: {
  userId: string;
  show: ShowSnapshot;
  seasonNumber: number;
  episodes: EpisodeMark[];
  watched: boolean;
  tracked?: ProgressSeed | null;
}): Promise<TrackedMedia | null> {
  const { userId, show, seasonNumber, watched, tracked } = params;

  if (watched) {
    const today = new Date().toISOString().slice(0, 10);
    const aired = params.episodes.filter((episode) => airedOnOrBeforeToday(episode.airDate, today));
    if (aired.length === 0) {
      if (!tracked) return null;
    } else {
      const watchedAt = new Date().toISOString();
      const write = supabase.from('watched_episodes').upsert(
        aired.map((episode) => ({
          user_id: userId,
          tmdb_show_id: show.tmdbId,
          season_number: seasonNumber,
          episode_number: episode.episodeNumber,
          episode_name: episode.name,
          air_date: episode.airDate,
          watched_at: watchedAt,
        })),
        { onConflict: 'user_id,tmdb_show_id,season_number,episode_number' },
      );
      if (tracked) {
        const { error } = await write;
        fail(error);
      } else {
        const [{ error }, outcome] = await Promise.all([write, ensureShowTracked(userId, show)]);
        fail(error);
        return syncShowProgress(
          userId,
          show.tmdbId,
          outcome === 'created' ? { status: 'watchlist', totalEpisodes: show.totalEpisodes } : undefined,
        );
      }
    }
  } else {
    const { error } = await supabase
      .from('watched_episodes')
      .delete()
      .eq('user_id', userId)
      .eq('tmdb_show_id', show.tmdbId)
      .eq('season_number', seasonNumber);
    fail(error);
  }

  return syncShowProgress(userId, show.tmdbId, tracked ?? undefined);
}
