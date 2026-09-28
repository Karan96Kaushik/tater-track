import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LayoutGrid, Library, List, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MediaCard } from '@/components/media/MediaCard';
import { MediaDetailDialog } from '@/components/media/MediaDetailDialog';
import { StatsRow } from '@/components/metrics/StatsRow';
import { useAuth } from '@/hooks/useAuth';
import { useLibrary } from '@/hooks/useLibrary';
import { useSettings } from '@/hooks/useSettings';
import {
  forgetNextEpisode,
  peekNextEpisode,
  resolveNextEpisode,
  type NextEpisodeRef,
} from '@/lib/library/next-episode';
import { airedOnOrBeforeToday, setEpisodesWatched } from '@/lib/supabase/watch-progress';
import { cn } from '@/lib/utils';
import type { MediaType, TrackedMedia, TrackStatus } from '@/lib/supabase/types';

type Filter = TrackStatus | 'all';
type SortKey = 'watched' | 'title' | 'progress' | 'added';
type ViewMode = 'grid' | 'list';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'watching', label: 'Watching' },
  { value: 'watchlist', label: 'Watchlist' },
  { value: 'completed', label: 'Watched' },
  { value: 'dropped', label: 'Dropped' },
];

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'watched', label: 'Recently watched' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'progress', label: 'Progress' },
  { value: 'added', label: 'Recently added' },
];

const STATUS_RANK: Record<TrackStatus, number> = {
  watching: 0,
  watchlist: 1,
  completed: 2,
  dropped: 3,
};

const SORT_KEY = 'tater-track:library-sort';
const VIEW_KEY = 'tater-track:library-view';
const PAGE_SIZE = 24;

function storedChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function lightHaptic() {
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return;
  try {
    vibrate(10);
  } catch {
    // Exposed in some browsers, but rejected without a user gesture or permission.
  }
}

function progressRatio(item: TrackedMedia) {
  if (item.media_type !== 'tv' || !item.total_episodes) return -1;
  return item.watched_episode_count / item.total_episodes;
}

function compareTitle(left: TrackedMedia, right: TrackedMedia) {
  return left.title.localeCompare(right.title, undefined, { sensitivity: 'base', numeric: true });
}

function compareItems(left: TrackedMedia, right: TrackedMedia, sort: SortKey) {
  if (sort === 'title') return compareTitle(left, right);
  if (sort === 'added') return right.created_at.localeCompare(left.created_at);
  if (sort === 'progress') return progressRatio(right) - progressRatio(left) || compareTitle(left, right);
  if (!left.last_watched_at && !right.last_watched_at) return compareTitle(left, right);
  if (!left.last_watched_at) return 1;
  if (!right.last_watched_at) return -1;
  return right.last_watched_at.localeCompare(left.last_watched_at) || compareTitle(left, right);
}

function sortItems(items: TrackedMedia[], sort: SortKey, groupByStatus: boolean) {
  return [...items].sort((left, right) => {
    if (groupByStatus) {
      const statusDelta = STATUS_RANK[left.status] - STATUS_RANK[right.status];
      if (statusDelta !== 0) return statusDelta;
    }
    return compareItems(left, right, sort);
  });
}

function bumped(item: TrackedMedia): TrackedMedia {
  const watched = item.watched_episode_count + 1;
  const finished = item.total_episodes != null && item.total_episodes > 0 && watched >= item.total_episodes;
  const now = new Date().toISOString();
  return {
    ...item,
    watched_episode_count: watched,
    status: finished ? 'completed' : item.status,
    last_watched_at: now,
    updated_at: now,
  };
}

function nextText(episode: NextEpisodeRef | null) {
  return episode ? `Next: S${episode.seasonNumber}E${episode.episodeNumber}` : '';
}

function CardSkeleton({ layout }: { layout: ViewMode }) {
  if (layout === 'list') {
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="h-[4.5rem] w-12 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3 rounded-md" />
          <Skeleton className="h-3 w-1/2 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Skeleton className="aspect-[2/3] w-full rounded-2xl" />
      <Skeleton className="mt-2.5 h-4 w-4/5 rounded-md" />
      <Skeleton className="mt-1.5 h-3 w-1/2 rounded-md" />
    </div>
  );
}

