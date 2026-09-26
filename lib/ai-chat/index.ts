import { callFunction } from '@/lib/amplify/client';

/** Placeholder client for the ai-chat Function URL (currently returns 501). */
export function askRecommendation(prompt: string) {
  return callFunction<{ error?: string; reply?: string }>('aiChatUrl', { prompt });
}
