export type MediaType = 'movie' | 'tv';
export type TrackStatus = 'watchlist' | 'watching' | 'completed' | 'dropped';

export type TrackedMedia = {
  id: string;
  user_id: string;
  tmdb_id: number;
  media_type: MediaType;
  status: TrackStatus;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  total_episodes: number | null;
  watched_episode_count: number;
  user_rating: number | null;
  notes: string | null;
  last_watched_at: string | null;
  created_at: string;
  updated_at: string;
}

export type WatchedEpisode = {
  id: string;
  user_id: string;
  tmdb_show_id: number;
  season_number: number;
  episode_number: number;
  episode_name: string | null;
  air_date: string | null;
  watched_at: string;
}

export type UpcomingEpisode = {
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

export type UserSettings = {
  user_id: string;
  region: string;
  include_specials: boolean;
  upcoming_window_days: number;
  theme: string;
  created_at: string;
  updated_at: string;
}

export type UserBackup = {
  id: string;
  user_id: string;
  label: string | null;
  payload: unknown;
  created_at: string;
}

export type IssueReport = {
  id: string;
  user_id: string | null;
  email: string | null;
  category: string | null;
  message: string;
  context: unknown;
  created_at: string;
}

export type TmdbCacheEntry = {
  cache_key: string;
  payload: unknown;
  fetched_at: string;
  expires_at: string;
}

/** Matches the shape `supabase gen types typescript` emits per table. */
interface TableDef<Row, Insert, Update = Partial<Row>> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

/**
 * Hand-maintained stand-in for `supabase gen types typescript`.
 * Regenerate once the project ref is known.
 */
export interface Database {
  public: {
    Tables: {
      user_settings: TableDef<UserSettings, Partial<UserSettings> & { user_id: string }>;
      tracked_media: TableDef<
        TrackedMedia,
        Partial<TrackedMedia> & {
          user_id: string;
          tmdb_id: number;
          media_type: MediaType;
          title: string;
        }
      >;
      watched_episodes: TableDef<
        WatchedEpisode,
        Partial<WatchedEpisode> & {
          user_id: string;
          tmdb_show_id: number;
          season_number: number;
          episode_number: number;
        }
      >;
      upcoming_episodes: TableDef<UpcomingEpisode, UpcomingEpisode>;
      user_backups: TableDef<UserBackup, Partial<UserBackup> & { user_id: string; payload: unknown }>;
      issue_reports: TableDef<
        IssueReport,
        Partial<IssueReport> & { message: string }
      >;
      tmdb_cache: TableDef<
        TmdbCacheEntry,
        Partial<TmdbCacheEntry> & { cache_key: string; payload: unknown; expires_at: string }
      >;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      media_type: MediaType;
      track_status: TrackStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
