import { defineFunction, secret } from '@aws-amplify/backend';

export const upcomingEpisodes = defineFunction({
  name: 'upcoming-episodes',
  entry: './handler.ts',
  // Fans out to TMDB once per tracked show, so it needs more headroom.
  timeoutSeconds: 60,
  memoryMB: 1024,
  environment: {
    TMDB_ACCESS_TOKEN: secret('TMDB_ACCESS_TOKEN'),
    SUPABASE_SECRET_KEY_TATER: secret('SUPABASE_SECRET_KEY_TATER'),
    VITE_SUPABASE_URL_TATER: process.env.VITE_SUPABASE_URL_TATER ?? '',
    VITE_SUPABASE_PUBLISHABLE_KEY_TATER: process.env.VITE_SUPABASE_PUBLISHABLE_KEY_TATER ?? '',
  },
});
