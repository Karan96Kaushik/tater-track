import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MediaCard } from '@/components/media/MediaCard';
import { MediaDetailDialog } from '@/components/media/MediaDetailDialog';
import { StatsRow } from '@/components/metrics/StatsRow';
import { useLibrary } from '@/hooks/useLibrary';
import type { MediaType, TrackStatus } from '@/lib/supabase/types';

type Filter = TrackStatus | 'all';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'watching', label: 'Watching' },
  { value: 'watchlist', label: 'Watchlist' },
  { value: 'completed', label: 'Watched' },
  { value: 'dropped', label: 'Dropped' },
];

export function LibraryView() {
  const { items, loading, error } = useLibrary();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<{ tmdbId: number; mediaType: MediaType } | null>(null);

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.status === filter)),
    [items, filter],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary">Library</p>
          <h1 className="font-display mt-1 text-3xl font-medium tracking-tight">Your library</h1>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
            <TabsList>
              {FILTERS.map((entry) => (
                <TabsTrigger key={entry.value} value={entry.value}>
                  {entry.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {loading && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>
      </div>

      <StatsRow items={items} />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {visible.length === 0 && !loading ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
            <Library className="size-5" />
          </span>
          <p className="font-display text-xl font-medium">Nothing here yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Search movies and shows, then add them to your library.
          </p>
          <Button asChild className="mt-5 rounded-full">
            <Link to="/discover">Find something to watch</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {visible.map((item) => (
            <MediaCard
              key={item.id}
              title={item.title}
              mediaType={item.media_type}
              posterPath={item.poster_path}
              releaseDate={item.release_date}
              status={item.status}
              progress={
                item.media_type === 'tv'
                  ? { watched: item.watched_episode_count, total: item.total_episodes }
                  : null
              }
              onClick={() => setSelected({ tmdbId: item.tmdb_id, mediaType: item.media_type })}
            />
          ))}
        </div>
      )}

      <MediaDetailDialog target={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
