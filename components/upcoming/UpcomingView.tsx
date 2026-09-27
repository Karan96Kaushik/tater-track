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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary">Schedule</p>
          <h1 className="font-display mt-1 text-3xl font-medium tracking-tight">Upcoming episodes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Next {windowDays ?? 30} days for shows you are watching or have finished.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full sm:ml-auto"
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
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
            <CalendarClock className="size-5" />
          </span>
          <p className="font-display text-xl font-medium">Nothing scheduled</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            No episodes in this window. Refresh to pull the latest air dates from TMDB.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([date, episodes]) => (
            <section key={date} className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-medium tracking-tight">{formatDate(date)}</h2>
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
                        className="flex w-full items-center gap-4 rounded-2xl bg-card/70 p-2.5 text-left ring-1 ring-border transition duration-200 hover:-translate-y-0.5 hover:bg-card hover:ring-primary/40"
                      >
                        {image ? (
                          <img
                            src={image}
                            alt={episode.show_name}
                            loading="lazy"
                            className="h-[4.5rem] w-32 shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="h-[4.5rem] w-32 shrink-0 rounded-xl bg-muted" />
                        )}
                        <div className="min-w-0 flex-1 pr-2">
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
