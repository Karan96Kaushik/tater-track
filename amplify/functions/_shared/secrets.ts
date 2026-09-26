import { normalizeSupabaseUrl } from '../../../lib/supabase/url.js';
import { HttpError } from './http.js';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    throw new HttpError(500, 'Server is not configured');
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return normalizeSupabaseUrl(requireEnv('VITE_SUPABASE_URL_TATER')) ?? '';
  },
  get supabasePublishableKey() {
    return requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY_TATER');
  },
  get tmdbAccessToken() {
    return requireEnv('TMDB_ACCESS_TOKEN');
  },
};
