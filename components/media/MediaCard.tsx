import { Film, Tv } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, posterUrl } from '@/lib/utils';
import type { MediaType, TrackStatus } from '@/lib/supabase/types';

const STATUS_VARIANT: Record<TrackStatus, 'default' | 'secondary' | 'success' | 'warning'> = {
  watchlist: 'secondary',
  watching: 'default',
  completed: 'success',
  dropped: 'warning',
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
  progress?: { watched: number; total: number | null } | null;
  onClick?: () => void;
  className?: string;
}

export function MediaCard({
  title,
  mediaType,
  posterPath,
  releaseDate,
  status,
  progress,
  onClick,
  className,
}: MediaCardProps) {
  const poster = posterUrl(posterPath);
  const year = releaseDate?.slice(0, 4);
  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.watched / progress.total) * 100))
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('group flex w-full flex-col text-left', className)}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-muted shadow-lg shadow-black/25 ring-1 ring-border transition duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:ring-primary/50">
        {poster ? (
          <img
            src={poster}
            alt={title}
            loading="lazy"
            className="size-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            {mediaType === 'tv' ? <Tv className="size-8" /> : <Film className="size-8" />}
          </div>
        )}

        {status && (
          <Badge variant={STATUS_VARIANT[status]} className="absolute left-2 top-2 shadow-sm backdrop-blur-md">
            {STATUS_LABEL[status]}
          </Badge>
        )}

        {percent !== null && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/55">
            <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-0.5 px-0.5 pt-2.5">
        <span className="line-clamp-2 text-sm font-medium leading-tight">{title}</span>
        <span className="text-xs text-muted-foreground">
          {mediaType === 'tv' ? 'TV' : 'Movie'}
          {year ? ` · ${year}` : ''}
          {progress?.total ? ` · ${progress.watched}/${progress.total} eps` : ''}
        </span>
      </div>
    </button>
  );
}