export function LibraryView() {
  const { user } = useAuth();
  const { items, loading, error, syncItem } = useLibrary();
  const { settings } = useSettings();
  const includeSpecials = settings?.include_specials ?? false;
  const [filter, setFilter] = useState<Filter>('watching');
  const [sort, setSort] = useState<SortKey>(() => storedChoice(SORT_KEY, ['watched', 'title', 'progress', 'added'] as const, 'watched'));
  const [view, setView] = useState<ViewMode>(() => storedChoice(VIEW_KEY, ['grid', 'list'] as const, 'grid'));
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [statsCompact, setStatsCompact] = useState(false);
  const [selected, setSelected] = useState<{ tmdbId: number; mediaType: MediaType } | null>(null);
  const [nextLabels, setNextLabels] = useState<Record<string, string>>({});
  const [labelEpoch, setLabelEpoch] = useState(0);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [fade, setFade] = useState({ left: false, right: false });
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pageItemsRef = useRef<TrackedMedia[]>([]);
  const pendingRef = useRef(new Set<string>());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchDraft.trim()), 200);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SORT_KEY, sort);
      window.localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Private mode can reject storage; the in-memory choice still applies.
    }
  }, [sort, view]);

  useEffect(() => {
    const onScroll = () => setStatsCompact(window.scrollY > 72);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const visible = useMemo(() => {
    const query = search.toLowerCase();
    const filtered = items.filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (query && !item.title.toLowerCase().includes(query)) return false;
      return true;
    });
    return sortItems(filtered, sort, filter === 'all');
  }, [items, filter, search, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = visible.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  pageItemsRef.current = pageItems;
  const watchSignature = pageItems
    .filter((item) => item.media_type === 'tv' && item.status === 'watching')
    .map((item) => `${item.tmdb_id}:${item.watched_episode_count}`)
    .join('|');

  useEffect(() => {
    setPage(0);
  }, [filter, search, sort]);

  useEffect(() => {
    const targets = pageItemsRef.current.filter(
      (item) => item.media_type === 'tv' && item.status === 'watching',
    );
    if (targets.length === 0) return;
    let cancelled = false;
    let cursor = 0;

    async function worker() {
      while (cursor < targets.length) {
        const item = targets[cursor++];
        if (pendingRef.current.has(String(item.tmdb_id))) continue;
        const labelKey = `${item.tmdb_id}:${item.watched_episode_count}`;
        const cached = peekNextEpisode(item.tmdb_id, item.watched_episode_count, includeSpecials);
        if (cached !== undefined) {
          const label = nextText(cached);
          if (!cancelled && label) {
            setNextLabels((current) => (current[labelKey] === label ? current : { ...current, [labelKey]: label }));
          }
          continue;
        }
        try {
          const next = await resolveNextEpisode(item.tmdb_id, item.watched_episode_count, includeSpecials);
          if (cancelled) return;
          const label = nextText(next);
          if (!label) continue;
          setNextLabels((current) => (current[labelKey] === label ? current : { ...current, [labelKey]: label }));
        } catch {
          // Keep the type, year, and episode count line when the lookup fails.
        }
      }
    }

    const workers = Array.from({ length: Math.min(2, targets.length) }, () => worker());
    void Promise.all(workers);
    return () => {
      cancelled = true;
    };
  }, [watchSignature, includeSpecials, labelEpoch]);

  function updateFade() {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setFade({ left: el.scrollLeft > 2, right: max - el.scrollLeft > 2 });
  }

  function scrollActivePill() {
    const scroller = scrollerRef.current;
    const pill = scroller?.querySelector<HTMLElement>(`[data-filter="${filter}"]`);
    if (!scroller || !pill) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    const delta = pillRect.left - scrollerRect.left - (scrollerRect.width - pillRect.width) / 2;
    scroller.scrollTo({ left: scroller.scrollLeft + delta, behavior: 'smooth' });
  }

  useLayoutEffect(() => {
    scrollActivePill();
  }, [filter]);

  useLayoutEffect(() => {
    updateFade();
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => updateFade());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function changePage(next: number) {
    setPage(next);
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchDraft('');
    setSearch('');
  }

  async function markNext(item: TrackedMedia) {
    if (!user || item.media_type !== 'tv' || item.status !== 'watching') return;
    const key = String(item.tmdb_id);
    if (pendingRef.current.has(key)) return;

    const known = peekNextEpisode(item.tmdb_id, item.watched_episode_count, includeSpecials);
    if (known === null) {
      toast.error('No episode left to mark');
      return;
    }
    if (known && !airedOnOrBeforeToday(known.airDate)) {
      toast.error('That episode hasn’t aired yet');
      return;
    }

    pendingRef.current.add(key);
    setPendingIds(new Set(pendingRef.current));
    lightHaptic();
    syncItem(bumped(item));

    try {
      const next =
        known ?? (await resolveNextEpisode(item.tmdb_id, item.watched_episode_count, includeSpecials));
      if (!next) {
        syncItem(item);
        toast.error('No episode left to mark');
        return;
      }
      if (!airedOnOrBeforeToday(next.airDate)) {
        syncItem(item);
        toast.error('That episode hasn’t aired yet');
        return;
      }
      const saved = await setEpisodesWatched({
        userId: user.id,
        show: {
          tmdbId: item.tmdb_id,
          title: item.title,
          posterPath: item.poster_path,
          backdropPath: item.backdrop_path,
          releaseDate: item.release_date,
          totalEpisodes: item.total_episodes,
        },
        seasonNumber: next.seasonNumber,
        episodes: [
          { episodeNumber: next.episodeNumber, name: next.name, airDate: next.airDate },
        ],
        watched: true,
        tracked: { status: item.status, totalEpisodes: item.total_episodes },
      });
      forgetNextEpisode(item.tmdb_id, saved.watched_episode_count, includeSpecials);
      setLabelEpoch((value) => value + 1);
      syncItem(saved);
    } catch (cause) {
      syncItem(item);
      toast.error('Could not update progress', { description: (cause as Error).message });
    } finally {
      pendingRef.current.delete(key);
      setPendingIds(new Set(pendingRef.current));
    }
  }

  const showSkeleton = loading && items.length === 0;
  const libraryEmpty = !loading && items.length === 0;
  const noMatches = !showSkeleton && !libraryEmpty && visible.length === 0;
  const filterLabel = FILTERS.find((entry) => entry.value === filter)?.label ?? 'this filter';

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary">Library</p>
            <h1 className="font-display mt-1 flex items-center gap-2 text-3xl font-medium tracking-tight">
              Your library
              {loading && (
                <span role="status" aria-label="Updating library" className="inline-flex">
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
                </span>
              )}
            </h1>
          </div>
          {!searchOpen && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 min-h-11 min-w-11 shrink-0 rounded-full p-0"
              aria-label="Search library"
              aria-expanded={false}
              onClick={() => {
                setSearchOpen(true);
                window.setTimeout(() => searchRef.current?.focus(), 0);
              }}
            >
              <Search />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {searchOpen && (
            <div className="flex min-w-[12rem] flex-1 items-center gap-2">
              <Input
                ref={searchRef}
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') closeSearch();
                }}
                placeholder="Search titles"
                aria-label="Search by title"
                className="h-11"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 min-h-11 min-w-11 shrink-0 rounded-full p-0"
                aria-label="Close search"
                onClick={closeSearch}
              >
                <X />
              </Button>
            </div>
          )}

          <select
            aria-label="Sort library"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-11 max-w-full rounded-full border border-border bg-card/60 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80"
          >
            {SORTS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>

          <div className="flex rounded-full bg-muted/80 p-1 ring-1 ring-border" role="group" aria-label="Library layout">
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
              className={cn(
                'flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors',
                view === 'grid' && 'bg-primary text-primary-foreground',
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Compact list view"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
              className={cn(
                'flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors',
                view === 'list' && 'bg-primary text-primary-foreground',
              )}
            >
              <List className="size-4" />
            </button>
          </div>
        </div>

        <div className="relative max-w-full">
          <div
            ref={scrollerRef}
            onScroll={updateFade}
            className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
              <TabsList className="h-auto w-max">
                {FILTERS.map((entry) => (
                  <TabsTrigger key={entry.value} value={entry.value} data-filter={entry.value} className="min-h-11 px-4">
                    {entry.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          {fade.left && (
            <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent" />
          )}
          {fade.right && (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
          )}
        </div>
      </div>

      <div
        className={cn(
          'sticky top-[3.75rem] z-30 -mx-4 px-4 py-2',
          statsCompact && 'bg-background/90 shadow-sm shadow-black/10 backdrop-blur-xl',
        )}
      >
        {showSkeleton ? (
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-14 flex-1 rounded-2xl" />
            ))}
          </div>
        ) : (
          <StatsRow items={items} dense={statsCompact} onFilter={setFilter} />
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {libraryEmpty ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
            <Library className="size-5" />
          </span>
          <p className="font-display text-xl font-medium">Nothing here yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Search movies and shows, then add them to your library.
          </p>
          <Button asChild className="mt-5 min-h-11 rounded-full">
            <Link to="/discover">Find something to watch</Link>
          </Button>
        </div>
      ) : noMatches ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
            <Search className="size-5" />
          </span>
          <p className="font-display text-xl font-medium">No matches</p>
          <p className="mt-1 max-w-xs text-sm text-foreground/75">
            {search
              ? `Nothing titled “${search}”${filter !== 'all' ? ` in ${filterLabel}` : ''}.`
              : `Nothing in ${filterLabel}.`}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-5 min-h-11 rounded-full"
            onClick={() => {
              if (search) closeSearch();
              if (filter !== 'all') setFilter('all');
            }}
          >
            {search ? 'Clear search' : 'Show all'}
          </Button>
        </div>
      ) : (
        <div ref={gridRef} className="scroll-mt-36 space-y-6">
          <div
            className={
              view === 'list'
                ? 'flex flex-col gap-3'
                : 'grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
            }
          >
            {showSkeleton
              ? Array.from({ length: 8 }).map((_, index) => <CardSkeleton key={index} layout={view} />)
              : pageItems.map((item) => {
                  const canMark =
                    item.media_type === 'tv' &&
                    item.status === 'watching' &&
                    (item.total_episodes == null || item.watched_episode_count < item.total_episodes);
                  return (
                    <MediaCard
                      key={item.id}
                      layout={view}
                      title={item.title}
                      mediaType={item.media_type}
                      posterPath={item.poster_path}
                      releaseDate={item.release_date}
                      status={item.status}
                      libraryFilter={filter}
                      nextLabel={nextLabels[`${item.tmdb_id}:${item.watched_episode_count}`] || null}
                      progress={
                        item.media_type === 'tv'
                          ? { watched: item.watched_episode_count, total: item.total_episodes }
                          : null
                      }
                      markPending={pendingIds.has(String(item.tmdb_id))}
                      onMarkWatched={canMark ? () => void markNext(item) : undefined}
                      onClick={() => setSelected({ tmdbId: item.tmdb_id, mediaType: item.media_type })}
                    />
                  );
                })}
          </div>

          {pageCount > 1 && !showSkeleton && (
            <div className="flex items-center justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 min-h-11 rounded-full px-4"
                disabled={currentPage === 0}
                onClick={() => changePage(currentPage - 1)}
              >
                <ChevronLeft />
                Prev
              </Button>
              <span className="min-w-16 text-center text-sm tabular-nums text-foreground/75">
                {currentPage + 1} of {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-11 min-h-11 rounded-full px-4"
                disabled={currentPage >= pageCount - 1}
                onClick={() => changePage(currentPage + 1)}
              >
                Next
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      )}

      <MediaDetailDialog target={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
