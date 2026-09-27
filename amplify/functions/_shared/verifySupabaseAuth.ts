import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { HttpError } from './http.js';
import { env } from './secrets.js';
import { signingKeyFor, verifyEs256Jwt } from './supabaseJwt.js';
import { bindSupabaseUser, clearSupabaseUser } from './supabaseUser.js';
import { logTiming } from './timing.js';

export interface AuthedUser {
  id: string;
  email: string | null;
}

function authorizationHeader(event: LambdaFunctionURLEvent): string {
  return event.headers?.authorization ?? event.headers?.Authorization ?? '';
}

function bearerToken(event: LambdaFunctionURLEvent): string {
  const header = authorizationHeader(event);
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new HttpError(401, 'Missing bearer token');
  }
  return token;
}

/** Best-effort client address for anonymous rate limits. */
export function clientAddress(event: LambdaFunctionURLEvent): string {
  const forwarded = event.headers?.['x-forwarded-for'] ?? event.headers?.['X-Forwarded-For'];
  const ip = forwarded?.split(',')[0]?.trim() || event.requestContext?.http?.sourceIp;
  return ip || 'unknown';
}

/**
 * Confirms the session with Supabase Auth. Used only when the signing keys
 * cannot be fetched; a bad token never takes this path.
 */
async function verifyWithAuthApi(token: string, started: number): Promise<AuthedUser> {
  let response: Response;
  try {
    response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: env.supabasePublishableKey,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    logTiming('auth', started, { ok: false, mode: 'auth-api', status: 0 });
    throw error;
  }

  if (!response.ok) {
    logTiming('auth', started, { ok: false, mode: 'auth-api', status: response.status });
    const body = (await response.json().catch(() => null)) as { msg?: string; message?: string } | null;
    console.error('supabase auth user lookup failed', response.status, body?.msg ?? body?.message);
    throw new HttpError(401, 'Invalid or expired session');
  }

  const user = (await response.json()) as { id?: string; email?: string | null };
  if (!user.id) {
    logTiming('auth', started, { ok: false, mode: 'auth-api', status: response.status });
    throw new HttpError(401, 'Invalid or expired session');
  }

  logTiming('auth', started, { ok: true, mode: 'auth-api', status: response.status });
  return { id: user.id, email: user.email ?? null };
}

/** Function URL auth type is NONE, so the Supabase JWT is the only gate. */
export async function verifySupabaseAuth(
  event: LambdaFunctionURLEvent,
): Promise<AuthedUser> {
  clearSupabaseUser();
  const token = bearerToken(event);
  const started = Date.now();
  const issuer = `${env.supabaseUrl}/auth/v1`;

  try {
    const key = await signingKeyFor(env.supabaseUrl, token);
    const user = verifyEs256Jwt(token, key, issuer);
    bindSupabaseUser(token);
    logTiming('auth', started, { ok: true, mode: 'jwt' });
    return user;
  } catch (error) {
    if (error instanceof HttpError) {
      logTiming('auth', started, { ok: false, mode: 'jwt', status: error.status });
      throw error;
    }
    console.warn('JWT signing keys unavailable, falling back to Supabase Auth', error);
    const user = await verifyWithAuthApi(token, started);
    bindSupabaseUser(token);
    return user;
  }
}

/**
 * Search and details can run without a session. A present but invalid token
 * still fails closed so a stale login is not treated as a guest.
 */
export async function verifySupabaseAuthOptional(
  event: LambdaFunctionURLEvent,
): Promise<AuthedUser | null> {
  if (!authorizationHeader(event).trim()) {
    clearSupabaseUser();
    return null;
  }
  return verifySupabaseAuth(event);
}
