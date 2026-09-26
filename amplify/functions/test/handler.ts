import { json, withHttp } from '../_shared/http.js';
import { supabaseUser } from '../_shared/supabaseUser.js';
import { tmdbFetch } from '../_shared/tmdb.js';
import { verifySupabaseAuth } from '../_shared/verifySupabaseAuth.js';

/** Smoke test: verifies auth, the user-scoped Supabase client, and TMDB credentials. */
export const handler = withHttp(async (event) => {
  const user = await verifySupabaseAuth(event);

  const checks: Record<string, string> = {};

  const { error: dbError } = await supabaseUser()
    .from('tracked_media')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  checks.supabase = dbError ? `error: ${dbError.message}` : 'ok';

  try {
    await tmdbFetch<{ success?: boolean }>('/authentication');
    checks.tmdb = 'ok';
  } catch (error) {
    checks.tmdb = `error: ${(error as Error).message}`;
  }

  return json(200, { user: { id: user.id, email: user.email }, checks });
});
