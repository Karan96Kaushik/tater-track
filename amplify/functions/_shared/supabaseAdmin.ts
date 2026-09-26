import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './secrets.js';

let cached: SupabaseClient | null = null;

/**
 * Service-role client. Only use it after the caller's JWT has been verified —
 * it bypasses RLS, so every query must filter by the verified user id.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!cached) {
    cached = createClient(env.supabaseUrl, env.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
