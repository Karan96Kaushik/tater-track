import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MediaCard } from '@/components/media/MediaCard';
import { MediaDetailDialog } from '@/components/media/MediaDetailDialog';
import { mediaApi, type BrowseKind, type Genre, type SearchHit, type SimilarShow } from '@/lib/amplify/media-functions';
import { areFunctionsConfigured } from '@/lib/amplify/client';
import type { MediaType } from '@/lib/supabase/types';
import { useLibrary } from '@/hooks/useLibrary';
import { useSettings } from '@/hooks/useSettings';
import { cn, posterUrl } from '@/lib/utils';

type Filter = 'multi' | 'movie' | 'tv';
type CategoryId = 'trending' | 'popular' | 'top_rated' | 'now_playing' | 'upcoming' | 'on_the_air';

interface SimilarPick {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  at: number;
}

interface GenrePick {
  id: number;
  name: string;
  mediaType: MediaType;
}

interface DiscoverState {
  similar?: SimilarPick;
}

const CATEGORIES: Array<{
  id: CategoryId;
  label: string;
  heading: string;
  show: (filter: Filter) => boolean;
}> = [
  { id: 'trending', label: 'Trending', heading: 'Trending this week', show: () => true },
  { id: 'popular', label: 'Popular', heading: 'Popular', show: () => true },
  { id: 'top_rated', label: 'Top rated', heading: 'Top rated', show: () => true },
  { id: 'now_playing', label: 'In theaters', heading: 'In theaters', show: (filter) => filter !== 'tv' },
  { id: 'upcoming', label: 'Coming soon', heading: 'Coming soon', show: (filter) => filter !== 'tv' },
  { id: 'on_the_air', label: 'On TV', heading: 'On TV', show: (filter) => filter !== 'movie' },
];

const browseCache = new Map<string, SearchHit[]>();
const similarCache = new Map<string, SimilarShow[]>();
const genreCache = new Map<MediaType, Genre[]>();

function categoryVisible(id: CategoryId, filter: Filter) {
  return CATEGORIES.find((category) => category.id === id)?.show(filter) ?? false;
}

