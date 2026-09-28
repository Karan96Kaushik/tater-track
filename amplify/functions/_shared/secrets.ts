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
  /** Service-role key for `tmdb_cache` only. Absent until the Amplify secret is set. */
  get supabaseSecretKey() {
    const value = process.env.SUPABASE_SECRET_KEY_TATER?.trim();
    return value || undefined;
  },
  get tmdbAccessToken() {
    return requireEnv('TMDB_ACCESS_TOKEN');
  },
  get groqApiKey() {
    return requireEnv('GROQ_API_KEY');
  },
  /** Override with `GROQ_MODEL`. Defaults to Groq's GPT-OSS 120B. */
  get groqModel() {
    return process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b';
  },
};
