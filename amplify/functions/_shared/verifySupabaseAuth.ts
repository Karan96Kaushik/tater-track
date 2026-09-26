import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { HttpError } from './http.js';
import { env } from './secrets.js';
import { bindSupabaseUser, clearSupabaseUser } from './supabaseUser.js';

export interface AuthedUser {
  id: string;
  email: string | null;
}

function bearerToken(event: LambdaFunctionURLEvent): string {
  const header =
    event.headers?.authorization ?? event.headers?.Authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new HttpError(401, 'Missing bearer token');
  }
  return token;
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
