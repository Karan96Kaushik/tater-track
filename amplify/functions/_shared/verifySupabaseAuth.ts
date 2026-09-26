import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { HttpError } from './http.js';
import { env } from './secrets.js';
import { bindSupabaseUser, clearSupabaseUser } from './supabaseUser.js';

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

/** Function URL auth type is NONE, so the Supabase JWT is the only gate. */
export async function verifySupabaseAuth(
  event: LambdaFunctionURLEvent,
): Promise<AuthedUser> {
  clearSupabaseUser();
  const token = bearerToken(event);

  const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: env.supabasePublishableKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { msg?: string; message?: string } | null;
    console.error('supabase auth user lookup failed', response.status, body?.msg ?? body?.message);
    throw new HttpError(401, 'Invalid or expired session');
  }

  const user = (await response.json()) as { id?: string; email?: string | null };
  if (!user.id) throw new HttpError(401, 'Invalid or expired session');

  bindSupabaseUser(token);
  return { id: user.id, email: user.email ?? null };
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
