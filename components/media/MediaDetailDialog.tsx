import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarClock, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SeasonEpisodes } from '@/components/media/SeasonEpisodes';
import { mediaApi, type MediaDetails } from '@/lib/amplify/media-functions';
import type { MediaType, TrackStatus } from '@/lib/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useLibrary } from '@/hooks/useLibrary';
import { formatDate, posterUrl, relativeAirDate } from '@/lib/utils';

interface MediaDetailDialogProps {
  target: { tmdbId: number; mediaType: MediaType } | null;
  onOpenChange: (open: boolean) => void;
}

const STATUS_ACTIONS: Array<{ status: TrackStatus; label: string }> = [
  { status: 'watchlist', label: 'Watchlist' },
  { status: 'watching', label: 'Watching' },
  { status: 'completed', label: 'Watched' },
  { status: 'dropped', label: 'Dropped' },
];

export function MediaDetailDialog({ target, onOpenChange }: MediaDetailDialogProps) {
  const { user } = useAuth();
  const canTrack = Boolean(user);
  const { entryFor, track, untrack, rate, refresh } = useLibrary();
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [season, setSeason] = useState<number | null>(null);
  const [pendingEpisode, setPendingEpisode] = useState<string | null>(null);

  const tracked = target ? entryFor(target.tmdbId, target.mediaType) : undefined;

  const load = useCallback(
    async (seasonNumber?: number) => {
      if (!target) return;
      setLoading(true);
      try {
        const data = await mediaApi.details({
          tmdbId: target.tmdbId,
          mediaType: target.mediaType,
          seasonNumber,
        });
        setDetails(data);
        if (seasonNumber === undefined && data.mediaType === 'tv') {
          const first = data.seasons?.[0]?.seasonNumber;
          if (first !== undefined) setSeason(first);
        }
      } catch (cause) {
        toast.error('Could not load details', { description: (cause as Error).message });
      } finally {
        setLoading(false);
      }
    },
    [target],
  );

  useEffect(() => {
    setDetails(null);
    setSeason(null);
    if (target) void load();
  }, [target, load]);

  useEffect(() => {
    if (season !== null) void load(season);
    // `load` changes only with the target, which resets season anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season]);

  async function setEpisodesWatched(seasonNumber: number, episodeNumbers: number[], watched: boolean) {
    if (!target || episodeNumbers.length === 0) return;
    setPendingEpisode(`${seasonNumber}:${episodeNumbers[episodeNumbers.length - 1]}`);
    try {
      await mediaApi.setEpisodeWatched({
        tmdbId: target.tmdbId,
        seasonNumber,
        episodeNumber: episodeNumbers[episodeNumbers.length - 1],
        episodeNumbers: watched ? episodeNumbers : undefined,
        watched,
      });
      const marked = new Set(episodeNumbers);
      setDetails((current) =>
        current
          ? {
              ...current,
              episodes: current.episodes?.map((episode) =>
                episode.seasonNumber === seasonNumber && marked.has(episode.episodeNumber)
                  ? { ...episode, watched }
                  : episode,
              ),
            }
          : current,
      );
      await refresh();
      if (watched && episodeNumbers.length > 1) {
        toast.success(`Marked ${episodeNumbers.length} episodes as watched`);
      }
    } catch (cause) {
      toast.error('Could not update progress', { description: (cause as Error).message });
      throw cause;
    } finally {
      setPendingEpisode(null);
    }
  }

  async function markSeason(watched: boolean) {
    if (!target || season === null) return;
    try {
      await mediaApi.setSeasonWatched({ tmdbId: target.tmdbId, seasonNumber: season, watched });
      await Promise.all([load(season), refresh()]);
      toast.success(watched ? 'Season marked as watched' : 'Season cleared');
    } catch (cause) {
      toast.error('Could not update the season', { description: (cause as Error).message });
    }
  }

  const poster = posterUrl(details?.posterPath, 'w342');

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        {loading && !details ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : details ? (
          <>
            <DialogHeader>
              <DialogTitle>{details.title}</DialogTitle>
              <DialogDescription>
                {details.mediaType === 'tv' ? 'TV series' : 'Movie'} ·{' '}
                {formatDate(details.releaseDate)}
                {details.status ? ` · ${details.status}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-4">
              {poster && (
                <img
                  src={poster}
                  alt={details.title}
                  className="hidden h-52 w-36 shrink-0 rounded-2xl object-cover ring-1 ring-border sm:block"
                />
              )}
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {details.overview || 'No synopsis available.'}
                </p>

                {details.nextEpisodeToAir?.air_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <CalendarClock className="size-4 text-primary" />
                    <span>
                      Next: S{details.nextEpisodeToAir.season_number}E
                      {details.nextEpisodeToAir.episode_number}
                      {details.nextEpisodeToAir.name ? ` · ${details.nextEpisodeToAir.name}` : ''}
                    </span>
                    <Badge variant="outline">
                      {relativeAirDate(details.nextEpisodeToAir.air_date)}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {canTrack ? (
              <div className="flex flex-wrap gap-2">
                {STATUS_ACTIONS.map(({ status, label }) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={tracked?.status === status ? 'default' : 'outline'}
                    onClick={() =>
                      target &&
                      void track({
                        tmdbId: target.tmdbId,
                        mediaType: target.mediaType,
                        status,
                        title: details.title,
                      })
                    }
                  >
                    {label}
                  </Button>
                ))}
                {tracked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (!target) return;
                      void untrack(target);
                      onOpenChange(false);
                    }}
                  >
                    <Trash2 className="size-4" /> Remove
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">Sign in to track this title.</p>
                <Button asChild size="sm" variant="outline">
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>
            )}

            {canTrack && tracked && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-muted-foreground">Your rating</span>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                  <button
                    key={value}
                    type="button"
                    title={`${value}/10`}
                    onClick={() =>
                      target &&
                      void rate({
                        tmdbId: target.tmdbId,
                        mediaType: target.mediaType,
                        rating: tracked.user_rating === value ? null : value,
                      })
                    }
                    className="text-muted-foreground transition-colors hover:text-amber-400"
                  >
                    <Star
                      className={
                        tracked.user_rating && value <= tracked.user_rating
                          ? 'size-4 fill-amber-400 text-amber-400'
                          : 'size-4'
                      }
                    />
                  </button>
                ))}
              </div>
            )}

            {details.mediaType === 'tv' && details.seasons && details.seasons.length > 0 && (
              <SeasonEpisodes
                seasons={details.seasons}
                episodes={details.episodes}
                season={season}
                loading={loading}
                canTrack={canTrack}
                saving={pendingEpisode !== null}
                onSeasonChange={setSeason}
                onMarkSeason={(watched) => void markSeason(watched)}
                onWatch={(episodeNumbers) =>
                  season === null ? Promise.resolve() : setEpisodesWatched(season, episodeNumbers, true)
                }
                onUnwatch={(episodeNumber) =>
                  season === null ? Promise.resolve() : setEpisodesWatched(season, [episodeNumber], false)
                }
              />
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
