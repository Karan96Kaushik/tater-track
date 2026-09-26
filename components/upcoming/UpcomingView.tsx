import { useMemo, useState } from 'react';
import { CalendarClock, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MediaDetailDialog } from '@/components/media/MediaDetailDialog';
import { useUpcoming } from '@/hooks/useUpcoming';
import { useSettings } from '@/hooks/useSettings';
import type { MediaType, UpcomingEpisode } from '@/lib/supabase/types';
import { formatDate, posterUrl, relativeAirDate, stillUrl } from '@/lib/utils';

function groupByDate(items: UpcomingEpisode[]) {
  const groups = new Map<string, UpcomingEpisode[]>();
  for (const item of items) {
    const key = item.air_date ?? 'TBA';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}

export function UpcomingView() {
  const { settings } = useSettings();
  const windowDays = settings?.upcoming_window_days;
  const { items, loading, refreshing, error, refreshFromTmdb } = useUpcoming(windowDays);
  const [selected, setSelected] = useState<{ tmdbId: number; mediaType: MediaType } | null>(null);

  const groups = useMemo(() => groupByDate(items), [items]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">Upcoming episodes</h1>
          <p className="text-sm text-muted-foreground">
            Next {windowDays ?? 30} days for shows you are watching or have finished.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={refreshing}
          onClick={() => void refreshFromTmdb()}
        >
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh from TMDB
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && items.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <CalendarClock className="mx-auto mb-3 size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No episodes scheduled. Hit refresh to pull the latest air dates from TMDB.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([date, episodes]) => (
            <section key={date} className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">{formatDate(date)}</h2>
                <Badge variant="outline">{relativeAirDate(date)}</Badge>
              </div>

              <ul className="space-y-2">
                {episodes.map((episode) => {
                  const image =
                    stillUrl(episode.still_path) ?? posterUrl(episode.poster_path, 'w185');
                  return (
                    <li key={`${episode.tmdb_show_id}-${episode.season_number}-${episode.episode_number}`}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelected({ tmdbId: episode.tmdb_show_id, mediaType: 'tv' })
                        }
                        className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/60"
                      >
                        {image ? (
                          <img
                            src={image}
                            alt={episode.show_name}
                            loading="lazy"
                            className="h-16 w-28 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="h-16 w-28 shrink-0 rounded-md bg-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{episode.show_name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            S{episode.season_number}E{episode.episode_number}
                            {episode.episode_name ? ` · ${episode.episode_name}` : ''}
                          </div>
                          {episode.overview && (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {episode.overview}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <MediaDetailDialog target={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
