import { defineFunction, secret } from '@aws-amplify/backend';

export const amplifyTest = defineFunction({
  name: 'amplify-test',
  entry: './handler.ts',
  timeoutSeconds: 15,
  environment: {
    TMDB_ACCESS_TOKEN: secret('TMDB_ACCESS_TOKEN'),
    VITE_SUPABASE_URL_TATER: process.env.VITE_SUPABASE_URL_TATER ?? '',
    VITE_SUPABASE_SECRET_KEY_TATER: secret('VITE_SUPABASE_SECRET_KEY_TATER'),
  },
});
