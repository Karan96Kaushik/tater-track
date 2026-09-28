import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { mediaApi } from '@/lib/amplify/media-functions';
import { areFunctionsConfigured } from '@/lib/amplify/client';
import type { MediaType, TrackedMedia, TrackStatus } from '@/lib/supabase/types';
import { useAuth } from '@/hooks/useAuth';

interface LibraryContextValue {
  items: TrackedMedia[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Puts a row written directly to Supabase into the in-memory library. */
  applyItem: (item: TrackedMedia) => void;
  /** Replaces a row in place so progress updates do not jump to the top. */
  syncItem: (item: TrackedMedia) => void;
  entryFor: (tmdbId: number, mediaType: MediaType) => TrackedMedia | undefined;
  track: (params: { tmdbId: number; mediaType: MediaType; status: TrackStatus; title?: string }) => Promise<void>;
  untrack: (params: { tmdbId: number; mediaType: MediaType }) => Promise<void>;
  rate: (params: { tmdbId: number; mediaType: MediaType; rating: number | null }) => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

const STATUS_LABEL: Record<TrackStatus, string> = {
  watchlist: 'Added to watchlist',
  watching: 'Marked as watching',
  completed: 'Marked as watched',
  dropped: 'Marked as dropped',
};

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<TrackedMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !areFunctionsConfigured) return;
    setLoading(true);
    try {
      const { items: next } = await mediaApi.list('all');
      setItems(next);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    void refresh();
  }, [user, refresh]);

  const value = useMemo<LibraryContextValue>(
    () => ({
      items,
      loading,
      error,
      refresh,
      applyItem: (item) => {
        setItems((current) => {
          const rest = current.filter(
            (entry) => !(entry.tmdb_id === item.tmdb_id && entry.media_type === item.media_type),
          );
          return [item, ...rest];
        });
      },
      syncItem: (item) => {
        setItems((current) => {
          const index = current.findIndex(
            (entry) => entry.tmdb_id === item.tmdb_id && entry.media_type === item.media_type,
          );
          if (index === -1) return [item, ...current];
          const next = current.slice();
          next[index] = item;
          return next;
        });
      },
      entryFor: (tmdbId, mediaType) =>
        items.find((item) => item.tmdb_id === tmdbId && item.media_type === mediaType),

      async track({ tmdbId, mediaType, status, title }) {
        try {
          const { item } = await mediaApi.track({ tmdbId, mediaType, status });
          setItems((current) => {
            const rest = current.filter(
              (entry) => !(entry.tmdb_id === tmdbId && entry.media_type === mediaType),
            );
            return [item, ...rest];
          });
          toast.success(STATUS_LABEL[status], { description: title ?? item.title });
        } catch (cause) {
          toast.error('Could not update your library', { description: (cause as Error).message });
        }
      },

      async untrack({ tmdbId, mediaType }) {
        const previous = items;
        setItems((current) =>
          current.filter((entry) => !(entry.tmdb_id === tmdbId && entry.media_type === mediaType)),
        );
        try {
          await mediaApi.untrack({ tmdbId, mediaType });
          toast.success('Removed from your library');
        } catch (cause) {
          setItems(previous);
          toast.error('Could not remove that title', { description: (cause as Error).message });
        }
      },

      async rate({ tmdbId, mediaType, rating }) {
        try {
          const { item } = await mediaApi.rate({ tmdbId, mediaType, rating });
          setItems((current) =>
            current.map((entry) =>
              entry.tmdb_id === tmdbId && entry.media_type === mediaType ? item : entry,
            ),
          );
        } catch (cause) {
          toast.error('Could not save your rating', { description: (cause as Error).message });
        }
      },
    }),
    [items, loading, error, refresh],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('useLibrary must be used inside <LibraryProvider>');
  return context;
}
