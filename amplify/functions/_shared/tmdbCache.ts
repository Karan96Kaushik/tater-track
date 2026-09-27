import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../lib/supabase/types.js';
import { env } from './secrets.js';
import { logTiming } from './timing.js';

let client: SupabaseClient<Database> | null | undefined;

/**
 * `sb_secret_` keys are not JWTs. The platform rejects them as Bearer tokens
 * and authorizes the service role from the `apikey` header alone.
 */
function fetchAsSecret(secretKey: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('apikey', secretKey);
    if (secretKey.startsWith('sb_')) headers.delete('Authorization');
    else headers.set('Authorization', `Bearer ${secretKey}`);
    return fetch(input, { ...init, headers });
  };
}

/** Secret-key client limited to `tmdb_cache`. Null when the secret is unset. */
function cacheClient(): SupabaseClient<Database> | null {
  if (client !== undefined) return client;
  const key = env.supabaseSecretKey;
  if (!key) {
    console.warn('SUPABASE_SECRET_KEY_TATER is not set; TMDB title responses will not be cached');
    client = null;
    return null;
  }
  client = createClient<Database>(env.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchAsSecret(key) },
  });
  return client;
}

export async function readTmdbCache<T>(cacheKey: string): Promise<T | null> {
  const started = Date.now();
  try {
    const db = cacheClient();
    if (!db) {
      logTiming('tmdb-cache', started, { op: 'read', key: cacheKey, result: 'skip' });
      return null;
    }
    const { data, error } = await db
      .from('tmdb_cache')
      .select('payload')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error) {
      console.warn('tmdb cache read failed', cacheKey, error.message);
      logTiming('tmdb-cache', started, { op: 'read', key: cacheKey, result: 'error' });
      return null;
    }
    const hit = Boolean(data?.payload && typeof data.payload === 'object');
    logTiming('tmdb-cache', started, { op: 'read', key: cacheKey, result: hit ? 'hit' : 'miss' });
    if (!hit || !data) return null;
    return data.payload as T;
  } catch (error) {
    console.warn('tmdb cache read failed', cacheKey, error);
    logTiming('tmdb-cache', started, { op: 'read', key: cacheKey, result: 'error' });
    return null;
  }
}

export async function writeTmdbCache(cacheKey: string, payload: unknown, ttlMs: number): Promise<void> {
  const started = Date.now();
  try {
    const db = cacheClient();
    if (!db) {
      logTiming('tmdb-cache', started, { op: 'write', key: cacheKey, result: 'skip' });
      return;
    }
    const now = new Date();
    const { error } = await db.from('tmdb_cache').upsert(
      {
        cache_key: cacheKey,
        payload,
        fetched_at: now.toISOString(),
        expires_at: new Date(now.getTime() + ttlMs).toISOString(),
      },
      { onConflict: 'cache_key' },
    );
    if (error) console.warn('tmdb cache write failed', cacheKey, error.message);
    logTiming('tmdb-cache', started, { op: 'write', key: cacheKey, result: error ? 'error' : 'ok' });
  } catch (error) {
    console.warn('tmdb cache write failed', cacheKey, error);
    logTiming('tmdb-cache', started, { op: 'write', key: cacheKey, result: 'error' });
  }
}
