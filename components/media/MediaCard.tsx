import { Check, Film, Tv } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, posterUrl } from '@/lib/utils';
import type { MediaType, TrackStatus } from '@/lib/supabase/types';

type LibraryFilter = TrackStatus | 'all';

const STATUS_VARIANT: Record<TrackStatus, 'default' | 'secondary' | 'success' | 'destructive'> = {
  watchlist: 'secondary',
  watching: 'default',
  completed: 'success',
  dropped: 'destructive',
};

const STATUS_LABEL: Record<TrackStatus, string> = {
  watchlist: 'Watchlist',
  watching: 'Watching',
  completed: 'Watched',
  dropped: 'Dropped',
};

interface MediaCardProps {
  title: string;
  mediaType: MediaType;
  posterPath: string | null;
  releaseDate: string | null;
  status?: TrackStatus | null;
  /** When set, badges follow the library filter. Omitted on Discover. */
  libraryFilter?: LibraryFilter;
  progress?: { watched: number; total: number | null } | null;
  nextLabel?: string | null;
  layout?: 'grid' | 'list';
  onMarkWatched?: () => void;
  markPending?: boolean;
  onClick?: () => void;
  className?: string;
}

function showStatusBadge(status: TrackStatus | null | undefined, libraryFilter?: LibraryFilter) {
  if (!status) return false;
  if (libraryFilter === undefined) return true;
  if (libraryFilter !== 'all') return false;
  return status !== 'watchlist';
}

export function MediaCard({
  title,
  mediaType,
  posterPath,
  releaseDate,
  status,
  libraryFilter,
  progress,
  nextLabel,
  layout = 'grid',
  onMarkWatched,
  markPending = false,
  onClick,
  className,
}: MediaCardProps) {
  const poster = posterUrl(posterPath);
  const year = releaseDate?.slice(0, 4);
  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.watched / progress.total) * 100))
      : null;
  const episodeCount =
    progress?.total && progress.total > 0
      ? `${progress.watched.toLocaleString('en-US')}/${progress.total.toLocaleString('en-US')} eps`
      : null;
  const meta = [mediaType === 'tv' ? 'TV' : 'Movie', year, episodeCount].filter(Boolean).join(' · ');
  const badge = showStatusBadge(status, libraryFilter);

  const posterFrame = (withBadge: boolean) => (
    <>
      {poster ? (
        <img
          src={poster}
          alt=""
          loading="lazy"
          className="size-full object-cover transition duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          {mediaType === 'tv' ? <Tv className="size-8" /> : <Film className="size-8" />}
        </div>
      )}

      {withBadge && status && (
        <Badge variant={STATUS_VARIANT[status]} className="absolute left-2 top-2 shadow-sm backdrop-blur-md">
          {STATUS_LABEL[status]}
        </Badge>
      )}

      {percent !== null && (
        <div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-black/55">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      )}
    </>
  );

  const copy = (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-start gap-2">
        <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-medium leading-snug">{title}</span>
        {layout === 'list' && badge && status && (
          <Badge variant={STATUS_VARIANT[status]} className="mt-0.5 shrink-0">
            {STATUS_LABEL[status]}
          </Badge>
        )}
      </span>
      {nextLabel && (
        <span className="text-[13px] font-medium leading-snug text-foreground/90">{nextLabel}</span>
      )}
      <span className="text-[13px] leading-snug text-foreground/80">{meta}</span>
    </span>
  );

  const markButton = onMarkWatched ? (
    <button
      type="button"
      aria-label={`Mark the next episode of ${title} as watched`}
      aria-busy={markPending}
      disabled={markPending}
      onClick={(event) => {
        event.stopPropagation();
        onMarkWatched();
      }}
      className="z-10 flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-60"
    >
      <span className="flex size-7 items-center justify-center rounded-full border-2 border-primary bg-black/45 text-primary shadow-md shadow-black/30 backdrop-blur-md">
        <Check className="size-3.5" strokeWidth={2.5} />
      </span>
    </button>
  ) : null;

  if (layout === 'list') {
    return (
      <div className={cn('group flex items-center gap-3', className)}>
        <button
          type="button"
          onClick={onClick}
          aria-label={`Open ${title}`}
          className="relative h-[4.5rem] w-12 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border"
        >
          {posterFrame(false)}
        </button>
        <button type="button" onClick={onClick} className="min-w-0 flex-1 py-1 text-left">
          {copy}
        </button>
        {markButton}
      </div>
    );
  }

  return (
    <div className={cn('group flex w-full flex-col text-left', className)}>
      <div className="relative transition duration-300 group-hover:-translate-y-1">
        <button
          type="button"
          onClick={onClick}
          aria-label={`Open ${title}`}
          className="relative block aspect-[2/3] w-full overflow-hidden rounded-2xl bg-muted shadow-lg shadow-black/25 ring-1 ring-border transition duration-300 group-hover:shadow-xl group-hover:ring-primary/50"
        >
          {posterFrame(true)}
        </button>
        {markButton && <div className="absolute bottom-4 right-1">{markButton}</div>}
      </div>
      <button type="button" onClick={onClick} className="px-0.5 pt-2.5 text-left">
        {copy}
      </button>
    </div>
  );
}
