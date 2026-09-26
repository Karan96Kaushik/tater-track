import { defineFunction, secret } from '@aws-amplify/backend';

export const reportIssue = defineFunction({
  name: 'report-issue',
  entry: './handler.ts',
  timeoutSeconds: 15,
  environment: {
    VITE_SUPABASE_URL_TATER: process.env.VITE_SUPABASE_URL_TATER ?? '',
    VITE_SUPABASE_SECRET_KEY_TATER: secret('VITE_SUPABASE_SECRET_KEY_TATER'),
  },
});
