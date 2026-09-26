import { defineFunction, secret } from '@aws-amplify/backend';

export const tmdbSearch = defineFunction({
  name: 'tmdb-search',
  entry: './handler.ts',
  timeoutSeconds: 20,
  memoryMB: 512,
  environment: {
    TMDB_ACCESS_TOKEN: secret('TMDB_ACCESS_TOKEN'),
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? '',
    VITE_SUPABASE_SECRET_KEY: secret('VITE_SUPABASE_SECRET_KEY'),
  },
});
