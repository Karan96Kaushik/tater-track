import { createClient } from '@supabase/supabase-js';
import { normalizeSupabaseUrl } from '@/lib/supabase/url';
import type { Database } from '@/lib/supabase/types';

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL_TATER);
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY_TATER;

if (!url || !publishableKey) {
  // Surfaced loudly in dev; the app renders a config banner instead of crashing.
  console.warn('[tater-track] VITE_SUPABASE_URL_TATER / VITE_SUPABASE_PUBLISHABLE_KEY_TATER are not set.');
}

export const isSupabaseConfigured = Boolean(url && publishableKey);

const projectRef = url ? new URL(url).hostname.split('.')[0] : 'local';

export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  publishableKey ?? 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Scoped to the project so a session from another Supabase project is not reused.
      storageKey: `tater_track_${projectRef}_auth`,
    },
  },
);
