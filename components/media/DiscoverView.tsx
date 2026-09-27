import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MediaCard } from '@/components/media/MediaCard';
import { MediaDetailDialog } from '@/components/media/MediaDetailDialog';
import { mediaApi, type SearchHit } from '@/lib/amplify/media-functions';
import { areFunctionsConfigured } from '@/lib/amplify/client';
import type { MediaType } from '@/lib/supabase/types';
import { useLibrary } from '@/hooks/useLibrary';

type Filter = 'multi' | 'movie' | 'tv';

export function DiscoverView() {
  const { entryFor } = useLibrary();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('multi');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [trending, setTrending] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ tmdbId: number; mediaType: MediaType } | null>(null);

  useEffect(() => {
    if (!areFunctionsConfigured) return;

    // Debounced so typing doesn't spend a TMDB call per keystroke.
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await mediaApi.search({ query, mediaType: filter });
        setResults(response.results);
        setTrending(response.trending);
        setError(null);
      } catch (cause) {
        setError((cause as Error).message);
      } finally {
        setLoading(false);
      }
    }, query ? 350 : 0);

    return () => clearTimeout(timer);
  }, [query, filter]);

  const heading = useMemo(
    () => (trending ? 'Trending this week' : `Results for “${query}”`),
    [trending, query],
  );

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
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search movies and TV shows"
            className="h-12 rounded-2xl pl-11"
          />
        </div>
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList>
            <TabsTrigger value="multi">All</TabsTrigger>
            <TabsTrigger value="movie">Movies</TabsTrigger>
            <TabsTrigger value="tv">TV</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl font-medium tracking-tight">{heading}</h2>
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

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

      {!loading && results.length === 0 && !error && (
        <p className="py-16 text-center font-display text-lg text-muted-foreground">Nothing found.</p>
      )}

      <MediaDetailDialog target={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
