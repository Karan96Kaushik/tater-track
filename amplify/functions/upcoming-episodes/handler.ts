import { HttpError, json, parseBody, withHttp } from '../_shared/http.js';
import { logTiming } from '../_shared/timing.js';
import { enforceRateLimit } from '../_shared/rateLimit.js';
import { supabaseUser } from '../_shared/supabaseUser.js';
import { tmdb, type TmdbEpisode, type TmdbShowDetails } from '../_shared/tmdb.js';
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

function clampWindow(value: unknown, fallback = 30): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(180, Math.max(1, Math.round(parsed)));
}

function airDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function inSchedule(
  episode: TmdbEpisode,
  start: string,
  end: string,
  includeSpecials: boolean,
): boolean {
  const air = airDay(episode.air_date);
  return Boolean(air && air >= start && air <= end && (includeSpecials || episode.season_number > 0));
}

/**
 * Seasons that can contain an episode airing inside [today, horizon].
 * `next_episode_to_air` is only one episode, and it is sometimes missing a date
 * even when the season list already has air dates.
 */
function seasonsInWindow(
  show: TmdbShowDetails,
  today: string,
  horizon: string,
  includeSpecials: boolean,
): number[] {
  const known = new Set((show.seasons ?? []).map((season) => season.season_number));
  const next = show.next_episode_to_air;
  const nextAir = airDay(next?.air_date);

  // That episode is the earliest one still to air. Past the window means
  // nothing sooner will land in it.
  if (nextAir && nextAir > horizon) return [];

  const chosen = new Set<number>();
  if (next) chosen.add(next.season_number);

  if (!nextAir && show.status !== 'Ended' && show.status !== 'Canceled') {
    const last = show.last_episode_to_air;
    if (last) {
      chosen.add(last.season_number);
      chosen.add(last.season_number + 1);
    }
    for (const season of show.seasons ?? []) {
      const premiere = airDay(season.air_date);
      if (premiere && premiere >= today && premiere <= horizon) chosen.add(season.season_number);
    }
  }

  return [...chosen].filter(
    (seasonNumber) =>
      (known.size === 0 || known.has(seasonNumber)) && (includeSpecials || seasonNumber > 0),
  );
}

/** Future window, plus the season of the last episode if it aired inside the lookback. */
function seasonsForSchedule(
  show: TmdbShowDetails,
  lookback: string,
  today: string,
  horizon: string,
  includeSpecials: boolean,
): number[] {
  const chosen = new Set(seasonsInWindow(show, today, horizon, includeSpecials));
  const last = show.last_episode_to_air;
  const lastAir = airDay(last?.air_date);
  const known = new Set((show.seasons ?? []).map((season) => season.season_number));
  if (
    last &&
    lastAir &&
    lastAir >= lookback &&
    lastAir < today &&
    (includeSpecials || last.season_number > 0) &&
    (known.size === 0 || known.has(last.season_number))
  ) {
    chosen.add(last.season_number);
  }
  return [...chosen];
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
  const started = Date.now();
  const { data, error } = await supabaseUser()
    .from('upcoming_episodes')
    .select('*')
    .eq('user_id', userId)
    .gte('air_date', dayString(-windowDays))
    .lte('air_date', dayString(windowDays))
    .order('air_date', { ascending: true });

  logTiming('db', started, { table: 'upcoming_episodes', op: 'list', ok: !error });
  if (error) throw new HttpError(500, error.message);
  return data ?? [];
}

