import { HttpError, json, parseBody, withHttp } from '../_shared/http.js';
import { enforceRateLimit } from '../_shared/rateLimit.js';
import { tmdb, type TmdbSearchResult } from '../_shared/tmdb.js';
import { clientAddress, verifySupabaseAuthOptional } from '../_shared/verifySupabaseAuth.js';

type Browse =
  | 'trending'
  | 'popular'
  | 'top_rated'
  | 'now_playing'
  | 'upcoming'
  | 'on_the_air'
  | 'genre'
  | 'similar'
  | 'genres';

interface SearchRequest {
  query?: string;
  mediaType?: 'movie' | 'tv' | 'multi';
  page?: number;
  browse?: Browse;
  genreId?: number;
  tmdbId?: number;
  region?: string;
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

function pageNumber(page: number | undefined): number {
  if (page === undefined) return 1;
  if (!Number.isInteger(page) || page < 1 || page > 500) throw new HttpError(400, 'Invalid page');
  return page;
}

function regionCode(region: string | undefined): string | undefined {
  if (!region) return undefined;
  return /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : undefined;
}

function hits(results: TmdbSearchResult[], mediaType: 'movie' | 'tv'): SearchHit[] {
  return results
    .map((result) => normalise(result, mediaType))
    .filter((result): result is SearchHit => result !== null);
}

/** Popular and top rated have no combined feed, so movies and shows are merged. */
async function mergedCatalog(
  list: 'popular' | 'top_rated',
  page: number,
  rank: (result: TmdbSearchResult) => number,
): Promise<{ page: number; totalPages: number; results: SearchHit[] }> {
  const [movies, shows] = await Promise.all([
    tmdb.catalog('movie', list, page),
    tmdb.catalog('tv', list, page),
  ]);
  const combined = [
    ...movies.results.map((result) => ({ result, mediaType: 'movie' as const })),
    ...shows.results.map((result) => ({ result, mediaType: 'tv' as const })),
  ].sort((left, right) => rank(right.result) - rank(left.result));

  return {
    page,
    totalPages: Math.max(movies.total_pages, shows.total_pages),
    results: combined
      .slice(0, 20)
      .map(({ result, mediaType }) => normalise(result, mediaType))
      .filter((result): result is SearchHit => result !== null),
  };
}

async function browseCatalog(body: SearchRequest, mediaType: 'movie' | 'tv' | 'multi') {
  const browse = body.browse ?? 'trending';
  const page = pageNumber(body.page);
  const region = regionCode(body.region);

  if (browse === 'genres') {
    if (mediaType !== 'movie' && mediaType !== 'tv') {
      throw new HttpError(400, 'Genres need mediaType "movie" or "tv"');
    }
    const list = await tmdb.genres(mediaType);
    return { genres: list.genres };
  }

  if (browse === 'trending') {
    const trending = await tmdb.trending(mediaType === 'multi' ? 'all' : mediaType);
    return {
      page: 1,
      totalPages: 1,
      results: trending.results
        .map((result) => normalise(result, mediaType === 'multi' ? undefined : mediaType))
        .filter((result): result is SearchHit => result !== null),
    };
  }

  if (browse === 'popular' || browse === 'top_rated') {
    if (mediaType === 'multi') {
      return mergedCatalog(browse, page, (result) =>
        browse === 'popular' ? (result.popularity ?? 0) : (result.vote_average ?? 0),
      );
    }
    const listed = await tmdb.catalog(mediaType, browse, page);
    return { page: listed.page, totalPages: listed.total_pages, results: hits(listed.results, mediaType) };
  }

  if (browse === 'now_playing' || browse === 'upcoming') {
    const listed = await tmdb.catalog('movie', browse, page, region);
    return { page: listed.page, totalPages: listed.total_pages, results: hits(listed.results, 'movie') };
  }

  if (browse === 'on_the_air') {
    const listed = await tmdb.catalog('tv', 'on_the_air', page);
    return { page: listed.page, totalPages: listed.total_pages, results: hits(listed.results, 'tv') };
  }

  if (browse === 'genre') {
    if (mediaType !== 'movie' && mediaType !== 'tv') {
      throw new HttpError(400, 'A genre needs mediaType "movie" or "tv"');
    }
    if (!body.genreId || !Number.isInteger(body.genreId) || body.genreId <= 0) {
      throw new HttpError(400, 'genreId is required');
    }
    const listed = await tmdb.discoverGenre(mediaType, body.genreId, page);
    return { page: listed.page, totalPages: listed.total_pages, results: hits(listed.results, mediaType) };
  }

  if (browse === 'similar') {
    if (mediaType !== 'movie' && mediaType !== 'tv') {
      throw new HttpError(400, 'Similar titles need mediaType "movie" or "tv"');
    }
    if (!body.tmdbId || !Number.isInteger(body.tmdbId) || body.tmdbId <= 0) {
      throw new HttpError(400, 'tmdbId is required');
    }
    const listed = await tmdb.similar(mediaType, body.tmdbId, page);
    return { page: listed.page, totalPages: listed.total_pages, results: hits(listed.results, mediaType) };
  }

  throw new HttpError(400, 'Unsupported browse');
}

export const handler = withHttp(async (event) => {
  const user = await verifySupabaseAuthOptional(event);
  enforceRateLimit(
    user ? `search:${user.id}` : `search:anon:${clientAddress(event)}`,
    user ? 90 : 30,
  );

  const body = parseBody<SearchRequest>(event);
  const { query, mediaType = 'multi' } = body;
  const trimmed = query?.trim() ?? '';

  if (!trimmed) {
    const catalog = await browseCatalog(body, mediaType);
    if ('genres' in catalog) return json(200, catalog);
    return json(200, {
      query: '',
      trending: (body.browse ?? 'trending') === 'trending',
      browse: body.browse ?? 'trending',
      page: catalog.page,
      totalPages: catalog.totalPages,
      results: catalog.results,
    });
  }

  if (trimmed.length > 200) {
    throw new HttpError(400, 'Query is too long');
  }

  const page = pageNumber(body.page);
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
