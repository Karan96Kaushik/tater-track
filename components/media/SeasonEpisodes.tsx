import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EpisodeDetail, SeasonSummary } from '@/lib/amplify/media-functions';
import { cn, formatDate, relativeAirDate } from '@/lib/utils';

interface CatchUp {
  episodeNumber: number;
  previous: number[];
}

interface SeasonEpisodesProps {
  seasons: SeasonSummary[];
  episodes: EpisodeDetail[] | undefined;
  season: number | null;
  loading: boolean;
  canTrack: boolean;
  saving: boolean;
  onSeasonChange: (season: number) => void;
  onMarkSeason: (watched: boolean) => void;
  onWatch: (episodeNumbers: number[]) => Promise<void>;
  onUnwatch: (episodeNumber: number) => Promise<void>;
}

function airedAlready(airDate: string | null) {
  if (!airDate) return true;
  return airDate <= new Date().toISOString().slice(0, 10);
}

function earlierUnwatched(episode: EpisodeDetail, episodes: EpisodeDetail[]) {
  return episodes.filter(
    (item) =>
      item.episodeNumber < episode.episodeNumber && !item.watched && airedAlready(item.airDate),
  );
}

function episodeSpan(numbers: number[]) {
  const sorted = [...numbers].sort((left, right) => left - right);
  if (sorted.length === 1) return `episode ${sorted[0]}`;
  const contiguous = sorted.every((number, index) => index === 0 || number === sorted[index - 1] + 1);
  if (contiguous) return `episodes ${sorted[0]}–${sorted[sorted.length - 1]}`;
  return `${sorted.length} earlier episodes`;
}

export function SeasonEpisodes({
  seasons,
  episodes,
  season,
  loading,
  canTrack,
  saving,
  onSeasonChange,
  onMarkSeason,
  onWatch,
  onUnwatch,
}: SeasonEpisodesProps) {
  const [catchUp, setCatchUp] = useState<CatchUp | null>(null);
  const list = episodes ?? [];
  const watchedCount = list.filter((episode) => episode.watched).length;
  const progress = list.length > 0 ? Math.round((watchedCount / list.length) * 100) : 0;
  const upNext = list.find((episode) => !episode.watched && airedAlready(episode.airDate));

  useEffect(() => {
    setCatchUp(null);
  }, [season]);

  useEffect(() => {
    if (!catchUp) return;
    const episode = list.find((item) => item.episodeNumber === catchUp.episodeNumber);
    if (!episode || episode.watched) setCatchUp(null);
  }, [list, catchUp]);

  async function choose(includePrevious: boolean) {
    if (!catchUp) return;
    const numbers = includePrevious ? [...catchUp.previous, catchUp.episodeNumber] : [catchUp.episodeNumber];
    try {
      await onWatch(numbers);
      setCatchUp(null);
    } catch {
      // The caller surfaces the error.
    }
  }

  function onEpisode(episode: EpisodeDetail) {
    if (!canTrack || saving || !airedAlready(episode.airDate)) return;

    if (catchUp?.episodeNumber === episode.episodeNumber && !episode.watched) {
      setCatchUp(null);
      return;
    }

    if (episode.watched) {
      setCatchUp(null);
      void onUnwatch(episode.episodeNumber);
      return;
    }

    const previous = earlierUnwatched(episode, list).map((item) => item.episodeNumber);
    if (previous.length === 0) {
      setCatchUp(null);
      void onWatch([episode.episodeNumber]);
      return;
    }

    setCatchUp({ episodeNumber: episode.episodeNumber, previous });
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center gap-3">
        <select
          value={season ?? ''}
          onChange={(event) => onSeasonChange(Number(event.target.value))}
          className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm"
        >
          {seasons.map((entry) => (
            <option key={entry.seasonNumber} value={entry.seasonNumber}>
              {entry.name} ({entry.episodeCount} eps)
            </option>
          ))}
        </select>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {list.length > 0 ? `${watchedCount} of ${list.length}` : '—'}
        </span>
        {loading && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>

      {canTrack && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={saving || season === null}
            onClick={() => {
              setCatchUp(null);
              onMarkSeason(true);
            }}
          >
            <Check className="size-4" /> Mark season watched
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving || watchedCount === 0}
            onClick={() => {
              setCatchUp(null);
              onMarkSeason(false);
            }}
          >
            Clear season
          </Button>
        </div>
      )}

      <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
        {catchUp && (
          <div className="sticky top-0 z-10 mb-2 rounded-2xl bg-card p-3 shadow-lg shadow-black/20 ring-1 ring-primary/30">
            <p className="text-sm font-medium">Mark earlier episodes?</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {episodeSpan(catchUp.previous)} {catchUp.previous.length === 1 ? 'comes' : 'come'} before episode{' '}
              {catchUp.episodeNumber} and {catchUp.previous.length === 1 ? "isn't" : "aren't"} marked watched.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={saving} onClick={() => void choose(true)}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Mark previous too
              </Button>
              <Button size="sm" variant="outline" disabled={saving} onClick={() => void choose(false)}>
                Only episode {catchUp.episodeNumber}
              </Button>
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => setCatchUp(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <ul className="space-y-1">
          {list.map((episode) => {
            const unaired = !airedAlready(episode.airDate);
            const prompted = catchUp?.episodeNumber === episode.episodeNumber;
            return (
              <li key={`${episode.seasonNumber}:${episode.episodeNumber}`}>
                <button
                  type="button"
                  disabled={canTrack && (unaired || saving)}
                  aria-pressed={canTrack ? episode.watched : undefined}
                  onClick={() => onEpisode(episode)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors',
                    canTrack && !unaired && 'hover:bg-muted/70',
                    episode.watched && 'bg-primary/8',
                    prompted && 'bg-primary/12 ring-1 ring-primary/40',
                    unaired && 'opacity-55',
                    !canTrack && 'cursor-default',
                  )}
                >
                  {canTrack && (
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full border',
                        episode.watched
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background/40',
                      )}
                    >
                      {episode.watched && <Check className="size-3.5" strokeWidth={2.5} />}
                    </span>
                  )}
                  <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {episode.episodeNumber}
                  </span>
                  <span className={cn('min-w-0 flex-1 truncate text-sm', episode.watched && 'text-muted-foreground')}>
                    {episode.name ?? 'Untitled'}
                  </span>
                  <span className="shrink-0 text-right text-[11px] leading-tight text-muted-foreground">
                    {upNext?.episodeNumber === episode.episodeNumber && (
                      <span className="block font-medium text-primary">Up next</span>
                    )}
                    {unaired ? relativeAirDate(episode.airDate) : formatDate(episode.airDate)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
