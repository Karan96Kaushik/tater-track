import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { areFunctionsConfigured } from '@/lib/amplify/client';
import { mediaApi } from '@/lib/amplify/media-functions';
import type { UpcomingEpisode } from '@/lib/supabase/types';
import { useAuth } from '@/hooks/useAuth';

export function useUpcoming(windowDays?: number) {
  const { user } = useAuth();
  const [items, setItems] = useState<UpcomingEpisode[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !areFunctionsConfigured) return;
    setLoading(true);
    try {
      const { items: next } = await mediaApi.upcoming('list', windowDays);
      setItems(next);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user, windowDays]);

  /** Re-derives the snapshot from TMDB for every followed show. */
  const refreshFromTmdb = useCallback(async () => {
    if (!user || !areFunctionsConfigured) return;
    setRefreshing(true);
    try {
      const { items: next, showsChecked } = await mediaApi.upcoming('refresh', windowDays);
      setItems(next);
      setError(null);
      toast.success('Schedule refreshed', {
        description: `${showsChecked ?? 0} show${showsChecked === 1 ? '' : 's'} checked against TMDB.`,
      });
    } catch (cause) {
      toast.error('Refresh failed', { description: (cause as Error).message });
    } finally {
      setRefreshing(false);
    }
  }, [user, windowDays]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, refreshing, error, reload: load, refreshFromTmdb };
}
