import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/utils/supabase';
import type { UserSettings } from '@/lib/supabase/types';
import { useAuth } from '@/hooks/useAuth';

const DEFAULTS = {
  region: 'US',
  include_specials: false,
  upcoming_window_days: 30,
  theme: 'system',
} satisfies Partial<UserSettings>;

export function useSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSettings(null);
      setLoading(false);
      return;
    }

    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!active) return;
      if (error) console.warn('Failed to load settings', error.message);
      setSettings(data ?? ({ user_id: user.id, ...DEFAULTS } as UserSettings));
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [user]);

  const update = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (!user) return;
      const next = { ...(settings ?? ({ user_id: user.id, ...DEFAULTS } as UserSettings)), ...patch };
      setSettings(next);

      const { error } = await supabase
        .from('user_settings')
        .upsert({ ...next, user_id: user.id }, { onConflict: 'user_id' });

      if (error) toast.error('Could not save settings', { description: error.message });
    },
    [user, settings],
  );

  return { settings, loading, update };
}
