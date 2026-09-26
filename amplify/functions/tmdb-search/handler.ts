import { HttpError, json, parseBody, withHttp } from '../_shared/http.js';
import { enforceRateLimit } from '../_shared/rateLimit.js';
import { tmdb, type TmdbSearchResult } from '../_shared/tmdb.js';
import { verifySupabaseAuth } from '../_shared/verifySupabaseAuth.js';

interface SearchRequest {
  query?: string;
  mediaType?: 'movie' | 'tv' | 'multi';
  page?: number;
}

export interface SearchHit {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
}

function normalise(result: TmdbSearchResult, fallbackType?: 'movie' | 'tv'): SearchHit | null {
  const mediaType = (result.media_type ?? fallbackType) as 'movie' | 'tv' | 'person' | undefined;
  if (mediaType !== 'movie' && mediaType !== 'tv') return null;

  return {
    tmdbId: result.id,
    mediaType,
    title: result.title ?? result.name ?? 'Untitled',
    overview: result.overview ?? '',
    posterPath: result.poster_path ?? null,
    backdropPath: result.backdrop_path ?? null,
    releaseDate: result.release_date ?? result.first_air_date ?? null,
    voteAverage: result.vote_average ?? null,
  };
}

export const handler = withHttp(async (event) => {
  const user = await verifySupabaseAuth(event);
  enforceRateLimit(`search:${user.id}`, 90);

  const { query, mediaType = 'multi', page = 1 } = parseBody<SearchRequest>(event);
  const trimmed = query?.trim() ?? '';

  // Empty query powers the discover/landing state rather than erroring out.
  if (!trimmed) {
    const trending = await tmdb.trending(mediaType === 'multi' ? 'all' : mediaType);
    return json(200, {
      query: '',
      trending: true,
      page: 1,
      totalPages: 1,
      results: trending.results
        .map((r) => normalise(r, mediaType === 'multi' ? undefined : mediaType))
        .filter((r): r is SearchHit => r !== null),
    });
  }

  if (trimmed.length > 200) {
    throw new HttpError(400, 'Query is too long');
  }

  const response =
    mediaType === 'multi'
      ? await tmdb.searchMulti(trimmed, page)
      : await tmdb.search(mediaType, trimmed, page);

  return json(200, {
    query: trimmed,
    trending: false,
    page: response.page,
    totalPages: response.total_pages,
    results: response.results
      .map((r) => normalise(r, mediaType === 'multi' ? undefined : mediaType))
      .filter((r): r is SearchHit => r !== null),
  });
});
