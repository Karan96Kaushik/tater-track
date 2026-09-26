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

export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  publishableKey ?? 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'tater_track_supabase_auth',
    },
  },
);
