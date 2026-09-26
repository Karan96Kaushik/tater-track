import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from 'aws-lambda';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function json(status: number, body: unknown): LambdaFunctionURLResult {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(body),
  };
}

export function parseBody<T>(event: LambdaFunctionURLEvent): T {
  if (!event.body) return {} as T;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

/**
 * Wraps a handler with CORS preflight, method guard, and error translation so
 * every function returns the same shape.
 */
export function withHttp(
  handler: (event: LambdaFunctionURLEvent) => Promise<LambdaFunctionURLResult>,
) {
  return async (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResult> => {
    const method = event.requestContext?.http?.method ?? 'POST';
    if (method === 'OPTIONS') {
      return { statusCode: 204, headers: corsHeaders, body: '' };
    }
    if (method !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }
    try {
      return await handler(event);
    } catch (error) {
      if (error instanceof HttpError) {
        return json(error.status, { error: error.message });
      }
      console.error('Unhandled function error', error);
      return json(500, { error: 'Internal server error' });
    }
  };
}
