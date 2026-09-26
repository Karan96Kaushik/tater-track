/**
 * Supabase clients append `/auth/v1` and `/rest/v1` themselves. A dashboard
 * "REST" URL (`https://<ref>.supabase.co/rest/v1/`) makes those
 * `.../rest/v1/auth/v1/otp`, which PostgREST rejects with
 * "Invalid path specified in request URL".
 */
export function normalizeSupabaseUrl(value: string | undefined): string | undefined {
  if (!value) return value;
  const trimmed = value.trim();
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  }
}
