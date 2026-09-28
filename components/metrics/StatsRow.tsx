import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { TrackedMedia, TrackStatus } from '@/lib/supabase/types';

type LibraryFilter = TrackStatus | 'all';

const numberFormat = new Intl.NumberFormat('en-US');

interface Stat {
  label: string;
  value: number;
  filter?: LibraryFilter;
}

export function StatsRow({
  items,
  dense = false,
  onFilter,
}: {
  items: TrackedMedia[];
  dense?: boolean;
  onFilter: (filter: LibraryFilter) => void;
}) {
  const stats = useMemo(() => {
    const movies = items.filter((item) => item.media_type === 'movie').length;
    const shows = items.filter((item) => item.media_type === 'tv').length;
    const inProgress = items.filter((item) => item.status === 'watching').length;
    const episodes = items
      .filter((item) => item.media_type === 'tv')
      .reduce((total, show) => total + show.watched_episode_count, 0);

    const row: Stat[] = [
      { label: 'Shows', value: shows, filter: 'all' },
      { label: 'In progress', value: inProgress, filter: 'watching' },
      { label: 'Episodes watched', value: episodes },
    ];
    if (movies > 0) row.push({ label: 'Movies', value: movies });
    return row;
  }, [items]);

  return (
    <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {stats.map((stat) => {
        const label = `${stat.label}, ${numberFormat.format(stat.value)}`;
        const className = cn(
          'flex min-h-11 min-w-[7.25rem] flex-1 flex-col items-start justify-center rounded-2xl bg-card/80 px-3 text-left text-foreground ring-1 ring-border',
          dense ? 'py-1.5' : 'py-2',
        );
        const body = (
          <>
            <span
              className={cn(
                'font-display font-medium leading-none tabular-nums',
                dense ? 'text-base' : 'text-lg',
              )}
            >
              {numberFormat.format(stat.value)}
            </span>
            <span className="mt-1 whitespace-nowrap text-[11px] tracking-wide text-foreground/75">
              {stat.label}
            </span>
          </>
        );

        if (!stat.filter) {
          return (
            <div key={stat.label} className={className} aria-label={label}>
              {body}
            </div>
          );
        }

        return (
          <button
            key={stat.label}
            type="button"
            aria-label={label}
            onClick={() => onFilter(stat.filter!)}
            className={className}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
