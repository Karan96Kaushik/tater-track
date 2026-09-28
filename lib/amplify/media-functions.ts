import { callFunction } from './client';
import type { MediaType, TrackedMedia, TrackStatus, UpcomingEpisode } from '@/lib/supabase/types';

export interface SearchHit {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
}

export type BrowseKind =
  | 'trending'
  | 'popular'
  | 'top_rated'
  | 'now_playing'
  | 'upcoming'
  | 'on_the_air'
  | 'genre';

export interface SimilarShow {
  tmdbId: number;
  title: string;
  reason: string;
  posterPath: string | null;
  releaseDate: string | null;
}

export interface SimilarShowsResponse {
  source: { tmdbId: number; title: string };
  shows: SimilarShow[];
}

export interface Genre {
  id: number;
  name: string;
}

export interface SearchResponse {
  query: string;
  trending: boolean;
  browse?: BrowseKind;
  page: number;
  totalPages: number;
  results: SearchHit[];
}

export interface EpisodeDetail {
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  stillPath: string | null;
  watched: boolean;
}

export interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
}

export interface MediaDetails {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  runtime?: number | null;
  status: string | null;
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  nextEpisodeToAir?: {
    name: string | null;
    air_date: string | null;
    season_number: number;
    episode_number: number;
  } | null;
  seasons?: SeasonSummary[];
  episodes?: EpisodeDetail[];
  /** Present when the request asked for several seasons at once. */
  episodesBySeason?: Record<string, EpisodeDetail[]>;
  watchedEpisodeCount?: number;
  tracked: TrackedMedia | null;
}

export const mediaApi = {
  search: (params: { query: string; mediaType?: MediaType | 'multi'; page?: number }) =>
    callFunction<SearchResponse>('tmdbSearchUrl', params, { auth: 'optional' }),

  findSimilar: (params: { tmdbId: number }) =>
    callFunction<SimilarShowsResponse>('findSimilarUrl', params),

  browse: (params: {
    browse: BrowseKind;
    mediaType?: MediaType | 'multi';
    page?: number;
    genreId?: number;
    region?: string;
  }) => callFunction<SearchResponse>('tmdbSearchUrl', params, { auth: 'optional' }),

  genres: (mediaType: MediaType) =>
    callFunction<{ genres: Genre[] }>('tmdbSearchUrl', { browse: 'genres', mediaType }, { auth: 'optional' }),

  details: (params: {
    tmdbId: number;
    mediaType: MediaType;
    seasonNumber?: number;
    seasonNumbers?: number[];
    includeSpecials?: boolean;
  }) => callFunction<MediaDetails>('tmdbDetailsUrl', params, { auth: 'optional' }),

  list: (status?: TrackStatus | 'all') =>
    callFunction<{ items: TrackedMedia[] }>('trackMediaUrl', { action: 'list', status }),

  track: (params: {
    tmdbId: number;
    mediaType: MediaType;
    status: TrackStatus;
    notes?: string | null;
  }) => callFunction<{ item: TrackedMedia }>('trackMediaUrl', { action: 'upsert', ...params }),

  untrack: (params: { tmdbId: number; mediaType: MediaType }) =>
    callFunction<{ removed: boolean }>('trackMediaUrl', { action: 'remove', ...params }),

  rate: (params: { tmdbId: number; mediaType: MediaType; rating: number | null }) =>
    callFunction<{ item: TrackedMedia }>('trackMediaUrl', { action: 'rate', ...params }),

  setShowWatched: (params: { tmdbId: number }) =>
    callFunction<{ watchedEpisodeCount: number; marked: number }>('trackMediaUrl', {
      action: 'setShowWatched',
      mediaType: 'tv',
      ...params,
    }),

  upcoming: (action: 'list' | 'refresh' = 'list', windowDays?: number) =>
    callFunction<{ items: UpcomingEpisode[]; refreshed: boolean; showsChecked?: number }>(
      'upcomingEpisodesUrl',
      { action, windowDays },
    ),

  reportIssue: (params: { message: string; category?: string; context?: Record<string, unknown> }) =>
    callFunction<{ received: boolean }>('reportIssueUrl', params),

  smokeTest: () =>
    callFunction<{ user: { id: string; email: string | null }; checks: Record<string, string> }>(
      'amplifyTestUrl',
      {},
    ),
};