export const handler = withHttp(async (event) => {
  const user = await verifySupabaseAuth(event);
  const body = parseBody<UpcomingRequest>(event);
  const action = body.action ?? 'list';
  const db = supabaseUser();

  // Page loads read the stored schedule. TMDB runs only for an explicit refresh.
  if (action !== 'refresh') {
    enforceRateLimit(`upcoming-list:${user.id}`, 90);
    return json(200, {
      items: await listUpcoming(user.id, clampWindow(body.windowDays)),
      refreshed: false,
    });
  }

  enforceRateLimit(`upcoming-refresh:${user.id}`, 12, 5 * 60_000);

  const settingsStarted = Date.now();
  const { data: settings } = await db
    .from('user_settings')
    .select('upcoming_window_days, include_specials')
    .eq('user_id', user.id)
    .maybeSingle();
  logTiming('db', settingsStarted, { table: 'user_settings', op: 'select' });

  const windowDays = clampWindow(body.windowDays ?? settings?.upcoming_window_days);
  const includeSpecials = settings?.include_specials ?? false;

  const statuses = body.statuses?.length ? body.statuses : [...DEFAULT_STATUSES];
  const showsStarted = Date.now();
  const { data: shows, error: showsError } = await db
    .from('tracked_media')
    .select('tmdb_id, title')
    .eq('user_id', user.id)
    .eq('media_type', 'tv')
    .in('status', statuses);
  logTiming('db', showsStarted, { table: 'tracked_media', op: 'list', ok: !showsError });

  if (showsError) throw new HttpError(500, showsError.message);

  const horizon = dayString(windowDays);
  const today = dayString(0);
  const lookback = dayString(-windowDays);
  const rows: UpcomingRow[] = [];
  const failures: number[] = [];

  const refreshStarted = Date.now();
  await mapWithConcurrency(shows ?? [], CONCURRENCY, async (show) => {
    try {
      const details = await tmdb.show(show.tmdb_id, { fresh: true });
      const seasonNumbers = seasonsForSchedule(details, lookback, today, horizon, includeSpecials);
      if (seasonNumbers.length === 0) return;

      const next = details.next_episode_to_air;
      const seen = new Set<string>();
      let episodes: TmdbEpisode[] = [];
      for (const seasonNumber of seasonNumbers) {
        try {
          const season = await tmdb.season(show.tmdb_id, seasonNumber, { fresh: true });
          for (const episode of season.episodes) {
            if (!inSchedule(episode, lookback, horizon, includeSpecials)) continue;
            const key = `${episode.season_number}:${episode.episode_number}`;
            if (seen.has(key)) continue;
            seen.add(key);
            episodes.push(episode);
          }
        } catch (error) {
          console.warn(`Season fetch failed for show ${show.tmdb_id} season ${seasonNumber}`, error);
        }
      }

      if (episodes.length === 0 && next && inSchedule(next, today, horizon, includeSpecials)) {
        episodes = [next];
      }
      if (episodes.length === 0) return;

      for (const episode of episodes) {
        rows.push({
          user_id: user.id,
          tmdb_show_id: show.tmdb_id,
          season_number: episode.season_number,
          episode_number: episode.episode_number,
          show_name: details.name ?? show.title,
          episode_name: episode.name,
          overview: episode.overview,
          air_date: airDay(episode.air_date),
          poster_path: details.poster_path,
          still_path: episode.still_path,
          refreshed_at: '',
        });
      }

      if (details.number_of_episodes) {
        const { error: totalsError } = await db
          .from('tracked_media')
          .update({ total_episodes: details.number_of_episodes })
          .eq('user_id', user.id)
          .eq('media_type', 'tv')
          .eq('tmdb_id', show.tmdb_id);
        if (totalsError) console.warn(`Could not update episode count for show ${show.tmdb_id}`, totalsError.message);
      }
    } catch (error) {
      failures.push(show.tmdb_id);
      console.warn(`Upcoming refresh failed for show ${show.tmdb_id}`, error);
    }
  });
  logTiming('tmdb-refresh', refreshStarted, {
    shows: shows?.length ?? 0,
    episodes: rows.length,
    failures: failures.length,
  });

  const followed = shows ?? [];
  if (followed.length > 0 && failures.length === followed.length) {
    throw new HttpError(502, 'Could not load upcoming episodes from TMDB');
  }

  // Stamp rows after the library writes above. Those writes bump updated_at, and
  // the next page load treats a newer library change as a reason to refresh again.
  const refreshedAt = new Date().toISOString();
  for (const row of rows) row.refreshed_at = refreshedAt;

  if (rows.length > 0) {
    const insertStarted = Date.now();
    const { error: insertError } = await db
      .from('upcoming_episodes')
      .upsert(rows, { onConflict: 'user_id,tmdb_show_id,season_number,episode_number' });
    logTiming('db', insertStarted, { table: 'upcoming_episodes', op: 'upsert', ok: !insertError });
    if (insertError) throw new HttpError(500, insertError.message);
  }

  // Remove episodes that fell out of the window. Newer rows from an overlapping
  // refresh stay put, and a failed upsert above never wipes the previous schedule.
  const deleteStarted = Date.now();
  let removeStale = db
    .from('upcoming_episodes')
    .delete()
    .eq('user_id', user.id)
    .lt('refreshed_at', refreshedAt);
  if (failures.length > 0) {
    removeStale = removeStale.not('tmdb_show_id', 'in', `(${failures.join(',')})`);
  }
  const { error: deleteError } = await removeStale;
  logTiming('db', deleteStarted, { table: 'upcoming_episodes', op: 'delete', ok: !deleteError });
  if (deleteError) throw new HttpError(500, deleteError.message);

  return json(200, {
    items: await listUpcoming(user.id, windowDays),
    refreshed: true,
    showsChecked: shows?.length ?? 0,
    failures,
  });
});
