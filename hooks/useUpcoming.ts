import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { areFunctionsConfigured } from '@/lib/amplify/client';
import { mediaApi } from '@/lib/amplify/media-functions';
import type { UpcomingEpisode } from '@/lib/supabase/types';
import { useAuth } from '@/hooks/useAuth';

const sessionLists = new Map<string, UpcomingEpisode[]>();

function listKey(userId: string, windowDays: number): string {
  return `${userId}:${windowDays}`;
}

export function useUpcoming(windowDays?: number) {
  const { user } = useAuth();
  const [items, setItems] = useState<UpcomingEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenWindow = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    if (!user || !areFunctionsConfigured) {
      setLoading(false);
      return;
    }
    if (windowDays === undefined) return;
    setLoading(true);
    try {
      const { items: next } = await mediaApi.upcoming('list', windowDays);
      sessionLists.set(listKey(user.id, windowDays), next);
      setItems(next);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user, windowDays]);

  /** Re-derives the snapshot from TMDB for every followed show. */
  const refreshFromTmdb = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!user || !areFunctionsConfigured || windowDays === undefined) return;
      setRefreshing(true);
      try {
        const { items: next, showsChecked } = await mediaApi.upcoming('refresh', windowDays);
        sessionLists.set(listKey(user.id, windowDays), next);
        setItems(next);
        setError(null);
        if (!options?.silent) {
          toast.success('Schedule refreshed', {
            description: `${showsChecked ?? 0} show${showsChecked === 1 ? '' : 's'} checked against TMDB.`,
          });
        }
      } catch (cause) {
        const message = (cause as Error).message;
        setError(message);
        if (!options?.silent) toast.error('Refresh failed', { description: message });
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [user, windowDays],
  );

  useEffect(() => {
    if (!user || !areFunctionsConfigured) {
      setLoading(false);
      return;
    }
    if (windowDays === undefined) return;

    const previous = seenWindow.current;
    seenWindow.current = windowDays;
    if (previous !== undefined && previous !== windowDays) {
      void refreshFromTmdb({ silent: true });
      return;
    }

    const cached = sessionLists.get(listKey(user.id, windowDays));
    if (cached) {
      setItems(cached);
      setLoading(false);
      setError(null);
      return;
    }
    void load();
  }, [user, windowDays, load, refreshFromTmdb]);

  return { items, loading, refreshing, error, reload: load, refreshFromTmdb };
}
