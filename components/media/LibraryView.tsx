import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
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
    <div className="space-y-5">
      <StatsRow items={items} />

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
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {visible.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          <Button asChild variant="link">
            <Link to="/discover">Find something to watch</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
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
