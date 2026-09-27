import { defineFunction, secret } from '@aws-amplify/backend';

export const tmdbDetails = defineFunction({
  name: 'tmdb-details',
  entry: './handler.ts',
  timeoutSeconds: 25,
  memoryMB: 512,
  environment: {
    TMDB_ACCESS_TOKEN: secret('TMDB_ACCESS_TOKEN'),
    SUPABASE_SECRET_KEY_TATER: secret('SUPABASE_SECRET_KEY_TATER'),
    VITE_SUPABASE_URL_TATER: process.env.VITE_SUPABASE_URL_TATER ?? '',
    VITE_SUPABASE_PUBLISHABLE_KEY_TATER: process.env.VITE_SUPABASE_PUBLISHABLE_KEY_TATER ?? '',
  },
});
