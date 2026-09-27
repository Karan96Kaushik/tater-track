import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarClock, Sparkles, Star, Trash2 } from 'lucide-react';
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
import { mediaApi, type EpisodeDetail, type MediaDetails } from '@/lib/amplify/media-functions';
import type { MediaType, TrackStatus } from '@/lib/supabase/types';
import { setEpisodesWatched as saveEpisodesWatched, setSeasonWatched } from '@/lib/supabase/watch-progress';
import { useAuth } from '@/hooks/useAuth';
import { useLibrary } from '@/hooks/useLibrary';
import { formatDate, posterUrl, relativeAirDate } from '@/lib/utils';

interface MediaDetailDialogProps {
  target: { tmdbId: number; mediaType: MediaType } | null;
  onOpenChange: (open: boolean) => void;
}

function markFrom(episode: EpisodeDetail) {
  return {
    episodeNumber: episode.episodeNumber,
    name: episode.name,
    airDate: episode.airDate,
  };
}

const STATUS_ACTIONS: Array<{ status: TrackStatus; label: string }> = [
  { status: 'watchlist', label: 'Watchlist' },
  { status: 'watching', label: 'Watching' },
  { status: 'completed', label: 'Watched' },
  { status: 'dropped', label: 'Dropped' },
];

export function MediaDetailDialog({ target, onOpenChange }: MediaDetailDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canTrack = Boolean(user);
  const { entryFor, track, untrack, rate, refresh, applyItem } = useLibrary();
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [season, setSeason] = useState<number | null>(null);
  const [pendingEpisode, setPendingEpisode] = useState<string | null>(null);
  const [pendingBulk, setPendingBulk] = useState(false);

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
          const first = data.episodes?.[0]?.seasonNumber ?? data.seasons?.[0]?.seasonNumber;
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

  function showSnapshot(current: MediaDetails) {
    return {
      tmdbId: current.tmdbId,
      title: current.title,
      posterPath: current.posterPath,
      backdropPath: current.backdropPath,
      releaseDate: current.releaseDate,
      totalEpisodes: current.numberOfEpisodes ?? null,
    };
  }

  function paintEpisodes(seasonNumber: number, episodeNumbers: number[], watched: boolean) {
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
  }

  async function setEpisodesWatched(seasonNumber: number, episodeNumbers: number[], watched: boolean) {
    if (!target || !user || !details || episodeNumbers.length === 0) return;
    const marked = new Set(episodeNumbers);
    const episodes = (details.episodes ?? []).filter(
      (episode) => episode.seasonNumber === seasonNumber && marked.has(episode.episodeNumber),
    );
    if (episodes.length !== episodeNumbers.length) return;

    const previousEpisodes = details.episodes;
    setPendingEpisode(`${seasonNumber}:${episodeNumbers[episodeNumbers.length - 1]}`);
    paintEpisodes(seasonNumber, episodeNumbers, watched);
    try {
      const item = await saveEpisodesWatched({
        userId: user.id,
        show: showSnapshot(details),
        seasonNumber,
        episodes: episodes.map(markFrom),
        watched,
        tracked: tracked
          ? { status: tracked.status, totalEpisodes: tracked.total_episodes }
          : null,
      });
      applyItem(item);
      if (watched && !tracked) {
        toast.success('Added to your library');
      } else if (watched && episodeNumbers.length > 1) {
        toast.success(`Marked ${episodeNumbers.length} episodes as watched`);
      }
    } catch (cause) {
      setDetails((current) => (current ? { ...current, episodes: previousEpisodes } : current));
      toast.error('Could not update progress', { description: (cause as Error).message });
      throw cause;
    } finally {
      setPendingEpisode(null);
    }
  }

  async function markSeason(watched: boolean) {
    if (!target || !user || !details || season === null) return;
    const seasonEpisodes = (details.episodes ?? []).filter((episode) => episode.seasonNumber === season);
    if (watched && (loading || seasonEpisodes.length === 0)) {
      toast.error('Wait for this season to finish loading');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const affected = watched
      ? seasonEpisodes.filter((episode) => episode.airDate && episode.airDate <= today)
      : seasonEpisodes;
    const previousEpisodes = details.episodes;
    setPendingBulk(true);
    paintEpisodes(
      season,
      affected.map((episode) => episode.episodeNumber),
      watched,
    );
    try {
      const item = await setSeasonWatched({
        userId: user.id,
        show: showSnapshot(details),
        seasonNumber: season,
        episodes: seasonEpisodes.map(markFrom),
        watched,
        tracked: tracked
          ? { status: tracked.status, totalEpisodes: tracked.total_episodes }
          : null,
      });
      if (item) applyItem(item);
      toast.success(
        watched && !tracked ? 'Added to your library' : watched ? 'Season marked as watched' : 'Season cleared',
      );
    } catch (cause) {
      setDetails((current) => (current ? { ...current, episodes: previousEpisodes } : current));
      toast.error('Could not update the season', { description: (cause as Error).message });
    } finally {
      setPendingBulk(false);
    }
  }

  async function markShow() {
    if (!target) return;
    setPendingBulk(true);
    try {
      const result = await mediaApi.setShowWatched({ tmdbId: target.tmdbId });
      await Promise.all([season === null ? Promise.resolve() : load(season), refresh()]);
      toast.success(
        result.marked === 0
          ? 'No aired episodes to mark'
          : !tracked
            ? 'Added to your library'
            : 'All aired episodes marked as watched',
      );
    } catch (cause) {
      toast.error('Could not update the show', { description: (cause as Error).message });
      throw cause;
    } finally {
      setPendingBulk(false);
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

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!target) return;
                  onOpenChange(false);
                  navigate('/discover', {
                    state: {
                      similar: {
                        tmdbId: target.tmdbId,
                        mediaType: target.mediaType,
                        title: details.title,
                        at: Date.now(),
                      },
                    },
                  });
                }}
              >
                <Sparkles className="size-4" /> Find similar
              </Button>
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
                saving={pendingEpisode !== null || pendingBulk}
                onSeasonChange={(next) => {
                  setSeason(next);
                  void load(next);
                }}
                onMarkSeason={(watched) => void markSeason(watched)}
                onMarkShow={markShow}
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
