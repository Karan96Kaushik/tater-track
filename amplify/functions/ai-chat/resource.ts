import { defineFunction } from '@aws-amplify/backend';

/**
 * Placeholder for the Cerebras-backed recommendation chat described in the
 * technical spec. Wired into the stack so the Function URL and client plumbing
 * exist; the handler returns 501 until a model is chosen.
 */
export const aiChat = defineFunction({
  name: 'ai-chat',
  entry: './handler.ts',
  timeoutSeconds: 30,
  environment: {
    VITE_SUPABASE_URL_TATER: process.env.VITE_SUPABASE_URL_TATER ?? '',
  },
});
