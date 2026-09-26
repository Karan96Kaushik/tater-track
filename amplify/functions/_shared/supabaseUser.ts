import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';
import { env } from './secrets.js';

let bound: SupabaseClient | null = null;

/**
 * Publishable keys (`sb_publishable_…`) are not JWTs. supabase-js sends the
 * key as `Authorization: Bearer` by default, which the platform rejects.
 * Keep the key on `apikey` and send the caller's access token as the Bearer
 * credential so Postgres sees `auth.uid()` and RLS applies.
 */
function fetchAsUser(publishableKey: string, accessToken: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('apikey', publishableKey);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(input, { ...init, headers });
  };
}

/** Attach the verified caller's JWT for the rest of this invocation. */
export function bindSupabaseUser(accessToken: string): void {
  const publishableKey = env.supabasePublishableKey;
  bound = createClient(env.supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchAsUser(publishableKey, accessToken) },
  });
}

export function clearSupabaseUser(): void {
  bound = null;
}

/** Supabase client for the verified caller. RLS applies; this does not bypass it. */
export function supabaseUser(): SupabaseClient {
  if (!bound) {
    throw new HttpError(500, 'Supabase client is not available');
  }
  return bound;
}
