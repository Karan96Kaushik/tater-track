import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  // Surfaced loudly in dev; the app renders a config banner instead of crashing.
  console.warn('[tater-track] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set.');
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