export function DiscoverView() {
  const location = useLocation();
  const requested = (location.state as DiscoverState | null)?.similar;
  const { entryFor } = useLibrary();
  const { settings } = useSettings();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('multi');
  const [category, setCategory] = useState<CategoryId>('trending');
  const [genre, setGenre] = useState<GenrePick | null>(null);
  const [similar, setSimilar] = useState<SimilarPick | null>(requested ?? null);
  const [genres, setGenres] = useState<GenrePick[]>([]);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [suggestions, setSuggestions] = useState<SimilarShow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ tmdbId: number; mediaType: MediaType } | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(true);

  const region = settings?.region || 'US';
  const searching = query.trim().length > 0;

  useEffect(() => {
    if (requested?.mediaType === 'tv') {
      setQuery('');
      setGenre(null);
      setSimilar(requested);
      return;
    }
    setSimilar(null);
    setSuggestions([]);
  }, [location.key, requested]);

  useEffect(() => {
    if (!areFunctionsConfigured) return;
    const types: MediaType[] = filter === 'multi' ? ['movie', 'tv'] : [filter];
    let active = true;

    void (async () => {
      try {
        const lists = await Promise.all(
          types.map(async (mediaType) => {
            const cached = genreCache.get(mediaType);
            if (cached) return cached.map((entry) => ({ ...entry, mediaType }));
            const response = await mediaApi.genres(mediaType);
            const sorted = [...response.genres].sort((left, right) => left.name.localeCompare(right.name));
            genreCache.set(mediaType, sorted);
            return sorted.map((entry) => ({ ...entry, mediaType }));
          }),
        );
        if (!active) return;
        const movieNames = new Set(lists.flat().filter((entry) => entry.mediaType === 'movie').map((entry) => entry.name));
        setGenres(
          lists.flat().map((entry) =>
            filter === 'multi' && entry.mediaType === 'tv' && movieNames.has(entry.name)
              ? { ...entry, name: `${entry.name} · TV` }
              : entry,
          ),
        );
      } catch {
        if (active) setGenres([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [filter]);

  useEffect(() => {
    if (!areFunctionsConfigured || !similar || similar.mediaType !== 'tv') return;

    const cacheKey = `${similar.tmdbId}:${similar.at}`;
    const cached = similarCache.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setSuggestions([]);
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await mediaApi.findSimilar({ tmdbId: similar.tmdbId });
        if (cancelled) return;
        setSuggestions(response.shows);
        similarCache.set(cacheKey, response.shows);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [similar]);

  useEffect(() => {
    if (!areFunctionsConfigured || similar) return;

    const trimmed = query.trim();
    const cacheKey = trimmed
      ? ''
      : genre
        ? `genre:${genre.mediaType}:${genre.id}`
        : `${category}:${filter}:${category === 'now_playing' || category === 'upcoming' ? region : ''}`;

    if (!trimmed) {
      const cached = browseCache.get(cacheKey);
      if (cached) {
        setResults(cached);
        setLoading(false);
        setError(null);
        return;
      }
      setResults([]);
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = trimmed
          ? await mediaApi.search({ query: trimmed, mediaType: filter })
          : genre
            ? await mediaApi.browse({
                  browse: 'genre',
                  mediaType: genre.mediaType,
                  genreId: genre.id,
                })
              : await mediaApi.browse({
                  browse: category as BrowseKind,
                  mediaType: filter,
                  region,
                });
        if (cancelled) return;
        setResults(response.results);
        setError(null);
        if (!trimmed) browseCache.set(cacheKey, response.results);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, trimmed ? 350 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, filter, category, genre, similar, region]);

  const heading = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed) return `Results for “${trimmed}”`;
    if (similar) return `Similar to ${similar.title}`;
    if (genre) return genre.mediaType === 'tv' ? `${genre.name.replace(/ · TV$/, '')} series` : `${genre.name} movies`;
    return CATEGORIES.find((entry) => entry.id === category)?.heading ?? 'Discover';
  }, [query, similar, genre, category]);

  function chooseFilter(next: Filter) {
    setFilter(next);
    if (!categoryVisible(category, next)) setCategory('trending');
    if (genre && next !== 'multi' && genre.mediaType !== next) setGenre(null);
    if (similar && next !== 'multi' && similar.mediaType !== next) setSimilar(null);
  }

  function chooseCategory(next: CategoryId) {
    setCategory(next);
    setGenre(null);
    setSimilar(null);
    setQuery('');
  }

  function chooseGenre(next: GenrePick) {
    setGenre((current) =>
      current?.id === next.id && current.mediaType === next.mediaType ? null : next,
    );
    setSimilar(null);
    setQuery('');
  }

  const visibleCategories = CATEGORIES.filter((entry) => entry.show(filter));
  const movieGenres = genres.filter((entry) => entry.mediaType === 'movie');
  const tvGenres = genres.filter((entry) => entry.mediaType === 'tv');

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary">Discover</p>
        <h1 className="font-display mt-1 text-3xl font-medium tracking-tight">Find something to watch</h1>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value.trim()) {
                setSimilar(null);
                setSuggestions([]);
              }
            }}
            placeholder="Search movies and TV shows"
            className="h-12 rounded-2xl pl-11"
          />
        </div>
        <Tabs value={filter} onValueChange={(value) => chooseFilter(value as Filter)}>
          <TabsList>
            <TabsTrigger value="multi">All</TabsTrigger>
            <TabsTrigger value="movie">Movies</TabsTrigger>
            <TabsTrigger value="tv">TV</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {!searching && (
        <section className="space-y-3">
          <button
            type="button"
            aria-expanded={categoriesOpen}
            onClick={() => setCategoriesOpen((open) => !open)}
            className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Categories
            </span>
            <ChevronDown
              className={cn('size-4 shrink-0 text-muted-foreground transition-transform', categoriesOpen && 'rotate-180')}
              aria-hidden
            />
          </button>
          {categoriesOpen && (
            <div className="space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {visibleCategories.map((entry) => (
                  <Button
                    key={entry.id}
                    type="button"
                    size="sm"
                    variant={!genre && !similar && category === entry.id ? 'default' : 'outline'}
                    className="rounded-full"
                    aria-pressed={!genre && !similar && category === entry.id}
                    onClick={() => chooseCategory(entry.id)}
                  >
                    {entry.label}
                  </Button>
                ))}
              </div>

              <GenreRow
                label={filter === 'multi' ? 'Movie genres' : 'Genres'}
                genres={filter === 'tv' ? tvGenres : movieGenres}
                selected={genre}
                onSelect={chooseGenre}
              />
              {filter === 'multi' && (
                <GenreRow label="TV genres" genres={tvGenres} selected={genre} onSelect={chooseGenre} />
              )}
            </div>
          )}
        </section>
      )}

      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl font-medium tracking-tight">{heading}</h2>
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {similar ? (
        <div className="space-y-3">
          {loading && suggestions.length === 0
            ? Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-2xl" />
              ))
            : suggestions.map((show) => {
                const poster = posterUrl(show.posterPath);
                return (
                  <button
                    key={show.tmdbId}
                    type="button"
                    onClick={() => setSelected({ tmdbId: show.tmdbId, mediaType: 'tv' })}
                    className="flex w-full gap-4 rounded-2xl bg-card/40 p-3 text-left ring-1 ring-border transition-colors hover:bg-accent"
                  >
                    {poster ? (
                      <img
                        src={poster}
                        alt=""
                        className="h-24 w-16 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="h-24 w-16 shrink-0 rounded-xl bg-muted" />
                    )}
                    <span className="min-w-0 space-y-1">
                      <span className="block font-medium leading-snug">{show.title}</span>
                      <span className="block text-sm leading-snug text-muted-foreground">{show.reason}</span>
                    </span>
                  </button>
                );
              })}
        </div>
      ) : (
      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {loading && results.length === 0
          ? Array.from({ length: 12 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[2/3] w-full rounded-lg" />
            ))
          : results.map((hit) => {
              const tracked = entryFor(hit.tmdbId, hit.mediaType);
              return (
                <MediaCard
                  key={`${hit.mediaType}-${hit.tmdbId}`}
                  title={hit.title}
                  mediaType={hit.mediaType}
                  posterPath={hit.posterPath}
                  releaseDate={hit.releaseDate}
                  status={tracked?.status ?? null}
                  onClick={() => setSelected({ tmdbId: hit.tmdbId, mediaType: hit.mediaType })}
                />
              );
            })}
      </div>
      )}

      {!loading && !error && (similar ? suggestions.length === 0 : results.length === 0) && (
        <p className="py-16 text-center font-display text-lg text-muted-foreground">
          {similar ? 'No similar shows came back.' : searching ? 'Nothing found.' : 'Nothing in this list.'}
        </p>
      )}

      <MediaDetailDialog target={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}

function GenreRow({
  label,
  genres,
  selected,
  onSelect,
}: {
  label: string;
  genres: GenrePick[];
  selected: GenrePick | null;
  onSelect: (genre: GenrePick) => void;
}) {
  if (genres.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {genres.map((entry) => {
          const active = selected?.id === entry.id && selected.mediaType === entry.mediaType;
          return (
            <button
              key={`${entry.mediaType}-${entry.id}`}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(entry)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors',
                active
                  ? 'bg-primary text-primary-foreground ring-primary'
                  : 'bg-card/40 text-foreground ring-border hover:bg-accent',
              )}
            >
              {entry.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
