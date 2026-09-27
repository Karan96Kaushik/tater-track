import { createPublicKey, verify, type JsonWebKey, type KeyObject } from 'node:crypto';
import { HttpError } from './http.js';

const JWKS_TTL_MS = 6 * 60 * 60 * 1000;

type SigningKey = { key: KeyObject };

let cached: { fetchedAt: number; byKid: Map<string, SigningKey> } | null = null;
let pending: Promise<Map<string, SigningKey>> | null = null;

function decodeUtf8(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64').toString('utf8');
}

function decodeBytes(segment: string): Buffer {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

/** Checks an ES256 Supabase access token against an already loaded signing key. */
export function verifyEs256Jwt(
  token: string,
  key: KeyObject,
  issuer: string,
  now = Date.now(),
): { id: string; email: string | null } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Invalid or expired session');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header: { alg?: string };
  let payload: {
    iss?: string;
    aud?: string | string[];
    sub?: string;
    exp?: number;
    nbf?: number;
    email?: unknown;
  };
  try {
    header = JSON.parse(decodeUtf8(encodedHeader)) as { alg?: string };
    payload = JSON.parse(decodeUtf8(encodedPayload)) as typeof payload;
  } catch {
    throw new HttpError(401, 'Invalid or expired session');
  }

  if (header.alg !== 'ES256') throw new HttpError(401, 'Invalid or expired session');

  let valid = false;
  try {
    valid = verify(
      'sha256',
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      { key, dsaEncoding: 'ieee-p1363' },
      decodeBytes(encodedSignature),
    );
  } catch {
    throw new HttpError(401, 'Invalid or expired session');
  }
  if (!valid) throw new HttpError(401, 'Invalid or expired session');

  const skewMs = 30_000;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 + skewMs < now) {
    throw new HttpError(401, 'Invalid or expired session');
  }
  if (typeof payload.nbf === 'number' && payload.nbf * 1000 - skewMs > now) {
    throw new HttpError(401, 'Invalid or expired session');
  }
  if (payload.iss !== issuer) throw new HttpError(401, 'Invalid or expired session');

  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.includes('authenticated')) throw new HttpError(401, 'Invalid or expired session');
  if (!payload.sub) throw new HttpError(401, 'Invalid or expired session');

  return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
}

async function fetchSigningKeys(jwksUrl: string): Promise<Map<string, SigningKey>> {
  const response = await fetch(jwksUrl, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`JWKS responded ${response.status}`);
  const body = (await response.json()) as { keys?: JsonWebKey[] };
  const byKid = new Map<string, SigningKey>();
  for (const jwk of body.keys ?? []) {
    const kid = jwk.kid;
    if (typeof kid !== 'string' || jwk.kty !== 'EC' || jwk.crv !== 'P-256') continue;
    if (jwk.alg && jwk.alg !== 'ES256') continue;
    byKid.set(kid, { key: createPublicKey({ key: jwk, format: 'jwk' }) });
  }
  if (byKid.size === 0) throw new Error('JWKS contained no ES256 keys');
  cached = { fetchedAt: Date.now(), byKid };
  return byKid;
}

async function loadSigningKeys(jwksUrl: string, force: boolean): Promise<Map<string, SigningKey>> {
  if (!force && cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.byKid;
  if (!pending) {
    pending = fetchSigningKeys(jwksUrl).finally(() => {
      pending = null;
    });
  }
  return pending;
}

/** Public signing key for this access token. Cached for six hours; refetched once if the key id is new. */
export async function signingKeyFor(supabaseUrl: string, token: string): Promise<KeyObject> {
  const kid = token.split('.')[0];
  let header: { kid?: string; alg?: string };
  try {
    header = JSON.parse(decodeUtf8(kid)) as { kid?: string; alg?: string };
  } catch {
    throw new HttpError(401, 'Invalid or expired session');
  }
  if (header.alg !== 'ES256' || !header.kid) throw new HttpError(401, 'Invalid or expired session');

  const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
  let keys = await loadSigningKeys(jwksUrl, false);
  if (!keys.has(header.kid)) keys = await loadSigningKeys(jwksUrl, true);
  const found = keys.get(header.kid);
  if (!found) throw new HttpError(401, 'Invalid or expired session');
  return found.key;
}
