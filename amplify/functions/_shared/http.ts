import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from 'aws-lambda';
import { logTiming } from './timing.js';

/**
 * CORS belongs to the Function URL (see amplify/backend.ts). Returning the
 * headers from here too makes AWS emit them twice, which browsers reject with
 * "Access-Control-Allow-Origin header contains multiple values".
 */
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
    headers: { 'Content-Type': 'application/json' },
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

/** First invocation in this process paid for a cold start. Init itself is in the Lambda REPORT line. */
let firstRequest = true;

function requestAction(event: LambdaFunctionURLEvent): string | undefined {
  try {
    const action = parseBody<{ action?: unknown }>(event).action;
    return typeof action === 'string' ? action : undefined;
  } catch {
    return undefined;
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
    const started = Date.now();
    const cold = firstRequest;
    firstRequest = false;
    const action = requestAction(event);
    const fields = { cold, ...(action ? { action } : {}) };

    // Preflight is answered by the Function URL itself and never reaches here.
    const method = event.requestContext?.http?.method ?? 'POST';
    if (method !== 'POST') {
      logTiming('request', started, { ...fields, status: 405 });
      return json(405, { error: 'Method not allowed' });
    }
    try {
      const result = await handler(event);
      logTiming('request', started, { ...fields, status: result.statusCode ?? 200 });
      return result;
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      logTiming('request', started, { ...fields, status, ok: false });
      if (error instanceof HttpError) {
        return json(error.status, { error: error.message });
      }
      console.error('Unhandled function error', error);
      return json(500, { error: 'Internal server error' });
    }
  };
}
