import { defineFunction } from '@aws-amplify/backend';

export const reportIssue = defineFunction({
  name: 'report-issue',
  entry: './handler.ts',
  timeoutSeconds: 15,
  environment: {
    VITE_SUPABASE_URL_TATER: process.env.VITE_SUPABASE_URL_TATER ?? '',
    VITE_SUPABASE_PUBLISHABLE_KEY_TATER: process.env.VITE_SUPABASE_PUBLISHABLE_KEY_TATER ?? '',
  },
});
