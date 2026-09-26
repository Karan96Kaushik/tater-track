/**
 * Stub for the Cerebras chat completions client described in the technical
 * spec. Server/script usage only — the key must never reach the browser bundle.
 */
export interface CerebrasMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function createCerebrasClient(_options: { apiKey: string; model?: string }) {
  throw new Error('Cerebras client is not implemented for tater-track yet.');
}
