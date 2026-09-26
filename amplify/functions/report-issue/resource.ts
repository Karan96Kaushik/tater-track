import { defineFunction, secret } from '@aws-amplify/backend';

export const reportIssue = defineFunction({
  name: 'report-issue',
  entry: './handler.ts',
  timeoutSeconds: 15,
  environment: {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? '',
    VITE_SUPABASE_SECRET_KEY: secret('VITE_SUPABASE_SECRET_KEY'),
  },
});
