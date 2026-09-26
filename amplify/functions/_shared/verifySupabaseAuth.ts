import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { HttpError } from './http.js';
import { supabaseAdmin } from './supabaseAdmin.js';

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
  const token = bearerToken(event);
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError(401, 'Invalid or expired session');
  }
  return { id: data.user.id, email: data.user.email ?? null };
}
