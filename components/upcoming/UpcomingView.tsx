import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MediaDetailDialog } from '@/components/media/MediaDetailDialog';
import { useUpcoming } from '@/hooks/useUpcoming';
import { useSettings } from '@/hooks/useSettings';
import type { MediaType, UpcomingEpisode } from '@/lib/supabase/types';
import { daysUntil, formatDate, posterUrl, relativeAirDate, stillUrl } from '@/lib/utils';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function groupByDate(items: UpcomingEpisode[]) {
  const groups = new Map<string, UpcomingEpisode[]>();
  for (const item of items) {
    const key = item.air_date ?? 'TBA';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}

function releasedLabel(date: string) {
  const days = daysUntil(date);
  if (days === -1) return 'Yesterday';
  if (days !== null && days < -1 && days > -7) return `${Math.abs(days)} days ago`;
  return 'Aired';
}

export function UpcomingView() {
  const { settings } = useSettings();
  const windowDays = settings?.upcoming_window_days;
  const { items, loading, refreshing, error, refreshFromTmdb } = useUpcoming(windowDays);
  const [selected, setSelected] = useState<{ tmdbId: number; mediaType: MediaType } | null>(null);

  const today = todayKey();
  const recent = useMemo(
    () => items.filter((item) => item.air_date !== null && item.air_date < today),
    [items, today],
  );
  const upcoming = useMemo(
    () => items.filter((item) => item.air_date === null || item.air_date >= today),
    [items, today],
  );
  const recentGroups = useMemo(() => groupByDate(recent), [recent]);
  const upcomingGroups = useMemo(() => groupByDate(upcoming), [upcoming]);
  const scheduleRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  useLayoutEffect(() => {
    if (scrolled.current || loading || recent.length === 0 || !scheduleRef.current) return;
    scheduleRef.current.scrollIntoView({ block: 'start' });
    scrolled.current = true;
  }, [loading, recent.length]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary">Schedule</p>
          <h1 className="font-display mt-1 text-3xl font-medium tracking-tight">Upcoming episodes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The past and next {windowDays ?? 30} days for shows you are watching or have finished.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full sm:ml-auto"
          disabled={refreshing || (loading && items.length === 0)}
          onClick={() => void refreshFromTmdb()}
        >
          {refreshing || (loading && items.length === 0) ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Refresh from TMDB
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {(loading || refreshing) && items.length === 0 ? (
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
            No episodes aired or air in the next {windowDays ?? 30} days. Dates further out still show on each show.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {recentGroups.length > 0 && (
            <section aria-label="Recently released episodes" className="space-y-6">
              <h2 className="font-display text-xl font-medium tracking-tight">Recently released</h2>
              {recentGroups.map(([date, episodes]) => (
                <EpisodeGroup
                  key={date}
                  date={date}
                  when={releasedLabel(date)}
                  episodes={episodes}
                  onOpen={(tmdbId) => setSelected({ tmdbId, mediaType: 'tv' })}
                />
              ))}
            </section>
          )}

          <div ref={scheduleRef} className="scroll-mt-20 space-y-6">
            {recentGroups.length > 0 && (
              <p className="text-center text-xs text-muted-foreground">Scroll up for episodes that just aired</p>
            )}
            {upcomingGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing else scheduled in this window.</p>
            ) : (
              upcomingGroups.map(([date, episodes]) => (
                <EpisodeGroup
                  key={date}
                  date={date}
                  when={relativeAirDate(date)}
                  episodes={episodes}
                  onOpen={(tmdbId) => setSelected({ tmdbId, mediaType: 'tv' })}
                />
              ))
            )}
          </div>
        </div>
      )}

      <MediaDetailDialog target={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}

function EpisodeGroup({
  date,
  when,
  episodes,
  onOpen,
}: {
  date: string;
  when: string;
  episodes: UpcomingEpisode[];
  onOpen: (tmdbId: number) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="font-display text-lg font-medium tracking-tight">{formatDate(date)}</h3>
        <Badge variant="outline">{when}</Badge>
      </div>

      <ul className="space-y-2">
        {episodes.map((episode) => {
          const image = stillUrl(episode.still_path) ?? posterUrl(episode.poster_path, 'w185');
          return (
            <li key={`${episode.tmdb_show_id}-${episode.season_number}-${episode.episode_number}`}>
              <button
                type="button"
                onClick={() => onOpen(episode.tmdb_show_id)}
                className="flex min-h-11 w-full items-center gap-4 rounded-2xl bg-card/70 p-2.5 text-left ring-1 ring-border transition duration-200 hover:-translate-y-0.5 hover:bg-card hover:ring-primary/40"
              >
                {image ? (
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    className="h-[4.5rem] w-32 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="h-[4.5rem] w-32 shrink-0 rounded-xl bg-muted" />
                )}
                <div className="min-w-0 flex-1 pr-2">
                  <div className="truncate text-sm font-medium">{episode.show_name}</div>
                  <div className="truncate text-[13px] text-foreground/80">
                    S{episode.season_number}E{episode.episode_number}
                    {episode.episode_name ? ` · ${episode.episode_name}` : ''}
                  </div>
                  {episode.overview && (
                    <p className="mt-1 line-clamp-2 text-[13px] text-foreground/70">{episode.overview}</p>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
