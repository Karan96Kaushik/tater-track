import { HttpError } from './http.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Per-container token bucket. Good enough to blunt accidental request storms;
 * it is not a distributed limit across concurrent Lambda environments.
 */
export function enforceRateLimit(key: string, limit = 60, windowMs = 60_000): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    throw new HttpError(429, 'Too many requests, slow down');
  }
}
