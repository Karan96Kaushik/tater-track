import { HttpError, json, parseBody, withHttp } from '../_shared/http.js';
import { enforceRateLimit } from '../_shared/rateLimit.js';
import { supabaseAdmin } from '../_shared/supabaseAdmin.js';
import { tmdb, type TmdbEpisode } from '../_shared/tmdb.js';
import { verifySupabaseAuth } from '../_shared/verifySupabaseAuth.js';

interface UpcomingRequest {
  action?: 'list' | 'refresh';
  /** Which library statuses count as "following" a show. */
  statuses?: Array<'watching' | 'completed' | 'watchlist'>;
  windowDays?: number;
}

interface UpcomingRow {
  user_id: string;
  tmdb_show_id: number;
  season_number: number;
  episode_number: number;
  show_name: string;
  episode_name: string | null;
  overview: string | null;
  air_date: string | null;
  poster_path: string | null;
  still_path: string | null;
  refreshed_at: string;
}

const DEFAULT_STATUSES = ['watching', 'completed'] as const;
const CONCURRENCY = 5;

function dayString(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return results;
}

async function listUpcoming(userId: string, windowDays: number) {
  const { data, error } = await supabaseAdmin()
    .from('upcoming_episodes')
    .select('*')
    .eq('user_id', userId)
    .gte('air_date', dayString(0))
    .lte('air_date', dayString(windowDays))
    .order('air_date', { ascending: true });

  if (error) throw new HttpError(500, error.message);
  return data ?? [];
}

export const handler = withHttp(async (event) => {
  const user = await verifySupabaseAuth(event);
  const body = parseBody<UpcomingRequest>(event);
  const action = body.action ?? 'list';
  const db = supabaseAdmin();

  const { data: settings } = await db
    .from('user_settings')
    .select('upcoming_window_days, include_specials')
    .eq('user_id', user.id)
    .maybeSingle();

  const windowDays = body.windowDays ?? settings?.upcoming_window_days ?? 30;
  const includeSpecials = settings?.include_specials ?? false;

  if (action === 'list') {
    enforceRateLimit(`upcoming-list:${user.id}`, 90);
    return json(200, { items: await listUpcoming(user.id, windowDays), refreshed: false });
  }

  // refresh: re-derive the snapshot from TMDB for every followed show.
  enforceRateLimit(`upcoming-refresh:${user.id}`, 12, 5 * 60_000);

  const statuses = body.statuses?.length ? body.statuses : [...DEFAULT_STATUSES];
  const { data: shows, error: showsError } = await db
    .from('tracked_media')
    .select('tmdb_id, title')
    .eq('user_id', user.id)
    .eq('media_type', 'tv')
    .in('status', statuses);

  if (showsError) throw new HttpError(500, showsError.message);

  const horizon = dayString(windowDays);
  const today = dayString(0);
  const rows: UpcomingRow[] = [];
  const failures: number[] = [];

  await mapWithConcurrency(shows ?? [], CONCURRENCY, async (show) => {
    try {
      const details = await tmdb.show(show.tmdb_id);
      const next = details.next_episode_to_air;
      if (!next?.air_date || next.air_date > horizon) return;

      // TMDB only exposes one "next" episode, so pull that season to catch the
      // rest of the episodes landing inside the window.
      let episodes: TmdbEpisode[] = [next];
      try {
        const season = await tmdb.season(show.tmdb_id, next.season_number);
        episodes = season.episodes.filter(
          (episode) =>
            episode.air_date &&
            episode.air_date >= today &&
            episode.air_date <= horizon &&
            (includeSpecials || episode.season_number > 0),
        );
        if (episodes.length === 0) episodes = [next];
      } catch (error) {
        console.warn(`Season fetch failed for show ${show.tmdb_id}`, error);
      }

      for (const episode of episodes) {
        rows.push({
          user_id: user.id,
          tmdb_show_id: show.tmdb_id,
          season_number: episode.season_number,
          episode_number: episode.episode_number,
          show_name: details.name ?? show.title,
          episode_name: episode.name,
          overview: episode.overview,
          air_date: episode.air_date,
          poster_path: details.poster_path,
          still_path: episode.still_path,
          refreshed_at: new Date().toISOString(),
        });
      }

      // Keep total_episodes fresh while we already have the details payload.
      if (details.number_of_episodes) {
        await db
          .from('tracked_media')
          .update({ total_episodes: details.number_of_episodes })
          .eq('user_id', user.id)
          .eq('media_type', 'tv')
          .eq('tmdb_id', show.tmdb_id);
      }
    } catch (error) {
      failures.push(show.tmdb_id);
      console.warn(`Upcoming refresh failed for show ${show.tmdb_id}`, error);
    }
  });

  // Drop anything that already aired or was rescheduled out of the snapshot.
  const { error: deleteError } = await db
    .from('upcoming_episodes')
    .delete()
    .eq('user_id', user.id);
  if (deleteError) throw new HttpError(500, deleteError.message);

  if (rows.length > 0) {
    const { error: insertError } = await db
      .from('upcoming_episodes')
      .upsert(rows, { onConflict: 'user_id,tmdb_show_id,season_number,episode_number' });
    if (insertError) throw new HttpError(500, insertError.message);
  }

  return json(200, {
    items: await listUpcoming(user.id, windowDays),
    refreshed: true,
    showsChecked: shows?.length ?? 0,
    failures,
  });
});
