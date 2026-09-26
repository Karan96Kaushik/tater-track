import { supabase } from '@/utils/supabase';

/**
 * Optional API Gateway sync target, independent of the Amplify Function URLs.
 * Inactive unless VITE_API_URL is set.
 */
const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';

export const isSyncEnabled = Boolean(baseUrl);

export async function syncRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!baseUrl) throw new Error('VITE_API_URL is not configured');

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) throw new Error(`Sync request failed (${response.status})`);
  return (await response.json()) as T;
}
