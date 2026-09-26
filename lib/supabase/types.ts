export type MediaType = 'movie' | 'tv';
export type TrackStatus = 'watchlist' | 'watching' | 'completed' | 'dropped';

export interface TrackedMedia {
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

export interface WatchedEpisode {
  id: string;
  user_id: string;
  tmdb_show_id: number;
  season_number: number;
  episode_number: number;
  episode_name: string | null;
  air_date: string | null;
  watched_at: string;
}

export interface UpcomingEpisode {
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

export interface UserSettings {
  user_id: string;
  region: string;
  include_specials: boolean;
  upcoming_window_days: number;
  theme: string;
  created_at: string;
  updated_at: string;
}

export interface UserBackup {
  id: string;
  user_id: string;
  label: string | null;
  payload: unknown;
  created_at: string;
}

/**
 * Hand-maintained stand-in for `supabase gen types typescript`.
 * Regenerate once the project ref is known.
 */
export interface Database {
  public: {
    Tables: {
      user_settings: {
        Row: UserSettings;
        Insert: Partial<UserSettings> & { user_id: string };
        Update: Partial<UserSettings>;
      };
      tracked_media: {
        Row: TrackedMedia;
        Insert: Partial<TrackedMedia> & {
          user_id: string;
          tmdb_id: number;
          media_type: MediaType;
          title: string;
        };
        Update: Partial<TrackedMedia>;
      };
      watched_episodes: {
        Row: WatchedEpisode;
        Insert: Partial<WatchedEpisode> & {
          user_id: string;
          tmdb_show_id: number;
          season_number: number;
          episode_number: number;
        };
        Update: Partial<WatchedEpisode>;
      };
      upcoming_episodes: {
        Row: UpcomingEpisode;
        Insert: UpcomingEpisode;
        Update: Partial<UpcomingEpisode>;
      };
      user_backups: {
        Row: UserBackup;
        Insert: Partial<UserBackup> & { user_id: string; payload: unknown };
        Update: Partial<UserBackup>;
      };
      issue_reports: {
        Row: {
          id: string;
          user_id: string | null;
          email: string | null;
          category: string | null;
          message: string;
          context: unknown;
          created_at: string;
        };
        Insert: { user_id?: string | null; email?: string | null; category?: string | null; message: string; context?: unknown };
        Update: never;
      };
      tmdb_cache: {
        Row: { cache_key: string; payload: unknown; fetched_at: string; expires_at: string };
        Insert: { cache_key: string; payload: unknown; expires_at: string };
        Update: { payload?: unknown; expires_at?: string };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      media_type: MediaType;
      track_status: TrackStatus;
    };
  };
}
