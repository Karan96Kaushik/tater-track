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

function assertSupabaseSecret(): void {
  const key = process.env.VITE_SUPABASE_SECRET_KEY_TATER ?? '';
  // Amplify leaves this placeholder until `ampx sandbox secret set` writes SSM.
  if (!key.startsWith('eyJ') && !key.startsWith('sb_secret_')) {
    throw new HttpError(
      500,
      'Supabase secret is not set on the function. Run `npx ampx sandbox secret set VITE_SUPABASE_SECRET_KEY_TATER` with the service_role or sb_secret key.',
    );
  }
}

/** Function URL auth type is NONE, so the Supabase JWT is the only gate. */
export async function verifySupabaseAuth(
  event: LambdaFunctionURLEvent,
): Promise<AuthedUser> {
  assertSupabaseSecret();
  const token = bearerToken(event);
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    console.error('supabase auth.getUser failed', error?.message ?? 'no user');
    throw new HttpError(401, 'Invalid or expired session');
  }
  return { id: data.user.id, email: data.user.email ?? null };
}
